import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '@/server/auth';
import { db } from '@/server/db';
import { env } from '@/server/env';
import { ApiError, json, readBody, route } from '@/server/http';

// Change own password
export const PUT = route(async (req) => {
  const ctx = await requireStaff();
  const { currentPassword, newPassword } = await readBody(req);
  if (!newPassword || String(newPassword).length < 8) {
    throw new ApiError(400, 'New password must be at least 8 characters');
  }

  // Verify the current password on a throwaway client so the browser session is untouched
  const verifier = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: verifyError } = await verifier.auth.signInWithPassword({
    email: ctx.user.email,
    password: String(currentPassword || ''),
  });
  if (verifyError) throw new ApiError(400, 'Current password is incorrect');
  await verifier.auth.signOut({ scope: 'local' });

  const { error } = await db().auth.admin.updateUserById(ctx.user.id, { password: String(newPassword) });
  if (error) throw new ApiError(400, error.message);
  return json({ message: 'Password changed' });
}, 500);
