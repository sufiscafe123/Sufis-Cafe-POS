import { requireAdmin } from '@/server/auth';
import { db, fetchAll } from '@/server/db';
import { env } from '@/server/env';
import { json, route } from '@/server/http';
import { zonedMidnight, zonedToday } from '@/server/time';

// Bills and revenue per calendar day of a year (restaurant's local dates), for the
// monthly Excel report. Only days with at least one bill are returned.
export const GET = route(async (req) => {
  const ctx = await requireAdmin();
  const tz = env.timeZone;
  const year = parseInt(req.nextUrl.searchParams.get('year') || '', 10) || zonedToday(tz).y;
  const start = zonedMidnight(year, 1, 1, tz);
  const end = zonedMidnight(year + 1, 1, 1, tz);

  const bills = await fetchAll<{ created_at: string; total_amount: number; payment_mode: 'cash' | 'upi' | 'card' }>((from, to) => db()
    .from('bills').select('created_at, total_amount, payment_mode')
    .eq('restaurant_id', ctx.restaurantId)
    .gte('created_at', start.toISOString()).lt('created_at', end.toISOString())
    .order('created_at').range(from, to));

  const dayOf = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const days = new Map<string, { date: string; bills: number; revenue: number; cash: number; upi: number; card: number }>();
  for (const b of bills) {
    const date = dayOf.format(new Date(b.created_at)); // YYYY-MM-DD
    const row = days.get(date) || { date, bills: 0, revenue: 0, cash: 0, upi: 0, card: 0 };
    const amount = Number(b.total_amount) || 0;
    row.bills += 1;
    row.revenue += amount;
    if (b.payment_mode in row) row[b.payment_mode] += amount;
    days.set(date, row);
  }
  return json({ year, days: [...days.values()] });
});
