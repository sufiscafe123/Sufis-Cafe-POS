import { createSupabaseServerClient } from '@/lib/supabase/server';
import { db } from '@/server/db';
import { ApiError, clientIp, json, readBody, route } from '@/server/http';
import { rateLimit } from '@/server/rateLimit';
import { restaurantInfo, staffUser } from '@/server/mappers';

// Staff login. Public self-signup does not exist: the restaurant and its first admin are
// created with `npm run create-admin` (scripts/create-admin.mjs).
export const POST = route(async (req) => {
  const { email, password } = await readBody(req);
  if (!email || !password) throw new ApiError(400, 'Email and password are required');
  const cleanEmail = String(email).toLowerCase().trim();

  // 10 attempts per email+IP every 15 minutes slows down password guessing.
  await rateLimit(`login:${clientIp(req)}:${cleanEmail}`, {
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Too many login attempts. Please wait 15 minutes and try again.',
  });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password: String(password) });
  if (error || !data.user) {
    if (error?.code === 'user_banned') throw new ApiError(400, 'Account is deactivated');
    // Network failure reaching Supabase Auth — not the user's fault
    if (error && (error.name === 'AuthRetryableFetchError' || !error.status)) {
      throw new ApiError(503, 'The login service is unreachable. Please try again in a moment.');
    }
    throw new ApiError(400, 'Invalid credentials');
  }

  const { data: staff } = await db()
    .from('staff')
    .select('*, restaurants(*)')
    .eq('id', data.user.id)
    .maybeSingle();

  const fail = async (status: number, message: string) => {
    await supabase.auth.signOut({ scope: 'local' });
    throw new ApiError(status, message);
  };
  if (!staff) return fail(400, 'Invalid credentials');
  if (!staff.active) return fail(400, 'Account is deactivated');
  if (!staff.restaurants || !staff.restaurants.active) {
    return fail(403, 'This restaurant account is inactive. Please contact support.');
  }

  // The session lives in httpOnly-refreshed Supabase cookies; POS terminals stay signed in.
  // A staff member who leaves is still locked out immediately: every request re-checks the account.
  return json({ user: staffUser(staff), restaurant: restaurantInfo(staff.restaurants) });
});
