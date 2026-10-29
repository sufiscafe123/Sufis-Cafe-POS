import { requireAdmin } from '@/server/auth';
import { db, must } from '@/server/db';
import { ApiError, isUuid, json, readBody, route } from '@/server/http';
import { categoryDoc } from '@/server/mappers';
import { broadcast, publicMessage } from '@/server/realtime';

async function loadCategory(id: string, restaurantId: string) {
  if (!isUuid(id)) return null;
  return must(await db().from('categories').select('*').eq('id', id).eq('restaurant_id', restaurantId).maybeSingle());
}

export const PUT = route(async (req, { id }) => {
  const ctx = await requireAdmin();
  const { name, icon, sortOrder, isActive } = await readBody(req);
  const category = await loadCategory(id, ctx.restaurantId);
  if (!category) throw new ApiError(404, 'Category not found');

  const oldName = category.name;
  const update: Record<string, unknown> = {};
  if (name) update.name = String(name).trim();
  if (icon) update.icon = String(icon).trim();
  if (sortOrder !== undefined) update.sort_order = parseInt(sortOrder, 10) || 0;
  if (isActive !== undefined) update.is_active = Boolean(isActive);

  const { data, error } = await db().from('categories').update(update).eq('id', category.id).select('*').single();
  if (error) throw new ApiError(400, error.code === '23505' ? 'Category already exists' : error.message);

  // If renamed, update menu items under this category
  if (name && String(name).trim() !== oldName) {
    await db().from('menu_items').update({ category: String(name).trim() })
      .eq('restaurant_id', ctx.restaurantId).eq('category', oldName);
  }

  await broadcast([
    publicMessage(ctx.restaurantId, 'categories-updated'),
    publicMessage(ctx.restaurantId, 'menu-updated'),
  ]);
  return json(categoryDoc(data));
}, 400);

export const DELETE = route(async (_req, { id }) => {
  const ctx = await requireAdmin();
  const category = await loadCategory(id, ctx.restaurantId);
  if (!category) throw new ApiError(404, 'Category not found');

  const { count } = await db().from('menu_items').select('id', { count: 'exact', head: true })
    .eq('restaurant_id', ctx.restaurantId).eq('category', category.name);
  if ((count || 0) > 0) {
    throw new ApiError(400, `Move or delete the ${count} menu item(s) in "${category.name}" first`);
  }
  await db().from('categories').delete().eq('id', category.id);

  await broadcast([publicMessage(ctx.restaurantId, 'categories-updated')]);
  return json({ message: 'Category deleted successfully' });
});
