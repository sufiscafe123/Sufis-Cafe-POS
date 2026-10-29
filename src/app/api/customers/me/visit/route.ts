import { VISIT_GRACE_MS, requireCustomer, requireStaffOrCustomer } from '@/server/auth';
import { json, route } from '@/server/http';

// Customer: is this visit still open? Once the table is billed the app shows menu and rewards
// only, and logs the guest out at logoutAt.
export const GET = route(async (req) => {
  const ctx = requireCustomer(await requireStaffOrCustomer(req));
  const ended = Boolean(ctx.visitEndedAt);
  return json({
    visitEnded: ended,
    tableNumber: ctx.tableNumber,
    logoutAt: ended ? new Date(new Date(ctx.visitEndedAt!).getTime() + VISIT_GRACE_MS).toISOString() : null,
  });
});
