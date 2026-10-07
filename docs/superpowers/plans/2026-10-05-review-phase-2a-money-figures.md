# Review Phase 2A — Money Figures on Transactions, Dashboard and Portfolio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every money figure on Transactions, the Dashboard and Portfolio carry the right currency, sign and label, using the payloads Phase 1 shipped (roadmap findings 2.1, 2.2, 2.3).

**Architecture:** One new pure module `lib/transactions.js` owns how a transaction's price, total, sign and type chips are rendered; Transactions, the Dashboard's recent table and the CSV export all call it. One small backend addition exposes `bank_only` and `broker_cash` so the frontend can put Saxo cash on the portfolio side of the split without doing money arithmetic itself. Everything else is label, domain and empty-state fixes in the existing components.

**Tech Stack:** Django + DRF (`APITestCase`/`TestCase`), React 19, vitest + Testing Library, Recharts, Tailwind.

**Spec:** `docs/superpowers/plans/2026-10-04-app-review-roadmap.md` rows 2.1–2.3. Phase 1 payload contract: `docs/superpowers/plans/2026-10-04-review-phase-1-backend.md` (Task 2c: `currency`, `fx_rate`, `total_eur` on transactions; Task 6: `bank_only_total` on snapshots).

## Scope split

Phase 2 in the roadmap is ten findings across ~20 files. It is split into sub-plans by file cluster so each branch stays reviewable:

- **2A (this plan):** 2.1 Transactions/Dashboard recent, 2.2 Portfolio, 2.3 Dashboard.
- **2B:** 2.4 Analytics, 2.5 Accounts, 2.6 account detail, 2.7 Spending.
- **2C:** 2.8 Earnings, 2.9 Research, 2.10 command palette and shared nav list.

All three live on branch `fix/review-frontend` cut from `main`; 2A merges first. 2B and 2C touch disjoint files from 2A and from each other.

## Global Constraints

- Zero code comments (AGENTS.md); rationale goes in the PR description.
- Test-first. Backend `APITestCase`/`TestCase`; vitest specs next to the component or helper.
- `fmtMoney(value, currency)` for an instrument price, `fmtEur` only for an already-converted figure. An absent figure is `null` and renders `—`, never zero.
- No financial state by colour alone: every inflow/outflow also carries a sign.
- `Card` is the one container language; check `components/ui.jsx` before adding a primitive.
- No new migration in this plan. If one appears, run `manage.py migrate` against the dev DB before calling it done.
- Branch from `main` (`git switch -c fix/review-frontend main`). The working tree on `feat/investors` has an uncommitted edit to `docs/superpowers/specs/2026-10-04-famous-investors-design.md`: do not stash, reset or overwrite it. Use `superpowers:using-git-worktrees` so the two branches never share a checkout.
- Gate for the plan: `cd frontend && npx vitest run && npx eslint src && npm run build`, `cd backend && python manage.py test`, and 1440px + 390px screenshots of Transactions, Dashboard and Portfolio.

## Decisions to confirm before executing

1. **Net-worth chart series keep their snapshot columns** (`portfolio_value`, `bank_total`, `net_worth`). `bank_total` includes Saxo cash, so the legend names them "Positions", "Cash (bank + Saxo)" and "Total", while the hero split follows the review (Saxo cash on the Saxo side). Switching the chart to bank-only needs `bank_only_total`, which Phase 1 only backfilled approximately. Default: honest legend labels, no series change.
2. **A transaction with `currency: null` shows `—` for its EUR total** and a bare number (no symbol) for its price. Default per the roadmap Review Focus.
3. **Backend payload is additive.** `bank` and `portfolio` keep their meaning; `bank_only` and `broker_cash` are new. The frontend reads only the new keys for the split.

## Review Focus

- A transaction with `currency: null` (sold out, nothing to backfill): price renders without a symbol, total renders `—`, CSV cells are empty, not `null` or `0`.
- A transaction type the UI has never heard of (e.g. `INTEREST`): appears as a filter chip, has a neutral tone and no sign.
- A portfolio with `summary.total_pnl: null` (no positions to cost against): the Total row shows `—`, not `+€0.00` and not a sum of rows.
- A flat or single-valued history series: the padded domain must not collapse to a zero-height axis.
- Gainers-only or losers-only Movers: the empty column disappears, no bare "Losers" heading.
- Bank-only account list (no Saxo cash row): `broker_cash` is `0.00` and the split still adds up (Task 4 test).

## Order and dependencies

Tasks 1 → 2 → 3 (transactions helpers, then the two pages that use them). Task 4 (backend) before Task 5. Task 6 independent. Task 7 independent. Task 8 independent. Task 9 last.

Parallelisable for subagents: {1,2,3}, {4,5}, {6}, {7}, {8}. Groups touch disjoint files except `Dashboard.test.jsx` (Tasks 3 and 5): run those two sequentially.

---

### Task 1: `lib/transactions.js` and the CSV columns (roadmap 2.1)

**Files:**
- Create: `frontend/src/lib/transactions.js`
- Create: `frontend/src/lib/transactions.test.js`
- Modify: `frontend/src/lib/csv.js:11-20`
- Modify: `frontend/src/lib/csv.test.js`

