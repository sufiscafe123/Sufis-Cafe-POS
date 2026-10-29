-- SRMS — day-wise bill numbers.
-- Adds bills.daily_bill_number (1, 2, 3… restarting every day) and updates bill_order to
-- fill it in. Safe to run more than once.

alter table public.bills add column if not exists daily_bill_number integer;

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
  v_daily_number integer;
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
  -- Day-wise bill number printed on the receipt: starts again from 1 every day
  -- (the day is the restaurant's local date, sent by the server as bill_day = YYYY-MM-DD)
  v_daily_number := public.next_counter(
    'bill-day:' || v_order.restaurant_id || ':' || coalesce(nullif(p->>'bill_day', ''), to_char(now(), 'YYYY-MM-DD')),
    0
  )::integer;

  insert into public.bills (
    restaurant_id, bill_number, daily_bill_number, order_id, order_number, order_type, table_number, customer_name, customer_phone,
    customer_id, takeaway_token, subtotal, discount_amount,
    applied_reward_id, applied_reward_title, applied_reward_type, applied_reward_discount,
    gst_rate, gst_amount, total_amount, payment_mode, payment_status, customer_count, billed_by, billed_by_name, stamp_awarded
  ) values (
    v_order.restaurant_id, v_bill_number, v_daily_number, v_order.id, v_order.order_number,
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

revoke all on function public.bill_order(jsonb) from public, anon, authenticated;
grant execute on function public.bill_order(jsonb) to service_role;
