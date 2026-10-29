import { requireAdmin } from '@/server/auth';
import { db, must } from '@/server/db';
import { json, route } from '@/server/http';
import { tableQrKey } from '@/server/tableLink';

// Admin: the signed keys that go into each table's QR link (and the counter's).
export const GET = route(async () => {
  const ctx = await requireAdmin();
  const rows = must(await db().from('restaurant_tables').select('table_number').eq('restaurant_id', ctx.restaurantId));
  const keys: Record<string, string> = { counter: tableQrKey(ctx.restaurantId, 'counter') };
  for (const r of rows) keys[r.table_number] = tableQrKey(ctx.restaurantId, r.table_number);
  return json({ keys });
});
