-- SRMS — business operations that must be atomic.
-- These run inside a single transaction each, with row locks, so concurrent requests
-- (two cashiers, a retried request, a waiter and a customer ordering at once) can't
-- produce duplicate bills, duplicate order numbers or inconsistent tables.
--
-- They are called only by the Next.js server with the service-role key (EXECUTE is
-- revoked from anon/authenticated at the end of this file). Validation, pricing and
-- bill maths happen in src/server before the call, exactly as in the original Express code.

-- ─── Counters ───────────────────────────────────────────────────────────────

-- Next number for `p_key`. On first use the counter starts after `p_seed`
-- (the highest number already stored), so migrated data keeps counting on.
create or replace function public.next_counter(p_key text, p_seed bigint)
returns bigint language sql volatile as $$
  insert into public.counters as c (key, seq) values (p_key, p_seed + 1)
  on conflict (key) do update set seq = c.seq + 1
  returning seq;
$$;

create or replace function public.next_order_number(p_restaurant_id uuid)
returns integer language sql volatile as $$
  select public.next_counter(
    'order:' || p_restaurant_id,
    (select coalesce(max(order_number), 1000) from public.orders where restaurant_id = p_restaurant_id)
  )::integer;
$$;

create or replace function public.next_bill_number(p_restaurant_id uuid)
returns integer language sql volatile as $$
  select public.next_counter(
    'bill:' || p_restaurant_id,
    (select coalesce(max(bill_number), 5000) from public.bills where restaurant_id = p_restaurant_id)
  )::integer;
$$;

create or replace function public.next_customer_code()
returns text language sql volatile as $$
  select 'CUS_' || public.next_counter(
    'customer',
    (select greatest(10000, coalesce(max(nullif(regexp_replace(customer_code, '\D', '', 'g'), '')::bigint), 10000))
       from public.customers)
  );
$$;

-- ─── Rate limiting ──────────────────────────────────────────────────────────

create or replace function public.hit_rate_limit(p_key text, p_window_seconds integer, p_max integer)
returns jsonb language plpgsql volatile as $$
declare
  v_row public.rate_limits%rowtype;
begin
  insert into public.rate_limits as r (key, count, reset_at)
  values (p_key, 1, now() + make_interval(secs => p_window_seconds))
  on conflict (key) do update
    set count = case when r.reset_at <= now() then 1 else r.count + 1 end,
        reset_at = case when r.reset_at <= now() then now() + make_interval(secs => p_window_seconds) else r.reset_at end
  returning * into v_row;

  -- Opportunistic cleanup of expired buckets
  if random() < 0.02 then
    delete from public.rate_limits where reset_at < now() - interval '1 hour';
  end if;

  return jsonb_build_object(
    'allowed', v_row.count <= p_max,
    'retry_after', greatest(0, ceil(extract(epoch from (v_row.reset_at - now()))))::integer
  );
end;
$$;

-- ─── Defaults ───────────────────────────────────────────────────────────────

create or replace function public.get_or_create_loyalty_settings(p_restaurant_id uuid)
returns uuid language plpgsql volatile as $$
declare
  v_id uuid;
begin
  select id into v_id from public.loyalty_settings where restaurant_id is not distinct from p_restaurant_id;
  if v_id is not null then return v_id; end if;

  insert into public.loyalty_settings (restaurant_id, stamps_per_card, min_spend_for_stamp)
  values (p_restaurant_id, 8, 200)
  on conflict (restaurant_id) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.loyalty_settings where restaurant_id is not distinct from p_restaurant_id;
    return v_id;
  end if;

  insert into public.loyalty_milestones (settings_id, position, milestone_id, required_stamps, title, description, reward_type, reward_value, icon, is_active)
  values
    (v_id, 0, 'milestone_coffee_4', 4, 'Free Coffee', 'Get a complimentary freshly brewed espresso or cappuccino', 'free_item', 0, '☕', true),
    (v_id, 1, 'milestone_discount_8', 8, '20% OFF', 'Enjoy 20% off your entire dining bill', 'discount_percent', 20, '🏷️', true);
  return v_id;
end;
$$;

