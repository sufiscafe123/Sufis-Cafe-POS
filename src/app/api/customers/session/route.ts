import { randomBytes } from 'node:crypto';
import { activeRestaurant, signCustomerToken } from '@/server/auth';
import { db, rpc } from '@/server/db';
import { getCustomerById } from '@/server/data';
import { ApiError, clientIp, json, readBody, route } from '@/server/http';
import { publicCustomer } from '@/server/mappers';
import { rateLimit } from '@/server/rateLimit';
import { grantCustomerTopics } from '@/server/realtime';
import { verifyTableQrKey } from '@/server/tableLink';
import { normalizePhone, toPositiveInt } from '@/server/validate';

// Customer check-in from the table QR code. Identifies or creates the profile and
// returns a session token tied to that table.
export const POST = route(async (req) => {
  // Generous per-IP limit: many guests may share the restaurant's Wi-Fi (one public IP).
  await rateLimit(`session:${clientIp(req)}`, { windowMs: 15 * 60 * 1000, max: 150, message: 'Too many attempts. Please wait a few minutes.' });

  const body = await readBody(req);
  const cleanName = String(body.name || '').trim().slice(0, 60);
  const cleanPhone = normalizePhone(body.phone);
  // Counter QR: no table. The guest only uses loyalty (stamps / rewards); the captain takes the order.
  const atCounter = body.counter === true || body.tableNumber === 'counter';
  const tableNumber = atCounter ? null : toPositiveInt(body.tableNumber, { min: 1, max: 9999 });

  if (!cleanName) throw new ApiError(400, 'Please enter your name');
  if (!cleanPhone) throw new ApiError(400, 'Please enter a valid 10-digit phone number');
  if (!atCounter && !tableNumber) throw new ApiError(400, 'Please scan the QR code on your table');

  const restaurant = await activeRestaurant();
  if (!restaurant) throw new ApiError(503, 'The restaurant is not accepting orders right now');

  // The table (or counter) must come with the key printed in its QR code
  if (!verifyTableQrKey(restaurant.id, atCounter ? 'counter' : tableNumber!, body.key)) {
    throw new ApiError(400, atCounter
      ? 'This QR code is not valid. Please scan the QR code at the counter.'
      : 'This QR code is not valid. Please scan the QR code on your table.');
  }

  if (!atCounter) {
    const { data: table } = await db().from('restaurant_tables').select('id')
      .eq('restaurant_id', restaurant.id).eq('table_number', tableNumber).maybeSingle();
    if (!table) throw new ApiError(400, `Table ${tableNumber} was not found. Please ask the staff for help.`);
  }

  const customerId = await rpc<string>('customer_check_in', {
    p_restaurant_id: restaurant.id,
    p_name: cleanName,
    p_phone: cleanPhone,
    p_table_number: tableNumber,
    p_reward_token: 'RWD_' + randomBytes(12).toString('hex'),
  });
  const customer = (await getCustomerById(customerId))!;
  await grantCustomerTopics(restaurant.id, customer._id, tableNumber ?? 0);

  return json({
    success: true,
    customer: publicCustomer(customer),
    // Counter sessions carry table 0: no table orders, bills or table events
    token: await signCustomerToken(customer._id, restaurant.id, tableNumber ?? 0),
    tableNumber,
    counter: atCounter,
    restaurant: { name: restaurant.name, gstRate: restaurant.gst_rate === null ? 5 : Number(restaurant.gst_rate) },
  });
});
