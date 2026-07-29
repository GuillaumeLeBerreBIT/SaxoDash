# Portfolio Performance Charts — Design Spec

**Date:** 2026-07-29
**Status:** Approved (design)
**Page:** `frontend/src/pages/Portfolio.jsx`

## Context

The dashboard-charts feature (net-worth line + monthly cash-flow bar) is complete. The next roadmap step is richer charts spread across the pages where they naturally belong, rather than piling everything onto the Dashboard. This spec covers the **first page: Portfolio**, with a **performance** focus ("track how the investments are doing over time / which holdings are winning").

Later, separate specs will cover the Accounts/Banking page (income & cash) and any Dashboard trimming. This spec is intentionally scoped to Portfolio only.

## Data reality (constraints)

- `NetWorthSnapshot` provides **portfolio-level** history (`portfolio_value` per day). There is **no per-stock price history** in the data model, so individual-stock lines over time are out of scope.
- `Position` rows carry `avg_cost`, `current_price`, `qty`, plus backend-computed `value`, `pnl`, `weight` (single point in time — current).
- Both charts below are buildable with **existing endpoints and existing API-client functions**. No backend changes, no new API-client functions.

## Goal

Add two performance-oriented chart components to the Portfolio page:

1. Investment value over time (area chart).
2. Gainers & losers by P&L % (horizontal bar chart).

## Non-goals (YAGNI)

- No per-stock price history / per-stock time-series.
- No new backend model, endpoint, or migration.
- No allocation re-skin (sector donut / asset-type split) — deferred to a possible later Portfolio pass.
- No cost-basis-vs-market comparison chart — deferred.

## Components

### 1. `PortfolioValueChart` — investment value over time

- **File:** `frontend/src/components/PortfolioValueChart.jsx` (default export, no required data props).
- **Consumes:** `getNetWorthHistory(range)` from `../api/client`; `fmtEur` from `../lib/format`; `chartTooltipProps` from `../lib/charts`; `RANGES` + `RangePills` from `./RangePills` (see Shared cleanup); `Card`, `CardHeader` from `./ui`.
- **Renders:** a Recharts `AreaChart` of the `portfolio_value` series inside a `ResponsiveContainer`.
  - Range pills: `1M / 3M / 6M / 1Y / ALL`, default `6M` — same behaviour as `NetWorthChart`.
  - Emerald line/fill (`#34d399`, the established "investments" color) with a subtle gradient area fill.
  - `XAxis` = date (same `formatAxisDate` day/month formatting as `NetWorthChart`); `YAxis` = EUR with `fmtEur(v, { decimals: 0 })`; tooltip uses `chartTooltipProps` + `fmtEur`.
- **Self-fetching + race safety:** `useEffect` keyed on `range`, `cancelled` flag in cleanup, `error` state rendering a small red message inside a `Card` — identical pattern to `NetWorthChart`/`CashFlowChart`.

### 2. `GainersLosersChart` — P&L % per holding

- **File:** `frontend/src/components/GainersLosersChart.jsx` (default export).
- **Props:** `positions` (array) — passed down from `Portfolio.jsx`, which already fetches positions. No duplicate fetch.
- **Consumes:** `fmtPct`/`fmtEur` from `../lib/format`; `chartTooltipProps` from `../lib/charts`; `Card`, `CardHeader` from `./ui`.
- **Logic (testable helper):** a pure function `toGainersLosersData(positions)` in a small module (e.g. `frontend/src/lib/performance.js`) that maps each position to `{ ticker, pnlPct }` where `pnlPct = (current_price - avg_cost) / avg_cost * 100`, and sorts descending (best → worst). This function is unit-tested with Vitest.
- **Renders:** a Recharts horizontal `BarChart` (`layout="vertical"`), one bar per holding, ticker labels on the Y axis, `pnlPct` on the X axis. Green bar (`#34d399`) when `pnlPct >= 0`, red (`#f87171`) when negative (per-bar `Cell` fill). Tooltip shows the ticker and its P&L %.

## Shared cleanup (targeted, in-scope)

The `Pill` button component and the `RANGES` constant currently live **inside** `NetWorthChart.jsx`. Extract both into a single new `frontend/src/components/RangePills.jsx` module that exports `RANGES` and a `RangePills` component (rendering the pill row given `value` + `onChange`). Update `NetWorthChart.jsx` to import and use it, and have `PortfolioValueChart` use it too. No behavioural change; no unrelated refactoring.

## Layout on `Portfolio.jsx`

- `PortfolioValueChart` — **full width, directly under the summary card** (top of page answers "how am I doing over time").
- Existing holdings table + Overview/Sector sidebar grid stays where it is.
- `GainersLosersChart` — **full width, below** the holdings/sidebar grid.
- `Portfolio.jsx` passes its already-fetched `positions` into `GainersLosersChart`.

## Testing

Consistent with the existing precedent ("chart components are visually verified in-browser rather than deep-unit-tested"):

- **Unit test (Vitest):** `toGainersLosersData()` — mapping (P&L % math), descending sort, and edge cases (empty array; a position with a loss). Lives alongside the helper (e.g. `frontend/src/lib/performance.test.js`).
- **In-browser verification:** run backend + frontend, open Portfolio, confirm:
  - The value-over-time area chart renders an emerald area and reloads on each range pill.
  - The gainers/losers chart shows one bar per holding, sorted best→worst, green/red by sign.
- **Regression gate:** `npm run lint`, `npm test`, `npm run build` all clean; existing tests unaffected.

## Constraints (carried from the codebase)

- Reuse the existing dark-theme chart look (`chartTooltipProps`) and the established color language: emerald `#34d399` (investments/gains), red `#f87171` (losses).
- No new npm packages — Recharts 3 and Vitest are already present.
- Money formatting via existing `fmtEur`/`fmtPct` helpers.
