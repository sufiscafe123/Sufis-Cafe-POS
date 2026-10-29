import 'server-only';
import { computeTotals, rewardDiscount, PAYMENT_MODES } from '@/lib/billing-math';
import { rpc } from './db';
import { ApiError } from './http';
import { getBill, getCustomerById, getLoyaltySettings, getOrder, getOrderRow, syncRewards } from './data';
import { orderDoc } from './mappers';
import { broadcast, customerMessage, orderMessages, staffMessage } from './realtime';
import type { RestaurantRow, StaffRow } from './auth';
import { env } from './env';
import { zonedToday } from './time';

// Today's date in the restaurant's timezone, e.g. "2026-10-28" (day-wise bill numbers)
const localDay = () => {
  const { y, m, d } = zonedToday(env.timeZone);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

export { computeTotals, rewardDiscount, PAYMENT_MODES };

const BILL_ERRORS: Record<string, [number, string]> = {
  ORDER_NOT_FOUND: [404, 'Order not found'],
  ALREADY_BILLED: [409, 'This order is already billed or cancelled'],
  ORDER_CHANGED: [409, 'This order was changed while the bill was being generated. Please check it and try again.'],
  NO_ITEMS: [400, 'This order has no items'],
  BILL_EXISTS: [409, 'A bill already exists for this order'],
  REWARD_NEEDS_CUSTOMER: [400, 'Rewards can only be applied to orders linked to a customer'],
  REWARD_UNAVAILABLE: [400, 'That reward is not available for this customer'],
};

const sqlError = (err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  const key = Object.keys(BILL_ERRORS).find(k => msg.includes(k));
  if (key) return new ApiError(BILL_ERRORS[key][0], BILL_ERRORS[key][1]);
  if (msg.includes('bills_order_id_key')) return new ApiError(409, BILL_ERRORS.BILL_EXISTS[1]);
  return err;
};

/**
 * Bills an order from the POS (utils/billing.js billOrder): applies an optional loyalty reward,
 * records payment, closes the order, frees the table and awards the loyalty stamp.
 * The totals are worked out here; the write happens atomically in the bill_order SQL function,
 * which re-checks the order version, status and reward under row locks.
 */
export async function billOrder({ orderId, restaurant, paymentMode, rewardId, user }: {
  orderId: string;
  restaurant: RestaurantRow;
  paymentMode: unknown;
  rewardId: string | null;
  user: StaffRow;
}) {
  const mode = String(paymentMode || '').toLowerCase();
  if (!PAYMENT_MODES.includes(mode)) throw new ApiError(400, 'Choose cash, UPI or card as the payment mode');

  // One read of the order and its items, so the totals and `version` describe the same state
  const row = await getOrderRow(orderId, restaurant.id);
  if (!row) throw new ApiError(404, 'Order not found');
  const order = orderDoc(row);
  const version: number = row.version;
  if (['completed', 'cancelled'].includes(order.status)) throw new ApiError(409, 'This order is already billed or cancelled');
  if (!order.items.length) throw new ApiError(400, 'This order has no items');

  let customer = order.customerId ? await getCustomerById(order.customerId) : null;
  const settings = await getLoyaltySettings(restaurant.id);

  let reward: (NonNullable<typeof customer>['rewards'][number]) | null = null;
  if (rewardId) {
    if (!customer) throw new ApiError(400, 'Rewards can only be applied to orders linked to a customer');
    await syncRewards(customer._id);
    customer = await getCustomerById(customer._id);
    reward = customer?.rewards.find(r => r.status === 'available' && (r.rewardId === rewardId || r._id === rewardId)) || null;
    if (!reward) throw new ApiError(400, 'That reward is not available for this customer');
  }

  const subtotal = order.totalAmount;
  const gstRate = restaurant.gst_rate === null || restaurant.gst_rate === undefined ? 5 : Number(restaurant.gst_rate);
  const totals = computeTotals(subtotal, gstRate, rewardDiscount(reward, subtotal));
  const minSpend = settings.minSpendForStamp ?? 200;

  let result: { bill_id: string; stamp_earned: number; customer_id: string | null; customer_total_stamps: number | null; newly_unlocked: string[] };
  try {
    result = await rpc('bill_order', {
      p: {
        order_id: order._id,
        restaurant_id: restaurant.id,
        expected_version: version,
        payment_mode: mode,
        reward_row_id: reward?._id || null,
        subtotal: totals.subtotal,
        discount_amount: totals.discountAmount,
        gst_rate: totals.gstRate,
        gst_amount: totals.gstAmount,
        total_amount: totals.totalAmount,
        award_stamp: Boolean(customer) && totals.totalAmount >= minSpend,
        billed_by: user.id,
        billed_by_name: user.name || '',
        bill_day: localDay(),
      },
    });
  } catch (err) {
    throw sqlError(err);
  }

  const bill = await getBill(result.bill_id, restaurant.id);
  const closedOrder = await getOrder(order._id, restaurant.id);
  const updatedCustomer = result.customer_id ? await getCustomerById(result.customer_id) : null;

  await broadcast([
    ...(closedOrder ? orderMessages('order-status-updated', closedOrder) : []),
    staffMessage(restaurant.id, 'table-updated'),
    staffMessage(restaurant.id, 'bill-created', bill),
    ...(updatedCustomer ? [customerMessage(updatedCustomer)] : []),
  ]);

  return {
    bill: bill!,
    customer: updatedCustomer,
    stampEarned: result.stamp_earned,
    newlyUnlocked: result.newly_unlocked || [],
  };
}
