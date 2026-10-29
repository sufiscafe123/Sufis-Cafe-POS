-- SRMS — Row Level Security and Realtime authorization.
-- Safe to run more than once.
--
-- Access model
--   * All writes go through the Next.js server (Route Handlers), which checks the staff
--     role / customer session first and then uses the service-role key. There are NO
--     insert/update/delete policies, so the public anon key and staff JWTs cannot modify
--     anything directly.
--   * Signed-in, active staff may read their own restaurant's rows, limited by role the
--     same way the original API limited them (bills: admin only; customers: admin + waiter;
--     staff list: admin, or your own profile).
--   * Customers (QR ordering) never get direct table access; they only use the API.

-- ─── Who is the caller? ─────────────────────────────────────────────────────

create or replace function public.current_staff_restaurant_id()
returns uuid language sql stable security definer set search_path = public as $$
  select s.restaurant_id
    from public.staff s join public.restaurants r on r.id = s.restaurant_id
   where s.id = auth.uid() and s.active and r.active;
$$;

create or replace function public.current_staff_role()
returns text language sql stable security definer set search_path = public as $$
  select s.role
    from public.staff s join public.restaurants r on r.id = s.restaurant_id
   where s.id = auth.uid() and s.active and r.active;
$$;

revoke all on function public.current_staff_restaurant_id() from public, anon;
revoke all on function public.current_staff_role() from public, anon;
grant execute on function public.current_staff_restaurant_id() to authenticated, service_role;
grant execute on function public.current_staff_role() to authenticated, service_role;

-- ─── Enable RLS everywhere ──────────────────────────────────────────────────

alter table public.restaurants        enable row level security;
alter table public.staff              enable row level security;
alter table public.restaurant_tables  enable row level security;
alter table public.categories         enable row level security;
alter table public.menu_items         enable row level security;
alter table public.customers          enable row level security;
alter table public.customer_rewards   enable row level security;
alter table public.customer_orders    enable row level security;
alter table public.loyalty_settings   enable row level security;
alter table public.loyalty_milestones enable row level security;
alter table public.orders             enable row level security;
alter table public.order_items        enable row level security;
alter table public.bills              enable row level security;
alter table public.bill_items         enable row level security;
alter table public.counters           enable row level security;
alter table public.rate_limits        enable row level security;
alter table public.realtime_topics    enable row level security;

-- ─── Read policies for signed-in staff ──────────────────────────────────────

drop policy if exists "staff read own restaurant" on public.restaurants;
create policy "staff read own restaurant" on public.restaurants
  for select to authenticated using (id = public.current_staff_restaurant_id());

drop policy if exists "admin reads staff, others read self" on public.staff;
create policy "admin reads staff, others read self" on public.staff
  for select to authenticated using (
    restaurant_id = public.current_staff_restaurant_id()
    and (public.current_staff_role() = 'admin' or id = auth.uid())
  );

drop policy if exists "staff read tables" on public.restaurant_tables;
create policy "staff read tables" on public.restaurant_tables
  for select to authenticated using (restaurant_id = public.current_staff_restaurant_id());

drop policy if exists "staff read categories" on public.categories;
create policy "staff read categories" on public.categories
  for select to authenticated using (restaurant_id = public.current_staff_restaurant_id());

drop policy if exists "staff read menu" on public.menu_items;
create policy "staff read menu" on public.menu_items
  for select to authenticated using (restaurant_id = public.current_staff_restaurant_id());

drop policy if exists "staff read orders" on public.orders;
create policy "staff read orders" on public.orders
  for select to authenticated using (restaurant_id = public.current_staff_restaurant_id());

drop policy if exists "staff read order items" on public.order_items;
create policy "staff read order items" on public.order_items
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_id and o.restaurant_id = public.current_staff_restaurant_id())
  );

drop policy if exists "admin and waiter read customers" on public.customers;
create policy "admin and waiter read customers" on public.customers
  for select to authenticated using (
    restaurant_id = public.current_staff_restaurant_id() and public.current_staff_role() in ('admin', 'waiter')
  );

drop policy if exists "admin and waiter read customer rewards" on public.customer_rewards;
create policy "admin and waiter read customer rewards" on public.customer_rewards
  for select to authenticated using (
    public.current_staff_role() in ('admin', 'waiter')
    and exists (select 1 from public.customers c where c.id = customer_id and c.restaurant_id = public.current_staff_restaurant_id())
  );

drop policy if exists "admin and waiter read customer orders" on public.customer_orders;
create policy "admin and waiter read customer orders" on public.customer_orders
  for select to authenticated using (
    public.current_staff_role() in ('admin', 'waiter')
    and exists (select 1 from public.customers c where c.id = customer_id and c.restaurant_id = public.current_staff_restaurant_id())
  );

drop policy if exists "staff read loyalty settings" on public.loyalty_settings;
create policy "staff read loyalty settings" on public.loyalty_settings
  for select to authenticated using (restaurant_id = public.current_staff_restaurant_id());

drop policy if exists "staff read loyalty milestones" on public.loyalty_milestones;
create policy "staff read loyalty milestones" on public.loyalty_milestones
  for select to authenticated using (
    exists (select 1 from public.loyalty_settings s where s.id = settings_id and s.restaurant_id = public.current_staff_restaurant_id())
  );

drop policy if exists "admin reads bills" on public.bills;
create policy "admin reads bills" on public.bills
  for select to authenticated using (
    restaurant_id = public.current_staff_restaurant_id() and public.current_staff_role() = 'admin'
  );

drop policy if exists "admin reads bill items" on public.bill_items;
create policy "admin reads bill items" on public.bill_items
  for select to authenticated using (
    public.current_staff_role() = 'admin'
    and exists (select 1 from public.bills b where b.id = bill_id and b.restaurant_id = public.current_staff_restaurant_id())
  );

-- counters, rate_limits, realtime_topics: no policies → server only.

-- ─── Realtime (Broadcast) authorization ─────────────────────────────────────
-- The server publishes events (new-order, order-status-updated, bill-requested…) to
-- private Broadcast channels. Nobody but the server can publish (no INSERT policy).
--   staff-<restaurantId>   every signed-in, active staff member of that restaurant
--   public-<restaurantId>  menu / category / loyalty-program changes (public data)
--   cust-… / table-…       unguessable topics handed to a checked-in customer's browser

-- RLS is already enabled on realtime.messages in every Supabase project.

drop policy if exists "srms staff receive restaurant events" on realtime.messages;
create policy "srms staff receive restaurant events" on realtime.messages
  for select to authenticated using (
    realtime.messages.extension = 'broadcast'
    and realtime.topic() = 'staff-' || public.current_staff_restaurant_id()::text
  );

drop policy if exists "srms anyone receives public restaurant events" on realtime.messages;
create policy "srms anyone receives public restaurant events" on realtime.messages
  for select to anon, authenticated using (
    realtime.messages.extension = 'broadcast'
    and realtime.topic() like 'public-%'
  );

create or replace function public.realtime_topic_granted(p_topic text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.realtime_topics t where t.topic = p_topic and t.expires_at > now());
$$;
revoke all on function public.realtime_topic_granted(text) from public;
grant execute on function public.realtime_topic_granted(text) to anon, authenticated, service_role;

drop policy if exists "srms customers receive their table events" on realtime.messages;
create policy "srms customers receive their table events" on realtime.messages
  for select to anon, authenticated using (
    realtime.messages.extension = 'broadcast'
    and (realtime.topic() like 'cust-%' or realtime.topic() like 'table-%')
    and public.realtime_topic_granted(realtime.topic())
  );
