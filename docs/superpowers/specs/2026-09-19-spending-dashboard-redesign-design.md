# Spending Dashboard Redesign — Design

**Status:** Approved by user 2026-09-19, proceeding directly to implementation plan + subagent-driven execution.

## Problem

The Spending page (`frontend/src/pages/Spending.jsx`) and its supporting backend
(`backend/enablebanking/services.py`) grew as a collection of independently
built widgets rather than a coherent dashboard. A critical review (see chat
transcript, 2026-09-19) found:

1. `Spending.jsx` calls `useSpendingSummary()` with no date args → "Total
   spending" is an **all-time** sum, while `SpendingCategoryChart` labels it
   "This period" (false) and the Dashboard tile scopes the same metric to
   month-to-date (`Dashboard.jsx:39`). Two pages, two periods, no period ever
   shown.
2. `spending_summary()` (`services.py:12-17`) filters `amount__lt=0` before
   grouping, so **every credit is dropped** before aggregation — refunds are
   not netted against their category as `CONTEXT.md` and `categorization.py`
   document, they simply vanish.
3. `BudgetSection.jsx:9-14` merges current-month `budget_progress()` rows
   with fallback rows built from the page's (all-time) `spending_summary`
   categories — two different periods rendered as identical-looking rows in
   one list.
4. No period control exists anywhere on the page; the trend chart is
   hardcoded to 6 months.
5. Category distribution is bar-only; the app already has a working donut
   (`AllocationDonut`) used for portfolio allocation that isn't reused here.
6. The KPI strip has only Total + Transfers — no previous-period comparison,
   transaction count, or top category (Dashboard's tile has "top category",
   the Spending page itself doesn't).
7. The Budgets card renders an editable row for every category the user has
   ever spent in, whether or not they've opted into budgeting it — this is
   the "disproportionately complex for its value" feeling.
8. The page is a single vertical stack of full-width Cards, unlike the
   Dashboard's grid-heavy layout — this, not typography or padding (both
   confirmed identical to the rest of the app), is the source of the
   "everything feels oversized" complaint.

## Decisions

- **Spending definition (updated in `CONTEXT.md`):** net outflow per
  Category for an explicit period = debits minus any Refund/Credit that
  nets against the same Category, excluding Transfer and Savings entirely.
  An unscoped Spending figure is now explicitly a bug.
- **Refund netting: implement it for real** (Design option (b) from the
  review). `spending_summary`/`spending_trend`/`budget_progress` stop
  pre-filtering to debits only; they group signed amounts by
  `effective_category`, excluding only `TRANSFER`/`SAVINGS`.
- **Income vs. spending: explicitly out of scope.** `categorization.py`'s
  `INCOME` keyword list is empty — income is never auto-detected today, only
  reachable via manual override. Building a KPI on data that's effectively
  always empty would add noise, not clarity. Revisit once income detection
  exists.
- **Credit-card payments:** not modeled in this app (Enable Banking only
  covers KBC/Argenta checking/savings here) — no change needed.
- **Periods are calendar-aligned**, not rolling windows, because Budgets are
  inherently calendar-month and a rolling window would conflict with that.
- **Budgets stay monthly-only, decoupled from the page period selector.**
  Budgets section always shows the current calendar month, labeled
  explicitly ("Budgets — this month"), regardless of what period the rest
  of the page is showing. This removes the period-mixing bug outright by
  making the two periods visually and structurally distinct instead of
  merged into one list.
- **Budgets become opt-in.** Only categories with a `Budget` row render;
  everything else is reachable through a lightweight "Add a budget"
  control, not a wall of empty "Set limit" inputs.

## Data model changes

None. `Budget`, `BankTransaction.effective_category`, `CATEGORY_CHOICES`,
`BUDGETABLE_CATEGORIES` are all unchanged. This is a business-logic and
presentation redesign, not a schema change.

## Backend changes

### `services.py`

Replace the debit-only aggregation with a signed aggregation excluding
Transfer/Savings, and add a period-comparison helper:

Shape of the change (illustrative, not final code — the plan task writes
the exact, tested version):

- Apply the same `date_from`/`date_to` filters as today, but do **not**
  filter to `amount__lt=0` up front.
