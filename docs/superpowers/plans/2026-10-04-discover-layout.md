# Discover Layout (Phase B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Discover structure and an opt-in dense view. Render the API's lens groups as section headings, add a strip of lens jump chips, and add a "Cards | Compact" toggle. The compact view lays each group out as a grid of lens columns, each showing its top 5 stocks.

**Architecture:** Frontend only. The `/api/research/discover/` payload already carries `groups: [{key, title}]` and, per shelf, `group`, `short`, `sort: {field, descending}` and up to 20 `items`. New pure helpers live in `lib/discover.js`. The shelf header is extracted from `ShelfRow` into `ShelfHeader`, so the card row and the compact column share it. Two new components are `LensChips` and `LensColumn`. The view choice is a per-browser convenience in `localStorage`.

**Tech Stack:** React 19 (JS), Tailwind v4, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-02-discover-lenses-design.md` (§5 "Landing page and cards"). The user decided on 2026-10-04 that cards stay the default landing view and the dense view is an explicit opt-in toggle. Task 4 records that amendment in the spec.

## Global Constraints

- Zero code comments in new or edited code (AGENTS.md "Code style").
- Cards remain the default view. Compact is opt-in and remembered per browser under `saxodash:discover-view`. A missing, corrupt or unavailable `localStorage` falls back to `'cards'` and never throws.
- No rank numbers, no scores, no ordering across lenses. Each lens keeps its own disclosed order (spec "Out of scope": no ranking).
- Use `ui.jsx` primitives: `Card`, `TBtn`, `EmptyState`, `InfoTip`, `InstrumentLogo`, `DayChange`. Blue is for links only; data is zinc.
- Heading levels: `PageHeader` is h1, group titles are h2, lens titles are h3.
- Leave `frontend/src/pages/Transactions.jsx` and `frontend/src/lib/logos.js` / `logos.test.js` alone (unrelated uncommitted user changes).

## Review Focus

1. A group with no shelves, or a shelf whose `group` matches no listed group: the empty group renders nothing, and an orphan shelf is still shown, never silently dropped (Task 1 test).
2. `localStorage` holds garbage (`'grid'`, `'{'`) or throws: the view is `'cards'` (Task 1 test).
3. A lens with 0 matches in compact view: an empty state, no "See all" link (Task 3 test).
4. A lens whose sort field is not among a stock's reasons: the compact row still shows the first reason, or nothing if there are no reasons, and never crashes (Task 1 test).
5. A jump chip for a lens must land on that lens's heading in both views. The same `shelf-<key>` id must exist in cards and compact (Task 3 test).

---

### Task 1: `lib/discover.js` helpers: grouping, lead reason, view persistence

**Files:**
- Modify: `frontend/src/lib/discover.js`
- Test: `frontend/src/lib/discover.test.js`

**Interfaces:**
- Produces:
  - `groupShelves(groups, shelves) → [{ key, title, shelves }]`. Groups appear in API order; a group with no shelves is omitted. Shelves whose `group` is unknown are collected into a trailing group `{ key: 'other', title: 'Other', shelves }`, present only when non-empty.
  - `leadReason(item, sort) → reason | null`. Returns the reason whose `field === sort?.field`, else `item.reasons[0]`, else `null`.
  - `COMPACT_ROWS = 5`
  - `DISCOVER_VIEWS = ['cards', 'compact']`
  - `readDiscoverView() → 'cards' | 'compact'`
  - `writeDiscoverView(view) → boolean`

- [ ] **Step 1: Write the failing tests** (append to `discover.test.js` and extend its import list)

```js
describe('groupShelves', () => {
  const groups = [{ key: 'price', title: 'Price action' }, { key: 'fundamentals', title: 'Fundamentals' }]

  it('puts each shelf under its group in the API order', () => {
    const shelves = [{ key: 'pe', group: 'fundamentals' }, { key: 'oversold', group: 'price' }, { key: 'overbought', group: 'price' }]
    expect(groupShelves(groups, shelves)).toEqual([
      { key: 'price', title: 'Price action', shelves: [shelves[1], shelves[2]] },
      { key: 'fundamentals', title: 'Fundamentals', shelves: [shelves[0]] },
    ])
  })

  it('leaves out a group with no shelves', () => {
    expect(groupShelves(groups, [{ key: 'oversold', group: 'price' }]).map((g) => g.key)).toEqual(['price'])
  })

  it('never drops a shelf whose group is unknown', () => {
    const stray = { key: 'yield', group: 'events' }
    expect(groupShelves(groups, [stray])).toEqual([{ key: 'other', title: 'Other', shelves: [stray] }])
  })

  it('copes with a payload that has no groups', () => {
    const shelf = { key: 'oversold', group: 'price' }
    expect(groupShelves(undefined, [shelf])).toEqual([{ key: 'other', title: 'Other', shelves: [shelf] }])
  })
})

