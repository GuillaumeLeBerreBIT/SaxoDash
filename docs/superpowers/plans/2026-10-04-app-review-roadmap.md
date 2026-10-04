# App Review Remediation Roadmap

> **For agentic workers:** This is a master roadmap, not a task-level plan. Before starting a phase, write that phase's detailed plan with superpowers:writing-plans (file `docs/superpowers/plans/2026-10-04-review-phase-N-<slug>.md`), then execute it with superpowers:subagent-driven-development. Do not start a phase from this document alone.

**Goal:** Fix the wrong figures, misleading labels and broken mobile layouts found in the 2026-10-04 multi-page review, in an order that never reworks the same code twice.

**Architecture:** Five phases, each its own branch and PR cut from `main`: (1) backend correctness, (2) frontend correctness, (3) mobile, (4) polish and accessibility, (5) feature ideas chosen later. Correctness lands before mobile so tables are restructured once, against final data shapes.

**Tech Stack:** Django + DRF + SQLite, Celery, Vite + React 19, Tailwind, Recharts, vitest, Playwright for screenshot review.

**Spec:** Findings below (review of Dashboard, Portfolio, Analytics, Transactions, Accounts, account detail, Spending, Research, Research chart, Earnings, app shell). Discover is out of scope: it is being worked on in `feat/discover-polish`. Screenshots are in the 2026-10-04 session scratchpad under `review/`.

## Global Constraints

- Zero code comments (AGENTS.md); rationale goes in the PR description.
- Test-first. Backend `APITestCase` per app; vitest specs alongside frontend changes.
- A migration is not done until `manage.py migrate` has run against the dev `db.sqlite3`.
- `fmtMoney(value, currency)` for instrument prices, `fmtEur` only for already-converted figures. Money goes through `core.money.Money`.
- One green, one red from `lib/charts.js`; no financial state by colour alone; `Card` is the one container language; check `ui.jsx` primitives first.
- An absent figure is `null` and renders `—`, never zero.
- Each phase ends green on: `cd frontend && npx vitest run && npx eslint <touched> && npm run build`, `cd backend && python manage.py test`, and a 1440px + 390px screenshot pass of every touched page.
- Branch from `main`, not from `feat/discover-polish`. `frontend/src/pages/Transactions.jsx`, `lib/logos.js` and `lib/logos.test.js` carry the user's uncommitted work: do not stash, reset or overwrite them; start Phase 1/2 only after they are committed or the user says otherwise.
- Decisions already made: mobile nav is a bottom tab bar plus a "More" sheet; Analytics is gated by history length (a positions-based series is a later option, not in this roadmap); Transactions get `currency` and `fx_rate`, backfilled.

## Review Focus

- A transaction with no matching position (sold out, so nothing to backfill from): currency must be `null`/`—`, not guessed or defaulted to EUR.
- A month where credits exceed spend: the Spending trend must show zero spend for it, not drop the month.
- Analytics with fewer days of history than a period needs: `null` per metric, never `0.0`, and no alpha against a mismatched window.
- A bank account id that does not exist, and an account with 0 and with 1000+ rows.
- A symbol whose Elbstream logo 404s and a Saxo SIM position priced from the fallback ladder: the UI must still read honestly.

## Findings by phase

### Phase 1 — Backend correctness (branch `fix/review-backend`)

| # | Finding | Where | Change |
|---|---|---|---|
| 1.1 | `page_size` query param ignored everywhere (Dashboard "Last 5" shows 10; Transactions page_size=1000 also ignored) | `backend/backend/settings.py` (`PAGE_SIZE_QUERY_PARAM` is not a DRF setting) | Add a `PageNumberPagination` subclass with `page_size_query_param='page_size'`, a `max_page_size`, make it the default, delete the bogus key. Audit every `page_size` caller in the frontend |
| 1.2 | Transactions price/total are instrument-currency but shown as EUR; no currency field | `transactions/models.py`, serializer, `saxo` `sync_positions` | Migration adding `currency` (nullable) and `fx_rate` (nullable); populate in `sync_positions`; data migration backfilling from the matching `Position`; expose `currency`, `fx_rate`, `total_eur`; run `migrate` on the dev DB |
| 1.3 | Spending trend drops any month whose net is ≥ 0 and nets across categories, unlike `spending_summary` | `enablebanking/services.py::spending_trend` | Use the same per-category rule as `spending_summary`; return a continuous 6-month series with zeros; flag the current month as partial |
| 1.4 | Spending "vs last period" compares 4 days with the 4 days before | spending summary service | Compare against the same span of the previous month, and say so in the payload (`comparison_label`) |
| 1.5 | Dashboard "Spent MTD" includes tomorrow-dated rows; differs from Spending | summary endpoint + `lib/periods.js` | Decide the future-dated-row policy (default: exclude rows after today) and apply it in one place |
| 1.6 | Accounts "Bank balance" chart includes the Saxo cash account (€971k vs €833 headline) | accounts history endpoint | Bank-only series: exclude `saxo:cash` server-side |
| 1.7 | Analytics: every period +0.0%, annualised 3Y/5Y from 8 days, alpha against full-period benchmark, Sharpe/Sortino/Beta/IR from 8 days, projection from 8 days | `analytics/metrics.py::performance_summary`, `report.py` | Each metric and period returns `null` plus `needs_days` when history is too short; no annualising under 1 year; benchmark compared over the portfolio's own window only; expose `history_days` |
| 1.8 | Earnings events with no session counted as "After close"; negative revenue actuals; duplicate (symbol, date) rows | earnings service/serializer | Emit `session: null` explicitly; null out negative revenue; de-duplicate by symbol + date + quarter |
| 1.9 | Research news has undecoded HTML entities | `research` news shaping | Decode entities server-side |

