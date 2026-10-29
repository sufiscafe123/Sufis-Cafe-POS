import { beforeAll, describe, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createTestDb } from './db/pglite';

// Exercises the real SQL in supabase/migrations: atomic orders and billing, loyalty rewards,
// counters, reports and the RLS / Realtime policies.

let db: PGlite;
let R: string;        // restaurant
let R2: string;       // a second restaurant (isolation checks)
let ADMIN: string;
let WAITER: string;
let KITCHEN: string;
let OTHER_ADMIN: string;
let T1: string;       // table 1
let T2: string;
let PANEER: string;
let CHAI: string;

const one = async <T = any>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];
const fn = async <T = any>(sql: string, params: unknown[] = []) => Object.values((await one<any>(sql, params)) || {})[0] as T;

const placeOrder = (p: Record<string, unknown>) =>
  fn<any>('select public.place_order($1::jsonb)', [JSON.stringify({ restaurant_id: R, customer_count: 2, ...p })]);
const items = (...lines: [string, string, number, number][]) =>
  lines.map(([id, name, price, quantity]) => ({ menu_item_id: id, name, price, quantity, notes: '' }));
const orderRow = (id: string) => one<any>('select * from public.orders where id = $1', [id]);

async function asUser(uid: string | null, cb: () => Promise<void>) {
  await db.exec(uid ? `set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);` : `set role anon; select set_config('request.jwt.claim.sub', '', false);`);
  try { await cb(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}

beforeAll(async () => {
  db = await createTestDb();
  R = (await one<any>(`insert into public.restaurants (name, slug, email, gst_rate) values ('Sufi''s Cafe', 'sufis-cafe', 'o@x.com', 5) returning id`)).id;
  R2 = (await one<any>(`insert into public.restaurants (name, slug, email) values ('Other', 'other', 'p@x.com') returning id`)).id;
  const staff = async (role: string, rid: string) => {
    const id = (await one<any>(`insert into auth.users (email) values ($1) returning id`, [`${role}-${rid}@x.com`])).id;
    await db.query(`insert into public.staff (id, restaurant_id, name, email, role) values ($1, $2, $3, $4, $5)`, [id, rid, role, `${role}-${rid}@x.com`, role]);
    return id;
  };
  ADMIN = await staff('admin', R);
  WAITER = await staff('waiter', R);
  KITCHEN = await staff('kitchen', R);
  OTHER_ADMIN = await staff('admin', R2);
  T1 = (await one<any>(`insert into public.restaurant_tables (restaurant_id, table_number) values ($1, 1) returning id`, [R])).id;
  T2 = (await one<any>(`insert into public.restaurant_tables (restaurant_id, table_number) values ($1, 2) returning id`, [R])).id;
  PANEER = (await one<any>(`insert into public.menu_items (restaurant_id, name, category, price) values ($1, 'Paneer Tikka', 'Starters', 220) returning id`, [R])).id;
  CHAI = (await one<any>(`insert into public.menu_items (restaurant_id, name, category, price) values ($1, 'Masala Chai', 'Beverages', 40) returning id`, [R])).id;
  await one(`insert into public.bills (restaurant_id, bill_number, order_id, subtotal, total_amount, payment_mode)
             select $1, 1, o.id, 0, 0, 'cash' from public.orders o limit 0`, [R2]); // no-op: just checks the table exists
});

describe('orders', () => {
  let orderId: string;

  test('first order on a table gets #1001, occupies the table', async () => {
    const res = await placeOrder({ table_id: T1, table_number: 1, waiter_id: WAITER, waiter_name: 'waiter',
      customer_name: 'Table 1 Customer', items: items([PANEER, 'Paneer Tikka', 220, 2]) });
    expect(res.created).toBe(true);
    orderId = res.order_id;
    const o = await orderRow(orderId);
    expect(o.order_number).toBe(1001);
    expect(Number(o.total_amount)).toBe(440);
    expect(o.status).toBe('pending');
    const t = await one<any>('select * from public.restaurant_tables where id = $1', [T1]);
    expect(t.status).toBe('occupied');
    expect(t.current_order_id).toBe(orderId);
    expect(t.customer_count).toBe(2);
  });

  test('ordering again for the same table appends a new batch', async () => {
    await fn("select public.update_order_status($1, $2, 'served')", [orderId, R]);
    const res = await placeOrder({ table_id: T1, table_number: 1, notes: 'less sugar', items: items([CHAI, 'Masala Chai', 40, 3]) });
    expect(res).toEqual({ order_id: orderId, created: false });
    const o = await orderRow(orderId);
    expect(o.batch_count).toBe(2);
    expect(o.status).toBe('preparing'); // back to the kitchen
    expect(o.notes).toBe('less sugar');
    expect(Number(o.total_amount)).toBe(560);
    const lines = (await db.query<any>('select name, batch_number, served from public.order_items where order_id = $1 order by position', [orderId])).rows;
    expect(lines).toEqual([
      { name: 'Paneer Tikka', batch_number: 1, served: true },
      { name: 'Masala Chai', batch_number: 2, served: false },
    ]);
  });

  test('takeaway orders get the next number and a TK- token', async () => {
    const res = await placeOrder({ is_takeaway: true, customer_name: 'Takeaway Customer', items: items([CHAI, 'Masala Chai', 40, 1]) });
    const o = await orderRow(res.order_id);
    expect(o.order_number).toBe(1002);
    expect(o.takeaway_token).toBe('TK-1002');
    expect(o.table_id).toBeNull();
  });

  test('edit_order refuses a stale version', async () => {
    const o = await orderRow(orderId);
    await expect(fn('select public.edit_order($1::jsonb)', [JSON.stringify({ order_id: orderId, restaurant_id: R, expected_version: o.version - 1, notes: 'x' })]))
      .rejects.toThrow('ORDER_CHANGED');
    await fn('select public.edit_order($1::jsonb)', [JSON.stringify({ order_id: orderId, restaurant_id: R, expected_version: o.version, customer_count: 4 })]);
    expect((await orderRow(orderId)).customer_count).toBe(4);
  });

  test('cancelling frees the table; completed cannot be set by hand', async () => {
    const res = await placeOrder({ table_id: T2, table_number: 2, items: items([CHAI, 'Masala Chai', 40, 1]) });
    await expect(fn("select public.update_order_status($1, $2, 'completed')", [res.order_id, R])).rejects.toThrow('INVALID_STATUS');
    const out = await fn<any>("select public.update_order_status($1, $2, 'cancelled')", [res.order_id, R]);
    expect(out.table_freed).toBe(true);
    const t = await one<any>('select status, current_order_id from public.restaurant_tables where id = $1', [T2]);
    expect(t).toEqual({ status: 'available', current_order_id: null });
    await expect(fn("select public.update_order_status($1, $2, 'ready')", [res.order_id, R])).rejects.toThrow('ORDER_NOT_FOUND');
  });
});

describe('loyalty and billing', () => {
  let customerId: string;

  test('check-in creates CUS_10001 with the default reward tiers', async () => {
    customerId = await fn<string>("select public.customer_check_in($1, 'Asha', '9876543210', 2, 'RWD_test1')", [R]);
    const c = await one<any>('select * from public.customers where id = $1', [customerId]);
    expect(c.customer_code).toBe('CUS_10001');
    expect(c.active_table).toBe(2);
    const rewards = (await db.query<any>('select reward_id, title, required_stamps, status from public.customer_rewards where customer_id = $1 order by position', [customerId])).rows;
    expect(rewards).toEqual([
      { reward_id: 'milestone_coffee_4_c1_4', title: 'Free Coffee', required_stamps: 4, status: 'locked' },
      { reward_id: 'milestone_discount_8_c1_8', title: '20% OFF', required_stamps: 8, status: 'locked' },
    ]);
    // Same phone again: same profile, fresh reward token
    const again = await fn<string>("select public.customer_check_in($1, 'Asha K', '9876543210', 2, 'RWD_test2')", [R]);
    expect(again).toBe(customerId);
    expect((await one<any>('select name, reward_token from public.customers where id = $1', [customerId]))).toEqual({ name: 'Asha K', reward_token: 'RWD_test2' });
  });

  test('stamps unlock rewards and open the next card cycle', async () => {
    await fn("select public.get_or_create_loyalty_settings($1)", [R]);
    const old = await fn<number>('select public.add_customer_stamps($1, 8)', [customerId]);
    expect(old).toBe(0);
    let rewards = (await db.query<any>('select reward_id, status from public.customer_rewards where customer_id = $1 order by position', [customerId])).rows;
    expect(rewards.map(r => r.status)).toEqual(['available', 'available']);
    await fn('select public.add_customer_stamps($1, 1)', [customerId]); // 9 stamps → card #2
    rewards = (await db.query<any>('select reward_id, title, status from public.customer_rewards where customer_id = $1 order by position', [customerId])).rows;
    expect(rewards.slice(2)).toEqual([
      { reward_id: 'milestone_coffee_4_c2_12', title: 'Free Coffee (Card #2)', status: 'locked' },
      { reward_id: 'milestone_discount_8_c2_16', title: '20% OFF (Card #2)', status: 'locked' },
    ]);
  });

  test('bill_order bills once: numbers from #5001, redeems reward, awards stamp, frees table', async () => {
    const res = await placeOrder({ table_id: T2, table_number: 2, customer_id: customerId, customer_code: 'CUS_10001',
      customer_name: 'Asha K', items: items([PANEER, 'Paneer Tikka', 220, 5]) });
    const o = await orderRow(res.order_id);
    const reward = await one<any>(`select id from public.customer_rewards where customer_id = $1 and reward_id = 'milestone_discount_8_c1_8'`, [customerId]);
    // 1100 subtotal, 20% off = 220, taxable 880, GST 5% = 44, total 924
    const p = { order_id: o.id, restaurant_id: R, expected_version: o.version, payment_mode: 'upi', reward_row_id: reward.id,
      subtotal: 1100, discount_amount: 220, gst_rate: 5, gst_amount: 44, total_amount: 924, award_stamp: true,
      billed_by: ADMIN, billed_by_name: 'admin' };

    await expect(fn('select public.bill_order($1::jsonb)', [JSON.stringify({ ...p, expected_version: o.version - 1 })])).rejects.toThrow('ORDER_CHANGED');

    const out = await fn<any>('select public.bill_order($1::jsonb)', [JSON.stringify(p)]);
    expect(out.stamp_earned).toBe(1);
    expect(out.customer_total_stamps).toBe(10);

    const bill = await one<any>('select * from public.bills where id = $1', [out.bill_id]);
    expect(bill.bill_number).toBe(5001);
    expect(Number(bill.total_amount)).toBe(924);
    expect(bill.applied_reward_title).toBe('20% OFF');
    expect(bill.stamp_awarded).toBe(true);
    const lines = (await db.query<any>('select name, quantity, total from public.bill_items where bill_id = $1', [out.bill_id])).rows;
    expect(lines.map(l => [l.name, l.quantity, Number(l.total)])).toEqual([['Paneer Tikka', 5, 1100]]);

    expect((await orderRow(o.id)).status).toBe('completed');
    expect((await one<any>('select status from public.customer_rewards where id = $1', [reward.id])).status).toBe('redeemed');
    expect((await one<any>('select status, current_order_id from public.restaurant_tables where id = $1', [T2]))).toEqual({ status: 'available', current_order_id: null });
    expect((await one<any>('select active_table from public.customers where id = $1', [customerId])).active_table).toBeNull();

    // A retry / second cashier can't bill it again
    const fresh = await orderRow(o.id);
    await expect(fn('select public.bill_order($1::jsonb)', [JSON.stringify({ ...p, expected_version: fresh.version })])).rejects.toThrow('ALREADY_BILLED');
    expect(Number((await one<any>('select count(*) as n from public.bills where order_id = $1', [o.id])).n)).toBe(1);
  });

  test('a redeemed reward cannot be used twice', async () => {
    const res = await placeOrder({ table_id: T2, table_number: 2, customer_id: customerId, items: items([CHAI, 'Masala Chai', 40, 1]) });
    const o = await orderRow(res.order_id);
    const reward = await one<any>(`select id from public.customer_rewards where customer_id = $1 and reward_id = 'milestone_discount_8_c1_8'`, [customerId]);
    await expect(fn('select public.bill_order($1::jsonb)', [JSON.stringify({ order_id: o.id, restaurant_id: R, expected_version: o.version,
      payment_mode: 'cash', reward_row_id: reward.id, subtotal: 40, discount_amount: 8, gst_rate: 5, gst_amount: 2, total_amount: 34 })]))
      .rejects.toThrow('REWARD_UNAVAILABLE');
    // Order is untouched and can still be billed
    expect((await orderRow(o.id)).status).toBe('pending');
    const out = await fn<any>('select public.bill_order($1::jsonb)', [JSON.stringify({ order_id: o.id, restaurant_id: R, expected_version: o.version,
      payment_mode: 'cash', subtotal: 40, discount_amount: 0, gst_rate: 5, gst_amount: 2, total_amount: 42, award_stamp: false })]);
    expect(out.stamp_earned).toBe(0);
    expect((await one<any>('select bill_number from public.bills where id = $1', [out.bill_id])).bill_number).toBe(5002);
  });

  test('loyalty settings update re-syncs customers', async () => {
    await fn('select public.update_loyalty_settings($1, 10, 300, $2::jsonb)', [R, JSON.stringify([
      { milestoneId: 'm_tea_3', requiredStamps: 3, title: 'Free Tea', description: '', rewardType: 'free_item', rewardValue: 0, icon: '☕', isActive: true },
    ])]);
    const s = await one<any>('select stamps_per_card, min_spend_for_stamp from public.loyalty_settings where restaurant_id = $1', [R]);
    expect([s.stamps_per_card, Number(s.min_spend_for_stamp)]).toEqual([10, 300]);
    const c = await one<any>('select max_stamps_per_card from public.customers where id = $1', [customerId]);
    expect(c.max_stamps_per_card).toBe(10);
    const tea = await one<any>(`select status from public.customer_rewards where customer_id = $1 and reward_id = 'm_tea_3_c1_3'`, [customerId]);
    expect(tea.status).toBe('available');
  });
});

describe('reports', () => {
  test('daily report sums bills, top items and payment modes', async () => {
    const r = await fn<any>("select public.report_daily($1, now() - interval '1 day', now() + interval '1 day')", [R]);
    expect(Number(r.totalRevenue)).toBe(966);
    expect(Number(r.totalDiscount)).toBe(220);
    expect(Number(r.completedOrders)).toBe(2);
    expect(r.topItems[0]).toMatchObject({ name: 'Paneer Tikka', quantity: 5 });
    expect(r.paymentBreakdown).toMatchObject({ upi: 924, cash: 42, card: 0 });
  });
  test('monthly report has 12 months with English names', async () => {
    const year = new Date().getFullYear();
    const m = await fn<any[]>("select public.report_monthly($1, $2, 'Asia/Kolkata')", [R, year]);
    expect(m).toHaveLength(12);
    expect(m[0].month).toBe('January');
    expect(m.reduce((s, x) => s + Number(x.revenue), 0)).toBe(966);
  });
  test('customer directory search and stats', async () => {
    const d = await fn<any>("select public.customer_directory($1, 'ash', null, 500)", [R]);
    expect(d.ids).toHaveLength(1);
    expect(Number(d.stats.totalCustomers)).toBe(1);
  });
});

describe('rate limiting', () => {
  test('blocks after the limit', async () => {
    for (let i = 0; i < 3; i++) expect((await fn<any>("select public.hit_rate_limit('k', 60, 3)")).allowed).toBe(true);
    expect((await fn<any>("select public.hit_rate_limit('k', 60, 3)")).allowed).toBe(false);
  });
});

describe('row level security', () => {
  test('anonymous visitors can read nothing', async () => {
    await asUser(null, async () => {
      for (const t of ['restaurants', 'staff', 'orders', 'bills', 'customers', 'menu_items', 'restaurant_tables']) {
        expect(Number((await one<any>(`select count(*) as n from public.${t}`)).n)).toBe(0);
      }
    });
  });

  test('staff read their own restaurant only; bills are admin-only; customers not for kitchen', async () => {
    await asUser(ADMIN, async () => {
      expect(Number((await one<any>('select count(*) as n from public.bills')).n)).toBe(2);
      expect(Number((await one<any>('select count(*) as n from public.staff')).n)).toBe(3);
      expect(Number((await one<any>('select count(*) as n from public.restaurants')).n)).toBe(1);
    });
    await asUser(WAITER, async () => {
      expect(Number((await one<any>('select count(*) as n from public.bills')).n)).toBe(0);
      expect(Number((await one<any>('select count(*) as n from public.customers')).n)).toBe(1);
      expect(Number((await one<any>('select count(*) as n from public.staff')).n)).toBe(1); // only self
      expect(Number((await one<any>('select count(*) as n from public.orders')).n)).toBeGreaterThan(0);
    });
    await asUser(KITCHEN, async () => {
      expect(Number((await one<any>('select count(*) as n from public.customers')).n)).toBe(0);
      expect(Number((await one<any>('select count(*) as n from public.order_items')).n)).toBeGreaterThan(0);
    });
    await asUser(OTHER_ADMIN, async () => {
      expect(Number((await one<any>('select count(*) as n from public.orders')).n)).toBe(0);
      expect(Number((await one<any>('select count(*) as n from public.menu_items')).n)).toBe(0);
    });
  });

  test('nobody can write directly with the public keys', async () => {
    await asUser(ADMIN, async () => {
      await expect(db.query(`insert into public.menu_items (restaurant_id, name, category, price) values ('${R}', 'Hack', 'x', 1)`)).rejects.toThrow();
      const upd = await db.query(`update public.orders set total_amount = 0`);
      expect(upd.affectedRows).toBe(0);
    });
  });

  test('business functions cannot be called by browser roles', async () => {
    await asUser(ADMIN, async () => {
      await expect(db.query(`select public.add_customer_stamps(gen_random_uuid(), 5)`)).rejects.toThrow(/permission denied/);
    });
    await asUser(null, async () => {
      await expect(db.query(`select public.hit_rate_limit('x', 1, 1)`)).rejects.toThrow(/permission denied/);
    });
  });

  test('deactivated staff lose access immediately', async () => {
    await db.query('update public.staff set active = false where id = $1', [WAITER]);
    await asUser(WAITER, async () => {
      expect(Number((await one<any>('select count(*) as n from public.orders')).n)).toBe(0);
    });
    await db.query('update public.staff set active = true where id = $1', [WAITER]);
  });

  test('realtime: staff topic only for own restaurant; customer topics only when granted', async () => {
    await db.query(`insert into realtime.messages (topic, extension, payload) values
      ('staff-${R}', 'broadcast', '{}'), ('table-abc', 'broadcast', '{}'), ('public-${R}', 'broadcast', '{}')`);
    const visible = async (topic: string) => {
      await db.query(`select set_config('realtime.topic', $1, false)`, [topic]);
      return Number((await one<any>('select count(*) as n from realtime.messages where topic = $1', [topic])).n);
    };
    await asUser(KITCHEN, async () => { expect(await visible(`staff-${R}`)).toBe(1); });
    await asUser(OTHER_ADMIN, async () => { expect(await visible(`staff-${R}`)).toBe(0); });
    await asUser(null, async () => {
      expect(await visible(`staff-${R}`)).toBe(0);
      expect(await visible('table-abc')).toBe(0);
      expect(await visible(`public-${R}`)).toBe(1);
    });
    await db.query(`insert into public.realtime_topics (topic, expires_at) values ('table-abc', now() + interval '1 hour')`);
    await asUser(null, async () => { expect(await visible('table-abc')).toBe(1); });
    await asUser(null, async () => {
      await expect(db.query(`insert into realtime.messages (topic, extension) values ('table-abc', 'broadcast')`)).rejects.toThrow();
    });
  });
});

describe('migrations', () => {
  test('the RLS / realtime file can be run again safely', async () => {
    const { readFileSync } = await import('node:fs');
    const sql = readFileSync('supabase/migrations/20261028000003_rls_realtime.sql', 'utf8');
    await db.exec(sql);
    await db.exec(sql);
  });
});

describe('day-wise bill numbers', () => {
  test('start from 1 each day and keep counting within the day', async () => {
    const bill = async (day: string) => {
      const res = await placeOrder({ is_takeaway: true, items: items([CHAI, 'Masala Chai', 40, 1]) });
      const o = await orderRow(res.order_id);
      const out = await fn<any>('select public.bill_order($1::jsonb)', [JSON.stringify({ order_id: o.id, restaurant_id: R, expected_version: o.version,
        payment_mode: 'cash', subtotal: 40, discount_amount: 0, gst_rate: 5, gst_amount: 2, total_amount: 42, bill_day: day })]);
      return one<any>('select bill_number, daily_bill_number from public.bills where id = $1', [out.bill_id]);
    };
    const a = await bill('2030-01-01');
    const b = await bill('2030-01-01');
    const c = await bill('2030-01-02');
    expect([a.daily_bill_number, b.daily_bill_number, c.daily_bill_number]).toEqual([1, 2, 1]);
    expect(b.bill_number).toBe(a.bill_number + 1); // the running bill number is unchanged
  });
});

describe('orders waiting for a waiter (table visits)', () => {
  test('a guest order on a free table waits; items added keep it waiting; accepting sends it on', async () => {
    const T3 = (await one<any>(`insert into public.restaurant_tables (restaurant_id, table_number) values ($1, 3) returning id`, [R])).id;
    const first = await placeOrder({ table_id: T3, table_number: 3, needs_approval: true, items: items([CHAI, 'Masala Chai', 40, 1]) });
    expect(first.created).toBe(true);
    expect((await orderRow(first.order_id)).status).toBe('awaiting');

    // More food from the same table goes into the same order, still waiting
    const more = await placeOrder({ table_id: T3, table_number: 3, needs_approval: true, items: items([PANEER, 'Paneer Tikka', 220, 1]) });
    expect(more).toEqual({ order_id: first.order_id, created: false });
    expect((await orderRow(first.order_id)).status).toBe('awaiting');

    await fn("select public.update_order_status($1, $2, 'pending')", [first.order_id, R]);
    expect((await orderRow(first.order_id)).status).toBe('pending');
  });

  test('rejecting a waiting order frees the table; staff orders never wait', async () => {
    const T4 = (await one<any>(`insert into public.restaurant_tables (restaurant_id, table_number) values ($1, 4) returning id`, [R])).id;
    const res = await placeOrder({ table_id: T4, table_number: 4, needs_approval: true, items: items([CHAI, 'Masala Chai', 40, 1]) });
    const out = await fn<any>("select public.update_order_status($1, $2, 'cancelled')", [res.order_id, R]);
    expect(out.table_freed).toBe(true);

    const staffOrder = await placeOrder({ table_id: T4, table_number: 4, waiter_id: WAITER, items: items([CHAI, 'Masala Chai', 40, 1]) });
    expect((await orderRow(staffOrder.order_id)).status).toBe('pending');
  });

  test('the table-visits file can be run again safely', async () => {
    const { readFileSync } = await import('node:fs');
    await db.exec(readFileSync('supabase/migrations/20261029000005_table_visits.sql', 'utf8'));
  });
});