describe('leadReason', () => {
  const rsi = { field: 'rsi14', label: 'RSI', value: 6, format: 'number' }
  const roe = { field: 'roe', label: 'ROE', value: 31, format: 'pct' }

  it('prefers the reason the lens is ordered by', () => {
    expect(leadReason({ reasons: [roe, rsi] }, { field: 'rsi14' })).toBe(rsi)
  })

  it('falls back to the first reason', () => {
    expect(leadReason({ reasons: [roe, rsi] }, { field: 'market_cap' })).toBe(roe)
  })

  it('is empty when the stock has no reasons', () => {
    expect(leadReason({ reasons: [] }, { field: 'rsi14' })).toBeNull()
    expect(leadReason({}, undefined)).toBeNull()
  })
})

describe('discover view preference', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to cards', () => {
    expect(readDiscoverView()).toBe('cards')
  })

  it('remembers compact', () => {
    expect(writeDiscoverView('compact')).toBe(true)
    expect(readDiscoverView()).toBe('compact')
  })

  it('ignores a value it does not know', () => {
    localStorage.setItem('saxodash:discover-view', 'grid')
    expect(readDiscoverView()).toBe('cards')
  })

  it('falls back to cards when storage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    expect(readDiscoverView()).toBe('cards')
    spy.mockRestore()
  })
})
```

(Add `beforeEach, vi` to the vitest import if absent.)

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run src/lib/discover.test.js`
Expected: FAIL (`groupShelves is not a function`, …).

- [ ] **Step 3: Implement** (append to `lib/discover.js`)

```js
const OTHER_GROUP = { key: 'other', title: 'Other' }

export function groupShelves(groups, shelves) {
  const known = (groups ?? []).map((group) => ({ ...group, shelves: shelves.filter((shelf) => shelf.group === group.key) }))
  const keys = new Set(known.map((group) => group.key))
  const strays = shelves.filter((shelf) => !keys.has(shelf.group))
  const all = strays.length ? [...known, { ...OTHER_GROUP, shelves: strays }] : known
  return all.filter((group) => group.shelves.length > 0)
}

export function leadReason(item, sort) {
  const reasons = item.reasons ?? []
  return reasons.find((reason) => reason.field === sort?.field) ?? reasons[0] ?? null
}

export const COMPACT_ROWS = 5

export const DISCOVER_VIEWS = ['cards', 'compact']

const VIEW_KEY = 'saxodash:discover-view'

export function readDiscoverView() {
  try {
    const stored = localStorage.getItem(VIEW_KEY)
    return DISCOVER_VIEWS.includes(stored) ? stored : 'cards'
  } catch {
    return 'cards'
  }
}

export function writeDiscoverView(view) {
  try {
    localStorage.setItem(VIEW_KEY, view)
    return true
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd frontend && npx vitest run src/lib/discover.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/discover.js frontend/src/lib/discover.test.js
git commit -m "feat: Discover helpers group lenses, pick a lens's lead reason and remember the view"
```

---

### Task 2: `ShelfHeader` extracted; Discover renders group headings