Open questions for Phase 1: why a €2.7k credit is categorised `REFUND_CREDIT` rather than income or transfer (investigate, do not silently recategorise); whether sold-out positions have anything to backfill currency from.

### Phase 2 — Frontend correctness (branch `fix/review-frontend`)

Depends on Phase 1 payloads.

| # | Finding | Where |
|---|---|---|
| 2.1 | Price in instrument currency, total per Phase 1; BUY shown as `−`, inflows `POSITIVE`; type chips derived from types present in the data | `Transactions.jsx`, `Dashboard.jsx` recent transactions |
| 2.2 | Portfolio Total row from `summary`, no Qty total; value chart uses a padded domain and the series that matches `total_value`, or is relabelled | `Portfolio.jsx`, `HistoryAreaChart` |
| 2.3 | Dashboard: "+6.41% since purchase" label, hero deltas labelled "net worth", Currency card retitled "Portfolio currency", empty Losers hidden, net-worth chart default and legend fixed | `Dashboard.jsx` |
| 2.4 | Analytics renders `null` as `—` with a "needs N more days" note, no `−0.0%`, Best/Worst/Positive months `—` when one month, drawdown axis minimum span, calendar-year empty state, projection x-axis ticks one per year, mismatched-window alpha gone | `Analytics.jsx` and its tab components |
| 2.5 | Accounts: one sync badge per bank with reason and last-synced time; bank-only chart; spending-delta wording | `Accounts.jsx` |
| 2.6 | Account detail: not-found state, pagination, search and category filter, amounts signed and coloured, description shown | `AccountTransactions.jsx` |
| 2.7 | Spending: trend chart month labels ("Jun '26"), partial-month marker, "Other" excluded from "Top category", small donut slices folded into Other, transfers InfoTip | `Spending.jsx` |
| 2.8 | Earnings: three-way session split (before / after / not set), revenue formatting (`<1M`, one decimal under 10M), Qtr column no-wrap, unique keys, "This week" reset, day-of-month on cards | `Earnings.jsx` |
| 2.9 | Research: margin-trend percent axis, cash-chart axis width and `$35B` format, rail badge hidden under 0.005 and name cell truncating, Position note only when the quote is not live, "today" vs "Latest session" derived from the last bar date, news capped with "Show more", Recent not recording unresolved symbols, ETF copy | `Research.jsx`, `WatchlistRail.jsx`, valuation/earnings charts |
| 2.10 | ⌘K palette: add Discover and Spending, share one nav list with `Sidebar`; rank exact ticker prefix above leveraged ETFs | `lib/commands.js`, `Sidebar.jsx` |

### Phase 3 — Mobile (branch `fix/review-mobile`)

Depends on Phase 2 so tables are restructured once.

| # | Change |
|---|---|
| 3.1 | Shell: below 768px a bottom tab bar (Dashboard, Portfolio, Research, Spending) plus a "More" sheet for the rest; `<main>` loses its left margin; the sidebar rail remains for ≥768px |
| 3.2 | `PageHeader`: right slot wraps below the title on small screens |
| 3.3 | One shared responsive table pattern in `ui.jsx` (stacked rows or priority columns) applied to Holdings, Dashboard recent transactions, Transactions, account detail, Earnings |
| 3.4 | Per-page fixes: Transactions toolbar and chips, Accounts badges and suggestion rows, Spending budget rows, Analytics projection tiles and header, Research chart height and OHLC readout, 4-pane small-pane readout |
| 3.5 | A Playwright overflow check script (documented in `docs/`) that fails when `documentElement.scrollWidth > innerWidth` on every route at 390px, used as the phase gate |
| 3.6 | Move `SaxoConnectionStatus` into the shell as a compact status dot; full badge stays where it is needed |

### Phase 4 — Polish and accessibility (branch `fix/review-polish`)

Heading hierarchy (`h1` vs card titles), consistent header spacing, `aria-pressed` on chips, `aria-label` on pagination arrows and per-row selects, tablist semantics on Research tabs, 44px touch targets, ISO vs "04 Oct" dates unified, login labels and `role="alert"`, bare loading/error states as `Card` with retry, "Clear filters" action, logo fallback, nice axis ticks, 4-pane empty-pane headers.

### Phase 5 — Feature ideas (choose later, one plan each)

Sortable Holdings/Transactions columns and date/account filters; spending category click-through to Transactions; uncategorised review queue; linked crosshair and time range across chart panes; compare overlay; "Sync now" on Accounts; total monthly subscription cost; positions-based analytics series.

## Execution order and dependencies

1. Phase 0: confirm the user's uncommitted work is committed; fix the screenshot recipe in the `saxodash-design-system` skill (`User.objects.get()` fails because the app has two users; the extra `_ui_audit_tmp` user predates this review).
2. Phase 1 (1.1 → 1.2 first; 1.3–1.9 independent and can run in parallel subagents on separate files).
3. Phase 2 (2.1 needs 1.2; 2.4 needs 1.7; 2.6 needs 1.1; the rest independent).
4. Phase 3 (3.1–3.2 first, then 3.3, then 3.4–3.6).
5. Phase 4, then pick Phase 5 items.

Each phase: detailed plan → subagent-driven execution → phase gate (tests, build, dev-DB migrate, 1440 + 390 screenshots) → PR.

## Self-review

- Every finding in the review maps to a row above except the Dashboard heatmap legend range in "Since purchase" mode and the Portfolio sector donut palette, which are unverified and go into the Phase 2/4 plans as "verify first".
- Interfaces between phases: Phase 1 adds `currency`, `fx_rate`, `total_eur` on transactions, `needs_days`/`history_days` on analytics, `comparison_label` and partial-month flags on spending, `session: null` on earnings; Phase 2 consumes exactly these names.
