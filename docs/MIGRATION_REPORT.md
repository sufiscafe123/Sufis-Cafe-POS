# Migration report — React + Express + MongoDB → Next.js + Supabase

## How the migration was done

- **UI**: every original screen, component, context and stylesheet was copied into the Next.js
  app unchanged in markup and styling (`src/screens`, `src/customer`, `src/components`,
  `src/context`, `src/styles`). The only edits are mechanical:
  - `react-router-dom` imports point to `src/lib/router.js`, a small shim (`useNavigate`,
    `useLocation` incl. navigation state, `useSearchParams`, `<Navigate>`) on the App Router;
  - `socket.io-client` is replaced by `src/lib/realtime-client.js`, an object with the same
    `on / off / disconnect` API backed by Supabase Realtime, so every `socket.on('new-order', …)`
    handler is unchanged;
  - the layouts render `children` instead of nested `<Routes>`; each page is a Next.js route.
- **API**: every Express route is a Next.js Route Handler at the **same URL, method, request
  body, response shape and error message** (`src/app/api/**`). Responses keep the Mongoose
  document shape (`_id`, `orderNumber`, `items[]`, `createdAt`…) through `src/server/mappers.ts`.
- **Database**: Mongoose models → relational Postgres tables with foreign keys, checks, unique
  constraints and indexes. Embedded arrays became child tables (`order_items`, `bill_items`,
  `customer_rewards`, `loyalty_milestones`, `customer_orders`).
- **Atomic operations** (`supabase/migrations/…_functions.sql`): order placement / batch append,
  item edits, status changes, billing, bill requests, check-in, stamps, loyalty sync, counters
  and reports are PL/pgSQL functions, each one transaction with row locks.
- **Auth**: staff log in with Supabase Auth (cookie session via `@supabase/ssr`, refreshed by
  `src/proxy.ts`). Customers keep the original 12-hour signed table-session token
  (`X-Customer-Token`, now signed with `CUSTOMER_SESSION_SECRET`).

## Feature checklist

| Area | Original | Migrated | Notes |
|------|----------|----------|-------|
| Staff login / logout / session check | `/api/auth/login`, `/me`, JWT in localStorage | ✅ | Supabase Auth cookies; same messages; rate limit 10 / 15 min per email+IP |
| Session expiry → back to login | axios interceptor | ✅ | Same interceptor on `SESSION_INVALID` |
| Change own password | `/api/auth/password` | ✅ | Current password verified, min 8 chars |
| Role-protected areas | `ProtectedRoute` | ✅ | Server guard in each area layout **plus** client guard **plus** API checks **plus** RLS |
| Dashboard stats, table overview, active orders, monthly chart, 30 s refresh | ✅ | ✅ | Real data via `report_dashboard` / `report_monthly` |
| Tables: add, edit capacity, free/reserve, delete, bill-request badge | ✅ | ✅ | "Open order" protection is now race-free |
| Menu items CRUD, availability, veg flag, image / auto photo | ✅ | ✅ | Case-insensitive duplicate-name check kept |
| Categories CRUD, defaults, rename cascades to items, delete blocked when in use | ✅ | ✅ | |
| Waiter tables + order modal, batches, edit (batch-aware merge), served / cancel | ✅ | ✅ | Merge logic ported line by line (`src/server/orders.ts`) |
| Kitchen live feed, status flow, completed list | ✅ | ✅ | Realtime Broadcast on the private staff topic |
| Customer QR check-in, menu, food modal, cart + dish notes, order, live status | ✅ | ✅ | |
| Call for bill (payment preference, reward choice) + chime/toast for staff | ✅ | ✅ | |
| Customer rewards, stamp card cycles, profile, order history | ✅ | ✅ | `sync_customer_rewards` = `initDefaultRewards` + `evaluateRewards` |
| Billing: composer, preview, reward discount, GST, payment mode, bill numbers from 5001 | ✅ | ✅ | Same maths file used by preview and server (`src/lib/billing-math.js`) |
| Receipt print, plain-text download, bill history | ✅ | ✅ | |
| Takeaway / parcel orders with `TK-` tokens | ✅ | ✅ | |
| Customers directory, search, filters, stats, quick stamp, loyalty offers editor | ✅ | ✅ | |
| Staff QR scan / token lookup, add stamp | ✅ | ✅ | |
| Reports daily (revenue, discount, GST, top 5, payment breakdown, bills) & monthly | ✅ | ✅ | Restaurant timezone (`RESTAURANT_TIMEZONE`) |
| Staff add / edit / deactivate / delete, role rules (can't demote / deactivate / delete self) | ✅ | ✅ | Deactivation also bans the Auth user |
| Restaurant settings (GSTIN validation, GST 0–28 %) | ✅ | ✅ | |
| Health check | `/api/health` | ✅ | |
| Seed script | `seed.js` | ✅ | `npm run create-admin` |
| Discounted-bill repair script | `fix-discounted-bills.js` | ✅ | `npm run fix-bills` |
| MongoDB → Supabase data migration | — | ✅ | `npm run migrate:mongo` (dry run by default) |

Packages `qrcode.react` and `jspdf` were listed in the old `package.json` but never imported by
any screen (receipts print through the browser, whose dialog also saves PDFs), so they were not
carried over. No screen renders a QR code in the original either.

## Concurrency and data integrity

| Risk | Protection |
|------|-----------|
| Two cashiers bill the same order / a retried request | `bill_order` locks the order row; status must be open; `bills.order_id` is UNIQUE |
| Items change while a bill is being generated | Order `version` (bumped on every update) must match the version the totals were computed from → 409 |
| Same reward redeemed twice | Reward row locked and must be `available` inside the billing transaction |
| Two people order for one table at once | `place_order` locks the table row → one open order, later items append as a batch |
| Two waiters edit the same order | `edit_order` checks the version → 409 "changed by someone else" |
| Duplicate order / bill / customer numbers | `counters` table with atomic `INSERT … ON CONFLICT DO UPDATE`, plus unique constraints |
| Same phone checking in twice at once | Advisory lock per phone in `customer_check_in` |
| Freeing a table that just got an order | Conditional updates on `current_order_id IS NULL` |

## Security model

- Browser holds only the **anon key**. All reads and writes go through the API routes, which
  check the staff role (or customer session) exactly like the old middleware before using the
  service-role key on the server.
- **RLS is enabled on every table** with read-only policies for signed-in, active staff of the
  restaurant (bills admin-only, customers admin + waiter, staff list admin or self). There are
  no write policies at all, so the public key can't change anything.
- All business SQL functions have `EXECUTE` revoked from `anon` / `authenticated`.
- **Realtime**: private channels only. RLS on `realtime.messages` lets staff receive only their
  restaurant's topic and customers only the table/profile topics granted at check-in (HMAC-named,
  expire after 13 h). Only the server can publish.
