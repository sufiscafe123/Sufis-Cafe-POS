import { describe, expect, test } from 'vitest';
import { computeTotals, rewardDiscount } from '@/lib/billing-math';
import { zonedDayRange, parseDateParam } from '@/server/time';

// Reference implementation copied verbatim from the original backend/utils/billing.js
function refRewardDiscount(reward: any, subtotal: number) {
  if (!reward) return 0;
  if (reward.rewardType === 'discount_percent') {
    const pct = Math.min(100, Math.max(0, reward.rewardValue || 0));
    return Math.round(subtotal * pct / 100);
  }
  if (reward.rewardType === 'discount_flat') return Math.min(subtotal, Math.max(0, reward.rewardValue || 0));
  return 0;
}
function refComputeTotals(subtotal: number, gstRate: number, discountAmount = 0) {
  const discount = Math.min(subtotal, Math.max(0, discountAmount));
  const taxable = subtotal - discount;
  const gstAmount = Math.round(taxable * gstRate / 100);
  return { subtotal, discountAmount: discount, taxable, gstRate, gstAmount, totalAmount: taxable + gstAmount };
}

describe('bill maths (same results as the original Express backend)', () => {
  test('GST on the discounted amount, rounded to the rupee', () => {
    expect(computeTotals(245, 5)).toEqual({ subtotal: 245, discountAmount: 0, taxable: 245, gstRate: 5, gstAmount: 12, totalAmount: 257 });
    expect(computeTotals(250, 5)).toMatchObject({ gstAmount: 13, totalAmount: 263 }); // 12.5 rounds up
    expect(computeTotals(1000, 18, 200)).toMatchObject({ taxable: 800, gstAmount: 144, totalAmount: 944 });
  });

  test('discount never exceeds the subtotal or goes negative', () => {
    expect(computeTotals(100, 5, 500)).toMatchObject({ discountAmount: 100, taxable: 0, gstAmount: 0, totalAmount: 0 });
    expect(computeTotals(100, 5, -20)).toMatchObject({ discountAmount: 0, totalAmount: 105 });
  });

  test('reward discounts', () => {
    expect(rewardDiscount({ rewardType: 'discount_percent', rewardValue: 20 }, 1234)).toBe(247);
    expect(rewardDiscount({ rewardType: 'discount_percent', rewardValue: 150 }, 100)).toBe(100);
    expect(rewardDiscount({ rewardType: 'discount_flat', rewardValue: 50 }, 30)).toBe(30);
    expect(rewardDiscount({ rewardType: 'free_item', rewardValue: 0 }, 500)).toBe(0);
    expect(rewardDiscount(null, 500)).toBe(0);
  });

  test('matches the reference implementation over many random bills', () => {
    const types = ['discount_percent', 'discount_flat', 'free_item'];
    for (let i = 0; i < 5000; i++) {
      const subtotal = Math.floor(Math.random() * 20000);
      const gst = [0, 5, 12, 18, 28, 2.5][i % 6];
      const reward = i % 4 === 0 ? null : { rewardType: types[i % 3], rewardValue: Math.floor(Math.random() * 120) };
      const d = rewardDiscount(reward, subtotal);
      expect(d).toBe(refRewardDiscount(reward, subtotal));
      expect(computeTotals(subtotal, gst, d)).toEqual(refComputeTotals(subtotal, gst, d));
    }
  });
});

describe('restaurant-timezone day boundaries', () => {
  test('a day in Asia/Kolkata starts at 18:30 UTC the previous day', () => {
    const { start, end } = zonedDayRange(2026, 10, 27, 'Asia/Kolkata');
    expect(start.toISOString()).toBe('2026-10-26T18:30:00.000Z');
    expect(end.toISOString()).toBe('2026-10-27T18:30:00.000Z');
  });
  test('DST days have the right length', () => {
    const { start, end } = zonedDayRange(2026, 3, 8, 'America/New_York');
    expect(start.toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect((end.getTime() - start.getTime()) / 3600000).toBe(23);
  });
  test('date parameter validation', () => {
    expect(parseDateParam('2026-10-27')).toEqual({ y: 2026, m: 10, d: 27 });
    expect(parseDateParam('2026-02-31')).toBeNull();
    expect(parseDateParam('garbage')).toBeNull();
  });
});
