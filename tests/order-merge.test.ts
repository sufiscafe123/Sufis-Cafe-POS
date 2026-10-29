import { describe, expect, test, vi } from 'vitest';

// priceItems() reads the menu through the service-role client; serve a fixed menu instead.
const MENU = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Paneer Tikka', price: 220, available: true },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Masala Chai', price: 40, available: true },
  { id: '33333333-3333-4333-8333-333333333333', name: 'Sold Out Soup', price: 90, available: false },
];
vi.mock('@/server/db', () => {
  const query = () => {
    const state: { col?: string; vals?: string[] } = {};
    const q: any = {
      select: () => q,
      eq: () => q,
      in: (col: string, vals: string[]) => { state.col = col; state.vals = vals; return q; },
      then: (resolve: any) => resolve({
        data: MENU.filter(m => (state.vals || []).includes(state.col === 'id' ? m.id : m.name)),
        error: null,
      }),
    };
    return q;
  };
  return { db: () => ({ from: () => query() }), must: (r: any) => r.data };
});

import { mergeOrderItems, priceItems } from '@/server/orders';

const order = (items: any[]) => ({ batchCount: Math.max(...items.map(i => i.batchNumber)), items } as any);
const line = (name: string, quantity: number, batchNumber: number, served = false) => ({
  _id: `${name}-${batchNumber}`, menuItemId: null, name, price: name === 'Paneer Tikka' ? 220 : 40,
  quantity, notes: '', served, addedAt: '2026-10-28T10:00:00Z', servedAt: served ? '2026-10-28T10:20:00Z' : null, batchNumber,
});

describe('priceItems', () => {
  test('names and prices always come from the menu', async () => {
    const items = await priceItems([{ menuItemId: MENU[0].id, name: 'Free Food', price: 1, quantity: 2, notes: 'spicy' }], 'r');
    expect(items).toEqual([{ menu_item_id: MENU[0].id, name: 'Paneer Tikka', price: 220, quantity: 2, notes: 'spicy' }]);
  });
  test('rejects unavailable, unknown and bad quantities with the original messages', async () => {
    await expect(priceItems([{ name: 'Sold Out Soup', quantity: 1 }], 'r')).rejects.toThrow('Sold Out Soup is not available right now');
    await expect(priceItems([{ name: 'Nope', quantity: 1 }], 'r')).rejects.toThrow('"Nope" is not on the menu');
    await expect(priceItems([{ name: 'Masala Chai', quantity: 100 }], 'r')).rejects.toThrow('Invalid quantity for Masala Chai');
    await expect(priceItems([], 'r')).rejects.toThrow('Add at least one item');
  });
});

describe('batch-aware merge of waiter edits', () => {
  test('extra quantity becomes a new batch; served lines are kept', async () => {
    const o = order([line('Paneer Tikka', 2, 1, true)]);
    const r = await mergeOrderItems(o, [{ name: 'Paneer Tikka', quantity: 3 }], 'r');
    expect(r.addedNewBatch).toBe(true);
    expect(r.items.map(i => [i.name, i.quantity, i.batch_number, i.served])).toEqual([
      ['Paneer Tikka', 2, 1, true],
      ['Paneer Tikka', 1, 2, false],
    ]);
  });

  test('reductions remove unserved quantity, newest batch first', async () => {
    const o = order([line('Masala Chai', 2, 1), line('Masala Chai', 3, 2)]);
    const r = await mergeOrderItems(o, [{ name: 'Masala Chai', quantity: 1 }], 'r');
    expect(r.addedNewBatch).toBe(false);
    expect(r.items.map(i => [i.quantity, i.batch_number])).toEqual([[1, 1]]);
  });

  test('cannot reduce below what was served', async () => {
    const o = order([line('Paneer Tikka', 2, 1, true)]);
    await expect(mergeOrderItems(o, [{ name: 'Paneer Tikka', quantity: 1 }], 'r'))
      .rejects.toThrow("Paneer Tikka has already been served and can't be reduced further");
  });

  test('removing a dish entirely drops its unserved lines', async () => {
    const o = order([line('Paneer Tikka', 1, 1), line('Masala Chai', 2, 1)]);
    const r = await mergeOrderItems(o, [{ name: 'Masala Chai', quantity: 2 }], 'r');
    expect(r.items.map(i => i.name)).toEqual(['Masala Chai']);
  });
});
