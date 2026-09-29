# Axis Panning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Research chart pan through the already-fetched history (drag body / time axis / horizontal wheel) and move the price window up and down (drag body), on both the Research page and `/research/chart`.

**Architecture:** The visible slice becomes a window `{start, end}` into the 1,200 fetched bars, derived from the range and an integer `timeOffset` (bars back from latest). Everything downstream still receives "the visible bars", so index `i` keeps meaning one bar across panes. Price panning is a `yShift` (fraction of the visible span) applied in `priceGeometry` after `yScale`. Both values live in memory in `useChartControls`.

**Tech Stack:** React 19 (JS), vitest + Testing Library (jsdom), hand-drawn SVG chart.

**Spec:** `docs/superpowers/specs/2026-09-29-axis-panning-design.md`

## Global Constraints

- Generated code carries zero comments (AGENTS.md "Code style"); existing comments are left untouched.
- Frontend only — no backend change, no migration, no extra Saxo calls.
- Pan only within the fetched bars (`WIDEST_RANGE_COUNT` = 1200).
- Bars stay daily or coarser; bar identity is unchanged.
- The price auto-fit stays computed from the visible bars only.
- A vertical wheel is never captured; the page must keep scrolling.
- Run frontend tests from `frontend/`: `npx vitest run <path>`.

## Review Focus

1. A stored offset larger than the new history allows (range change, shorter-history instrument) — the window must clamp, never slice past the start. Pinned in Task 1 (`visibleWindow` clamps) and Task 5 (`ChartCanvas` clamps the updater).
2. Dragging an existing price line must move the line, not pan. Pinned in Task 4.
3. A pan must not deselect a line nor place one while the tool is armed, yet the next still click must. Pinned in Task 4.
4. A history shorter than the range (new listing, ALL) cannot pan and never shows "Jump to latest". Pinned in Task 1 and Task 4.
5. A vertical wheel over the chart is not `preventDefault`ed. Pinned in Task 4.

---

### Task 1: Visible window and windowed indicators

**Files:**
- Modify: `frontend/src/lib/research.js` (`barsForRange`, new `visibleWindow`, `clampTimeOffset`)
- Modify: `frontend/src/lib/indicators.js` (new `computeIndicatorsForWindow`; `computeIndicatorsForRange` delegates)
- Test: `frontend/src/lib/research.test.js`, `frontend/src/lib/indicators.test.js`

**Interfaces:**
- Produces: `visibleWindow(total: number, range: string, timeOffset = 0) → { start, end, offset, maxOffset }`;
  `clampTimeOffset(value: number, maxOffset: number) → number`;
  `barsForRange(bars, range, timeOffset = 0)`;
  `computeIndicatorsForWindow(bars, { start, end }) → same shape as computeIndicators`.

- [ ] **Step 1: Write the failing tests**

Append to `research.test.js` (add `visibleWindow`, `clampTimeOffset` to its import from `./research`):

```js
describe('visibleWindow', () => {
  it('shows the newest bars when not panned', () => {
    expect(visibleWindow(1200, '1M', 0)).toEqual({ start: 1178, end: 1200, offset: 0, maxOffset: 1178 })
  })

  it('moves the window back by the offset', () => {
    expect(visibleWindow(1200, '1M', 100)).toMatchObject({ start: 1078, end: 1100, offset: 100 })
  })

  it('stops at the oldest bar', () => {
    expect(visibleWindow(1200, '1M', 5000)).toMatchObject({ start: 0, end: 22, offset: 1178 })
  })

  it('never pans into the future', () => {
    expect(visibleWindow(1200, '1M', -3)).toMatchObject({ start: 1178, end: 1200, offset: 0 })
  })

  it('cannot pan when the range already shows everything', () => {
    expect(visibleWindow(1200, 'ALL', 40)).toEqual({ start: 0, end: 1200, offset: 0, maxOffset: 0 })
    expect(visibleWindow(10, '1M', 4)).toEqual({ start: 0, end: 10, offset: 0, maxOffset: 0 })
  })

  it('survives no bars', () => {
    expect(visibleWindow(0, '1M', 3)).toEqual({ start: 0, end: 0, offset: 0, maxOffset: 0 })
  })
})

describe('clampTimeOffset', () => {
  it('keeps an offset between latest and the oldest bar', () => {
    expect(clampTimeOffset(-2, 10)).toBe(0)
    expect(clampTimeOffset(4, 10)).toBe(4)
    expect(clampTimeOffset(40, 10)).toBe(10)
  })
})
```

And inside the existing `describe('barsForRange', …)`:

```js
  it('slices the panned window when given an offset', () => {
    const week = barsForRange(many, '1W', 7)

    expect(week).toHaveLength(RANGE_COUNTS['1W'])
    expect(week[week.length - 1]).toBe(many[many.length - 8])
  })
```