**Files:**
- Create: `frontend/src/components/discover/ShelfHeader.jsx`
- Modify: `frontend/src/components/discover/ShelfRow.jsx`
- Modify: `frontend/src/pages/Discover.jsx`
- Test: `frontend/src/components/discover/ShelfRow.test.jsx`, `frontend/src/pages/Discover.test.jsx`

**Interfaces:**
- Consumes: `groupShelves` (Task 1).
- Produces: `<ShelfHeader shelf shown />` renders the lens title as an **h3** with `id="shelf-<key>"` and `scroll-mt-4`, the count · subtitle with the InfoTip glued to the last word (the current `ShelfRow` markup, moved verbatim), and the "See all N" link when `total > 0`. Task 3 reuses it. `ShelfRow` keeps its behavior and uses `ShelfHeader`.
- Discover renders, per group from `groupShelves(data.groups, data.shelves)`: `<section aria-labelledby="group-<key>">` with `<h2 id="group-<key>">` in small-caps style (`text-[var(--fig-xs)] font-semibold uppercase tracking-wider text-zinc-500`), then that group's `ShelfRow`s.
- The ⓘ gets a small gap: wrap the `InfoTip` as `<span className="ml-1 inline-flex align-middle">…</span>` inside the nowrap tail span.

- [ ] **Step 1: Write the failing tests**

In `Discover.test.jsx`, change the `shelf` fixture helper to accept a group, `const shelf = (key, title, total, items = [], empty = …, group = 'price') => ({ …, group, short: title })`, and give each existing `data` a `groups: [{ key: 'price', title: 'Price action' }, { key: 'fundamentals', title: 'Fundamentals' }]`. Then add:

```js
  it('sections the lenses under their group headings', () => {
    useDiscover.mockReturnValue({ data: {
      as_of: '2026-09-30T22:40:00Z', health: { state: 'ok' },
      groups: [{ key: 'price', title: 'Price action' }, { key: 'fundamentals', title: 'Fundamentals' }],
      shelves: [shelf('overbought', 'Overbought', 1, [card]), shelf('pe-under-15', 'P/E under 15', 1, [card], undefined, 'fundamentals')],
    } })
    renderPage()
    const groups = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(groups).toEqual(['Price action', 'Fundamentals'])
    expect(screen.getByRole('heading', { level: 3, name: 'Overbought' })).toHaveAttribute('id', 'shelf-overbought')
  })
```

In `ShelfRow.test.jsx` add:

```js
  it('titles the lens as a third-level heading a jump link can land on', () => {
    renderRow(shelf(20, 20))
    expect(screen.getByRole('heading', { level: 3, name: 'Overbought' })).toHaveAttribute('id', 'shelf-overbought')
  })
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run src/pages/Discover.test.jsx src/components/discover/ShelfRow.test.jsx`
Expected: FAIL (no level-2 group headings; lens heading is level 2).

- [ ] **Step 3: Implement**

`ShelfHeader.jsx`: move the header JSX (the outer `flex items-start justify-between` div and `splitLastWord`) out of `ShelfRow.jsx`, change `h2` to `h3`, add `scroll-mt-4` to it, and wrap the InfoTip as described.

```jsx
import { Link } from 'react-router-dom'

import { shelfNote, stockCount } from '../../lib/discover'
import { InfoTip } from '../ui'

function splitLastWord(text) {
  const at = text.lastIndexOf(' ')
  return at < 0 ? ['', text] : [text.slice(0, at), text.slice(at + 1)]
}

export default function ShelfHeader({ shelf, shown }) {
  const [head, tail] = splitLastWord(shelf.subtitle ?? '')
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 id={`shelf-${shelf.key}`} className="scroll-mt-4 text-[var(--fig-md)] font-semibold text-zinc-100">{shelf.title}</h3>
        <p className="text-[var(--fig-xs)] text-zinc-500">
          <span className="num whitespace-nowrap">{stockCount(shelf.total)}</span>
          <span aria-hidden="true" className="whitespace-nowrap">{' · '}</span>
          {head ? `${head} ` : null}
          <span className="whitespace-nowrap">
            {tail}
            <span className="ml-1 inline-flex align-middle">
              <InfoTip label={`About ${shelf.title}`}>{shelfNote(shelf, shown)}</InfoTip>
            </span>
          </span>
        </p>
      </div>
      {shelf.total > 0 ? (
        <Link to={`/discover/${shelf.key}`} className="shrink-0 whitespace-nowrap text-[var(--fig-xs)] text-blue-400 hover:text-blue-300">
          See all <span className="num">{shelf.total}</span>
        </Link>
      ) : null}
    </div>
  )
}
```

