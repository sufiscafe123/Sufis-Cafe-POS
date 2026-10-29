// Loads a menu file (categories + dishes) into the restaurant's menu.
// Safe to re-run: a category or dish that already exists (same name) is updated, not duplicated.
// Dishes that are not in the file are left alone.
//
//   npm run import-menu                       (shows what would change)
//   npm run import-menu -- --apply            (writes it)
//   npm run import-menu -- other-menu.json --apply
//
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local.

import { config } from 'dotenv';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });
config();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.');
  process.exit(1);
}

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const file = args.find(a => !a.startsWith('--')) || 'scripts/menu-sufis-cafe.json';
const menu = JSON.parse(readFileSync(file, 'utf8'));

const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

const restaurant = must(await db.from('restaurants').select('id, name').eq('active', true).order('created_at').limit(1).single());
const existingCats = must(await db.from('categories').select('id, name').eq('restaurant_id', restaurant.id));
const existingItems = must(await db.from('menu_items').select('id, name, category, price, description').eq('restaurant_id', restaurant.id));
const catByName = new Map(existingCats.map(c => [c.name.toLowerCase(), c]));
const itemByName = new Map(existingItems.map(i => [i.name.toLowerCase(), i]));

let newCats = 0, newItems = 0, changedItems = 0;
for (const [index, cat] of menu.categories.entries()) {
  const row = { restaurant_id: restaurant.id, name: cat.name, icon: cat.icon || '🍽️', is_active: true, sort_order: index + 1 };
  const found = catByName.get(cat.name.toLowerCase());
  if (!found) newCats++;
  if (apply) {
    if (found) must(await db.from('categories').update({ icon: row.icon, is_active: true, sort_order: row.sort_order }).eq('id', found.id));
    else must(await db.from('categories').insert(row));
  }

  for (const [name, price, description = ''] of cat.items) {
    const item = { restaurant_id: restaurant.id, name, category: cat.name, price, description, available: true, is_veg: true };
    const current = itemByName.get(name.toLowerCase());
    if (!current) {
      newItems++;
      if (apply) must(await db.from('menu_items').insert(item));
    } else if (current.category !== cat.name || Number(current.price) !== price || current.description !== description) {
      changedItems++;
      console.log(`  update ${name}: ${current.category} ₹${current.price} -> ${cat.name} ₹${price}`);
      if (apply) must(await db.from('menu_items').update({ category: cat.name, price, description, available: true }).eq('id', current.id));
    }
  }
}

const total = menu.categories.reduce((n, c) => n + c.items.length, 0);
console.log(`${restaurant.name}: ${menu.categories.length} categories (${newCats} new), ${total} dishes (${newItems} new, ${changedItems} updated)`);
console.log(apply ? 'Done.' : 'Nothing written yet. Run again with --apply to save it.');
