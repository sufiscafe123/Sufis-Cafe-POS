import { requireAdmin } from '@/server/auth';
import { db, must } from '@/server/db';
import { ApiError, json, readBody, route } from '@/server/http';
import { staffDoc } from '@/server/mappers';
import { ROLES } from '@/server/validate';


export const GET = route(async () => {
  const ctx = await requireAdmin();
  const rows = must(await db().from('staff').select('*').eq('restaurant_id', ctx.restaurantId));
  // sort('role name') in the original: alphabetical role, then name
  rows.sort((a: { role: string; name: string }, b: { role: string; name: string }) =>
    (a.role < b.role ? -1 : a.role > b.role ? 1 : 0) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return json(rows.map(staffDoc));
});

// Admin adds a staff account: a Supabase Auth user plus its staff profile.
export const POST = route(async (req) => {
  const ctx = await requireAdmin();
  const { name, email, password, role } = await readBody(req);
  if (!name || !email) throw new ApiError(400, 'Name and email are required');
  if (!ROLES.includes(role)) throw new ApiError(400, 'Choose a valid role');
  if (!password || String(password).length < 8) throw new ApiError(400, 'Password must be at least 8 characters');

  const cleanEmail = String(email).toLowerCase().trim();
  const { data: existing } = await db().from('staff').select('id').ilike('email', cleanEmail.replace(/[\\%_]/g, '\\$&')).limit(1);
  if (existing?.length) throw new ApiError(400, 'Email already exists');

  const { data: created, error } = await db().auth.admin.createUser({
    email: cleanEmail,
    password: String(password),
    email_confirm: true,
    app_metadata: { role, restaurant_id: ctx.restaurantId },
  });
  if (error || !created.user) {
    if (error?.code === 'email_exists' || /already/i.test(error?.message || '')) throw new ApiError(400, 'Email already exists');
    throw new ApiError(400, error?.message || 'Could not create the account');
  }

  const { data: staff, error: insertError } = await db().from('staff').insert({
    id: created.user.id,
    restaurant_id: ctx.restaurantId,
    name: String(name).trim(),
    email: cleanEmail,
    role,
  }).select('*').single();
  if (insertError) {
    await db().auth.admin.deleteUser(created.user.id);
    throw new ApiError(400, insertError.message);
  }
  return json(staffDoc(staff), 201);
}, 400);
