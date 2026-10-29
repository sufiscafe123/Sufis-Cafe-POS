import { db } from '@/server/db';
import { json } from '@/server/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  let ok = false;
  try {
    const { error } = await db().from('restaurants').select('id', { head: true, count: 'exact' });
    ok = !error;
  } catch {
    ok = false;
  }
  return json({ status: 'ok', db: ok ? 'connected' : 'disconnected', time: new Date().toISOString() });
}
