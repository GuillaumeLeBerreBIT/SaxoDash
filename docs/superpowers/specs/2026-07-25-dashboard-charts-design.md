# Dashboard History Charts — Design

Date: 2026-07-25

## Problem

The Dashboard home page currently shows only point-in-time snapshots (net worth, portfolio value, bank balance, allocation donut, recent transactions). There is no way to see how wealth has changed over time. The user wants:

1. A line chart of wealth history with a 3-way toggle: Investments / Bank accounts / All combined.
2. Additional chart(s) that fit the financial data model.

## Current data model gap

`Position` and `BankAccount` only store current values (no history). `Transaction` has dates but no daily snapshot of total value. There is no historical time-series data anywhere in the backend today. This must be built before any history chart can render real data.

## 1. Backend: `NetWorthSnapshot` model + history API

- New model in the `core` app (currently empty, intended for cross-cutting concerns):

  ```python
  class NetWorthSnapshot(models.Model):
      date = models.DateField(unique=True)
      portfolio_value = models.DecimalField(max_digits=14, decimal_places=2)
      bank_total = models.DecimalField(max_digits=14, decimal_places=2)
      net_worth = models.DecimalField(max_digits=14, decimal_places=2)

      class Meta:
          ordering = ['date']
  ```

- Service function `ensure_todays_snapshot()`: checks whether a row exists for `date=today`; if not, computes `portfolio_value` via `portfolio.services.get_positions_total_value()` and `bank_total` via `accounts.services.get_total_bank_balance()`, and inserts a row with `net_worth = portfolio_value + bank_total`. No cron/scheduler — this runs inline at the top of the history view on each request, so the first request of a new day creates that day's snapshot.
- New endpoint: `GET /api/core/net-worth-history/?range=1M|3M|6M|1Y|ALL`
  - Calls `ensure_todays_snapshot()` first, then returns `NetWorthSnapshot` rows ordered by date, filtered to the requested window (`ALL` returns everything).
  - Response shape: `[{ "date": "2026-07-25", "portfolio_value": "...", "bank_total": "...", "net_worth": "..." }, ...]`
- `core` app needs `urls.py`, `views.py`, `serializers.py` created (currently only has empty `models.py`/`admin.py`), and must be registered in `backend/backend/urls.py` as `path('api/core/', include('core.urls'))`.
- Seed data: extend `seed_demo_data` management command to backfill ~365 daily snapshots ending today, using a random-walk with mild upward drift for `portfolio_value` (simulating market fluctuation) and a stepped series with occasional jumps for `bank_total` (simulating deposits/spending), so the chart looks realistic immediately rather than starting from a single flat point.

## 2. Frontend: `NetWorthChart` component

- Added to `Dashboard.jsx`, using Recharts `LineChart` styled per the `dataviz` skill's dark-theme conventions (consulted during implementation, not re-litigated here).
- **Toggle** (segmented control, 3 states): Investments / Bank / All.
  - **Investments**: single solid line, `portfolio_value`.
  - **Bank**: single solid line, `bank_total`.
  - **All**: three lines — `net_worth` solid, full-opacity, primary color; `portfolio_value` and `bank_total` dashed, ~50% opacity, as secondary context lines.
- **Range pills** (button group): 1M / 3M / 6M / 1Y / All, positioned alongside the toggle. Changing range refetches `getNetWorthHistory(range)`.
- Tooltip shows the date and the relevant value(s) for the active toggle state, formatted with the existing `fmtEur` helper.
- New API client function `getNetWorthHistory(range)` in `src/api/client.js`.

## 3. Backend + Frontend: monthly cash flow chart

- Backend: new endpoint `GET /api/transactions/cash-flow/` — a service groups existing `Transaction` rows by calendar month (last 12 months) and sums:
  - `inflow` = `DEPOSIT` + `DIVIDEND` amounts
  - `outflow` = `FEE` amounts
  - No new model; purely derived from existing `Transaction` data.
  - Response shape: `[{ "month": "2026-07", "inflow": "...", "outflow": "..." }, ...]`
- Frontend: new `CashFlowChart` component using Recharts grouped `BarChart` — one group per month, a green bar for inflow and a red bar for outflow, dataviz-consistent styling.
- New API client function `getCashFlow()`.

## Layout on Dashboard

`NetWorthChart` is added as a new full-width (or col-span-5) card above or below the existing "Top positions" / "Allocation" row. `CashFlowChart` is added as its own card below that, above or below "Recent transactions". Exact placement is a small implementation detail to finalize visually during build (aim for the existing dark, dense dashboard aesthetic — no major layout overhaul).

## Testing

- Backend: Django tests for `ensure_todays_snapshot()` idempotency (calling twice in the same day doesn't create duplicate rows), the history endpoint's range filtering, and the cash-flow grouping/summation logic.
- Frontend: Vitest tests for the API client functions (`getNetWorthHistory`, `getCashFlow`) following the existing pattern in `src/api/client.test.js`. Chart components themselves are visually verified in-browser rather than deep-unit-tested (consistent with how the existing donut/pie chart was handled).

## Out of scope (for this iteration)

- Asset allocation drift over time (stacked area by sector) — would require per-position historical snapshots, a larger scope; deferred.
- Any real scheduled/cron-based snapshotting — the on-demand "first request of the day" approach is sufficient for a personal dashboard.
