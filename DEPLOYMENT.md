# Deployment & setup — Vercel + Supabase

Everything runs in two places: **Supabase** (database, logins, realtime) and **Vercel**
(the Next.js app, including the API). There is no separate backend server any more.

---

## 1. Create the Supabase project

1. Create a project at <https://supabase.com/dashboard>. Pick a region close to the restaurant
   (e.g. Mumbai for India).
2. **Project Settings → API**: copy the **Project URL**, the **anon / publishable** key and the
   **service_role / secret** key.
3. **Authentication → Sign In / Providers**:
   - keep **Email** enabled,
   - turn **OFF "Allow new users to sign up"** — staff accounts are created only by an admin
     from the Staff screen (or `npm run create-admin`). Even if someone did sign up, they would
     have no staff profile and RLS would give them nothing, but there is no reason to allow it.
   - the "Confirm email" setting doesn't matter: admin-created accounts are created already confirmed.
4. **Realtime → Settings**: leave **"Allow public access"** as is or switch it to private-only —
   the app only uses *private* channels.

## 2. Create the database schema

Apply the SQL files in `supabase/migrations/` **in order**:

| File | Contents |
|------|----------|
| `20261028000001_schema.sql` | tables, constraints, indexes |
| `20261028000002_functions.sql` | atomic order / billing / loyalty / report functions |
| `20261028000003_rls_realtime.sql` | Row Level Security + Realtime authorization |
| `20261028000004_daily_bill_number.sql` | day-wise bill numbers (Bill No restarts at 1 every day) |

Either:

- **SQL editor**: paste each file into *SQL Editor → New query* and run it, in order; or
- **Supabase CLI**:
  ```bash
  npx supabase login
  npx supabase link --project-ref <your-project-ref>
  npx supabase db push
  ```

## 3. Configure the app

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Where it's used | Notes |
|----------|-----------------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | anon / publishable key (public by design) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | never prefix with `NEXT_PUBLIC_`, never commit |
| `CUSTOMER_SESSION_SECRET` | server only | 32+ random chars; signs customer QR sessions and the key in each printed table QR code (changing it means printing all QR codes again). Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `RESTAURANT_TIMEZONE` | server | default `Asia/Kolkata`; day boundaries of reports |
| `SEED_*` | `create-admin` script only | restaurant name, admin email/password, number of tables |
| `MONGODB_URI` | `migrate:mongo` script only | the old database |

## 4. Create the restaurant and first admin

```bash
npm run create-admin
```

Creates the restaurant, the admin login (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`), starter
tables, the default loyalty program and default menu categories. Safe to re-run — it skips what
exists. If `SEED_ADMIN_PASSWORD` is empty a random password is generated and printed **once**;
change it after the first login (*Settings → Change My Password*).

> Moving from the old MongoDB app? Skip this step and run the data migration (section 6)
> instead — it brings the restaurant, staff (with their passwords) and all history across.

## 5. Run locally

```bash
npm run dev          # http://localhost:3000/login
```

Customer QR ordering: `http://localhost:3000/customer?table=1`.

Checks:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## 6. Migrate existing MongoDB data (optional)

```bash
# 1) dry run — reads MongoDB, writes nothing, lists problems (missing tables, orphan bills…)
MONGODB_URI="mongodb+srv://…" npm run migrate:mongo
# 2) write to Supabase
MONGODB_URI="mongodb+srv://…" npm run migrate:mongo -- --apply
```

- MongoDB is **only read**; nothing there is changed or deleted. Keep it as a backup.
- Re-running is safe: every ObjectId maps to a fixed UUID, so rows are updated, not duplicated.
- **Passwords**: staff bcrypt hashes are imported into Supabase Auth on the server, so staff log
  in with their existing passwords. They are never sent to a browser. If an account's hash can't
  be imported, the script says so; give that person a new password from *Staff → Edit*
  (or *Authentication → Users → Send password recovery* in Supabase).
- Order, bill and customer numbers continue from the old counters.
- Do the final run while the restaurant is closed (or briefly stop the old app) so no orders are
  taken in the old system after the copy.

## 7. Deploy to Vercel

1. Push the project to GitHub (`.env.local` is git-ignored — keep it that way).
2. <https://vercel.com/new> → import the repository. Framework: **Next.js** (auto-detected).
3. **Environment Variables**: add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `CUSTOMER_SESSION_SECRET`, `RESTAURANT_TIMEZONE`
   for Production (and Preview if you use it — ideally pointed at a separate Supabase project).
4. Deploy. Build command `next build`, output handled by Vercel.
5. In Supabase **Authentication → URL Configuration**, set **Site URL** to your Vercel URL.
6. Print table QR codes pointing to `https://<your-domain>/customer?table=<number>`.

Health check: `GET /api/health` → `{ "status": "ok", "db": "connected" }`.

---

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| Login says *"The login service is unreachable"* | `NEXT_PUBLIC_SUPABASE_URL` / anon key wrong, or project paused (free tier pauses after inactivity — restore it in the dashboard). |
| Login says *Invalid credentials* for a correct password | The user exists in Auth but has no row in `public.staff` → run `npm run create-admin` (links an existing Auth user) or add them from *Staff*. |
| Every API call returns 500 *"SUPABASE_SERVICE_ROLE_KEY is not set"* | Missing env var on Vercel; redeploy after adding it. |
| *"Could not find the function public.place_order"* | Migrations not applied (section 2), or applied out of order. |
| Kitchen / waiter screens don't update live | Realtime: check the browser console for `Realtime channel … CHANNEL_ERROR`. Make sure `20261028000003_rls_realtime.sql` ran (it adds the `realtime.messages` policies). Screens still refresh on reload / focus. |
| Customer app: *"Please scan the table QR code again"* | Customer session (12 h) expired, or `CUSTOMER_SESSION_SECRET` changed — check in again. |
| Reports show the wrong day | Set `RESTAURANT_TIMEZONE` (IANA name, e.g. `Asia/Kolkata`). |
| Print does nothing | Allow pop-ups for the site (same as before). Use the print dialog's *Save as PDF* for PDFs. |
| `429 Too many login attempts` | 10 attempts per email + IP per 15 min. Wait, or clear `public.rate_limits` in the SQL editor. |
