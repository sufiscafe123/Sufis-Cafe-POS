// One-time setup (replaces backend/seed.js): creates the restaurant record, its first admin
// login and a set of starter tables. Safe to re-run: it skips anything that already exists.
//
//   npm run create-admin
//
// Reads NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and the SEED_* values from
// .env.local (see .env.example). If SEED_ADMIN_PASSWORD is empty a strong random password
// is generated and printed once.

import { config } from 'dotenv';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });
config();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.');
  process.exit(1);
}

const RESTAURANT_NAME = process.env.SEED_RESTAURANT_NAME || 'Your Restaurant Name';
const RESTAURANT_EMAIL = process.env.SEED_RESTAURANT_EMAIL || 'owner@example.com';
const RESTAURANT_PHONE = process.env.SEED_RESTAURANT_PHONE || '';
const RESTAURANT_ADDRESS = process.env.SEED_RESTAURANT_ADDRESS || '';
const GST_RATE = Number(process.env.SEED_GST_RATE || 5);
const CURRENCY = process.env.SEED_CURRENCY || 'INR';
const ADMIN_NAME = process.env.SEED_ADMIN_NAME || 'Admin';
const ADMIN_EMAIL = (process.env.SEED_ADMIN_EMAIL || 'admin@example.com').toLowerCase().trim();
let ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || '';
const NUMBER_OF_TABLES = Number(process.env.SEED_TABLE_COUNT || 10);

const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const slugify = (str) => str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

async function findAuthUserByEmail(email) {
  for (let page = 1; page < 100; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find(u => (u.email || '').toLowerCase() === email);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function run() {
  // 1) Restaurant — reuse the existing one if it's already there
  let { data: restaurant } = await db.from('restaurants').select('*').order('created_at').limit(1).maybeSingle();
  if (restaurant) {
    console.log(`Restaurant already exists: "${restaurant.name}" (skipping creation)`);
  } else {
    const res = await db.from('restaurants').insert({
      name: RESTAURANT_NAME,
      slug: slugify(RESTAURANT_NAME) || 'restaurant',
      email: RESTAURANT_EMAIL.toLowerCase(),
      phone: RESTAURANT_PHONE,
      address: RESTAURANT_ADDRESS,
      gst_rate: GST_RATE,
      currency: CURRENCY,
    }).select('*').single();
    if (res.error) throw res.error;
    restaurant = res.data;
    console.log(`Created restaurant: "${restaurant.name}"`);
  }

  // 2) Admin user (Supabase Auth login + staff profile)
  const { data: existingStaff } = await db.from('staff').select('*').ilike('email', ADMIN_EMAIL).maybeSingle();
  if (existingStaff) {
    console.log(`Admin user already exists: ${existingStaff.email} (skipping creation)`);
  } else {
    let authUser = await findAuthUserByEmail(ADMIN_EMAIL);
    let generated = false;
    if (!authUser) {
      if (!ADMIN_PASSWORD) {
        ADMIN_PASSWORD = randomBytes(12).toString('base64url');
        generated = true;
      }
      if (ADMIN_PASSWORD.length < 8) throw new Error('SEED_ADMIN_PASSWORD must be at least 8 characters');
      const { data, error } = await db.auth.admin.createUser({
        email: ADMIN_EMAIL, password: ADMIN_PASSWORD, email_confirm: true,
        app_metadata: { role: 'admin', restaurant_id: restaurant.id },
      });
      if (error) throw error;
      authUser = data.user;
    } else {
      console.log(`Auth user ${ADMIN_EMAIL} already exists — linking it as admin (password unchanged).`);
    }
    const { error } = await db.from('staff').insert({
      id: authUser.id, restaurant_id: restaurant.id, name: ADMIN_NAME, email: ADMIN_EMAIL, role: 'admin',
    });
    if (error) throw error;
    console.log(`Created admin user: ${ADMIN_EMAIL}`);
    if (generated) {
      console.log(`Generated password (shown once): ${ADMIN_PASSWORD}`);
      console.log('IMPORTANT: log in and change it under Settings → Change My Password.');
    }
  }

  // 3) Starter tables (only if none exist yet)
  const { count } = await db.from('restaurant_tables').select('id', { count: 'exact', head: true }).eq('restaurant_id', restaurant.id);
  if (count > 0) {
    console.log(`Tables already exist (${count}) — skipping.`);
  } else {
    const tables = [];
    for (let i = 1; i <= NUMBER_OF_TABLES; i++) {
      tables.push({ restaurant_id: restaurant.id, table_number: i, capacity: i % 3 === 0 ? 6 : i % 2 === 0 ? 4 : 2 });
    }
    const { error } = await db.from('restaurant_tables').insert(tables);
    if (error) throw error;
    console.log(`Created ${tables.length} starter tables.`);
  }

  // 4) Default loyalty program and menu categories (the app also creates these on first use)
  await db.rpc('get_or_create_loyalty_settings', { p_restaurant_id: restaurant.id });
  await db.rpc('get_or_create_default_categories', { p_restaurant_id: restaurant.id });

  console.log('\nDone. You can log in at /login with the admin email/password above.');
}

run().catch(err => {
  console.error('Setup failed:', err.message || err);
  process.exit(1);
});
