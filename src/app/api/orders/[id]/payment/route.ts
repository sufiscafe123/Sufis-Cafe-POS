import { requireAdmin } from '@/server/auth';
import { db } from '@/server/db';
import { getBill } from '@/server/data';
import { ApiError, isUuid, json, readBody, route } from '@/server/http';
import { broadcast, staffMessage } from '@/server/realtime';
import { PAYMENT_MODES } from '@/server/billing';

// Admin: record how the customer actually paid a billed order (cash / card / UPI).
// Reports and the Excel download read the payment mode from the bill.
export const PUT = route(async (req, { id }) => {
  const ctx = await requireAdmin();
  const { paymentMode } = await readBody(req);
  const mode = String(paymentMode || '').toLowerCase();
  if (!PAYMENT_MODES.includes(mode)) throw new ApiError(400, 'Choose cash, UPI or card as the payment mode');
  if (!isUuid(id)) throw new ApiError(404, 'Order not found');

  const { data, error } = await db().from('bills').update({ payment_mode: mode })
    .eq('order_id', id).eq('restaurant_id', ctx.restaurantId).select('id').maybeSingle();
  if (error) throw new ApiError(400, error.message);
  if (!data) throw new ApiError(404, 'This order has no bill yet. Generate the bill first.');

  const bill = await getBill(data.id, ctx.restaurantId);
  await broadcast([staffMessage(ctx.restaurantId, 'bill-updated', bill)]);
  return json(bill);
}, 400);
