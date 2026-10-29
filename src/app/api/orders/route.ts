import { clientIp, ApiError, json, readBody, route, isUuid } from '@/server/http';
import { requireStaffOrCustomer } from '@/server/auth';
import { db, must, rpc } from '@/server/db';
import { ACTIVE_STATUSES_FILTER, ORDER_SELECT, getOrder } from '@/server/data';
import { orderDoc, publicOrder } from '@/server/mappers';
import { priceItems } from '@/server/orders';
import { rateLimit } from '@/server/rateLimit';
import { broadcast, orderMessages, staffMessage } from '@/server/realtime';
import { toPositiveInt } from '@/server/validate';
/* eslint-disable @typescript-eslint/no-explicit-any */

// List orders. Staff see everything; a customer only sees their own table's open orders.
export const GET = route(async (req) => {
  const ctx = await requireStaffOrCustomer(req);
  const sp = req.nextUrl.searchParams;
  let q = db().from('orders').select(ORDER_SELECT).eq('restaurant_id', ctx.restaurantId);

  if (ctx.kind === 'customer') {
    q = q.eq('table_number', ctx.tableNumber).not('status', 'in', ACTIVE_STATUSES_FILTER);
  } else if (sp.get('active') === 'true') {
    q = q.not('status', 'in', ACTIVE_STATUSES_FILTER);
  } else if (sp.get('status')) {
    q = q.eq('status', String(sp.get('status')));
  }
  if (ctx.kind === 'staff') {
    if (sp.get('tableNumber')) {
      const n = parseInt(sp.get('tableNumber')!, 10);
      q = Number.isFinite(n) ? q.eq('table_number', n) : q.is('table_number', null);
    }
    if (sp.get('orderType')) q = q.eq('order_type', String(sp.get('orderType')));
  }

  const rows = must(await q.order('created_at', { ascending: false }).order('position', { referencedTable: 'order_items' }).limit(100));
  const orders = rows.map(orderDoc);
  if (ctx.kind === 'customer') return json(orders.map(publicOrder));

  // Staff: attach the bill of each billed order (Bill No + how it was paid) for the Orders screen
  const billed = orders.filter(o => o.status === 'completed').map(o => o._id);
  const bills = billed.length
    ? must(await db().from('bills').select('id, order_id, bill_number, daily_bill_number, payment_mode, total_amount')
        .eq('restaurant_id', ctx.restaurantId).in('order_id', billed)) as any[]
    : [];
  const byOrder = new Map(bills.map(b => [b.order_id, b]));
  return json(orders.map(o => {
    const b = byOrder.get(o._id);
    return b
      ? { ...o, bill: { _id: b.id, billNumber: b.bill_number, dailyBillNumber: b.daily_bill_number ?? null, paymentMode: b.payment_mode, totalAmount: Number(b.total_amount) } }
      : o;
  }));
});

// Create an order: waiter/admin from the POS, or a customer from the table QR app.
// A dine-in table has one open order at a time; new items are appended as a new batch.
export const POST = route(async (req) => {
  const ctx = await requireStaffOrCustomer(req);
  const body = await readBody(req);

  if (ctx.kind === 'customer') {
    await rateLimit(`order:${ctx.customerId || clientIp(req)}`, {
      windowMs: 60 * 1000,
      max: 10,
      message: 'Too many orders in a short time. Please ask the staff for help.',
    });
  } else if (ctx.user.role === 'kitchen') {
    throw new ApiError(403, 'Kitchen accounts cannot place orders');
  }

  const restaurantId = ctx.restaurantId;
  const isTakeaway = ctx.kind === 'staff' && body.orderType === 'takeaway';

  // Customers can only order for the table their QR session belongs to.
  const tableNum = isTakeaway
    ? null
    : toPositiveInt(ctx.kind === 'customer' ? ctx.tableNumber : body.tableNumber, { min: 1, max: 9999 });

  let table: any = null;
  if (!isTakeaway) {
    if (!tableNum) throw new ApiError(400, 'Table number is required for dine-in orders');
    table = must(await db().from('restaurant_tables').select('*').eq('restaurant_id', restaurantId).eq('table_number', tableNum).maybeSingle());
    if (!table) throw new ApiError(400, `Table ${tableNum} does not exist. Please ask the staff.`);
  }

  // The customer placing the order (QR app), or the one a waiter linked by phone/ID.
  let customer: any = null;
  if (ctx.kind === 'customer') {
    customer = must(await db().from('customers').select('id, name, phone, customer_code').eq('id', ctx.customerId).maybeSingle());
  } else if (body.customerId) {
    const raw = String(body.customerId);
    const q = db().from('customers').select('id, name, phone, customer_code');
    customer = must(await (isUuid(raw) ? q.or(`id.eq.${raw},customer_code.eq.${raw}`) : q.eq('customer_code', raw)).limit(1).maybeSingle());
  } else if (body.customerPhone) {
    customer = must(await db().from('customers').select('id, name, phone, customer_code')
      .eq('phone', String(body.customerPhone).trim()).order('created_at').limit(1).maybeSingle());
  }

  const items = await priceItems(body.items, restaurantId);
  const notes = String(body.notes || '').slice(0, 300);
  const customerName = String(body.customerName || customer?.name || (isTakeaway ? 'Takeaway Customer' : `Table ${tableNum} Customer`)).slice(0, 80);
  const customerPhone = String(customer?.phone || body.customerPhone || '').slice(0, 20);
  const customerCount = toPositiveInt(body.customerCount, { min: 1, max: 100 }) || 1;

  const result = await rpc<{ order_id: string; created: boolean }>('place_order', {
    p: {
      restaurant_id: restaurantId,
      is_takeaway: isTakeaway,
      table_id: table?.id || null,
      table_number: tableNum,
      customer_id: customer?.id || null,
      customer_code: customer?.customer_code || '',
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_count: customerCount,
      notes,
      takeaway_token: isTakeaway ? String(body.takeawayToken || '').slice(0, 20) : '',
      waiter_id: ctx.kind === 'staff' ? ctx.user.id : null,
      waiter_name: ctx.kind === 'staff' ? ctx.user.name : `Self QR (${customerName})`,
      items,
    },
  });

  const order = (await getOrder(result.order_id, restaurantId))!;

  if (!result.created) {
    await broadcast([...orderMessages('order-updated', order), staffMessage(restaurantId, 'table-updated')]);
    return json(ctx.kind === 'customer' ? publicOrder(order) : order, 200);
  }

  await broadcast([
    ...orderMessages('new-order', order),
    ...orderMessages('order-created', order),
    ...(table ? [staffMessage(restaurantId, 'table-updated')] : []),
  ]);
  return json(ctx.kind === 'customer' ? publicOrder(order) : order, 201);
}, 400);
