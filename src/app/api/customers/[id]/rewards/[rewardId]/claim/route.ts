import { requireStaffNotKitchen } from '@/server/auth';
import { db } from '@/server/db';
import { findCustomer } from '@/server/data';
import { ApiError, isUuid, json, route } from '@/server/http';
import { broadcast, customerMessage, staffMessage } from '@/server/realtime';

// Counter staff hand over a free item the customer earned. The reward is claimed once:
// the update only matches while it is still available, so a double tap can't claim it twice.
export const POST = route(async (_req, { id, rewardId }) => {
  const ctx = await requireStaffNotKitchen();
  const customer = await findCustomer(id);
  if (!customer) throw new ApiError(404, 'Customer not found');
  if (!isUuid(rewardId)) throw new ApiError(404, 'Reward not found');

  const { data: claimed, error } = await db().from('customer_rewards')
    .update({ status: 'redeemed', redeemed_at: new Date().toISOString() })
    .eq('id', rewardId).eq('customer_id', customer._id).eq('status', 'available')
    .select('id, title').maybeSingle();
  if (error) throw new ApiError(400, error.message);
  if (!claimed) {
    const existing = customer.rewards.find(r => r._id === rewardId);
    if (!existing) throw new ApiError(404, 'Reward not found');
    throw new ApiError(409, existing.status === 'redeemed'
      ? `${existing.title} was already claimed`
      : `${existing.title} is not unlocked yet`);
  }

  const updated = (await findCustomer(customer._id))!;
  await broadcast([
    customerMessage(updated),
    staffMessage(ctx.restaurantId, 'reward-claimed', { customerId: updated.customerId, name: updated.name, reward: claimed.title }),
  ]);
  return json({ success: true, message: `${claimed.title} claimed for ${updated.name}`, customer: updated });
});
