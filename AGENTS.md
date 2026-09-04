# AGENTS.md — SaxoDash

Full design context: `docs/superpowers/specs/2026-07-13-saxodash-design.md`.
Read it before starting implementation work if you haven't already.

## What this is

A personal finance dashboard (Django REST Framework backend, Vite + React
frontend) rebuilding the SaxoDash Claude Design mockup into a real app.
Current milestone: Dashboard, Portfolio, Transactions, Accounts and
Research, against the live Saxo OpenAPI. Earnings, Analytics and
bank-aggregation are future milestones — do not pull them forward mid-task.

Research shipped as v1 = everything Saxo can power. Company fundamentals
and macro series (P/E, market cap, dividend yield, analyst ratings, Buffett
indicator) wait on a second data provider and render as ComingSoon panels
until one is chosen.

## Running the stack

`scripts/dev.sh` starts redis, the celery worker, celery beat, Django and
Vite in one terminal, prefixed and colour-coded per service, each gated on a
readiness probe so "stack up" means it. Ctrl-C (or SIGHUP) stops everything
it started; an already-running redis is reused and left alone.

Services are declared in one table near the top of the script — adding a
sixth is one `service` line, and `--no-<name>` works for it automatically.
Flags: `--no-redis|worker|beat|web|ui` (`--no-frontend` aliases `--no-ui`)
and `--reclaim`, which clears leftovers from a killed run instead of dying
on a held port. Ports come from `backend/.env` so they can't drift from the
backend's own config; override per-run with `WEB_PORT` / `UI_PORT` /
`REDIS_PORT`. Per-service logs land in `.dev/logs/` (gitignored).

Full reference — flags, troubleshooting, adding a service:
`docs/running-the-stack.md`.

## Working agreement (read this before writing any code)

**Backend (`backend/`, Django/DRF): coach mode.**
Explain the pattern, show a short snippet or pseudocode if useful, flag
gotchas — do not edit backend files directly. The user writes the actual
models/serializers/views/tests themselves. This is a deliberate learning
constraint, not a capability gap — don't "helpfully" write the file anyway.

**Frontend (`frontend/`, Vite/React): propose-then-choose.**
For each component or page, show a snippet or worked example with an
explanation of what it does and why, then ask whether the user wants to
write it themselves from the example or have you apply it directly.
Don't default silently to one or the other.

**Testing**: backend is the primary coverage (DRF `APITestCase` per app).
The frontend has a small vitest suite too — `lib/` helpers, the API client,
and a few components — so add/adjust specs alongside frontend changes.

**Frontend design/polish**: use the `ui-ux-pro-max`, `frontend-design`,
and `dataviz` skills when doing visual/UX work rather than improvising —
they already cover this project's needs.

## Stack

- Backend: Django + DRF, SQLite (dev), JWT auth (SimpleJWT), single user.
- Frontend: Vite + React 19 (JavaScript, not TS), React Router, Recharts,
  Lucide icons, Tailwind. Components are the mockup's own bespoke
  primitives ported as-is — no MUI. `shadcn/ui` may be introduced in a
  later milestone when Research/Banking need dropdowns/modals/comboboxes.

## Code style

Keep inline comments short. Add one only when the code genuinely can't say it
itself — a non-obvious "why", a gotcha, a reference. Don't narrate what the
code does, and don't paste multi-line rationale into a comment: that
explanation belongs in the chat or PR description, not the source. (Some
existing comments are more verbose than this — don't treat them as a
template.)

## Learning workspace (`learning/`, gitignored)

A `/teach` workspace. Two different costs, so two different triggers:

**Learning records — write these unprompted.** After work that surfaced
something non-obvious (a bug whose cause wasn't where you'd look, a framework
behaviour that contradicts the obvious reading, a rejected approach and why),
append `learning/learning-records/NNNN-<slug>.md`. Cheap markdown, no design
pass. Capture the surprise and the reasoning, not a changelog — git already has
the changelog. Skip it when the change was routine.

**Lessons — only when asked.** A lesson is a designed HTML document and it only
pays off when the topic is genuinely the next thing worth learning. Auto-firing
one after every sizable feature produces material on things already known,
which trains the habit of not reading them. Wait for an explicit `/teach`; the
accumulated learning records are what make choosing the right topic possible.

Applies to backend-and-frontend features, infrastructure, and deploy work
alike — the trigger is "was anything surprising here", not the size of the diff.

## Decided

Research page's candlestick source: **Saxo `/chart/v3/charts`**, proxied
and cached by the `research` app, not a TradingView embed and not mock
data. It reuses the OAuth token the portfolio sync already holds, so the
chart, the quotes, the instrument search and "Your position" all come from
one connection.

**Portfolio value comes from Saxo, not from our own arithmetic.**
`/port/v1/balances/me` returns `NonMarginPositionsValue` already converted
to the account currency and reconciled (`TotalValue - CashBalance`), so
`sync_account_balance` stores it as `PortfolioValuation` and
`get_portfolio_value()` prefers it. Summing `qty × price` locally is the
fallback for an unsynced account only — it was the source of a €5,142.64
overstatement, because it depends on prices Saxo may not give us and on a
currency conversion we were not doing.