create or replace function public.get_or_create_default_categories(p_restaurant_id uuid)
returns void language plpgsql volatile as $$
begin
  perform pg_advisory_xact_lock(hashtext('categories:' || coalesce(p_restaurant_id::text, '')));
  if exists (select 1 from public.categories where restaurant_id is not distinct from p_restaurant_id) then
    return;
  end if;
  insert into public.categories (restaurant_id, name, icon, sort_order) values
    (p_restaurant_id, 'Starters', '🥟', 1),
    (p_restaurant_id, 'Main Course', '🍲', 2),
    (p_restaurant_id, 'Pizza', '🍕', 3),
    (p_restaurant_id, 'Burgers', '🍔', 4),
    (p_restaurant_id, 'Beverages', '🥤', 5),
    (p_restaurant_id, 'Desserts', '🍰', 6);
end;
$$;

-- ─── Loyalty rewards (Customer.initDefaultRewards + evaluateRewards) ────────

-- Generates the reward tiers for every stamp-card cycle the customer has reached and
-- unlocks the ones their stamps now cover. Idempotent: safe to run at any time.
create or replace function public.sync_customer_rewards(p_customer_id uuid)
returns void language plpgsql volatile as $$
declare
  v_cust        public.customers%rowtype;
  v_settings_id uuid;
  v_spc         integer;
  v_use_default boolean;
  v_cycles      integer;
  v_c           integer;
  v_m           record;
  v_req         integer;
  v_rid         text;
  v_title       text;
  v_legacy      text;
  v_existing    public.customer_rewards%rowtype;
  v_pos         integer;
begin
  select * into v_cust from public.customers where id = p_customer_id;
  if not found then return; end if;

  select ls.id, ls.stamps_per_card into v_settings_id, v_spc
    from public.loyalty_settings ls where ls.restaurant_id is not distinct from v_cust.restaurant_id;

  if v_settings_id is not null then
    v_spc := coalesce(nullif(v_spc, 0), 8);
    if v_cust.max_stamps_per_card is distinct from v_spc then
      update public.customers set max_stamps_per_card = v_spc where id = p_customer_id;
    end if;
    -- Custom milestones are used when any exist (only the active ones); otherwise the defaults
    v_use_default := not exists (select 1 from public.loyalty_milestones where settings_id = v_settings_id);
  else
    v_spc := coalesce(nullif(v_cust.max_stamps_per_card, 0), 8);
    v_use_default := true;
  end if;

  v_cycles := greatest(1, (greatest(0, v_cust.total_stamps - 1) / v_spc) + 1);
  select coalesce(max(position), -1) + 1 into v_pos from public.customer_rewards where customer_id = p_customer_id;

  for v_c in 1..v_cycles loop
    for v_m in
      select * from (
        select m.position as pos, m.milestone_id, m.required_stamps, m.title, m.description, m.reward_type, m.reward_value
          from public.loyalty_milestones m
         where not v_use_default and m.settings_id = v_settings_id and m.is_active
        union all
        select d.* from (values
          (0, 'milestone_coffee_4', 4, 'Free Coffee', 'Get a complimentary freshly brewed espresso or cappuccino', 'free_item', 0::numeric),
          (1, 'milestone_discount_8', 8, '20% OFF', 'Enjoy 20% off your entire dining bill', 'discount_percent', 20::numeric)
        ) as d(pos, milestone_id, required_stamps, title, description, reward_type, reward_value)
         where v_use_default
      ) ms order by ms.pos
    loop
      v_req := v_m.required_stamps + (v_c - 1) * v_spc;
      v_rid := coalesce(nullif(v_m.milestone_id, ''), 'milestone') || '_c' || v_c || '_' || v_req;
      v_title := case when v_c = 1 then v_m.title else v_m.title || ' (Card #' || v_c || ')' end;
      v_legacy := case
        when v_m.reward_type = 'free_item' and v_req = 4 then 'rew_coffee_4'
        when v_m.reward_type = 'discount_percent' and v_req = 8 then 'rew_discount_8'
        else null end;

      select * into v_existing from public.customer_rewards
       where customer_id = p_customer_id and (reward_id = v_rid or (v_legacy is not null and reward_id = v_legacy))
       order by position limit 1;

      if not found then
        insert into public.customer_rewards (customer_id, position, reward_id, title, description, required_stamps, reward_type, reward_value, status)
        values (p_customer_id, v_pos, v_rid, v_title, coalesce(v_m.description, ''), v_req,
                coalesce(nullif(v_m.reward_type, ''), 'discount_percent'), coalesce(v_m.reward_value, 0),
                case when v_cust.total_stamps >= v_req then 'available' else 'locked' end)
        on conflict (customer_id, reward_id) do nothing;
        v_pos := v_pos + 1;
      elsif v_existing.status = 'locked' and v_cust.total_stamps >= v_req then
        update public.customer_rewards set status = 'available', unlocked_at = now() where id = v_existing.id;
      end if;
    end loop;
  end loop;

  -- evaluateRewards(): unlock anything the stamps now cover
  update public.customer_rewards
     set status = 'available', unlocked_at = now()
   where customer_id = p_customer_id and status = 'locked' and required_stamps <= v_cust.total_stamps;
