import 'server-only';
import { db, must, rpc } from './db';
import { isUuid } from './http';
import { billDoc, customerDoc, loyaltySettingsDoc, orderDoc } from './mappers';
/* eslint-disable @typescript-eslint/no-explicit-any */

export const ORDER_SELECT = '*, order_items(*)';
export const CUSTOMER_SELECT = '*, customer_rewards(*), customer_orders(order_id, created_at)';
export const BILL_SELECT = '*, bill_items(*)';
export const ACTIVE_STATUSES_FILTER = '("completed","cancelled")';

export async function getOrderRow(orderId: string, restaurantId: string) {
  if (!isUuid(orderId)) return null;
  return must(await db().from('orders').select(ORDER_SELECT).eq('id', orderId).eq('restaurant_id', restaurantId).maybeSingle()) as any;
}

export async function getOrder(orderId: string, restaurantId: string) {
  const row = await getOrderRow(orderId, restaurantId);
  return row ? orderDoc(row) : null;
}

export async function getCustomerById(id: string) {
  if (!isUuid(id)) return null;
  const row = must(await db().from('customers').select(CUSTOMER_SELECT).eq('id', id).maybeSingle());
  return row ? customerDoc(row) : null;
}

// findCustomerQuery(): a database id or the "CUS_10001" code.
export async function findCustomer(idOrCode: string) {
  const q = db().from('customers').select(CUSTOMER_SELECT);
  const row = must(await (isUuid(idOrCode)
    ? q.or(`id.eq.${idOrCode},customer_code.eq.${idOrCode}`)
    : q.eq('customer_code', idOrCode)
  ).limit(1).maybeSingle());
  return row ? customerDoc(row) : null;
}

export async function getBill(billId: string, restaurantId: string) {
  if (!isUuid(billId)) return null;
  const row = must(await db().from('bills').select(BILL_SELECT).eq('id', billId).eq('restaurant_id', restaurantId).maybeSingle());
  return row ? billDoc(row) : null;
}

// LoyaltySetting.getOrCreateDefault()
export async function getLoyaltySettings(restaurantId: string | null) {
  const id = await rpc<string>('get_or_create_loyalty_settings', { p_restaurant_id: restaurantId });
  const row = must(await db().from('loyalty_settings').select('*, loyalty_milestones(*)').eq('id', id).single());
  return loyaltySettingsDoc(row);
}

// customer.initDefaultRewards(settings) + customer.evaluateRewards(), persisted.
export async function syncRewards(customerId: string) {
  await rpc('sync_customer_rewards', { p_customer_id: customerId });
}

// Tables that have an open (not billed / not cancelled) order right now. A customer counts as
// "currently seated" only at one of these tables, so the Customers page matches the Tables page
// even when someone scanned the QR and left without ordering.
export async function tablesWithOpenOrders(restaurantId: string): Promise<Set<number>> {
  const rows = must(await db().from('orders').select('table_number')
    .eq('restaurant_id', restaurantId).not('table_number', 'is', null)
    .not('status', 'in', ACTIVE_STATUSES_FILTER)) as { table_number: number }[];
  return new Set(rows.map(r => r.table_number));
}

// A customer's table only while that table still has an open order.
export const seatedTable = (activeTable: number | null, openTables: Set<number>) =>
  activeTable !== null && activeTable !== undefined && openTables.has(activeTable) ? activeTable : null;
