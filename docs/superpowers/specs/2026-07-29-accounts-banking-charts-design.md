# Accounts/Banking Page Charts — Design Spec

**Date:** 2026-07-29
**Status:** Approved (design)
**Page:** `frontend/src/pages/Accounts.jsx`

## Context

Charts are being added to SaxoDash one page at a time, on the page where they belong. The Dashboard charts and the Portfolio performance charts are done. This spec covers the **Accounts/Banking page**, with a **cash/banking** focus ("how is my bank balance trending, how does it split across accounts, and where does cash move in/out"). Income leans on deposits rather than dividends, which are sparse.

The Accounts page today is minimal: a `PageHeader`, a single **Total Balance** `StatCard`, and a responsive grid of per-account cards (each showing bank, type, masked IBAN, balance, available, and an `accent` color stripe). No charts.

## Data reality (constraints)

- `BankAccount` carries `bank`, `type`, `iban_masked`, `balance`, `available`, `accent` (hex), `gradient` — but only a **current** snapshot; there is **no per-account balance history**.
- `NetWorthSnapshot` provides an **aggregate `bank_total` series over time**, served by the existing `/api/core/net-worth-history/?range=...` endpoint (client fn `getNetWorthHistory(range)`).
- `Transaction` (`DEPOSIT`/`DIVIDEND`/`FEE`/etc. with dates) feeds monthly cash flow via the existing `/api/transactions/cash-flow/` endpoint (client fn `getCashFlow()`), already consumed by `CashFlowChart`.
- All three charts below are buildable with **existing endpoints/data**. No backend changes, no new API-client functions.
- **Gradient gotcha:** `BankAccount.gradient` is a Tailwind class fragment and must NOT be interpolated into `className` (Tailwind v4 build-time scanning won't pick up runtime strings). Use the `accent` hex via inline `style`, exactly as the existing account cards and Dashboard legend dots do.

## Goal

Add banking-oriented charts to the Accounts page:

1. Bank balance over time (area chart).
2. Balance by account (donut).
3. Relocate the existing monthly cash-flow chart from the Dashboard to this page.

## Non-goals (YAGNI)

- No per-account history / per-account time-series (data doesn't exist).
- No new backend model, endpoint, migration, or API-client function.
- No cumulative-deposits or income stat-card row (deferred — sparse data).
- No change to `CashFlowChart`'s internals; it is only relocated.

## Components

### 1. `BankBalanceChart` — bank balance over time

- **File:** `frontend/src/components/BankBalanceChart.jsx` (default export, no props).
- **Consumes:** `getNetWorthHistory(range)` from `../api/client`; `fmtEur` from `../lib/format`; `chartTooltipProps` + `formatAxisDate` from `../lib/charts`; `RangePills` from `./RangePills`; `Card`, `CardHeader` from `./ui`.
- **Renders:** a Recharts `AreaChart` of the `bank_total` series inside a `ResponsiveContainer`.
  - Range pills `1M/3M/6M/1Y/ALL`, default `6M` (via shared `RangePills`).
  - **Amber** line/fill (`#fbbf24`, the established "bank" color) with a subtle gradient area fill (its own `linearGradient` id, distinct from `PortfolioValueChart`'s `portfolioFill`, e.g. `bankFill`).
  - `XAxis` = date via `formatAxisDate`; `YAxis` = EUR via `fmtEur(v, { decimals: 0 })`; tooltip via `chartTooltipProps` + `fmtEur`, series label "Bank".
- **Self-fetching + race safety:** `useEffect` keyed on `range`, `cancelled` flag in cleanup guarding both `setData` and `setError`, error state rendering a small red message inside a `Card` — identical pattern to `PortfolioValueChart`/`NetWorthChart`. This is `PortfolioValueChart` with `dataKey="bank_total"`, amber color, and the "Bank balance" title.

### 2. `AccountBreakdownChart` — balance by account (donut)

- **File:** `frontend/src/components/AccountBreakdownChart.jsx` (default export).
- **Props:** `accounts` (array) — passed from `Accounts.jsx`, which already fetches them. No duplicate fetch.
- **Consumes:** `fmtEur` from `../lib/format`; `chartTooltipProps` from `../lib/charts`; `toAccountBreakdownData` from `../lib/accounts` (see below); `Card`, `CardHeader` from `./ui`; Recharts `PieChart`/`Pie`/`Cell`/`Tooltip`/`ResponsiveContainer`.
- **Logic (testable helper):** a pure function `toAccountBreakdownData(accounts)` in a new module `frontend/src/lib/accounts.js` that maps each account to `{ name, value, color }` where `name = account.bank`, `value = Number(account.balance)`, `color = account.accent || '#3f3f46'` (same fallback the account cards use). Order preserved as given. Unit-tested with Vitest.
- **Renders:** a donut (`PieChart` with `Pie innerRadius/outerRadius`, `paddingAngle`, `isAnimationActive={false}` — matching the Dashboard allocation donut to avoid the known Recharts zero-angle first-frame bug), one `Cell` per account colored by `color`, a tooltip formatting value via `fmtEur`, and a legend row below listing each account: color dot (inline `style` background) · bank · balance · % of total. Wrapped in `Card` + `CardHeader` titled "Balance by account".

### 3. Relocate `CashFlowChart`

- Remove the `import CashFlowChart from '../components/CashFlowChart'` line and the `<CashFlowChart />` render from `frontend/src/pages/Dashboard.jsx`.
- Add the same import + render to `frontend/src/pages/Accounts.jsx` (full width, bottom of the page).
- `CashFlowChart.jsx` itself is unchanged (it self-fetches via `getCashFlow()`).

## Layout on `Accounts.jsx`

- `PageHeader` + existing **Total Balance** `StatCard` row — unchanged.
- **`BankBalanceChart`** — full width, directly under the stat row.
- A row (grid, mirroring the Portfolio/Dashboard "content + chart" pattern): the existing **account cards grid** on the left (col-span-2) beside the **`AccountBreakdownChart`** donut on the right (col-span-1).
- **`CashFlowChart`** — full width, at the bottom.
- `Accounts.jsx` passes its already-fetched `accounts` array into `AccountBreakdownChart`.

## Testing

Consistent with the existing precedent (chart components verified in-browser, not deep-unit-tested):

- **Unit test (Vitest):** `toAccountBreakdownData()` — mapping (`name`/`value`/`color`), the `accent` fallback when missing, numeric coercion of `balance`, and empty-array input. Lives at `frontend/src/lib/accounts.test.js`.
- **In-browser verification:** run backend + frontend, open Accounts, confirm:
  - The bank-balance area chart renders an amber area and reloads on each range pill.
  - The donut shows one slice per account, colored to match the account cards' accents, with a legend and correct percentages.
  - The cash-flow chart now appears on the Accounts page and no longer on the Dashboard.
- **Regression gate:** `npm run lint`, `npm test`, `npm run build` all clean; existing tests unaffected. The Dashboard must still render after `CashFlowChart` removal.

## Constraints (carried from the codebase)

- Reuse the existing dark-theme chart look (`chartTooltipProps`) and the established color language: amber `#fbbf24` for bank, and per-account `accent` colors for the donut.
- Donut must set `isAnimationActive={false}` (Recharts 3.x + React 19 Strict Mode zero-angle first-frame bug, per the known Dashboard allocation fix).
- Never interpolate `BankAccount.gradient` into `className`; use `accent` via inline `style`.
- No new npm packages — Recharts 3 and Vitest already present.
- Money formatting via existing `fmtEur`.