- Annotate `effective_category = Coalesce('category_override', 'category')`
  as today, `exclude` only `TRANSFER`/`SAVINGS`, then `Sum('amount')` per
  category — this is the signed net (debits negative, netting credits
  positive) instead of a debit-only sum.
- A category whose signed sum is `>= 0` (e.g. fully refunded) is **dropped**
  from `categories`, not shown as negative spending.
- `categories` becomes `[{category, amount}]` with `amount = -total` for
  every category whose signed total is negative.
- `total` is the sum of those `amount`s.
- `transfers` keeps its current query (sum of `TRANSFER`/`SAVINGS`,
  date-scoped the same way) — unaffected by the netting change, since those
  categories were already handled separately.
- New `transaction_count`: count of transactions in the period whose
  `effective_category` is not `TRANSFER`/`SAVINGS` and whose `amount < 0`
  (a netting credit is not itself "a transaction of spending", it reduces
  one — count the debit side only).

`spending_trend(months=6)` gets the same treatment: drop the `amount__lt=0`
filter, exclude only `TRANSFER`/`SAVINGS`, sum signed amounts per month.

`budget_progress()` gets the same signed-sum treatment for its per-category
`spent` figure, for consistency with the page-level definition.

### New: previous-period comparison

`SpendingSummaryView` accepts `date_from`/`date_to` as today. The plan adds
a same-length previous period computed server-side (e.g. this month vs. last
month, or a custom range vs. the immediately preceding range of equal
length) and returns it alongside the current period:

```
GET /api/enablebanking/spending/summary/?date_from=2026-09-01&date_to=2026-09-30

{
  "categories": [...],
  "total": "842.10",
  "transfers": "500.00",
  "transaction_count": 37,
  "previous_period": {
    "date_from": "2026-08-01", "date_to": "2026-08-31",
    "total": "910.44"
  }
}
```

Frontend computes `delta_pct` client-side from `total` vs.
`previous_period.total` (simple arithmetic, no need to duplicate it
server-side).

### `SpendingTrendView`

No response-shape change; the frontend will request a window sized to the
selected period's granularity (e.g. still "last 6 months" for a monthly
view) rather than a hardcoded prop with no relation to the page period.

## Frontend changes

### New: `PeriodSelector` component

A small control (This month / Last month / Last 3 months / Custom range)
that owns the selected `{date_from, date_to, label}` and is the single
source of truth for every period-scoped query on the page. Lives in
`Spending.jsx`, passed down as data (not context — this page is the only
consumer).

### Category distribution: donut + ranked list, side by side

Reuse `AllocationDonut` (already generic over `{name, value, color}` items)
for category share. Pair it in a 2-column grid with a ranked list showing
exact € and % share per category — same data, two views, no redundant
third chart.

### `BudgetSection` rework

- Only render rows for categories with an existing `Budget`.
- Add a compact "Add a budget" control (category select + amount) for the
  categories that don't have one yet.
- Card header explicitly reads "Budgets — this month" so it's visually
  distinct from the page's period selector, which may show a different
  range.

### KPI strip

Total spending (with `date_from`–`date_to` label and a Δ vs. previous
period), Transactions (count), Top category, Transfers (kept, muted/
secondary as today).

### Page layout

Adopt the Dashboard's existing grid patterns instead of a single vertical
stack: KPI strip → 2-column (donut + ranked list) → trend chart (full
width) → Budgets → Subscriptions. No new spacing/typography tokens.

### Dashboard tile

`Dashboard.jsx`'s spending tile already scopes to month-to-date correctly;
it gains the response's `transaction_count`/`previous_period` only if useful
there too (kept minimal — the tile's job is a glance, not a breakdown).

## Testing

- Backend: rewrite `spending_summary`/`spending_trend`/`budget_progress`
  tests to prove netting (a matched refund reduces its category's total,
  not just "credits are ignored"), and to prove `TRANSFER`/`SAVINGS`
  remain fully excluded either direction (debit or credit).
- Frontend: `PeriodSelector` unit tests; `BudgetSection` tests updated for
  opt-in-only rendering (extending the existing filter tests from the
  earlier budgets work); donut+list pairing tested with the existing
  `chartPlaceholderFor` empty/loading conventions.

## Out of scope

- Income vs. spending metric (no data yet).
- Credit-card-specific handling.
- Rolling (non-calendar) periods.
- Any change to Transfer/Savings detection logic itself.
