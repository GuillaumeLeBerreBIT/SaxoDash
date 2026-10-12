# Linked Research Charts (Phase 5C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Link panes" toggle in the multi-pane Research chart workspace that makes pan/zoom apply the same date window to every pane, and makes hovering a day in one pane show that day in the others.

**Architecture:** Pan/zoom is linked by date. The pane the user acts on is the leader: it converts its resolved window to `{from, to}` dates and publishes them; every other filled pane stores them as `followDates` and derives its own `timeView` from its own bars inside `useChartData`. A pane's own interaction clears its `followDates`, so any pane can lead. The crosshair is a shared hover date in a small context; each pane maps it to its nearest bar at or before that date. Linking is a persisted workspace flag.

**Tech Stack:** React 19, vitest + Testing Library, eslint (no setState in effects), Tailwind, lucide-react. Frontend only; no backend or migration work.

**Spec:** `docs/superpowers/specs/2026-10-11-linked-research-charts-design.md`

## Spec deltas (decided while planning; the spec file is updated in Task 7)

- The spec's "registration callback" is dropped. Followers do not get a derived `timeView` written into them; they store the leader's dates and derive their own `timeView` in `useChartData`, because only the pane knows its own bars. A pane also records its current visible dates in a ref (`reportWindow`) so turning the toggle on can align the others to the active pane.
- A symbol switch while linked does **not** reset the other panes. The pane that got the new symbol adopts the last linked window instead, so every pane keeps showing the same period. A range-button pick still resets every pane to the latest view and clears the linked window.
- A double-click on the date strip while linked publishes the leader's latest window as dates, so followers match the leader's latest period (not necessarily their own latest bar).
- The toggle sits in the chart tool rail beside the Layout menu and is hidden below `lg`, exactly like Layout: below `lg` only the active pane is shown, so there is nothing to link.
- The OHLC legend already prints the hovered bar's date, so a follower pane that matched an earlier bar already shows which day it is; only the guide is dimmed.

## Global Constraints

- Zero code comments in generated code (AGENTS.md). Tool directives only.
- Test-first; vitest specs alongside every frontend change.
- eslint clean: `cd frontend && npx eslint src` (no setState in effects; refs are written only inside effects or event handlers).
- JavaScript, not TypeScript. React Router, Tailwind, lucide icons; no new dependencies.
- Bars are identified by `bar.date` (ISO `YYYY-MM-DD`, oldest first); horizons stay daily or coarser.
- `lib/timeWindow.js` is the only module that knows window rules.
- The active pane is the URL (`?symbol=`); other panes render from stored uic + asset type. Do not touch that.
- The single-pane layout and the unlinked multi-pane layout must behave exactly as today.
- Workspace storage key `saxodash:chart-workspace`; an old saved value without `linked` must load as `false`.
- Use the existing `RailButton` primitive; no new colour tokens.
- Work in the worktree `.worktrees/linked-charts` on branch `feat/linked-research-charts`.

## Review Focus

1. A follower whose history is much shorter than the leader's window: it shows what it has, never blank, never negative offsets. (Task 1 test)
2. A leader window that lies entirely before or after a follower's data: the follower clamps to its nearest edge. (Task 1 test)
3. Different trading calendars: a hovered day the follower has no bar on matches the previous bar and is flagged inexact; a day outside the follower's visible window draws nothing. (Task 1 and Task 6 tests)
4. Panning from a follower starts from the window it is actually displaying, not its stale stored offset. (Task 1 `resolveTimeViewChange` test)
5. Saved layouts: one without `linked`, one with a non-boolean `linked`, and shrinking from four panes to one with `linked: true` stored. Linking is only effective with more than one pane, and empty panes never receive a window or a hover. (Tasks 2, 4 and 5 tests)

---

## File Structure

| File | Responsibility |
|---|---|
| `frontend/src/lib/timeWindow.js` | Modify. Date-window conversions: `windowToDates`, `barIndexAtOrBefore`, `barIndexAtOrAfter`, `timeViewForDates`, `matchBarByDate`, `resolveTimeViewChange`. |
| `frontend/src/lib/chartWorkspace.js` | Modify. `linked` in the saved shape. |
| `frontend/src/components/research/useChartWorkspace.js` | Modify. Expose `linked` / `setLinked`; keep `linked` through layout changes. |
| `frontend/src/components/research/useChartData.js` | Modify. Accept `followDates`; return the effective `timeView` and `allBars`. |
| `frontend/src/components/research/usePaneViews.js` | Modify. `followDates` per pane, linked window, `commitTimeView`, `reportWindow`, `alignTo`. |
| `frontend/src/components/research/LinkedHover.jsx` | Create. Shared hover-date context. |
| `frontend/src/components/research/ChartPane.jsx` | Modify. Wire the commit/report/hover logic into `FilledPane`. |
| `frontend/src/components/research/ChartCanvas.jsx`, `TVChart.jsx`, `panes.jsx` | Modify. `hoverDimmed` prop. |
| `frontend/src/components/research/ChartToolRail.jsx` | Modify. "Link panes" button. |
| `frontend/src/pages/ResearchChart.jsx` | Modify. Pass `linked`, wire the toggle, wrap panes in the hover provider. |

Test files sit beside each: `lib/timeWindow.test.js`, `lib/chartWorkspace.test.js`, `useChartWorkspace.test.jsx`, new `useChartData.test.jsx`, `usePaneViews.test.js`, new `LinkedHover.test.jsx`, `ChartPane.test.jsx`, `ChartToolRail.test.jsx`, `TVChart.test.jsx`, `panes.test.jsx`, `pages/ResearchChart.test.jsx`.

Commands run from `frontend/` in the worktree: single file `npx vitest run src/lib/timeWindow.test.js`, whole suite `npm test`, lint `npx eslint src`.

---

### Task 1: Date-window functions in `lib/timeWindow.js`

**Files:**
- Modify: `frontend/src/lib/timeWindow.js`
- Test: `frontend/src/lib/timeWindow.test.js`

