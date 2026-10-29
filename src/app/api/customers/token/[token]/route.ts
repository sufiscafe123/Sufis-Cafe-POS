import { requireStaffNotKitchen } from '@/server/auth';
import { db } from '@/server/db';
import { getCustomerById, getLoyaltySettings, syncRewards } from '@/server/data';
import { ApiError, json, route } from '@/server/http';

// Staff: look up a customer by the reward QR shown on their phone
export const GET = route(async (_req, { token }) => {
  const ctx = await requireStaffNotKitchen();
  const { data } = await db().from('customers').select('id').eq('reward_token', String(token)).maybeSingle();
  if (!data) throw new ApiError(404, 'Invalid or expired customer reward QR code');
  await getLoyaltySettings(ctx.restaurantId);
  await syncRewards(data.id);
  return json(await getCustomerById(data.id));
});
