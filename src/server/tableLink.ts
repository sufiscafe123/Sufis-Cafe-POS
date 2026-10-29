import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from './env';

// Each printed QR code carries a key (?k=) signed with the server secret, so a guest who
// edits ?table=7 to ?table=3 in the address bar can't check in to (and order for) table 3.
// Changing CUSTOMER_SESSION_SECRET changes every key: the QR codes must then be printed again.
export type QrPlace = number | 'counter';

export const tableQrKey = (restaurantId: string, place: QrPlace) =>
  createHmac('sha256', env.customerSessionSecret)
    .update(`table-qr:${restaurantId}:${place}`)
    .digest('base64url')
    .slice(0, 12);

export function verifyTableQrKey(restaurantId: string, place: QrPlace, key: unknown) {
  if (typeof key !== 'string' || key.length !== 12) return false;
  return timingSafeEqual(Buffer.from(key), Buffer.from(tableQrKey(restaurantId, place)));
}
