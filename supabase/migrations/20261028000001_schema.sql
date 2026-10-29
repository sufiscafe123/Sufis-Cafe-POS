-- SRMS — Smart Restaurant Management System
-- Schema: tables, constraints and indexes (replaces the Mongoose models).
--
-- Single-restaurant build: there is exactly one row in `restaurants`, but every record
-- still carries restaurant_id so data stays scoped exactly like the original app.
-- `legacy_id` columns hold the MongoDB ObjectId of migrated records (see scripts/migrate-from-mongo.mjs).

-- ─── Helpers ────────────────────────────────────────────────────────────────

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ─── Restaurant ─────────────────────────────────────────────────────────────

create table public.restaurants (
  id              uuid primary key default gen_random_uuid(),
  legacy_id       text unique,
  name            text not null,
  slug            text not null unique,
  email           text not null,
  phone           text not null default '',
  address         text not null default '',
  gst_number      text not null default '',
  gst_rate        numeric(5,2) not null default 5 check (gst_rate >= 0 and gst_rate <= 28),
  fssai_number    text not null default '',
  receipt_footer  text not null default 'Thank you for dining with us!',
  currency        text not null default 'INR',
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger restaurants_updated_at before update on public.restaurants
  for each row execute function public.set_updated_at();

-- ─── Staff (admin / waiter / kitchen) ───────────────────────────────────────
-- Login credentials live in Supabase Auth (auth.users); this is the staff profile.

create table public.staff (
  id             uuid primary key references auth.users (id) on delete cascade,
  legacy_id      text unique,
  restaurant_id  uuid not null references public.restaurants (id) on delete cascade,
  name           text not null,
  email          text not null,
  role           text not null check (role in ('admin', 'waiter', 'kitchen')),
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index staff_email_key on public.staff (lower(email));
create index staff_restaurant_idx on public.staff (restaurant_id);
create trigger staff_updated_at before update on public.staff
  for each row execute function public.set_updated_at();

-- ─── Tables ─────────────────────────────────────────────────────────────────

create table public.restaurant_tables (
  id                 uuid primary key default gen_random_uuid(),
  legacy_id          text unique,
  restaurant_id      uuid not null references public.restaurants (id) on delete cascade,
  table_number       integer not null check (table_number >= 1),
  capacity           integer not null default 4 check (capacity >= 1),
  status             text not null default 'available' check (status in ('available', 'occupied', 'reserved')),
  current_order_id   uuid,
  customer_count     integer not null default 0,
  -- Set when the customer taps "Call for Bill"; cleared when the bill is generated
  bill_requested     boolean not null default false,
  bill_requested_at  timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (restaurant_id, table_number)
);
create trigger restaurant_tables_updated_at before update on public.restaurant_tables
  for each row execute function public.set_updated_at();

-- ─── Menu ───────────────────────────────────────────────────────────────────

create table public.categories (
  id             uuid primary key default gen_random_uuid(),
  legacy_id      text unique,
  restaurant_id  uuid references public.restaurants (id) on delete cascade,
  name           text not null,
  icon           text not null default '🍽️',
  is_active      boolean not null default true,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (restaurant_id, name)
);
create trigger categories_updated_at before update on public.categories
  for each row execute function public.set_updated_at();

create table public.menu_items (
  id             uuid primary key default gen_random_uuid(),
  legacy_id      text unique,
  restaurant_id  uuid not null references public.restaurants (id) on delete cascade,
  name           text not null,
  -- Category is stored by name, as in the original app (renaming a category renames it here too)
  category       text not null,
  price          numeric(12,2) not null check (price >= 0),
  description    text not null default '',
  available      boolean not null default true,
  is_veg         boolean not null default true,
  image          text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index menu_items_restaurant_category_idx on public.menu_items (restaurant_id, category, name);
create index menu_items_restaurant_name_idx on public.menu_items (restaurant_id, lower(name));
create trigger menu_items_updated_at before update on public.menu_items
  for each row execute function public.set_updated_at();

-- ─── Customers & loyalty ────────────────────────────────────────────────────

create table public.customers (
  id                   uuid primary key default gen_random_uuid(),
  legacy_id            text unique,
  restaurant_id        uuid references public.restaurants (id) on delete cascade,
  customer_code        text not null unique,          -- "CUS_10001" (customerId in the original app)
  name                 text not null,
  phone                text not null,
  reward_token         text not null unique,          -- shown as a QR on the customer's phone
  total_stamps         integer not null default 0 check (total_stamps >= 0),
  max_stamps_per_card  integer not null default 8,
  active_table         integer,
  last_visit           timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index customers_phone_idx on public.customers (phone);
create index customers_restaurant_last_visit_idx on public.customers (restaurant_id, last_visit desc, created_at desc);
create trigger customers_updated_at before update on public.customers
  for each row execute function public.set_updated_at();

create table public.loyalty_settings (
  id                   uuid primary key default gen_random_uuid(),
  legacy_id            text unique,
  restaurant_id        uuid unique references public.restaurants (id) on delete cascade,
  stamps_per_card      integer not null default 8 check (stamps_per_card between 2 and 24),
  min_spend_for_stamp  numeric(12,2) not null default 200 check (min_spend_for_stamp >= 0),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create trigger loyalty_settings_updated_at before update on public.loyalty_settings
  for each row execute function public.set_updated_at();

create table public.loyalty_milestones (
  id               uuid primary key default gen_random_uuid(),
  settings_id      uuid not null references public.loyalty_settings (id) on delete cascade,
  position         integer not null default 0,
  milestone_id     text not null,
  required_stamps  integer not null check (required_stamps >= 1),
  title            text not null,
  description      text not null default '',
  reward_type      text not null default 'discount_percent' check (reward_type in ('free_item', 'discount_percent', 'discount_flat')),
  reward_value     numeric(12,2) not null default 0 check (reward_value >= 0),
  icon             text not null default '🎁',
  is_active        boolean not null default true
);
create index loyalty_milestones_settings_idx on public.loyalty_milestones (settings_id, position);

-- ─── Orders ─────────────────────────────────────────────────────────────────

create table public.orders (
  id                        uuid primary key default gen_random_uuid(),
  legacy_id                 text unique,
  restaurant_id             uuid not null references public.restaurants (id) on delete cascade,
  order_number              integer not null,
  order_type                text not null default 'dine_in' check (order_type in ('dine_in', 'dine-in', 'takeaway')),
  table_id                  uuid references public.restaurant_tables (id) on delete set null,
  table_number              integer,
  customer_name             text not null default '',
  customer_phone            text not null default '',
  customer_id               uuid references public.customers (id) on delete set null,
  customer_code             text not null default '',
  applied_reward_id         text,
  applied_reward_title      text,
  applied_reward_type       text,
  applied_reward_discount   numeric(12,2) not null default 0,
  takeaway_token            text not null default '',
  waiter_id                 uuid references public.staff (id) on delete set null,
  waiter_name               text,
  status                    text not null default 'pending'
                            check (status in ('pending', 'accepted', 'preparing', 'ready', 'served', 'completed', 'cancelled', 'placed')),
  total_amount              numeric(12,2) not null default 0,
  customer_count            integer not null default 1,
  notes                     text not null default '',
  -- Total number of item batches so far (1 = original order, 2+ = later additions)
  batch_count               integer not null default 1,
  last_updated_by_waiter    timestamptz,
  -- "Call for bill" from the customer's phone
  bill_requested            boolean not null default false,
  bill_requested_at         timestamptz,
  payment_preference        text not null default '' check (payment_preference in ('', 'cash', 'upi', 'card')),
  requested_reward_id       text not null default '',
  -- Bumped on every update; billing and item edits check it so they never act on stale data
  version                   integer not null default 1,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (restaurant_id, order_number)
);
create index orders_restaurant_created_idx on public.orders (restaurant_id, created_at desc);
create index orders_restaurant_status_idx on public.orders (restaurant_id, status);
create index orders_restaurant_table_idx on public.orders (restaurant_id, table_number, created_at desc);
create index orders_customer_idx on public.orders (customer_id);
create index orders_customer_code_idx on public.orders (customer_code) where customer_code <> '';

create or replace function public.bump_order_version() returns trigger
language plpgsql as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;
create trigger orders_version before update on public.orders
  for each row execute function public.bump_order_version();

alter table public.restaurant_tables
  add constraint restaurant_tables_current_order_fk
  foreign key (current_order_id) references public.orders (id) on delete set null;

create table public.order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders (id) on delete cascade,
  position       integer not null default 0,
  menu_item_id   uuid references public.menu_items (id) on delete set null,
  name           text not null,
  price          numeric(12,2) not null check (price >= 0),
  quantity       integer not null check (quantity >= 1),
  notes          text not null default '',
  served         boolean not null default false,
  added_at       timestamptz not null default now(),
  served_at      timestamptz,
  batch_number   integer not null default 1
);
create index order_items_order_idx on public.order_items (order_id, position);

-- customer.orders in the original app: every order a customer took part in
create table public.customer_orders (
  customer_id  uuid not null references public.customers (id) on delete cascade,
  order_id     uuid not null references public.orders (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (customer_id, order_id)
);
create index customer_orders_order_idx on public.customer_orders (order_id);

create table public.customer_rewards (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid not null references public.customers (id) on delete cascade,
  position         integer not null default 0,
  reward_id        text not null,
  title            text not null,
  description      text not null default '',
  required_stamps  integer not null,
  reward_type      text not null default 'discount_percent' check (reward_type in ('free_item', 'discount_percent', 'discount_flat')),
  reward_value     numeric(12,2) not null default 0,
  status           text not null default 'locked' check (status in ('locked', 'available', 'redeemed', 'expired')),
  unlocked_at      timestamptz,
  redeemed_at      timestamptz,
  order_id         uuid references public.orders (id) on delete set null,
  unique (customer_id, reward_id)
);
create index customer_rewards_customer_idx on public.customer_rewards (customer_id, position);
create index customer_rewards_available_idx on public.customer_rewards (customer_id) where status = 'available';

-- ─── Bills ──────────────────────────────────────────────────────────────────

create table public.bills (
  id                       uuid primary key default gen_random_uuid(),
  legacy_id                text unique,
  restaurant_id            uuid not null references public.restaurants (id) on delete cascade,
  bill_number              integer not null,
  -- One bill per order: a retried or concurrent "Generate Bill" can never create a second one
  order_id                 uuid not null unique references public.orders (id) on delete restrict,
  order_number             integer,
  order_type               text not null default 'dine_in' check (order_type in ('dine_in', 'takeaway')),
  table_number             integer,
  customer_name            text not null default '',
  customer_phone           text not null default '',
  customer_id              uuid references public.customers (id) on delete set null,
  takeaway_token           text not null default '',
  subtotal                 numeric(12,2) not null,
  discount_amount          numeric(12,2) not null default 0,
  applied_reward_id        text,
  applied_reward_title     text,
  applied_reward_type      text,
  applied_reward_discount  numeric(12,2) not null default 0,
  gst_rate                 numeric(5,2) not null default 5,
  gst_amount               numeric(12,2) not null default 0,
  total_amount             numeric(12,2) not null,
  payment_mode             text not null check (payment_mode in ('cash', 'upi', 'card')),
  payment_status           text not null default 'paid' check (payment_status in ('paid', 'pending')),
  customer_count           integer not null default 1,
  billed_by                uuid references public.staff (id) on delete set null,
  billed_by_name           text not null default '',
  stamp_awarded            boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (restaurant_id, bill_number)
);
create index bills_restaurant_created_idx on public.bills (restaurant_id, created_at desc);
create trigger bills_updated_at before update on public.bills
  for each row execute function public.set_updated_at();

create table public.bill_items (
  id        uuid primary key default gen_random_uuid(),
  bill_id   uuid not null references public.bills (id) on delete cascade,
  position  integer not null default 0,
  name      text not null,
  quantity  integer not null,
  price     numeric(12,2) not null,
  total     numeric(12,2) not null
);
create index bill_items_bill_idx on public.bill_items (bill_id, position);

-- ─── Infrastructure ─────────────────────────────────────────────────────────

-- Atomic counters for human-readable numbers (bill #, order #, customer ID)
create table public.counters (
  key  text primary key,
  seq  bigint not null
);

-- Shared rate-limit buckets (works across serverless instances)
create table public.rate_limits (
  key       text primary key,
  count     integer not null,
  reset_at  timestamptz not null
);
create index rate_limits_reset_idx on public.rate_limits (reset_at);

-- Realtime topics a customer browser (anon key) may listen to. Granted at table check-in.
create table public.realtime_topics (
  topic       text primary key,
  expires_at  timestamptz not null
);