end;
$$;

-- ─── Customer check-in from the table QR code ───────────────────────────────

create or replace function public.customer_check_in(
  p_restaurant_id uuid, p_name text, p_phone text, p_table_number integer, p_reward_token text
) returns uuid language plpgsql volatile as $$
declare
  v_id uuid;
begin
  -- Two phones checking in with the same number at the same moment must not create two profiles
  perform pg_advisory_xact_lock(hashtext('customer-phone:' || p_phone));

  select id into v_id from public.customers where phone = p_phone order by created_at limit 1 for update;
  if v_id is not null then
    update public.customers
       set name = p_name, active_table = p_table_number, last_visit = now(), reward_token = p_reward_token
     where id = v_id;
  else
    insert into public.customers (restaurant_id, customer_code, name, phone, reward_token, total_stamps, active_table, last_visit)
    values (p_restaurant_id, public.next_customer_code(), p_name, p_phone, p_reward_token, 0, p_table_number, now())
    returning id into v_id;
  end if;

  perform public.sync_customer_rewards(v_id);
  return v_id;
end;
$$;

-- ─── Stamps ─────────────────────────────────────────────────────────────────

-- Returns the stamp count before the change (to work out newly unlocked rewards).
create or replace function public.add_customer_stamps(p_customer_id uuid, p_count integer)
returns integer language plpgsql volatile as $$
declare
  v_old integer;
begin
  select total_stamps into v_old from public.customers where id = p_customer_id for update;
  if not found then raise exception 'CUSTOMER_NOT_FOUND'; end if;
  update public.customers set total_stamps = v_old + p_count where id = p_customer_id;
  perform public.sync_customer_rewards(p_customer_id);
  return v_old;
end;
$$;

-- ─── Loyalty program settings ───────────────────────────────────────────────

-- p_milestones = null leaves the milestones untouched.
create or replace function public.update_loyalty_settings(
  p_restaurant_id uuid, p_stamps_per_card integer, p_min_spend numeric, p_milestones jsonb
) returns uuid language plpgsql volatile as $$
declare
  v_id uuid;
  v_cust uuid;
begin
  v_id := public.get_or_create_loyalty_settings(p_restaurant_id);
  perform 1 from public.loyalty_settings where id = v_id for update;

  update public.loyalty_settings
     set stamps_per_card = coalesce(p_stamps_per_card, stamps_per_card),
         min_spend_for_stamp = coalesce(p_min_spend, min_spend_for_stamp)
   where id = v_id;

  if p_milestones is not null then
    delete from public.loyalty_milestones where settings_id = v_id;
    insert into public.loyalty_milestones (settings_id, position, milestone_id, required_stamps, title, description, reward_type, reward_value, icon, is_active)
    select v_id, (e.ord - 1)::integer, e.m->>'milestoneId', (e.m->>'requiredStamps')::integer, e.m->>'title',
           coalesce(e.m->>'description', ''), e.m->>'rewardType', (e.m->>'rewardValue')::numeric,
           coalesce(e.m->>'icon', '🎁'), coalesce((e.m->>'isActive')::boolean, true)
      from jsonb_array_elements(p_milestones) with ordinality as e(m, ord);
  end if;

  -- Sync every customer with the new stamp card and milestones
  for v_cust in select id from public.customers where restaurant_id is not distinct from p_restaurant_id or restaurant_id is null loop
    perform public.sync_customer_rewards(v_cust);
  end loop;
  return v_id;
end;
$$;

-- ─── Orders ─────────────────────────────────────────────────────────────────

create or replace function public.recalc_order_total(p_order_id uuid)
returns void language sql volatile as $$
  update public.orders
     set total_amount = coalesce((select sum(price * quantity) from public.order_items where order_id = p_order_id), 0)
   where id = p_order_id;
$$;

-- Links a customer to an order (customer.orders.push). Returns true when the link is new.
create or replace function public.link_customer_order(p_customer_id uuid, p_order_id uuid)
returns boolean language plpgsql volatile as $$
declare
  v_inserted integer;
