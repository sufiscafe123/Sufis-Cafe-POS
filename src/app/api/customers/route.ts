import { requireStaffNotKitchen } from '@/server/auth';
import { db, must, rpc } from '@/server/db';
import { CUSTOMER_SELECT, seatedTable, tablesWithOpenOrders } from '@/server/data';
import { json, route } from '@/server/http';
import { customerDoc } from '@/server/mappers';
import { escapeLike } from '@/server/validate';
/* eslint-disable @typescript-eslint/no-explicit-any */

// Admin: all customers with search, filter and summary statistics
export const GET = route(async (req) => {
  const ctx = await requireStaffNotKitchen();
  const sp = req.nextUrl.searchParams;
  const search = String(sp.get('search') || '').trim().slice(0, 50);
  const filter = sp.get('filter');

  const [dir, openTables] = await Promise.all([
    rpc<{ ids: string[]; stats: Record<string, number> }>('customer_directory', {
      p_restaurant_id: ctx.restaurantId,
      p_search: search ? escapeLike(search) : '',
      p_filter: filter === 'active' || filter === 'rewards' ? filter : null,
      p_limit: 500,
    }),
    tablesWithOpenOrders(ctx.restaurantId),
  ]);

  const ids = dir.ids || [];
  const rows: any[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    rows.push(...must(await db().from('customers').select(CUSTOMER_SELECT).in('id', ids.slice(i, i + 100))));
  }
  const byId = new Map(rows.map(r => [r.id, r]));
  // "Currently seated" = checked in at a table that still has an open order
  let customers = ids.map(id => byId.get(id)).filter(Boolean).map(customerDoc)
    .map(c => ({ ...c, activeTable: seatedTable(c.activeTable, openTables) }));
  if (filter === 'active') customers = customers.filter(c => c.activeTable !== null);

  const { count: seatedCount } = openTables.size
    ? await db().from('customers').select('id', { count: 'exact', head: true })
        .or(`restaurant_id.eq.${ctx.restaurantId},restaurant_id.is.null`)
        .in('active_table', [...openTables])
    : { count: 0 };

  return json({
    customers,
    stats: {
      totalCustomers: Number(dir.stats.totalCustomers || 0),
      totalStampsAwarded: Number(dir.stats.totalStampsAwarded || 0),
      activeDineInCustomers: Number(seatedCount || 0),
      customersWithAvailableRewards: Number(dir.stats.customersWithAvailableRewards || 0),
    },
  });
});
