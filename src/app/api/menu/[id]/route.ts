import { requireAdmin } from '@/server/auth';
import { db } from '@/server/db';
import { ApiError, isUuid, json, readBody, route } from '@/server/http';
import { menuItemDoc } from '@/server/mappers';
import { broadcast, publicMessage } from '@/server/realtime';
import { escapeLike } from '@/server/validate';
import { menuFields, validPrice } from '../shared';

export const PUT = route(async (req, { id }) => {
  const ctx = await requireAdmin();
  if (!isUuid(id)) throw new ApiError(404, 'Item not found');
  const body = await readBody(req);
  if (body.price !== undefined && !validPrice(body.price)) throw new ApiError(400, 'Enter a valid price');

  const update: Record<string, unknown> = menuFields(body);
  if (update.category === '') throw new ApiError(400, 'Category is required');
  if (body.name) {
    const trimmedName = String(body.name).trim();
    const { data: existing } = await db().from('menu_items').select('id')
      .eq('restaurant_id', ctx.restaurantId).neq('id', id).ilike('name', escapeLike(trimmedName)).limit(1);
    if (existing?.length) throw new ApiError(400, 'A menu item with this name already exists');
    update.name = trimmedName;
  }

  const { data, error } = await db().from('menu_items').update(update)
    .eq('id', id).eq('restaurant_id', ctx.restaurantId).select('*').maybeSingle();
  if (error) throw new ApiError(400, error.message);
  if (!data) throw new ApiError(404, 'Item not found');

  const item = menuItemDoc(data);
  await broadcast([publicMessage(ctx.restaurantId, 'menu-updated', item)]);
  return json(item);
}, 400);

export const DELETE = route(async (_req, { id }) => {
  const ctx = await requireAdmin();
  if (isUuid(id)) {
    await db().from('menu_items').delete().eq('id', id).eq('restaurant_id', ctx.restaurantId);
  }
  await broadcast([publicMessage(ctx.restaurantId, 'menu-updated')]);
  return json({ message: 'Item deleted' });
});