begin
  insert into public.customer_orders (customer_id, order_id) values (p_customer_id, p_order_id)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted > 0;
end;
$$;

-- Creates an order, or — for a dine-in table that already has an open order — appends the
-- items to it as a new batch. Items arrive priced from the menu by the server.
--   p: restaurant_id, is_takeaway, table_id, table_number, customer_id, customer_code,
--      customer_name, customer_phone, customer_count, notes, takeaway_token,
--      waiter_id, waiter_name, items[{menu_item_id,name,price,quantity,notes}]
create or replace function public.place_order(p jsonb)
returns jsonb language plpgsql volatile as $$
declare
  v_restaurant  uuid := (p->>'restaurant_id')::uuid;
  v_takeaway    boolean := coalesce((p->>'is_takeaway')::boolean, false);
  v_table_id    uuid := nullif(p->>'table_id', '')::uuid;
  v_table_no    integer := nullif(p->>'table_number', '')::integer;
  v_customer    uuid := nullif(p->>'customer_id', '')::uuid;
  v_notes       text := coalesce(p->>'notes', '');
  v_order       public.orders%rowtype;
  v_number      integer;
  v_batch       integer;
  v_pos         integer;
  v_token       text;
begin
  if not v_takeaway then
    -- One open order per table: serialise everyone ordering for this table
    perform 1 from public.restaurant_tables where id = v_table_id for update;

    select * into v_order from public.orders
     where restaurant_id = v_restaurant and table_number = v_table_no and status not in ('completed', 'cancelled')
     order by created_at desc limit 1
     for update;

    if found then
      v_batch := coalesce(v_order.batch_count, 1) + 1;
      select coalesce(max(position), -1) + 1 into v_pos from public.order_items where order_id = v_order.id;

      insert into public.order_items (order_id, position, menu_item_id, name, price, quantity, notes, served, added_at, batch_number)
      select v_order.id, v_pos + (e.ord - 1)::integer, nullif(e.i->>'menu_item_id', '')::uuid, e.i->>'name',
             (e.i->>'price')::numeric, (e.i->>'quantity')::integer, coalesce(e.i->>'notes', ''), false, now(), v_batch
        from jsonb_array_elements(p->'items') with ordinality as e(i, ord);

      update public.orders set
        batch_count = v_batch,
        notes = case when v_notes = '' then notes when notes = '' then v_notes else notes || ' | ' || v_notes end,
        -- New food after the table was served: send the order back to the kitchen
        status = case when status in ('served', 'ready') then 'preparing' else status end,
        customer_id = case when v_customer is not null and customer_id is null then v_customer else customer_id end,
        customer_code = case when v_customer is not null and customer_id is null then coalesce(p->>'customer_code', '') else customer_code end
      where id = v_order.id;
      perform public.recalc_order_total(v_order.id);

      if v_customer is not null and public.link_customer_order(v_customer, v_order.id) then
        update public.customers set active_table = v_table_no where id = v_customer;
      end if;

      return jsonb_build_object('order_id', v_order.id, 'created', false);
    end if;
  end if;

  v_number := public.next_order_number(v_restaurant);
  v_token := case when v_takeaway then coalesce(nullif(p->>'takeaway_token', ''), 'TK-' || v_number) else '' end;

  insert into public.orders (
    restaurant_id, order_number, order_type, table_id, table_number, customer_name, customer_phone,
    customer_id, customer_code, takeaway_token, waiter_id, waiter_name, status, customer_count, notes, batch_count
  ) values (
    v_restaurant, v_number, case when v_takeaway then 'takeaway' else 'dine_in' end,
    case when v_takeaway then null else v_table_id end,
    case when v_takeaway then null else v_table_no end,
    coalesce(p->>'customer_name', ''), coalesce(p->>'customer_phone', ''),
    v_customer, coalesce(p->>'customer_code', ''), v_token,
    nullif(p->>'waiter_id', '')::uuid, p->>'waiter_name', 'pending',
    coalesce((p->>'customer_count')::integer, 1), v_notes, 1
  ) returning * into v_order;

  insert into public.order_items (order_id, position, menu_item_id, name, price, quantity, notes, served, added_at, batch_number)
  select v_order.id, (e.ord - 1)::integer, nullif(e.i->>'menu_item_id', '')::uuid, e.i->>'name',
         (e.i->>'price')::numeric, (e.i->>'quantity')::integer, coalesce(e.i->>'notes', ''), false, now(), 1
    from jsonb_array_elements(p->'items') with ordinality as e(i, ord);
  perform public.recalc_order_total(v_order.id);

  if v_customer is not null then
    perform public.link_customer_order(v_customer, v_order.id);
    update public.customers
       set active_table = coalesce(v_table_no, active_table), last_visit = now()
     where id = v_customer;
  end if;

  if not v_takeaway then
    update public.restaurant_tables
       set status = 'occupied', current_order_id = v_order.id,
           customer_count = coalesce((p->>'customer_count')::integer, 1),
           bill_requested = false, bill_requested_at = null
     where id = v_table_id;
  end if;

  return jsonb_build_object('order_id', v_order.id, 'created', true);