Before moving it, compare this block with the current `ShelfRow.jsx` header and keep any markup that differs from what is shown here (the current file is the source of truth). Apply only the three stated changes: h3, `scroll-mt-4`, and the ⓘ wrapper. The `?? ''` guard is new and intended.

`ShelfRow.jsx` renders `<ShelfHeader shelf={shelf} shown={shown} />` in place of the moved block and drops the now-unused imports.

`Discover.jsx`:

```jsx
function ShelfGroup({ group, children }) {
  return (
    <section aria-labelledby={`group-${group.key}`} className="space-y-6">
      <h2 id={`group-${group.key}`} className="text-[var(--fig-xs)] font-semibold uppercase tracking-wider text-zinc-500">{group.title}</h2>
      {children}
    </section>
  )
}
```

Replace the `data.shelves.map(...)` line with:

```jsx
      {showShelves
        ? groupShelves(data.groups, data.shelves).map((group) => (
            <ShelfGroup key={group.key} group={group}>
              {group.shelves.map((shelf) => <ShelfRow key={shelf.key} shelf={shelf} />)}
            </ShelfGroup>
          ))
        : null}
```

Define `const showShelves = data && !SHELVES_HIDDEN.has(data.health?.state)` near the top of `Discover()`.

- [ ] **Step 4: Run to verify they pass**

Run: `cd frontend && npx vitest run src/pages/Discover.test.jsx src/components/discover/`, then the full suite once with `cd frontend && npx vitest run`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/discover/ShelfHeader.jsx frontend/src/components/discover/ShelfRow.jsx frontend/src/components/discover/ShelfRow.test.jsx frontend/src/pages/Discover.jsx frontend/src/pages/Discover.test.jsx
git commit -m "feat: Discover sections its lenses under Price action and Fundamentals"
```

---

### Task 3: Lens jump chips, compact lens columns and the view toggle

**Files:**
- Create: `frontend/src/components/discover/LensChips.jsx`
- Create: `frontend/src/components/discover/LensColumn.jsx`
- Modify: `frontend/src/pages/Discover.jsx`
- Test: `frontend/src/components/discover/LensColumn.test.jsx` (create), `frontend/src/pages/Discover.test.jsx`

**Interfaces:**
- Consumes: `ShelfHeader` (Task 2); `COMPACT_ROWS`, `leadReason`, `reasonParts`, `readDiscoverView`, `writeDiscoverView` (Task 1 and Phase A); `researchHref` from `lib/research`; `fmtMoney` from `lib/format`; `TickerInitial`.
- Produces:
  - `<LensChips shelves />`: a `<nav aria-label="Lenses">` with one `<a href="#shelf-<key>">` per shelf, labelled `{shelf.short} {shelf.total}`. Its styling is a pill (`rounded-full border border-white/[0.08] px-2.5 h-7 inline-flex items-center gap-1.5 text-[var(--fig-xs)] text-zinc-300 hover:bg-white/[0.05]`), with the count in `num text-zinc-500`. The strip is `flex gap-2 overflow-x-auto` on one line (`whitespace-nowrap`, `shrink-0` chips).
  - `<LensColumn shelf />`: a `Card` holding `ShelfHeader` (with `shown = min(COMPACT_ROWS, items.length)`), then either `EmptyState` (when `total === 0`) or a `<ul aria-label="{title} stocks">` of the first `COMPACT_ROWS` items.
    - Each `<li>` is one `Link` to `researchHref(ticker, 'overview', {uic, assetType})`. The row reads, left to right: logo (16px, `TickerInitial` fallback) · ticker (`font-semibold text-zinc-100`) · price (`num font-mono text-zinc-300`, `fmtMoney(last_close, 'USD')`) · `DayChange` · lead reason (label `text-zinc-500` + value `num font-mono text-zinc-200`, from `reasonParts(leadReason(item, shelf.sort))`, omitted when null).
    - Rows are separated by `border-t border-white/[0.04]` and carry no rank numbers.
  - The view toggle is two `TBtn`s, "Cards" and "Compact", in a `role="group" aria-label="View"`.
- Discover layout:
  - A toolbar row under the scan progress/health: `flex items-center justify-between gap-3`, with `LensChips` on the left (`min-w-0`) and the toggle on the right (`shrink-0`). It is shown only when the shelves are shown.
  - The view is `useState(readDiscoverView)`, and changing it calls `writeDiscoverView`.
  - In compact view each `ShelfGroup` renders `<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">` of `LensColumn`s instead of `ShelfRow`s.

