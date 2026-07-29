# Portfolio Performance Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two performance charts to the Portfolio page — an investment-value-over-time area chart and a gainers/losers P&L% bar chart — reusing existing endpoints with no backend changes.

**Architecture:** Two new self-contained React chart components render into `Portfolio.jsx`. `PortfolioValueChart` reuses the existing `getNetWorthHistory(range)` client fn (`portfolio_value` series). `GainersLosersChart` receives the already-fetched `positions` as a prop and ranks them by the backend-provided `pnl_pct` field via a small pure, unit-tested helper. The `Pill`/`RANGES` range-selector currently trapped inside `NetWorthChart` is extracted into a shared `RangePills` module (plus `formatAxisDate` moved to `lib/charts.js`) so both time-series charts reuse it.

**Tech Stack:** React 19 + Recharts 3 + Vitest (frontend only). No new dependencies, no backend changes.

## Global Constraints

- No backend changes — no new model, endpoint, migration, or API-client function. Both charts use existing endpoints (`/api/core/net-worth-history/`, `/api/portfolio/positions/`) and existing client fns (`getNetWorthHistory`, `getPositions`).
- No new npm packages — Recharts 3 and Vitest are already present.
- Reuse the existing dark-theme chart look (`chartTooltipProps` from `frontend/src/lib/charts.js`) and the established color language: emerald `#34d399` for investments/gains, red `#f87171` for losses.
- Money/percent formatting via existing `fmtEur`/`fmtPct` helpers in `frontend/src/lib/format.js`.
- Chart components (Recharts + `ResponsiveContainer`) are verified in-browser, not deep-unit-tested — the only automated test is the pure `toGainersLosersData` helper. This matches the existing `NetWorthChart`/`CashFlowChart` precedent.
- Run `npm run lint`, `npm test`, and `npm run build` (in `frontend/`) before considering the final task done — do not break existing passing tests (currently 14 passing).

---

### Task 1: Extract shared `RangePills` + `formatAxisDate`, refactor `NetWorthChart`

**Files:**
- Create: `frontend/src/components/RangePills.jsx`
- Modify: `frontend/src/lib/charts.js`
- Modify: `frontend/src/components/NetWorthChart.jsx`

**Interfaces:**
- Produces: `RANGES` (`string[]`), `Pill({ active, onClick, children })`, `RangePills({ value, onChange })` from `./RangePills`; `formatAxisDate(value) → string` from `../lib/charts`.
- Consumes: nothing new.

This task has no unit test (the affected components are visually verified per the codebase precedent). Its verification is: lint clean, existing test suite still green, build succeeds, and the Net worth chart still renders/behaves in the browser.

- [ ] **Step 1: Create the shared `RangePills` module**

Create `frontend/src/components/RangePills.jsx`:

```jsx
export const RANGES = ['1M', '3M', '6M', '1Y', 'ALL']

export function Pill({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-[11.5px] px-2.5 py-1 rounded-md font-medium transition-colors ${
        active ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
      }`}
    >
      {children}
    </button>
  )
}