Append to `indicators.test.js` (add `computeIndicatorsForWindow` to the import):

```js
describe('computeIndicatorsForWindow', () => {
  const bars = Array.from({ length: 120 }, (_, i) => ({
    high: 102 + i + (i % 3),
    low: 98 + i,
    close: 100 + i + (i % 5),
    volume: 1000 + (i % 7) * 100,
  }))
  const window = { start: 50, end: 72 }

  it('lines a panned window up with the full-history values', () => {
    const panned = computeIndicatorsForWindow(bars, window)
    const full = computeIndicators(bars)

    expect(panned.ma50).toEqual(full.ma50.slice(50, 72))
    expect(panned.ema9).toEqual(full.ema9.slice(50, 72))
    expect(panned.rsi).toEqual(full.rsi.slice(50, 72))
    expect(panned.macd.hist).toEqual(full.macd.hist.slice(50, 72))
    expect(panned.bb.lo).toEqual(full.bb.lo.slice(50, 72))
    expect(panned.rvol).toEqual(full.rvol.slice(50, 72))
  })

  it('restarts VWAP at the first visible bar', () => {
    expect(computeIndicatorsForWindow(bars, window).vwap).toEqual(computeIndicators(bars.slice(50, 72)).vwap)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/research.test.js src/lib/indicators.test.js`
Expected: FAIL — `visibleWindow` / `clampTimeOffset` / `computeIndicatorsForWindow` are not functions.

- [ ] **Step 3: Implement**

`research.js` — replace the body of `barsForRange` (keep its existing doc comment) and add the helpers after it:

```js
export function barsForRange(bars = [], range, timeOffset = 0) {
  const { start, end } = visibleWindow(bars.length, range, timeOffset)
  return start === 0 && end === bars.length ? bars : bars.slice(start, end)
}

export function visibleWindow(total, range, timeOffset = 0) {
  const count = Math.min(total, RANGE_COUNTS[range] ?? WIDEST_RANGE_COUNT)
  const maxOffset = total - count
  const offset = clampTimeOffset(Math.round(timeOffset) || 0, maxOffset)
  return { start: maxOffset - offset, end: total - offset, offset, maxOffset }
}

export function clampTimeOffset(value, maxOffset) {
  return Math.min(maxOffset, Math.max(0, value))
}
```

`indicators.js` — replace the body of `computeIndicatorsForRange` (keep its doc comment) and add the window version below it:

```js
export function computeIndicatorsForRange(bars, count) {
  const shown = count == null ? bars.length : Math.min(count, bars.length)
  return computeIndicatorsForWindow(bars, { start: bars.length - shown, end: bars.length })
}

export function computeIndicatorsForWindow(bars, { start, end }) {
  const closes = bars.map((bar) => bar.close)
  const cut = (series) => series.slice(start, end)
  const cutEach = (group) => Object.fromEntries(Object.entries(group).map(([key, series]) => [key, cut(series)]))

  return {
    ma20: cut(sma(closes, 20)),
    ma50: cut(sma(closes, 50)),
    ma200: cut(sma(closes, 200)),
    ema9: cut(ema(closes, 9)),
    bb: cutEach(bollinger(closes)),
    rsi: cut(rsi(closes)),
    macd: cutEach(macd(closes)),
    vwap: vwapSeries(bars.slice(start, end)),
    rvol: cut(relativeVolume(bars)),
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/research.test.js src/lib/indicators.test.js`
Expected: PASS (old `computeIndicatorsForRange` and `barsForRange` tests included).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/research.js frontend/src/lib/research.test.js frontend/src/lib/indicators.js frontend/src/lib/indicators.test.js
git commit -m "feat: slice the chart and its indicators to a pannable window"
```

---

### Task 2: Pan geometry and time labels

**Files:**
- Modify: `frontend/src/lib/chartGeometry.js`
- Test: `frontend/src/lib/chartGeometry.test.js`

**Interfaces:**
- Produces: `priceGeometry({ …, yShift = 0 })`; `MAX_Y_SHIFT = 5`;
  `shiftFromDrag(startShift, dy, chartH) → number`; `barsFromDrag(dx, slot) → integer`;
  `timeLabelStyle(bars, now = new Date()) → 'day' | 'month'`; `formatTimeLabel(date, style) → string`.

- [ ] **Step 1: Write the failing tests** (add the new names to the import)

```js
describe('price panning', () => {
  it('moves the price window without changing its span', () => {
    const still = geometry()
    const moved = geometry({ yShift: 0.25 })
    const span = still.top - still.bottom

    expect(moved.top - moved.bottom).toBeCloseTo(span)
    expect(moved.top).toBeCloseTo(still.top + span * 0.25)
    expect(moved.bottom).toBeCloseTo(still.bottom + span * 0.25)
  })

  it('pans on top of the zoomed scale', () => {
    const zoomed = geometry({ yScale: 2 })
    const both = geometry({ yScale: 2, yShift: -0.5 })

    expect(both.top).toBeCloseTo(zoomed.top - (zoomed.top - zoomed.bottom) * 0.5)
  })

  it('turns a vertical drag into a fraction of the plot height', () => {
    expect(shiftFromDrag(0, 86, 344)).toBeCloseTo(0.25)
    expect(shiftFromDrag(0.5, -172, 344)).toBeCloseTo(0)
  })

  it('bounds the shift so the bars cannot be lost for good', () => {
    expect(shiftFromDrag(0, 1e6, 344)).toBe(MAX_Y_SHIFT)
    expect(shiftFromDrag(0, -1e6, 344)).toBe(-MAX_Y_SHIFT)
  })

  it('turns a horizontal drag into whole bars', () => {
    expect(barsFromDrag(70, 23.27)).toBe(3)
    expect(barsFromDrag(-70, 23.27)).toBe(-3)
    expect(Object.is(barsFromDrag(-5, 23.27), 0)).toBe(true)
  })
})