**Interfaces:**
- Produces:
  - `txTone(type: string): 'blue'|'zinc'|'amber'|'teal'|'red'`
  - `txPrice(t): string` — instrument-currency price, bare number when `t.currency` is null, `—` when `t.price` is null
  - `txTotal(t): string` — signed EUR total from `t.total_eur`, `—` when null
  - `txTotalClass(t): string` — Tailwind text colour class
  - `txTypes(rows): string[]` — `['All', ...types present]`, canonical order first, unknown types after, alphabetical

- [ ] **Step 1: Write the failing tests**

`frontend/src/lib/transactions.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { txPrice, txTone, txTotal, txTotalClass, txTypes } from './transactions'

const tx = (overrides) => ({
  type: 'BUY', price: '150.00', currency: 'USD', total: '1500.00', total_eur: '1290.13', ...overrides,
})

describe('txPrice', () => {
  it('formats in the transaction currency', () => {
    expect(txPrice(tx())).toBe('US$150.00')
  })

  it('shows a bare number when the currency is unknown', () => {
    expect(txPrice(tx({ currency: null }))).toBe('150.00')
  })

  it('shows a dash when the price is absent', () => {
    expect(txPrice(tx({ price: null }))).toBe('—')
  })
})

describe('txTotal', () => {
  it('shows a purchase as an outflow', () => {
    expect(txTotal(tx({ type: 'BUY' }))).toBe('-€1,290.13')
  })

  it('shows a sale, dividend and deposit as inflows', () => {
    expect(txTotal(tx({ type: 'SELL' }))).toBe('+€1,290.13')
    expect(txTotal(tx({ type: 'DIVIDEND' }))).toBe('+€1,290.13')
    expect(txTotal(tx({ type: 'DEPOSIT' }))).toBe('+€1,290.13')
  })

  it('shows a fee as an outflow', () => {
    expect(txTotal(tx({ type: 'FEE' }))).toBe('-€1,290.13')
  })

  it('leaves an unrecognised type unsigned', () => {
    expect(txTotal(tx({ type: 'INTEREST' }))).toBe('€1,290.13')
  })

  it('ignores the sign the backend sent', () => {
    expect(txTotal(tx({ type: 'BUY', total_eur: '-1290.13' }))).toBe('-€1,290.13')
  })

  it('shows a dash when the EUR total is unknown', () => {
    expect(txTotal(tx({ total_eur: null }))).toBe('—')
  })
})

describe('txTotalClass', () => {
  it('colours inflows green and everything else neutral', () => {
    expect(txTotalClass(tx({ type: 'SELL' }))).toBe('text-emerald-400')
    expect(txTotalClass(tx({ type: 'BUY' }))).toBe('text-zinc-100')
    expect(txTotalClass(tx({ type: 'INTEREST' }))).toBe('text-zinc-100')
  })
})

describe('txTone', () => {
  it('maps known types and falls back to zinc', () => {
    expect(txTone('BUY')).toBe('blue')
    expect(txTone('FEE')).toBe('red')
    expect(txTone('INTEREST')).toBe('zinc')
  })
})

describe('txTypes', () => {
  it('lists only the types present, canonical order first', () => {
    const rows = [{ type: 'FEE' }, { type: 'BUY' }, { type: 'BUY' }, { type: 'INTEREST' }, { type: 'DIVIDEND' }]
    expect(txTypes(rows)).toEqual(['All', 'BUY', 'DIVIDEND', 'FEE', 'INTEREST'])
  })

  it('is just All for no rows', () => {
    expect(txTypes([])).toEqual(['All'])
  })
})
```

Append to `frontend/src/lib/csv.test.js` (inside the existing file, after the last `describe`):

```js
describe('TRANSACTION_COLUMNS currency', () => {
  it('exports the instrument currency and the EUR total, empty when unknown', () => {
    const csv = toCsv(TRANSACTION_COLUMNS, [
      tx({ currency: 'USD', total_eur: '1290.13' }),
      tx({ currency: null, total_eur: null }),
    ])
    const [header, known, unknown] = csv.split('\n')

    expect(header).toBe('Date,Type,Instrument,Ticker,Qty,Price,Currency,Total,Total (EUR),Account')
    expect(known).toBe('2026-08-01,BUY,NVIDIA,NVDA,10,150,USD,1500,1290.13,Saxo')
    expect(unknown).toBe('2026-08-01,BUY,NVIDIA,NVDA,10,150,,1500,,Saxo')
  })
})
```

Also change the two existing assertions in that file that hard-code the 8-column header and `split(',')).toHaveLength(9)`: the header becomes the 10-column string above, the first row `'2026-08-01,BUY,NVIDIA,NVDA,10,150,,1500,,Saxo'` (the `tx` helper has no currency), and the length assertion becomes `11`.

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run src/lib/transactions.test.js src/lib/csv.test.js`
Expected: FAIL (`Cannot find module './transactions'`, header mismatch).

- [ ] **Step 3: Implement**

`frontend/src/lib/transactions.js`:

```js
import { fmtEur, fmtMoney, fmtNum, UNKNOWN } from './format'

const TONES = { BUY: 'blue', SELL: 'zinc', DIVIDEND: 'amber', DEPOSIT: 'teal', FEE: 'red' }
const CANONICAL_ORDER = ['BUY', 'SELL', 'DIVIDEND', 'DEPOSIT', 'FEE']
const INFLOWS = new Set(['SELL', 'DIVIDEND', 'DEPOSIT'])
const OUTFLOWS = new Set(['BUY', 'FEE'])

