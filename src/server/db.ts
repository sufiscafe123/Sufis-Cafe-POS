import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

let admin: SupabaseClient | null = null;

// Service-role client. Bypasses RLS, so it is only ever used on the server AFTER the
// route has checked who the caller is and what they may do (src/server/auth.ts).
export function db(): SupabaseClient {
  if (!admin) {
    admin = createClient(env.supabaseUrl, env.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return admin;
}

// Throws on a PostgREST error so callers can treat results as data.
// (A list query without an error always has data; single-row lookups may still be null.)
export function must<T>(res: { data: T; error: { message: string; code?: string } | null }): NonNullable<T> {
  if (res.error) {
    const err = new Error(res.error.message) as Error & { code?: string };
    err.code = res.error.code;
    throw err;
  }
  return res.data as NonNullable<T>;
}

// Calls one of the SQL functions in supabase/migrations/*_functions.sql.
export async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args);
  if (error) {
    const err = new Error(error.message) as Error & { code?: string };
    err.code = error.code;
    throw err;
  }
  return data as T;
}

// Supabase returns at most 1000 rows per request; this pages through larger results.
export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return out;
}
