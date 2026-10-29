import 'server-only';
import { createHmac } from 'node:crypto';
import { db } from './db';
import { env } from './env';
import { publicCustomer, publicOrder, type CustomerDoc, type OrderDoc } from './mappers';

// Replaces the Socket.IO rooms of backend/utils/realtime.js with Supabase Realtime Broadcast.
// Every event goes to a specific private topic — never to everyone — so order and customer
// data only reach the people allowed to see it (enforced by RLS on realtime.messages):
//   staff-<restaurantId>     all signed-in staff (admin, waiter, kitchen)
//   table-<…>                customers seated at that table (customer data stripped)
//   cust-<…>                 one customer's own devices
//   public-<restaurantId>    menu / categories / loyalty program (public data)

const sign = (value: string) =>
  createHmac('sha256', env.customerSessionSecret).update(value).digest('hex').slice(0, 32);

export const staffTopic = (restaurantId: string) => `staff-${restaurantId}`;
export const publicTopic = (restaurantId: string) => `public-${restaurantId}`;
export const tableTopic = (restaurantId: string, tableNumber: number) => `table-${sign(`table:${restaurantId}:${tableNumber}`)}`;
export const customerTopic = (customerId: string) => `cust-${sign(`customer:${customerId}`)}`;

// Lets a checked-in customer's browser listen on its table and profile topics.
export async function grantCustomerTopics(restaurantId: string, customerId: string, tableNumber: number) {
  const expiresAt = new Date(Date.now() + 13 * 60 * 60 * 1000).toISOString();
  const topics = [customerTopic(customerId), ...(tableNumber > 0 ? [tableTopic(restaurantId, tableNumber)] : [])];
  const { error } = await db()
    .from('realtime_topics')
    .upsert(topics.map(topic => ({ topic, expires_at: expiresAt })), { onConflict: 'topic' });
  if (error) console.error('Could not grant realtime topics:', error.message);
  return topics;
}

type Message = { topic: string; event: string; payload: unknown };

// Publishes through the Realtime REST API with the service-role key. Failures are logged,
// never thrown: the database change already happened and screens also refresh on focus.
export async function broadcast(messages: Message[]) {
  if (!messages.length) return;
  try {
    const res = await fetch(`${env.supabaseUrl}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.serviceRoleKey,
        Authorization: `Bearer ${env.serviceRoleKey}`,
      },
      body: JSON.stringify({
        messages: messages.map(m => ({ topic: m.topic, event: m.event, payload: m.payload ?? {}, private: true })),
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.error(`Realtime broadcast failed (${res.status}): ${await res.text()}`);
  } catch (err) {
    console.error('Realtime broadcast failed:', err);
  }
}

// emitOrder(): full order to staff, the public view to the table.
export function orderMessages(event: string, order: OrderDoc): Message[] {
  const out: Message[] = [{ topic: staffTopic(order.restaurantId), event, payload: order }];
  if (order.tableNumber) {
    out.push({ topic: tableTopic(order.restaurantId, order.tableNumber), event, payload: publicOrder(order) });
  }
  return out;
}

export const staffMessage = (restaurantId: string, event: string, payload?: unknown): Message => ({
  topic: staffTopic(restaurantId), event, payload: payload ?? {},
});

export const publicMessage = (restaurantId: string, event: string, payload?: unknown): Message => ({
  topic: publicTopic(restaurantId), event, payload: payload ?? {},
});

export const customerMessage = (customer: CustomerDoc): Message => ({
  topic: customerTopic(customer._id), event: 'customer-update', payload: publicCustomer(customer),
});
