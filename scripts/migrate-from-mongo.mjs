// Copies the existing MongoDB data (Express/Mongoose build) into Supabase Postgres.
//
//   node scripts/migrate-from-mongo.mjs            # dry run: reads MongoDB, reports what it would write
//   node scripts/migrate-from-mongo.mjs --apply    # writes to Supabase
//
// Needs MONGODB_URI, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (in .env.local).
// Run the SQL migrations in supabase/migrations first.
//
// * MongoDB is only READ — nothing there is changed or deleted.
// * Every ObjectId maps to a deterministic UUID, so re-running the script updates the rows it
//   wrote before instead of duplicating them (legacy_id keeps the original ObjectId).
// * Staff keep their passwords: the bcrypt hashes are imported straight into Supabase Auth
//   (server-side, never exposed to a browser). Accounts that can't be imported are listed;
//   reset those with "Send password recovery" in the Supabase dashboard or from Staff → Edit.
// * Missing references (deleted table, customer or waiter) become NULL and are reported.

import { config } from 'dotenv';
import { createHash, randomBytes } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });
config();

const APPLY = process.argv.includes('--apply');
const { MONGODB_URI, NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY } = process.env;
if (!MONGODB_URI || !SUPABASE_URL || !SERVICE_KEY) {
  console.error('Set MONGODB_URI, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const summary = {};
const problems = [];
const count = (k, n = 1) => { summary[k] = (summary[k] || 0) + n; };
const warn = (msg) => problems.push(msg);

// ObjectId → stable UUID (name-based, like UUID v5)
const uuidFor = (kind, id) => {
  const h = createHash('sha1').update(`srms:${kind}:${String(id)}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const oid = (v) => (v ? String(v) : null);
const iso = (d) => (d ? new Date(d).toISOString() : null);
const n = (v, d = 0) => (v === null || v === undefined || Number.isNaN(Number(v)) ? d : Number(v));
const s = (v, d = '') => (v === null || v === undefined ? d : String(v));

async function upsert(table, rows, onConflict = 'id') {
  count(table, rows.length);
  if (!APPLY || !rows.length) return;
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from(table).upsert(rows.slice(i, i + 500), { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function findAuthUserByEmail(email) {
  for (let page = 1; page < 200; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find(u => (u.email || '').toLowerCase() === email);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function main() {
  const mongo = new MongoClient(MONGODB_URI);
  await mongo.connect();
  const mdb = mongo.db();
  const all = async (name) => mdb.collection(name).find({}).toArray().catch(() => []);
  console.log(`Connected to MongoDB "${mdb.databaseName}". Mode: ${APPLY ? 'APPLY (writing to Supabase)' : 'DRY RUN (nothing is written)'}\n`);

  const [restaurants, users, tables, categories, menuItems, customers, loyalty, orders, bills, counters] = await Promise.all(
    ['restaurants', 'users', 'tables', 'categories', 'menuitems', 'customers', 'loyaltysettings', 'orders', 'bills', 'counters'].map(all)
  );

  const rid = (v) => (v ? uuidFor('restaurant', v) : null);
  const onlyRestaurant = restaurants.length === 1 ? rid(restaurants[0]._id) : null;
  const restaurantIds = new Set(restaurants.map(r => rid(r._id)));
  const scoped = (v) => {
    const id = rid(v);
    if (id && restaurantIds.has(id)) return id;
    return onlyRestaurant;
  };

  // ── Restaurants ──
  await upsert('restaurants', restaurants.map(r => ({
    id: rid(r._id), legacy_id: oid(r._id), name: s(r.name, 'Restaurant'), slug: s(r.slug || r.name, 'restaurant').toLowerCase(),
    email: s(r.email, 'owner@example.com'), phone: s(r.phone), address: s(r.address), gst_number: s(r.gstNumber),
    gst_rate: n(r.gstRate, 5), fssai_number: s(r.fssaiNumber), receipt_footer: s(r.receiptFooter, 'Thank you for dining with us!'),
    currency: s(r.currency, 'INR'), active: r.active !== false, created_at: iso(r.createdAt) || undefined, updated_at: iso(r.updatedAt) || undefined,
  })));

  // ── Staff: Supabase Auth users (with their bcrypt hashes) + profiles ──
  const staffId = new Map();
  for (const u of users) {
    const email = s(u.email).toLowerCase().trim();
    if (!email) { warn(`User ${u._id} has no email — skipped`); continue; }
    const restaurantId = scoped(u.restaurantId);
    if (!restaurantId) { warn(`User ${email} has no restaurant — skipped`); continue; }
    let authId = uuidFor('user', u._id);
    if (APPLY) {
      const existing = await findAuthUserByEmail(email);
      if (existing) {
        authId = existing.id;
      } else {
        const attrs = { id: authId, email, email_confirm: true, app_metadata: { role: u.role, restaurant_id: restaurantId } };
        let { error } = await sb.auth.admin.createUser({ ...attrs, password_hash: u.password });
        if (error) {
          // Hash not accepted: create the account with a random password and flag it for a reset
          warn(`Could not import the password of ${email} (${error.message}) — reset it from Staff → Edit.`);
          ({ error } = await sb.auth.admin.createUser({ ...attrs, password: randomBytes(24).toString('base64url') }));
          if (error) { warn(`Could not create login for ${email}: ${error.message}`); continue; }
        }
        if (u.active === false) await sb.auth.admin.updateUserById(authId, { ban_duration: '876000h' });
      }
    }
    staffId.set(oid(u._id), authId);
    await upsert('staff', [{
      id: authId, legacy_id: oid(u._id), restaurant_id: restaurantId, name: s(u.name, email), email,
      role: ['admin', 'waiter', 'kitchen'].includes(u.role) ? u.role : 'waiter', active: u.active !== false,
      created_at: iso(u.createdAt) || undefined,
    }]);
    count('auth users');
  }
  const staffRef = (v) => (v && staffId.has(oid(v)) ? staffId.get(oid(v)) : null);

  // ── Tables (current order linked after orders are in) ──
  const tableIds = new Set();
  await upsert('restaurant_tables', tables.filter(t => scoped(t.restaurantId)).map(t => {
    const id = uuidFor('table', t._id); tableIds.add(id);
    return {
      id, legacy_id: oid(t._id), restaurant_id: scoped(t.restaurantId), table_number: n(t.tableNumber, 1),
      capacity: Math.max(1, n(t.capacity, 4)), status: ['available', 'occupied', 'reserved'].includes(t.status) ? t.status : 'available',
      customer_count: n(t.customerCount), bill_requested: Boolean(t.billRequested), bill_requested_at: iso(t.billRequestedAt),
      created_at: iso(t.createdAt) || undefined,
    };
  }));

  // ── Menu ──
  await upsert('categories', categories.map(c => ({
    id: uuidFor('category', c._id), legacy_id: oid(c._id), restaurant_id: scoped(c.restaurantId), name: s(c.name, 'Category').trim(),
    icon: s(c.icon, '🍽️'), is_active: c.isActive !== false, sort_order: n(c.sortOrder), created_at: iso(c.createdAt) || undefined,
  })));
  const menuIds = new Set();
  await upsert('menu_items', menuItems.filter(m => scoped(m.restaurantId)).map(m => {
    const id = uuidFor('menu', m._id); menuIds.add(id);
    return {
      id, legacy_id: oid(m._id), restaurant_id: scoped(m.restaurantId), name: s(m.name, 'Item'), category: s(m.category, 'Other').trim(),
      price: Math.max(0, n(m.price)), description: s(m.description), available: m.available !== false, is_veg: m.isVeg !== false,
      image: s(m.image), created_at: iso(m.createdAt) || undefined,
    };
  }));

  // ── Customers ──
  const customerIds = new Set();
  const seenTokens = new Set();
  const seenCodes = new Set();
  await upsert('customers', customers.map(c => {
    const id = uuidFor('customer', c._id); customerIds.add(id);
    let token = s(c.rewardToken);
    if (!token || seenTokens.has(token)) token = 'RWD_' + randomBytes(12).toString('hex');
    seenTokens.add(token);
    let code = s(c.customerId);
    if (!code || seenCodes.has(code)) { warn(`Customer ${c._id} had a missing/duplicate customerId "${code}" — assigned CUS_M${String(c._id).slice(-8)}`); code = `CUS_M${String(c._id).slice(-8)}`; }
    seenCodes.add(code);
    return {
      id, legacy_id: oid(c._id), restaurant_id: scoped(c.restaurantId), customer_code: code, name: s(c.name, 'Guest'),
      phone: s(c.phone), reward_token: token, total_stamps: Math.max(0, n(c.totalStamps)), max_stamps_per_card: n(c.maxStampsPerCard, 8),
      active_table: c.activeTable ?? null, last_visit: iso(c.lastVisit) || iso(c.createdAt) || undefined, created_at: iso(c.createdAt) || undefined,
    };
  }));
  const customerRef = (v) => { const id = v ? uuidFor('customer', v) : null; return id && customerIds.has(id) ? id : null; };

  // ── Loyalty settings ──
  for (const l of loyalty) {
    let id = uuidFor('loyalty', l._id);
    if (APPLY) {
      // The app may already have created default settings for this restaurant: update that row
      const { data: current } = await sb.from('loyalty_settings').select('id').eq('restaurant_id', scoped(l.restaurantId)).maybeSingle();
      if (current) id = current.id;
    }
    await upsert('loyalty_settings', [{
      id, legacy_id: oid(l._id), restaurant_id: scoped(l.restaurantId),
      stamps_per_card: Math.min(24, Math.max(2, n(l.stampsPerCard, 8))), min_spend_for_stamp: Math.max(0, n(l.minSpendForStamp, 200)),
    }], 'restaurant_id');
    if (APPLY) await sb.from('loyalty_milestones').delete().eq('settings_id', id);
    await upsert('loyalty_milestones', (l.milestones || []).map((m, i) => ({
      id: uuidFor('milestone', `${l._id}:${i}`), settings_id: id, position: i, milestone_id: s(m.milestoneId, `milestone_${i}`),
      required_stamps: Math.max(1, n(m.requiredStamps, 1)), title: s(m.title, 'Special Reward'), description: s(m.description),
      reward_type: ['free_item', 'discount_percent', 'discount_flat'].includes(m.rewardType) ? m.rewardType : 'discount_percent',
      reward_value: Math.max(0, n(m.rewardValue)), icon: s(m.icon, '🎁'), is_active: m.isActive !== false,
    })));
  }

  // ── Orders + items ──
  const orderIds = new Set();
  const orderRows = [];
  const itemRows = [];
  const seenOrderNo = new Set();
  for (const o of orders) {
    const restaurantId = scoped(o.restaurantId);
    if (!restaurantId) { warn(`Order ${o._id} has no restaurant — skipped`); continue; }
    const key = `${restaurantId}:${o.orderNumber}`;
    if (o.orderNumber == null || seenOrderNo.has(key)) { warn(`Order ${o._id} has a missing/duplicate order number ${o.orderNumber} — skipped`); continue; }
    seenOrderNo.add(key);
    const id = uuidFor('order', o._id); orderIds.add(id);
    const tableId = o.tableId ? uuidFor('table', o.tableId) : null;
    if (o.tableId && !tableIds.has(tableId)) warn(`Order #${o.orderNumber}: table ${o.tableId} no longer exists — unlinked`);
    if (o.customerId && !customerRef(o.customerId)) warn(`Order #${o.orderNumber}: customer ${o.customerId} no longer exists — unlinked`);
    const ar = o.appliedReward || {};
    orderRows.push({
      id, legacy_id: oid(o._id), restaurant_id: restaurantId, order_number: n(o.orderNumber),
      order_type: ['dine_in', 'dine-in', 'takeaway'].includes(o.orderType) ? o.orderType : 'dine_in',
      table_id: tableIds.has(tableId) ? tableId : null, table_number: o.tableNumber ?? null,
      customer_name: s(o.customerName), customer_phone: s(o.customerPhone), customer_id: customerRef(o.customerId),
      customer_code: s(o.customerCode), applied_reward_id: ar.rewardId || null, applied_reward_title: ar.title || null,
      applied_reward_type: ar.rewardType || null, applied_reward_discount: n(ar.discountAmount), takeaway_token: s(o.takeawayToken),
      waiter_id: staffRef(o.waiterId), waiter_name: o.waiterName ?? null,
      status: ['pending', 'accepted', 'preparing', 'ready', 'served', 'completed', 'cancelled', 'placed'].includes(o.status) ? o.status : 'pending',
      total_amount: (o.items || []).reduce((sum, i) => sum + n(i.price) * n(i.quantity, 1), 0),
      customer_count: n(o.customerCount, 1), notes: s(o.notes), batch_count: n(o.batchCount, 1),
      last_updated_by_waiter: iso(o.lastUpdatedByWaiter), bill_requested: Boolean(o.billRequested), bill_requested_at: iso(o.billRequestedAt),
      payment_preference: ['', 'cash', 'upi', 'card'].includes(o.paymentPreference || '') ? (o.paymentPreference || '') : '',
      requested_reward_id: s(o.requestedRewardId), created_at: iso(o.createdAt) || undefined,
    });
    (o.items || []).forEach((i, idx) => {
      const menuId = i.menuItemId ? uuidFor('menu', i.menuItemId) : null;
      itemRows.push({
        id: uuidFor('orderitem', i._id || `${o._id}:${idx}`), order_id: id, position: idx,
        menu_item_id: menuIds.has(menuId) ? menuId : null, name: s(i.name, 'Item'), price: Math.max(0, n(i.price)),
        quantity: Math.max(1, n(i.quantity, 1)), notes: s(i.notes), served: Boolean(i.served),
        added_at: iso(i.addedAt) || iso(o.createdAt) || undefined, served_at: iso(i.servedAt), batch_number: n(i.batchNumber, 1),
      });
    });
  }
  await upsert('orders', orderRows);
  await upsert('order_items', itemRows);

  // customer.orders[] and the rewards (which may point at orders)
  const links = [];
  const rewardRows = [];
  for (const c of customers) {
    const cid = uuidFor('customer', c._id);
    const seenOrders = new Set();
    (c.orders || []).forEach(oidVal => {
      const id = uuidFor('order', oidVal);
      if (orderIds.has(id) && !seenOrders.has(id)) { seenOrders.add(id); links.push({ customer_id: cid, order_id: id }); }
    });
    const seenRewards = new Set();
    (c.rewards || []).forEach((r, idx) => {
      if (!r.rewardId || seenRewards.has(r.rewardId)) return;
      seenRewards.add(r.rewardId);
      const orderId = r.orderId ? uuidFor('order', r.orderId) : null;
      rewardRows.push({
        id: uuidFor('reward', r._id || `${c._id}:${r.rewardId}`), customer_id: cid, position: idx, reward_id: r.rewardId,
        title: s(r.title, 'Reward'), description: s(r.description), required_stamps: n(r.requiredStamps, 1),
        reward_type: ['free_item', 'discount_percent', 'discount_flat'].includes(r.rewardType) ? r.rewardType : 'discount_percent',
        reward_value: n(r.rewardValue), status: ['locked', 'available', 'redeemed', 'expired'].includes(r.status) ? r.status : 'locked',
        unlocked_at: iso(r.unlockedAt), redeemed_at: iso(r.redeemedAt), order_id: orderIds.has(orderId) ? orderId : null,
      });
    });
  }
  await upsert('customer_orders', links, 'customer_id,order_id');
  await upsert('customer_rewards', rewardRows, 'customer_id,reward_id');

  // Tables' current open order
  for (const t of tables) {
    if (!t.currentOrderId) continue;
    const orderId = uuidFor('order', t.currentOrderId);
    if (!orderIds.has(orderId)) { warn(`Table ${t.tableNumber}: current order ${t.currentOrderId} missing — cleared`); continue; }
    count('table→order links');
    if (APPLY) await sb.from('restaurant_tables').update({ current_order_id: orderId }).eq('id', uuidFor('table', t._id));
  }

  // ── Bills + items ──
  const billRows = [];
  const billItemRows = [];
  const billedOrders = new Set();
  const seenBillNo = new Set();
  for (const b of bills) {
    const orderId = b.orderId ? uuidFor('order', b.orderId) : null;
    if (!orderIds.has(orderId)) { warn(`Bill #${b.billNumber}: order ${b.orderId} missing — skipped (bill kept in MongoDB)`); continue; }
    if (billedOrders.has(orderId)) { warn(`Bill #${b.billNumber}: second bill for the same order — skipped`); continue; }
    const restaurantId = scoped(b.restaurantId);
    const key = `${restaurantId}:${b.billNumber}`;
    if (b.billNumber == null || seenBillNo.has(key)) { warn(`Bill ${b._id}: missing/duplicate bill number ${b.billNumber} — skipped`); continue; }
    billedOrders.add(orderId); seenBillNo.add(key);
    const id = uuidFor('bill', b._id);
    const ar = b.appliedReward || {};
    billRows.push({
      id, legacy_id: oid(b._id), restaurant_id: restaurantId, bill_number: n(b.billNumber), order_id: orderId,
      order_number: b.orderNumber ?? null, order_type: b.orderType === 'takeaway' ? 'takeaway' : 'dine_in', table_number: b.tableNumber ?? null,
      customer_name: s(b.customerName), customer_phone: s(b.customerPhone), customer_id: customerRef(b.customerId), takeaway_token: s(b.takeawayToken),
      subtotal: n(b.subtotal), discount_amount: n(b.discountAmount), applied_reward_id: ar.rewardId || null, applied_reward_title: ar.title || null,
      applied_reward_type: ar.rewardType || null, applied_reward_discount: n(ar.discountAmount), gst_rate: n(b.gstRate, 5),
      gst_amount: n(b.gstAmount), total_amount: n(b.totalAmount),
      payment_mode: ['cash', 'upi', 'card'].includes(b.paymentMode) ? b.paymentMode : 'cash',
      payment_status: b.paymentStatus === 'pending' ? 'pending' : 'paid', customer_count: n(b.customerCount, 1),
      billed_by: staffRef(b.billedBy), billed_by_name: s(b.billedByName), stamp_awarded: Boolean(b.stampAwarded),
      created_at: iso(b.createdAt) || undefined,
    });
    (b.items || []).forEach((i, idx) => billItemRows.push({
      id: uuidFor('billitem', i._id || `${b._id}:${idx}`), bill_id: id, position: idx, name: s(i.name, 'Item'),
      quantity: n(i.quantity, 1), price: n(i.price), total: n(i.total, n(i.price) * n(i.quantity, 1)),
    }));
  }
  await upsert('bills', billRows);
  await upsert('bill_items', billItemRows);

  // ── Counters: keep numbering where MongoDB left off ──
  const counterRows = [];
  for (const c of counters) {
    const [kind, mongoRid] = String(c._id).split(':');
    if (kind === 'customer') counterRows.push({ key: 'customer', seq: n(c.seq) });
    else if ((kind === 'order' || kind === 'bill') && mongoRid) counterRows.push({ key: `${kind}:${rid(mongoRid)}`, seq: n(c.seq) });
  }
  if (APPLY && counterRows.length) {
    const { data: existing } = await sb.from('counters').select('*').in('key', counterRows.map(r => r.key));
    const merged = counterRows.map(r => ({ ...r, seq: Math.max(r.seq, n(existing?.find(e => e.key === r.key)?.seq)) }));
    await upsert('counters', merged, 'key');
  } else count('counters', counterRows.length);

  // Completed orders without a bill (same check as scripts/fix-discounted-bills.js)
  const unbilled = orders.filter(o => o.status === 'completed' && !billedOrders.has(uuidFor('order', o._id)));
  if (unbilled.length) warn(`${unbilled.length} completed order(s) have no bill (not counted in revenue reports): ${unbilled.slice(0, 20).map(o => `#${o.orderNumber}`).join(', ')}${unbilled.length > 20 ? '…' : ''}`);

  // Bring reward tiers up to date with the current loyalty settings
  if (APPLY) {
    for (const c of customers) await sb.rpc('sync_customer_rewards', { p_customer_id: uuidFor('customer', c._id) });
  }

  await mongo.close();

  console.log('Rows', APPLY ? 'written' : 'to write', ':');
  Object.entries(summary).forEach(([k, v]) => console.log(`  ${k.padEnd(22)} ${v}`));
  if (problems.length) {
    console.log(`\n${problems.length} item(s) need attention:`);
    problems.forEach(p => console.log(`  - ${p}`));
  } else {
    console.log('\nNo problems found.');
  }
  if (!APPLY) console.log('\nDry run only. Re-run with --apply to write to Supabase.');
}

main().catch(err => {
  console.error('Migration failed:', err.message || err);
  process.exit(1);
});
