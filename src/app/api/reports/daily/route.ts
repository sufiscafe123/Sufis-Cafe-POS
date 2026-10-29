import { requireAdmin } from '@/server/auth';
import { db, fetchAll, rpc } from '@/server/db';
import { BILL_SELECT } from '@/server/data';
import { env } from '@/server/env';
import { json, route } from '@/server/http';
import { billDoc } from '@/server/mappers';
import { parseDateParam, zonedDayRange, zonedToday } from '@/server/time';
/* eslint-disable @typescript-eslint/no-explicit-any */

export const GET = route(async (req) => {
  const ctx = await requireAdmin();
  const tz = env.timeZone;
  // "2026-10-27" is a calendar day in the restaurant's timezone
  const day = parseDateParam(req.nextUrl.searchParams.get('date')) || zonedToday(tz);
  const { start, end } = zonedDayRange(day.y, day.m, day.d, tz);

  const [summary, bills] = await Promise.all([
    rpc<any>('report_daily', { p_restaurant_id: ctx.restaurantId, p_start: start.toISOString(), p_end: end.toISOString() }),
    fetchAll((from, to) => db().from('bills').select(BILL_SELECT)
      .eq('restaurant_id', ctx.restaurantId)
      .gte('created_at', start.toISOString()).lt('created_at', end.toISOString())
      .order('created_at').range(from, to)),
  ]);

  const n = (v: unknown) => Number(v || 0);
  return json({
    date: start.toISOString(),
    totalRevenue: n(summary.totalRevenue),
    totalDiscount: n(summary.totalDiscount),
    totalGst: n(summary.totalGst),
    totalOrders: n(summary.totalOrders),
    completedOrders: n(summary.completedOrders),
    topItems: (summary.topItems || []).map((t: any) => ({ name: t.name, quantity: n(t.quantity), revenue: n(t.revenue) })),
    paymentBreakdown: {
      cash: n(summary.paymentBreakdown?.cash),
      upi: n(summary.paymentBreakdown?.upi),
      card: n(summary.paymentBreakdown?.card),
    },
    bills: bills.map(billDoc),
  });
});