**Interfaces:**
- Consumes: existing `resolveTimeWindow`, `LATEST_TIME_VIEW`, `MIN_VISIBLE_BARS`, `clamp` (module-private).
- Produces (later tasks rely on these exact names):
  - `windowToDates(window, bars) -> { from: string, to: string } | null`; `window` is a `resolveTimeWindow` result, `bars` is the full fetched array.
  - `barIndexAtOrBefore(bars, date) -> number` (`-1` when none).
  - `barIndexAtOrAfter(bars, date) -> number` (`-1` when none).
  - `timeViewForDates({ from, to }, bars) -> { offset: number, barCount: number | null }`.
  - `matchBarByDate(bars, date) -> { index: number, exact: boolean } | null`; `bars` is the visible window.
  - `resolveTimeViewChange(next, current, { bars, range }) -> { timeView, dates }`; `next` is a timeView or an updater `(current) => timeView`.

- [ ] **Step 0: Install dependencies in the worktree**

Run: `cd frontend && npm ci`
Expected: completes without errors (a git worktree has no `node_modules`).

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/lib/timeWindow.test.js` (extend the existing import to bring in `barIndexAtOrAfter, barIndexAtOrBefore, matchBarByDate, resolveTimeViewChange, timeViewForDates, windowToDates`):

```js
const day = (n) => new Date(Date.UTC(2026, 0, 1 + n)).toISOString().slice(0, 10)
const barsOn = (days) => days.map((n) => ({ date: day(n) }))
const run = (from, to) => barsOn(Array.from({ length: to - from + 1 }, (_, i) => from + i))

describe('windowToDates', () => {
  it('names the first and last visible bar', () => {
    const window = resolveTimeWindow({ offset: 10, barCount: 20 }, { total: 100, range: '1M' })
    expect(windowToDates(window, run(0, 99))).toEqual({ from: day(70), to: day(89) })
  })

  it('has no dates when there are no bars', () => {
    const window = resolveTimeWindow(LATEST_TIME_VIEW, { total: 0, range: '1M' })
    expect(windowToDates(window, [])).toBeNull()
  })
})

describe('barIndexAtOrBefore and barIndexAtOrAfter', () => {
  const bars = barsOn([0, 1, 2, 4, 5])

  it('finds an exact date', () => {
    expect(barIndexAtOrBefore(bars, day(2))).toBe(2)
    expect(barIndexAtOrAfter(bars, day(2))).toBe(2)
  })

  it('falls back across a missing day', () => {
    expect(barIndexAtOrBefore(bars, day(3))).toBe(2)
    expect(barIndexAtOrAfter(bars, day(3))).toBe(3)
  })

  it('answers -1 outside the data', () => {
    expect(barIndexAtOrBefore(bars, day(-5))).toBe(-1)
    expect(barIndexAtOrAfter(bars, day(50))).toBe(-1)
    expect(barIndexAtOrBefore([], day(1))).toBe(-1)
    expect(barIndexAtOrAfter([], day(1))).toBe(-1)
  })
})

describe('timeViewForDates', () => {
  const dates = { from: day(70), to: day(89) }

  it('round-trips a window on the same calendar', () => {
    expect(timeViewForDates(dates, run(0, 99))).toEqual({ offset: 10, barCount: 20 })
  })

  it('follows a symbol that ends earlier', () => {
    expect(timeViewForDates(dates, run(0, 89))).toEqual({ offset: 0, barCount: 20 })
  })

  it('counts bars, not days, across a missing day', () => {
    const holiday = barsOn(Array.from({ length: 100 }, (_, i) => i).filter((n) => n !== 75))
    expect(timeViewForDates(dates, holiday)).toEqual({ offset: 10, barCount: 19 })
  })

  it('shows what a shorter history has when the window starts before its first bar', () => {
    expect(timeViewForDates(dates, run(80, 99))).toEqual({ offset: 10, barCount: 10 })
  })

  it('clamps to the oldest bars when the window ends before the data starts', () => {
    expect(timeViewForDates({ from: day(10), to: day(20) }, run(80, 99))).toEqual({ offset: 20, barCount: null })
  })

  it('clamps to the latest bars when the window starts after the data ends', () => {
    expect(timeViewForDates({ from: day(70), to: day(90) }, run(0, 50))).toEqual(LATEST_TIME_VIEW)
  })

  it('never shows fewer than the minimum number of bars', () => {
    expect(timeViewForDates({ from: day(10), to: day(11) }, run(0, 99))).toEqual({
      offset: 88,
      barCount: MIN_VISIBLE_BARS,
    })
  })

  it('never asks for more bars than exist', () => {
    expect(timeViewForDates({ from: day(0), to: day(99) }, run(0, 9))).toEqual({ offset: 0, barCount: 10 })
  })

  it('shows the latest view when there are no bars', () => {
    expect(timeViewForDates(dates, [])).toEqual(LATEST_TIME_VIEW)
  })
})

describe('matchBarByDate', () => {
  const bars = barsOn([0, 1, 2, 4, 5])

  it('matches an exact day', () => {
    expect(matchBarByDate(bars, day(2))).toEqual({ index: 2, exact: true })
  })

  it('matches the previous bar when the day is missing and says so', () => {
    expect(matchBarByDate(bars, day(3))).toEqual({ index: 2, exact: false })
  })

  it('draws nothing outside the visible bars', () => {
    expect(matchBarByDate(bars, day(-1))).toBeNull()
    expect(matchBarByDate(bars, day(6))).toBeNull()
  })

  it('draws nothing without a date or without bars', () => {
    expect(matchBarByDate(bars, null)).toBeNull()
    expect(matchBarByDate([], day(1))).toBeNull()
  })
})