- [ ] **Step 1: Write the failing tests**

Create `LensColumn.test.jsx`:

```js
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import LensColumn from './LensColumn'

const item = (i, reasons) => ({
  ticker: `T${i}`, name: `Stock ${i}`, uic: i, asset_type: 'Stock', last_close: 10 + i, change_1d: -1, sparkline: [],
  reasons: reasons ?? [
    { field: 'pct_vs_ma200', label: 'vs 200D', value: 12, format: 'signed_pct' },
    { field: 'rsi14', label: 'RSI', value: 81, format: 'number' },
  ],
})
const shelf = (total, count, extra = {}) => ({
  key: 'overbought', title: 'Overbought', short: 'Overbought', subtitle: 'RSI 14 ≥ 70', order: 'Ordered by RSI 14, highest first',
  empty: 'No stocks match these criteria in the last session.', sort: { field: 'rsi14', descending: true },
  total, items: Array.from({ length: count }, (_, i) => item(i)), ...extra,
})
const renderColumn = (s) => render(<MemoryRouter><LensColumn shelf={s} /></MemoryRouter>)

describe('LensColumn', () => {
  it('lists the first five stocks in the lens order', () => {
    renderColumn(shelf(20, 20))
    const rows = within(screen.getByRole('list', { name: 'Overbought stocks' })).getAllByRole('listitem')
    expect(rows.map((row) => row.textContent.match(/^T\d+/)[0])).toEqual(['T0', 'T1', 'T2', 'T3', 'T4'])
  })

  it('shows the value the lens is ordered by', () => {
    renderColumn(shelf(1, 1))
    expect(screen.getByRole('listitem')).toHaveTextContent('RSI 81')
    expect(screen.getByRole('listitem')).not.toHaveTextContent('vs 200D')
  })

  it('opens Research for the exact instrument', () => {
    renderColumn(shelf(1, 1))
    expect(screen.getByRole('link', { name: /^T0/ })).toHaveAttribute('href', '/research?symbol=T0&tab=overview&uic=0&assetType=Stock')
  })

  it('carries no rank numbers', () => {
    renderColumn(shelf(3, 3))
    screen.getAllByRole('listitem').forEach((row) => expect(row.textContent).not.toMatch(/^\s*\d/))
  })

  it('says an empty lens is empty and offers no See all', () => {
    renderColumn(shelf(0, 0))
    expect(screen.getByText('No stocks match these criteria in the last session.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /See all/ })).not.toBeInTheDocument()
  })

  it('keeps the jump target id of the lens', () => {
    renderColumn(shelf(1, 1))
    expect(screen.getByRole('heading', { level: 3, name: 'Overbought' })).toHaveAttribute('id', 'shelf-overbought')
  })
})
```

Before writing the third test, check `researchHref`'s exact output for uic `0` in `lib/research.js`. If it drops a falsy uic, start the fixture's `uic` at `i + 1` and adjust the expected href.

In `Discover.test.jsx` add (with `beforeEach` clearing `localStorage`):

