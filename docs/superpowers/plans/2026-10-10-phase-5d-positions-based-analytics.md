# Phase 5D: Positions-based Analytics Series (future plan, not started)

> Status: scoping note saved on 2026-10-10 for a later session. Not approved, not implemented. It begins with a feasibility check, not code. When picked up, run brainstorming (spike path first: "can we rebuild past holdings?"), then write the full TDD plan only if the answer is yes.

**Goal:** Compute Analytics (returns, volatility, Sharpe/Sortino, drawdown, beta against a benchmark, calendar-year returns) from the investments you actually hold, so cash deposits and withdrawals do not look like performance and history can reach back further than the recorded snapshots.

## How it works today (verified 2026-10-10)

`backend/analytics/views.py::_portfolio_dated_values` builds the one series every metric uses: `NetWorthSnapshot.saxo_account_value` (Saxo's reconciled cash plus positions total), weekdays only, days with a null value excluded. Metrics are in `analytics/metrics.py`; `history.py` decides how many days each metric needs (`needs_days`/`history_days`); `analytics/report.py` composes risk/performance with a best-effort benchmark (`benchmarks.eur_closes`, Saxo charts, converted to EUR).

Consequences the user sees: a deposit or withdrawal moves the series and reads as return; every figure needs enough snapshot days ("needs N days"); the series is only as long as the app has been recording.

## The central question (answer first, in a spike)

Can past holdings be reconstructed reliably? Findings so far, to be confirmed:
- `Position` (`backend/portfolio/models.py`) is the CURRENT book only: one row per ticker with today's qty. There is no quantity-by-day table.
- `Transaction` rows (`backend/transactions/models.py`) hold BUY/SELL with date, qty, price, fx_rate, but AGENTS.md records that `sync_positions` writes them from the same `/port/v1/positions/me` fetch as the open positions. That implies positions that were fully closed may never appear, so cumulative quantity by day could be wrong for anything already sold. DIVIDEND/DEPOSIT/FEE rows are never written (the SIM has no itemised cash endpoint).
- The SIM account has no market-data entitlement, but Saxo daily charts work (they are what benchmarks and the Research chart use), so per-position daily closes are obtainable.

Spike deliverable: a short written answer with evidence, in the repo (docs/notes or a learning record): (1) is the trade history complete enough to rebuild quantity by day for every ticker you hold today, (2) what happens for closed positions, (3) how many Saxo chart calls a rebuild costs and whether the existing chart cache covers it, (4) whether the result differs materially from the current series (compare both series over the overlapping period on the real data).

## If feasible: shape of the work (sketch only)

1. Backend: a pure function building the daily value series from (quantity by day, daily closes in instrument currency, fx to EUR), kept in `analytics/` next to `history.py`; money rules from AGENTS.md apply (`core.money.Money`, currencies are never summed implicitly; a missing price for a day is a gap or carry-forward decided and tested, never a zero).
2. A series choice for the metrics: keep the current series as the default, add the positions-based one behind a query param or a toggle on Analytics, and show which series the figures came from. Do not silently change numbers the app already shows.
3. Frontend: a small selector on Analytics, the `needs_days`/history copy updated to the chosen series, and the existing charts unchanged.

## If not feasible

Record why, and consider the smaller alternative: strip external cash flows from the current series using DEPOSIT/withdrawal events if a source for them ever exists (it does not today), or leave Analytics as it is and say in the UI that figures include cash movements.

## Constraints to carry into the plan

- Zero code comments; test-first; backend `APITestCase` per app is the primary coverage; migrations are not done until `manage.py migrate` has run against the dev database.
- No third-party price data (decided; Saxo only).
- Numbers the app already shows must not change without being stated in the PR.
