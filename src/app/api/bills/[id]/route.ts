import { requireAdmin } from '@/server/auth';
import { getBill, getOrder } from '@/server/data';
import { ApiError, json, route } from '@/server/http';

export const GET = route(async (_req, { id }) => {
  const ctx = await requireAdmin();
  const bill = await getBill(id, ctx.restaurantId);
  if (!bill) throw new ApiError(404, 'Bill not found');
  // The original populated orderId with the order document
  const order = await getOrder(bill.orderId, ctx.restaurantId);
  return json({ ...bill, orderId: order || bill.orderId });
});