```js
  it('offers a jump chip per lens that lands on its heading', () => {
    useDiscover.mockReturnValue({ data: { as_of: '2026-09-30T22:40:00Z', health: { state: 'ok' }, groups, shelves: [shelf('overbought', 'Overbought', 7, [card])] } })
    renderPage()
    const nav = screen.getByRole('navigation', { name: 'Lenses' })
    expect(within(nav).getByRole('link', { name: 'Overbought 7' })).toHaveAttribute('href', '#shelf-overbought')
  })

  it('shows cards until compact is chosen, then remembers it', () => {
    useDiscover.mockReturnValue({ data: { as_of: '2026-09-30T22:40:00Z', health: { state: 'ok' }, groups, shelves: [shelf('overbought', 'Overbought', 7, [card])] } })
    const { unmount } = renderPage()
    expect(screen.getByRole('button', { name: 'Cards' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('list', { name: 'Overbought stocks' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Compact' }))
    expect(screen.getByRole('list', { name: 'Overbought stocks' })).toBeInTheDocument()
    unmount()
    renderPage()
    expect(screen.getByRole('button', { name: 'Compact' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('keeps the lens heading a jump target in compact view', () => {
    localStorage.setItem('saxodash:discover-view', 'compact')
    useDiscover.mockReturnValue({ data: { as_of: '2026-09-30T22:40:00Z', health: { state: 'ok' }, groups, shelves: [shelf('overbought', 'Overbought', 7, [card])] } })
    renderPage()
    expect(screen.getByRole('heading', { level: 3, name: 'Overbought' })).toHaveAttribute('id', 'shelf-overbought')
  })
```

`groups` is a module-level const in the test file: `[{ key: 'price', title: 'Price action' }, { key: 'fundamentals', title: 'Fundamentals' }]`. Import `within` if it isn't already.

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run src/components/discover/LensColumn.test.jsx src/pages/Discover.test.jsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`LensChips.jsx`:

```jsx
export default function LensChips({ shelves }) {
  return (
    <nav aria-label="Lenses" className="min-w-0 flex gap-2 overflow-x-auto whitespace-nowrap pb-1">
      {shelves.map((shelf) => (
        <a
          key={shelf.key}
          href={`#shelf-${shelf.key}`}
          className="shrink-0 inline-flex h-7 items-center gap-1.5 rounded-full border border-white/[0.08] px-2.5 text-[var(--fig-xs)] text-zinc-300 hover:bg-white/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          {shelf.short} <span className="num text-zinc-500">{shelf.total}</span>
        </a>
      ))}
    </nav>
  )
}
```

`LensColumn.jsx`:

```jsx
import { Link } from 'react-router-dom'

import { COMPACT_ROWS, leadReason, reasonParts } from '../../lib/discover'
import { fmtMoney } from '../../lib/format'
import { researchHref } from '../../lib/research'
import { Card, DayChange, EmptyState, InstrumentLogo } from '../ui'
import ShelfHeader from './ShelfHeader'
import TickerInitial from './TickerInitial'

function LeadReason({ reason }) {
  if (!reason) return null
  const { label, value } = reasonParts(reason)
  return (
    <span className="whitespace-nowrap text-[var(--fig-xs)]">
      <span className="text-zinc-500">{label}</span> <span className="num font-mono text-zinc-200">{value}</span>
    </span>
  )
}