- Rate limits (login, customer check-in, customer orders, call-for-bill) are stored in Postgres,
  so they hold across serverless instances.

## Tests and their actual results

Run on 2026-10-28 in this workspace:

| Check | Result |
|-------|--------|
| `npm run typecheck` (tsc) | ✅ no errors |
| `npm run lint` (ESLint, next/core-web-vitals + typescript) | ✅ 0 errors, 5 warnings (unused eslint-disable comments carried over from the original screens) |
| `npm run build` (Next.js 16 production build) | ✅ all pages, 33 API routes and the proxy compiled with no errors or warnings |
| `npm test` — 33 tests in 3 files | ✅ all passing |
| ↳ `billing-math.test.ts` | GST/discount rules, and 5 000 random bills identical to the original `billing.js` |
| ↳ `order-merge.test.ts` | menu pricing, original error messages, batch merge / reduction rules |
| ↳ `db.test.ts` (real migrations on PGlite = Postgres 17) | order numbers 1001+, batches, takeaway tokens, stale-version refusal, cancel frees table, check-in CUS_10001, reward cycles, billing 5001+ with reward + stamp + table release, double-billing and double-redeem refused, loyalty re-sync, daily/monthly reports, directory, rate limit, RLS per role and per restaurant, no direct writes, functions not callable by browser roles, deactivated staff lose access, Realtime topic authorization |
| Migration script dry run against a local MongoDB with sample data shaped like the old models | ✅ mapped every collection; reported the orphan table reference, orphan bill and unbilled completed order |
| Production server smoke test | ✅ `/login` and `/customer?table=3` render with the original styling, no console errors; `/admin/*` and `/waiter/*` redirect to `/login` when signed out; APIs return the original 401 bodies |

**Not verified here** (no Supabase project / credentials were available in this workspace):
live sign-in through Supabase Auth, the API routes against a real Supabase database, Realtime
delivery between two browsers, the bcrypt-hash import into Supabase Auth, and a Vercel deploy.
The SQL was verified on PGlite with small stubs for `auth.uid()` and `realtime.topic()`.
After creating the project, run through: admin login → add table → add menu item → waiter order
→ kitchen sees it live → customer QR order on the same table → call for bill → admin bills it
with a reward → receipt prints → reports show it.

## Behaviour changes (deliberate, minimal)

1. **Receipts no longer print an empty "Reward: FREE" line.** The old Bill schema always stored a
   default `appliedReward: { discountAmount: 0 }`, so every bill without a discount printed that
   line. `appliedReward` is now present only when a reward was applied.
2. **`POST /api/customers/add-stamp` also returns `totalStamps`.** The Customers and Scan-QR
   screens showed "Total: undefined" in their toast because the old API never sent it.
3. **Kitchen accounts can't read customer profiles** (`GET /api/customers/:id`). No kitchen screen
   used it; it keeps customer phone numbers away from the kitchen terminal (matches RLS).
4. **Billing or editing an order that changed in the meantime returns 409** with a clear message
   instead of silently using stale items.
5. **Customer sessions win over a staff cookie** on the same browser (the old app achieved the
   same by stripping the `Authorization` header).
6. Invalid `?date=` values such as `2026-02-31` are rejected (400) instead of rolling over to March.
7. Rate-limit and realtime are serverless-safe (Postgres / Supabase) instead of in-memory.

## Known limitations

- Ported screens are JavaScript (`.jsx`) to keep them byte-for-byte comparable with the original;
  all new server code is TypeScript.
- Realtime events sent while a device is offline are not replayed (same as Socket.IO). The
  customer app re-syncs every 20 s and on focus, the dashboard every 30 s; other screens reload
  data when opened.
- A deactivated or deleted staff member loses API and data access immediately, but an already
  open Realtime connection keeps receiving staff events until their access token expires
  (≤ 1 hour by default). The old app force-disconnected the socket.
- Monthly report ranges are `[1st 00:00, next 1st 00:00)`; the original stopped at 23:59:59.000
  on the last day (a one-second gap), so totals can differ only for bills in that last second.
- Money is stored as `numeric(12,2)`; the bill maths is the original JavaScript, so results are
  identical for all realistic prices (verified on 5 000 random bills).
