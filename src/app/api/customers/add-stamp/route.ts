import { requireAdmin } from '@/server/auth';
import { db, must, rpc } from '@/server/db';
import { getCustomerById, getLoyaltySettings } from '@/server/data';
import { ApiError, isUuid, json, readBody, route } from '@/server/http';
import { broadcast, customerMessage, staffMessage } from '@/server/realtime';
import { normalizePhone, toPositiveInt } from '@/server/validate';

// Admin (counter): add stamps after checking the bill, from Customers or Scan QR
export const POST = route(async (req) => {
  const ctx = await requireAdmin();
  const { token, customerId, phone, stampsToAdd } = await readBody(req);

  let q = db().from('customers').select('id, total_stamps');
  if (token) {
    q = q.eq('reward_token', String(token));
  } else if (phone) {
    q = q.eq('phone', normalizePhone(phone) || String(phone));
  } else if (customerId) {
    const id = String(customerId).replace(/[,()]/g, '');
    q = isUuid(id)
      ? q.or(`id.eq.${id},customer_code.eq.${id},phone.eq.${id}`)
      : q.or(`customer_code.eq.${id},phone.eq.${id}`);
  } else {
    throw new ApiError(400, 'Reward token, Phone or Customer ID required');
  }

  const found = must(await q.order('created_at').limit(1).maybeSingle());
  if (!found) throw new ApiError(404, 'Customer not found');

  const count = toPositiveInt(stampsToAdd ?? 1, { min: 1, max: 10 });
  if (!count) throw new ApiError(400, 'You can add between 1 and 10 stamps at a time');
  if (count > 1 && ctx.user.role !== 'admin') {
    throw new ApiError(403, 'Only an admin can add more than one stamp at a time');
  }

  await getLoyaltySettings(ctx.restaurantId);
  const oldStamps = await rpc<number>('add_customer_stamps', { p_customer_id: found.id, p_count: count });
  const customer = (await getCustomerById(found.id))!;

  await broadcast([
    customerMessage(customer),
    staffMessage(ctx.restaurantId, 'customer-stamp-added', {
      customerId: customer.customerId,
      name: customer.name,
      totalStamps: customer.totalStamps,
    }),
  ]);

  return json({
    success: true,
    message: `Added ${count} stamp(s) successfully!`,
    customer,
    // Not sent by the original API, but the stamp screens show it in their toast
    totalStamps: customer.totalStamps,
    newlyUnlocked: customer.rewards.filter(r => r.status === 'available' && oldStamps < r.requiredStamps),
  });
});
