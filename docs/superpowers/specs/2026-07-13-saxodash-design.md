# SaxoDash — Design Spec

Date: 2026-07-13

## Purpose

Turn the SaxoDash Claude Design mockup (a static, no-build React prototype at
`claude.ai/design/p/019dc461-7a40-7ee6-a813-ab8a8642122b`) into a real,
running application: a personal finance dashboard combining a brokerage
portfolio view (styled after Saxo Bank) with bank-account aggregation
(BNP Paribas Fortis, KBC, ING). Long-term goal is connecting real accounts
(Saxo OpenAPI + a bank-aggregation provider); this milestone stays on
seeded mock data.

This is a learning project: the user builds the Django/DRF backend
themselves with coaching, and takes an active role in the frontend even
though Claude implements more of it directly. See "Working agreement"
below — it's the part that governs how implementation sessions actually run.

## Source material

The mockup (read from the Claude Design project, not yet copied into this
repo) is a zero-build React app: React 18 + Babel-standalone + Recharts +
Lucide, all via CDN `<script>` tags, Tailwind v4 browser build, JSX compiled
in-browser. Six pages: Dashboard, Portfolio, Research, Earnings,
Transactions, Banking. All data is hardcoded in `src/data.jsx` (positions,
transactions, bank accounts, market data, EPS/earnings, OHLC generator).
Page switching is `useState`, not real routing. No auth, no backend, no
loading/error states (data reads from a synchronous global array).

## Scope for this milestone

**In scope**: Dashboard, Portfolio, Transactions pages — backed by a real
Django REST Framework API on seeded mock data, served by a Vite + React
frontend.

**Explicitly out of scope (future milestones)**:
- Research, Earnings, Banking pages
- Real Saxo OpenAPI integration (brokerage data)
- Real bank-aggregation integration (PSD2 provider — Enable Banking or
  similar)
- Deployment (local dev only for now)
- Frontend automated tests

**Open decision, deliberately deferred**: the Research page's per-ticker
candlestick chart data source — TradingView widget embed vs. Saxo OpenAPI
real OHLC data vs. continued synthetic mock. Not needed until the Research
milestone; revisit then.

## Architecture

```
SaxoDash/                        (git repo root)
├── backend/                     Django project
│   ├── manage.py
│   ├── saxodash/                project config (settings, urls, wsgi)
│   ├── core/                    User setup, seed_demo_data command
│   ├── portfolio/                Position model + API
│   ├── transactions/             Transaction model + API
│   ├── accounts/                 BankAccount model + net-worth API
│   └── requirements.txt
├── frontend/                    Vite + React (JavaScript, not TS)
│   ├── src/
│   │   ├── pages/                Dashboard.jsx, Portfolio.jsx, Transactions.jsx
│   │   ├── components/           Sidebar, Card, StatCard, Badge, RangePills,
│   │   │                         PageHeader, Icon, LoadingState, ErrorState
│   │   ├── api/                  client.js + one function per endpoint
│   │   └── lib/format.js         fmtEUR / fmtPct / fmtNum ported from mockup
│   └── package.json
├── docs/superpowers/specs/       design docs (this file)
└── AGENTS.md                     working agreement (see below)
```

**Stack**: Django + Django REST Framework, SQLite (dev), session auth
(single user, no registration flow), Vite + React 18 + React Router
(replaces the mockup's fake `useState` paging with real URLs), Recharts
for charts, Lucide for icons, Tailwind (moved into the Vite build instead
of the CDN script). Frontend components are the mockup's own bespoke
primitives ported as-is (not a UI kit) — `shadcn/ui` may be added in a
later milestone when Research/Banking need accessible dropdowns, modals,
or comboboxes that the current pages don't require.

## Backend design

**`portfolio` app**
- `Position`: `ticker`, `name`, `qty`, `avg_cost`, `current_price`,
  `sector`, `type` (STOCK/ETF), `color`. Value, cost, P&L, P&L%, and
  portfolio weight are computed live via `SerializerMethodField`s, not
  stored — matches how real-time prices will need to work once a real
  price feed replaces the seeded `current_price`.
- `GET /api/portfolio/positions/` — list.
- `GET /api/portfolio/summary/` — totals (portfolio value, total P&L,
  allocation breakdown) consumed by both Dashboard and Portfolio pages.

**`transactions` app**
- `Transaction`: `date`, `type` (BUY/SELL/DIVIDEND/DEPOSIT/FEE),
  `instrument`, `ticker`, `qty`, `price`, `account`. `total` is derived
  (`qty * price`) via serializer.
- `GET /api/transactions/` — paginated, filterable by type/date range.
  Full history for the Transactions page; Dashboard requests the same
  endpoint with a small page size for its "recent 5" widget.

**`accounts` app**
- `BankAccount`: `bank`, `type`, `iban_masked`, `balance`, `available`,
  plus display metadata (gradient/accent) — kept as data fields since the
  mockup already treats per-bank styling as data-driven, not hardcoded CSS.
- `GET /api/accounts/` — list.
- `GET /api/accounts/net-worth/` — portfolio value + uninvested cash +
  bank balances, powering the Dashboard headline number.

**`core` app**
- Django's built-in `User`; one superuser account (single-user app, no
  registration).
