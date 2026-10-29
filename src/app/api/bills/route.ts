import { requireAdmin } from '@/server/auth';
import { billOrder } from '@/server/billing';
import { db, must } from '@/server/db';
import { BILL_SELECT } from '@/server/data';
import { env } from '@/server/env';
import { ApiError, isUuid, json, readBody, route } from '@/server/http';
import { billDoc } from '@/server/mappers';
import { parseDateParam, zonedDayRange } from '@/server/time';

export const GET = route(async (req) => {
  const ctx = await requireAdmin();
  let q = db().from('bills').select(BILL_SELECT).eq('restaurant_id', ctx.restaurantId);
  const date = req.nextUrl.searchParams.get('date');
  if (date) {
    const d = parseDateParam(date);
    if (!d) throw new ApiError(400, 'Invalid date');
    const { start, end } = zonedDayRange(d.y, d.m, d.d, env.timeZone);
    q = q.gte('created_at', start.toISOString()).lt('created_at', end.toISOString());
  }
  const rows = must(await q.order('created_at', { ascending: false }).limit(200));
  return json(rows.map(billDoc));
});

// Generate the bill for an order at the POS (admin / cashier only — waiters don't bill).
// Payment is collected by staff (cash / UPI / card); an optional loyalty reward of the
// linked customer can be applied here.
export const POST = route(async (req) => {
  const ctx = await requireAdmin();
  const { orderId, paymentMode, rewardId } = await readBody(req);
  if (!orderId) throw new ApiError(400, 'orderId is required');
  if (!isUuid(orderId)) throw new ApiError(404, 'Order not found');

  const result = await billOrder({
    orderId,
    restaurant: ctx.restaurant,
    paymentMode,
    rewardId: rewardId || null,
    user: ctx.user,
  });

  return json({
    ...result.bill,
    stampEarned: result.stampEarned,
    customerTotalStamps: result.customer?.totalStamps,
    newlyUnlocked: result.newlyUnlocked,
  }, 201);
}, 400);
