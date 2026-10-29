import { requireCustomer, requireStaffOrCustomer } from '@/server/auth';
import { getCustomerById } from '@/server/data';
import { ApiError, json, route } from '@/server/http';
import { rateLimit } from '@/server/rateLimit';
import { broadcast, staffMessage } from '@/server/realtime';

// Customer: "Call Waiter" from the table — waiters and admin get a chime and a pop-up.
export const POST = route(async (req) => {
  const ctx = requireCustomer(await requireStaffOrCustomer(req));
  if (ctx.visitEndedAt) throw new ApiError(403, 'Your visit has ended. Please scan the QR code on your table again.', 'VISIT_ENDED');
  if (!(ctx.tableNumber > 0)) throw new ApiError(400, 'Please ask our staff at the counter.');
  await rateLimit(`waiter:${ctx.customerId}`, { windowMs: 60 * 1000, max: 3, message: 'The waiter has been called. They will be with you shortly.' });

  const customer = await getCustomerById(ctx.customerId);
  await broadcast([
    staffMessage(ctx.restaurantId, 'waiter-called', {
      tableNumber: ctx.tableNumber,
      customerName: customer?.name || '',
      requestedAt: new Date().toISOString(),
    }),
  ]);
  return json({ success: true, message: 'A waiter is on the way.' });
});
