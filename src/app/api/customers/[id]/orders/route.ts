import { requireStaffOrCustomer } from '@/server/auth';
import { computeTotals } from '@/server/billing';
import { db, must } from '@/server/db';
import { ORDER_SELECT, findCustomer } from '@/server/data';
import { env } from '@/server/env';
import { ApiError, json, route } from '@/server/http';
import { orderDoc } from '@/server/mappers';
/* eslint-disable @typescript-eslint/no-explicit-any */

// Customer's dining history with matching bills
export const GET = route(async (req, { id }) => {
  const ctx = await requireStaffOrCustomer(req);
  const customer = await findCustomer(id);
  if (!customer || (ctx.kind === 'customer' && customer._id !== ctx.customerId)) throw new ApiError(404, 'Customer not found');

  const ors = [`customer_id.eq.${customer._id}`, `customer_code.eq.${customer.customerId}`];
  const linked = customer.orders.slice(-200);
  if (linked.length) ors.push(`id.in.(${linked.join(',')})`);
  const orders = must(await db().from('orders').select(ORDER_SELECT)
    .eq('restaurant_id', ctx.restaurantId).or(ors.join(','))
    .order('created_at', { ascending: false }).limit(30)).map(orderDoc);

  const bills: any[] = orders.length
    ? must(await db().from('bills').select('*').eq('restaurant_id', ctx.restaurantId).in('order_id', orders.map(o => o._id)))
    : [];
  const gstRate = ctx.restaurant.gst_rate === null ? 5 : Number(ctx.restaurant.gst_rate);
  const tz = env.timeZone;
  const dayKey = (d: Date) => d.toLocaleDateString('en-IN', { timeZone: tz });

  const orderHistory = orders.map(order => {
    const bill = bills.find(b => b.order_id === order._id);
    const estimate = computeTotals(order.totalAmount, gstRate, 0);
    const d = new Date(order.createdAt);
    const isToday = dayKey(new Date()) === dayKey(d);
    const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: tz });
    const dateStr = isToday
      ? `Today, ${timeStr}`
      : `${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: tz })}, ${timeStr}`;
    const statusLabel = bill || order.status === 'completed'
      ? 'Paid'
      : order.status === 'cancelled' ? 'Cancelled'
      : order.status.charAt(0).toUpperCase() + order.status.slice(1);

    return {
      id: `#${order.orderNumber}`,
      orderNumber: order.orderNumber,
      date: dateStr,
      rawDate: order.createdAt,
      table: order.tableNumber,
      orderType: order.orderType,
      amount: bill ? Number(bill.total_amount) : estimate.totalAmount,
      subtotal: bill ? Number(bill.subtotal) : order.totalAmount,
      tax: bill ? Number(bill.gst_amount) : estimate.gstAmount,
      discount: bill ? Number(bill.discount_amount) || 0 : 0,
      paymentMethod: bill ? String(bill.payment_mode).toUpperCase() : '',
      status: statusLabel,
      items: order.items.map(i => ({ name: i.name, qty: i.quantity, price: i.price, notes: i.notes || '' })),
    };
  });

  return json({ success: true, orders: orderHistory });
});