end;
$$;

-- Replaces the items of an open order with the merged list the server computed
-- (batch-aware merge in src/server/orders.ts). p_expected_version guards against edits
-- made in between (another waiter, a customer adding food).
--   p: order_id, restaurant_id, expected_version, items[{id?,menu_item_id,name,price,quantity,notes,
--      served,added_at,served_at,batch_number}] (null = unchanged), batch_count, status,
--      last_updated_by_waiter, notes (null = unchanged), customer_count (null = unchanged)
create or replace function public.edit_order(p jsonb)
returns jsonb language plpgsql volatile as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders
   where id = (p->>'order_id')::uuid and restaurant_id = (p->>'restaurant_id')::uuid
     and status not in ('completed', 'cancelled')
   for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.version <> (p->>'expected_version')::integer then raise exception 'ORDER_CHANGED'; end if;

  if jsonb_typeof(p->'items') = 'array' then
    delete from public.order_items where order_id = v_order.id;
    insert into public.order_items (id, order_id, position, menu_item_id, name, price, quantity, notes, served, added_at, served_at, batch_number)
    select coalesce(nullif(e.i->>'id', '')::uuid, gen_random_uuid()), v_order.id, (e.ord - 1)::integer,
           nullif(e.i->>'menu_item_id', '')::uuid, e.i->>'name', (e.i->>'price')::numeric, (e.i->>'quantity')::integer,
           coalesce(e.i->>'notes', ''), coalesce((e.i->>'served')::boolean, false),
           coalesce(nullif(e.i->>'added_at', '')::timestamptz, now()), nullif(e.i->>'served_at', '')::timestamptz,
           coalesce((e.i->>'batch_number')::integer, 1)
      from jsonb_array_elements(p->'items') with ordinality as e(i, ord);
  end if;

  update public.orders set
    batch_count = coalesce((p->>'batch_count')::integer, batch_count),
    status = coalesce(p->>'status', status),
    last_updated_by_waiter = coalesce(nullif(p->>'last_updated_by_waiter', '')::timestamptz, last_updated_by_waiter),
    notes = coalesce(p->>'notes', notes),
    customer_count = coalesce((p->>'customer_count')::integer, customer_count)
  where id = v_order.id;
  perform public.recalc_order_total(v_order.id);

  return jsonb_build_object('order_id', v_order.id);
end;
$$;

-- Manual status change (kitchen / waiter / admin). "completed" only happens through billing.
create or replace function public.update_order_status(p_order_id uuid, p_restaurant_id uuid, p_status text)
returns jsonb language plpgsql volatile as $$
declare
  v_order public.orders%rowtype;
  v_freed integer := 0;
begin
  if p_status not in ('pending', 'accepted', 'preparing', 'ready', 'served', 'cancelled') then
    raise exception 'INVALID_STATUS';
  end if;

  select * into v_order from public.orders
   where id = p_order_id and restaurant_id = p_restaurant_id and status not in ('completed', 'cancelled')
   for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if p_status = 'served' then
    update public.order_items set served = true, served_at = coalesce(served_at, now()) where order_id = v_order.id;
  end if;

  update public.orders
     set status = p_status,
         bill_requested = case when p_status = 'cancelled' then false else bill_requested end
   where id = v_order.id;

  if p_status = 'cancelled' and v_order.table_id is not null then
    update public.restaurant_tables
       set status = 'available', current_order_id = null, customer_count = 0, bill_requested = false, bill_requested_at = null
     where id = v_order.table_id and restaurant_id = p_restaurant_id and current_order_id = v_order.id;
    get diagnostics v_freed = row_count;
  end if;

  return jsonb_build_object('order_id', v_order.id, 'table_freed', v_freed > 0);
