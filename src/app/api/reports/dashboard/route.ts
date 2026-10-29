import { requireStaff } from '@/server/auth';
import { rpc } from '@/server/db';
import { env } from '@/server/env';
import { json, route } from '@/server/http';
import { zonedDayRange, zonedToday } from '@/server/time';

export const GET = route(async () => {
  const ctx = await requireStaff();
  const today = zonedToday(env.timeZone);
  const { start, end } = zonedDayRange(today.y, today.m, today.d, env.timeZone);
  const s = await rpc<Record<string, number>>('report_dashboard', {
    p_restaurant_id: ctx.restaurantId, p_start: start.toISOString(), p_end: end.toISOString(),
  });
  return json({
    todayRevenue: Number(s.todayRevenue || 0),
    todayOrders: Number(s.todayOrders || 0),
    todayBills: Number(s.todayBills || 0),
    activeOrders: Number(s.activeOrders || 0),
    pendingOrders: Number(s.pendingOrders || 0),
  });
});
