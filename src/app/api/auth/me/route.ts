import { requireStaff } from '@/server/auth';
import { json, route } from '@/server/http';
import { restaurantInfo, staffUser } from '@/server/mappers';

// Current user (also used by the app on startup to check the session is still valid)
export const GET = route(async () => {
  const ctx = await requireStaff();
  return json({ user: staffUser(ctx.user), restaurant: restaurantInfo(ctx.restaurant) });
});