- `seed_demo_data` management command — ports `POSITIONS`, `ALL_TX`,
  `BANK_ACCOUNTS` from the mockup's `src/data.jsx` into real DB rows.
  Idempotent: clears and re-seeds rather than duplicating on re-run.

All endpoints require `IsAuthenticated`. Views are written to scope data
by `request.user` even with only one user today, so adding real
multi-user support later doesn't require touching every view.

## Frontend design

Mapping from mockup files to the new structure:

- `src/sidebar.jsx` → splits into `components/Sidebar.jsx` and
  `components/ui.jsx` (the shared primitives it also defined via
  `Object.assign(window, ...)` — a global-object pattern that only worked
  because the mockup has no module system; separated now that we have one).
- `src/dashboard.jsx`, `src/portfolio.jsx`, `src/transactions.jsx` →
  `pages/Dashboard.jsx`, `pages/Portfolio.jsx`, `pages/Transactions.jsx`,
  fetching from the DRF endpoints instead of reading global arrays.
- `src/icons.jsx` → `components/Icon.jsx` using the `lucide-react` npm
  package instead of the CDN UMD build.
- `src/app.jsx` → `App.jsx`; `page`/`setPage` state replaced by
  `react-router-dom` for real URLs (refresh/back-button/bookmarks work).
- `src/data.jsx` → mostly deleted; `fmtEUR`/`fmtPct`/`fmtNum` move to
  `lib/format.js` (still needed as pure display helpers), everything else
  replaced by API calls.

**Data fetching**: `api/client.js` wraps `fetch` with a Vite-env-provided
base URL and credentials for session auth, plus one function per endpoint.
No React Query/SWR/Redux this milestone — three pages, each owning a
`useEffect` fetch, is simple enough; revisit if cross-page data reuse
makes plain fetching wasteful.

**Error/loading handling** (new — the mockup has none, since it read a
synchronous global array): each page tracks `loading`/`error` state;
shared `LoadingState`/`ErrorState` components styled like the mockup's
`Card`. A 401 from the API redirects to a login page (also new — the
mockup has no login screen).

## Testing

Backend only, this milestone. Each Django app gets DRF `APITestCase`
coverage for its endpoints (seeded-data shape/count, net-worth summation,
transaction filtering). No dictated test list beyond that — the user is
fluent in Django/DRF testing patterns; Claude flags where a test is worth
adding as features are built rather than prescribing the whole suite
upfront. Frontend stays untested this milestone; revisit once
Research/Earnings add enough logic to be worth covering.

## Working agreement

This governs how implementation sessions actually run — see `AGENTS.md`
for the version Claude reads automatically.

- **Backend (Django/DRF): coach mode.** Claude explains the pattern, may
  show a short snippet or pseudocode, flags gotchas — but does not edit
  backend files directly. The user writes the models/serializers/views/
  tests in their own editor.
- **Frontend (Vite/React): propose-then-choose.** For each component or
  page, Claude shows a snippet or worked example with an explanation of
  what it does and why, then the user decides case by case whether to
  write it themselves from that example or have Claude apply it directly.
  Either way, the reasoning is visible before code lands.
- **Scope discipline**: stay within Dashboard + Portfolio + Transactions
  on seeded data. Research/Earnings/Banking and real Saxo OpenAPI / bank
  aggregation integrations are explicitly future milestones.
- **Frontend design/polish**: reach for the `ui-ux-pro-max`,
  `frontend-design`, and `dataviz` skills rather than building a bespoke
  design-optimization agent — they already cover this.