describe('time labels', () => {
  const now = new Date('2026-09-29')
  const days = (from, to) => [{ date: from }, { date: to }]

  it('uses day labels for a short window in the current year', () => {
    expect(timeLabelStyle(days('2026-08-01', '2026-09-28'), now)).toBe('day')
  })

  it('uses month-year labels once the window spans more than half a year', () => {
    expect(timeLabelStyle(days('2025-09-01', '2026-09-28'), now)).toBe('month')
  })

  it('uses month-year labels for a window panned into an earlier year', () => {
    expect(timeLabelStyle(days('2024-03-01', '2024-04-01'), now)).toBe('month')
  })

  it('formats each style', () => {
    expect(formatTimeLabel('2024-03-12', 'day')).toBe('12 Mar')
    expect(formatTimeLabel('2024-03-12', 'month')).toBe('Mar 24')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/chartGeometry.test.js`
Expected: FAIL — new exports undefined; `yShift` ignored.

- [ ] **Step 3: Implement**

In `chartGeometry.js`, next to `scaleFromDrag`:

```js
export const MAX_Y_SHIFT = 5

export function shiftFromDrag(startShift, dy, chartH) {
  return Math.min(MAX_Y_SHIFT, Math.max(-MAX_Y_SHIFT, startShift + dy / Math.max(1, chartH)))
}

export function barsFromDrag(dx, slot) {
  return Math.round(dx / slot) || 0
}

const HALF_YEAR_MS = 183 * 86_400_000

export function timeLabelStyle(bars, now = new Date()) {
  if (bars.length === 0) return 'day'
  const first = new Date(bars[0].date)
  const last = new Date(bars[bars.length - 1].date)
  return last - first > HALF_YEAR_MS || last.getFullYear() !== now.getFullYear() ? 'month' : 'day'
}

export function formatTimeLabel(date, style) {
  const options = style === 'month' ? { month: 'short', year: '2-digit' } : { day: '2-digit', month: 'short' }
  return new Date(date).toLocaleDateString('en-GB', options)
}
```

In `priceGeometry`, add `yShift = 0` to the destructured params and replace the `top`/`bottom` lines:

```js
  const offset = 2 * half * yShift
  const top = mid + half + offset
  const bottom = mid - half + offset
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/chartGeometry.test.js`
Expected: PASS. If `formatTimeLabel(…, 'month')` yields `Mar 2024`/`Mar '24` under this Node's ICU, build the string from `month: 'short'` plus `String(year).slice(-2)` instead and rerun.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/chartGeometry.js frontend/src/lib/chartGeometry.test.js
git commit -m "feat: add price-shift and drag-to-bars geometry for chart panning"
```

---

### Task 3: Pan state in controls, windowed chart data, page wiring

**Files:**
- Modify: `frontend/src/components/research/useChartControls.js`
- Modify: `frontend/src/components/research/useChartData.js`
- Modify: `frontend/src/pages/Research.jsx`, `frontend/src/pages/ResearchChart.jsx`, `frontend/src/components/research/ChartPanel.jsx`
- Test: `frontend/src/components/research/useChartControls.test.js`

**Interfaces:**
- Consumes: `visibleWindow` (Task 1), `computeIndicatorsForWindow` (Task 1).
- Produces: controls gain `timeOffset`, `setTimeOffset`, `yShift`, `setYShift`, `resetView()`; `setRange` also zeroes `timeOffset` and `yShift`.
  `useChartData({ symbol, instrument, range, timeOffset })` also returns `maxTimeOffset`.
  `ChartPanel` forwards a `maxTimeOffset` prop to `ChartCanvas`; `ResearchChart` passes it to `ChartCanvas` directly.

- [ ] **Step 1: Write the failing tests** (append to `useChartControls.test.js`)

```js
  it('starts unpanned and keeps the pan in memory only', () => {
    const { result } = renderHook(() => useChartControls())
    expect(result.current.timeOffset).toBe(0)
    expect(result.current.yShift).toBe(0)

    act(() => result.current.setTimeOffset(12))
    act(() => result.current.setYShift(0.3))
    expect(stored() ?? {}).not.toHaveProperty('timeOffset')
    expect(stored() ?? {}).not.toHaveProperty('yShift')
  })

  it('snaps back to the latest bars when a range is picked', () => {
    const { result } = renderHook(() => useChartControls())
    act(() => result.current.setTimeOffset(12))
    act(() => result.current.setYShift(0.3))
    act(() => result.current.setRange('6M'))

    expect(result.current.timeOffset).toBe(0)
    expect(result.current.yShift).toBe(0)
  })

  it('resets zoom and pan together for a new symbol', () => {
    const { result } = renderHook(() => useChartControls())
    act(() => result.current.setYScale(3))
    act(() => result.current.setTimeOffset(12))
    act(() => result.current.setYShift(0.3))
    act(() => result.current.resetView())

    expect(result.current).toMatchObject({ yScale: 1, timeOffset: 0, yShift: 0 })
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/research/useChartControls.test.js`
Expected: FAIL — `timeOffset` undefined.

- [ ] **Step 3: Implement**

`useChartControls.js`:

```js
export function useChartControls() {
  const [prefs, setPrefs] = useState(readChartPrefs)
  const [yScale, setYScale] = useState(1)
  const [yShift, setYShift] = useState(0)
  const [timeOffset, setTimeOffset] = useState(0)

  useEffect(() => {
    writeChartPrefs(prefs)
  }, [prefs])

  return {
    ...prefs,
    yScale,
    setYScale,
    yShift,
    setYShift,
    timeOffset,
    setTimeOffset,
    resetView: () => {
      setYScale(1)
      setYShift(0)
      setTimeOffset(0)
    },
    setRange: (next) => {
      setPrefs((p) => ({ ...p, range: next }))
      setTimeOffset(0)
      setYShift(0)
    },
    setType: (next) => setPrefs((p) => ({ ...p, type: next })),
    toggleOverlay: (key) => setPrefs((p) => ({ ...p, overlays: { ...p.overlays, [key]: !p.overlays[key] } })),
    togglePane: (key) => setPrefs((p) => ({ ...p, panes: { ...p.panes, [key]: !p.panes[key] } })),
  }
}
```

`useChartData.js` — imports become `computeIndicatorsForWindow` and `visibleWindow` (drop `barsForRange`, `computeIndicatorsForRange`); signature gains `timeOffset = 0`; replace the `bars` / `ind` memos (keep the existing comments above them):

```js
  const view = useMemo(() => visibleWindow(allBars.length, range, timeOffset), [allBars.length, range, timeOffset])
  const bars = useMemo(() => allBars.slice(view.start, view.end), [allBars, view.start, view.end])
  const ind = useMemo(
    () => computeIndicatorsForWindow(allBars, { start: view.start, end: view.end }),
    [allBars, view.start, view.end],
  )
```

and return `maxTimeOffset: view.maxOffset` alongside the rest.

`Research.jsx` and `ResearchChart.jsx`: replace `controls.setYScale(1)` in the symbol-change block with `controls.resetView()`; pass `timeOffset: controls.timeOffset` to `useChartData`; destructure `maxTimeOffset`; pass `maxTimeOffset={maxTimeOffset}` to `ChartPanel` (Research) / `ChartCanvas` (ResearchChart). `ChartPanel.jsx`: accept `maxTimeOffset` and forward it to `ChartCanvas`.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/research src/pages src/lib`
Expected: PASS (page tests unaffected — `maxTimeOffset` is unused until Task 5).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/research/useChartControls.js frontend/src/components/research/useChartControls.test.js frontend/src/components/research/useChartData.js frontend/src/components/research/ChartPanel.jsx frontend/src/pages/Research.jsx frontend/src/pages/ResearchChart.jsx
git commit -m "feat: hold the chart's pan in its controls and slice data to it"
```

---

### Task 4: Pan gestures on the price pane

**Files:**
- Create: `frontend/src/components/research/usePointerDrag.js`
- Modify: `frontend/src/components/research/TVChart.jsx`
- Test: `frontend/src/components/research/TVChart.test.jsx`

**Interfaces:**
- Consumes: `shiftFromDrag`, `barsFromDrag`, `DRAG_THRESHOLD` (Task 2); `priceGeometry` `yShift`.
- Produces: `usePointerDrag({ onStart(event) → context | null, onDrag({ dx, dy, context }) }) → { handlers, dragging, consumeMoved() }`.
  `TVChart` new props: `yShift = 0`, `onYShiftChange`, `timeOffset = 0`, `onTimeOffsetChange(next | (current) => next)`, `onPriceScaleReset`.

- [ ] **Step 1: Write the failing tests** (append to `TVChart.test.jsx`; `plot` is `container.firstChild`)

```js
describe('panning', () => {
  const slot = (760 - 62) / bars.length
  const chartH = 360 - 10 - 6
  const pannable = (props = {}) =>
    renderChart({ onTimeOffsetChange: vi.fn(), onYShiftChange: vi.fn(), ...props })

  const pan = (element, dx, dy) => {
    fireEvent.pointerDown(element, { clientX: 300, clientY: 200, pointerId: 1 })
    fireEvent.pointerMove(element, { clientX: 300 + dx, clientY: 200 + dy, pointerId: 1 })
    fireEvent.pointerUp(element, { clientX: 300 + dx, clientY: 200 + dy, pointerId: 1 })
  }

  it('goes back in time when the plot is dragged right', () => {
    const onTimeOffsetChange = vi.fn()
    const { container } = pannable({ timeOffset: 4, onTimeOffsetChange })

    pan(container.firstChild, slot * 3, 0)

    expect(onTimeOffsetChange).toHaveBeenLastCalledWith(7)
  })

  it('moves the price window with a vertical drag', () => {
    const onYShiftChange = vi.fn()
    const { container } = pannable({ yShift: 0.1, onYShiftChange })

    pan(container.firstChild, 0, chartH / 4)

    expect(onYShiftChange.mock.calls.at(-1)[0]).toBeCloseTo(0.35)
  })

  it('ignores a jitter smaller than the drag threshold', () => {
    const onTimeOffsetChange = vi.fn()
    const { container } = pannable({ onTimeOffsetChange })

    pan(container.firstChild, 2, 0)

    expect(onTimeOffsetChange).not.toHaveBeenCalled()
  })

  it('neither places a line nor clears the selection after a pan, but the next click does', () => {
    const onCreateLine = vi.fn()
    const { container } = pannable({ lines: [], onCreateLine, placingLine: true, onPlaced: vi.fn() })
    const plot = container.firstChild

    pan(plot, 60, 0)
    fireEvent.mouseDown(plot, { detail: 1 })
    fireEvent.click(plot, { detail: 1, clientX: 360, clientY: 200 })
    expect(onCreateLine).not.toHaveBeenCalled()

    fireEvent.pointerDown(plot, { clientX: 100, clientY: 200, pointerId: 1 })
    fireEvent.pointerUp(plot, { clientX: 100, clientY: 200, pointerId: 1 })
    fireEvent.mouseDown(plot, { detail: 1 })
    fireEvent.click(plot, { detail: 1, clientX: 100, clientY: 200 })
    expect(onCreateLine).toHaveBeenCalledTimes(1)
  })

  it('moves a dragged line instead of panning', () => {
    const onTimeOffsetChange = vi.fn()
    const onYShiftChange = vi.fn()
    const onMoveLine = vi.fn()
    const free = { id: 7, kind: 'free', price: 115 }
    const { container } = pannable({ lines: [free], onMoveLine, onTimeOffsetChange, onYShiftChange })

    const handle = container.querySelector('[data-testid="price-line-7"]')
    fireEvent.pointerDown(handle, { clientX: 200, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 260, clientY: 140, pointerId: 1 })
    fireEvent.pointerUp(handle, { clientX: 260, clientY: 140, pointerId: 1 })

    expect(onMoveLine).toHaveBeenCalled()
    expect(onTimeOffsetChange).not.toHaveBeenCalled()
    expect(onYShiftChange).not.toHaveBeenCalled()
  })

  it('does not pan from the price-axis gutter', () => {
    const onTimeOffsetChange = vi.fn()
    const onYShiftChange = vi.fn()
    const { getByTestId } = pannable({ onTimeOffsetChange, onYShiftChange, onYScaleChange: vi.fn() })

    pan(getByTestId('price-scale'), 40, 40)

    expect(onTimeOffsetChange).not.toHaveBeenCalled()
    expect(onYShiftChange).not.toHaveBeenCalled()
  })

  it('resets zoom and shift together on a double-click of the axis', () => {
    const onPriceScaleReset = vi.fn()
    const onYScaleChange = vi.fn()
    const { getByTestId } = pannable({ onYScaleChange, onPriceScaleReset, yShift: 0.4 })

    fireEvent.doubleClick(getByTestId('price-scale'))

    expect(onPriceScaleReset).toHaveBeenCalledTimes(1)
    expect(onYScaleChange).not.toHaveBeenCalled()
  })

  it('pans through time on a horizontal wheel and keeps the page from navigating', () => {
    const onTimeOffsetChange = vi.fn()
    const { container } = pannable({ onTimeOffsetChange })

    const allowed = fireEvent.wheel(container.firstChild, { deltaX: slot * 2, deltaY: 0 })

    expect(allowed).toBe(false)
    const update = onTimeOffsetChange.mock.calls.at(-1)[0]
    expect(update(10)).toBe(8)
  })

  it('leaves a vertical wheel to scroll the page', () => {
    const onTimeOffsetChange = vi.fn()
    const { container } = pannable({ onTimeOffsetChange })

    const allowed = fireEvent.wheel(container.firstChild, { deltaX: 0, deltaY: 120 })

    expect(allowed).toBe(true)
    expect(onTimeOffsetChange).not.toHaveBeenCalled()
  })

  it('offers a way back to the latest bars only while panned', () => {
    const onTimeOffsetChange = vi.fn()
    const { queryByRole, rerender } = pannable({ onTimeOffsetChange, timeOffset: 0 })
    expect(queryByRole('button', { name: 'Jump to latest' })).toBeNull()

    rerender(chart({ onTimeOffsetChange, onYShiftChange: vi.fn(), timeOffset: 5 }))
    fireEvent.click(queryByRole('button', { name: 'Jump to latest' }))

    expect(onTimeOffsetChange).toHaveBeenCalledWith(0)
  })
})
```

Before writing the line test, check `PriceLines.jsx` for the line's real `data-testid` and use that selector.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/research/TVChart.test.jsx`
Expected: the new `panning` tests FAIL; the existing ones still PASS.

- [ ] **Step 3: Implement `usePointerDrag.js`**

```js
import { useRef, useState } from 'react'

import { DRAG_THRESHOLD } from '../../lib/chartGeometry'

export function usePointerDrag({ onStart, onDrag }) {
  const drag = useRef(null)
  const moved = useRef(false)
  const [dragging, setDragging] = useState(false)

  const end = () => {
    drag.current = null
    setDragging(false)
  }

  const handlers = {
    onPointerDown: (event) => {
      moved.current = false
      if (event.button !== 0) return
      const context = onStart(event)
      if (context == null) return
      drag.current = { x: event.clientX, y: event.clientY, context, active: false }
    },
    onPointerMove: (event) => {
      const current = drag.current
      if (!current) return
      const dx = event.clientX - current.x
      const dy = event.clientY - current.y
      if (!current.active) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
        current.active = true
        moved.current = true
        setDragging(true)
        event.currentTarget.setPointerCapture?.(event.pointerId)
      }
      onDrag({ dx, dy, context: current.context })
    },
    onPointerUp: end,
    onPointerCancel: end,
  }

  const consumeMoved = () => {
    const was = moved.current
    moved.current = false
    return was
  }

  return { handlers, dragging, consumeMoved }
}
```

- [ ] **Step 4: Implement in `TVChart.jsx`**

1. Imports: add `useLayoutEffect`; add `barsFromDrag`, `shiftFromDrag` from `chartGeometry`; `import { ChevronsRight } from 'lucide-react'`; `import { usePointerDrag } from './usePointerDrag'`.
2. `ScaleHandle` gains `onReset`, marks itself `data-no-pan`, and its double-click becomes:

```js
      onDoubleClick={(e) => {
        e.stopPropagation()
        if (onReset) onReset()
        else if (onChange) onChange(1)
      }}
```

   and `if (!onChange && !onClickAt && !onReset) return null`.
3. `TVChart` props gain `yShift = 0, onYShiftChange, timeOffset = 0, onTimeOffsetChange, onPriceScaleReset`. `priceGeometry` gets `yShift`, and `yShift` joins the memo deps.
4. Before the `if (data.length === 0) return null`, add:

```js
  const canPan = Boolean(onTimeOffsetChange || onYShiftChange)
  const pan = usePointerDrag({
    onStart: (event) => {
      if (!canPan || isTypingTarget(event.target) || event.target.closest?.('[data-no-pan]')) return null
      const x = event.clientX - event.currentTarget.getBoundingClientRect().left
      return x < width - PAD_R ? { offset: timeOffset, shift: yShift } : null
    },
    onDrag: ({ dx, dy, context }) => {
      onTimeOffsetChange?.(context.offset + barsFromDrag(dx, geometry.slot))
      onYShiftChange?.(shiftFromDrag(context.shift, dy, geometry.chartH))
    },
  })

  const wheelTarget = useRef({ slot: geometry.slot, onTimeOffsetChange })
  useLayoutEffect(() => {
    wheelTarget.current = { slot: geometry.slot, onTimeOffsetChange }
  })

  const hasData = data.length > 0
  useEffect(() => {
    const element = ref.current
    if (!element) return undefined
    let carry = 0
    const onWheel = (event) => {
      const { slot, onTimeOffsetChange: change } = wheelTarget.current
      if (!change || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return
      event.preventDefault()
      carry += event.deltaX
      const steps = Math.trunc(carry / slot)
      if (steps === 0) return
      carry -= steps * slot
      change((current) => current - steps)
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [ref, hasData])
```

5. The wrapper `<div>`: spread `{...pan.handlers}`; cursor becomes `pan.dragging ? 'grabbing' : placingLine ? 'crosshair' : undefined`; the first line of `onClick` becomes `if (pan.consumeMoved()) return`.
6. Pass `onReset={onPriceScaleReset}` to `ScaleHandle`.
7. After the `PriceEditor` block, inside the wrapper:

```jsx
      {timeOffset > 0 && onTimeOffsetChange ? (
        <button
          type="button"
          data-no-pan
          aria-label="Jump to latest"
          title="Jump to latest"
          className="absolute bottom-2 flex h-6 w-6 items-center justify-center rounded border border-white/10 bg-zinc-900/90 text-zinc-300 hover:text-white"
          style={{ right: PAD_R + 8 }}
          onClick={(e) => {
            e.stopPropagation()
            onTimeOffsetChange(0)
          }}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <ChevronsRight size={14} aria-hidden="true" />
        </button>
      ) : null}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/components/research/TVChart.test.jsx`
Expected: PASS, the whole file. If a React hooks lint rule flags the ref write, it is inside `useLayoutEffect` already; run `npx eslint src/components/research` to confirm clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/research/usePointerDrag.js frontend/src/components/research/TVChart.jsx frontend/src/components/research/TVChart.test.jsx
git commit -m "feat: pan the research chart by dragging the plot or swiping sideways"
```

---

### Task 5: Draggable time axis, year-aware labels, ChartCanvas wiring

**Files:**
- Modify: `frontend/src/components/research/panes.jsx` (`TimeAxis`)
- Modify: `frontend/src/components/research/ChartCanvas.jsx`
- Test: `frontend/src/components/research/ChartCanvas.test.jsx` (and the panes test file if one exists)

**Interfaces:**
- Consumes: `usePointerDrag` (Task 4); `barsFromDrag`, `timeLabelStyle`, `formatTimeLabel` (Task 2); `clampTimeOffset` (Task 1); controls from Task 3; `maxTimeOffset` prop from Task 3.
- Produces: `TimeAxis({ data, timeOffset = 0, onTimeOffsetChange })` with `data-testid="time-axis"`; `ChartCanvas` prop `maxTimeOffset = 0`.

- [ ] **Step 1: Write the failing tests** (in `ChartCanvas.test.jsx`, reusing its bar fixture and render helper; the controls stub needs the new setters)

```js
describe('panning', () => {
  const pannableControls = (overrides = {}) => ({
    ...controls,
    yScale: 1,
    setYScale: vi.fn(),
    yShift: 0,
    setYShift: vi.fn(),
    timeOffset: 0,
    setTimeOffset: vi.fn(),
    ...overrides,
  })

  it('pans through time when the time axis is dragged, never past the oldest bar', () => {
    const setTimeOffset = vi.fn()
    const { getByTestId } = renderCanvas({ controls: pannableControls({ setTimeOffset }), maxTimeOffset: 2 })

    const axis = getByTestId('time-axis')
    fireEvent.pointerDown(axis, { clientX: 100, clientY: 5, pointerId: 1 })
    fireEvent.pointerMove(axis, { clientX: 400, clientY: 5, pointerId: 1 })
    fireEvent.pointerUp(axis, { clientX: 400, clientY: 5, pointerId: 1 })

    const update = setTimeOffset.mock.calls.at(-1)[0]
    expect(update(0)).toBe(2)
  })

  it('returns to the latest bars on a double-click of the time axis', () => {
    const setTimeOffset = vi.fn()
    const { getByTestId } = renderCanvas({
      controls: pannableControls({ setTimeOffset, timeOffset: 3 }),
      maxTimeOffset: 10,
    })

    fireEvent.doubleClick(getByTestId('time-axis'))

    expect(setTimeOffset.mock.calls.at(-1)[0](3)).toBe(0)
  })

  it('resets zoom and shift from the price axis', () => {
    const setYScale = vi.fn()
    const setYShift = vi.fn()
    const { getByTestId } = renderCanvas({
      controls: pannableControls({ setYScale, setYShift, yScale: 3, yShift: 0.4 }),
    })

    fireEvent.doubleClick(getByTestId('price-scale'))

    expect(setYScale).toHaveBeenCalledWith(1)
    expect(setYShift).toHaveBeenCalledWith(0)
  })
})
```

Adapt `renderCanvas` / `controls` to the names the file already uses; read its top first.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/research/ChartCanvas.test.jsx`
Expected: FAIL — no `time-axis` test id; the price axis still calls `setYScale` only.

- [ ] **Step 3: Implement `TimeAxis`** (`panes.jsx`)

```jsx
export function TimeAxis({ data, timeOffset = 0, onTimeOffsetChange }) {
  const [ref, width] = useWidth()
  const { chartW, xAt, slot } = paneGeometry(width, data.length)
  const drag = usePointerDrag({
    onStart: () => (onTimeOffsetChange ? { offset: timeOffset } : null),
    onDrag: ({ dx, context }) => onTimeOffsetChange(context.offset + barsFromDrag(dx, slot)),
  })
  const count = Math.min(7, data.length)

  if (data.length === 0) return null

  const style = timeLabelStyle(data)
  const indexes =
    count === 1
      ? [0]
      : Array.from({ length: count }, (_, i) => Math.floor(((data.length - 1) * i) / (count - 1)))
  const cursor = onTimeOffsetChange ? (drag.dragging ? 'grabbing' : 'ew-resize') : undefined

  return (
    <div
      ref={ref}
      data-testid="time-axis"
      className="w-full border-t border-white/[0.06] select-none"
      style={{ height: 22, cursor }}
      {...drag.handlers}
      onDoubleClick={() => onTimeOffsetChange?.(0)}
    >
      <svg width={width} height={22}>
        {indexes.map((i) => (
          <text
            key={i}
            x={Math.min(chartW - 24, Math.max(20, xAt(i)))}
            y={14}
            fill={AXIS_TEXT}
            fontSize="10"
            textAnchor="middle"
            fontFamily={MONO_FONT}
          >
            {formatTimeLabel(data[i].date, style)}
          </text>
        ))}
      </svg>
    </div>
  )
}
```

Import `barsFromDrag`, `formatTimeLabel`, `timeLabelStyle` from `../../lib/chartGeometry` and `usePointerDrag` from `./usePointerDrag`.

- [ ] **Step 4: Wire `ChartCanvas`**

Add `maxTimeOffset = 0` to its props and `import { clampTimeOffset } from '../../lib/research'` (merge into the existing `barChange` import). Then:

```js
  const { type, overlays, panes, yScale, setYScale, yShift, setYShift, timeOffset, setTimeOffset } = controls
  const panTime = setTimeOffset
    ? (next) =>
        setTimeOffset((current) => clampTimeOffset(typeof next === 'function' ? next(current) : next, maxTimeOffset))
    : undefined
  const resetPriceScale = setYScale
    ? () => {
        setYScale(1)
        setYShift?.(0)
      }
    : undefined
```

Pass to `TVChart`: `yShift={yShift}`, `onYShiftChange={setYShift}`, `timeOffset={timeOffset}`, `onTimeOffsetChange={panTime}`, `onPriceScaleReset={resetPriceScale}`. Change the axis to `<TimeAxis data={bars} timeOffset={timeOffset} onTimeOffsetChange={panTime} />`.

- [ ] **Step 5: Run to verify pass, then the whole frontend suite and lint**

Run: `npx vitest run` then `npx eslint src`
Expected: all PASS, lint clean. Any failing label assertion elsewhere is the new year-aware format — update it to the label the fixture's dates now produce.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/research/panes.jsx frontend/src/components/research/ChartCanvas.jsx frontend/src/components/research/ChartCanvas.test.jsx
git commit -m "feat: drag the time axis to pan and label panned history with its year"
```

---

### Task 6: Browser verification and docs

**Files:**
- Modify: `docs/next-steps.md`, `AGENTS.md`
- Create (if anything surprised): `learning/learning-records/NNNN-<slug>.md`

- [ ] **Step 1: Run the app from the worktree** (its own ports so the other checkout's stack is untouched): `WEB_PORT=8010 UI_PORT=5183 scripts/dev.sh --reclaim` — or, if the main checkout's backend is already up, just `npx vite --port 5183` in `frontend/` pointed at it.
- [ ] **Step 2: Manual pass on `/research` and `/research/chart`** with target/stop and a freeform line present, MA50 + BB + Volume + RSI + MACD on:
  body drag both ways; time-axis drag; trackpad sideways swipe (no Back navigation); vertical wheel scrolls the page; "Jump to latest" appears and works; double-click each axis; range pill snaps back; line drag, armed-tool click and double-click-to-create all still work; symbol switch resets. Screenshot via the `saxodash-design-system` harness.
- [ ] **Step 3: Docs** — `docs/next-steps.md` §3 becomes "Done 2026-09-29 — spec `docs/superpowers/specs/2026-09-29-axis-panning-design.md`", with smooth sub-bar panning and older-history paging listed as follow-ups. Add to AGENTS.md "Decided":

```markdown
**The chart pans within what it already fetched.** The visible bars are a window
`{start, end}` into the one 1,200-bar fetch (`lib/research.js::visibleWindow`),
from the range and an integer `timeOffset` back from the latest bar; indicators
are computed over everything and cut to that window, VWAP restarts at its start.
The price pan is a `yShift` applied after `yScale`, so the auto-fit is still the
visible bars'. Only a horizontal wheel is captured - a vertical one belongs to the page.
```

- [ ] **Step 4: Commit**

```bash
git add docs/next-steps.md AGENTS.md
git commit -m "docs: record the chart panning decision"
```
