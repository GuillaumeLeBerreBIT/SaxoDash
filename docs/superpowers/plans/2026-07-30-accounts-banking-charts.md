# Accounts/Banking Page Charts Implementation Plan

> **Status: ✅ COMPLETE (2026-07-30)** — All 4 tasks implemented, task-reviewed, and whole-branch reviewed (ready to merge). Frontend 22/22 tests pass; lint + build clean; verified in-browser (Accounts page charts render; cash flow relocated off the Dashboard). Executed subagent-driven in stage-only mode (changes staged; user commits).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add banking charts to the Accounts page — a bank-balance-over-time area chart and a balance-by-account donut — and relocate the existing monthly cash-flow chart from the Dashboard to this page, all with no backend changes.

**Architecture:** Two new self-contained React chart components render into `Accounts.jsx`. `BankBalanceChart` reuses the existing `getNetWorthHistory(range)` client fn (the `bank_total` series). `AccountBreakdownChart` receives the already-fetched `accounts` array as a prop and renders a donut whose slices are colored by each account's `accent`, via a small pure, unit-tested helper. The existing `CashFlowChart` is moved (import + render) from `Dashboard.jsx` to `Accounts.jsx` unchanged.

**Tech Stack:** React 19 + Recharts 3 + Vitest (frontend only). No new dependencies, no backend changes.

## Global Constraints

- No backend changes — no new model, endpoint, migration, or API-client function. Charts use existing endpoints (`/api/core/net-worth-history/`, `/api/transactions/cash-flow/`) and existing client fns (`getNetWorthHistory`, `getCashFlow`, `getBankAccounts`).
- No new npm packages — Recharts 3 and Vitest already present.
- Reuse the existing dark-theme chart look (`chartTooltipProps` from `frontend/src/lib/charts.js`), the shared `RangePills`/`formatAxisDate`, and the established color language: amber `#fbbf24` for bank, and per-account `accent` hex colors for the donut.
- The donut MUST set `isAnimationActive={false}` on its `<Pie>` (Recharts 3.x + React 19 Strict Mode zero-angle first-frame bug — same fix already used by the Dashboard allocation donut).
- Never interpolate `BankAccount.gradient` into a `className` (Tailwind v4 build-time scanning ignores runtime strings); use the `accent` hex via inline `style`, exactly as the existing account cards do (`a.accent || '#3f3f46'`).
- Money formatting via the existing `fmtEur` helper.
- Chart components (Recharts + `ResponsiveContainer`) are verified in-browser, not deep-unit-tested — the only automated test is the pure `toAccountBreakdownData` helper. This matches the existing chart-component precedent.
- Run `npm run lint`, `npm test`, and `npm run build` (in `frontend/`) before considering the final task done — do not break existing passing tests (currently 18 passing).

---

### Task 1: `toAccountBreakdownData` helper (TDD)

**Files:**
- Create: `frontend/src/lib/accounts.js`
- Test: `frontend/src/lib/accounts.test.js`

**Interfaces:**
- Produces: `toAccountBreakdownData(accounts) → Array<{ name: string, value: number, color: string }>` — maps each account to its bank name, numeric balance, and accent color (falling back to `'#3f3f46'` when `accent` is empty/missing). Order preserved. Empty input returns `[]`.
- Consumes: account objects shaped like the `getBankAccounts()` response (each has `bank`, `balance` as a decimal string, and `accent`).

- [x] **Step 1: Write the failing test**

