# Spending Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Spending page's undefined "spending" semantics (unscoped total, dropped refunds, mixed-period Budgets list) and rebuild it as a coherent, information-dense dashboard: a real period selector, netted spending totals with a previous-period comparison, a donut+ranked-list category view, and an opt-in Budgets section.

**Architecture:** Backend: rewrite `spending_summary`/`spending_trend`/`budget_progress` in `backend/enablebanking/services.py` to net signed amounts by `effective_category` (excluding only `TRANSFER`/`SAVINGS`) instead of pre-filtering to debits only, and add a `transaction_count` + `previous_period` comparison to `spending_summary`. Frontend: a new `PeriodSelector` drives `Spending.jsx`'s queries; `SpendingCategoryChart` becomes a donut (reusing the existing `AllocationDonut`, whose built-in legend already gives the "ranked list" for free); `BudgetSection` becomes opt-in (only categories with a `Budget` row render, plus an "Add a budget" control for the rest), fully decoupled from the page's period selector since budgets are always current-calendar-month.

**Tech Stack:** Django REST Framework (backend), React 19 + Vite + TanStack Query + Recharts (frontend), existing test stacks (Django `TestCase`/`APITestCase`, Vitest + Testing Library).

**Spec:** `docs/superpowers/specs/2026-09-19-spending-dashboard-redesign-design.md`

## Global Constraints