end;
$$;

-- "Call for Bill" from the customer's phone.
create or replace function public.request_bill(
  p_order_id uuid, p_payment_preference text, p_requested_reward_id text, p_customer_id uuid, p_customer_code text
) returns jsonb language plpgsql volatile as $$
declare
  v_order public.orders%rowtype;
begin
  update public.orders
     set bill_requested = true,
         bill_requested_at = coalesce(bill_requested_at, now()),
         payment_preference = coalesce(p_payment_preference, ''),
         requested_reward_id = coalesce(p_requested_reward_id, ''),
         customer_id = coalesce(customer_id, p_customer_id),
         customer_code = case when customer_id is null then coalesce(p_customer_code, '') else customer_code end
   where id = p_order_id and status not in ('completed', 'cancelled')
  returning * into v_order;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if v_order.table_id is not null then
    update public.restaurant_tables
       set bill_requested = true, bill_requested_at = v_order.bill_requested_at
     where id = v_order.table_id;
  end if;
  return jsonb_build_object('order_id', v_order.id);
end;
$$;

-- ─── Billing ────────────────────────────────────────────────────────────────

-- Bills an order (utils/billing.js billOrder): records payment, closes the order, frees the
-- table, redeems the reward and awards the loyalty stamp — all or nothing.
-- Totals are calculated by src/server/billing.ts from the same order version that is locked here.
--   p: order_id, restaurant_id, expected_version, payment_mode, reward_row_id (customer_rewards.id),
--      subtotal, discount_amount, gst_rate, gst_amount, total_amount, award_stamp,
--      billed_by, billed_by_name
create or replace function public.bill_order(p jsonb)
returns jsonb language plpgsql volatile as $$
declare
  v_order        public.orders%rowtype;
  v_customer     public.customers%rowtype;
  v_has_customer boolean := false;
  v_reward       public.customer_rewards%rowtype;
  v_has_reward   boolean := false;
  v_bill_id      uuid;
  v_bill_number  integer;
  v_old_stamps   integer := 0;
  v_stamp        integer := 0;
  v_unlocked     jsonb := '[]'::jsonb;
