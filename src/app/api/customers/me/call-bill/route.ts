import { requireCustomer, requireStaffOrCustomer } from '@/server/auth';
import { computeTotals } from '@/server/billing';
import { db, must, rpc } from '@/server/db';
import { ACTIVE_STATUSES_FILTER, getCustomerById, getOrder } from '@/server/data';
import { ApiError, json, readBody, route } from '@/server/http';
import { publicOrder } from '@/server/mappers';
import { rateLimit } from '@/server/rateLimit';
import { broadcast, orderMessages, staffMessage } from '@/server/realtime';

// Customer: "Call for Bill" — notifies the waiters, who bring the bill and collect payment at the POS.
export const POST = route(async (req) => {
  const ctx = requireCustomer(await requireStaffOrCustomer(req));
  await rateLimit(`bill:${ctx.customerId}`, { windowMs: 60 * 1000, max: 5, message: 'Your request has already been sent to the staff.' });

  const body = await readBody(req);
  const paymentPreference = ['cash', 'upi', 'card'].includes(body.paymentPreference) ? body.paymentPreference : '';

  const open = must(await db().from('orders').select('id')
    .eq('restaurant_id', ctx.restaurantId).eq('table_number', ctx.tableNumber)
    .not('status', 'in', ACTIVE_STATUSES_FILTER)
    .order('created_at', { ascending: false }).limit(1).maybeSingle());
  if (!open) throw new ApiError(404, 'There is no open order for your table');

  const customer = (await getCustomerById(ctx.customerId))!;
  let rewardTitle = '';
  let requestedRewardId = '';
  if (body.rewardId) {
    const reward = customer.rewards.find(r => r.status === 'available' && r.rewardId === body.rewardId);
    if (reward) {
      requestedRewardId = reward.rewardId;
      rewardTitle = reward.title;
    }
  }

  try {
    await rpc('request_bill', {
      p_order_id: open.id,
      p_payment_preference: paymentPreference,
      p_requested_reward_id: requestedRewardId,
      p_customer_id: customer._id,
      p_customer_code: customer.customerId,
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes('ORDER_NOT_FOUND')) throw new ApiError(404, 'There is no open order for your table');
    throw err;
  }

  const order = (await getOrder(open.id, ctx.restaurantId))!;
  const gstRate = ctx.restaurant.gst_rate === null ? 5 : Number(ctx.restaurant.gst_rate);
  await broadcast([
    staffMessage(ctx.restaurantId, 'bill-requested', {
      orderId: order._id,
      orderNumber: order.orderNumber,
      tableNumber: order.tableNumber,
      customerName: customer.name,
      paymentPreference,
      rewardTitle,
      totalAmount: computeTotals(order.totalAmount, gstRate, 0).totalAmount,
      requestedAt: order.billRequestedAt,
    }),
    staffMessage(ctx.restaurantId, 'table-updated'),
    ...orderMessages('order-updated', order),
  ]);

  return json({ success: true, message: 'A waiter is on the way with your bill.', order: publicOrder(order) });
});
