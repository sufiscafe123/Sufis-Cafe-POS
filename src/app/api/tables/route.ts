import { requireAdmin, requireStaff } from '@/server/auth';
import { db, must } from '@/server/db';
import { ApiError, json, readBody, route } from '@/server/http';
import { tableDoc } from '@/server/mappers';
import { broadcast, staffMessage } from '@/server/realtime';
import { toPositiveInt } from '@/server/validate';

export const GET = route(async () => {
  const ctx = await requireStaff();
  const rows = must(await db().from('restaurant_tables').select('*').eq('restaurant_id', ctx.restaurantId).order('table_number'));
  return json(rows.map(tableDoc));
});

export const POST = route(async (req) => {
  const ctx = await requireAdmin();
  const body = await readBody(req);
  const tableNumber = toPositiveInt(body.tableNumber, { min: 1, max: 9999 });
  if (!tableNumber) throw new ApiError(400, 'Enter a valid table number');

  const { data: existing } = await db().from('restaurant_tables').select('id')
    .eq('restaurant_id', ctx.restaurantId).eq('table_number', tableNumber).maybeSingle();
  if (existing) throw new ApiError(400, `Table ${tableNumber} already exists`);

  const { data, error } = await db().from('restaurant_tables').insert({
    restaurant_id: ctx.restaurantId,
    table_number: tableNumber,
    capacity: toPositiveInt(body.capacity, { min: 1, max: 50 }) || 4,
  }).select('*').single();
  if (error) {
    if (error.code === '23505') throw new ApiError(400, `Table ${tableNumber} already exists`);
    throw new ApiError(400, error.message);
  }
  const table = tableDoc(data);
  await broadcast([staffMessage(ctx.restaurantId, 'table-updated', table)]);
  return json(table, 201);
}, 400);