export function RangePills({ value, onChange }) {
  return (
    <div className="flex items-center gap-1">
      {RANGES.map((r) => (
        <Pill key={r} active={value === r} onClick={() => onChange(r)}>
          {r}
        </Pill>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Add `formatAxisDate` to `lib/charts.js`**

Append to `frontend/src/lib/charts.js` (after the existing `chartTooltipProps` export):

```js
export function formatAxisDate(value) {
  return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}
```

- [ ] **Step 3: Refactor `NetWorthChart.jsx` to use the shared pieces**

Replace the entire contents of `frontend/src/components/NetWorthChart.jsx` with (imports updated; local `RANGES`, `Pill`, and `formatAxisDate` removed; range row now uses `<RangePills>`; the Investments/Bank/All toggle keeps using the shared `Pill`):

```jsx
import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { getNetWorthHistory } from '../api/client'
import { fmtEur } from '../lib/format'
import { chartTooltipProps, formatAxisDate } from '../lib/charts'
import { Pill, RangePills } from './RangePills'
import { Card, CardHeader } from './ui'

const VIEWS = [
  { key: 'ALL', label: 'All' },
  { key: 'INVESTMENTS', label: 'Investments' },
  { key: 'BANK', label: 'Bank' },
]

export default function NetWorthChart() {
  const [range, setRange] = useState('6M')
  const [view, setView] = useState('ALL')
  const [data, setData] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    getNetWorthHistory(range)
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load net worth history')
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

  const showInvestments = view === 'ALL' || view === 'INVESTMENTS'
  const showBank = view === 'ALL' || view === 'BANK'
  const showTotal = view === 'ALL'

  return (
    <Card>
      <CardHeader
        title="Net worth history"
        subtitle="Portfolio and bank accounts over time"
        right={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-zinc-900/60 rounded-md p-0.5 border border-white/[0.06]">
              {VIEWS.map((v) => (
                <Pill key={v.key} active={view === v.key} onClick={() => setView(v.key)}>
                  {v.label}
                </Pill>
              ))}
            </div>
            <RangePills value={range} onChange={setRange} />
          </div>
        }
      />
      <div className="mt-4 h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
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
            <Tooltip {...chartTooltipProps} labelFormatter={formatAxisDate} formatter={(v, n) => [fmtEur(v), n]} />
            {showInvestments && (
              <Line
                type="monotone"
                dataKey="portfolio_value"
                name="Investments"
                stroke="#34d399"
                strokeWidth={showTotal ? 1.5 : 2}
                strokeOpacity={showTotal ? 0.5 : 1}
                strokeDasharray={showTotal ? '4 3' : undefined}
                dot={false}
                isAnimationActive={false}
              />
            )}
            {showBank && (
              <Line
                type="monotone"
                dataKey="bank_total"
                name="Bank"
                stroke="#fbbf24"
                strokeWidth={showTotal ? 1.5 : 2}
                strokeOpacity={showTotal ? 0.5 : 1}
                strokeDasharray={showTotal ? '4 3' : undefined}
                dot={false}
                isAnimationActive={false}
              />
            )}
            {showTotal && (
              <Line
                type="monotone"
                dataKey="net_worth"
                name="Total"
                stroke="#60a5fa"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
```

- [ ] **Step 4: Verify lint, tests, and build**

Run:
```bash
cd frontend
npm run lint
npm test
npm run build
```
Expected: lint clean, all existing tests pass (14), build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/RangePills.jsx frontend/src/lib/charts.js frontend/src/components/NetWorthChart.jsx
git commit -m "refactor: extract shared RangePills and formatAxisDate"
```

---

### Task 2: `toGainersLosersData` helper (TDD)

**Files:**
- Create: `frontend/src/lib/performance.js`
- Test: `frontend/src/lib/performance.test.js`

**Interfaces:**
- Produces: `toGainersLosersData(positions) → Array<{ ticker: string, pnlPct: number }>` — maps each position to its ticker and numeric `pnl_pct`, sorted descending (best P&L% first). Empty input returns `[]`.
- Consumes: position objects shaped like the `getPositions()` response (each has `ticker` and `pnl_pct`, where `pnl_pct` is a decimal string like `'50.00'`).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/performance.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { toGainersLosersData } from './performance'

describe('toGainersLosersData', () => {
  it('maps positions to ticker + numeric pnlPct', () => {
    const result = toGainersLosersData([{ ticker: 'NVDA', pnl_pct: '50.00' }])
    expect(result).toEqual([{ ticker: 'NVDA', pnlPct: 50 }])
  })

  it('sorts descending by pnlPct (best first)', () => {
    const result = toGainersLosersData([
      { ticker: 'A', pnl_pct: '10.00' },
      { ticker: 'B', pnl_pct: '80.00' },
      { ticker: 'C', pnl_pct: '-5.00' },
    ])
    expect(result.map((r) => r.ticker)).toEqual(['B', 'A', 'C'])
  })

  it('handles negative (loss) values', () => {
    const result = toGainersLosersData([{ ticker: 'L', pnl_pct: '-20.00' }])
    expect(result[0].pnlPct).toBe(-20)
  })

  it('returns empty array for no positions', () => {
    expect(toGainersLosersData([])).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL — `toGainersLosersData is not a function` / import error from `./performance`.

- [ ] **Step 3: Implement the helper**

Create `frontend/src/lib/performance.js`:

```js
export function toGainersLosersData(positions) {
  return positions
    .map((p) => ({ ticker: p.ticker, pnlPct: Number(p.pnl_pct) }))
    .sort((a, b) => b.pnlPct - a.pnlPct)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test`
Expected: all tests pass (existing 14 + 4 new = 18).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/performance.js frontend/src/lib/performance.test.js
git commit -m "feat: add toGainersLosersData helper"
```

---

### Task 3: `PortfolioValueChart` component

**Files:**
- Create: `frontend/src/components/PortfolioValueChart.jsx`

**Interfaces:**
- Consumes: `getNetWorthHistory(range)` from `../api/client`; `fmtEur` from `../lib/format`; `chartTooltipProps` + `formatAxisDate` from `../lib/charts`; `RangePills` from `./RangePills` (Task 1); `Card`, `CardHeader` from `./ui`.
- Produces: default export `PortfolioValueChart()` — a self-contained card with range pills (default `6M`) and an emerald area chart of the `portfolio_value` series. No props.

Visually verified in-browser (Task 5), consistent with the codebase precedent — no automated test for this component.

- [ ] **Step 1: Create the component**

Create `frontend/src/components/PortfolioValueChart.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { getNetWorthHistory } from '../api/client'
import { fmtEur } from '../lib/format'
import { chartTooltipProps, formatAxisDate } from '../lib/charts'
import { RangePills } from './RangePills'
import { Card, CardHeader } from './ui'

export default function PortfolioValueChart() {
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
        if (!cancelled) setError('Failed to load portfolio history')
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
        title="Portfolio value"
        subtitle="Investment value over time"
        right={<RangePills value={range} onChange={setRange} />}
      />
      <div className="mt-4 h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="portfolioFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
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
            <Tooltip {...chartTooltipProps} labelFormatter={formatAxisDate} formatter={(v) => [fmtEur(v), 'Portfolio']} />
            <Area
              type="monotone"
              dataKey="portfolio_value"
              name="Portfolio"
              stroke="#34d399"
              strokeWidth={2}
              fill="url(#portfolioFill)"
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

- [ ] **Step 2: Lint**

Run: `cd frontend && npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/PortfolioValueChart.jsx
git commit -m "feat: add PortfolioValueChart component"
```

---

### Task 4: `GainersLosersChart` component

**Files:**
- Create: `frontend/src/components/GainersLosersChart.jsx`

**Interfaces:**
- Consumes: `toGainersLosersData(positions)` from `../lib/performance` (Task 2); `fmtPct` from `../lib/format`; `chartTooltipProps` from `../lib/charts`; `Card`, `CardHeader` from `./ui`.
- Produces: default export `GainersLosersChart({ positions })` — a self-contained card with a horizontal bar chart of P&L% per holding, green bars for gains and red for losses. Takes `positions` (the `getPositions()` array) as a prop; does not fetch.

Visually verified in-browser (Task 5) — no automated test for this component; the data logic it relies on is covered by Task 2.

- [ ] **Step 1: Create the component**

Create `frontend/src/components/GainersLosersChart.jsx`:

```jsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from 'recharts'
import { fmtPct } from '../lib/format'
import { chartTooltipProps } from '../lib/charts'
import { toGainersLosersData } from '../lib/performance'
import { Card, CardHeader } from './ui'

export default function GainersLosersChart({ positions }) {
  const data = toGainersLosersData(positions)

  return (
    <Card>
      <CardHeader title="Gainers & losers" subtitle="Unrealised P&L % per holding" />
      <div className="mt-4 h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fill: '#71717a', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}%`}
            />
            <YAxis
              type="category"
              dataKey="ticker"
              tick={{ fill: '#a1a1aa', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={56}
            />
            <Tooltip {...chartTooltipProps} formatter={(v) => [fmtPct(v), 'P&L']} />
            <Bar dataKey="pnlPct" radius={[0, 3, 3, 0]} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.ticker} fill={d.pnlPct >= 0 ? '#34d399' : '#f87171'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
```

- [ ] **Step 2: Lint**

Run: `cd frontend && npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/GainersLosersChart.jsx
git commit -m "feat: add GainersLosersChart component"
```

---

### Task 5: Wire both charts into `Portfolio.jsx`

**Files:**
- Modify: `frontend/src/pages/Portfolio.jsx`

**Interfaces:**
- Consumes: `PortfolioValueChart` (default export from `../components/PortfolioValueChart`, Task 3); `GainersLosersChart` (default export from `../components/GainersLosersChart`, Task 4). `Portfolio.jsx` already holds `positions` in state and fetches it.

- [ ] **Step 1: Add the imports**

In `frontend/src/pages/Portfolio.jsx`, add after the existing `import { Card, CardHeader, PageHeader, Badge } from '../components/ui'` line:

```jsx
import PortfolioValueChart from '../components/PortfolioValueChart'
import GainersLosersChart from '../components/GainersLosersChart'
```

- [ ] **Step 2: Render `PortfolioValueChart` under the summary card**

The summary card is the first `<Card>` block (the `grid grid-cols-3` net-worth summary). Immediately after its closing `</Card>` and before the `<div className="grid grid-cols-20 gap-4" ...>` holdings grid, insert:

```jsx
      <PortfolioValueChart />

```

So the order becomes: summary `</Card>` → `<PortfolioValueChart />` → holdings/sidebar grid.

- [ ] **Step 3: Render `GainersLosersChart` below the holdings grid**

Immediately after the closing `</div>` of the `grid grid-cols-20` holdings/sidebar grid (the last element before the outer container's closing `</div>`), insert:

```jsx
      <GainersLosersChart positions={positions} />
```

So the order becomes: holdings/sidebar grid `</div>` → `<GainersLosersChart positions={positions} />` → outer `</div>`.

- [ ] **Step 4: Run all frontend checks**

Run:
```bash
cd frontend
npm run lint
npm test
npm run build
```
Expected: lint clean, all tests pass (18), build succeeds.

- [ ] **Step 5: Manually verify in the browser**

Run `cd backend && python manage.py runserver` (one terminal) and `cd frontend && npm run dev` (another), then open the app, log in, and on the Portfolio page confirm:
- Below the summary card, the **Portfolio value** area chart renders an emerald filled area for the default 6M range, and clicking each range pill (1M/3M/6M/1Y/All) reloads it with a different date span.
- Below the holdings/sidebar grid, the **Gainers & losers** chart shows one horizontal bar per holding, sorted best→worst top-to-bottom, green bars for positive P&L% and red for negative.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Portfolio.jsx
git commit -m "feat: wire portfolio value and gainers/losers charts into Portfolio page"
```