**Money carries its currency.** Totals go through `core.money.Money`, which
raises `CurrencyMismatch` rather than adding EUR to USD. Instrument prices
(`avg_cost`, `current_price`) stay in the position's own `currency`;
`value`, `cost` and `pnl` are converted with `fx_rate` and are the only
figures safe to sum. `REPORTING_CURRENCY` (default EUR) is what the app
displays.

**The SIM account has no market-data entitlement.** Positions come back with
`CurrentPrice: 0.0` and `CurrentPriceType: 'None'`, and
`/trade/v1/infoprices` answers `NoAccess` — so the Research quote panel
cannot work there, though charts can. `saxo.mapping._mark` walks a ladder
instead: a live price, else `OpenPrice + ProfitLossOnTrade / Amount` (Saxo
marks the book server-side regardless of entitlement), else the open price.
Which rung answered is recorded in `Position.price_source`, so a stale mark
is disclosed rather than passed off as live.

On the frontend this means **`fmtMoney(value, currency)` for a price and
`fmtEur` for anything already converted** — `avg_cost` and `current_price`
are the instrument's currency, `value`/`cost`/`pnl` are not. `lib/pricing.js`
turns `price_source` into the words the UI shows; `PriceBasisNote` stays
silent for a fully live book so the badge keeps meaning something.

**Sync freshness lives on `SyncRun`, not on the credential.** Every sync
task is wrapped in `@synced`, which records `ok` / `skipped` / `failed` per
execution. A task that cannot get a credential used to `return` and be
logged by Celery as a success; and `last_synced_at` on `SaxoCredential`
was destroyed on every re-auth, since the callback deletes and recreates
the row.

**One module answers "is Saxo connected".** `saxo.credentials.connection_state()`
is the only place the question is decided; `active_credential()` wraps it and
the status endpoint reports its `usable` / `unusable_reason` rather than
re-deriving. Two thresholds used to coexist — the endpoint forgave 15 minutes
of token expiry, `active_credential` forgave none — so for those 15 minutes the
header said "Saxo connected" above a panel saying the opposite. The grace window
is still real; it now only decides `needs_reauth`, never usability.

**409 means "the app is not connected to Saxo".** Named once, in
`api/client.js` (`NOT_CONNECTED_STATUS` / `isNotConnected`) and interpreted in
`chartPlaceholderFor`, so a reader gets it right by using the placeholder rather
than by remembering the number.

**An instrument is a uic *and* an asset type**, on both sides of the seam —
`lib/research.js::instrumentKey` builds every market-data cache key. A Uic alone
is ambiguous: a CFD shares one with its underlying by design. Watchlist rows are
keyed on the uic too (`unique_together('watchlist', 'uic')`), because
`NVDA:xnas` and `NVDA:xetr` are different instruments with one ticker.

**Charts fetch the widest range once and slice it.** `RANGES` carries each
range's bar count, `barsForRange` takes the tail. Keying the cache on `count`
made stepping 1W→ALL six Saxo calls for data the last one already held.

**Chart bars are identified by their date, so horizons are daily or coarser.**
`ALLOWED_HORIZONS` is `{1440, 10080, 43200}`. Admitting an intraday horizon
means changing bar identity first — otherwise a session collapses onto one key,
the newest-first sort becomes a no-op and the chart draws backwards. A sample
missing any of open/high/low/close is dropped in `market.to_candle` rather than
passed on as nulls: `indicators.js` sums with `+=`, so a null reads as zero.

**The broker's valuation is preferred only while it is evidence.**
`get_portfolio_value()` takes `PortfolioValuation` when it is denominated in
`REPORTING_CURRENCY` and is younger than `VALUATION_MAX_AGE`; otherwise our own
positions answer, since they carry an `fx_rate` and the valuation does not.
Without the currency test, a USD Saxo account had its total subtracted from a
EUR cost basis and reported as P/L.

**An absent figure is not zero.** `PortfolioSummaryView` sends `total_pnl: null`
when there are no positions to cost the broker's value against — the balance and
position syncs are independent tasks, so that state is reachable, and reporting
the whole book as profit is worse than reporting nothing. `fmtMoney`/`fmtPct`
render null as `—`.

**A currency we cannot sum is the user's problem, not a 500.** `NetWorthView`
answers 409 naming the account; `NetWorthHistoryView` logs and serves the chart
anyway, because recorded history does not depend on today's total.

**Sync health is the worst of each task's latest run**
(`credentials.worst_recent_outcome()`), not whatever ran last — otherwise a
`sync_account_balance` success hides a `sync_positions` that fails every tick.

**`repair_networth_history --apply` demands `--since` and `--until`.** It
multiplies rows in place and records nothing to say it ran, so an unbounded or
repeated run silently rescales rows that were already correct.

## Open decision (not yet made)

The fundamentals provider behind the ComingSoon panels — FMP, Finnhub,
EODHD or similar. Criteria and the v2 outline are in the Research plan.
