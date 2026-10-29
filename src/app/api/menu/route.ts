import { optionalStaff, requireAdmin } from '@/server/auth';
import { db, fetchAll, must } from '@/server/db';
import { ApiError, json, readBody, route } from '@/server/http';
import { menuItemDoc } from '@/server/mappers';
import { broadcast, publicMessage } from '@/server/realtime';
import { escapeLike } from '@/server/validate';
import { menuFields, validPrice } from './shared';

export const GET = route(async (req) => {
  const { staff, restaurant } = await optionalStaff();
  if (!restaurant) return json([]);
  const sp = req.nextUrl.searchParams;

  const rows = await fetchAll((from, to) => {
    let q = db().from('menu_items').select('*').eq('restaurant_id', restaurant.id);
    if (sp.get('category')) q = q.eq('category', sp.get('category')!);
    if (sp.get('available')) q = q.eq('available', sp.get('available') === 'true');
    // Customers (no staff login) only ever see dishes that can be ordered
    if (!staff) q = q.eq('available', true);
    if (sp.get('isVeg') !== null) q = q.eq('is_veg', sp.get('isVeg') === 'true');
    return q.order('category').order('name').range(from, to);
  });
  return json(rows.map(menuItemDoc));
});

export const POST = route(async (req) => {
  const ctx = await requireAdmin();
  const body = await readBody(req);
  const trimmedName = String(body.name || '').trim();
  if (!trimmedName) throw new ApiError(400, 'Item name is required');
  if (!validPrice(body.price)) throw new ApiError(400, 'Enter a valid price');

  const { data: existing } = await db().from('menu_items').select('id')
    .eq('restaurant_id', ctx.restaurantId).ilike('name', escapeLike(trimmedName)).limit(1);
  if (existing?.length) throw new ApiError(400, 'A menu item with this name already exists');

  const fields = menuFields(body);
  if (!fields.category) throw new ApiError(400, 'Category is required');
  const row = must(await db().from('menu_items')
    .insert({ ...fields, name: trimmedName, restaurant_id: ctx.restaurantId })
    .select('*').single());
  const item = menuItemDoc(row);
  await broadcast([publicMessage(ctx.restaurantId, 'menu-updated', item)]);
  return json(item, 201);
}, 400);