export const txTone = (type) => TONES[type] || 'zinc'

export function txPrice(t) {
  if (t.price == null) return UNKNOWN
  return t.currency ? fmtMoney(t.price, t.currency) : fmtNum(t.price, 2)
}

export function txTotal(t) {
  if (t.total_eur == null) return UNKNOWN
  const magnitude = Math.abs(Number(t.total_eur))
  if (INFLOWS.has(t.type)) return fmtEur(magnitude, { sign: true })
  if (OUTFLOWS.has(t.type)) return fmtEur(-magnitude)
  return fmtEur(magnitude)
}

export const txTotalClass = (t) => (INFLOWS.has(t.type) ? 'text-emerald-400' : 'text-zinc-100')

export function txTypes(rows) {
  const present = new Set(rows.map((r) => r.type))
  const known = CANONICAL_ORDER.filter((type) => present.has(type))
  const unknown = [...present].filter((type) => !CANONICAL_ORDER.includes(type)).sort()
  return ['All', ...known, ...unknown]
}
```

In `frontend/src/lib/csv.js` replace the `TRANSACTION_COLUMNS` array body:

```js
export const TRANSACTION_COLUMNS = [
  { header: 'Date', get: (t) => t.date },
  { header: 'Type', get: (t) => t.type },
  { header: 'Instrument', get: (t) => t.instrument },
  { header: 'Ticker', get: (t) => t.ticker },
  { header: 'Qty', get: (t) => t.qty },
  { header: 'Price', get: (t) => t.price },
  { header: 'Currency', get: (t) => t.currency },
  { header: 'Total', get: (t) => t.total },
  { header: 'Total (EUR)', get: (t) => t.total_eur },
  { header: 'Account', get: (t) => t.account },
]
```

Then open `toCsv` in the same file. If a `null`/`undefined` cell is not already written as an empty string, add that (one line) and keep the CSV test from Step 1 as its pin.

- [ ] **Step 4: Run to verify they pass**

Run: `cd frontend && npx vitest run src/lib/transactions.test.js src/lib/csv.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/transactions.js frontend/src/lib/transactions.test.js frontend/src/lib/csv.js frontend/src/lib/csv.test.js
git commit -m "feat: transaction price, signed EUR total and type chips share one helper"
```

---

### Task 2: Transactions page uses the helper (roadmap 2.1)

**Files:**
- Modify: `frontend/src/pages/Transactions.jsx`
- Create: `frontend/src/pages/Transactions.test.jsx`

**Interfaces:**
- Consumes: `txPrice`, `txTotal`, `txTotalClass`, `txTone`, `txTypes` from Task 1.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

`frontend/src/pages/Transactions.test.jsx`:

```jsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'

import { renderWithProviders } from '../test/renderWithProviders'
import Transactions from './Transactions'

vi.mock('../api/queries')
import * as queries from '../api/queries'

const row = (overrides) => ({
  id: 1, date: '2026-09-01', type: 'BUY', instrument: 'NVIDIA', ticker: 'NVDA',
  qty: '10.0000', price: '150.00', total: '1500.00', account: 'Saxo',
  currency: 'USD', fx_rate: '0.86', total_eur: '1290.00', ...overrides,
})

function stub(rows) {
  queries.useTransactions.mockReturnValue({ data: rows, isLoading: false, error: null })
}

