-- SRMS — table visits. Safe to run more than once.
-- 1. An order from a guest's phone on a free table waits for a waiter's Accept
--    (status "awaiting"); the kitchen only gets it once it is accepted.
-- 2. Index to find the latest bill of a table quickly: a bill generated after a guest
--    checked in ends that guest's visit (menu and rewards only, logged out 2 hours later).

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('awaiting', 'pending', 'accepted', 'preparing', 'ready', 'served', 'completed', 'cancelled', 'placed'));

create index if not exists bills_restaurant_table_created_idx
  on public.bills (restaurant_id, table_number, created_at desc);

-- Same as before, plus p.needs_approval: a NEW order starts as "awaiting" instead of "pending".
-- Items added to an open order keep that order's status (an awaiting order stays awaiting).
create or replace function public.place_order(p jsonb)
returns jsonb language plpgsql volatile as $$
declare
  v_restaurant  uuid := (p->>'restaurant_id')::uuid;
  v_takeaway    boolean := coalesce((p->>'is_takeaway')::boolean, false);
  v_table_id    uuid := nullif(p->>'table_id', '')::uuid;
  v_table_no    integer := nullif(p->>'table_number', '')::integer;
  v_customer    uuid := nullif(p->>'customer_id', '')::uuid;
  v_notes       text := coalesce(p->>'notes', '');
  v_awaiting    boolean := coalesce((p->>'needs_approval')::boolean, false);
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
    nullif(p->>'waiter_id', '')::uuid, p->>'waiter_name',
    case when v_awaiting and not v_takeaway then 'awaiting' else 'pending' end,
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

revoke all on function public.place_order(jsonb) from public, anon, authenticated;
grant execute on function public.place_order(jsonb) to service_role;
