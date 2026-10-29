// Bill maths shared by the server (src/server/billing.ts) and the billing screens, so the
// on-screen preview always matches the saved bill. Unchanged from backend/utils/billing.js.

export const PAYMENT_MODES = ['cash', 'upi', 'card'];

// Money amount a reward takes off the food subtotal. Free-item rewards are a
// complimentary dish served to the table, so they don't change the amount.
export function rewardDiscount(reward, subtotal) {
  if (!reward) return 0;
  if (reward.rewardType === 'discount_percent') {
    const pct = Math.min(100, Math.max(0, reward.rewardValue || 0));
    return Math.round(subtotal * pct / 100);
  }
  if (reward.rewardType === 'discount_flat') {
    return Math.min(subtotal, Math.max(0, reward.rewardValue || 0));
  }
  return 0;
}

// Subtotal → discount → GST on the discounted amount → grand total.
export function computeTotals(subtotal, gstRate, discountAmount = 0) {
  const discount = Math.min(subtotal, Math.max(0, discountAmount));
  const taxable = subtotal - discount;
  const gstAmount = Math.round(taxable * gstRate / 100);
  return { subtotal, discountAmount: discount, taxable, gstRate, gstAmount, totalAmount: taxable + gstAmount };
}
