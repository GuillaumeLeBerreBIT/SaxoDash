# Accounts Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Accounts page to match an approved mockup: a KPI strip, gradient per-bank account tiles with an inline recent-transactions mini-list, a unified "recent transactions across all accounts" panel, and the existing balance-history chart — replacing the current plain balance cards plus the account-breakdown donut and Saxo cash-flow chart.

**Architecture:** Two new presentational components (`BankAccountTile`, `RecentTransactionsPanel`) consume data already available from `useBankAccounts()` and `useBankTransactions()` (unfiltered, already sorted newest-first, already unpaginated as of the prior fix) — no new backend endpoints. `Accounts.jsx` is reassembled around them. `colorForCategory` (added in the Spending redesign) is extended to handle `TRANSFER`/`SAVINGS` explicitly and give a neutral, non-colliding fallback for anything else, since transaction category dots now appear on this page too.

**Tech Stack:** React 19, Tailwind, existing `fmtEur`/`fmtNum` formatters, existing `CATEGORY_LABELS`/`colorForCategory`.

**Spec:** The approved visual mockup at https://claude.ai/artifact/ELSCGQmUr5SjsnTTFeNpHR (built and approved in this session's conversation — reference it for exact layout, spacing, and gradient tile styling). This plan's Global Constraints section below covers every place the real implementation must deliberately diverge from that mockup, and why.

## Global Constraints

- **Use the real per-account `gradient`/`accent` fields, not new hardcoded colors.** `BankAccount.gradient` (e.g. `"from-sky-500 to-sky-700"` for KBC, `"from-amber-500 to-amber-700"` for Argenta — set in `backend/enablebanking/mapping.py:6`, already serialized via `BankAccountSerializer`) is the canonical per-bank color, already populated on every synced account but never consumed by the frontend today. Use it as a Tailwind gradient class directly (`bg-gradient-to-br ${a.gradient}`) — do not invent a separate KBC/Argenta color map.
- **KPI strip's 2nd/3rd tiles are NOT "Credits this month"/"Debits this month" as literally shown in the mockup.** The app has no income auto-detection (`categorization.py`'s `INCOME` keyword list is empty), so a true "credits this month" figure isn't well-defined and this redesign will not invent one. Instead, reuse the exact, already-vetted definitions from the Spending page: "This month's spending" (`spending_summary().total` for the current month, with the real vs-previous-period delta now available from `previous_period`) and "Transfers this month" (`spending_summary().transfers` for the same period). Use `resolvePeriod('this_month')` (from `frontend/src/lib/periods.js`, built in the prior Spending redesign) to get `date_from`/`date_to` for this query — NOT the Dashboard tile's own hand-rolled `date_from`-only month math, since that never populates `previous_period` (no `date_to`).
- **Transaction row subtitles show the raw `booking_date`**, not a synthesized "Today"/"Yesterday" label — no relative-date formatter exists in this codebase (`lib/format.js` has only currency/number formatters) and adding one is out of scope for this visual redesign.
- **A transfer's transaction name shows `counterparty_name` as given** (falling back to its category label if blank) — not a synthesized "Transfer to Argenta"/"Transfer from KBC" string. The API response has no field identifying which *other* account a transfer matched to, only the category (`TRANSFER`/`SAVINGS`); synthesizing that cross-reference is out of scope here.
- **Two existing widgets are removed from this page**, per explicit user decision: `AccountBreakdownChart` and `CashFlowChart`. Their component files become unused after this plan — delete them (`frontend/src/components/AccountBreakdownChart.jsx`, `frontend/src/components/CashFlowChart.jsx`) rather than leaving dead code, after confirming no other file imports them.
- **`HistoryAreaChart` (the balance-over-time chart) is unchanged** — same props, same position at the bottom of the page.
- **`EnableBankingConnectionStatus` (the real connect/reauth status component) is unchanged and keeps its current position** in the page header's `right` slot — it is not replaced by the mockup's static "connected" pill; that pill was a mockup stand-in for this real, interactive component.
- **All transactions are already unpaginated** (fixed in commit `c125ef9` prior to this plan) — `useBankTransactions()` with no filter returns every transaction, already ordered newest-first (`BankTransaction.Meta.ordering = ['-booking_date', '-id']`). Slice client-side for "recent" (5 for the unified panel, 2 per account tile) rather than adding a backend limit param.
- **No new npm dependency.**