describe('Transactions', () => {
  beforeEach(() => vi.resetAllMocks())

  it('prices a trade in its own currency and totals it in euro with the right sign', () => {
    stub([row({ id: 1, type: 'BUY' }), row({ id: 2, type: 'SELL', ticker: 'AMD', instrument: 'AMD' })])
    renderWithProviders(<Transactions />)

    const buy = within(screen.getByRole('table')).getByText('NVDA').closest('tr')
    expect(within(buy).getByText('US$150.00')).toBeInTheDocument()
    expect(within(buy).getByText('-€1,290.00')).toBeInTheDocument()

    const sell = within(screen.getByRole('table')).getByText('AMD', { selector: 'span' }).closest('tr')
    expect(within(sell).getByText('+€1,290.00')).toBeInTheDocument()
  })

  it('shows a dash for the total when the currency was never recorded', () => {
    stub([row({ currency: null, fx_rate: null, total_eur: null })])
    renderWithProviders(<Transactions />)

    const line = within(screen.getByRole('table')).getByText('NVDA').closest('tr')
    expect(within(line).getByText('150.00')).toBeInTheDocument()
    expect(within(line).getByText('—')).toBeInTheDocument()
  })

  it('offers a chip only for the types present', () => {
    stub([row({ id: 1, type: 'BUY' }), row({ id: 2, type: 'INTEREST', ticker: '', instrument: 'Interest' })])
    renderWithProviders(<Transactions />)

    expect(screen.getByRole('button', { name: 'BUY' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'INTEREST' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'DIVIDEND' })).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run src/pages/Transactions.test.jsx`
Expected: FAIL (price shown as `€150.00`, no `INTEREST` chip).

- [ ] **Step 3: Implement**

In `frontend/src/pages/Transactions.jsx`:

- Replace the imports of `fmtEur`, `TYPES`, `toneFor` and `signedTotal` with:

```jsx
import { fmtQty } from '../lib/format'
import { txPrice, txTone, txTotal, txTotalClass, txTypes } from '../lib/transactions'
```

- Delete the `TYPES`, `toneFor` and `signedTotal` declarations.
- After `allTx`, add `const types = useMemo(() => txTypes(allTx), [allTx])`.
- Chips: `{types.map((t) => (` replaces `{TYPES.map((t) => (`.
- Badge: `<Badge tone={txTone(t.type)}>`.
- Price cell: `{txPrice(t)}`.
- Total cell: `<Td align="right" className={`num font-medium ${txTotalClass(t)}`}>{txTotal(t)}</Td>`.

Leave the existing comment on `allTx` as it is.

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npx vitest run src/pages/Transactions.test.jsx && npx eslint src/pages/Transactions.jsx`
Expected: PASS, no lint output.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Transactions.jsx frontend/src/pages/Transactions.test.jsx
git commit -m "fix: transactions show instrument-currency price and a signed euro total"
```

---

### Task 3: Dashboard recent-transactions table (roadmap 2.1)

**Files:**
- Modify: `frontend/src/pages/Dashboard.jsx:23,138-160`
- Modify: `frontend/src/pages/Dashboard.test.jsx`

**Interfaces:**
- Consumes: `txPrice`, `txTone`, `txTotal`, `txTotalClass` (Task 1).

- [ ] **Step 1: Write the failing test**

Open `frontend/src/pages/Dashboard.test.jsx`, find how it stubs `useTransactions`, and add a case in the same style:

```jsx
it('shows recent trades with instrument-currency price, signed euro total and fractional qty', () => {
  queries.useTransactions.mockReturnValue({
    ...idle,
    data: [{
      id: 1, date: '2026-09-01', type: 'BUY', instrument: 'NVIDIA', ticker: 'NVDA',
      qty: '2.5000', price: '150.00', total: '375.00', account: 'Saxo',
      currency: 'USD', fx_rate: '0.86', total_eur: '322.50',
    }],
  })
  renderWithProviders(<Dashboard />)

  const line = screen.getByText('NVDA', { selector: 'span.font-medium' }).closest('tr')
  expect(within(line).getByText('2.5')).toBeInTheDocument()
  expect(within(line).getByText('US$150.00')).toBeInTheDocument()
  expect(within(line).getByText('-€322.50')).toBeInTheDocument()
})
```

Add `within` to the `@testing-library/react` import if missing. If the file's existing transaction fixtures lack `total_eur`, give them one.

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run src/pages/Dashboard.test.jsx`
Expected: FAIL (qty `3`, price `€150.00`).

- [ ] **Step 3: Implement**

In `Dashboard.jsx`: remove the `txTone` constant, import `{ fmtEur, fmtNum, fmtPct, fmtQty }` and `{ txPrice, txTone, txTotal, txTotalClass } from '../lib/transactions'`, and change the row cells:

```jsx
<Badge tone={txTone(t.type)}>{t.type}</Badge>
...
<Td align="right" className="num font-mono text-zinc-300">{fmtQty(t.qty)}</Td>
<Td align="right" className="num font-mono text-zinc-300">{txPrice(t)}</Td>
<Td edge align="right" className={`num font-mono font-medium ${txTotalClass(t)}`}>{txTotal(t)}</Td>
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npx vitest run src/pages/Dashboard.test.jsx && npx eslint src/pages/Dashboard.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Dashboard.jsx frontend/src/pages/Dashboard.test.jsx
git commit -m "fix: dashboard recent trades use the shared transaction price and total"
```

---

### Task 4: Backend exposes `bank_only` and `broker_cash` (roadmap 2.3, data)

**Files:**
- Modify: `backend/accounts/services.py`
- Modify: `backend/accounts/views.py` (`NetWorthView.get`)
- Modify: `backend/portfolio/insights.py` (`build_insights`, `'value'` block)
- Test: `backend/core/tests.py`, `backend/portfolio/tests.py`

**Interfaces:**
- Produces:
  - `accounts.services.get_broker_cash_balance() -> Money`
  - `GET /api/accounts/net-worth/` gains `bank_only_total` and `broker_cash` (decimal strings, as the existing keys)
  - `build_insights()['value']` gains `bank_only` and `broker_cash`; `net_worth == portfolio + bank` is unchanged, and `bank == bank_only + broker_cash`

- [ ] **Step 1: Write the failing tests**

Append to `backend/core/tests.py`:

```python
class NetWorthEndpointSplitsSaxoCashTest(APITestCase):
    def setUp(self):
        user = User.objects.create_user('u', password='p')
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(user).access_token}')

    def _accounts(self, with_saxo=True):
        if with_saxo:
            BankAccount.objects.create(
                bank='Saxo', type='Cash', iban_masked='-', external_id='saxo:cash',
                balance=Decimal('900.00'), available=Decimal('900.00'),
            )
        BankAccount.objects.create(
            bank='KBC', type='Checking', iban_masked='BE68 1234',
            balance=Decimal('2500.00'), available=Decimal('2500.00'),
        )

    def test_bank_total_still_includes_saxo_cash_and_the_split_is_exposed(self):
        self._accounts()

        body = self.client.get('/api/accounts/net-worth/').json()

        self.assertEqual(Decimal(body['bank_total']), Decimal('3400.00'))
        self.assertEqual(Decimal(body['bank_only_total']), Decimal('2500.00'))
        self.assertEqual(Decimal(body['broker_cash']), Decimal('900.00'))

    def test_without_a_saxo_cash_row_the_broker_cash_is_zero(self):
        self._accounts(with_saxo=False)

        body = self.client.get('/api/accounts/net-worth/').json()

        self.assertEqual(Decimal(body['broker_cash']), Decimal('0.00'))
        self.assertEqual(Decimal(body['bank_only_total']), Decimal('2500.00'))
```

Append to `backend/portfolio/tests.py` inside `BuildInsightsTest` (check the file's imports for `BankAccount`; add `from accounts.models import BankAccount` if absent):

```python
    @patch('portfolio.insights._upcoming_earnings', return_value=[])
    def test_value_splits_saxo_cash_from_external_banks(self, _mock):
        BankAccount.objects.create(
            bank='Saxo', type='Cash', iban_masked='-', external_id='saxo:cash',
            balance=Decimal('900.00'), available=Decimal('900.00'),
        )
        BankAccount.objects.create(
            bank='KBC', type='Checking', iban_masked='BE68 1234',
            balance=Decimal('2500.00'), available=Decimal('2500.00'),
        )
        value = insights.build_insights()['value']
        self.assertEqual(Decimal(value['broker_cash']), Decimal('900.00'))
        self.assertEqual(Decimal(value['bank_only']), Decimal('2500.00'))
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && python manage.py test core.tests.NetWorthEndpointSplitsSaxoCashTest portfolio.tests.BuildInsightsTest`
Expected: FAIL (`KeyError: 'bank_only_total'`, `KeyError: 'broker_cash'`).

- [ ] **Step 3: Implement**

`backend/accounts/services.py`, after `get_bank_only_balance`:

```python
def get_broker_cash_balance():
    return Money.total(
        (Money(account.balance, account.currency)
         for account in BankAccount.objects.filter(external_id=SAXO_CASH_ACCOUNT_ID)),
        settings.REPORTING_CURRENCY,
    )
```

`backend/accounts/views.py`: import `from .services import get_bank_only_balance, get_broker_cash_balance` and extend the success response:

```python
        return Response({
            'portfolio_value': net_worth.portfolio.rounded().amount,
            'bank_total': net_worth.bank.rounded().amount,
            'bank_only_total': get_bank_only_balance().rounded().amount,
            'broker_cash': get_broker_cash_balance().rounded().amount,
            'net_worth': net_worth.total.rounded().amount,
        })
```

`backend/portfolio/insights.py`: import the two services next to the existing `accounts` imports (match the file's import style) and extend the `'value'` dict:

```python
        'value': {
            'net_worth': net_worth_value,
            'portfolio': portfolio_value,
            'bank': bank,
            'bank_only': get_bank_only_balance().rounded().amount,
            'broker_cash': get_broker_cash_balance().rounded().amount,
        },
```

A `CurrencyMismatch` from these calls is already caught for `NetWorthView` by the existing `try`; `build_insights` already calls `current_net_worth()` which raises first, so no new failure mode.

- [ ] **Step 4: Run to verify they pass**

Run: `cd backend && python manage.py test core portfolio accounts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/accounts backend/portfolio/insights.py backend/core/tests.py backend/portfolio/tests.py
git commit -m "feat: net worth payloads split Saxo cash from external banks"
```

---

### Task 5: Hero split, Portfolio Bank row and honest labels (roadmap 2.3)

**Files:**
- Modify: `frontend/src/components/dashboard/HeroValue.jsx`
- Modify: `frontend/src/components/dashboard/HeroValue.test.jsx`
- Modify: `frontend/src/pages/Dashboard.jsx` (Portfolio value `StatRow`)
- Modify: `frontend/src/pages/Dashboard.test.jsx` (fixture `value`)
- Modify: `frontend/src/pages/Portfolio.jsx` (stat strip)
- Modify: `frontend/src/pages/Portfolio.test.jsx` (`useNetWorth` stub)

**Interfaces:**
- Consumes: `value.bank_only`, `value.broker_cash` (insights); `bank_only_total`, `broker_cash` (net-worth endpoint) from Task 4.

- [ ] **Step 1: Write the failing tests**

In `HeroValue.test.jsx` change the fixture to `value: { net_worth: '10000.00', portfolio: '8000.00', bank: '2000.00', bank_only: '1000.00', broker_cash: '1000.00' }` and add:

```jsx
it('counts Saxo cash with the Saxo side, not the bank side', () => {
  renderHero()
  expect(screen.getByText(/€9,000\.00 at Saxo · €1,000\.00 bank/)).toBeInTheDocument()
})

it('labels the change figures as net worth', () => {
  renderHero()
  expect(screen.getByText('Net worth change')).toBeInTheDocument()
})
```

Use whatever render helper that test file already defines in place of `renderHero()`; if it renders inline, copy that line.

In `Portfolio.test.jsx` change the `useNetWorth` stub data to `{ portfolio_value: '31567.81', bank_total: '968435.55', bank_only_total: '1435.55', broker_cash: '967000.00', net_worth: '1000003.36' }` and add:

```jsx
it('shows only external banks as the bank balance and notes the Saxo cash separately', () => {
  renderWithProviders(<Portfolio />)

  const bank = screen.getByText('Bank balance').closest('div')
  expect(within(bank.parentElement).getByText('€1,435.55')).toBeInTheDocument()
  expect(screen.getByText(/€967,000\.00 cash at Saxo/)).toBeInTheDocument()
})

it('says the percentage is since purchase', () => {
  renderWithProviders(<Portfolio />)
  expect(screen.getAllByText(/since purchase/).length).toBeGreaterThan(0)
})
```

In `Dashboard.test.jsx` add `bank_only` / `broker_cash` to the shared `value` fixture and add:

```jsx
it('says the percentage beside Portfolio value is since purchase', () => {
  renderWithProviders(<Dashboard />)
  expect(screen.getByText(/since purchase/, { selector: 'span.text-emerald-400, span.text-red-400, span.text-zinc-500' })).toBeInTheDocument()
})
```

If the Dashboard test already renders "Since purchase" in the Movers toggle, use `getAllByText` and assert the one inside the stat strip by its container instead.

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run src/components/dashboard/HeroValue.test.jsx src/pages/Portfolio.test.jsx src/pages/Dashboard.test.jsx`
Expected: FAIL on the new assertions.

- [ ] **Step 3: Implement**

`HeroValue.jsx`:

```jsx
const atSaxo = Number(value.portfolio) + Number(value.broker_cash)
...
<div className="mt-1 text-[var(--fig-xs)] text-zinc-500 num font-mono">
  {fmtEur(atSaxo)} at Saxo · {fmtEur(value.bank_only)} bank
</div>
<div className="mt-4 pt-4 border-t border-white/[0.06]">
  <div className="text-[var(--fig-2xs)] uppercase tracking-wider text-zinc-500 font-medium">Net worth change</div>
  <div className="mt-3 grid grid-cols-2 gap-3">
    {PERIODS.map(([key, label]) => (
      <DeltaPill key={key} label={label} delta={change?.[key]} />
    ))}
    {spendingThisMonth != null && <FlatStat label="Spent MTD" value={fmtEur(spendingThisMonth)} />}
  </div>
</div>
```

(replacing the existing bordered grid `div`; the footer `<p>` stays).

`Dashboard.jsx` Portfolio-value row note:

```jsx
note={
  <span className={pnlTone}>
    {pnlPct == null ? '—' : `${fmtPct(pnlPct)} since purchase`}
  </span>
}
```

`Portfolio.jsx` stat strip: the "Investment portfolio" note becomes `{summary.total_pnl_pct == null ? '—' : `${fmtPct(summary.total_pnl_pct)} since purchase`}` inside the existing `pnlTone` span, and the Bank row becomes:

```jsx
<StatRow
  label="Bank balance"
  value={fmtEur(netWorth.bank_only_total)}
  note={`${fmtEur(netWorth.broker_cash)} cash at Saxo, counted with the portfolio`}
/>
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd frontend && npx vitest run src/components/dashboard src/pages/Portfolio.test.jsx src/pages/Dashboard.test.jsx && npx eslint src/components/dashboard src/pages/Portfolio.jsx src/pages/Dashboard.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "fix: Saxo cash counts on the Saxo side of the net worth split and percentages say what they measure"
```

---

### Task 6: Portfolio Total row from the summary, no Qty total (roadmap 2.2)

**Files:**
- Modify: `frontend/src/pages/Portfolio.jsx:30-45,168-180`
- Modify: `frontend/src/pages/Portfolio.test.jsx`

- [ ] **Step 1: Write the failing tests**

```jsx
describe('Portfolio total row', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    stub()
  })

  const totalRow = () => screen.getByText(/^Total \(\d+ holdings?\)/).closest('tr')

  it('takes value and P&L from the summary, not from summing rows', () => {
    renderWithProviders(<Portfolio />)

    expect(within(totalRow()).getByText('€31,567.81')).toBeInTheDocument()
    expect(within(totalRow()).getByText('-€5.89')).toBeInTheDocument()
  })

  it('does not add up quantities across different instruments', () => {
    renderWithProviders(<Portfolio />)

    expect(within(totalRow()).queryByText('20')).toBeNull()
  })

  it('shows a dash for P&L when the summary has none', () => {
    queries.usePortfolioSummary.mockReturnValue({
      ...idle,
      data: { total_value: '31567.81', total_cost: null, total_pnl: null, total_pnl_pct: null, allocation: [] },
    })
    renderWithProviders(<Portfolio />)

    expect(within(totalRow()).getByText('—')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run src/pages/Portfolio.test.jsx`
Expected: FAIL (the row shows the summed position value and a Qty total).

- [ ] **Step 3: Implement**

Replace the `totals` reduction with:

```jsx
const positionsValue = positions.reduce((sum, p) => sum + Number(p.value), 0)
```

and rename its remaining uses: `totals.value` → `positionsValue` (in `otherHoldingsValue`, and the two `totals.value > 0` guards). Replace the total row:

```jsx
<tr className="bg-zinc-800/20">
  <Td edge className="font-medium text-zinc-300">
    Total ({positions.length} {positions.length === 1 ? 'holding' : 'holdings'})
  </Td>
  <Td />
  <Td />
  <Td />
  <Td />
  <Td align="right" className="num text-zinc-100 font-medium">{fmtEur(summary.total_value)}</Td>
  <Td align="right" className={`num font-medium ${pnlTone}`}>{fmtEur(summary.total_pnl, { sign: true })}</Td>
  <Td edge align="right" className="num text-zinc-300">100.0%</Td>
</tr>
```

`pnlTone` is already defined above from `total_pnl_pct`; a null P&L gets the muted tone. The unused `fmtQty` import stays (the row cells still use it).

- [ ] **Step 4: Run to verify they pass**

Run: `cd frontend && npx vitest run src/pages/Portfolio.test.jsx && npx eslint src/pages/Portfolio.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Portfolio.jsx frontend/src/pages/Portfolio.test.jsx
git commit -m "fix: portfolio total row reads the broker summary and drops the meaningless quantity sum"
```

---

### Task 7: Padded value-axis domain on the history chart (roadmap 2.2)

**Files:**
- Modify: `frontend/src/lib/charts.js`
- Modify: `frontend/src/lib/charts.test.js`
- Modify: `frontend/src/components/HistoryAreaChart.jsx`

**Interfaces:**
- Produces: `paddedDomain([min, max]): [number, number]` exported from `lib/charts.js`.

First verify the series (roadmap: "the series that matches `total_value`, or is relabelled"). Run against the dev DB and compare the latest snapshot with the summary:

```bash
cd backend && python manage.py shell -c "from core.models import NetWorthSnapshot as S; from portfolio.services import get_portfolio_value as g; print(S.objects.latest('date').portfolio_value, g())"
```

If the two agree, `portfolio_value` is the right series and only the domain changes. If they differ, report it in the PR description and relabel the chart subtitle to "Positions value at each daily snapshot"; do not change the series.

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/lib/charts.test.js` (add `paddedDomain` to the existing import from `./charts`):

```js
describe('paddedDomain', () => {
  it('leaves headroom around the data instead of starting at zero', () => {
    const [low, high] = paddedDomain([31000, 32000])
    expect(low).toBeLessThan(31000)
    expect(low).toBeGreaterThan(30000)
    expect(high).toBeGreaterThan(32000)
    expect(high).toBeLessThan(33000)
  })

  it('gives a flat series a visible span', () => {
    const [low, high] = paddedDomain([5000, 5000])
    expect(high - low).toBeGreaterThan(0)
    expect(low).toBeLessThan(5000)
    expect(high).toBeGreaterThan(5000)
  })

  it('handles a series of zeros', () => {
    const [low, high] = paddedDomain([0, 0])
    expect(high).toBeGreaterThan(low)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run src/lib/charts.test.js`
Expected: FAIL (`paddedDomain is not a function`).

- [ ] **Step 3: Implement**

In `frontend/src/lib/charts.js` after `moneyAxisProps`:

```js
export function paddedDomain([min, max]) {
  const span = max - min
  const pad = span > 0 ? span * 0.1 : Math.abs(max) * 0.01 || 1
  return [min - pad, max + pad]
}
```

In `HistoryAreaChart.jsx` import `paddedDomain` and render `<YAxis {...moneyAxisProps} domain={paddedDomain} />`.

Confirm the installed Recharts accepts a function domain: `grep '"recharts"' frontend/package.json`. Recharts 2.x and 3.x both accept `domain={([dataMin, dataMax]) => [...]}`; if the version is older than 2.1, wrap in the `[(min) => ..., (max) => ...]` array form instead and adapt the helper's tests.

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npx vitest run src/lib/charts.test.js src/components/HistoryAreaChart.test.jsx && npx eslint src/lib/charts.js src/components/HistoryAreaChart.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/charts.js frontend/src/lib/charts.test.js frontend/src/components/HistoryAreaChart.jsx
git commit -m "fix: portfolio value chart pads its axis so movement is visible"
```

---

### Task 8: Dashboard cards: currency title, empty Losers, net-worth legend (roadmap 2.3)

**Files:**
- Modify: `frontend/src/components/dashboard/ExposureCard.jsx` and its test
- Modify: `frontend/src/components/dashboard/MoversCard.jsx` and its test
- Modify: `frontend/src/components/NetWorthChart.jsx`
- Create: `frontend/src/components/NetWorthChart.test.jsx`

- [ ] **Step 1: Write the failing tests**

`ExposureCard.test.jsx`: change the heading assertion at line 18 to `'Portfolio currency'`.

`MoversCard.test.jsx` (follow that file's existing render helper and fixture names):

```jsx
it('hides the Losers column when nothing is down', () => {
  renderMovers({ movers: { best: [{ ticker: 'NVDA', pnl_pct: 5, pnl: 100 }], worst: [] } })
  expect(screen.getByText('Gainers')).toBeInTheDocument()
  expect(screen.queryByText('Losers')).toBeNull()
})

it('hides the Gainers column when nothing is up', () => {
  renderMovers({ movers: { best: [], worst: [{ ticker: 'AMD', pnl_pct: -5, pnl: -100 }] } })
  expect(screen.queryByText('Gainers')).toBeNull()
  expect(screen.getByText('Losers')).toBeInTheDocument()
})
```

`NetWorthChart.test.jsx`:

```jsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'

import { renderWithProviders } from '../test/renderWithProviders'
import NetWorthChart from './NetWorthChart'

vi.mock('../api/queries')
import * as queries from '../api/queries'

const history = [
  { date: '2026-09-01', portfolio_value: 100, bank_total: 50, net_worth: 150 },
  { date: '2026-09-02', portfolio_value: 110, bank_total: 50, net_worth: 160 },
]

describe('NetWorthChart legend', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    queries.useNetWorthHistory.mockReturnValue({ data: history, isLoading: false, error: null })
  })

  it('names every drawn series in the default view', () => {
    renderWithProviders(<NetWorthChart />)
    const legend = screen.getByRole('list', { name: 'Chart series' })

    expect(legend).toHaveTextContent('Positions')
    expect(legend).toHaveTextContent('Cash (bank + Saxo)')
    expect(legend).toHaveTextContent('Total')
  })

  it('lists only the selected series when a view is chosen', () => {
    renderWithProviders(<NetWorthChart />)
    fireEvent.click(screen.getByRole('button', { name: 'Investments' }))
    const legend = screen.getByRole('list', { name: 'Chart series' })

    expect(legend).toHaveTextContent('Positions')
    expect(legend).not.toHaveTextContent('Total')
  })
})
```

If `Pill` does not render a `button`, query by `getByText('Investments')` instead.

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run src/components/dashboard src/components/NetWorthChart.test.jsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`ExposureCard.jsx`: `<CardHeader title="Portfolio currency" subtitle="By value" />`.

`MoversCard.jsx`: `Column` returns `null` when `rows.length === 0`:

```jsx
function Column({ title, rows }) {
  if (rows.length === 0) return null
  return (
    <div>
      ...unchanged...
    </div>
  )
}
```

`NetWorthChart.jsx`: define the series once, drive both the lines' names and the legend from it, and render the legend under the chart area:

```jsx
const SERIES = [
  { key: 'INVESTMENTS', dataKey: 'portfolio_value', name: 'Positions', color: SERIES_INVESTMENTS },
  { key: 'BANK', dataKey: 'bank_total', name: 'Cash (bank + Saxo)', color: SERIES_BANK },
  { key: 'TOTAL', dataKey: 'net_worth', name: 'Total', color: SERIES_TOTAL },
]

function SeriesLegend({ series, dimmed }) {
  return (
    <ul aria-label="Chart series" className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5 text-[var(--fig-xs)] text-zinc-400">
          <span
            className="w-4 border-t-2"
            style={{ borderColor: s.color, borderStyle: dimmed && s.key !== 'TOTAL' ? 'dashed' : 'solid' }}
          />
          {s.name}
        </li>
      ))}
    </ul>
  )
}
```

Inside the component: `const visible = SERIES.filter((s) => (view === 'ALL' ? true : s.key === view))`; set each `<Line name=...>` from `SERIES` (`Positions`, `Cash (bank + Saxo)`, `Total`) and render `<SeriesLegend series={visible} dimmed={view === 'ALL'} />` right after the chart's `div`. Keep the existing `Line` props; only the `name` strings change.

- [ ] **Step 4: Run to verify they pass**

Run: `cd frontend && npx vitest run src/components && npx eslint src/components`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components
git commit -m "fix: dashboard cards say what they cover and the net worth chart has a legend"
```

---

### Task 9: Phase 2A gate

**Files:** none (verification, then the PR).

- [ ] **Step 1: Full test, lint and build**

```bash
cd frontend && npx vitest run && npx eslint src && npm run build
cd ../backend && python manage.py test
```
Expected: all green. If a failure is in a file this plan did not touch, stop and report it rather than fixing it here.

- [ ] **Step 2: Migration check against the dev DB**

Run: `cd backend && python manage.py migrate --check`
Expected: exit 0 (this plan adds no migration; the check proves nothing drifted).

- [ ] **Step 3: Verify the new payload live**

With the stack up (`scripts/dev.sh`), fetch `/api/accounts/net-worth/` with a valid token and confirm `bank_total == bank_only_total + broker_cash`. Report the three numbers.

- [ ] **Step 4: Screenshots**

Use the `saxodash-design-system` skill's screenshot harness for `/transactions`, `/` and `/portfolio` at 1440px and 390px. Check: USD trades show `US$` prices; BUY rows read `-€`; hero says "at Saxo"; Portfolio total row has no quantity; history chart is not pinned to zero. The roadmap's two "verify first" items (Dashboard heatmap legend range in Since-purchase mode, Portfolio sector donut palette) are looked at here and recorded in the PR description as fixed or fine; if broken, add a follow-up task rather than expanding this one.

- [ ] **Step 5: Open the PR**

PR title: `fix: money figures on Transactions, Dashboard and Portfolio (review Phase 2A)`. Body: the three decisions above, the verify-first outcomes, and the series check from Task 7.

---

## Self-review

- **Spec coverage:** 2.1 → Tasks 1–3. 2.2 → Tasks 6–7. 2.3 → Tasks 4, 5, 8 (Saxo cash side, "since purchase", "net worth" delta label, Portfolio currency title, empty Losers, chart legend). The 2.3 "net-worth chart default" has no separate task: the default stays `ALL` and the legend is what fixes it (decision 1); say so in the PR if the user wants a different default.
- **Placeholders:** none. Steps that depend on a file's unseen test helper (Tasks 3, 5, 8) say exactly what to copy and what to fall back to.
- **Type consistency:** `txPrice/txTotal/txTotalClass/txTone/txTypes` defined in Task 1 and used with the same names in Tasks 2 and 3. `bank_only`/`broker_cash` (insights) and `bank_only_total`/`broker_cash` (net-worth) defined in Task 4 and consumed in Task 5. `paddedDomain` defined and used in Task 7.
- **Review Focus mapping:** null currency → Tasks 1, 2; unknown type → Tasks 1, 2; null P&L → Task 6; flat series → Task 7; one-sided Movers → Task 8; no Saxo cash row → Task 4.
