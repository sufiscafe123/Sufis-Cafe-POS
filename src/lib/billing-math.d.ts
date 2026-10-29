export const PAYMENT_MODES: string[];
export function rewardDiscount(
  reward: { rewardType?: string; rewardValue?: number } | null | undefined,
  subtotal: number
): number;
export function computeTotals(
  subtotal: number,
  gstRate: number,
  discountAmount?: number
): { subtotal: number; discountAmount: number; taxable: number; gstRate: number; gstAmount: number; totalAmount: number };
