import { requireStaff } from '@/server/auth';
import { rpc } from '@/server/db';
import { getOrder } from '@/server/data';
import { ApiError, isUuid, json, readBody, route } from '@/server/http';
import { MANUAL_STATUSES } from '@/server/orders';
import { broadcast, orderMessages, staffMessage } from '@/server/realtime';

// Update order status (kitchen / waiter / admin). Billing is the only way to complete an order.
export const PUT = route(async (req, { id }) => {
  const ctx = await requireStaff();
  const { status } = await readBody(req);
  if (!MANUAL_STATUSES.includes(status)) {
    throw new ApiError(400, status === 'completed' ? 'Generate the bill to complete an order' : 'Invalid status');
  }
  if (status === 'cancelled' && ctx.user.role === 'kitchen') {
    throw new ApiError(403, 'Only a waiter or admin can cancel an order');
  }
  if (!isUuid(id)) throw new ApiError(404, 'Order not found or already closed');

  let result: { table_freed: boolean };
  try {
    result = await rpc('update_order_status', { p_order_id: id, p_restaurant_id: ctx.restaurantId, p_status: status });
  } catch (err) {
    if (err instanceof Error && err.message.includes('ORDER_NOT_FOUND')) throw new ApiError(404, 'Order not found or already closed');
    throw err;
  }

  const order = (await getOrder(id, ctx.restaurantId))!;
  await broadcast([
    ...orderMessages('order-status-updated', order),
    ...(status === 'cancelled' && order.tableId ? [staffMessage(ctx.restaurantId, 'table-updated')] : []),
  ]);
  void result;
  return json(order);
}, 400);