---

### Task 1: Extend `colorForCategory` for TRANSFER/SAVINGS and a safe fallback

**Files:**
- Modify: `frontend/src/lib/charts.js`
- Test: `frontend/src/lib/charts.test.js` (create if it doesn't already exist — check first)

**Interfaces:**
- Consumes: nothing new.
- Produces: `colorForCategory(category)` now returns a distinct neutral grey for `'TRANSFER'` and `'SAVINGS'`, and a distinct neutral grey (not `GROCERIES`' blue) for any category not in its known list. Tasks 2 and 3 both render category dots via this function and rely on this fix.

- [ ] **Step 1: Check for an existing test file**

Run: `ls frontend/src/lib/charts.test.js 2>/dev/null || echo "none"` — if a test file already exists, add to it; otherwise create it following the conventions of a nearby `lib/*.test.js` file in this codebase (check one, e.g. `frontend/src/lib/format.test.js` if present, for import/describe style).

- [ ] **Step 2: Write the failing tests**

```javascript
import { describe, expect, it } from 'vitest'
import { colorForCategory } from './charts'

describe('colorForCategory', () => {
  it('gives TRANSFER and SAVINGS a distinct neutral color, not a budgetable category color', () => {
    const transfer = colorForCategory('TRANSFER')
    const savings = colorForCategory('SAVINGS')
    const groceries = colorForCategory('GROCERIES')
    expect(transfer).not.toBe(groceries)
    expect(savings).not.toBe(groceries)
    expect(transfer).toBe(savings)
  })

  it('gives an unknown category the same neutral fallback, not GROCERIES colour', () => {
    const unknown = colorForCategory('SOME_FUTURE_CATEGORY')
    const groceries = colorForCategory('GROCERIES')
    expect(unknown).not.toBe(groceries)
  })

  it('still gives every real budgetable category its own distinct color', () => {
    const codes = ['GROCERIES', 'DINING', 'TRANSPORT', 'UTILITIES', 'SUBSCRIPTIONS', 'SHOPPING', 'HEALTH', 'TRAVEL', 'ENTERTAINMENT', 'OTHER']
    const colors = codes.map(colorForCategory)
    expect(new Set(colors).size).toBe(codes.length)
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/charts.test.js`
Expected: the first two tests fail (`colorForCategory('TRANSFER')` currently returns index-0 fallback = same as `GROCERIES`).

- [ ] **Step 4: Fix `colorForCategory`**

In `frontend/src/lib/charts.js`, find the existing block (added in the prior Spending redesign):

```javascript
const CATEGORY_ORDER = [
  'GROCERIES', 'DINING', 'TRANSPORT', 'UTILITIES', 'SUBSCRIPTIONS',
  'SHOPPING', 'HEALTH', 'TRAVEL', 'ENTERTAINMENT', 'OTHER',
]

export function colorForCategory(category) {
  const idx = CATEGORY_ORDER.indexOf(category)
  return HOLDINGS_PALETTE[idx === -1 ? 0 : idx % HOLDINGS_PALETTE.length]
}
```

Replace with:

```javascript
const CATEGORY_ORDER = [
  'GROCERIES', 'DINING', 'TRANSPORT', 'UTILITIES', 'SUBSCRIPTIONS',
  'SHOPPING', 'HEALTH', 'TRAVEL', 'ENTERTAINMENT', 'OTHER',
]

// Movement between your own accounts, not spending - a distinct neutral so
// it never collides with a real spending category's color in a shared list.
const NEUTRAL_CATEGORY_COLOR = '#71717a'
const NEUTRAL_CATEGORIES = ['TRANSFER', 'SAVINGS']

export function colorForCategory(category) {
  if (NEUTRAL_CATEGORIES.includes(category)) return NEUTRAL_CATEGORY_COLOR
  const idx = CATEGORY_ORDER.indexOf(category)
  return idx === -1 ? NEUTRAL_CATEGORY_COLOR : HOLDINGS_PALETTE[idx % HOLDINGS_PALETTE.length]
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/charts.test.js`
Expected: all pass. Also run `cd frontend && npx vitest run src/components/SpendingCategoryChart.test.jsx` to confirm this change doesn't break the Spending donut's existing color usage (it shouldn't — no budgetable category's color changed, only the fallback and TRANSFER/SAVINGS did).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/charts.js frontend/src/lib/charts.test.js
git commit -m "fix: give TRANSFER/SAVINGS and unknown categories a neutral color, not GROCERIES'"
```

---

### Task 2: `BankAccountTile` component

**Files:**
- Create: `frontend/src/components/BankAccountTile.jsx`
- Create: `frontend/src/components/BankAccountTile.test.jsx`

**Interfaces:**
- Consumes: `colorForCategory` (Task 1), `CATEGORY_LABELS` (existing, `frontend/src/lib/categories.js`), `fmtEur` (existing, `frontend/src/lib/format.js`).
- Produces: `<BankAccountTile account={accountObject} recentTransactions={[bankTransaction, ...]} />` where `accountObject` has `{id, bank, type, iban_masked, balance, available, gradient, accent}` (the shape `useBankAccounts()` already returns) and `recentTransactions` is a pre-filtered, pre-sliced array of up to 2 `BankTransaction` objects (`{id, booking_date, counterparty_name, amount, effective_category}`) for that account, already chosen by the caller (Task 4) — this component does no filtering/slicing itself. Clicking the tile navigates to `/accounts/:id` (the existing per-account drill-down page, unchanged).

- [ ] **Step 1: Write the failing test**

```jsx
import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test/renderWithProviders'
import BankAccountTile from './BankAccountTile'

describe('BankAccountTile', () => {
  it('shows the account balance, bank, and masked IBAN', () => {
    renderWithProviders(
      <BankAccountTile
        account={{
          id: 1, bank: 'KBC', type: 'Current account', iban_masked: 'BE12 •••• •••• 0001',
          balance: '1842.17', available: '1842.17', gradient: 'from-sky-500 to-sky-700', accent: '#0284c7',
        }}
        recentTransactions={[]}
      />,
    )

    expect(screen.getByText('KBC')).toBeInTheDocument()
    expect(screen.getByText('Current account')).toBeInTheDocument()
    expect(screen.getByText('BE12 •••• •••• 0001')).toBeInTheDocument()
    expect(screen.getByText('€1,842.17')).toBeInTheDocument()
  })

  it('does not show an available-balance line when available equals balance', () => {
    renderWithProviders(
      <BankAccountTile
        account={{ id: 1, bank: 'KBC', type: 'Current account', iban_masked: 'x', balance: '100.00', available: '100.00', gradient: 'from-sky-500 to-sky-700', accent: '#0284c7' }}
        recentTransactions={[]}
      />,
    )
    expect(screen.queryByText(/available/)).not.toBeInTheDocument()
  })

  it('shows an available-balance line when it differs from balance', () => {
    renderWithProviders(
      <BankAccountTile
        account={{ id: 1, bank: 'KBC', type: 'Current account', iban_masked: 'x', balance: '100.00', available: '80.00', gradient: 'from-sky-500 to-sky-700', accent: '#0284c7' }}
        recentTransactions={[]}
      />,
    )
    expect(screen.getByText('€80.00 available')).toBeInTheDocument()
  })

  it('lists up to two recent transactions for this account', () => {
    renderWithProviders(
      <BankAccountTile
        account={{ id: 1, bank: 'KBC', type: 'Current account', iban_masked: 'x', balance: '100.00', available: '100.00', gradient: 'from-sky-500 to-sky-700', accent: '#0284c7' }}
        recentTransactions={[
          { id: 1, booking_date: '2026-09-19', counterparty_name: 'Colruyt', amount: '-60.85', effective_category: 'GROCERIES' },
          { id: 2, booking_date: '2026-09-18', counterparty_name: 'NMBS', amount: '-65.00', effective_category: 'TRANSPORT' },
        ]}
      />,
    )
    expect(screen.getByText('Colruyt')).toBeInTheDocument()
    expect(screen.getByText('NMBS')).toBeInTheDocument()
    expect(screen.getByText('−€60.85')).toBeInTheDocument()
  })

  it('links to the account detail page', () => {
    const { container } = renderWithProviders(
      <BankAccountTile
        account={{ id: 42, bank: 'Argenta', type: 'Savings account', iban_masked: 'x', balance: '100.00', available: '100.00', gradient: 'from-amber-500 to-amber-700', accent: '#d97706' }}
        recentTransactions={[]}
      />,
    )
    expect(container.querySelector('a[href="/accounts/42"]')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/components/BankAccountTile.test.jsx`
Expected: FAIL — the component doesn't exist yet.

- [ ] **Step 3: Write `BankAccountTile.jsx`**

```jsx
import { Link } from 'react-router-dom'
import { fmtEur } from '../lib/format'
import { CATEGORY_LABELS } from '../lib/categories'

export default function BankAccountTile({ account, recentTransactions }) {
  const hasAvailable = Number(account.available) !== Number(account.balance)

  return (
    <Link
      to={`/accounts/${account.id}`}
      className={`block rounded-2xl p-5 text-white relative overflow-hidden bg-gradient-to-br ${account.gradient} shadow-lg shadow-black/30 hover:brightness-110 transition-[filter]`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[var(--fig-2xs)] uppercase tracking-wider font-semibold opacity-75">{account.type}</div>
          <div className="mt-0.5 text-[var(--fig-md)] font-semibold">{account.bank}</div>
          <div className="mt-0.5 text-[var(--fig-xs)] opacity-70 num font-mono">{account.iban_masked}</div>
        </div>
        <div className="w-7 h-5 rounded-[5px] bg-gradient-to-br from-white/60 to-white/15" />
      </div>

      <div className="mt-4 text-[var(--fig-2xl)] font-semibold tracking-tight num font-mono">
        {fmtEur(account.balance)}
      </div>
      {hasAvailable && (
        <div className="mt-0.5 text-[var(--fig-xs)] opacity-75 num font-mono">
          {fmtEur(account.available)} available
        </div>
      )}

      {recentTransactions.length > 0 && (
        <div className="mt-4 pt-3 border-t border-white/20 flex flex-col gap-1.5">
          {recentTransactions.map((tx) => (
            <div key={tx.id} className="flex justify-between text-[var(--fig-xs)] opacity-90">
              <span className="truncate pr-2">
                {tx.counterparty_name || CATEGORY_LABELS[tx.effective_category] || tx.effective_category}
              </span>
              <span className="num font-mono shrink-0">{fmtEur(tx.amount, { sign: true })}</span>
            </div>
          ))}
        </div>
      )}
    </Link>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/components/BankAccountTile.test.jsx`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/BankAccountTile.jsx frontend/src/components/BankAccountTile.test.jsx
git commit -m "feat: add BankAccountTile component with gradient and recent transactions"
```

---

### Task 3: `RecentTransactionsPanel` component

**Files:**
- Create: `frontend/src/components/RecentTransactionsPanel.jsx`
- Create: `frontend/src/components/RecentTransactionsPanel.test.jsx`

**Interfaces:**
- Consumes: `colorForCategory` (Task 1), `CATEGORY_LABELS` (existing), `fmtEur` (existing), `Card`/`CardHeader` (existing, `frontend/src/components/ui.jsx`).
- Produces: `<RecentTransactionsPanel transactions={[bankTransactionWithBankName, ...]} />` where each transaction additionally carries a `bank_name` string (the caller, Task 4, is responsible for resolving `bank_account` id to a bank display name and attaching it — this component has no account lookup of its own).

- [ ] **Step 1: Write the failing test**

```jsx
import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test/renderWithProviders'
import RecentTransactionsPanel from './RecentTransactionsPanel'

describe('RecentTransactionsPanel', () => {
  it('lists each transaction with its category, date, and bank name', () => {
    renderWithProviders(
      <RecentTransactionsPanel
        transactions={[
          { id: 1, booking_date: '2026-09-19', counterparty_name: 'NMBS', amount: '-65.00', effective_category: 'TRANSPORT', bank_name: 'KBC' },
          { id: 2, booking_date: '2026-09-18', counterparty_name: '', amount: '200.00', effective_category: 'TRANSFER', bank_name: 'KBC' },
        ]}
      />,
    )
    expect(screen.getByText('NMBS')).toBeInTheDocument()
    expect(screen.getByText(/2026-09-19.*Transport.*KBC/)).toBeInTheDocument()
    expect(screen.getByText('−€65.00')).toBeInTheDocument()
    expect(screen.getByText('+€200.00')).toBeInTheDocument()
  })

  it('falls back to the category label when counterparty_name is blank', () => {
    renderWithProviders(
      <RecentTransactionsPanel
        transactions={[
          { id: 1, booking_date: '2026-09-18', counterparty_name: '', amount: '200.00', effective_category: 'TRANSFER', bank_name: 'KBC' },
        ]}
      />,
    )
    expect(screen.getByText('Transfer')).toBeInTheDocument()
  })

  it('shows an empty state when there are no transactions', () => {
    renderWithProviders(<RecentTransactionsPanel transactions={[]} />)
    expect(screen.getByText(/no transactions/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/components/RecentTransactionsPanel.test.jsx`
Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Write `RecentTransactionsPanel.jsx`**

```jsx
import { fmtEur } from '../lib/format'
import { colorForCategory } from '../lib/charts'
import { CATEGORY_LABELS } from '../lib/categories'
import { Card, CardHeader } from './ui'

export default function RecentTransactionsPanel({ transactions }) {
  return (
    <Card padding={false}>
      <div className="p-4 pb-2">
        <CardHeader title="Recent transactions" subtitle="Across all accounts" />
      </div>
      <div className="px-2 pb-2">
        {transactions.length === 0 && (
          <div className="text-center text-zinc-500 text-[var(--fig-sm)] py-8">No transactions yet.</div>
        )}
        {transactions.map((tx) => {
          const isCredit = Number(tx.amount) > 0
          const label = tx.counterparty_name || CATEGORY_LABELS[tx.effective_category] || tx.effective_category
          return (
            <div key={tx.id} className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-zinc-800/30">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: colorForCategory(tx.effective_category) }}
              />
              <div className="min-w-0 flex-1">
                <div className="text-[var(--fig-sm)] font-medium text-zinc-100 truncate">{label}</div>
                <div className="text-[var(--fig-2xs)] text-zinc-500 mt-0.5">
                  {tx.booking_date} · {CATEGORY_LABELS[tx.effective_category] ?? tx.effective_category} · {tx.bank_name}
                </div>
              </div>
              <div className={`text-[var(--fig-sm)] font-medium num font-mono shrink-0 ${isCredit ? 'text-emerald-400' : 'text-zinc-100'}`}>
                {fmtEur(tx.amount, { sign: true })}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/components/RecentTransactionsPanel.test.jsx`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/RecentTransactionsPanel.jsx frontend/src/components/RecentTransactionsPanel.test.jsx
git commit -m "feat: add RecentTransactionsPanel component"
```

---

### Task 4: Assemble the redesigned `Accounts.jsx`, remove the two dropped widgets

**Files:**
- Modify: `frontend/src/pages/Accounts.jsx` (full rewrite)
- Modify: `frontend/src/pages/Accounts.test.jsx` (full rewrite — check this file's current name/existence first with `ls frontend/src/pages/Accounts.test.jsx`; if it doesn't exist, create it)
- Delete: `frontend/src/components/AccountBreakdownChart.jsx`
- Delete: `frontend/src/components/CashFlowChart.jsx`
- Delete their test files if they exist: check `ls frontend/src/components/AccountBreakdownChart.test.jsx frontend/src/components/CashFlowChart.test.jsx` first.

**Interfaces:**
- Consumes: `BankAccountTile` (Task 2), `RecentTransactionsPanel` (Task 3, needs each transaction annotated with `bank_name`), `useBankAccounts`, `useBankTransactions`, `useSpendingSummary` (all existing), `resolvePeriod` (existing, `frontend/src/lib/periods.js`), `fmtEur`/`fmtPct` (existing), `HistoryAreaChart`/`EnableBankingConnectionStatus` (existing, unchanged).
- Produces: the assembled page. Nothing downstream consumes `Accounts.jsx` itself.

- [ ] **Step 1: Confirm the two components have no other consumers**

Run: `grep -rln "AccountBreakdownChart\|CashFlowChart" frontend/src --include="*.jsx" | grep -v test` — expect exactly `frontend/src/components/CashFlowChart.jsx`, `frontend/src/components/AccountBreakdownChart.jsx`, and `frontend/src/pages/Accounts.jsx` (the file you're about to rewrite). If anything else appears, STOP and report back rather than deleting — do not delete a component something else still uses.

- [ ] **Step 2: Write the failing tests**

Check whether `frontend/src/pages/Accounts.test.jsx` already exists and read it first if so, to see what it currently covers. Then replace its contents (or create it) with:

```jsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test/renderWithProviders'
import Accounts from './Accounts'

vi.mock('../api/queries')
import * as queries from '../api/queries'

const KBC = {
  id: 1, bank: 'KBC', type: 'Current account', iban_masked: 'BE12 •••• •••• 0001',
  balance: '1842.17', available: '1842.17', currency: 'EUR',
  gradient: 'from-sky-500 to-sky-700', accent: '#0284c7', external_id: 'enablebanking:kbc:acc-1',
}
const ARGENTA = {
  id: 2, bank: 'Argenta', type: 'Savings account', iban_masked: 'BE34 •••• •••• 0002',
  balance: '6230.00', available: '6230.00', currency: 'EUR',
  gradient: 'from-amber-500 to-amber-700', accent: '#d97706', external_id: 'enablebanking:argenta:acc-1',
}

function mockDefaults(overrides = {}) {
  queries.useBankAccounts.mockReturnValue(overrides.accounts ?? { data: [KBC, ARGENTA], isLoading: false, error: null })
  queries.useBankTransactions.mockReturnValue(
    overrides.transactions ?? {
      data: [
        { id: 1, bank_account: 1, booking_date: '2026-09-19', counterparty_name: 'NMBS', amount: '-65.00', effective_category: 'TRANSPORT' },
        { id: 2, bank_account: 1, booking_date: '2026-09-18', counterparty_name: 'Colruyt', amount: '-60.85', effective_category: 'GROCERIES' },
      ],
      isLoading: false,
      error: null,
    },
  )
  queries.useSpendingSummary.mockReturnValue(
    overrides.summary ?? {
      data: { total: '175.33', transfers: '200.00', previous_period: { total: '187.50' } },
      isLoading: false,
      error: null,
    },
  )
}

describe('Accounts', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the total balance across accounts', () => {
    mockDefaults()
    renderWithProviders(<Accounts />)
    expect(screen.getByText('€8,072.17')).toBeInTheDocument()
  })

  it('shows a gradient tile for each account', () => {
    mockDefaults()
    renderWithProviders(<Accounts />)
    expect(screen.getByText('KBC')).toBeInTheDocument()
    expect(screen.getByText('Argenta')).toBeInTheDocument()
  })

  it('shows this month\'s spending and transfers from the Spending definitions', () => {
    mockDefaults()
    renderWithProviders(<Accounts />)
    expect(screen.getByText('€175.33')).toBeInTheDocument()
    expect(screen.getByText('€200.00')).toBeInTheDocument()
  })

  it('shows recent transactions with their resolved bank name', () => {
    mockDefaults()
    renderWithProviders(<Accounts />)
    expect(screen.getByText('NMBS')).toBeInTheDocument()
    expect(screen.getByText(/KBC/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/pages/Accounts.test.jsx`
Expected: FAIL — current page has none of this structure.

- [ ] **Step 4: Rewrite `Accounts.jsx`**

```jsx
import { useBankAccounts, useBankTransactions, useSpendingSummary } from '../api/queries'
import { fmtEur, fmtPct } from '../lib/format'
import { resolvePeriod } from '../lib/periods'
import { Card, PageHeader, StatStrip, StatRow } from '../components/ui'
import HistoryAreaChart from '../components/HistoryAreaChart'
import EnableBankingConnectionStatus from '../components/EnableBankingConnectionStatus'
import BankAccountTile from '../components/BankAccountTile'
import RecentTransactionsPanel from '../components/RecentTransactionsPanel'

const SAXO_CASH_EXTERNAL_ID = 'saxo:cash'

export default function Accounts() {
  // Computed per render, not module scope - this must not freeze at
  // whichever date the JS bundle happened to first load.
  const period = resolvePeriod('this_month')
  const { data: allAccounts, isLoading, error } = useBankAccounts()
  const { data: allTransactions } = useBankTransactions()
  const { data: summary } = useSpendingSummary(`?date_from=${period.date_from}&date_to=${period.date_to}`)

  if (error) return <div className="text-red-400 text-sm">Failed to load accounts</div>
  if (isLoading || !allAccounts) return <div className="text-zinc-500 text-sm">Loading…</div>

  const accounts = allAccounts.filter((a) => a.external_id !== SAXO_CASH_EXTERNAL_ID)
  const total = accounts.reduce((sum, a) => sum + Number(a.balance), 0)
  const bankNameById = new Map(accounts.map((a) => [a.id, a.bank]))
  const transactions = allTransactions ?? []

  const spendTotal = Number(summary?.total ?? 0)
  const prevTotal = summary?.previous_period ? Number(summary.previous_period.total) : null
  const deltaPct = prevTotal ? ((spendTotal - prevTotal) / prevTotal) * 100 : null

  const recentByAccount = (accountId) =>
    transactions.filter((tx) => tx.bank_account === accountId).slice(0, 2)

  const recentAcrossAll = transactions
    .slice(0, 5)
    .map((tx) => ({ ...tx, bank_name: bankNameById.get(tx.bank_account) ?? '' }))

  return (
    <div className="space-y-4">
      <PageHeader
        title="Accounts"
        subtitle="Your connected bank accounts"
        right={<EnableBankingConnectionStatus />}
      />

      <StatStrip>
        <StatRow label="Total balance" value={fmtEur(total)} note={`${accounts.length} accounts`} lead />
        <StatRow
          label="This month's spending"
          value={fmtEur(spendTotal)}
          badge={deltaPct != null ? `${deltaPct >= 0 ? '▲' : '▼'} ${fmtPct(Math.abs(deltaPct), { sign: false })}` : undefined}
          badgeTone={deltaPct == null ? 'zinc' : deltaPct >= 0 ? 'red' : 'emerald'}
          note={prevTotal != null ? `vs ${fmtEur(prevTotal)} last month` : undefined}
        />
        <StatRow label="Transfers this month" value={fmtEur(summary?.transfers ?? 0)} note="Between your own accounts" />
      </StatStrip>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="flex flex-col gap-3.5">
          {accounts.map((a) => (
            <BankAccountTile key={a.id} account={a} recentTransactions={recentByAccount(a.id)} />
          ))}
        </div>
        <RecentTransactionsPanel transactions={recentAcrossAll} />
      </div>

      <HistoryAreaChart
        title="Bank balance"
        subtitle="Total across accounts over time"
        dataKey="bank_total"
        name="Bank"
        color="#fbbf24"
      />
    </div>
  )
}
```

- [ ] **Step 5: Delete the two unused components**

```bash
rm frontend/src/components/AccountBreakdownChart.jsx frontend/src/components/CashFlowChart.jsx
# Also remove their test files if Step 1 found any
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/Accounts.test.jsx`
Expected: all pass.

- [ ] **Step 7: Run the full frontend suite and lint**

Run: `cd frontend && npx vitest run && npm run lint`
Expected: all pass, lint clean (this also confirms deleting the two components didn't break any other test that mocked or imported them).

- [ ] **Step 8: Manual verification**

Start the dev servers if not already running (check `lsof -iTCP -sTCP:LISTEN -P | grep -E ':(5173|8000)'` first) and open `/accounts` in a browser. Confirm: gradient tiles for KBC (blue) and Argenta (amber) with their real balances and recent transactions, a unified recent-transactions panel to the right, the KPI strip showing total balance / this month's spending with a delta / transfers, and the balance-history chart below. Confirm the account-breakdown donut and Saxo cash-flow chart no longer appear anywhere on the page.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/Accounts.jsx frontend/src/pages/Accounts.test.jsx
git rm frontend/src/components/AccountBreakdownChart.jsx frontend/src/components/CashFlowChart.jsx
# git rm any test files for those two components if they existed
git commit -m "feat: redesign Accounts page with gradient tiles and unified recent transactions"
```
