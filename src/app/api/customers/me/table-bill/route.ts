import { requireCustomer, requireStaffOrCustomer } from '@/server/auth';
import { computeTotals, rewardDiscount } from '@/server/billing';
import { db, must } from '@/server/db';
import { ACTIVE_STATUSES_FILTER, ORDER_SELECT, getCustomerById, getLoyaltySettings, syncRewards } from '@/server/data';
import { json, route } from '@/server/http';
import { orderDoc, publicOrder } from '@/server/mappers';

// Customer: the running bill for their table (read-only — payment happens with the waiter)
export const GET = route(async (req) => {
  const ctx = requireCustomer(await requireStaffOrCustomer(req));

  const row = must(await db().from('orders').select(ORDER_SELECT)
    .eq('restaurant_id', ctx.restaurantId).eq('table_number', ctx.tableNumber)
    .not('status', 'in', ACTIVE_STATUSES_FILTER)
    .order('created_at', { ascending: false }).limit(1).maybeSingle());
  const order = row ? orderDoc(row) : null;

  await getLoyaltySettings(ctx.restaurantId);
  await syncRewards(ctx.customerId);
  const customer = await getCustomerById(ctx.customerId);
  const availableRewards = (customer?.rewards || [])
    .filter(r => r.status === 'available')
    .map(r => ({ ...r, discountPreview: order ? rewardDiscount(r, order.totalAmount) : 0 }));

  const gstRate = ctx.restaurant.gst_rate === null ? 5 : Number(ctx.restaurant.gst_rate);
  if (!order) {
    return json({
      hasActiveOrder: false,
      tableNumber: ctx.tableNumber,
      gstRate,
      subtotal: 0,
      gstAmount: 0,
      totalAmount: 0,
      items: [],
      availableRewards,
    });
  }

  const totals = computeTotals(order.totalAmount, gstRate, 0);
  return json({
    hasActiveOrder: true,
    tableNumber: ctx.tableNumber,
    order: publicOrder(order),
    items: order.items,
    ...totals,
    billRequested: order.billRequested,
    billRequestedAt: order.billRequestedAt,
    paymentPreference: order.paymentPreference,
    requestedRewardId: order.requestedRewardId,
    availableRewards,
  });
});