begin
  -- Claim the order so two staff members can't bill it at the same time
  select * into v_order from public.orders
   where id = (p->>'order_id')::uuid and restaurant_id = (p->>'restaurant_id')::uuid
   for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status in ('completed', 'cancelled') then raise exception 'ALREADY_BILLED'; end if;
  if v_order.version <> (p->>'expected_version')::integer then raise exception 'ORDER_CHANGED'; end if;
  if not exists (select 1 from public.order_items where order_id = v_order.id) then raise exception 'NO_ITEMS'; end if;
  if exists (select 1 from public.bills where order_id = v_order.id) then raise exception 'BILL_EXISTS'; end if;

  if v_order.customer_id is not null then
    select * into v_customer from public.customers where id = v_order.customer_id for update;
    v_has_customer := found;
  end if;

  if nullif(p->>'reward_row_id', '') is not null then
    if not v_has_customer then raise exception 'REWARD_NEEDS_CUSTOMER'; end if;
    select * into v_reward from public.customer_rewards
     where id = (p->>'reward_row_id')::uuid and customer_id = v_customer.id and status = 'available'
     for update;
    if not found then raise exception 'REWARD_UNAVAILABLE'; end if;
    v_has_reward := true;
  end if;

  v_bill_number := public.next_bill_number(v_order.restaurant_id);

  insert into public.bills (
    restaurant_id, bill_number, order_id, order_number, order_type, table_number, customer_name, customer_phone,
    customer_id, takeaway_token, subtotal, discount_amount,
    applied_reward_id, applied_reward_title, applied_reward_type, applied_reward_discount,
    gst_rate, gst_amount, total_amount, payment_mode, payment_status, customer_count, billed_by, billed_by_name, stamp_awarded
  ) values (
    v_order.restaurant_id, v_bill_number, v_order.id, v_order.order_number,
    case when v_order.order_type = 'takeaway' then 'takeaway' else 'dine_in' end,
    v_order.table_number,
    coalesce(nullif(v_order.customer_name, ''), case when v_has_customer then v_customer.name end, ''),
    coalesce(nullif(v_order.customer_phone, ''), case when v_has_customer then v_customer.phone end, ''),
    case when v_has_customer then v_customer.id end,
    coalesce(v_order.takeaway_token, ''),
    (p->>'subtotal')::numeric, (p->>'discount_amount')::numeric,
    case when v_has_reward then v_reward.reward_id end,
    case when v_has_reward then v_reward.title end,
    case when v_has_reward then v_reward.reward_type end,
    case when v_has_reward then (p->>'discount_amount')::numeric else 0 end,
    (p->>'gst_rate')::numeric, (p->>'gst_amount')::numeric, (p->>'total_amount')::numeric,
    p->>'payment_mode', 'paid', coalesce(v_order.customer_count, 1),
    nullif(p->>'billed_by', '')::uuid, coalesce(p->>'billed_by_name', ''), false
  ) returning id into v_bill_id;

  insert into public.bill_items (bill_id, position, name, quantity, price, total)
  select v_bill_id, row_number() over (order by position) - 1, name, quantity, price, price * quantity
    from public.order_items where order_id = v_order.id;

  -- Loyalty: redeem the reward and award a stamp when the bill meets the minimum spend
  if v_has_customer then
    v_old_stamps := coalesce(v_customer.total_stamps, 0);
    if v_has_reward then
      update public.customer_rewards set status = 'redeemed', redeemed_at = now(), order_id = v_order.id where id = v_reward.id;
    end if;
    if coalesce((p->>'award_stamp')::boolean, false) then
      v_stamp := 1;
    end if;
    update public.customers
       set total_stamps = v_old_stamps + v_stamp, active_table = null, last_visit = now()
     where id = v_customer.id;
    update public.bills set stamp_awarded = v_stamp > 0 where id = v_bill_id;
    perform public.link_customer_order(v_customer.id, v_order.id);
    perform public.sync_customer_rewards(v_customer.id);
    if v_stamp > 0 then
      select coalesce(jsonb_agg(title order by position), '[]'::jsonb) into v_unlocked
        from public.customer_rewards
       where customer_id = v_customer.id and status = 'available' and required_stamps > v_old_stamps;
    end if;
  end if;

  update public.orders set
    status = 'completed',
    bill_requested = false,
    applied_reward_id = case when v_has_reward then v_reward.reward_id else applied_reward_id end,
    applied_reward_title = case when v_has_reward then v_reward.title else applied_reward_title end,
    applied_reward_type = case when v_has_reward then v_reward.reward_type else applied_reward_type end,
    applied_reward_discount = case when v_has_reward then (p->>'discount_amount')::numeric else applied_reward_discount end
  where id = v_order.id;

  if v_order.table_id is not null then
    update public.restaurant_tables
       set status = 'available', current_order_id = null, customer_count = 0, bill_requested = false, bill_requested_at = null
     where id = v_order.table_id and restaurant_id = v_order.restaurant_id and current_order_id = v_order.id;
  end if;

  return jsonb_build_object(
    'bill_id', v_bill_id,
    'stamp_earned', v_stamp,
    'customer_id', case when v_has_customer then v_customer.id end,
    'customer_total_stamps', case when v_has_customer then v_old_stamps + v_stamp end,
    'newly_unlocked', v_unlocked
  );
end;
$$;

-- ─── Reports ────────────────────────────────────────────────────────────────

create or replace function public.report_daily(p_restaurant_id uuid, p_start timestamptz, p_end timestamptz)
returns jsonb language sql stable as $$
  with b as (
    select * from public.bills where restaurant_id = p_restaurant_id and created_at >= p_start and created_at < p_end
  ),
  items as (
    select bi.name, sum(bi.quantity)::numeric as quantity, sum(bi.total) as revenue,
           min(b.created_at) as first_at, min(bi.position) as first_pos
      from public.bill_items bi join b on b.id = bi.bill_id
     group by bi.name
  )
  select jsonb_build_object(
    'totalRevenue', coalesce((select sum(total_amount) from b), 0),
    'totalDiscount', coalesce((select sum(discount_amount) from b), 0),
    'totalGst', coalesce((select sum(gst_amount) from b), 0),
    'totalOrders', (select count(*) from public.orders where restaurant_id = p_restaurant_id and created_at >= p_start and created_at < p_end),
    'completedOrders', (select count(*) from b),
    'topItems', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'quantity', quantity, 'revenue', revenue) order by quantity desc, first_at, first_pos)
        from (select * from items order by quantity desc, first_at, first_pos limit 5) t
    ), '[]'::jsonb),
    'paymentBreakdown', jsonb_build_object(
      'cash', coalesce((select sum(total_amount) from b where payment_mode = 'cash'), 0),
      'upi', coalesce((select sum(total_amount) from b where payment_mode = 'upi'), 0),
      'card', coalesce((select sum(total_amount) from b where payment_mode = 'card'), 0)
    )
  );
