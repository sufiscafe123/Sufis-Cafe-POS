import { requireAdmin } from '@/server/auth';
import { db, must } from '@/server/db';
import { ApiError, isUuid, json, readBody, route } from '@/server/http';
import { staffDoc } from '@/server/mappers';
import { ROLES } from '@/server/validate';

// Effectively "forever": a deactivated account can't sign in or refresh its session.
const BAN_FOREVER = '876000h';

export const PUT = route(async (req, { id }) => {
  const ctx = await requireAdmin();
  const body = await readBody(req);
  const isSelf = id === ctx.user.id;
  if (!isUuid(id)) throw new ApiError(404, 'User not found');

  const target = must(await db().from('staff').select('*').eq('id', id).eq('restaurant_id', ctx.restaurantId).maybeSingle());
  if (!target) throw new ApiError(404, 'User not found');

  const updates: Record<string, unknown> = {};
  const authUpdates: Record<string, unknown> = {};

  if (body.name !== undefined) updates.name = String(body.name).trim();
  if (body.email !== undefined) {
    const email = String(body.email).toLowerCase().trim();
    const { data: taken } = await db().from('staff').select('id').ilike('email', email.replace(/[\\%_]/g, '\\$&')).neq('id', id).limit(1);
    if (taken?.length) throw new ApiError(400, 'Email already exists');
    updates.email = email;
    if (email !== target.email) {
      authUpdates.email = email;
      authUpdates.email_confirm = true;
    }
  }
  if (body.role !== undefined) {
    if (!ROLES.includes(body.role)) throw new ApiError(400, 'Choose a valid role');
    if (isSelf && body.role !== 'admin') throw new ApiError(400, 'You cannot remove your own admin role');
    updates.role = body.role;
    authUpdates.app_metadata = { role: body.role, restaurant_id: ctx.restaurantId };
  }
  if (body.active !== undefined) {
    if (isSelf && !body.active) throw new ApiError(400, 'You cannot deactivate your own account');
    updates.active = Boolean(body.active);
    authUpdates.ban_duration = body.active ? 'none' : BAN_FOREVER;
  }
  if (body.password) {
    if (String(body.password).length < 8) throw new ApiError(400, 'Password must be at least 8 characters');
    authUpdates.password = String(body.password);
  }

  if (Object.keys(authUpdates).length) {
    const { error } = await db().auth.admin.updateUserById(id, authUpdates);
    if (error) {
      if (/already|exists/i.test(error.message)) throw new ApiError(400, 'Email already exists');
      throw new ApiError(400, error.message);
    }
  }

  const row = Object.keys(updates).length
    ? must(await db().from('staff').update(updates).eq('id', id).eq('restaurant_id', ctx.restaurantId).select('*').single())
    : target;
  return json(staffDoc(row));
}, 400);

export const DELETE = route(async (_req, { id }) => {
  const ctx = await requireAdmin();
  if (id === ctx.user.id) throw new ApiError(400, 'You cannot delete your own account');
  if (isUuid(id)) {
    const target = must(await db().from('staff').select('id').eq('id', id).eq('restaurant_id', ctx.restaurantId).maybeSingle());
    // Deleting the Auth user removes the staff profile too (on delete cascade) and ends their sessions
    if (target) {
      const { error } = await db().auth.admin.deleteUser(id);
      if (error) throw new ApiError(500, error.message);
    }
  }
  return json({ message: 'User deleted' });
});
