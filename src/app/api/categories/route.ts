import { optionalStaff, requireAdmin } from '@/server/auth';
import { db, must, rpc } from '@/server/db';
import { ApiError, json, readBody, route } from '@/server/http';
import { categoryDoc } from '@/server/mappers';
import { broadcast, publicMessage } from '@/server/realtime';
import { escapeLike } from '@/server/validate';

// All categories (public for customers and staff); the defaults are created on first use.
export const GET = route(async () => {
  const { restaurant } = await optionalStaff();
  const restaurantId = restaurant?.id || null;
  await rpc('get_or_create_default_categories', { p_restaurant_id: restaurantId });
  let q = db().from('categories').select('*');
  q = restaurantId ? q.eq('restaurant_id', restaurantId) : q;
  const rows = must(await q.order('sort_order').order('name'));
  return json(rows.map(categoryDoc));
});

export const POST = route(async (req) => {
  const ctx = await requireAdmin();
  const { name, icon, sortOrder } = await readBody(req);
  const cleanName = String(name || '').trim();
  if (!cleanName) throw new ApiError(400, 'Category name is required');

  const { data: existing } = await db().from('categories').select('id')
    .eq('restaurant_id', ctx.restaurantId).ilike('name', escapeLike(cleanName)).limit(1);
  if (existing?.length) throw new ApiError(400, 'Category already exists');

  const { data, error } = await db().from('categories').insert({
    restaurant_id: ctx.restaurantId,
    name: cleanName,
    icon: String(icon || '🍽️').trim(),
    sort_order: parseInt(sortOrder, 10) || 0,
    is_active: true,
  }).select('*').single();
  if (error) throw new ApiError(400, error.code === '23505' ? 'Category already exists' : error.message);

  await broadcast([publicMessage(ctx.restaurantId, 'categories-updated')]);
  return json(categoryDoc(data), 201);
}, 400);
