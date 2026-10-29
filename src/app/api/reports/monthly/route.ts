import { requireAdmin } from '@/server/auth';
import { rpc } from '@/server/db';
import { env } from '@/server/env';
import { json, route } from '@/server/http';
import { zonedToday } from '@/server/time';

export const GET = route(async (req) => {
  const ctx = await requireAdmin();
  const year = parseInt(req.nextUrl.searchParams.get('year') || '', 10) || zonedToday(env.timeZone).y;
  const rows = await rpc<{ month: string; revenue: number; orders: number }[]>('report_monthly', {
    p_restaurant_id: ctx.restaurantId, p_year: year, p_tz: env.timeZone,
  });
  const monthlyData = (rows || []).map(r => ({ month: r.month, revenue: Number(r.revenue || 0), orders: Number(r.orders || 0) }));
  return json({ year, monthlyData });
});
