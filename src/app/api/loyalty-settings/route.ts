import { optionalStaff, requireAdmin } from '@/server/auth';
import { db, rpc } from '@/server/db';
import { getCustomerById, getLoyaltySettings } from '@/server/data';
import { ApiError, json, readBody, route } from '@/server/http';
import { broadcast, customerMessage, publicMessage } from '@/server/realtime';
/* eslint-disable @typescript-eslint/no-explicit-any */

// Current loyalty program settings (public: the customer app shows the stamp card)
export const GET = route(async () => {
  const { restaurant } = await optionalStaff();
  return json(await getLoyaltySettings(restaurant?.id || null));
});

// Admin: update loyalty program settings (card stamps & reward milestones)
export const PUT = route(async (req) => {
  const ctx = await requireAdmin();
  const { stampsPerCard, minSpendForStamp, milestones } = await readBody(req);

  const spc = stampsPerCard && !isNaN(stampsPerCard) ? Math.max(2, Math.min(24, parseInt(stampsPerCard, 10))) : null;
  const minSpend = minSpendForStamp !== undefined && minSpendForStamp !== null && !isNaN(minSpendForStamp)
    ? Math.max(0, parseInt(minSpendForStamp, 10))
    : null;

  let cleanMilestones: any[] | null = null;
  if (Array.isArray(milestones)) {
    // Rewards are free food / drink items handed over at the counter (no bill discounts)
    cleanMilestones = milestones.slice(0, 20).map((m: any, idx: number) => {
      const rewardType = 'free_item';
      const rewardValue = 0;
      return {
        milestoneId: m?.milestoneId || `milestone_${Date.now()}_${idx}`,
        requiredStamps: Math.max(1, parseInt(m?.requiredStamps, 10) || 1),
        title: String(m?.title || 'Special Reward').trim().slice(0, 60),
        description: String(m?.description || '').trim().slice(0, 200),
        rewardType,
        rewardValue,
        icon: m?.icon || '🎁',
        isActive: m?.isActive !== false,
      };
    }).sort((a, b) => a.requiredStamps - b.requiredStamps);
    if (cleanMilestones.length === 0) throw new ApiError(400, 'Keep at least one reward milestone');
  }

  // Saves the settings and re-syncs every customer's reward tiers in one transaction
  await rpc('update_loyalty_settings', {
    p_restaurant_id: ctx.restaurantId,
    p_stamps_per_card: spc,
    p_min_spend: minSpend,
    p_milestones: cleanMilestones,
  });
  const settings = await getLoyaltySettings(ctx.restaurantId);

  // Live update for every customer app; loyalty settings are public
  const { data: active } = await db().from('customers').select('id').eq('restaurant_id', ctx.restaurantId).not('active_table', 'is', null);
  const customers = await Promise.all((active || []).map(c => getCustomerById(c.id)));
  await broadcast([
    ...customers.filter(Boolean).map(c => customerMessage(c!)),
    publicMessage(ctx.restaurantId, 'loyalty-settings-updated', settings),
  ]);

  return json({ success: true, message: 'Loyalty program settings updated successfully!', settings });
});
