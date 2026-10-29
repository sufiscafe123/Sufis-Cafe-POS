import 'server-only';
import type { NextRequest } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { db } from './db';
import { env } from './env';
import { ApiError } from './http';
/* eslint-disable @typescript-eslint/no-explicit-any */

export const CUSTOMER_TOKEN_HEADER = 'x-customer-token';
const CUSTOMER_TOKEN_TTL = '12h';
// Sent with 401/403 when the staff login itself is no longer valid (expired, deactivated...)
export const SESSION_INVALID = 'SESSION_INVALID';

export type StaffRow = { id: string; restaurant_id: string; name: string; email: string; role: 'admin' | 'waiter' | 'kitchen'; active: boolean };
export type RestaurantRow = Record<string, any> & { id: string; name: string; gst_rate: number | string; active: boolean };

export type StaffContext = { kind: 'staff'; user: StaffRow; restaurant: RestaurantRow; restaurantId: string };
export type CustomerContext = {
  kind: 'customer';
  customerId: string;
  restaurantId: string;
  restaurant: RestaurantRow;
  tableNumber: number;
};

type StaffLookup =
  | { ok: true; ctx: StaffContext }
  | { ok: false; reason: 'none' | 'invalid' | 'deactivated' | 'restaurant-inactive' };

// Resolves the Supabase session cookie into the staff profile and restaurant.
export async function lookupStaff(): Promise<StaffLookup> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) return { ok: false, reason: 'none' };

  const { data: staff } = await db()
    .from('staff')
    .select('id, restaurant_id, name, email, role, active, restaurants(*)')
    .eq('id', userId)
    .maybeSingle();
  if (!staff) return { ok: false, reason: 'invalid' };
  if (!staff.active) return { ok: false, reason: 'deactivated' };
  const restaurant = (staff as any).restaurants as RestaurantRow | null;
  if (!restaurant || !restaurant.active) return { ok: false, reason: 'restaurant-inactive' };

  const user = { ...(staff as any) };
  delete user.restaurants;
  return { ok: true, ctx: { kind: 'staff', user, restaurant, restaurantId: restaurant.id } };
}

// middleware/auth.js `auth`: a valid, active staff login is required.
export async function requireStaff(): Promise<StaffContext> {
  const res = await lookupStaff();
  if (res.ok) return res.ctx;
  switch (res.reason) {
    case 'none': throw new ApiError(401, 'No token provided', SESSION_INVALID);
    case 'invalid': throw new ApiError(401, 'Invalid token', SESSION_INVALID);
    case 'deactivated': throw new ApiError(403, 'Account is deactivated', SESSION_INVALID);
    default: throw new ApiError(403, 'This restaurant account is inactive. Please contact support.', SESSION_INVALID);
  }
}

export function assertAdmin(ctx: StaffContext) {
  if (ctx.user.role !== 'admin') throw new ApiError(403, 'Admin access required');
}

export function assertNotKitchen(ctx: StaffContext) {
  if (ctx.user.role === 'kitchen') throw new ApiError(403, 'Not authorized');
}

export async function requireAdmin(): Promise<StaffContext> {
  const ctx = await requireStaff();
  assertAdmin(ctx);
  return ctx;
}

export async function requireStaffNotKitchen(): Promise<StaffContext> {
  const ctx = await requireStaff();
  assertNotKitchen(ctx);
  return ctx;
}

export async function activeRestaurant(): Promise<RestaurantRow | null> {
  const { data } = await db().from('restaurants').select('*').eq('active', true).order('created_at').limit(1).maybeSingle();
  return (data as RestaurantRow) || null;
}

// middleware/auth.js `optionalAuth`: staff if signed in, otherwise the single active restaurant.
export async function optionalStaff(): Promise<{ staff: StaffContext | null; restaurant: RestaurantRow | null }> {
  const res = await lookupStaff();
  if (res.ok) return { staff: res.ctx, restaurant: res.ctx.restaurant };
  return { staff: null, restaurant: await activeRestaurant() };
}

// ─── Customer sessions (table QR app) ───────────────────────────────────────

const secretKey = () => new TextEncoder().encode(env.customerSessionSecret);

export async function signCustomerToken(customerId: string, restaurantId: string, tableNumber: number) {
  return new SignJWT({ typ: 'customer', cid: customerId, rid: restaurantId, table: tableNumber })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(CUSTOMER_TOKEN_TTL)
    .sign(secretKey());
}

export async function resolveCustomerToken(token: string | null): Promise<CustomerContext | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] });
    if (payload.typ !== 'customer' || typeof payload.cid !== 'string' || typeof payload.rid !== 'string') return null;
    const { data: customer } = await db().from('customers').select('id').eq('id', payload.cid).maybeSingle();
    if (!customer) return null;
    const { data: restaurant } = await db().from('restaurants').select('*').eq('id', payload.rid).maybeSingle();
    if (!restaurant || !restaurant.active) {
      throw new ApiError(403, 'This restaurant is not accepting orders right now.');
    }
    return {
      kind: 'customer',
      customerId: payload.cid,
      restaurantId: payload.rid,
      restaurant: restaurant as RestaurantRow,
      tableNumber: Number(payload.table),
    };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    return null;
  }
}

// middleware/auth.js `staffOrCustomer`: staff session cookie, or the X-Customer-Token header.
export async function requireStaffOrCustomer(req: NextRequest): Promise<StaffContext | CustomerContext> {
  // A customer token always wins: the customer app may run in a browser where staff are also signed in.
  const customerToken = req.headers.get(CUSTOMER_TOKEN_HEADER);
  if (customerToken) {
    const customer = await resolveCustomerToken(customerToken);
    if (customer) return customer;
  } else {
    const res = await lookupStaff();
    if (res.ok) return res.ctx;
  }
  throw new ApiError(401, 'Please scan the table QR code again to continue.', 'CUSTOMER_SESSION');
}

export function requireCustomer(ctx: StaffContext | CustomerContext): CustomerContext {
  if (ctx.kind !== 'customer') throw new ApiError(403, 'Customer session required');
  return ctx;
}
