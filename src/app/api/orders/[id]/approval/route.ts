import { requireStaffNotKitchen } from '@/server/auth';
import { db, must, rpc } from '@/server/db';
import { getOrder } from '@/server/data';
import { ApiError, isUuid, json, readBody, route } from '@/server/http';
import { broadcast, orderMessages, staffMessage } from '@/server/realtime';

// Waiter / admin: Accept or Reject an order a guest placed from their phone on a free table.
// Accepting sends it to the kitchen; rejecting cancels it and frees the table.
export const POST = route(async (req, { id }) => {
  const ctx = await requireStaffNotKitchen();
  const { accept } = await readBody(req);
  if (!isUuid(id)) throw new ApiError(404, 'Order not found');

  if (accept === true) {
    // Only an order that is still waiting can be accepted (two waiters may tap at once)
    const updated = must(await db().from('orders').update({ status: 'pending' })
      .eq('id', id).eq('restaurant_id', ctx.restaurantId).eq('status', 'awaiting').select('id'));
    if (!updated.length) throw new ApiError(409, 'This order was already accepted or rejected');
    const order = (await getOrder(id, ctx.restaurantId))!;
    await broadcast([
      ...orderMessages('new-order', order),
      ...orderMessages('order-status-updated', order),
      staffMessage(ctx.restaurantId, 'table-updated'),
    ]);
    return json(order);
  }

  if (accept === false) {
    const current = await getOrder(id, ctx.restaurantId);
    if (!current || current.status !== 'awaiting') throw new ApiError(409, 'This order was already accepted or rejected');
    await rpc('update_order_status', { p_order_id: id, p_restaurant_id: ctx.restaurantId, p_status: 'cancelled' });
    const order = (await getOrder(id, ctx.restaurantId))!;
    await broadcast([...orderMessages('order-status-updated', order), staffMessage(ctx.restaurantId, 'table-updated')]);
    return json(order);
  }

  throw new ApiError(400, 'Choose accept or reject');
}, 400);
