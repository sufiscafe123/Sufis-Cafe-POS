import { requireAdmin, requireStaffNotKitchen } from '@/server/auth';
import { db, must } from '@/server/db';
import { ApiError, isUuid, json, readBody, route } from '@/server/http';
import { tableDoc } from '@/server/mappers';
import { broadcast, staffMessage } from '@/server/realtime';
import { toPositiveInt } from '@/server/validate';

async function loadTable(id: string, restaurantId: string) {
  if (!isUuid(id)) return null;
  return must(await db().from('restaurant_tables').select('*').eq('id', id).eq('restaurant_id', restaurantId).maybeSingle());
}

// Staff can change capacity or mark a table reserved/free. Occupancy itself is managed by orders and billing.
export const PUT = route(async (req, { id }) => {
  const ctx = await requireStaffNotKitchen();
  const body = await readBody(req);
  const table = await loadTable(id, ctx.restaurantId);
  if (!table) throw new ApiError(404, 'Table not found');

  const update: Record<string, unknown> = {};
  if (body.capacity !== undefined) {
    const capacity = toPositiveInt(body.capacity, { min: 1, max: 50 });
    if (!capacity) throw new ApiError(400, 'Capacity must be between 1 and 50');
    update.capacity = capacity;
  }
  if (body.status !== undefined) {
    if (!['available', 'occupied', 'reserved'].includes(body.status)) throw new ApiError(400, 'Invalid table status');
    if (table.current_order_id && body.status !== 'occupied') {
      throw new ApiError(400, 'This table has an open order. Bill or cancel it first.');
    }
    update.status = body.status;
  }

  // Conditional update: refuse if an order was opened on the table in the meantime
  let q = db().from('restaurant_tables').update(update).eq('id', table.id);
  if (update.status && update.status !== 'occupied') q = q.is('current_order_id', null);
  const { data } = await q.select('*').maybeSingle();
  if (!data) throw new ApiError(400, 'This table has an open order. Bill or cancel it first.');

  const doc = tableDoc(data);
  await broadcast([staffMessage(ctx.restaurantId, 'table-updated', doc)]);
  return json(doc);
}, 400);

export const DELETE = route(async (_req, { id }) => {
  const ctx = await requireAdmin();
  const table = await loadTable(id, ctx.restaurantId);
  if (!table) throw new ApiError(404, 'Table not found');
  if (table.current_order_id) throw new ApiError(400, 'This table has an open order. Bill or cancel it first.');
  const { data } = await db().from('restaurant_tables').delete().eq('id', table.id).is('current_order_id', null).select('id');
  if (!data?.length) throw new ApiError(400, 'This table has an open order. Bill or cancel it first.');
  await broadcast([staffMessage(ctx.restaurantId, 'table-updated')]);
  return json({ message: 'Table deleted' });
});