Create `frontend/src/lib/accounts.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { toAccountBreakdownData } from './accounts'

describe('toAccountBreakdownData', () => {
  it('maps accounts to name/value/color', () => {
    const result = toAccountBreakdownData([
      { bank: 'KBC', balance: '12500.00', accent: '#1d4ed8' },
    ])
    expect(result).toEqual([{ name: 'KBC', value: 12500, color: '#1d4ed8' }])
  })

  it('falls back to default color when accent is missing', () => {
    const result = toAccountBreakdownData([
      { bank: 'Saxo', balance: '850.00', accent: '' },
    ])
    expect(result[0].color).toBe('#3f3f46')
  })

  it('coerces balance to a number', () => {
    const result = toAccountBreakdownData([
      { bank: 'ING', balance: '2180.75', accent: '#ea580c' },
    ])
    expect(result[0].value).toBe(2180.75)
  })

  it('returns empty array for no accounts', () => {
    expect(toAccountBreakdownData([])).toEqual([])
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL — `toAccountBreakdownData is not a function` / import error from `./accounts`.

- [x] **Step 3: Implement the helper**

Create `frontend/src/lib/accounts.js`:

```js
export function toAccountBreakdownData(accounts) {
  return accounts.map((a) => ({
    name: a.bank,
    value: Number(a.balance),
    color: a.accent || '#3f3f46',
  }))
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test`
Expected: all tests pass (existing 18 + 4 new = 22).

- [x] **Step 5: Commit**

```bash
git add frontend/src/lib/accounts.js frontend/src/lib/accounts.test.js
git commit -m "feat: add toAccountBreakdownData helper"
```

---

### Task 2: `BankBalanceChart` component

**Files:**
- Create: `frontend/src/components/BankBalanceChart.jsx`

**Interfaces:**
- Consumes: `getNetWorthHistory(range)` from `../api/client`; `fmtEur` from `../lib/format`; `chartTooltipProps` + `formatAxisDate` from `../lib/charts`; `RangePills` from `./RangePills`; `Card`, `CardHeader` from `./ui`.
- Produces: default export `BankBalanceChart()` — a self-contained card with range pills (default `6M`) and an amber area chart of the `bank_total` series. No props.

Visually verified in-browser (Task 4), consistent with the codebase precedent — no automated test for this component.

- [x] **Step 1: Create the component**

Create `frontend/src/components/BankBalanceChart.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { getNetWorthHistory } from '../api/client'
import { fmtEur } from '../lib/format'
import { chartTooltipProps, formatAxisDate } from '../lib/charts'
import { RangePills } from './RangePills'
import { Card, CardHeader } from './ui'

export default function BankBalanceChart() {
  const [range, setRange] = useState('6M')
  const [data, setData] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    getNetWorthHistory(range)
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load bank balance history')
      })
    return () => {
      cancelled = true
    }
  }, [range])

  if (error) {
    return (
      <Card>
        <div className="text-red-400 text-sm">{error}</div>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader
        title="Bank balance"
        subtitle="Total across accounts over time"
        right={<RangePills value={range} onChange={setRange} />}
      />
      <div className="mt-4 h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="bankFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#fbbf24" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatAxisDate}
              tick={{ fill: '#71717a', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#71717a', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={70}
              tickFormatter={(v) => fmtEur(v, { decimals: 0 })}
            />
            <Tooltip {...chartTooltipProps} labelFormatter={formatAxisDate} formatter={(v) => [fmtEur(v), 'Bank']} />
            <Area
              type="monotone"
              dataKey="bank_total"
              name="Bank"
              stroke="#fbbf24"
              strokeWidth={2}
              fill="url(#bankFill)"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
```

- [x] **Step 2: Lint**

Run: `cd frontend && npm run lint`
Expected: no errors.

- [x] **Step 3: Commit**

```bash
git add frontend/src/components/BankBalanceChart.jsx
git commit -m "feat: add BankBalanceChart component"
```

---

### Task 3: `AccountBreakdownChart` component

**Files:**
- Create: `frontend/src/components/AccountBreakdownChart.jsx`

**Interfaces:**
- Consumes: `toAccountBreakdownData(accounts)` from `../lib/accounts` (Task 1); `fmtEur` from `../lib/format`; `chartTooltipProps` from `../lib/charts`; `Card`, `CardHeader` from `./ui`; Recharts `PieChart`/`Pie`/`Cell`/`Tooltip`/`ResponsiveContainer`.
- Produces: default export `AccountBreakdownChart({ accounts })` — a self-contained card with a donut of current balances per account (colored by each account's `accent`) plus a legend row (bank · balance · % of total). Takes `accounts` (the `getBankAccounts()` array) as a prop; does not fetch.

Visually verified in-browser (Task 4) — no automated test for this component; its data logic is covered by Task 1.

- [x] **Step 1: Create the component**

Create `frontend/src/components/AccountBreakdownChart.jsx`:

```jsx
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { fmtEur } from '../lib/format'
import { chartTooltipProps } from '../lib/charts'
import { toAccountBreakdownData } from '../lib/accounts'
import { Card, CardHeader } from './ui'

export default function AccountBreakdownChart({ accounts }) {
  const data = toAccountBreakdownData(accounts)
  const total = data.reduce((sum, d) => sum + d.value, 0)

  return (
    <Card>
      <CardHeader title="Balance by account" subtitle="Share of total balance" />
      <div className="mt-3 h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={2}
              stroke="#18181b"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {data.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Pie>
            <Tooltip {...chartTooltipProps} formatter={(v, n) => [fmtEur(v), n]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-1 gap-y-2 mt-3 pt-4 border-t border-zinc-800">
        {data.map((d, i) => {
          const pct = total > 0 ? (d.value / total) * 100 : 0
          return (
            <div key={i} className="flex items-center gap-2 text-[12px]">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
              <span className="text-zinc-300 font-medium">{d.name}</span>
              <span className="ml-auto text-zinc-500 num font-mono">{fmtEur(d.value)}</span>
              <span className="text-zinc-600 num font-mono w-12 text-right">{pct.toFixed(1)}%</span>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
```

- [x] **Step 2: Lint**

Run: `cd frontend && npm run lint`
Expected: no errors.

- [x] **Step 3: Commit**

```bash
git add frontend/src/components/AccountBreakdownChart.jsx
git commit -m "feat: add AccountBreakdownChart component"
```

---

### Task 4: Relocate `CashFlowChart` and wire all charts into the Accounts page

**Files:**
- Modify: `frontend/src/pages/Dashboard.jsx`
- Modify: `frontend/src/pages/Accounts.jsx`

**Interfaces:**
- Consumes: `BankBalanceChart` (default export from `../components/BankBalanceChart`, Task 2); `AccountBreakdownChart` (default export from `../components/AccountBreakdownChart`, Task 3); `CashFlowChart` (existing default export from `../components/CashFlowChart`). `Accounts.jsx` already holds `accounts` in state and fetches it.

- [x] **Step 1: Remove `CashFlowChart` from the Dashboard**

In `frontend/src/pages/Dashboard.jsx`, delete the import line (line 10):

```jsx
import CashFlowChart from '../components/CashFlowChart'
```

and delete the render (line 143) together with its surrounding blank lines, so this:

```jsx
      </div>

      <CashFlowChart />

      <Card padding={false}>
```

becomes:

```jsx
      </div>

      <Card padding={false}>
```

- [x] **Step 2: Replace `Accounts.jsx` with the charts-integrated version**

Replace the entire contents of `frontend/src/pages/Accounts.jsx` with:

```jsx
import { useEffect, useState } from 'react'
import { getBankAccounts } from '../api/client'
import { fmtEur } from '../lib/format'
import { Card, PageHeader, StatCard } from '../components/ui'
import BankBalanceChart from '../components/BankBalanceChart'
import AccountBreakdownChart from '../components/AccountBreakdownChart'
import CashFlowChart from '../components/CashFlowChart'

export default function Accounts() {
  const [accounts, setAccounts] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    getBankAccounts()
      .then((res) => setAccounts(res.results ?? res))
      .catch(() => setError('Failed to load accounts'))
  }, [])

  if (error) return <div className="text-red-400 text-sm">{error}</div>
  if (!accounts) return <div className="text-zinc-500 text-sm">Loading…</div>

  const total = accounts.reduce((sum, a) => sum + Number(a.balance), 0)

  return (
    <div className="space-y-5">
      <PageHeader title="Accounts" subtitle="Your connected bank accounts" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total Balance" value={fmtEur(total)} note={`${accounts.length} accounts`} />
      </div>

      <BankBalanceChart />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {accounts.map((a) => (
            <Card key={a.id} className="relative overflow-hidden">
              <span
                className="absolute left-0 top-0 bottom-0 w-1"
                style={{ background: a.accent || '#3f3f46' }}
              />
              <div className="pl-2">
                <div className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider">{a.type}</div>
                <div className="mt-1 text-[14px] font-medium text-zinc-100">{a.bank}</div>
                <div className="mt-0.5 text-[12px] text-zinc-500 num font-mono">{a.iban_masked}</div>
                <div className="mt-4 text-[22px] font-semibold text-zinc-50 tracking-tight num font-mono">
                  {fmtEur(a.balance)}
                </div>
                {Number(a.available) !== Number(a.balance) && (
                  <div className="mt-1 text-[12px] text-zinc-500">{fmtEur(a.available)} available</div>
                )}
              </div>
            </Card>
          ))}
        </div>

        <AccountBreakdownChart accounts={accounts} />
      </div>

      <CashFlowChart />
    </div>
  )
}
```

- [x] **Step 3: Run all frontend checks**

Run:
```bash
cd frontend
npm run lint
npm test
npm run build
```
Expected: lint clean, all tests pass (22), build succeeds.

- [x] **Step 4: Manually verify in the browser**

Run `cd backend && python manage.py runserver` (one terminal) and `cd frontend && npm run dev` (another), then open the app, log in, and confirm:
- **Accounts page:** under the Total Balance stat, the **Bank balance** amber area chart renders for the default 6M range and reloads on each range pill (1M/3M/6M/1Y/All). Beside the account cards, the **Balance by account** donut shows one slice per account, colored to match each card's accent stripe, with a legend showing bank · balance · %. At the bottom, the **Monthly cash flow** chart renders.
- **Dashboard page:** still renders correctly and **no longer shows** the Monthly cash flow chart (it moved to Accounts).

- [x] **Step 5: Commit**

```bash
git add frontend/src/pages/Dashboard.jsx frontend/src/pages/Accounts.jsx
git commit -m "feat: add banking charts to Accounts page and relocate cash flow chart"
```