$$;

-- Revenue and bill count per calendar month, using the restaurant's local time.
create or replace function public.report_monthly(p_restaurant_id uuid, p_year integer, p_tz text)
returns jsonb language sql stable as $$
  with months as (
    select m, (make_timestamp(p_year, m, 1, 0, 0, 0) at time zone p_tz) as start_at,
           ((make_timestamp(p_year, m, 1, 0, 0, 0) + interval '1 month') at time zone p_tz) as end_at
      from generate_series(1, 12) as m
  )
  select jsonb_agg(jsonb_build_object(
           'month', trim(to_char(make_date(p_year, months.m, 1), 'Month')),
           'revenue', coalesce((select sum(total_amount) from public.bills b
                                 where b.restaurant_id = p_restaurant_id and b.created_at >= months.start_at and b.created_at < months.end_at), 0),
           'orders', (select count(*) from public.bills b
                       where b.restaurant_id = p_restaurant_id and b.created_at >= months.start_at and b.created_at < months.end_at)
         ) order by months.m)
    from months;
$$;

create or replace function public.report_dashboard(p_restaurant_id uuid, p_start timestamptz, p_end timestamptz)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'todayRevenue', coalesce((select sum(total_amount) from public.bills where restaurant_id = p_restaurant_id and created_at >= p_start and created_at < p_end), 0),
    'todayOrders', (select count(*) from public.orders where restaurant_id = p_restaurant_id and created_at >= p_start and created_at < p_end),
    'todayBills', (select count(*) from public.bills where restaurant_id = p_restaurant_id and created_at >= p_start and created_at < p_end),
    'activeOrders', (select count(*) from public.orders where restaurant_id = p_restaurant_id and status not in ('completed', 'cancelled')),
    'pendingOrders', (select count(*) from public.orders where restaurant_id = p_restaurant_id and status = 'pending')
  );
$$;

-- Admin customer directory: ids in display order plus the summary statistics.
create or replace function public.customer_directory(p_restaurant_id uuid, p_search text, p_filter text, p_limit integer)
returns jsonb language sql stable as $$
  with scoped as (
    select * from public.customers c where c.restaurant_id is not distinct from p_restaurant_id or c.restaurant_id is null
  ),
  matched as (
    select c.id, c.last_visit, c.created_at from scoped c
     where (coalesce(p_search, '') = ''
            or c.name ilike '%' || p_search || '%' escape '\'
            or c.phone ilike '%' || p_search || '%' escape '\'
            or c.customer_code ilike '%' || p_search || '%' escape '\')
       and (p_filter is distinct from 'active' or c.active_table is not null)
       and (p_filter is distinct from 'rewards' or exists (select 1 from public.customer_rewards r where r.customer_id = c.id and r.status = 'available'))
     order by c.last_visit desc, c.created_at desc
     limit p_limit
  )
  select jsonb_build_object(
    'ids', coalesce((select jsonb_agg(id order by last_visit desc, created_at desc) from matched), '[]'::jsonb),
    'stats', jsonb_build_object(
      'totalCustomers', (select count(*) from scoped),
      'totalStampsAwarded', coalesce((select sum(total_stamps) from scoped), 0),
      'activeDineInCustomers', (select count(*) from scoped where active_table is not null),
      'customersWithAvailableRewards', (select count(*) from scoped c where exists (
        select 1 from public.customer_rewards r where r.customer_id = c.id and r.status = 'available'))
    )
  );
$$;

-- ─── Lock down: only the server (service role) may call these ───────────────

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'next_counter', 'next_order_number', 'next_bill_number', 'next_customer_code', 'hit_rate_limit',
         'get_or_create_loyalty_settings', 'get_or_create_default_categories', 'sync_customer_rewards',
         'customer_check_in', 'add_customer_stamps', 'update_loyalty_settings', 'recalc_order_total',
         'link_customer_order', 'place_order', 'edit_order', 'update_order_status', 'request_bill',
         'bill_order', 'report_daily', 'report_monthly', 'report_dashboard', 'customer_directory',
         'set_updated_at', 'bump_order_version'
       )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end;
$$;
