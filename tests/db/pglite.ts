// Runs the real Supabase migrations against an in-process Postgres (PGlite) so the SQL
// functions and policies can be tested without a Supabase project. The few Supabase
// objects the migrations reference (auth.users, auth.uid(), realtime.messages, roles)
// are stubbed here.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  create schema realtime;
  create table realtime.messages (id bigserial primary key, topic text, extension text, payload jsonb);
  alter table realtime.messages enable row level security; -- as on Supabase
  create function realtime.topic() returns text language sql stable as $$
    select nullif(current_setting('realtime.topic', true), '')
  $$;
  grant usage on schema realtime to anon, authenticated, service_role;
  grant select on realtime.messages to anon, authenticated;
  grant execute on function realtime.topic() to anon, authenticated;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
`;

export async function createTestDb() {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  const dir = path.resolve(__dirname, '../../supabase/migrations');
  for (const file of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(path.join(dir, file), 'utf8'));
  }
  return db;
}