describe('resolveTimeViewChange', () => {
  const bars = run(0, 99)
  const context = { bars, range: '1M' }

  it('commits a value as given, with the dates of its window', () => {
    expect(resolveTimeViewChange({ offset: 10, barCount: 20 }, LATEST_TIME_VIEW, context)).toEqual({
      timeView: { offset: 10, barCount: 20 },
      dates: { from: day(70), to: day(89) },
    })
  })

  it('hands an updater the view the pane is displaying, not a stored one', () => {
    const displayed = { offset: 30, barCount: 20 }
    const result = resolveTimeViewChange((view) => ({ ...view, offset: view.offset + 5 }), displayed, context)
    expect(result.timeView).toEqual({ offset: 35, barCount: 20 })
    expect(result.dates).toEqual({ from: day(45), to: day(64) })
  })

  it('has no dates when the pane has no bars', () => {
    expect(resolveTimeViewChange(LATEST_TIME_VIEW, LATEST_TIME_VIEW, { bars: [], range: '1M' }).dates).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/timeWindow.test.js`
Expected: FAIL (`windowToDates is not a function` and similar).

- [ ] **Step 3: Implement**

Append to `frontend/src/lib/timeWindow.js`:

```js
export function windowToDates(window, bars) {
  const first = bars[window.start]
  const last = bars[window.end - 1]
  return first && last ? { from: first.date, to: last.date } : null
}

export function barIndexAtOrBefore(bars, date) {
  let low = 0
  let high = bars.length - 1
  let found = -1
  while (low <= high) {
    const middle = (low + high) >> 1
    if (bars[middle].date <= date) {
      found = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  return found
}

export function barIndexAtOrAfter(bars, date) {
  const before = barIndexAtOrBefore(bars, date)
  if (before !== -1 && bars[before].date === date) return before
  return before + 1 < bars.length ? before + 1 : -1
}

export function timeViewForDates({ from, to }, bars) {
  const total = bars.length
  if (total === 0) return LATEST_TIME_VIEW
  const last = barIndexAtOrBefore(bars, to)
  if (last === -1) return { offset: total, barCount: null }
  const first = barIndexAtOrAfter(bars, from)
  if (first === -1) return LATEST_TIME_VIEW
  const width = Math.min(total, Math.max(MIN_VISIBLE_BARS, last - first + 1))
  return { offset: clamp(total - 1 - last, 0, total - width), barCount: width }
}

export function matchBarByDate(bars, date) {
  if (date == null || bars.length === 0) return null
  if (date < bars[0].date || date > bars[bars.length - 1].date) return null
  const index = barIndexAtOrBefore(bars, date)
  return { index, exact: bars[index].date === date }
}

export function resolveTimeViewChange(next, current, { bars, range }) {
  const timeView = typeof next === 'function' ? next(current) : next
  const window = resolveTimeWindow(timeView, { total: bars.length, range })
  return { timeView, dates: windowToDates(window, bars) }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/timeWindow.test.js`
Expected: PASS. If a `timeViewForDates` expectation is off by one, recheck the arithmetic by hand against the test's calendar before changing the function.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/timeWindow.js frontend/src/lib/timeWindow.test.js
git commit -m "feat(research): date-window conversions for linked panes"
```

---

### Task 2: Persist `linked` in the workspace

**Files:**
- Modify: `frontend/src/lib/chartWorkspace.js`, `frontend/src/components/research/useChartWorkspace.js`
- Test: `frontend/src/lib/chartWorkspace.test.js`, `frontend/src/components/research/useChartWorkspace.test.jsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: workspace shape `{ layout, slots, active, linked: boolean }`; `useChartWorkspace` returns `{ layout, slots, active, linked, activate, setLayout, setLinked }`, where `setLinked(next: boolean)`.

- [ ] **Step 1: Write the failing tests**

In `chartWorkspace.test.js` change `DEFAULTS` to `{ layout: '1', slots: [null], active: 0, linked: false }`, add `linked: false` to the `toEqual` object in the "unknown layout" test, then add:

```js
  it('reads linked only when it is exactly true', () => {
    const base = { layout: '2h', slots: [nvda, amd], active: 0 }
    expect(sanitizeWorkspace(base).linked).toBe(false)
    expect(sanitizeWorkspace({ ...base, linked: true }).linked).toBe(true)
    expect(sanitizeWorkspace({ ...base, linked: 'yes' }).linked).toBe(false)
    expect(sanitizeWorkspace({ ...base, linked: 1 }).linked).toBe(false)
  })

  it('keeps linked across a layout that shrinks to one pane', () => {
    expect(sanitizeWorkspace({ layout: '1', slots: [nvda, amd], active: 0, linked: true }).linked).toBe(true)
  })
```

In the `writeWorkspace`/`readWorkspace` tests of that file, add one that round-trips `linked: true`:

```js
  it('round-trips linked through storage', () => {
    writeWorkspace({ layout: '2h', slots: [nvda, amd], active: 0, linked: true })
    expect(readWorkspace().linked).toBe(true)
  })
```

In `useChartWorkspace.test.jsx` add:

```js
  it('is unlinked until asked, and remembers the choice', () => {
    store({ layout: '2h', slots: [nvda, amd], active: 0 })
    const { result } = renderWorkspace()
    expect(result.current.workspace.linked).toBe(false)
    act(() => result.current.workspace.setLinked(true))
    expect(result.current.workspace.linked).toBe(true)
    expect(stored().linked).toBe(true)
  })

  it('keeps linked when the layout changes', () => {
    store({ layout: '2h', slots: [nvda, amd], active: 0, linked: true })
    const { result } = renderWorkspace()
    act(() => result.current.workspace.setLayout('4'))
    expect(result.current.workspace.linked).toBe(true)
    expect(stored().linked).toBe(true)
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/chartWorkspace.test.js src/components/research/useChartWorkspace.test.jsx`
Expected: FAIL (`linked` is `undefined`).

- [ ] **Step 3: Implement**

In `lib/chartWorkspace.js`: `sanitizeWorkspace` returns `{ layout: preset.id, slots, active, linked: source.linked === true }`; `writeWorkspace({ layout, slots, active, linked })` stores `JSON.stringify({ layout, slots, active, linked })`.

In `useChartWorkspace.js`: in `setLayout`, replace the `workspace: { layout: preset.id, slots, active }` object with `workspace: { ...previous.workspace, layout: preset.id, slots, active }`; add

```js
  const setLinked = (next) => setState((previous) => ({ ...previous, workspace: { ...previous.workspace, linked: next } }))
```

and return `{ layout: workspace.layout, slots: workspace.slots, active: workspace.active, linked: workspace.linked, activate, setLayout, setLinked }`.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/chartWorkspace.test.js src/components/research/useChartWorkspace.test.jsx src/pages/ResearchChart.test.jsx`
Expected: PASS. If a page test asserts the exact stored object, add `linked: false` to its expectation.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/chartWorkspace.js frontend/src/lib/chartWorkspace.test.js frontend/src/components/research/useChartWorkspace.js frontend/src/components/research/useChartWorkspace.test.jsx
git commit -m "feat(research): persist the linked-panes choice with the workspace"
```

---

### Task 3: `useChartData` derives its window from `followDates`

**Files:**
- Modify: `frontend/src/components/research/useChartData.js`
- Create: `frontend/src/components/research/useChartData.test.jsx`

**Interfaces:**
- Consumes: `timeViewForDates` (Task 1).
- Produces: `useChartData({ symbol, instrument, range, timeView, followDates })` where `followDates` is `{ from, to } | null` (default `null`); additionally returns `allBars` and `timeView` (the effective view: derived from `followDates` when set, else the `timeView` argument).

- [ ] **Step 1: Write the failing test**

Create `useChartData.test.jsx`:

```jsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

import { LATEST_TIME_VIEW } from '../../lib/timeWindow'
import { useChartData } from './useChartData'

vi.mock('../../api/queries')
import * as queries from '../../api/queries'

const bars = Array.from({ length: 30 }, (_, i) => ({
  date: `2026-08-${String(i + 1).padStart(2, '0')}`,
  open: 100 + i,
  high: 104 + i,
  low: 98 + i,
  close: 102 + i,
  volume: 1_000_000,
}))
const idle = { data: undefined, isLoading: false, error: null }
const instrument = { uic: 211, assetType: 'Stock' }

function stub() {
  queries.useChart.mockReturnValue({ data: bars, isLoading: false, error: null })
  queries.useInstrumentDetails.mockReturnValue({ ...idle, data: { currency: 'USD' } })
  queries.useSymbolEarnings.mockReturnValue({ ...idle, data: { available: false } })
  queries.useSymbolNote.mockReturnValue({ ...idle, data: null })
  queries.useNoteLevelMutation.mockReturnValue({ mutate: vi.fn() })
  queries.usePriceLines.mockReturnValue({ ...idle, data: [] })
  queries.usePriceLineMutations.mockReturnValue({
    create: { mutate: vi.fn() },
    update: { mutate: vi.fn() },
    remove: { mutate: vi.fn() },
  })
  queries.useTrendLines.mockReturnValue({ ...idle, data: [] })
  queries.useTrendLineMutations.mockReturnValue({
    create: { mutate: vi.fn() },
    update: { mutate: vi.fn() },
    remove: { mutate: vi.fn() },
  })
  queries.useTextAnnotations.mockReturnValue({ ...idle, data: [] })
  queries.useTextAnnotationMutations.mockReturnValue({
    create: { mutate: vi.fn() },
    update: { mutate: vi.fn() },
    remove: { mutate: vi.fn() },
  })
  queries.useQuotes.mockReturnValue({ ...idle, data: [{ uic: 211, price: 875.4, change_pct: 1.42 }] })
}

const render = (props = {}) =>
  renderHook(() => useChartData({ symbol: 'NVDA', instrument, range: '1M', ...props }))

describe('useChartData linked window', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stub()
  })

  it('shows its own time view when it is not following', () => {
    const { result } = render({ timeView: { offset: 5, barCount: 10 } })
    expect(result.current.bars.map((b) => b.date)[0]).toBe('2026-08-16')
    expect(result.current.timeView).toEqual({ offset: 5, barCount: 10 })
  })

  it('shows the followed dates instead of its own time view', () => {
    const { result } = render({
      timeView: LATEST_TIME_VIEW,
      followDates: { from: '2026-08-05', to: '2026-08-14' },
    })
    expect(result.current.bars.map((b) => b.date)).toEqual(
      bars.slice(4, 14).map((b) => b.date),
    )
    expect(result.current.timeView).toEqual({ offset: 16, barCount: 10 })
  })

  it('exposes every fetched bar', () => {
    const { result } = render()
    expect(result.current.allBars).toHaveLength(30)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/research/useChartData.test.jsx`
Expected: FAIL (`followDates` ignored, `allBars` undefined).

- [ ] **Step 3: Implement**

In `useChartData.js`: import `timeViewForDates`; add `followDates = null` to the parameter object; replace the `timeWindow` memo:

```js
  const effectiveTimeView = useMemo(
    () => (followDates ? timeViewForDates(followDates, allBars) : timeView),
    [followDates, allBars, timeView],
  )
  const timeWindow = useMemo(
    () => resolveTimeWindow(effectiveTimeView, { total: allBars.length, range }),
    [effectiveTimeView, allBars.length, range],
  )
```

and add `allBars` and `timeView: effectiveTimeView` to the returned object. Leave the existing comments in the file as they are.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/research`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/research/useChartData.js frontend/src/components/research/useChartData.test.jsx
git commit -m "feat(research): let a pane derive its window from followed dates"
```

---

### Task 4: `usePaneViews` links panes

**Files:**
- Modify: `frontend/src/components/research/usePaneViews.js`
- Test: `frontend/src/components/research/usePaneViews.test.js`

**Interfaces:**
- Consumes: `LATEST_TIME_VIEW`.
- Produces: `usePaneViews(slots, range, linked = false)` returns `{ view, rangePicked, alignTo }`. `view(index)` additionally carries `followDates: {from,to} | null`, `commitTimeView(timeView, dates)` and `reportWindow(dates)`. `alignTo(index)` makes every other filled pane follow the window pane `index` last reported.

- [ ] **Step 1: Write the failing tests**

Add to `usePaneViews.test.js`:

```js
const datesA = { from: '2026-03-01', to: '2026-03-31' }
const datesB = { from: '2026-02-01', to: '2026-02-28' }

const renderLinked = (slots = [nvda, amd, null], linked = true) =>
  renderHook((props) => usePaneViews(props.slots, '6M', props.linked), { initialProps: { slots, linked } })

describe('usePaneViews linking', () => {
  it('starts every pane without a followed window', () => {
    const { result } = renderLinked()
    expect(result.current.view(0).followDates).toBeNull()
    expect(result.current.view(1).followDates).toBeNull()
  })

  it('hands the leader window to the other filled panes', () => {
    const { result } = renderLinked()
    act(() => result.current.view(0).commitTimeView({ offset: 5, barCount: 20 }, datesA))
    expect(result.current.view(0)).toMatchObject({ timeView: { offset: 5, barCount: 20 }, followDates: null })
    expect(result.current.view(1).followDates).toEqual(datesA)
    expect(result.current.view(2).followDates).toBeNull()
  })

  it('leaves the others alone when not linked', () => {
    const { result } = renderLinked([nvda, amd], false)
    act(() => result.current.view(0).commitTimeView({ offset: 5, barCount: 20 }, datesA))
    expect(result.current.view(0).timeView).toEqual({ offset: 5, barCount: 20 })
    expect(result.current.view(1).followDates).toBeNull()
  })

  it('lets a follower take over as leader', () => {
    const { result } = renderLinked([nvda, amd])
    act(() => result.current.view(0).commitTimeView({ offset: 5, barCount: 20 }, datesA))
    act(() => result.current.view(1).commitTimeView({ offset: 40, barCount: 15 }, datesB))
    expect(result.current.view(1)).toMatchObject({ timeView: { offset: 40, barCount: 15 }, followDates: null })
    expect(result.current.view(0).followDates).toEqual(datesB)
  })

  it('clears every followed window on a range pick', () => {
    const { result } = renderLinked([nvda, amd])
    act(() => result.current.view(0).commitTimeView({ offset: 5, barCount: 20 }, datesA))
    act(() => result.current.rangePicked())
    expect(result.current.view(0).timeView).toEqual(LATEST_TIME_VIEW)
    expect(result.current.view(1).followDates).toBeNull()
  })

  it('aligns the others to the window a pane last reported', () => {
    const { result } = renderLinked([nvda, amd, tsla])
    act(() => result.current.view(0).reportWindow(datesA))
    act(() => result.current.alignTo(0))
    expect(result.current.view(0).followDates).toBeNull()
    expect(result.current.view(1).followDates).toEqual(datesA)
    expect(result.current.view(2).followDates).toEqual(datesA)
  })

  it('aligns nothing when the pane has reported no window', () => {
    const { result } = renderLinked([nvda, amd])
    act(() => result.current.alignTo(0))
    expect(result.current.view(1).followDates).toBeNull()
  })

  it('does not align empty panes', () => {
    const { result } = renderLinked([nvda, null])
    act(() => result.current.view(0).reportWindow(datesA))
    act(() => result.current.alignTo(0))
    expect(result.current.view(1).followDates).toBeNull()
  })

  it('gives a pane that receives a new symbol the current linked window', () => {
    const { result, rerender } = renderLinked([nvda, amd])
    act(() => result.current.view(0).commitTimeView({ offset: 5, barCount: 20 }, datesA))
    rerender({ slots: [nvda, tsla], linked: true })
    expect(result.current.view(1).followDates).toEqual(datesA)
    expect(result.current.view(0).timeView).toEqual({ offset: 5, barCount: 20 })
  })

  it('gives a pane that receives a new symbol a fresh view when not linked', () => {
    const { result, rerender } = renderLinked([nvda, amd], false)
    rerender({ slots: [nvda, tsla], linked: false })
    expect(result.current.view(1)).toMatchObject({ timeView: LATEST_TIME_VIEW, followDates: null })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/research/usePaneViews.test.js`
Expected: FAIL (`commitTimeView is not a function`).

- [ ] **Step 3: Implement**

Rewrite `usePaneViews.js` (no comments):

```js
import { useRef, useState } from 'react'

import { LATEST_TIME_VIEW } from '../../lib/timeWindow'

const FRESH_VIEW = { yScale: 1, yShift: 0, timeView: LATEST_TIME_VIEW, followDates: null }
const freshViews = (count) => Array.from({ length: count }, () => FRESH_VIEW)
const resolve = (next, current) => (typeof next === 'function' ? next(current) : next)
const slotKey = (slot) => (slot ? `${slot.symbol}:${slot.uic}:${slot.assetType}` : '')

export function usePaneViews(slots, range, linked = false) {
  const keys = slots.map(slotKey)
  const [views, setViews] = useState(() => freshViews(keys.length))
  const [seen, setSeen] = useState({ range, keys })
  const [linkedDates, setLinkedDates] = useState(null)
  const windows = useRef([])

  if (seen.range !== range) {
    const previous = seen.keys
    setSeen({ range, keys })
    setLinkedDates(null)
    setViews((current) =>
      keys.map((key, index) =>
        key !== '' && key === previous[index]
          ? { ...(current[index] ?? FRESH_VIEW), yShift: 0, timeView: LATEST_TIME_VIEW, followDates: null }
          : FRESH_VIEW,
      ),
    )
  } else if (seen.keys.join('|') !== keys.join('|')) {
    const previous = seen.keys
    const arrival = linked && linkedDates ? { ...FRESH_VIEW, followDates: linkedDates } : FRESH_VIEW
    setSeen({ range, keys })
    setViews((current) =>
      keys.map((key, index) => (key !== '' && key === previous[index] ? (current[index] ?? FRESH_VIEW) : arrival)),
    )
  }

  const update = (index, change) =>
    setViews((current) => current.map((view, i) => (i === index ? { ...view, ...change(view) } : view)))

  const commitTimeView = (index, timeView, dates) => {
    setViews((current) =>
      current.map((view, i) => {
        if (i === index) return { ...view, timeView, followDates: null }
        return linked && dates && slots[i] ? { ...view, followDates: dates } : view
      }),
    )
    if (linked && dates) setLinkedDates(dates)
  }

  const alignTo = (index) => {
    const dates = windows.current[index]
    if (!dates) return
    setViews((current) => current.map((view, i) => (i !== index && slots[i] ? { ...view, followDates: dates } : view)))
    setLinkedDates(dates)
  }

  const view = (index) => ({
    ...(views[index] ?? FRESH_VIEW),
    setYScale: (next) => update(index, (v) => ({ yScale: resolve(next, v.yScale) })),
    setYShift: (next) => update(index, (v) => ({ yShift: resolve(next, v.yShift) })),
    setTimeView: (next) => update(index, (v) => ({ timeView: resolve(next, v.timeView), followDates: null })),
    commitTimeView: (timeView, dates) => commitTimeView(index, timeView, dates),
    reportWindow: (dates) => {
      windows.current[index] = dates
    },
    resetView: () => update(index, () => FRESH_VIEW),
  })

  const rangePicked = () => {
    setLinkedDates(null)
    setViews((current) =>
      current.map((v) => ({ ...(v ?? FRESH_VIEW), yShift: 0, timeView: LATEST_TIME_VIEW, followDates: null })),
    )
  }

  return { view, rangePicked, alignTo }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/research/usePaneViews.test.js`
Expected: PASS, including the pre-existing tests (they pass two arguments; `linked` defaults to `false`).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/research/usePaneViews.js frontend/src/components/research/usePaneViews.test.js
git commit -m "feat(research): pane views share a followed date window when linked"
```

---

### Task 5: Wire panes, the page and the Link panes toggle

**Files:**
- Modify: `frontend/src/components/research/ChartPane.jsx`, `frontend/src/components/research/ChartToolRail.jsx`, `frontend/src/pages/ResearchChart.jsx`
- Test: `frontend/src/components/research/ChartPane.test.jsx`, `frontend/src/components/research/ChartToolRail.test.jsx`, `frontend/src/pages/ResearchChart.test.jsx`

**Interfaces:**
- Consumes: `resolveTimeViewChange`, `windowToDates` (Task 1); `useChartData` `allBars`/`timeView`/`followDates` (Task 3); `usePaneViews` `view(i).followDates|commitTimeView|reportWindow`, `alignTo` (Task 4); `workspace.linked|setLinked` (Task 2).
- Produces: `ChartToolRail` props `linkable: boolean`, `linked: boolean`, `onLinkedChange: (next: boolean) => void`; button named "Link panes" with `aria-pressed`.

- [ ] **Step 1: Write the failing tests**

`ChartPane.test.jsx`: extend the shared `view` constant with `followDates: null, commitTimeView: vi.fn(), reportWindow: vi.fn()`, then add:

```js
  it('reports the dates it is showing', () => {
    renderPane()
    expect(view.reportWindow).toHaveBeenLastCalledWith({ from: '2026-08-01', to: '2026-08-30' })
  })

  it('shows the followed window and reports it', () => {
    renderPane({ view: { ...view, followDates: { from: '2026-08-05', to: '2026-08-14' } } })
    expect(view.reportWindow).toHaveBeenLastCalledWith({ from: '2026-08-05', to: '2026-08-14' })
    expect(view.commitTimeView).not.toHaveBeenCalled()
  })
```

(The default range is `6M`, so all 30 test bars are visible: 2026-08-01 to 2026-08-30.)

`ChartToolRail.test.jsx`:

```js
  it('offers Link panes only when there is more than one pane', () => {
    renderRail()
    expect(screen.queryByRole('button', { name: 'Link panes' })).not.toBeInTheDocument()
  })

  it('toggles linking', async () => {
    const onLinkedChange = vi.fn()
    renderRail({ linkable: true, linked: false, onLinkedChange })
    const button = screen.getByRole('button', { name: 'Link panes' })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    await userEvent.setup().click(button)
    expect(onLinkedChange).toHaveBeenCalledWith(true)
  })

  it('shows linking as on', () => {
    renderRail({ linkable: true, linked: true, onLinkedChange: vi.fn() })
    expect(screen.getByRole('button', { name: 'Link panes' })).toHaveAttribute('aria-pressed', 'true')
  })
```

`pages/ResearchChart.test.jsx`: find an existing test that seeds `saxodash:chart-workspace` with a two-pane layout and reuse its render helper and stubs, then add:

```js
  it('links panes only in a split layout and saves the choice', async () => {
    const user = userEvent.setup()
    localStorage.setItem(
      'saxodash:chart-workspace',
      JSON.stringify({ layout: '2h', slots: [nvdaSlot, tslaSlot], active: 0 }),
    )
    renderPage()
    const toggle = screen.getByRole('button', { name: 'Link panes' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await user.click(toggle)
    expect(screen.getByRole('button', { name: 'Link panes' })).toHaveAttribute('aria-pressed', 'true')
    expect(JSON.parse(localStorage.getItem('saxodash:chart-workspace')).linked).toBe(true)
  })

  it('offers no Link panes toggle in a single layout even if linked was saved', () => {
    localStorage.setItem(
      'saxodash:chart-workspace',
      JSON.stringify({ layout: '1', slots: [nvdaSlot], active: 0, linked: true }),
    )
    renderPage()
    expect(screen.queryByRole('button', { name: 'Link panes' })).not.toBeInTheDocument()
  })
```

(`nvdaSlot`, `tslaSlot` and `renderPage` stand for whatever that file already defines for the seeded workspace tests; define small local equivalents if none exist.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/research/ChartPane.test.jsx src/components/research/ChartToolRail.test.jsx src/pages/ResearchChart.test.jsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`ChartPane.jsx` (`FilledPane`): import `useEffect` and `resolveTimeViewChange`, `windowToDates` from `../../lib/timeWindow`. Replace the `useChartData` call and `controls` prop:

```js
  const { chart, allBars, bars, rangeBars, ind, timeWindow, timeView, /* ...rest unchanged */ } = useChartData({
    symbol: slot.symbol,
    instrument,
    range: controls.range,
    timeView: view.timeView,
    followDates: view.followDates,
  })
  const shownDates = windowToDates(timeWindow, allBars)
  const reportWindow = view.reportWindow
  useEffect(() => {
    reportWindow(shownDates)
  })
  const paneView = {
    ...view,
    timeView,
    setTimeView: (next) => {
      const change = resolveTimeViewChange(next, timeView, { bars: allBars, range: controls.range })
      view.commitTimeView(change.timeView, change.dates)
    },
  }
```

and pass `controls={{ ...controls, ...paneView }}` to `ChartCanvas`. Keep every other destructured field of `useChartData` as it is today.

`ChartToolRail.jsx`: import `Link2` from `lucide-react`; add props `linkable = false, linked = false, onLinkedChange`; after the Layout `Menu` wrapper add:

```jsx
      {linkable ? (
        <div className="hidden lg:flex">
          <RailButton label="Link panes" icon={Link2} pressed={linked} onClick={() => onLinkedChange(!linked)} />
        </div>
      ) : null}
```

`ResearchChart.jsx`: move `const layout = layoutById(workspace.layout)` up to directly after `useChartWorkspace`, then:

```js
  const linkable = layout.panes > 1
  const linked = workspace.linked && linkable
  const { view: paneView, rangePicked, alignTo } = usePaneViews(workspace.slots, controls.range, linked)
  const setLinked = (next) => {
    workspace.setLinked(next)
    if (next) alignTo(workspace.active)
  }
```

(delete the later `const layout = ...` line) and pass `linkable={linkable} linked={linked} onLinkedChange={setLinked}` to `ChartToolRail`.

- [ ] **Step 4: Run to verify pass**

Run: `npm test && npx eslint src`
Expected: PASS and no lint errors. If eslint objects to the effect without a dependency array, give it the dependency list `[reportWindow, shownDates?.from, shownDates?.to]` and rebuild the object inside the effect.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/research frontend/src/pages/ResearchChart.jsx frontend/src/pages/ResearchChart.test.jsx
git commit -m "feat(research): Link panes toggle and linked pan/zoom"
```

---

### Task 6: Linked crosshair

**Files:**
- Create: `frontend/src/components/research/LinkedHover.jsx`, `frontend/src/components/research/LinkedHover.test.jsx`
- Modify: `frontend/src/components/research/ChartPane.jsx`, `ChartCanvas.jsx`, `TVChart.jsx`, `panes.jsx`, `frontend/src/pages/ResearchChart.jsx`
- Test: `ChartPane.test.jsx`, `TVChart.test.jsx`, `panes.test.jsx`

**Interfaces:**
- Consumes: `matchBarByDate` (Task 1); `linked` from the page (Task 5).
- Produces: `LinkedHoverProvider({ enabled, children })`; `useLinkedHover() -> { date: string | null, setDate(date: string | null) } | null` (`null` when not enabled or outside a provider); prop `hoverDimmed: boolean` (default `false`) on `ChartCanvas`, `TVChart`, `VolumePane`, `RsiPane`, `MacdPane`.

- [ ] **Step 1: Write the failing tests**

`LinkedHover.test.jsx`:

```jsx
import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import { LinkedHoverProvider, useLinkedHover } from './LinkedHover'

const wrapper = (enabled) =>
  function Wrapper({ children }) {
    return <LinkedHoverProvider enabled={enabled}>{children}</LinkedHoverProvider>
  }

describe('LinkedHover', () => {
  it('is absent outside a provider', () => {
    expect(renderHook(useLinkedHover).result.current).toBeNull()
  })

  it('is absent while linking is off', () => {
    expect(renderHook(useLinkedHover, { wrapper: wrapper(false) }).result.current).toBeNull()
  })

  it('shares a hovered date while linking is on', () => {
    const { result } = renderHook(useLinkedHover, { wrapper: wrapper(true) })
    expect(result.current.date).toBeNull()
    act(() => result.current.setDate('2026-08-10'))
    expect(result.current.date).toBe('2026-08-10')
  })
})
```

`ChartPane.test.jsx` (import `fmtDate` from `../../lib/format`, `LinkedHoverProvider`/`useLinkedHover` from `./LinkedHover`, `act` from Testing Library):

```jsx
  it('shows the day hovered in another pane', () => {
    let hover
    function Probe() {
      hover = useLinkedHover()
      return null
    }
    renderWithProviders(
      <LinkedHoverProvider enabled>
        <Probe />
        <ChartPane slot={nvda} active={false} outlined={false} controls={controls} view={view} onActivate={vi.fn()} tool="crosshair" onPlaced={vi.fn()} paneHeights={DEFAULT_PANE_HEIGHTS} />
      </LinkedHoverProvider>,
    )
    expect(screen.queryByText(fmtDate('2026-08-12'))).not.toBeInTheDocument()
    act(() => hover.setDate('2026-08-12'))
    expect(screen.getByText(fmtDate('2026-08-12'))).toBeInTheDocument()
  })

  it('draws nothing for a day outside the visible bars', () => {
    let hover
    function Probe() {
      hover = useLinkedHover()
      return null
    }
    renderWithProviders(
      <LinkedHoverProvider enabled>
        <Probe />
        <ChartPane slot={nvda} active={false} outlined={false} controls={controls} view={view} onActivate={vi.fn()} tool="crosshair" onPlaced={vi.fn()} paneHeights={DEFAULT_PANE_HEIGHTS} />
      </LinkedHoverProvider>,
    )
    act(() => hover.setDate('2026-07-01'))
    expect(screen.queryByText(fmtDate('2026-07-01'))).not.toBeInTheDocument()
    expect(screen.getByText(fmtDate('2026-08-30'))).toBeInTheDocument()
  })

  it('publishes the day its own hover is on', () => {
    let hover
    function Probe() {
      hover = useLinkedHover()
      return null
    }
    const { container } = renderWithProviders(
      <LinkedHoverProvider enabled>
        <Probe />
        <ChartPane slot={nvda} active={false} outlined={false} controls={controls} view={view} onActivate={vi.fn()} tool="crosshair" onPlaced={vi.fn()} paneHeights={DEFAULT_PANE_HEIGHTS} />
      </LinkedHoverProvider>,
    )
    const plot = container.querySelector('.select-none')
    fireEvent.mouseMove(plot, { clientX: 0, clientY: 100 })
    expect(hover.date).toBe('2026-08-01')
    fireEvent.mouseLeave(plot)
    expect(hover.date).toBeNull()
  })
```

(All 30 bars are visible at the default `6M` range, so `clientX: 0` hovers the first bar, 2026-08-01. `.select-none` is the `TVChart` root; verify it is the first match.)

`TVChart.test.jsx`:

```js
  it('draws the crosshair dimmed for a day matched on an earlier bar', () => {
    const exact = renderChart({ hover: 10 })
    expect(exact.container.querySelector('g[pointer-events="none"][opacity="0.4"]')).toBeNull()
    const dimmed = renderChart({ hover: 10, hoverDimmed: true })
    expect(dimmed.container.querySelector('g[pointer-events="none"][opacity="0.4"]')).not.toBeNull()
  })
```

`panes.test.jsx` (mirror the existing `VolumePane` render):

```js
  it('dims the hover line on request', () => {
    const data = [{ date: '2026-08-01', open: 1, high: 2, low: 1, close: 2, volume: 10 }, { date: '2026-08-02', open: 2, high: 3, low: 2, close: 3, volume: 20 }]
    const plain = render(<VolumePane data={data} hover={1} setHover={vi.fn()} />)
    expect(plain.container.querySelector('line[opacity="0.4"]')).toBeNull()
    const dimmed = render(<VolumePane data={data} hover={1} setHover={vi.fn()} hoverDimmed />)
    expect(dimmed.container.querySelector('line[opacity="0.4"]')).not.toBeNull()
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/research/LinkedHover.test.jsx src/components/research/ChartPane.test.jsx src/components/research/TVChart.test.jsx src/components/research/panes.test.jsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`LinkedHover.jsx`:

```jsx
import { createContext, useContext, useMemo, useState } from 'react'

const LinkedHoverContext = createContext(null)

export function LinkedHoverProvider({ enabled, children }) {
  const [date, setDate] = useState(null)
  const value = useMemo(() => (enabled ? { date, setDate } : null), [enabled, date])
  return <LinkedHoverContext.Provider value={value}>{children}</LinkedHoverContext.Provider>
}

export const useLinkedHover = () => useContext(LinkedHoverContext)
```

`ChartPane.jsx` (`FilledPane`): import `useLinkedHover` and `matchBarByDate`. Replace the hover state block:

```js
  const linkedHover = useLinkedHover()
  const [ownHover, setOwnHover] = useState(null)
  const ownIndex = ownHover != null && ownHover < bars.length ? ownHover : null
  const followed = ownIndex == null && linkedHover ? matchBarByDate(bars, linkedHover.date) : null
  const hover = ownIndex ?? followed?.index ?? null
  const setHover = (index) => {
    setOwnHover(index)
    linkedHover?.setDate(index == null ? null : (bars[index]?.date ?? null))
  }
```

and pass `hover={hover}`, `setHover={setHover}`, `hoverDimmed={followed != null && !followed.exact}` to `ChartCanvas`. Remove the old `safeHover`.

`ChartCanvas.jsx`: accept `hoverDimmed = false`; pass `hoverDimmed={hoverDimmed}` to `TVChart`, `VolumePane`, `RsiPane`, `MacdPane`.

`TVChart.jsx`: add `hoverDimmed = false` to the props; render `<Crosshair ... dimmed={hoverDimmed} />`; in `Crosshair` accept `dimmed` and use `<g pointerEvents="none" opacity={dimmed ? 0.4 : undefined}>`.

`panes.jsx`: `HoverLine({ x, height, dimmed })` adds `opacity={dimmed ? 0.4 : undefined}` to its `<line>`; `VolumePane`, `RsiPane`, `MacdPane` accept `hoverDimmed = false` and pass `dimmed={hoverDimmed}` to their `HoverLine`.

`ResearchChart.jsx`: import `LinkedHoverProvider` and wrap the pane grid `<div className="flex-1 min-h-0 flex flex-col gap-2 lg:grid" ...>` in `<LinkedHoverProvider enabled={linked}>...</LinkedHoverProvider>`.

- [ ] **Step 4: Run to verify pass**

Run: `npm test && npx eslint src`
Expected: PASS, no lint errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat(research): linked crosshair across panes"
```

---

### Task 7: Verify in the real UI, update the spec and next steps

**Files:**
- Modify: `docs/superpowers/specs/2026-10-11-linked-research-charts-design.md`, `docs/next-steps.md`
- Create (if the work surfaced something non-obvious): `learning/learning-records/NNNN-linked-panes.md` (gitignored)

- [ ] **Step 1: Bring the spec in line with the "Spec deltas" section at the top of this plan**

Edit the spec's Time range, Crosshair and UI sections: followers store dates and derive in `useChartData`; a symbol switch adopts the linked window; double-click on the date strip publishes the leader's latest dates; the toggle is hidden below `lg` like Layout; the legend already shows the matched bar's date.

- [ ] **Step 2: Full checks**

Run: `cd frontend && npm test && npx eslint src && npm run build`
Expected: all green, build succeeds.

- [ ] **Step 3: Screenshot review**

Read `docs/design-system.md` and the `saxodash-design-system` skill for the screenshot harness recipe. Start the stack with `scripts/dev.sh --no-worker --no-beat` (or against the worktree's own Vite), open `/research/chart`, and capture at 1440 and 390:
- two panes side by side with different symbols, Link panes off then on, after panning one;
- four panes with two empty, linked;
- hovering a day in one pane with a holiday gap in the other (dimmed guide);
- the rail with the Link panes button pressed and unpressed;
- a single-pane layout (no toggle, unchanged).

Fix anything that looks wrong, re-run Step 2.

- [ ] **Step 4: Update `docs/next-steps.md`**

Mark linked time range and linked crosshair done; leave the compare overlay listed as the remaining 5C slice.

- [ ] **Step 5: Learning record (only if something was surprising)**

If the date-versus-offset linking, or the stale stored offset on a follower, turned out subtler than expected, append `learning/learning-records/NNNN-linked-panes.md` (next free number). Skip it if the work was routine.

- [ ] **Step 6: Commit**

```bash
git add docs
git commit -m "docs: linked Research charts spec and next steps"
```

---

## Self-Review

**Spec coverage:** time range by date (Tasks 1, 3, 4, 5); leader/follower and any pane leading (Task 4); clamping and short histories (Task 1); range pick reset (Task 4); toggle-on alignment, toggle-off stays (Tasks 4, 5: `alignTo`, followers keep `followDates`); y-scale unlinked (Task 4 touches only the time view); crosshair store, nearest-bar-at-or-before, dimmed inexact, nothing outside window (Tasks 1, 6); persistence with `linked` default false (Task 2); toggle UI only in split layouts (Task 5); testing and screenshot harness (Tasks 1-7). Spec deltas are listed at the top and applied to the spec in Task 7.

**Placeholders:** none. The one soft spot is Task 5's page test, which reuses the seeding helpers already in `pages/ResearchChart.test.jsx` (`nvdaSlot`, `tslaSlot`, `renderPage` stand for them); the step says to define small local equivalents if the names differ.

**Type consistency:** `followDates` is `{ from, to } | null` everywhere; `commitTimeView(timeView, dates)` and `reportWindow(dates)` are the same in Tasks 4, 5 and the test fixtures; `matchBarByDate` returns `{ index, exact }` in Tasks 1 and 6; `linkable|linked|onLinkedChange` match between rail, page and tests.
