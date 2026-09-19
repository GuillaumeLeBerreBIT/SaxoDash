# Budgets & Spending Alerts — Design Spec

**Date:** 2026-09-19
**Status:** Approved (design)
**Scope:** Backend (`backend/enablebanking/` extended) + inline additions to the existing Spending page and Dashboard

## Context

The bank transaction sync, rule-based categorization, transfer detection, subscription
detection, and Spending page (`docs/superpowers/specs/2026-09-18-bank-transactions-spending-design.md`)
are shipped and working end to end. That spec's Non-goals section explicitly deferred
budgets and alerts: *"Explicitly deferred — each is a substantial feature in its own
right, better designed once real categorized data exists to design against."* That
data now exists. This spec covers that deferred milestone.

**Categorization dependency, verified before this spec was written**: budgets do not
introduce any new categorization mechanism. They read `BankTransaction.effective_category`
(the `category_override`-aware property already shipped), which is itself assigned by
`categorization.categorize()` — a hardcoded keyword-matching rule table against the
merchant name/description Enable Banking sends, not Enable Banking's own
`merchant_category_code`/`bank_transaction_code` fields (deliberately unused, per the
original spec's Non-goals — those fields' population is inconsistent across ASPSPs and
would need live per-bank verification before being trustworthy). A budget's accuracy is
therefore only as good as the existing categorizer: an unrecognized merchant falls to
`OTHER` (or `REFUND_CREDIT` for an unmatched credit) until corrected via
`category_override`, exactly as it already does for the Spending page's category
breakdown. This is a known, accepted trade-off carried over unchanged, not a new risk
introduced by this feature.

## Goal

Let the user set a monthly spending limit per category, see progress against it on the
Spending page, and surface categories that have gone over their limit as a Dashboard
attention item — using only categorized bank-transaction data that already exists, no
new categorization logic, no new notification infrastructure.

## Non-goals (YAGNI)

- **ML-based or bank-provided-code categorization.** Explicitly considered and
  rejected for this pass (see Context) — rule-based `categorization.py` plus manual
  `category_override` is the right level of engineering for this app's real scale
  (two personal bank accounts, a handful of transactions a month). Revisit only if
  real usage shows the rule table failing often despite reasonable keyword
  maintenance.
- **Rollover.** Every month resets to the flat configured limit — no
  surplus/deficit carried forward. Simplest model, matches how `spending_summary`/
  `spending_trend` already frame everything in flat calendar-month terms.
- **Configurable budget periods.** Monthly only — no weekly/yearly option.
- **Budget-limit change history.** A `Budget` row has exactly one current
  `monthly_limit`. Editing it re-evaluates the *entire* current month against the
  new number; there is no per-day/before-and-after split for a limit changed
  mid-month.
- **Email or push notifications.** "Alerts" means visual UI state only — a
  progress-bar color and a Dashboard attention item. This app has no
  email/push-sending infrastructure today, and building one is out of scope here.
- **Budgets for non-discretionary categories.** `TRANSFER`, `SAVINGS`, `INCOME`,
  and `REFUND_CREDIT` are not budgetable — they aren't discretionary spend, and
  three of the four are already excluded from `spending_summary`'s spend total for
  the same reason.
- **A separate Budgets page.** Everything lives inline on the existing Spending
  page, per explicit choice — no new route, no new nav entry.
- **A warning tier below 100%.** Attention triggers only at/above 100% (over
  budget) — no "approaching" state, by explicit choice, to keep the signal clean
  rather than noisy.

## Architecture

Extends the existing `backend/enablebanking/` app — budgets are a natural extension of
data this app already owns (`BankTransaction`, `CATEGORY_CHOICES`, `spending_summary`),
not a separate concern.

### New model

```
Budget
  category         CharField, choices = BUDGETABLE_CATEGORIES, unique
  monthly_limit    DecimalField
```

`BUDGETABLE_CATEGORIES` is `CATEGORY_CHOICES` filtered to the 10 genuine
discretionary-spend categories: `GROCERIES, DINING, TRANSPORT, UTILITIES,
SUBSCRIPTIONS, SHOPPING, HEALTH, TRAVEL, ENTERTAINMENT, OTHER`. One row per
category — a category either has a budget (one row) or doesn't (no row, not
tracked). No user/account dimension: this app is single-user throughout, same as
every other model here.

### Component changes

