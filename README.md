# 🍽️ SRMS — Smart Restaurant Management System (Next.js + Supabase)

A restaurant POS and management app for one restaurant: tables, menu, waiter ordering, QR
table ordering for customers, kitchen display, billing with GST and loyalty rewards, staff and
reports.

This is the **Next.js + Supabase** rebuild of the original React + Express + MongoDB app. The
screens, workflows and business rules are the same; the stack underneath changed.

- Setup, Supabase, first admin, Vercel: **[DEPLOYMENT.md](./DEPLOYMENT.md)**
- What moved where, feature checklist, test results, known limitations: **[docs/MIGRATION_REPORT.md](./docs/MIGRATION_REPORT.md)**

---

## Features

| Module | Features |
|--------|----------|
| **Authentication** | Admin / Waiter / Kitchen logins (Supabase Auth), protected areas, session expiry handling |
| **Admin Dashboard** | Today's revenue, orders, table status, active orders, monthly revenue chart |
| **Tables** | Layout grid, add / edit capacity / free / reserve / delete, bill-request badges |
| **Menu** | Items and categories, veg / non-veg, availability, images (auto food photos) |
| **Waiter** | Table grid, order modal with batches, edit orders, mark served / cancel |
| **Customer QR app** | `/customer?table=N`: check-in, menu, cart with dish notes, live order status, call for bill, rewards, profile & history |
| **Kitchen Display** | Live order feed, status flow, completed orders |
| **Billing** | Bill composer with live preview, loyalty rewards, GST (CGST + SGST), cash / UPI / card, print & download receipts, bill history |
| **Takeaway** | Parcel orders with tokens |
| **Customers & Loyalty** | Directory, stamps, QR lookup, configurable stamp card and reward milestones |
| **Reports** | Daily (revenue, top items, payment breakdown, bills) and monthly |
| **Staff** | Add / edit / deactivate / delete staff, roles |
| **Settings** | Restaurant and GST details printed on bills, change password |

## Tech stack

- **Next.js 16** (App Router, Route Handlers, Proxy) · **React 19**
- **Supabase**: Postgres (schema, SQL functions, Row Level Security), Auth, Realtime Broadcast
- Recharts, React Hot Toast, Lucide icons, Axios
- Tests: Vitest + PGlite (real Postgres in-process for the SQL)

## Quick start

```bash
npm install
cp .env.example .env.local      # fill in your Supabase URL and keys
# apply supabase/migrations/*.sql to your project (see DEPLOYMENT.md)
npm run create-admin            # restaurant + first admin + starter tables
npm run dev                     # http://localhost:3000
```

| Command | What it does |
|---------|--------------|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm run lint` · `npm run typecheck` · `npm test` | Quality checks |
| `npm run create-admin` | First-time setup (safe to re-run) |
| `npm run migrate:mongo` | Copy data from the old MongoDB (dry run; add `-- --apply`) |
| `npm run fix-bills` | Port of the old discounted-bill repair script |

## Project structure

```
src/
  app/                 Next.js routes
    api/…              Route Handlers (same URLs as the old Express API)
    admin/ waiter/ kitchen/   staff areas (server-side role guard in each layout.tsx)
    customer/          QR ordering app
    login/
  proxy.ts             refreshes the Supabase session, bounces signed-out users to /login
  server/              server-only code: auth, billing, orders, realtime, mappers, db
  lib/                 shared: billing maths, Supabase clients, router + realtime shims
  screens/             the original admin / waiter / kitchen screens
  customer/            the original customer app screens
  components/ context/ the original shared components and contexts
  styles/              the original CSS, unchanged
supabase/migrations/   schema, SQL functions, RLS + Realtime policies
scripts/               create-admin, migrate-from-mongo, fix-discounted-bills
tests/                 unit tests + SQL/RLS tests
```

## License

MIT — Free to use and modify.
