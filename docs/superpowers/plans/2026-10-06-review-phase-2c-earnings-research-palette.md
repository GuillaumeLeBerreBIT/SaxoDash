# Review Phase 2C — Earnings, Research, ⌘K palette Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix roadmap rows 2.8 (Earnings), 2.9 (Research) and 2.10 (⌘K palette + shared nav list) from the 2026-10-04 review.

**Architecture:** Four small, file-disjoint-ish frontend tasks plus a gate. Logic that can be wrong goes into `lib/` helpers with vitest specs first (`fmtRevenue`, `splitBySession`, `dayDate`, `eventKey`, `moveCaption`, axis formatters, a single `NAV_ITEMS` list); components then consume them. No backend change: Phase 1 already emits `session: null`, nulls negative revenue and de-duplicates events.

**Tech Stack:** Vite + React 19 (JS), Tailwind, Recharts, vitest + Testing Library, ESLint.

**Spec:** `docs/superpowers/plans/2026-10-04-app-review-roadmap.md` (rows 2.8, 2.9, 2.10 and its Global Constraints). Worktree: `../SaxoDash-review-2c`, branch `fix/review-frontend-2c`, cut from `origin/main` (b2f3393). `frontend/node_modules` is a symlink into the main checkout.

## Global Constraints

- Zero code comments in new or edited code (AGENTS.md). Where a legacy comment is made false by the edit, delete it; otherwise leave existing comments alone.
- Test-first: failing spec, see it fail, minimal change, see it pass.
- An absent figure is `null` and renders `—`, never zero.
- `Card` is the one container language; check `components/ui.jsx` before inventing markup.
- One green, one red from `lib/charts.js`; no financial state by colour alone.
- Run all commands from `SaxoDash-review-2c/frontend`: `npx vitest run <file>`, `npx eslint <files>`, `npm run build`.
- Do not touch the main checkout (`../SaxoDash`, branch `feat/investors`) or `../SaxoDash-review-frontend` (2B's worktree).
- Never run anything against the real `db.sqlite3`; the screenshot pass in Task 5 uses a COPY.

## Review Focus

Inputs and conditions the roadmap rows imply but whose tests would otherwise be missing. Each has a test in the owning task.

1. An earnings event with `session: null` or `'dmh'` must not be filed under "After close" (Task 2).
2. Two events for the same symbol and date but different quarters must not collide on a React key (Task 2).
3. A symbol typed into the URL that resolves to no instrument must not enter the Recent strip (Task 3).
4. A live quote on a weekend/holiday, when the newest bar is older than today, must read "latest session", not "today" (Task 3).
5. Revenue of exactly 0, between 0 and 1M, `null`, and ≥ 1T must format sensibly, never `NaN` or `0.0M` (Task 2).
6. A news list of ≤ 10 items must show no "Show more" button, and switching symbol must reset the cap (Task 3).

---

### Task 1: One nav list; palette gets Discover and Spending; ticker prefix beats leveraged ETFs (row 2.10)

**Files:**
- Create: `frontend/src/lib/navigation.js`
- Create: `frontend/src/lib/navigation.test.js`
- Modify: `frontend/src/lib/commands.js` (whole file)
- Modify: `frontend/src/components/Sidebar.jsx:1-15` (items list → import)
- Modify: `frontend/src/lib/research.js:109-118` (`rankInstrumentResults`)
- Test: `frontend/src/lib/research.test.js`, `frontend/src/components/CommandPalette.test.jsx`, `frontend/src/components/Sidebar.test.jsx`

**Interfaces:**
- Produces: `NAV_ITEMS: Array<{ to: string, label: string, icon: LucideIcon, end?: boolean }>` from `lib/navigation.js`; `PAGE_COMMANDS` stays `Array<{ to, label }>` derived from it. `rankInstrumentResults(results, symbol)` keeps its signature.

- [ ] **Step 1: Write the failing tests**

`frontend/src/lib/navigation.test.js`:

```js
import { describe, expect, it } from 'vitest'

import { PAGE_COMMANDS } from './commands'
import { NAV_ITEMS } from './navigation'

describe('navigation', () => {
  it('offers every sidebar destination in the palette, in the same order', () => {
    expect(PAGE_COMMANDS.map((c) => c.to)).toEqual(NAV_ITEMS.map((i) => i.to))
    expect(PAGE_COMMANDS.map((c) => c.label)).toEqual(NAV_ITEMS.map((i) => i.label))
  })

  it('includes Discover and Spending', () => {
    const labels = PAGE_COMMANDS.map((c) => c.label)
    expect(labels).toContain('Discover')
    expect(labels).toContain('Spending')
  })
})
```

Append to the `describe` block of `frontend/src/lib/research.test.js` that covers `rankInstrumentResults` (add a new `describe('rankInstrumentResults ticker ranking', …)` if none fits; import `rankInstrumentResults` if not already imported):

```js
const hit = (symbol, description, exchange = 'NASDAQ', asset_type = 'Stock') => ({
  symbol, description, exchange, asset_type, uic: symbol.length * 100 + symbol.charCodeAt(0),
})

it('ranks a ticker-prefix match above a leveraged ETF', () => {
  const results = [
    hit('TSLL', 'Direxion Daily TSLA Bull 2X Shares', 'NYSE ARCA', 'Etf'),
    hit('TSLA', 'Tesla Inc'),
  ]
  expect(rankInstrumentResults(results, 'TSL').map((r) => r.symbol)).toEqual(['TSLA', 'TSLL'])
})

it('keeps an exact match first even against a leveraged product', () => {
  const results = [
    hit('TQQQ', 'ProShares UltraPro QQQ 3x Shares', 'NASDAQ', 'Etf'),
    hit('QQQ', 'Invesco QQQ Trust', 'NASDAQ', 'Etf'),
  ]
  expect(rankInstrumentResults(results, 'QQQ').map((r) => r.symbol)).toEqual(['QQQ', 'TQQQ'])
})

it('ranks a non-leveraged non-prefix match above a leveraged prefix match', () => {
  const results = [
    hit('TSLL', 'Direxion Daily TSLA Bull 2X Shares', 'NYSE ARCA', 'Etf'),
    hit('TL0', 'Tesla Ltd', 'XETR'),
  ]
  expect(rankInstrumentResults(results, 'TSL').map((r) => r.symbol)).toEqual(['TL0', 'TSLL'])
})
```

Append to `frontend/src/components/CommandPalette.test.jsx` inside `describe('CommandPalette', …)`:

```jsx
it.each([['spend', /Spending/], ['disc', /Discover/]])('offers the %s page', async (query, name) => {
  renderWithProviders(<CommandPalette open onClose={vi.fn()} />)
  await userEvent.type(screen.getByRole('combobox'), query)
  expect(screen.getByRole('option', { name })).toBeInTheDocument()
})
```

Append to `frontend/src/components/Sidebar.test.jsx` (reuse that file's render helper and imports; add `import { NAV_ITEMS } from '../lib/navigation'` if missing):

```jsx
it('links to every shared nav item', () => {
  renderSidebar()
  for (const { label } of NAV_ITEMS) {
    expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
  }
})
```

(`renderSidebar` is a stand-in: use whatever the existing Sidebar tests call to render it. If they inline `renderWithProviders(<Sidebar … />)`, inline the same.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/navigation.test.js src/lib/research.test.js src/components/CommandPalette.test.jsx src/components/Sidebar.test.jsx`
Expected: FAIL — `./navigation` not found; ranking tests fail on order; palette finds no Spending/Discover.

- [ ] **Step 3: Implement**

`frontend/src/lib/navigation.js`:

```js
import {
  Briefcase,
  CalendarClock,
  CandlestickChart,
  ChartNoAxesCombined,
  Compass,
  Landmark,
  LayoutDashboard,
  List,
  PiggyBank,
} from 'lucide-react'

export const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/portfolio', label: 'Portfolio', icon: Briefcase },
  { to: '/analytics', label: 'Analytics', icon: ChartNoAxesCombined },
  { to: '/research', label: 'Research', icon: CandlestickChart },
  { to: '/discover', label: 'Discover', icon: Compass },
  { to: '/earnings', label: 'Earnings', icon: CalendarClock },
  { to: '/transactions', label: 'Transactions', icon: List },
  { to: '/accounts', label: 'Accounts', icon: Landmark },
  { to: '/spending', label: 'Spending', icon: PiggyBank },
]
```

`frontend/src/lib/commands.js` (replace the whole file; its old "update both together" comment is now false, so it goes):

```js
import { NAV_ITEMS } from './navigation'

export const PAGE_COMMANDS = NAV_ITEMS.map(({ to, label }) => ({ to, label }))
```

`Sidebar.jsx`: delete the local `items` array, and from the lucide import drop `LayoutDashboard, Briefcase, ChartNoAxesCombined, CandlestickChart, Compass, CalendarClock, List, Landmark, PiggyBank` (keep `LineChart, PanelLeftClose, PanelLeftOpen, LogOut, Search`). Add `import { NAV_ITEMS } from '../lib/navigation'` and change `items.map(` to `NAV_ITEMS.map(`.

`lib/research.js`, replace `rankInstrumentResults`:

```js
const LEVERAGED_PRODUCT = /\b\d(?:\.\d+)?x\b|\b(?:leveraged|ultra|ultrapro|bull|bear|inverse)\b/i

export function rankInstrumentResults(results = [], symbol) {
  const query = (symbol || '').toUpperCase()
  const key = (result) => [
    result.symbol === query,
    !LEVERAGED_PRODUCT.test(result.description || ''),
    (result.symbol || '').startsWith(query),
    PRIMARY_EXCHANGES.has((result.exchange || '').toUpperCase()),
  ]
  return [...results].sort((a, b) => {
    const ka = key(a)
    const kb = key(b)
    for (let i = 0; i < ka.length; i++) {
      const diff = Number(kb[i]) - Number(ka[i])
      if (diff) return diff
    }
    return 0
  })
}
```

Keep the existing doc comment above the function as is.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/lib src/components/CommandPalette.test.jsx src/components/Sidebar.test.jsx src/components/InstrumentSearchBar.test.jsx`
Expected: PASS. If an older ranking test fails because it relied on the exact-then-exchange-only order, fix the test's expectation only if it is the new behaviour (leveraged or prefix) that changed it.

- [ ] **Step 5: Lint and commit**

```bash
npx eslint src/lib/navigation.js src/lib/commands.js src/lib/research.js src/components/Sidebar.jsx
git add -A frontend/src
git commit -m "fix: one shared nav list feeds the sidebar and the palette; ticker prefix outranks leveraged ETFs"
```

---

### Task 2: Earnings page (row 2.8)

**Files:**
- Modify: `frontend/src/lib/earnings.js` (append helpers)
- Modify: `frontend/src/pages/Earnings.jsx`
- Test: `frontend/src/lib/earnings.test.js`, `frontend/src/pages/Earnings.test.jsx`

**Interfaces:**
- Produces from `lib/earnings.js`:
  - `fmtRevenue(dollars: number | null): string`
  - `splitBySession(events): Array<{ key: 'bmo'|'dmh'|'amc'|'unset', label: string, rows: event[] }>` (empty sections omitted, order bmo, dmh, amc, unset)
  - `eventKey(event): string`
  - `dayDate(windowFrom: string | undefined, weekdayKey: string): number | null` (day of month; `windowFrom` is the window's Monday, ISO)
- Consumes: `fmtCompact` from `lib/format.js` (takes millions).

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/lib/earnings.test.js` (add to its import from `./earnings`: `dayDate, eventKey, fmtRevenue, splitBySession`):

```js
describe('fmtRevenue', () => {
  it.each([
    [null, '—'],
    [0, '0M'],
    [4.2e5, '<1M'],
    [4.2e6, '4.2M'],
    [3.2e7, '32M'],
    [1.5e9, '1.50B'],
    [2.5e12, '2.50T'],
  ])('%s -> %s', (input, expected) => {
    expect(fmtRevenue(input)).toBe(expected)
  })
})

describe('splitBySession', () => {
  const e = (symbol, session) => ({ symbol, session })

  it('files a missing session apart from before-open and after-close', () => {
    const sections = splitBySession([e('A', 'bmo'), e('B', 'amc'), e('C', null), e('D', undefined)])
    expect(sections.map((s) => [s.key, s.rows.map((r) => r.symbol)])).toEqual([
      ['bmo', ['A']],
      ['amc', ['B']],
      ['unset', ['C', 'D']],
    ])
  })

  it('keeps during-hours as its own section and omits empty ones', () => {
    const sections = splitBySession([e('A', 'dmh')])
    expect(sections.map((s) => s.label)).toEqual(['During hours'])
  })

  it('returns nothing for no events', () => {
    expect(splitBySession([])).toEqual([])
  })
})

describe('eventKey', () => {
  it('separates quarters of the same symbol and date', () => {
    const base = { symbol: 'X', date: '2026-10-26' }
    expect(eventKey({ ...base, year: 2026, quarter: 3 })).not.toBe(eventKey({ ...base, year: 2026, quarter: 4 }))
  })

  it('tolerates a missing quarter and year', () => {
    expect(eventKey({ symbol: 'X', date: '2026-10-26' })).toBe('X-2026-10-26--')
  })
})

describe('dayDate', () => {
  it('counts from the window Monday', () => {
    expect(dayDate('2026-10-26', 'mon')).toBe(26)
    expect(dayDate('2026-10-26', 'fri')).toBe(30)
  })

  it('rolls over a month boundary', () => {
    expect(dayDate('2026-10-26', 'sun')).toBe(1)
  })

  it('answers null without a window or for an unknown key', () => {
    expect(dayDate(undefined, 'mon')).toBeNull()
    expect(dayDate('2026-10-26', 'xyz')).toBeNull()
  })
})
```

Append to `frontend/src/pages/Earnings.test.jsx` inside `describe('Earnings page', …)` (add `within` to the `@testing-library/react` import):

```jsx
it('files an event with no session under its own heading, not After close', () => {
  stub({
    events: [
      ev({ symbol: 'BMOCO', session: 'bmo' }),
      ev({ symbol: 'AMCCO', session: 'amc' }),
      ev({ symbol: 'NOSESS', session: null }),
    ],
  })
  renderWithProviders(<Earnings />, { route: '/earnings' })

  const unset = screen.getByRole('group', { name: 'Session not set' })
  expect(within(unset).getByText('NOSESS')).toBeInTheDocument()
  const after = screen.getByRole('group', { name: 'After close' })
  expect(within(after).queryByText('NOSESS')).not.toBeInTheDocument()
  expect(within(after).getByText('AMCCO')).toBeInTheDocument()
})

it('does not warn about duplicate keys for the same symbol and date in two quarters', () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  stub({ events: [ev({ symbol: 'DUP', quarter: 3 }), ev({ symbol: 'DUP', quarter: 4 })] })
  renderWithProviders(<Earnings />, { route: '/earnings' })
  expect(error.mock.calls.flat().join(' ')).not.toMatch(/same key/)
  error.mockRestore()
})

it('offers a This week button only away from the current week, and it resets the week', async () => {
  stub()
  renderWithProviders(<Earnings />, { route: '/earnings' })
  expect(screen.queryByRole('button', { name: 'This week' })).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Next week' }))
  await userEvent.click(screen.getByRole('button', { name: 'This week' }))

  expect(queries.useEarningsCalendar).toHaveBeenLastCalledWith('all', 0)
  expect(screen.queryByRole('button', { name: 'This week' })).not.toBeInTheDocument()
})

it('shows the day of the month on each day card', () => {
  stub()
  renderWithProviders(<Earnings />, { route: '/earnings' })
  expect(screen.getByRole('button', { name: /^Mon 26/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /^Fri 30/ })).toBeInTheDocument()
})

it('formats a sub-million revenue estimate as <1M and keeps the quarter on one line', () => {
  stub({ events: [ev({ revenue_estimate: 4.2e5 })] })
  renderWithProviders(<Earnings />, { route: '/earnings' })
  expect(screen.getByText('<1M')).toBeInTheDocument()
  expect(screen.getByText('Q4 2026')).toHaveClass('whitespace-nowrap')
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/earnings.test.js src/pages/Earnings.test.jsx`
Expected: FAIL — helpers undefined; no `group` roles; no "This week" button.

- [ ] **Step 3: Implement the helpers**

Append to `frontend/src/lib/earnings.js` and add `import { fmtCompact } from './format'` at the top:

```js
export const SESSIONS = [
  ['bmo', 'Before open'],
  ['dmh', 'During hours'],
  ['amc', 'After close'],
]

export function splitBySession(events) {
  const known = new Set(SESSIONS.map(([key]) => key))
  const sections = SESSIONS.map(([key, label]) => ({
    key,
    label,
    rows: events.filter((event) => event.session === key),
  }))
  sections.push({
    key: 'unset',
    label: 'Session not set',
    rows: events.filter((event) => !known.has(event.session)),
  })
  return sections.filter((section) => section.rows.length > 0)
}

export function eventKey(event) {
  return [event.symbol, event.date, event.year ?? '', event.quarter ?? ''].join('-')
}

export function fmtRevenue(dollars) {
  if (dollars == null) return '—'
  const millions = dollars / 1e6
  if (millions > 0 && millions < 1) return '<1M'
  if (Math.abs(millions) < 10 && millions !== 0) return `${millions.toFixed(1)}M`
  return fmtCompact(millions)
}

export function dayDate(windowFrom, key) {
  const offset = WEEKDAYS.findIndex(([k]) => k === key)
  if (!windowFrom || offset < 0) return null
  const date = new Date(windowFrom + 'T00:00:00')
  date.setDate(date.getDate() + offset)
  return date.getDate()
}
```

- [ ] **Step 4: Implement the page changes in `Earnings.jsx`**

1. Imports: `import { WEEKDAYS, dayDate, eventKey, fmtRevenue, groupByWeekday, reportStatus, splitBySession, weekLabel, weekdayKey } from '../lib/earnings'`; remove `fmtCompact` from the `../lib/format` import (keep `fmtNum, fmtPct`).
2. `RevenueCell`: replace both `fmtCompact(est / 1e6)` and `fmtCompact(act / 1e6)` with `fmtRevenue(est)` and `fmtRevenue(act)`.
3. `ROW_GRID` → `'92px 40px 72px 64px minmax(0,1fr) 120px 14px'`. On the Qtr `<span>` in `EarningsRow` add `whitespace-nowrap` to its className.
4. `DayCard`: add a `date` prop and render the label as one string:
   `<span className="text-[var(--fig-sm)] font-medium text-zinc-200">{date == null ? label : `${label} ${date}`}</span>`
   In the page, pass `date={dayDate(data.window?.from, k)}` to each `DayCard`.
5. `Section` returns a group and uses `eventKey`:

```jsx
function Section({ label, rows, onOpen, divided }) {
  return (
    <div role="group" aria-label={label}>
      <div
        className={`px-3.5 pt-2.5 pb-1 text-[var(--fig-2xs)] uppercase tracking-[0.09em] text-zinc-600 ${
          divided ? 'border-t border-white/[0.04]' : ''
        }`}
      >
        {label}
      </div>
      {rows.map((e) => (
        <EarningsRow key={eventKey(e)} event={e} onOpen={onOpen} />
      ))}
    </div>
  )
}
```

6. Replace the `{ bmo, afterClose }` `useMemo` with `const sections = useMemo(() => splitBySession(rows), [rows])`.
7. Header summary on the right of the docket card becomes:

```jsx
<span className="text-[var(--fig-2xs)] text-zinc-500">
  {sections.map(({ key, label, rows: sectionRows }, i) => (
    <span key={key}>
      {i > 0 ? ' · ' : ''}
      {label} <span className="num font-mono text-zinc-400">{sectionRows.length}</span>
    </span>
  ))}
</span>
```

8. Body: replace the two conditional `Section`s with
   `{sections.map((section, i) => <Section key={section.key} label={section.label} rows={section.rows} onOpen={openSymbol} divided={i > 0} />)}`
9. "This week": add `const resetWeek = () => { setWeek(0); setPickedDay(null) }` beside `shiftWeek`, and after the "Next week" button:

```jsx
{week !== 0 && (
  <button
    type="button"
    onClick={resetWeek}
    className="h-6 px-2 rounded border border-white/[0.08] bg-[#0e0e11] text-[var(--fig-xs)] text-zinc-400 hover:text-zinc-100"
  >
    This week
  </button>
)}
```

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run src/lib/earnings.test.js src/pages/Earnings.test.jsx src/components/dashboard/UpcomingEarnings.test.jsx`
Expected: PASS. Existing Earnings tests that read "Before open N · After close N" text may need their query adjusted to the new markup; keep their intent.

- [ ] **Step 6: Lint and commit**

```bash
npx eslint src/lib/earnings.js src/pages/Earnings.jsx
git add -A frontend/src
git commit -m "fix: earnings splits sessions three ways, formats small revenue, and shows the day of the month"
```

---

### Task 3: Research page honesty fixes (row 2.9, non-chart items)

**Files:**
- Modify: `frontend/src/components/research/useResearchInstrument.js`
- Create: `frontend/src/components/research/useResearchInstrument.test.jsx`
- Modify: `frontend/src/lib/research.js` (`moveCaption`, ~line 202)
- Modify: `frontend/src/lib/lastLook.js`
- Modify: `frontend/src/components/research/WatchlistRail.jsx`
- Modify: `frontend/src/components/research/OverviewTab.jsx`
- Modify: `frontend/src/components/research/NewsTab.jsx`
- Modify: `frontend/src/pages/Research.jsx` (one prop)
- Test: `lib/research.test.js`, `lib/lastLook.test.js`, `components/research/WatchlistRail.test.jsx`, `OverviewTab.test.jsx`, `NewsTab.test.jsx`

**Interfaces:**
- Produces: `moveCaption(quote, bars, now = new Date()) → { change: number | null, suffix: 'today' | 'latest session' }`. Callers (grep `moveCaption`) already render `suffix` when truthy, so it now always renders.
- `changeSinceLastLook(symbol, price)` returns `null` when the move is under 0.005 in absolute percent.

- [ ] **Step 1: Write the failing tests**

`frontend/src/components/research/useResearchInstrument.test.jsx`:

```jsx
import { MemoryRouter } from 'react-router-dom'
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as queries from '../../api/queries'
import { readRecentSymbols } from '../../lib/recentSymbols'
import { useResearchInstrument } from './useResearchInstrument'

vi.mock('../../api/queries')

const wrapperFor = (route) =>
  function Wrapper({ children }) {
    return <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
  }

beforeEach(() => {
  localStorage.clear()
  queries.usePositions.mockReturnValue({ data: [] })
  queries.useInstrumentSearch.mockReturnValue({ data: [] })
})
afterEach(() => localStorage.clear())

describe('useResearchInstrument recents', () => {
  it('does not remember a symbol that resolves to no instrument', () => {
    renderHook(() => useResearchInstrument(), { wrapper: wrapperFor('/research?symbol=ZZZZ') })
    expect(readRecentSymbols()).toEqual([])
  })

  it('remembers a symbol once it resolves', () => {
    queries.useInstrumentSearch.mockReturnValue({
      data: [{ symbol: 'NVDA', description: 'NVIDIA', exchange: 'NASDAQ', uic: 7, asset_type: 'Stock' }],
    })
    renderHook(() => useResearchInstrument(), { wrapper: wrapperFor('/research?symbol=NVDA') })
    expect(readRecentSymbols()).toEqual(['NVDA'])
  })
})
```

Append to `frontend/src/lib/research.test.js` (import `moveCaption`):

```js
describe('moveCaption', () => {
  const NOW = new Date('2026-10-06T12:00:00')
  const bar = (date, close) => ({ date, close })

  it('calls a move from today\'s bar "today"', () => {
    const bars = [bar('2026-10-05', 100), bar('2026-10-06', 102)]
    expect(moveCaption(null, bars, NOW)).toEqual({ change: 2, suffix: 'today' })
  })

  it('calls it the latest session when the newest bar is older than today', () => {
    const bars = [bar('2026-10-01', 100), bar('2026-10-02', 102)]
    expect(moveCaption(null, bars, NOW).suffix).toBe('latest session')
  })

  it('keeps a live quote on a stale-bar day as the latest session', () => {
    const bars = [bar('2026-10-01', 100), bar('2026-10-02', 102)]
    const quote = { change_pct: 1.2, change_basis: 'live' }
    expect(moveCaption(quote, bars, NOW)).toEqual({ change: 1.2, suffix: 'latest session' })
  })

  it('keeps a last_close quote as the latest session even with a bar from today', () => {
    const bars = [bar('2026-10-05', 100), bar('2026-10-06', 102)]
    const quote = { change_pct: 1.2, change_basis: 'last_close' }
    expect(moveCaption(quote, bars, NOW).suffix).toBe('latest session')
  })

  it('has no change and no crash without bars or a quote', () => {
    expect(moveCaption(null, [], NOW).change).toBeNull()
  })
})
```

Append to `frontend/src/lib/lastLook.test.js` (reuse its imports and `localStorage` setup; import `recordLook, changeSinceLastLook`):

```js
it('reports nothing for a move too small to show as anything but 0.00%', () => {
  recordLook('NVDA', 100)
  expect(changeSinceLastLook('NVDA', 100.004)).toBeNull()
  expect(changeSinceLastLook('NVDA', 100)).toBeNull()
})

it('reports a move that rounds to a visible figure', () => {
  recordLook('NVDA', 100)
  expect(changeSinceLastLook('NVDA', 100.01)).toBeCloseTo(0.01, 5)
})
```

Append to `frontend/src/components/research/OverviewTab.test.jsx` (reuse the file's existing render helper and default props; `position` below is the shape the file's other position tests use — copy their fixture and override `price_source`):

```jsx
it('discloses the price basis only when the mark is not live', () => {
  const { rerender } = renderOverview({ position: { ...POSITION, price_source: 'live' } })
  expect(screen.queryByText(/Live price from Saxo/)).not.toBeInTheDocument()

  rerender(overviewElement({ position: { ...POSITION, price_source: 'derived' } }))
  expect(screen.getByText(/Marked from Saxo's profit\/loss/)).toBeInTheDocument()
})

it('explains why an ETF has no fundamentals snapshot', () => {
  renderOverview({ isEtf: true })
  expect(screen.getByText(/This is an ETF/)).toBeInTheDocument()
})
```

(`renderOverview`, `overviewElement` and `POSITION` stand for whatever the existing tests use; if the file renders inline with `renderWithProviders(<OverviewTab {...props} />)`, do the same and use `rerender` from its return value.)

Append to `frontend/src/components/research/NewsTab.test.jsx` (mock `useCompanyNews` the way the file's existing tests do):

```jsx
const newsItems = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: i,
    url: `https://example.com/${i}`,
    headline: `Headline ${i}`,
    source: 'Wire',
    summary: '',
    datetime: new Date(Date.UTC(2026, 9, 5, 12, 0, 0) - i * 60_000).toISOString(),
  }))

it('caps the list at ten and reveals more on request', async () => {
  stubNews({ available: true, items: newsItems(25) })
  renderNews()
  expect(screen.getAllByRole('link')).toHaveLength(10)

  await userEvent.click(screen.getByRole('button', { name: /Show more/ }))
  expect(screen.getAllByRole('link')).toHaveLength(20)

  await userEvent.click(screen.getByRole('button', { name: /Show more/ }))
  expect(screen.getAllByRole('link')).toHaveLength(25)
  expect(screen.queryByRole('button', { name: /Show more/ })).not.toBeInTheDocument()
})

it('shows no Show more button for ten items or fewer', () => {
  stubNews({ available: true, items: newsItems(10) })
  renderNews()
  expect(screen.queryByRole('button', { name: /Show more/ })).not.toBeInTheDocument()
})
```

(`stubNews` / `renderNews` are stand-ins for the file's own mock and render lines; add `userEvent` import if missing.)

Append to `frontend/src/components/research/WatchlistRail.test.jsx` (copy the file's existing fixture for one watchlist item and render path):

```jsx
it('lets the symbol keep its width and the exchange take the squeeze', () => {
  renderRailWithItem({ symbol: 'NVDA', exchange: 'NASDAQ_VERY_LONG_EXCHANGE_NAME' })
  expect(screen.getByText('NVDA')).toHaveClass('shrink-0')
  expect(screen.getByText('NASDAQ_VERY_LONG_EXCHANGE_NAME')).toHaveClass('truncate', 'min-w-0')
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/components/research/useResearchInstrument.test.jsx src/lib/research.test.js src/lib/lastLook.test.js src/components/research/OverviewTab.test.jsx src/components/research/NewsTab.test.jsx src/components/research/WatchlistRail.test.jsx`
Expected: FAIL in each new test (recents pushed for `ZZZZ`; old suffix; 0.00% returned; always-on note; no ETF copy; 25 links; classes missing).

- [ ] **Step 3: Implement**

`useResearchInstrument.js`: delete the early `useEffect(() => { pushRecentSymbol(symbol) }, [symbol])` block and, directly after the `instrument` `useMemo`, add:

```js
  const resolved = Boolean(instrument)
  useEffect(() => {
    if (resolved) pushRecentSymbol(symbol)
  }, [symbol, resolved])
```

`lib/research.js`, replace `moveCaption` (keep the `moveLabel` import already present):

```js
const localIsoDate = (date) => date.toLocaleDateString('en-CA')

export function moveCaption(quote, bars, now = new Date()) {
  const newest = bars[bars.length - 1]?.date
  const stale = Boolean(newest) && newest.slice(0, 10) !== localIsoDate(now)
  const latest = stale || moveLabel([quote]) === 'Latest session'
  return {
    change: quote?.change_pct ?? barChange(bars),
    suffix: latest ? 'latest session' : 'today',
  }
}
```

If an existing test asserted `suffix: null` for a bar-derived change, update it to the new rule.

`lib/lastLook.js`:

```js
const MIN_MOVE_PCT = 0.005
```
and make `changeSinceLastLook` end with:

```js
  const change = ((currentPrice - record.price) / record.price) * 100
  return Math.abs(change) < MIN_MOVE_PCT ? null : change
```

`WatchlistRail.jsx`: change both grid templates `grid-cols-[1fr_auto_auto]` (header row and item row) to `grid-cols-[minmax(0,1fr)_auto_auto]`; on the item row's symbol span add `shrink-0`; on the exchange span change `truncate` to `min-w-0 truncate`.

`OverviewTab.jsx`:

```jsx
function EtfNote() {
  return (
    <Card>
      <CardHeader title="Fund" subtitle="Company fundamentals don't apply" />
      <p className="mt-3 text-[var(--fig-xs)] text-zinc-500">
        This is an ETF, so there are no earnings, margins or valuation ratios to show. Price, range
        statistics and your notes are below.
      </p>
    </Card>
  )
}
```
and in `PositionCard`:
```jsx
  const basis = position.price_source && position.price_source !== 'live' ? priceBasis(position.price_source).note : undefined
  ...
  <CardHeader title="Your position" subtitle={basis} />
```
and in `OverviewTab` replace `{isEtf ? null : <SnapshotSection fundamentals={fundamentals} />}` with `{isEtf ? <EtfNote /> : <SnapshotSection fundamentals={fundamentals} />}`.

`NewsTab.jsx`: add `import { useState } from 'react'`, `const NEWS_PAGE = 10` at module level, `const [shown, setShown] = useState(NEWS_PAGE)` as the first line of `NewsTab` (before any early return), render `groupByDay(data.items.slice(0, shown))`, and after the `divide-y` list:

```jsx
{data.items.length > shown ? (
  <div className="px-4 py-2.5 border-t border-white/[0.04]">
    <button
      type="button"
      onClick={() => setShown((n) => n + NEWS_PAGE)}
      className="text-[var(--fig-xs)] text-blue-400 hover:text-blue-300"
    >
      Show more ({data.items.length - shown})
    </button>
  </div>
) : null}
```

`Research.jsx`: `<NewsTab key={symbol} symbol={symbol} />` so a symbol switch resets the cap.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/components/research src/lib src/pages/Research.test.jsx src/pages/ResearchChart.test.jsx`
Expected: PASS (a `moveCaption` caller test asserting the old `null` suffix is the only expected adjustment).

- [ ] **Step 5: Lint and commit**

```bash
npx eslint src/components/research src/lib/research.js src/lib/lastLook.js src/pages/Research.jsx
git add -A frontend/src
git commit -m "fix: research recents skip unresolved symbols, move captions follow the newest bar, news is capped, position note only when not live"
```

---

### Task 4: Research chart axes (row 2.9, chart items)

**Files:**
- Create: `frontend/src/lib/axisFormat.js`
- Create: `frontend/src/lib/axisFormat.test.js`
- Modify: `frontend/src/components/research/CashFlowTrendChart.jsx`
- Modify: `frontend/src/components/research/QuarterlyTrendsChart.jsx`
- Test: existing `CashFlowTrendChart.test.jsx`, `QuarterlyTrendsChart.test.jsx` must stay green.

**Interfaces:**
- Produces: `fmtAxisPct(value: number | null): string` (whole percent, `'12%'`, `''` for null); `fmtAxisDollars(dollars: number | null): string` (`'$35B'`, `'$2.1B'`, `'-$850M'`, `'$0'`, `''` for null).

- [ ] **Step 1: Write the failing test**

`frontend/src/lib/axisFormat.test.js`:

```js
import { describe, expect, it } from 'vitest'

import { fmtAxisDollars, fmtAxisPct } from './axisFormat'

describe('fmtAxisPct', () => {
  it.each([
    [44.5, '45%'],
    [0, '0%'],
    [-0.3, '0%'],
    [-12, '-12%'],
    [null, ''],
  ])('%s -> %s', (input, expected) => {
    expect(fmtAxisPct(input)).toBe(expected)
  })
})

describe('fmtAxisDollars', () => {
  it.each([
    [35e9, '$35B'],
    [2.1e9, '$2.1B'],
    [3e9, '$3B'],
    [850e6, '$850M'],
    [-2.1e9, '-$2.1B'],
    [1.2e12, '$1.2T'],
    [0, '$0'],
    [null, ''],
  ])('%s -> %s', (input, expected) => {
    expect(fmtAxisDollars(input)).toBe(expected)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/axisFormat.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`frontend/src/lib/axisFormat.js`:

```js
export function fmtAxisPct(value) {
  if (value == null) return ''
  return `${Math.round(value)}%`
}

export function fmtAxisDollars(dollars) {
  if (dollars == null) return ''
  const sign = dollars < 0 ? '-' : ''
  const abs = Math.abs(dollars)
  const scaled = (value, unit) => `${sign}$${value < 10 ? Number(value.toFixed(1)) : Math.round(value)}${unit}`
  if (abs >= 1e12) return scaled(abs / 1e12, 'T')
  if (abs >= 1e9) return scaled(abs / 1e9, 'B')
  if (abs >= 1e6) return scaled(abs / 1e6, 'M')
  return `${sign}$${Math.round(abs)}`
}
```

`CashFlowTrendChart.jsx`: import `fmtAxisDollars` from `../../lib/axisFormat`; change the `YAxis` to `<YAxis {...axisProps} width={56} tickFormatter={fmtAxisDollars} />`; rename the local `axisFormat` const to `tooltipFormat` with body `` `$${fmtCompact(toMillions(v))}` `` (returns `'$35.00B'`), and use it only in the `Tooltip` formatter.

`QuarterlyTrendsChart.jsx`: import `fmtAxisPct`; change the `YAxis` to

```jsx
<YAxis
  {...axisProps}
  width={44}
  allowDecimals={false}
  domain={[(min) => Math.floor(min), (max) => Math.ceil(max)]}
  tickFormatter={fmtAxisPct}
/>
```
(the tooltip keeps `fmtPct(value, { sign: false, decimals: 1 })`; `fmtPct` stays imported for it.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/axisFormat.test.js src/components/research/CashFlowTrendChart.test.jsx src/components/research/QuarterlyTrendsChart.test.jsx`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
npx eslint src/lib/axisFormat.js src/components/research/CashFlowTrendChart.jsx src/components/research/QuarterlyTrendsChart.jsx
git add -A frontend/src
git commit -m "fix: research cash chart reads $35B on a wider axis; margin axis ticks are whole, distinct percents"
```

---

### Task 5: Phase gate — full suite, build, live check, screenshots

**Files:** none modified unless the check finds a defect (then fix test-first in the owning task's files and commit separately).

- [ ] **Step 1: Full verification**

```bash
cd frontend && npx vitest run && npx eslint src && npm run build
cd ../backend && python manage.py test
```
Expected: all green. Report counts. If the backend suite is unavailable in this worktree (no `.venv`), run it from the main checkout's venv against this worktree's `backend/` (`../SaxoDash/.venv/bin/python manage.py test`), and say so.

- [ ] **Step 2: Live pass against a COPY of the dev DB**

Follow the `saxodash-design-system` skill's screenshot recipe with: worktree code on ports 8100/5273, `DATABASES` pointed at a copy (`cp backend/db.sqlite3` from the main checkout to a scratch path, never the original). Capture 1440px and 390px for `/earnings` (this week and a following week), `/research?symbol=<held symbol>` (Overview, Valuation, Earnings, News tabs), an ETF symbol on Research, and the ⌘K palette open with "spend", "disc" and a leveraged-ETF-prone ticker typed.

Check, and record in the PR description: sections read Before open / After close / Session not set; day cards show `Mon 26`; `This week` appears after paging; margin and cash axes show whole percents and `$35B`-style labels; the rail's since-last-look badge is absent for a flat symbol; the Position note is absent for a live mark; news shows 10 with "Show more". Verify-first items from the roadmap not in 2C (heatmap legend, sector donut) stay out of scope.

- [ ] **Step 3: Update docs and memory notes**

Leave the master roadmap alone. Update the memory file `saxodash-review-remediation-2026-10.md`: 2C done on `fix/review-frontend-2c`, PR pending `gh auth login`.

- [ ] **Step 4: Hand off**

Push is the user's call: `git push -u origin fix/review-frontend-2c` and open the PR once `gh auth login` is done. Do not push or open the PR unprompted.