- Refund/credit netting is now real: a `BankTransaction` credit that shares an `effective_category` with debits in the same category/period reduces that category's reported total (spec §"Decisions" — Refund netting).
- `TRANSFER`/`SAVINGS` are excluded from spending entirely and keep their own separate `transfers` figure, computed from debit-side transactions only — unchanged from today's behavior, do not net these two categories against their own credit legs (a transfer's two legs would otherwise cancel to zero).
- Income vs. spending is explicitly out of scope (spec: `INCOME` has no working auto-detection today).
- Periods are calendar-aligned presets (This month / Last month / Last 3 months) plus a custom range — not rolling windows.
- The trend chart (`SpendingTrendChart`) stays independent of the new page-level period selector — it keeps its existing fixed 6-month monthly window. (Refinement made during planning: matching the trend's granularity to an arbitrary selected period, e.g. weekly buckets for "this month", is real added complexity for the backend with no clear payoff over "how has spending trended over the last 6 months" — out of scope here.)
- Budgets stay monthly-only and always show the current calendar month, independent of whatever period is selected elsewhere on the page (spec — this is what removes the mixed-period bug).
- No new frontend dependency; reuse `AllocationDonut`, `StatRow`/`StatStrip`/`PageHeader`, `chartPlaceholderFor`, `fmtEur`/`fmtPct`/`fmtNum`.
- `BankTransaction`, `Budget`, `CATEGORY_CHOICES`, `BUDGETABLE_CATEGORIES` are unchanged — this plan touches business logic and presentation only, no migrations.

---

### Task 1: Net refunds into `spending_summary`, add `transaction_count` and `previous_period`

**Files:**
- Modify: `backend/enablebanking/services.py:1-35`
- Test: `backend/enablebanking/test_spending_service.py`
- Test: `backend/enablebanking/test_transaction_views.py:90-108` (`SpendingSummaryViewTest`)

**Interfaces:**
- Consumes: `BankTransaction.effective_category` (existing property, `backend/enablebanking/models.py:102-104`), `TRANSFER_CATEGORIES = ('TRANSFER', 'SAVINGS')` (existing module constant).
- Produces: `spending_summary(date_from=None, date_to=None)` returns
  `{'categories': [{'category': str, 'amount': Decimal}], 'total': Decimal, 'transfers': Decimal, 'transaction_count': int, 'previous_period': {'date_from': str, 'date_to': str, 'total': Decimal} | None}`.
  Tasks 2 and 3 consume `TRANSFER_CATEGORIES` and the netting pattern established here but do not call `spending_summary` itself. Task 7 (frontend) consumes `transaction_count` and `previous_period` from the `SpendingSummaryView` JSON response.

- [ ] **Step 1: Write the failing tests**

Add to `backend/enablebanking/test_spending_service.py`, inside `SpendingSummaryTest`:

```python
    def test_matched_refund_nets_against_its_category(self):
        self._tx(Decimal('-50'), 'GROCERIES', date(2026, 1, 5), 't1')
        self._tx(Decimal('20'), 'GROCERIES', date(2026, 1, 10), 't2')

        summary = spending_summary()

        by_category = {row['category']: row['amount'] for row in summary['categories']}
        self.assertEqual(by_category['GROCERIES'], Decimal('30'))

    def test_fully_refunded_category_is_dropped_not_shown_negative(self):
        self._tx(Decimal('-50'), 'GROCERIES', date(2026, 1, 5), 't1')
        self._tx(Decimal('60'), 'GROCERIES', date(2026, 1, 10), 't2')

        summary = spending_summary()

        self.assertEqual(summary['categories'], [])
        self.assertEqual(summary['total'], Decimal('0'))

    def test_transaction_count_excludes_transfers_and_credits(self):
        self._tx(Decimal('-40'), 'GROCERIES', date(2026, 1, 5), 't1')
        self._tx(Decimal('-10'), 'DINING', date(2026, 1, 6), 't2')
        self._tx(Decimal('-500'), 'TRANSFER', date(2026, 1, 7), 't3')
        self._tx(Decimal('20'), 'GROCERIES', date(2026, 1, 8), 't4')

        summary = spending_summary()

        self.assertEqual(summary['transaction_count'], 2)

    def test_previous_period_is_computed_for_an_explicit_date_range(self):
        self._tx(Decimal('-40'), 'GROCERIES', date(2026, 2, 5), 't1')
        self._tx(Decimal('-100'), 'GROCERIES', date(2026, 1, 5), 't2')

        summary = spending_summary(date_from='2026-02-01', date_to='2026-02-28')

        self.assertEqual(summary['previous_period']['total'], Decimal('100'))
        self.assertEqual(summary['previous_period']['date_from'], '2026-01-04')
        self.assertEqual(summary['previous_period']['date_to'], '2026-01-31')

    def test_previous_period_is_none_when_unscoped(self):
        summary = spending_summary()
        self.assertIsNone(summary['previous_period'])
```

Add to `backend/enablebanking/test_transaction_views.py`, inside `SpendingSummaryViewTest`:

```python
    def test_includes_previous_period_and_transaction_count(self):
        response = self.client.get('/api/enablebanking/spending/summary/?date_from=2026-01-01&date_to=2026-01-31')
        self.assertEqual(response.data['transaction_count'], 1)
        self.assertEqual(response.data['previous_period']['total'], Decimal('0'))
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test enablebanking.test_spending_service.SpendingSummaryTest enablebanking.test_transaction_views.SpendingSummaryViewTest -v 2`
Expected: the five new `test_spending_service` cases fail with `KeyError: 'transaction_count'` or `KeyError: 'previous_period'` (the netting tests currently pass by coincidence — the point is `transaction_count`/`previous_period` don't exist yet); the two new view assertions fail the same way.

- [ ] **Step 3: Rewrite `spending_summary`**

Replace `backend/enablebanking/services.py:1-35` (everything up to and including the current `spending_summary` function) with:

```python
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Sum
from django.db.models.functions import Coalesce, TruncMonth

from .models import BankTransaction, Budget

TRANSFER_CATEGORIES = ('TRANSFER', 'SAVINGS')


def _previous_period(date_from, date_to):
    length_days = (date_to - date_from).days + 1
    prev_to = date_from - timedelta(days=1)
    prev_from = prev_to - timedelta(days=length_days - 1)
    return prev_from, prev_to


def spending_summary(date_from=None, date_to=None, _include_previous=True):
    qs = BankTransaction.objects.all()
    if date_from:
        qs = qs.filter(booking_date__gte=date_from)
    if date_to:
        qs = qs.filter(booking_date__lte=date_to)
    qs = qs.annotate(effective_category=Coalesce('category_override', 'category'))

    spending_rows = (
        qs.exclude(effective_category__in=TRANSFER_CATEGORIES)
        .values('effective_category')
        .annotate(total=Sum('amount'))
        .order_by('effective_category')
    )
    # A category whose signed total is >= 0 (fully refunded, or nothing but
    # an unmatched credit) is dropped, not shown as negative spending.
    categories = [
        {'category': row['effective_category'], 'amount': -row['total']}
        for row in spending_rows if row['total'] < 0
    ]

    transfers_total = -(
        qs.filter(effective_category__in=TRANSFER_CATEGORIES, amount__lt=0)
        .aggregate(total=Sum('amount'))['total'] or Decimal('0')
    )

    # A netting credit isn't itself "a transaction of spending" - it reduces
    # one. Count the debit side only, same categories excluded as above.
    transaction_count = (
        qs.filter(amount__lt=0)
        .exclude(effective_category__in=TRANSFER_CATEGORIES)
        .count()
    )

    previous_period = None
    if _include_previous and date_from and date_to:
        prev_from, prev_to = _previous_period(
            date.fromisoformat(date_from), date.fromisoformat(date_to),
        )
        prev = spending_summary(
            date_from=prev_from.isoformat(), date_to=prev_to.isoformat(), _include_previous=False,
        )
        previous_period = {
            'date_from': prev_from.isoformat(),
            'date_to': prev_to.isoformat(),
            'total': prev['total'],
        }

    return {
        'categories': categories,
        'total': sum((c['amount'] for c in categories), Decimal('0')),
        'transfers': transfers_total,
        'transaction_count': transaction_count,
        'previous_period': previous_period,
    }
```

Leave `spending_trend` and `budget_progress` (below this block in the same file) untouched for now — Tasks 2 and 3 rewrite them.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python manage.py test enablebanking.test_spending_service.SpendingSummaryTest enablebanking.test_transaction_views.SpendingSummaryViewTest -v 2`
Expected: all pass, including every pre-existing test in `SpendingSummaryTest` (`test_sums_outflows_by_category`, `test_inflows_are_excluded`, `test_transfers_are_reported_separately_and_excluded_from_total`, `test_respects_category_override`, `test_date_range_filters`) — none of their assertions depend on the removed `amount__lt=0` pre-filter.

- [ ] **Step 5: Commit**

```bash
git add backend/enablebanking/services.py backend/enablebanking/test_spending_service.py backend/enablebanking/test_transaction_views.py
git commit -m "feat: net refunds into spending_summary, add transaction_count and previous_period"
```

---

### Task 2: Net refunds into `spending_trend`

**Files:**
- Modify: `backend/enablebanking/services.py` (the `spending_trend` function, immediately below Task 1's changes)
- Test: `backend/enablebanking/test_spending_service.py` (`SpendingTrendTest`)

**Interfaces:**
- Consumes: `TRANSFER_CATEGORIES` (Task 1).
- Produces: `spending_trend(months=6)` unchanged signature and return shape (`[{'month': str, 'total': Decimal}]`), now signed-netted instead of debit-only.

- [ ] **Step 1: Write the failing tests**

Add to `backend/enablebanking/test_spending_service.py`, inside `SpendingTrendTest`:

```python
    def test_matched_refund_reduces_the_months_total(self):
        self._tx(Decimal('-50'), 'GROCERIES', date(2026, 1, 5), 't1')
        self._tx(Decimal('20'), 'GROCERIES', date(2026, 1, 10), 't2')

        trend = spending_trend(months=6)

        by_month = {row['month']: row['total'] for row in trend}
        self.assertEqual(by_month['2026-01'], Decimal('30'))

    def test_fully_refunded_month_is_dropped(self):
        self._tx(Decimal('-50'), 'GROCERIES', date(2026, 1, 5), 't1')
        self._tx(Decimal('50'), 'GROCERIES', date(2026, 1, 10), 't2')

        trend = spending_trend(months=6)

        self.assertEqual([row['month'] for row in trend], [])
```

Note: `_tx` in `SpendingTrendTest` doesn't accept `category_override` — it doesn't need to for these two tests, both use plain `category`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test enablebanking.test_spending_service.SpendingTrendTest -v 2`
Expected: `test_matched_refund_reduces_the_months_total` fails (`by_month['2026-01']` is `Decimal('50')`, the credit was dropped by the current `amount__lt=0` filter, not netted). `test_fully_refunded_month_is_dropped` currently passes by coincidence (the debit-only filter already produces one row with a positive/`50` total there — check actual current output; if it already passes, that's fine, the assertion still holds after the rewrite).

- [ ] **Step 3: Rewrite `spending_trend`**

Replace the existing `spending_trend` function with:

```python
def spending_trend(months=6):
    qs = (
        BankTransaction.objects
        .annotate(effective_category=Coalesce('category_override', 'category'))
        .exclude(effective_category__in=TRANSFER_CATEGORIES)
        .annotate(month=TruncMonth('booking_date'))
        .values('month')
        .annotate(total=Sum('amount'))
        .order_by('month')
    )
    rows = [
        {'month': row['month'].strftime('%Y-%m'), 'total': -row['total']}
        for row in qs if row['total'] < 0
    ]
    return rows[-months:]
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python manage.py test enablebanking.test_spending_service.SpendingTrendTest enablebanking.test_transaction_views.SpendingTrendViewTest -v 2`
Expected: all pass, including the pre-existing `test_groups_by_month`, `test_excludes_transfers`, `test_respects_category_override_for_exclusion`, `test_limits_to_requested_number_of_months`.

- [ ] **Step 5: Commit**

```bash
git add backend/enablebanking/services.py backend/enablebanking/test_spending_service.py
git commit -m "feat: net refunds into spending_trend, drop fully-refunded months"
```

---

### Task 3: Net refunds into `budget_progress`

**Files:**
- Modify: `backend/enablebanking/services.py` (the `budget_progress` function)
- Test: `backend/enablebanking/test_budget_progress.py`

**Interfaces:**
- Consumes: nothing new from Tasks 1-2.
- Produces: `budget_progress()` unchanged signature and return shape (`[{'category', 'limit', 'spent', 'pct'}]`); `spent` is now net of any refund in the same category/month, clamped at `Decimal('0')` (a category with more refunds than spend this month reports `spent=0`, not negative).

- [ ] **Step 1: Write the failing test**

Add to `backend/enablebanking/test_budget_progress.py`, inside `BudgetProgressTest`:

```python
    def test_matched_refund_reduces_spent_this_month(self):
        Budget.objects.create(category='SHOPPING', monthly_limit=Decimal('100'))
        self._tx(Decimal('-71'), 'SHOPPING', date.today().replace(day=1), 't1')
        self._tx(Decimal('21'), 'SHOPPING', date.today().replace(day=1), 't2')

        row = next(r for r in budget_progress() if r['category'] == 'SHOPPING')

        self.assertEqual(row['spent'], Decimal('50'))

    def test_refunds_exceeding_spend_clamp_to_zero_not_negative(self):
        Budget.objects.create(category='SHOPPING', monthly_limit=Decimal('100'))
        self._tx(Decimal('-20'), 'SHOPPING', date.today().replace(day=1), 't1')
        self._tx(Decimal('50'), 'SHOPPING', date.today().replace(day=1), 't2')

        row = next(r for r in budget_progress() if r['category'] == 'SHOPPING')

        self.assertEqual(row['spent'], Decimal('0'))
        self.assertEqual(row['pct'], 0.0)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test enablebanking.test_budget_progress -v 2`
Expected: `test_matched_refund_reduces_spent_this_month` fails (`spent` is `Decimal('71')` today, the credit is dropped by the current `amount__lt=0` filter rather than netted).

- [ ] **Step 3: Rewrite `budget_progress`**

Replace the existing `budget_progress` function's `spent_by_category` query and per-row computation:

```python
def budget_progress():
    today = date.today()
    start = _first_of_month(today)
    end = _first_of_next_month(today)

    spent_by_category = dict(
        BankTransaction.objects
        .filter(booking_date__gte=start, booking_date__lt=end)
        .annotate(effective_category=Coalesce('category_override', 'category'))
        .values('effective_category')
        .annotate(total=Sum('amount'))
        .values_list('effective_category', 'total')
    )

    rows = []
    for budget in Budget.objects.all().order_by('category'):
        total = spent_by_category.get(budget.category, Decimal('0'))
        spent = -total if total < 0 else Decimal('0')
        rows.append({
            'category': budget.category,
            'limit': budget.monthly_limit,
            'spent': spent,
            'pct': float(spent / budget.monthly_limit * 100),
        })
    return rows
```

(This removes the `.filter(amount__lt=0, ...)` from the queryset and instead clamps per-row after netting — `_first_of_month`/`_first_of_next_month` are unchanged, keep them as they are.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python manage.py test enablebanking.test_budget_progress -v 2`
Expected: all pass, including the five pre-existing tests.

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && .venv/bin/python manage.py test`
Expected: all tests pass (this closes out the backend half of the redesign).

- [ ] **Step 6: Commit**

```bash
git add backend/enablebanking/services.py backend/enablebanking/test_budget_progress.py
git commit -m "feat: net refunds into budget_progress, clamp spent at zero"
```

---

### Task 4: `PeriodSelector` component

**Files:**
- Create: `frontend/src/lib/periods.js`
- Create: `frontend/src/lib/periods.test.js`
- Create: `frontend/src/components/PeriodSelector.jsx`
- Create: `frontend/src/components/PeriodSelector.test.jsx`

**Interfaces:**
- Produces: `resolvePeriod(key, now = new Date())` → `{date_from: 'YYYY-MM-DD', date_to: 'YYYY-MM-DD', label: string}` for `key` in `'this_month' | 'last_month' | 'last_3_months'`. `PERIOD_PRESETS`: `[{key, label}]` for the three preset keys, in display order.
- Produces: `<PeriodSelector value={{key, date_from, date_to, label}} onChange={(next) => void} />`. `onChange` receives a full `{key, date_from, date_to, label}` object — for a preset, `{key, ...resolvePeriod(key)}`; for custom, `{key: 'custom', date_from, date_to, label: 'Custom range'}`.
- Task 7 consumes both to drive `Spending.jsx`'s period state.

- [ ] **Step 1: Write `periods.js`**

```javascript
function pad(n) {
  return String(n).padStart(2, '0')
}

function iso(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function firstOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function lastOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export const PERIOD_PRESETS = [
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'last_3_months', label: 'Last 3 months' },
]

export function resolvePeriod(key, now = new Date()) {
  if (key === 'this_month') {
    return {
      date_from: iso(firstOfMonth(now)),
      date_to: iso(now),
      label: `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`,
    }
  }
  if (key === 'last_month') {
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    return {
      date_from: iso(firstOfMonth(lastMonthDate)),
      date_to: iso(lastOfMonth(lastMonthDate)),
      label: `${MONTH_NAMES[lastMonthDate.getMonth()]} ${lastMonthDate.getFullYear()}`,
    }
  }
  if (key === 'last_3_months') {
    const from = firstOfMonth(new Date(now.getFullYear(), now.getMonth() - 2, 1))
    return { date_from: iso(from), date_to: iso(now), label: 'Last 3 months' }
  }
  throw new Error(`Unknown period key: ${key}`)
}
```

- [ ] **Step 2: Write `periods.test.js`**

```javascript
import { describe, expect, it } from 'vitest'
import { resolvePeriod } from './periods'

describe('resolvePeriod', () => {
  it('resolves this_month to the 1st of the month through today', () => {
    const period = resolvePeriod('this_month', new Date(2026, 8, 19))
    expect(period.date_from).toBe('2026-09-01')
    expect(period.date_to).toBe('2026-09-19')
    expect(period.label).toBe('September 2026')
  })

  it('resolves last_month to the full previous calendar month', () => {
    const period = resolvePeriod('last_month', new Date(2026, 8, 19))
    expect(period.date_from).toBe('2026-08-01')
    expect(period.date_to).toBe('2026-08-31')
    expect(period.label).toBe('August 2026')
  })

  it('resolves last_3_months to the 1st of two months ago through today', () => {
    const period = resolvePeriod('last_3_months', new Date(2026, 8, 19))
    expect(period.date_from).toBe('2026-07-01')
    expect(period.date_to).toBe('2026-09-19')
  })

  it('handles a year boundary for last_month', () => {
    const period = resolvePeriod('last_month', new Date(2026, 0, 15))
    expect(period.date_from).toBe('2025-12-01')
    expect(period.date_to).toBe('2025-12-31')
  })
})
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/periods.test.js`
Expected: PASS (this module has no dependency on anything not yet written, so TDD's "write failing test first" step is skipped here — there's no pre-existing wrong implementation to fail against).

- [ ] **Step 4: Write `PeriodSelector.jsx`**

```jsx
import { useState } from 'react'
import { PERIOD_PRESETS, resolvePeriod } from '../lib/periods'

export default function PeriodSelector({ value, onChange }) {
  const [customFrom, setCustomFrom] = useState(value.date_from)
  const [customTo, setCustomTo] = useState(value.date_to)
  const isCustom = value.key === 'custom'

  const inputClass = 'h-8 px-2 bg-zinc-900 border border-zinc-800 rounded text-[var(--fig-xs)] text-zinc-200'

  return (
    <div className="flex items-center gap-2">
      <select
        aria-label="Select period"
        value={isCustom ? 'custom' : value.key}
        onChange={(e) => {
          const key = e.target.value
          if (key === 'custom') {
            onChange({ key: 'custom', date_from: customFrom, date_to: customTo, label: 'Custom range' })
          } else {
            onChange({ key, ...resolvePeriod(key) })
          }
        }}
        className={inputClass}
      >
        {PERIOD_PRESETS.map((p) => (
          <option key={p.key} value={p.key}>{p.label}</option>
        ))}
        <option value="custom">Custom range</option>
      </select>
      {isCustom && (
        <>
          <input
            type="date"
            aria-label="From date"
            value={customFrom}
            onChange={(e) => {
              setCustomFrom(e.target.value)
              onChange({ key: 'custom', date_from: e.target.value, date_to: customTo, label: 'Custom range' })
            }}
            className={inputClass}
          />
          <span className="text-zinc-600 text-[var(--fig-xs)]">to</span>
          <input
            type="date"
            aria-label="To date"
            value={customTo}
            onChange={(e) => {
              setCustomTo(e.target.value)
              onChange({ key: 'custom', date_from: customFrom, date_to: e.target.value, label: 'Custom range' })
            }}
            className={inputClass}
          />
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Write `PeriodSelector.test.jsx`**

```jsx
import { describe, expect, it, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../test/renderWithProviders'
import PeriodSelector from './PeriodSelector'

describe('PeriodSelector', () => {
  it('calls onChange with the resolved period when a preset is picked', () => {
    const onChange = vi.fn()
    renderWithProviders(
      <PeriodSelector
        value={{ key: 'this_month', date_from: '2026-09-01', date_to: '2026-09-19', label: 'September 2026' }}
        onChange={onChange}
      />,
    )

    fireEvent.change(screen.getByRole('combobox', { name: 'Select period' }), { target: { value: 'last_month' } })

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ key: 'last_month' }))
  })

  it('shows two date inputs when Custom range is selected', () => {
    const onChange = vi.fn()
    const { container } = renderWithProviders(
      <PeriodSelector
        value={{ key: 'custom', date_from: '2026-09-01', date_to: '2026-09-19', label: 'Custom range' }}
        onChange={onChange}
      />,
    )

    expect(container.querySelectorAll('input[type="date"]').length).toBe(2)
  })

  it('does not show date inputs for a preset', () => {
    const onChange = vi.fn()
    const { container } = renderWithProviders(
      <PeriodSelector
        value={{ key: 'this_month', date_from: '2026-09-01', date_to: '2026-09-19', label: 'September 2026' }}
        onChange={onChange}
      />,
    )

    expect(container.querySelectorAll('input[type="date"]').length).toBe(0)
  })
})
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/PeriodSelector.test.jsx`
Expected: all 3 pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/periods.js frontend/src/lib/periods.test.js frontend/src/components/PeriodSelector.jsx frontend/src/components/PeriodSelector.test.jsx
git commit -m "feat: add PeriodSelector component and period resolution helper"
```

---

### Task 5: `SpendingCategoryChart` becomes a donut with a ranked legend

**Files:**
- Modify: `frontend/src/lib/charts.js` (add `colorForCategory`, immediately after the existing `colorForTicker` function)
- Modify: `frontend/src/components/SpendingCategoryChart.jsx` (full rewrite)
- Create: `frontend/src/components/SpendingCategoryChart.test.jsx`

**Interfaces:**
- Consumes: `AllocationDonut` (existing, `frontend/src/components/AllocationDonut.jsx` — unchanged), `CATEGORY_LABELS` (existing, `frontend/src/lib/categories.js`), `chartPlaceholderFor` (existing).
- Produces: `colorForCategory(category: string) -> hexColor: string`. `<SpendingCategoryChart categories={[{category, amount}]} isLoading error periodLabel />` — `periodLabel` is new, replacing the old hardcoded "This period" subtitle. Task 7 passes `periodLabel={period.label}` from the `PeriodSelector`'s resolved period.

- [ ] **Step 1: Add `colorForCategory` to `lib/charts.js`**

Insert immediately after the existing `colorForTicker` function (which ends around line 57 with its closing `}`):

```javascript
// Fixed order (not hashed) so the same category always gets the same color
// regardless of how many categories are present in a given period - unlike
// colorForTicker, where an arbitrary/growing ticker set makes a stable hash
// the only practical option.
const CATEGORY_ORDER = [
  'GROCERIES', 'DINING', 'TRANSPORT', 'UTILITIES', 'SUBSCRIPTIONS',
  'SHOPPING', 'HEALTH', 'TRAVEL', 'ENTERTAINMENT', 'OTHER',
]

export function colorForCategory(category) {
  const idx = CATEGORY_ORDER.indexOf(category)
  return HOLDINGS_PALETTE[idx === -1 ? 0 : idx % HOLDINGS_PALETTE.length]
}
```

(`HOLDINGS_PALETTE` is the existing module-level `const` a few lines above `colorForTicker` — it is not exported, which is fine since `colorForCategory` lives in the same module.)

- [ ] **Step 2: Write `SpendingCategoryChart.test.jsx`**

```jsx
import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test/renderWithProviders'
import SpendingCategoryChart from './SpendingCategoryChart'

describe('SpendingCategoryChart', () => {
  it('renders each category as a legend row with its amount and the period label', () => {
    renderWithProviders(
      <SpendingCategoryChart
        categories={[
          { category: 'GROCERIES', amount: '120.00' },
          { category: 'DINING', amount: '40.00' },
        ]}
        isLoading={false}
        error={null}
        periodLabel="September 2026"
      />,
    )

    expect(screen.getByText('Groceries')).toBeInTheDocument()
    expect(screen.getByText('Dining')).toBeInTheDocument()
    expect(screen.getByText('€120.00')).toBeInTheDocument()
    expect(screen.getByText('September 2026')).toBeInTheDocument()
  })

  it('shows a placeholder when there is no spending in the period', () => {
    renderWithProviders(
      <SpendingCategoryChart categories={[]} isLoading={false} error={null} periodLabel="September 2026" />,
    )

    expect(screen.getByText('No data yet')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/components/SpendingCategoryChart.test.jsx`
Expected: FAIL — the current component renders a bar chart with a hardcoded "This period" subtitle and no plain-DOM legend rows, so `screen.getByText('September 2026')` and the legend-row assertions don't find anything.

- [ ] **Step 4: Rewrite `SpendingCategoryChart.jsx`**

```jsx
import { fmtEur } from '../lib/format'
import { colorForCategory } from '../lib/charts'
import { Card, CardHeader } from './ui'
import { chartPlaceholderFor } from '../lib/chartState'
import { CATEGORY_LABELS } from '../lib/categories'
import AllocationDonut from './AllocationDonut'

export default function SpendingCategoryChart({ categories, isLoading, error, periodLabel }) {
  const items = (categories ?? [])
    .map((c) => ({
      name: CATEGORY_LABELS[c.category] ?? c.category,
      value: Number(c.amount),
      color: colorForCategory(c.category),
    }))
    .sort((a, b) => b.value - a.value)

  const placeholder = chartPlaceholderFor({ isLoading, error, data: items, minPoints: 1, height: 260 })

  return (
    <Card>
      <CardHeader title="Spending by category" subtitle={periodLabel} />
      <div className="mt-2">
        {placeholder ?? <AllocationDonut items={items} formatValue={fmtEur} height="280px" />}
      </div>
    </Card>
  )
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/components/SpendingCategoryChart.test.jsx`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/charts.js frontend/src/components/SpendingCategoryChart.jsx frontend/src/components/SpendingCategoryChart.test.jsx
git commit -m "feat: replace category bar chart with a donut + ranked legend"
```

---

### Task 6: `BudgetSection` becomes opt-in with an "Add a budget" control

**Files:**
- Modify: `frontend/src/components/BudgetSection.jsx` (full rewrite)
- Modify: `frontend/src/components/BudgetSection.test.jsx` (full rewrite — the `categories` prop this file currently tests is being removed)

**Interfaces:**
- Consumes: `useBudgetProgress`, `useSetBudget` (existing, unchanged), `BUDGETABLE_CATEGORIES`, `CATEGORY_LABELS` (existing, `frontend/src/lib/categories.js`), `BudgetProgressBar` (existing, **unchanged** — it already renders correctly for any row with a non-null `limit`, which is now always the case since only budgeted categories render).
- Produces: `<BudgetSection />` — **no props**. This is a breaking change to its call site; Task 7 updates `Spending.jsx` to call `<BudgetSection />` with no `categories` prop.

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `frontend/src/components/BudgetSection.test.jsx`:

```jsx
import { describe, expect, it, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../test/renderWithProviders'
import BudgetSection from './BudgetSection'

vi.mock('../api/queries')
import * as queries from '../api/queries'

describe('BudgetSection', () => {
  it('shows a category that already has a budget set', () => {
    queries.useBudgetProgress.mockReturnValue({
      data: [{ category: 'GROCERIES', limit: '100.00', spent: '40.00', pct: 40 }],
      isLoading: false,
      error: null,
    })
    queries.useSetBudget.mockReturnValue({ mutate: vi.fn() })

    renderWithProviders(<BudgetSection />)

    expect(screen.getByText('Groceries')).toBeInTheDocument()
    expect(screen.getByText('€40.00 / €100.00')).toBeInTheDocument()
  })

  it('offers an Add a budget control listing only unbudgeted, budgetable categories', () => {
    queries.useBudgetProgress.mockReturnValue({
      data: [{ category: 'GROCERIES', limit: '100.00', spent: '40.00', pct: 40 }],
      isLoading: false,
      error: null,
    })
    queries.useSetBudget.mockReturnValue({ mutate: vi.fn() })

    renderWithProviders(<BudgetSection />)

    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options).toContain('Dining')
    expect(options).not.toContain('Groceries')
    expect(options).not.toContain('Income')
  })

  it('adding a budget calls setBudget with the chosen category and amount', () => {
    const mutate = vi.fn()
    queries.useBudgetProgress.mockReturnValue({ data: [], isLoading: false, error: null })
    queries.useSetBudget.mockReturnValue({ mutate })

    renderWithProviders(<BudgetSection />)

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'DINING' } })
    fireEvent.change(screen.getByPlaceholderText('Monthly limit'), { target: { value: '80' } })
    fireEvent.click(screen.getByText('Add a budget'))

    expect(mutate).toHaveBeenCalledWith({ category: 'DINING', monthlyLimit: 80 })
  })

  it('shows an empty state when no budgets are set yet', () => {
    queries.useBudgetProgress.mockReturnValue({ data: [], isLoading: false, error: null })
    queries.useSetBudget.mockReturnValue({ mutate: vi.fn() })

    renderWithProviders(<BudgetSection />)

    expect(screen.getByText('No budgets set yet.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/BudgetSection.test.jsx`
Expected: FAIL — the current component requires a `categories` prop and has no "Add a budget" control at all.

- [ ] **Step 3: Rewrite `BudgetSection.jsx`**

```jsx
import { useState } from 'react'
import { useBudgetProgress, useSetBudget } from '../api/queries'
import { BUDGETABLE_CATEGORIES, CATEGORY_LABELS } from '../lib/categories'
import { Card, CardHeader } from './ui'
import BudgetProgressBar from './BudgetProgressBar'

function AddBudgetControl({ options }) {
  const [category, setCategory] = useState(options[0] ?? '')
  const [amount, setAmount] = useState('')
  const setBudget = useSetBudget()

  if (options.length === 0) return null

  const submit = () => {
    const parsed = Number(amount)
    if (category && amount !== '' && parsed > 0) {
      setBudget.mutate({ category, monthlyLimit: parsed })
      setAmount('')
    }
  }

  return (
    <div className="flex items-center gap-2 pt-2">
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="h-8 px-2 bg-zinc-950 border border-zinc-800 rounded text-[var(--fig-xs)] text-zinc-200"
      >
        {options.map((c) => (
          <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>
        ))}
      </select>
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Monthly limit"
        className="w-28 h-8 px-2 bg-zinc-950 border border-zinc-800 rounded text-[var(--fig-xs)] text-zinc-100 text-right"
      />
      <button
        onClick={submit}
        className="h-8 px-3 bg-zinc-800 hover:bg-zinc-700 rounded text-[var(--fig-xs)] text-zinc-200 font-medium"
      >
        Add a budget
      </button>
    </div>
  )
}

export default function BudgetSection() {
  const { data: progress } = useBudgetProgress()
  const rows = progress ?? []
  const budgeted = new Set(rows.map((r) => r.category))
  const unbudgeted = BUDGETABLE_CATEGORIES.filter((c) => !budgeted.has(c))

  return (
    <Card>
      <CardHeader title="Budgets" subtitle="Monthly limit per category — this month" />
      <div className="mt-2">
        {rows.map((row) => (
          <BudgetProgressBar key={row.category} category={row.category} spent={row.spent} limit={row.limit} />
        ))}
        {rows.length === 0 && (
          <div className="text-zinc-500 text-[var(--fig-sm)] py-2">No budgets set yet.</div>
        )}
      </div>
      <AddBudgetControl options={unbudgeted} />
    </Card>
  )
}
```

`BudgetProgressBar.jsx` needs no changes — every row it now receives always has a non-null `limit`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/BudgetSection.test.jsx`
Expected: all 4 pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/BudgetSection.jsx frontend/src/components/BudgetSection.test.jsx
git commit -m "feat: make BudgetSection opt-in with an Add a budget control"
```

---

### Task 7: Assemble the redesigned `Spending.jsx`

**Files:**
- Modify: `frontend/src/pages/Spending.jsx` (full rewrite)
- Modify: `frontend/src/pages/Spending.test.jsx` (full rewrite)

**Interfaces:**
- Consumes: `PeriodSelector`/`resolvePeriod` (Task 4), `SpendingCategoryChart` with `periodLabel` (Task 5), `BudgetSection` with no props (Task 6), `useSpendingSummary(query)` (existing, now returning `transaction_count`/`previous_period` per Task 1), `fmtPct`/`fmtNum` (existing, `frontend/src/lib/format.js`).
- Produces: the assembled page. Nothing downstream consumes `Spending.jsx` itself.

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `frontend/src/pages/Spending.test.jsx`:

```jsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../test/renderWithProviders'
import Spending from './Spending'

vi.mock('../api/queries')
import * as queries from '../api/queries'

function mockDefaults(overrides = {}) {
  queries.useSpendingSummary.mockReturnValue(
    overrides.summary ?? {
      data: { categories: [], total: '0.00', transfers: '0.00', transaction_count: 0, previous_period: null },
      isLoading: false,
      error: null,
    },
  )
  queries.useSubscriptions.mockReturnValue(overrides.subscriptions ?? { data: [], isLoading: false, error: null })
  queries.useDismissSubscription.mockReturnValue(overrides.dismissSubscription ?? { mutate: vi.fn() })
  queries.useSpendingTrend.mockReturnValue(overrides.trend ?? { data: [], isLoading: false, error: null })
  queries.useBudgetProgress.mockReturnValue(overrides.budgetProgress ?? { data: [], isLoading: false, error: null })
  queries.useSetBudget.mockReturnValue(overrides.setBudget ?? { mutate: vi.fn() })
}

describe('Spending', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the spending total for the selected period', () => {
    mockDefaults({
      summary: {
        data: {
          categories: [{ category: 'GROCERIES', amount: '20.00' }],
          total: '50.00', transfers: '0.00', transaction_count: 3, previous_period: null,
        },
        isLoading: false,
        error: null,
      },
    })

    renderWithProviders(<Spending />)

    expect(screen.getByText('€50.00')).toBeInTheDocument()
  })

  it('shows a visible Transfers line separate from the spending total', () => {
    mockDefaults({
      summary: {
        data: {
          categories: [{ category: 'GROCERIES', amount: '20.00' }],
          total: '50.00', transfers: '500.00', transaction_count: 3, previous_period: null,
        },
        isLoading: false,
        error: null,
      },
    })

    renderWithProviders(<Spending />)

    expect(screen.getByText('€50.00')).toBeInTheDocument()
    expect(screen.getByText('€500.00')).toBeInTheDocument()
  })

  it('shows a comparison against the previous period when one is available', () => {
    mockDefaults({
      summary: {
        data: {
          categories: [{ category: 'GROCERIES', amount: '50.00' }],
          total: '50.00', transfers: '0.00', transaction_count: 3,
          previous_period: { date_from: '2026-08-01', date_to: '2026-08-31', total: '40.00' },
        },
        isLoading: false,
        error: null,
      },
    })

    renderWithProviders(<Spending />)

    expect(screen.getByText('vs €40.00 last period')).toBeInTheDocument()
  })

  it('lets you dismiss a subscription', () => {
    const mutate = vi.fn()
    mockDefaults({
      subscriptions: {
        data: [{ id: 1, display_name: 'NETFLIX.COM', expected_amount: '12.99', cadence: 'monthly', dismissed: false }],
        isLoading: false,
        error: null,
      },
      dismissSubscription: { mutate },
    })

    renderWithProviders(<Spending />)
    screen.getByText('Dismiss').click()

    expect(mutate).toHaveBeenCalledWith({ id: 1, dismissed: true })
  })

  it('shows a budget progress bar for a category with a limit set', () => {
    mockDefaults({
      budgetProgress: {
        data: [{ category: 'GROCERIES', limit: '100.00', spent: '40.00', pct: 40 }],
        isLoading: false,
        error: null,
      },
    })

    renderWithProviders(<Spending />)

    expect(screen.getByText('Groceries')).toBeInTheDocument()
    expect(screen.getByText('€40.00 / €100.00')).toBeInTheDocument()
  })

  it('switching the period selector re-requests the summary with the new date range', () => {
    mockDefaults()
    renderWithProviders(<Spending />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Select period' }), { target: { value: 'last_month' } })

    const calledQueries = queries.useSpendingSummary.mock.calls.map((args) => args[0])
    expect(calledQueries.some((q) => typeof q === 'string' && q.includes('date_from'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/pages/Spending.test.jsx`
Expected: FAIL — the current page calls `useSpendingSummary()` with no query, has no period selector, and passes `categories` into `BudgetSection`.

- [ ] **Step 3: Rewrite `Spending.jsx`**

```jsx
import { useState } from 'react'
import { useSpendingSummary, useSubscriptions, useDismissSubscription } from '../api/queries'
import { fmtEur, fmtNum, fmtPct } from '../lib/format'
import { CATEGORY_LABELS } from '../lib/categories'
import { resolvePeriod } from '../lib/periods'
import { PageHeader, StatStrip, StatRow } from '../components/ui'
import PeriodSelector from '../components/PeriodSelector'
import SpendingCategoryChart from '../components/SpendingCategoryChart'
import BudgetSection from '../components/BudgetSection'
import SpendingTrendChart from '../components/SpendingTrendChart'
import SubscriptionsList from '../components/SubscriptionsList'

export default function Spending() {
  const [period, setPeriod] = useState(() => ({ key: 'this_month', ...resolvePeriod('this_month') }))
  const { data: summary, isLoading, error } = useSpendingSummary(
    `?date_from=${period.date_from}&date_to=${period.date_to}`,
  )
  const { data: subscriptions } = useSubscriptions()
  const dismissSubscription = useDismissSubscription()

  const total = Number(summary?.total ?? 0)
  const prevTotal = summary?.previous_period ? Number(summary.previous_period.total) : null
  const deltaPct = prevTotal ? ((total - prevTotal) / prevTotal) * 100 : null
  const topCategory = (summary?.categories ?? [])
    .slice()
    .sort((a, b) => Number(b.amount) - Number(a.amount))[0]

  return (
    <div className="space-y-4">
      <PageHeader
        title="Spending"
        subtitle="Categorized bank transactions"
        right={<PeriodSelector value={period} onChange={setPeriod} />}
      />

      <StatStrip>
        <StatRow
          label={`Total spending — ${period.label}`}
          value={fmtEur(summary?.total ?? 0)}
          lead
          badge={
            deltaPct != null
              ? `${deltaPct >= 0 ? '▲' : '▼'} ${fmtPct(Math.abs(deltaPct), { sign: false })}`
              : undefined
          }
          badgeTone={deltaPct == null ? 'zinc' : deltaPct >= 0 ? 'red' : 'emerald'}
          note={prevTotal != null ? `vs ${fmtEur(prevTotal)} last period` : undefined}
        />
        <StatRow label="Transactions" value={fmtNum(summary?.transaction_count ?? 0)} />
        <StatRow
          label="Top category"
          value={topCategory ? (CATEGORY_LABELS[topCategory.category] ?? topCategory.category) : '—'}
          note={topCategory ? fmtEur(topCategory.amount) : undefined}
        />
        <StatRow
          label="Transfers (not counted above)"
          value={fmtEur(summary?.transfers ?? 0)}
          note="Moved between your own accounts"
        />
      </StatStrip>

      <div className="grid gap-4 lg:grid-cols-2">
        <SpendingCategoryChart
          categories={summary?.categories}
          isLoading={isLoading}
          error={error}
          periodLabel={period.label}
        />
        <SpendingTrendChart />
      </div>

      <BudgetSection />

      <SubscriptionsList
        subscriptions={subscriptions}
        onDismiss={(id) => dismissSubscription.mutate({ id, dismissed: true })}
      />
    </div>
  )
}
```

Note: `deltaPct` is only computed when `prevTotal` is truthy (non-zero and non-null) — a `previous_period.total` of `'0.00'` (no spending last period) intentionally shows no delta badge rather than a division-by-zero `Infinity`/`NaN`; this matches `HeroValue`'s existing `DeltaPill` convention of showing "—" when a comparison isn't meaningful, applied here by simply omitting the badge.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/Spending.test.jsx`
Expected: all 6 pass.

- [ ] **Step 5: Run the full frontend suite and lint**

Run: `cd frontend && npx vitest run && npm run lint`
Expected: all tests pass, lint clean.

- [ ] **Step 6: Manual verification**

Start the dev servers (backend `python manage.py runserver`, frontend `npm run dev`) and open `/spending` in a browser. Confirm: the period selector defaults to "This month" and switching it changes the total; the category chart is now a donut with a legend; Budgets only shows categories with a set limit, plus an "Add a budget" row; the page is visibly less tall/stacked than before (category chart and trend chart sit side by side on a wide viewport).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/Spending.jsx frontend/src/pages/Spending.test.jsx
git commit -m "feat: assemble redesigned Spending page with period selector and KPI strip"
```
