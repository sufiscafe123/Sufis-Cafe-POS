import 'server-only';
import { redirect, unstable_rethrow } from 'next/navigation';
import { lookupStaff } from './auth';
import { restaurantInfo, staffUser } from './mappers';

// Session for the root layout (null when signed out or Supabase isn't configured yet).
export async function currentSession() {
  try {
    const res = await lookupStaff();
    if (!res.ok) return null;
    return { user: staffUser(res.ctx.user), restaurant: restaurantInfo(res.ctx.restaurant) };
  } catch (err) {
    unstable_rethrow(err); // let Next.js handle its own control-flow errors
    console.error('Could not read the staff session:', err);
    return null;
  }
}

// Server-side route protection for the staff areas (ProtectedRoute in App.js).
export async function requirePageRole(roles: string[]) {
  const session = await currentSession();
  if (!session) redirect('/login');
  if (!roles.includes(session.user.role)) redirect('/');
  return session;
}

export function homeFor(role: string) {
  return role === 'admin' ? '/admin/dashboard' : role === 'waiter' ? '/waiter/tables' : '/kitchen/orders';
}