| File | Change |
|---|---|
| `enablebanking/models.py` | Add `BUDGETABLE_CATEGORIES` (module-level, derived by filtering `CATEGORY_CHOICES`) and the `Budget` model. |
| `enablebanking/admin.py` | Register `Budget` (list_display: category, monthly_limit). |
| `enablebanking/services.py` | Add `budget_progress()` — for every `Budget` row, sum this calendar month's outflows where `effective_category` matches (same `Coalesce('category_override', 'category')` + `amount__lt=0` pattern `spending_summary` already uses, scoped to the current month via `booking_date__gte`/`__lte` on the first/last day of today's month), returning `[{"category", "limit", "spent", "pct"}, ...]`. `pct` is `spent / limit * 100`, uncapped (a category at 142% of budget reports `142`, not clamped to `100`) — division by zero is not a runtime concern since `monthly_limit` is validated to be strictly positive at write time (see Error Handling), never persisted as zero. The progress *bar's visual width* is separately clamped to 100% in the frontend (a bar can't physically exceed its container), but the numeric percentage shown as text is not. |
| `enablebanking/serializers.py` | Add `BudgetSerializer` (category, monthly_limit). |
| `enablebanking/views.py` | Add `BudgetListView` (`GET` list all, `PUT` upsert-by-category — body `{"category": ..., "monthly_limit": ...}`) and `BudgetProgressView` (`GET`, returns `budget_progress()`). |
| `enablebanking/urls.py` | `path('budgets/', BudgetListView.as_view())`, `path('budgets/progress/', BudgetProgressView.as_view())`. |

### Frontend

| File | Change |
|---|---|
| `api/client.js` | `getBudgets()`, `setBudget(category, monthlyLimit)`, `getBudgetProgress()`. |
| `api/queries.js` | `useBudgets()`, `useSetBudget()` (mutation, invalidates both budgets and progress keys), `useBudgetProgress()`. |
| `components/BudgetProgressBar.jsx` (new) | One category's row: an editable limit input (defaults to empty/unset), a progress bar colored green (<80%), amber (80–100%), red (≥100%), and the raw `€spent / €limit` text. Renders only for categories that appear in `spending_summary`'s current-month breakdown *or* already have a budget set — so an unbudgeted category with real spend still shows an "set a budget" affordance, not nothing. |
| `pages/Spending.jsx` | Renders one `BudgetProgressBar` per eligible category, placed directly under `SpendingCategoryChart` (budgets are a refinement of the category breakdown immediately above them, not a separate section). |
| `pages/Dashboard.jsx` | `useBudgetProgress()` filtered to `pct >= 100`, mapped to the same `{kind, severity, text}` shape `insights.attention` already uses, concatenated with `insights.attention` client-side before passing the combined array to the existing `AttentionBand` component. No backend coupling between `enablebanking` and `portfolio` — the merge happens only in the Dashboard page component. |

## Data Flow

**Setting a budget:** `PUT /api/enablebanking/budgets/` with `{category, monthly_limit}`
→ `Budget.objects.update_or_create(category=..., defaults={'monthly_limit': ...})`.
No validation beyond "positive number" — a `monthly_limit` of exactly `0` is
rejected (see Error Handling), since a zero-limit budget makes `pct` undefined and
communicates nothing a user couldn't express by just not setting a budget at all.

**Reading progress:** `GET /api/enablebanking/budgets/progress/` → `budget_progress()`
queries `BankTransaction` fresh on every call (on-demand, like `spending_summary`) —
no precomputation, no periodic task, no staleness window.

**Dashboard attention merge:** purely client-side, at render time, in `Dashboard.jsx` —
two independent React Query hooks (`usePortfolioInsights`, `useBudgetProgress`), their
`attention`-shaped arrays concatenated before being passed to `AttentionBand`.

## Error Handling

- `monthly_limit <= 0` is rejected by `BudgetListView`'s `PUT` with a 400 — a budget
  must be a real positive limit.
- A `category` not in `BUDGETABLE_CATEGORIES` is rejected with a 400 (mirrors
  `BankTransactionCategoryView`'s existing `category not in dict(...)` check).
- `budget_progress()` for a category with `spent == 0` this month returns `pct: 0`,
  not a division error — no special-casing needed since `spent` is always a real
  (possibly zero) aggregate, never `None`.

## Testing

Mirrors the existing `enablebanking` testing shape exactly:

- `Budget` model — unique-per-category constraint, `BUDGETABLE_CATEGORIES` excludes
  `TRANSFER`/`SAVINGS`/`INCOME`/`REFUND_CREDIT`.
- `services.budget_progress()` — pure aggregation logic tested against real
  `BankTransaction` rows (current-month scoping, `effective_category` respecting
  `category_override`, a category with a `Budget` row but zero spend still appears
  at `pct: 0`, a category with spend but no `Budget` row is absent from the result).
- `BudgetListView`/`BudgetProgressView` — DRF `APITestCase`, including the
  zero/negative-limit and invalid-category rejection cases.
- Frontend — `BudgetProgressBar` rendering the three color bands at representative
  percentages; `Spending.jsx` test extended to mock `useBudgetProgress`; `Dashboard.jsx`
  test extended to confirm an over-budget category appears in the merged attention list
  alongside a portfolio-sourced attention item, without asserting on `AttentionBand`'s
  internals (same "don't test the shared component's own rendering, only that this
  page feeds it correctly" discipline already used elsewhere).

## Constraints (carried from the codebase / working agreement)

- Local dev only.
- Single-user, no tenancy — same as every other model in this app.
- EUR-only, no currency conversion.
- Categories are a fixed set in code; `BUDGETABLE_CATEGORIES` is a filtered view of
  the same `CATEGORY_CHOICES` single source of truth, not a separate list to keep
  in sync by hand.
