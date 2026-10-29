import 'server-only';
import { db, must } from './db';
import { ApiError, isUuid } from './http';
import { toPositiveInt } from './validate';
import type { OrderDoc } from './mappers';
/* eslint-disable @typescript-eslint/no-explicit-any */

export const ACTIVE_EXCLUDED = ['completed', 'cancelled'];
// Statuses staff can set by hand. "completed" only happens through billing.
export const MANUAL_STATUSES = ['pending', 'accepted', 'preparing', 'ready', 'served', 'cancelled'];

export type PricedItem = { menu_item_id: string; name: string; price: number; quantity: number; notes: string };

/**
 * Turns the items a client sent into order lines priced from the menu.
 * The client only chooses WHAT and HOW MANY — names and prices always come from the database.
 */
export async function priceItems(rawItems: unknown, restaurantId: string): Promise<PricedItem[]> {
  if (!Array.isArray(rawItems) || rawItems.length === 0) throw new ApiError(400, 'Add at least one item');
  if (rawItems.length > 100) throw new ApiError(400, 'Too many items in one order');

  const ids = rawItems.map((i: any) => i?.menuItemId || i?.menu || i?._id).filter(isUuid);
  const names = rawItems.map((i: any) => i?.name).filter((n: unknown) => typeof n === 'string' && n);

  const [byIdRows, byNameRows] = await Promise.all([
    ids.length ? db().from('menu_items').select('*').eq('restaurant_id', restaurantId).in('id', ids) : Promise.resolve({ data: [], error: null }),
    names.length ? db().from('menu_items').select('*').eq('restaurant_id', restaurantId).in('name', names) : Promise.resolve({ data: [], error: null }),
  ]);
  const menu = [...(must(byIdRows as any) as any[]), ...(must(byNameRows as any) as any[])];
  const byId = new Map(menu.map(m => [m.id, m]));
  const byName = new Map(menu.map(m => [m.name, m]));

  return rawItems.map((raw: any) => {
    const id = raw?.menuItemId || raw?.menu || raw?._id;
    const menuItem = (id && byId.get(String(id))) || byName.get(raw?.name);
    if (!menuItem) throw new ApiError(400, `"${raw?.name || 'Item'}" is not on the menu`);
    if (!menuItem.available) throw new ApiError(400, `${menuItem.name} is not available right now`);
    const quantity = toPositiveInt(raw.quantity, { min: 1, max: 99 });
    if (!quantity) throw new ApiError(400, `Invalid quantity for ${menuItem.name}`);
    return {
      menu_item_id: menuItem.id,
      name: menuItem.name,
      price: Number(menuItem.price),
      quantity,
      notes: String(raw.notes || '').slice(0, 200),
    };
  });
}

type ItemLine = {
  id?: string;
  menu_item_id: string | null;
  name: string;
  price: number;
  quantity: number;
  notes: string;
  served: boolean;
  added_at: string | null;
  served_at: string | null;
  batch_number: number;
};

/**
 * Waiter edits the items of an open order — batch-aware merge (routes/orders.js PUT /:id).
 * Existing lines keep their served status; extra quantity becomes a NEW batch line, so
 * "Paneer Tikka served (batch 1)" and "Paneer Tikka new (batch 2)" never get mixed up.
 * Reductions remove unserved quantity only, newest batch first.
 */
export async function mergeOrderItems(order: OrderDoc, requested: any[], restaurantId: string) {
  const nextBatch = (order.batchCount || 1) + 1;

  // Desired total quantity per dish (the waiter's cart may list a dish more than once)
  const desiredByName: Record<string, number> = {};
  const sampleByName: Record<string, any> = {};
  requested.forEach(i => {
    const qty = toPositiveInt(i?.quantity, { min: 1, max: 999 });
    if (!i?.name || !qty) return;
    desiredByName[i.name] = (desiredByName[i.name] || 0) + qty;
    if (!sampleByName[i.name] || (i.notes && !sampleByName[i.name].notes)) sampleByName[i.name] = i;
  });

  const currentByName: Record<string, number> = {};
  order.items.forEach(item => {
    currentByName[item.name] = (currentByName[item.name] || 0) + item.quantity;
  });

  // Extra quantity → new batch, priced from the menu
  const additions = Object.keys(desiredByName)
    .filter(name => desiredByName[name] > (currentByName[name] || 0))
    .map(name => ({ ...sampleByName[name], quantity: desiredByName[name] - (currentByName[name] || 0) }));
  const priced = additions.length ? await priceItems(additions, restaurantId) : [];
  const now = new Date().toISOString();
  const newBatchItems: ItemLine[] = priced.map(p => ({
    ...p, served: false, added_at: now, served_at: null, batch_number: nextBatch,
  }));

  // Reductions → take quantity off unserved lines, newest batch first
  let items: ItemLine[] = order.items.map(i => ({
    id: i._id,
    menu_item_id: i.menuItemId,
    name: i.name,
    price: i.price,
    quantity: i.quantity,
    notes: i.notes,
    served: i.served,
    added_at: i.addedAt,
    served_at: i.servedAt,
    batch_number: i.batchNumber || 1,
  }));
  Object.keys(currentByName).forEach(name => {
    let toRemove = currentByName[name] - (desiredByName[name] || 0);
    if (toRemove <= 0) return;
    items = items
      .sort((a, b) => (b.batch_number || 1) - (a.batch_number || 1))
      .map(item => {
        if (item.name !== name || item.served || toRemove <= 0) return item;
        const take = Math.min(item.quantity, toRemove);
        toRemove -= take;
        return item.quantity - take > 0 ? { ...item, quantity: item.quantity - take } : null;
      })
      .filter(Boolean) as ItemLine[];
    if (toRemove > 0) {
      throw new ApiError(400, `${name} has already been served and can't be reduced further`);
    }
  });
  items.sort((a, b) => (a.batch_number || 1) - (b.batch_number || 1));

  return { items: [...items, ...newBatchItems], nextBatch, addedNewBatch: newBatchItems.length > 0 };
}
