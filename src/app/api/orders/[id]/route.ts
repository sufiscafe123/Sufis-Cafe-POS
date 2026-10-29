import { requireStaffNotKitchen, requireStaffOrCustomer } from '@/server/auth';
import { rpc } from '@/server/db';
import { getOrder, getOrderRow } from '@/server/data';
import { ApiError, json, readBody, route } from '@/server/http';
import { orderDoc, publicOrder } from '@/server/mappers';
import { mergeOrderItems } from '@/server/orders';
import { broadcast, orderMessages } from '@/server/realtime';
import { toPositiveInt } from '@/server/validate';

export const GET = route(async (req, { id }) => {
  const ctx = await requireStaffOrCustomer(req);
  const order = await getOrder(id, ctx.restaurantId);
  if (!order) throw new ApiError(404, 'Order not found');
  if (ctx.kind === 'customer' && order.tableNumber !== ctx.tableNumber) throw new ApiError(404, 'Order not found');
  return json(ctx.kind === 'customer' ? publicOrder(order) : order);
});

// Waiter edits the items of an open order — batch-aware merge (see src/server/orders.ts).
export const PUT = route(async (req, { id }) => {
  const ctx = await requireStaffNotKitchen();
  const body = await readBody(req);

  const row = await getOrderRow(id, ctx.restaurantId);
  if (!row || ['completed', 'cancelled'].includes(row.status)) throw new ApiError(404, 'Order not found or already closed');
  const order = orderDoc(row);

  const p: Record<string, unknown> = {
    order_id: order._id,
    restaurant_id: ctx.restaurantId,
    expected_version: row.version,
    items: null,
  };

  if (Array.isArray(body.items)) {
    const merged = await mergeOrderItems(order, body.items, ctx.restaurantId);
    if (merged.items.length === 0) {
      throw new ApiError(400, 'An order needs at least one item. Cancel the order instead.');
    }
    p.items = merged.items;
    if (merged.addedNewBatch) {
      p.batch_count = merged.nextBatch;
      if (['served', 'ready'].includes(order.status)) p.status = 'preparing';
    }
    p.last_updated_by_waiter = new Date().toISOString();
  } else if (order.items.length === 0) {
    throw new ApiError(400, 'An order needs at least one item. Cancel the order instead.');
  }

  if (body.notes !== undefined) p.notes = String(body.notes).slice(0, 300);
  const customerCount = toPositiveInt(body.customerCount, { min: 1, max: 100 });
  if (customerCount) p.customer_count = customerCount;

  try {
    await rpc('edit_order', { p });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('ORDER_NOT_FOUND')) throw new ApiError(404, 'Order not found or already closed');
    if (msg.includes('ORDER_CHANGED')) throw new ApiError(409, 'This order was just changed by someone else. Please reopen it and try again.');
    throw err;
  }

  const updated = (await getOrder(order._id, ctx.restaurantId))!;
  await broadcast(orderMessages('order-updated', updated));
  return json(updated);
}, 400);