export default function LensColumn({ shelf }) {
  const rows = shelf.items.slice(0, COMPACT_ROWS)
  return (
    <Card className="space-y-3">
      <ShelfHeader shelf={shelf} shown={rows.length} />
      {shelf.total === 0 ? (
        <EmptyState title={shelf.empty} className="py-4" />
      ) : (
        <ul aria-label={`${shelf.title} stocks`}>
          {rows.map((item) => (
            <li key={`${item.uic}:${item.asset_type}`} className="border-t border-white/[0.04] first:border-t-0">
              <Link
                to={researchHref(item.ticker, 'overview', { uic: item.uic, assetType: item.asset_type })}
                className="flex items-center gap-2 py-2 rounded hover:bg-white/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
              >
                <InstrumentLogo symbol={item.ticker} size={16} className="rounded" fallback={<TickerInitial ticker={item.ticker} size={16} />} />
                <span className="w-14 shrink-0 text-[var(--fig-sm)] font-semibold text-zinc-100">{item.ticker}</span>
                <span className="num font-mono text-[var(--fig-xs)] text-zinc-300">{fmtMoney(item.last_close, 'USD')}</span>
                <DayChange value={item.change_1d} className="text-[var(--fig-xs)]" />
                <span className="ml-auto"><LeadReason reason={leadReason(item, shelf.sort)} /></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
```

The ticker comes first in the link's text, so `name: /^T0/` matches. A 16px `TickerInitial` uses `--fig-2xs` text and still fits.

`Discover.jsx`: add the imports (`LensChips`, `LensColumn`, `readDiscoverView`, `writeDiscoverView`, `groupShelves`, `TBtn`), then:

```jsx
function ViewToggle({ view, onChange }) {
  return (
    <div role="group" aria-label="View" className="shrink-0 flex items-center gap-1">
      <TBtn active={view === 'cards'} onClick={() => onChange('cards')}>Cards</TBtn>
      <TBtn active={view === 'compact'} onClick={() => onChange('compact')}>Compact</TBtn>
    </div>
  )
}
```

In `Discover()`:

```jsx
  const [view, setView] = useState(readDiscoverView)
  const chooseView = (next) => {
    setView(next)
    writeDiscoverView(next)
  }
```

After `DiscoverHealth`, when `showShelves` is true:

```jsx
        <div className="flex items-center justify-between gap-3">
          <LensChips shelves={data.shelves} />
          <ViewToggle view={view} onChange={chooseView} />
        </div>
```

Inside each `ShelfGroup`:

```jsx
              {view === 'compact' ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {group.shelves.map((shelf) => <LensColumn key={shelf.key} shelf={shelf} />)}
                </div>
              ) : (
                group.shelves.map((shelf) => <ShelfRow key={shelf.key} shelf={shelf} />)
              )}
```

Add `useState` to the React import.

- [ ] **Step 4: Run to verify they pass**

Run: `cd frontend && npx vitest run src/components/discover/ src/pages/Discover.test.jsx`, then the full suite once with `cd frontend && npx vitest run`, and `npx eslint src/pages/Discover.jsx src/components/discover`.
Expected: PASS, lint clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/discover/LensChips.jsx frontend/src/components/discover/LensColumn.jsx frontend/src/components/discover/LensColumn.test.jsx frontend/src/pages/Discover.jsx frontend/src/pages/Discover.test.jsx
git commit -m "feat: Discover jumps to a lens from a chip and offers a compact view of each lens's first five"
```

---

### Task 4: Spec amendment and visual verification

**Files:**
- Modify: `docs/superpowers/specs/2026-10-02-discover-lenses-design.md` (§5 "Landing page and cards")

- [ ] **Step 1:** Under §5, after the landing-page sketch, add one paragraph headed "**Compact view (added 2026-10-04).**" Its content:
  - Cards stay the default.
  - A "Cards | Compact" toggle, remembered per browser, swaps each group's shelves for a grid of lens columns, 3 per row on wide screens.
  - Each column lists the lens's first five stocks in that lens's own disclosed order, with the value it is ordered by. There are no rank numbers and no cross-lens ordering.
  - A strip of jump chips (short name + count) sits above the groups in both views.
  - Group titles ("Price action", "Fundamentals") are rendered as section headings.
- [ ] **Step 2:** Commit `docs: spec Discover compact view and lens jump chips`.
- [ ] **Step 3 (controller):** Take screenshots of `/discover` in both views at 1440px and 390px with the `saxodash-design-system` harness, and of a chip jump in both views. Check:
  - group headings read as section labels without competing with lens titles
  - chips scroll on one line on phone
  - compact columns align their reason values
  - nothing is cut off
- [ ] **Step 4 (controller):** Run `cd frontend && npx vitest run && npx eslint src && npm run build`. All must be clean, apart from lint errors already present in the user's uncommitted files, which are noted and not fixed.
