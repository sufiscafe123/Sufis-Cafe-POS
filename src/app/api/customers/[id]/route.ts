import { requireStaffOrCustomer } from '@/server/auth';
import { db, must } from '@/server/db';
import { ORDER_SELECT, findCustomer, getLoyaltySettings, seatedTable, syncRewards, tablesWithOpenOrders } from '@/server/data';
import { ApiError, json, route } from '@/server/http';
import { orderDoc, publicCustomer } from '@/server/mappers';

// Customer profile and reward progress (customer: own profile only; staff: any, with recent orders)
export const GET = route(async (req, { id }) => {
  const ctx = await requireStaffOrCustomer(req);
  if (ctx.kind === 'staff' && ctx.user.role === 'kitchen') {
    // Kitchen never needed customer profiles in the original screens; keep them out.
    throw new ApiError(403, 'Not authorized');
  }
  const found = await findCustomer(id);
  if (!found || (ctx.kind === 'customer' && found._id !== ctx.customerId)) throw new ApiError(404, 'Customer not found');

  await getLoyaltySettings(ctx.restaurantId);
  await syncRewards(found._id);
  const customer = (await findCustomer(found._id))!;

  if (ctx.kind === 'customer') return json(publicCustomer(customer));

  // Populated orders: newest 20
  const orderIds = customer.orders;
  const orders = orderIds.length
    ? must(await db().from('orders').select(ORDER_SELECT).in('id', orderIds.slice(-500))
        .order('created_at', { ascending: false }).limit(20)).map(orderDoc)
    : [];
  const openTables = await tablesWithOpenOrders(ctx.restaurantId);
  return json({ ...customer, activeTable: seatedTable(customer.activeTable, openTables), orders });
});
