import { activeRestaurant } from '@/server/auth';
import { clientIp, json, readBody, route } from '@/server/http';
import { rateLimit } from '@/server/rateLimit';
import { verifyTableQrKey } from '@/server/tableLink';
import { toPositiveInt } from '@/server/validate';

// Public: does this QR link's key belong to this table (or the counter)? The login screen asks
// before showing the form, so an edited ?table= shows "Scan your table's QR code" instead.
export const POST = route(async (req) => {
  await rateLimit(`qr-check:${clientIp(req)}`, { windowMs: 15 * 60 * 1000, max: 300, message: 'Too many attempts. Please wait a few minutes.' });
  const body = await readBody(req);
  const restaurant = await activeRestaurant();
  const place = body.counter === true ? 'counter' as const : toPositiveInt(body.tableNumber, { min: 1, max: 9999 });
  const valid = Boolean(restaurant && place && verifyTableQrKey(restaurant.id, place, body.key));
  return json({ valid });
});
