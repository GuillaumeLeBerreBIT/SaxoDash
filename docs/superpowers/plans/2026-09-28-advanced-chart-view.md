# Advanced Chart View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An expand button on the Research chart opens `/research/chart`, a full-bleed TradingView-lite workspace: slim tool rail on the left, a chart that fills the window, instrument search and watchlists on the right.

**Architecture:** Chart data loading and instrument resolution move out of `Research.jsx` into three hooks both pages share; `ChartPanel` is split so its canvas (legend + price pane + lower panes + time axis) can be arranged by either page. Chart preferences (range, type, overlays, panes) become one localStorage-backed preference both views read and write. `TVChart` gains an opt-in one-shot "place a horizontal line" mode driven by the new tool rail.

**Tech Stack:** React 19 (JavaScript, no TS), React Router 7, TanStack Query 5, Tailwind 4, lucide-react, vitest + Testing Library. Frontend only — no backend change, no migration.

**Spec:** `docs/superpowers/specs/2026-09-28-advanced-chart-view-design.md`

**Branch:** work on `feat/advanced-chart-view` off `main` (create it before Task 1).

## Global Constraints

- **Zero comments in new code** (AGENTS.md "Code style"). Code moved verbatim from one file to another keeps the comments it already had; no new comments are written anywhere. Tool directives (`// eslint-disable-next-line`) are the only exception.
- JavaScript + JSX only; no new npm dependencies.
- All commands run from `frontend/`: tests `npx vitest run <path>`, full suite `npx vitest run`, lint `npx eslint .`. Baseline before Task 1: **73 files / 607 tests passing, lint clean**. Every task ends with the full suite and lint green.
- Research must look and behave exactly as before apart from the new expand button (spec: "Research looks and behaves the same, plus the expand button").
- Frontend visual work follows `docs/design-system.md` and the `saxodash-design-system` skill (colour tokens, `Card`, `TBtn`, `Menu` primitives, `text-[var(--fig-*)]` type scale).
- localStorage key for chart prefs is exactly `saxodash:chart-prefs`; `yScale` is never persisted.
- Route is exactly `/research/chart`, with the same `symbol` / `uic` / `assetType` params as `/research`.
- Commit after every task with a conventional-commit message (`feat:`, `refactor:`, `test:`, `docs:`).

## Deviations from the spec (deliberate, decided while planning)

- `chartOptions.js` lives in `lib/`, not `components/research/`: `lib/chartPrefs.js` validates against `CHART_TYPES`, and a `lib` module must not import from `components`.
- `WatchlistRail` gets one `fill` boolean instead of two cap props: the only caller that needs different caps wants "no cap, take the height", and `fill` says that directly.
- `ChartCanvas` takes `priceHeight` (the price pane alone), not a whole-canvas height; the big view derives it with the pure `pricePaneHeight()` helper. Research keeps passing a fixed 390, so the two modes never mix inside the component.

## Review Focus

1. **Switching symbol while the line tool is armed** — a person arms "Horizontal line", then clicks a watchlist row; the new chart must not place a line on their next click. Pinned in Task 7 (`disarms the line tool when the symbol changes`).
2. **An instrument that cannot take lines** (unresolved symbol → `priceLines.create` is `undefined`) — the line tool is disabled, never armed into a no-op. Pinned in Task 5 (`disables the line tool when lines cannot be created`).
3. **Round trip of an ambiguous ticker** — `NOW` pinned to ServiceNow's uic on Research must still be ServiceNow after expand and after collapse. Pinned in Task 3 (expand href carries uic/assetType) and Task 7 (back href carries uic/assetType).
4. **A short window with every lower pane on** — the price pane must stay readable (≥240px) rather than collapse to zero or negative height. Pinned in Task 7 (`pricePaneHeight` floor test).
5. **Arriving at `/research/chart` with no `symbol`** (bookmark, typed URL) — falls back to the first held position like Research does, not a blank chart. Pinned in Task 7 (`falls back to the first held position`).

---

### Task 1: Persisted chart preferences

**Files:**
- Create: `frontend/src/lib/chartOptions.js`
- Create: `frontend/src/lib/chartPrefs.js`
- Create: `frontend/src/lib/chartPrefs.test.js`
- Create: `frontend/src/components/research/useChartControls.test.js`
- Modify: `frontend/src/components/research/useChartControls.js` (whole file)
- Modify: `frontend/src/components/research/ChartPanel.jsx:1-32` (import the moved constants instead of declaring them)

**Interfaces:**
- Produces (`lib/chartOptions.js`): `CHART_TYPES: [key, label][]`, `OVERLAY_DEFS: {key,label}[]`, `PANE_DEFS: {key,label}[]`, `DEFAULT_PANE_HEIGHTS = { volume: 74, rsi: 92, macd: 92 }`, `ADVANCED_PANE_HEIGHTS = { volume: 96, rsi: 120, macd: 120 }`, `activeIndicatorCount({ overlays, panes }): number`.
- Produces (`lib/chartPrefs.js`): `DEFAULT_CHART_PREFS`, `sanitizeChartPrefs(raw, defaults = DEFAULT_CHART_PREFS) → { range, type, overlays, panes }`, `readChartPrefs() → prefs`, `writeChartPrefs(prefs) → boolean`.
- Produces (`useChartControls()`, no arguments now): `{ range, type, overlays, panes, yScale, setRange, setType, setYScale, toggleOverlay, togglePane }` — same shape as today.

- [ ] **Step 1: Create the options module (moved constants, no behaviour yet)**

`frontend/src/lib/chartOptions.js`:

```js
export const CHART_TYPES = [
  ['candles', 'Candles'],
  ['bars', 'Bars'],
  ['line', 'Line'],
  ['area', 'Area'],
]

export const OVERLAY_DEFS = [
  { key: 'ma20', label: 'MA 20' },
  { key: 'ma50', label: 'MA 50' },
  { key: 'ma200', label: 'MA 200' },
  { key: 'ema9', label: 'EMA 9' },
  { key: 'bb', label: 'Bollinger (20, 2)' },
  { key: 'vwap', label: 'VWAP' },
]

export const PANE_DEFS = [
  { key: 'volume', label: 'Volume' },
  { key: 'rsi', label: 'RSI (14)' },
  { key: 'macd', label: 'MACD (12, 26, 9)' },
]

export const DEFAULT_PANE_HEIGHTS = { volume: 74, rsi: 92, macd: 92 }
export const ADVANCED_PANE_HEIGHTS = { volume: 96, rsi: 120, macd: 120 }

export function activeIndicatorCount({ overlays, panes }) {
  return Object.values({ ...overlays, ...panes }).filter(Boolean).length
}
```

In `ChartPanel.jsx`, delete the local `CHART_TYPES`, `OVERLAY_DEFS`, `PANE_DEFS` declarations and add
`import { CHART_TYPES, OVERLAY_DEFS, PANE_DEFS } from '../../lib/chartOptions'`. Replace
`const activeCount = Object.values({ ...overlays, ...panes }).filter(Boolean).length` with
`const activeCount = activeIndicatorCount(controls)` (add `activeIndicatorCount` to the same import).

Run: `npx vitest run src/pages/Research.test.jsx` — Expected: PASS (pure move).

- [ ] **Step 2: Write the failing prefs tests**

`frontend/src/lib/chartPrefs.test.js`:

```js
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_CHART_PREFS, readChartPrefs, sanitizeChartPrefs, writeChartPrefs } from './chartPrefs'

const KEY = 'saxodash:chart-prefs'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('sanitizeChartPrefs', () => {
  it('returns the defaults for nothing stored', () => {
    expect(sanitizeChartPrefs(null)).toEqual(DEFAULT_CHART_PREFS)
  })

  it('keeps valid stored values', () => {
    const stored = {
      range: '1Y',
      type: 'line',
      overlays: { ...DEFAULT_CHART_PREFS.overlays, bb: true },
      panes: { ...DEFAULT_CHART_PREFS.panes, macd: true },
    }
    expect(sanitizeChartPrefs(stored)).toEqual(stored)
  })

  it('falls back to the default range and type for values the chart does not know', () => {
    const prefs = sanitizeChartPrefs({ range: '5D', type: 'heikin-ashi' })
    expect(prefs.range).toBe(DEFAULT_CHART_PREFS.range)
    expect(prefs.type).toBe(DEFAULT_CHART_PREFS.type)
  })

  it('drops unknown overlay and pane keys', () => {
    const prefs = sanitizeChartPrefs({ overlays: { ichimoku: true }, panes: { stochastic: true } })
    expect(prefs.overlays).toEqual(DEFAULT_CHART_PREFS.overlays)
    expect(prefs.panes).toEqual(DEFAULT_CHART_PREFS.panes)
  })

  it('gives a toggle missing from an older blob its default', () => {
    const prefs = sanitizeChartPrefs({ overlays: { ma20: false } })
    expect(prefs.overlays).toEqual({ ...DEFAULT_CHART_PREFS.overlays, ma20: false })
  })

  it('falls back to the default for a toggle that is not a boolean', () => {
    const prefs = sanitizeChartPrefs({ panes: { rsi: 'yes' }, overlays: ['ma20'] })
    expect(prefs.panes.rsi).toBe(DEFAULT_CHART_PREFS.panes.rsi)
    expect(prefs.overlays).toEqual(DEFAULT_CHART_PREFS.overlays)
  })
})

describe('readChartPrefs / writeChartPrefs', () => {
  it('round-trips what was written', () => {
    const prefs = { ...DEFAULT_CHART_PREFS, range: '3M', type: 'bars' }
    expect(writeChartPrefs(prefs)).toBe(true)
    expect(readChartPrefs()).toEqual(prefs)
  })

  it('never stores yScale', () => {
    writeChartPrefs({ ...DEFAULT_CHART_PREFS, yScale: 3 })
    expect(JSON.parse(localStorage.getItem(KEY))).not.toHaveProperty('yScale')
  })

  it('reads the defaults from corrupt JSON', () => {
    localStorage.setItem(KEY, '{not json')
    expect(readChartPrefs()).toEqual(DEFAULT_CHART_PREFS)
  })

  it('reads the defaults when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(readChartPrefs()).toEqual(DEFAULT_CHART_PREFS)
  })

  it('reports a failed write instead of throwing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(writeChartPrefs(DEFAULT_CHART_PREFS)).toBe(false)
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/lib/chartPrefs.test.js`
Expected: FAIL — cannot resolve `./chartPrefs`.

- [ ] **Step 4: Implement `lib/chartPrefs.js`**

```js
import { CHART_TYPES } from './chartOptions'
import { INTERVALS } from './research'

const KEY = 'saxodash:chart-prefs'
const CHART_TYPE_KEYS = new Set(CHART_TYPES.map(([key]) => key))

export const DEFAULT_CHART_PREFS = {
  range: '6M',
  type: 'candles',
  overlays: { ma20: true, ma50: true, ma200: false, ema9: false, bb: false, vwap: false },
  panes: { volume: true, rsi: false, macd: false },
}

function sanitizeToggles(raw, defaults) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return Object.fromEntries(
    Object.entries(defaults).map(([key, fallback]) => [
      key,
      typeof source[key] === 'boolean' ? source[key] : fallback,
    ]),
  )
}

export function sanitizeChartPrefs(raw, defaults = DEFAULT_CHART_PREFS) {
  const source = raw && typeof raw === 'object' ? raw : {}
  return {
    range: INTERVALS.includes(source.range) ? source.range : defaults.range,
    type: CHART_TYPE_KEYS.has(source.type) ? source.type : defaults.type,
    overlays: sanitizeToggles(source.overlays, defaults.overlays),
    panes: sanitizeToggles(source.panes, defaults.panes),
  }
}

export function readChartPrefs() {
  try {
    return sanitizeChartPrefs(JSON.parse(localStorage.getItem(KEY)))
  } catch {
    return sanitizeChartPrefs(null)
  }
}

export function writeChartPrefs({ range, type, overlays, panes }) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ range, type, overlays, panes }))
    return true
  } catch {
    return false
  }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/lib/chartPrefs.test.js` — Expected: PASS (11 tests).

- [ ] **Step 6: Write the failing hook tests**

`frontend/src/components/research/useChartControls.test.js`:

```js
import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import { DEFAULT_CHART_PREFS, writeChartPrefs } from '../../lib/chartPrefs'
import { useChartControls } from './useChartControls'

const stored = () => JSON.parse(localStorage.getItem('saxodash:chart-prefs'))

beforeEach(() => localStorage.clear())

describe('useChartControls', () => {
  it('starts from the defaults when nothing is stored', () => {
    const { result } = renderHook(() => useChartControls())
    expect(result.current.range).toBe(DEFAULT_CHART_PREFS.range)
    expect(result.current.overlays).toEqual(DEFAULT_CHART_PREFS.overlays)
    expect(result.current.yScale).toBe(1)
  })

  it('starts from what was stored', () => {
    writeChartPrefs({ ...DEFAULT_CHART_PREFS, range: '1Y', type: 'area' })
    const { result } = renderHook(() => useChartControls())
    expect(result.current.range).toBe('1Y')
    expect(result.current.type).toBe('area')
  })

  it('persists range, type, overlay and pane changes', () => {
    const { result } = renderHook(() => useChartControls())
    act(() => result.current.setRange('3M'))
    act(() => result.current.setType('bars'))
    act(() => result.current.toggleOverlay('bb'))
    act(() => result.current.togglePane('macd'))
    expect(stored()).toMatchObject({ range: '3M', type: 'bars' })
    expect(stored().overlays.bb).toBe(true)
    expect(stored().panes.macd).toBe(true)
  })

  it('keeps yScale in memory only', () => {
    const { result } = renderHook(() => useChartControls())
    act(() => result.current.setYScale(2.5))
    expect(result.current.yScale).toBe(2.5)
    expect(stored() ?? {}).not.toHaveProperty('yScale')

    const again = renderHook(() => useChartControls())
    expect(again.result.current.yScale).toBe(1)
  })
})
```

- [ ] **Step 7: Run to verify it fails**

Run: `npx vitest run src/components/research/useChartControls.test.js`
Expected: FAIL — "starts from what was stored" and "persists …" fail (hook ignores storage).

- [ ] **Step 8: Rewrite `useChartControls.js`**

Replace the whole file (the old doc comment goes: the file's contents are replaced, not edited around it):

```js
import { useEffect, useState } from 'react'

import { readChartPrefs, writeChartPrefs } from '../../lib/chartPrefs'

export function useChartControls() {
  const [prefs, setPrefs] = useState(readChartPrefs)
  const [yScale, setYScale] = useState(1)

  useEffect(() => {
    writeChartPrefs(prefs)
  }, [prefs])

  return {
    ...prefs,
    yScale,
    setYScale,
    setRange: (next) => setPrefs((p) => ({ ...p, range: next })),
    setType: (next) => setPrefs((p) => ({ ...p, type: next })),
    toggleOverlay: (key) => setPrefs((p) => ({ ...p, overlays: { ...p.overlays, [key]: !p.overlays[key] } })),
    togglePane: (key) => setPrefs((p) => ({ ...p, panes: { ...p.panes, [key]: !p.panes[key] } })),
  }
}
```

- [ ] **Step 9: Run hook tests, then the full suite and lint**

Run: `npx vitest run src/components/research/useChartControls.test.js` — Expected: PASS.
Run: `npx vitest run && npx eslint .` — Expected: all green (Research.test clears localStorage in `beforeEach`, so persisted prefs cannot leak between its tests).

- [ ] **Step 10: Commit**

```bash
git add frontend/src/lib/chartOptions.js frontend/src/lib/chartPrefs.js frontend/src/lib/chartPrefs.test.js \
  frontend/src/components/research/useChartControls.js frontend/src/components/research/useChartControls.test.js \
  frontend/src/components/research/ChartPanel.jsx
git commit -m "feat: persist chart range, type, overlays and panes across visits"
```

---

### Task 2: Extract the Research data hooks

A pure refactor: `Research.jsx`'s instrument resolution, chart data wiring and watchlist toggle move into hooks the new page will share. No behaviour change; the existing `src/pages/Research.test.jsx` suite (26 tests) is the safety net.

**Files:**
- Create: `frontend/src/components/research/useResearchInstrument.js`
- Create: `frontend/src/components/research/useChartData.js`
- Create: `frontend/src/components/research/useWatchlistToggle.js`
- Modify: `frontend/src/pages/Research.jsx` (whole file)

**Interfaces:**
- Consumes: `useChartControls()` from Task 1.
- Produces:
  - `useResearchInstrument() → { symbol: string, instrument: {uic, assetType, exact}|null, position: object|null, positions: object[], selectSymbol(next: string, picked?: {uic, assetType}) }`. `selectSymbol` rewrites the *current* route's search params with `replace: true`. Also records the symbol as recent (`pushRecentSymbol`).
  - `useChartData({ symbol, instrument, range }) → { chart, bars, ind, earnings, earningsMarkers, note, priceLines, quote, details }` where `chart`, `earnings`, `note`, `details` are the TanStack query results, `priceLines` is `useChartLines`'s return (`{ lines, saveFailed, move, create, remove }`), `quote` is the first live quote row or `undefined`. Also records the last look (`recordLook`).
  - `useWatchlistToggle({ symbol, instrument, details, position }) → { watchlists: object[], toggleList(list) }` (`details` is the details *data*, not the query).

- [ ] **Step 1: Confirm the safety net is green before touching anything**

Run: `npx vitest run src/pages/Research.test.jsx` — Expected: PASS (26 tests).

- [ ] **Step 2: Create `useResearchInstrument.js`**

Comments below are the existing ones from `Research.jsx`, moved with their code.

```js
import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

import { useInstrumentSearch, usePositions } from '../../api/queries'
import { needsInstrumentSearch, resolveInstrument } from '../../lib/research'
import { pushRecentSymbol } from '../../lib/recentSymbols'

const FALLBACK_SYMBOL = 'NVDA'

export function useResearchInstrument() {
  const [params, setParams] = useSearchParams()
  const { data: positions = [] } = usePositions()
  const symbol = params.get('symbol') ?? positions[0]?.ticker ?? FALLBACK_SYMBOL
  const position = positions.find((p) => p.ticker === symbol) ?? null

  useEffect(() => {
    pushRecentSymbol(symbol)
  }, [symbol])

  // Only searched for when the portfolio cannot answer: a held instrument
  // already knows its own uic.
  const { data: searchResults = [] } = useInstrumentSearch(
    needsInstrumentSearch(symbol, positions) ? symbol : '',
  )
  // A search dropdown (⌘K, add-peer) may have already picked the exact row
  // for an ambiguous ticker - e.g. ServiceNow vs. NowVertical under "NOW".
  // Carried in the URL so that choice survives the symbol search re-running.
  const pinnedUic = Number(params.get('uic')) || null
  const pinnedAssetType = params.get('assetType')
  const instrument = useMemo(() => {
    const pinned = pinnedUic ? { uic: pinnedUic, assetType: pinnedAssetType } : null
    return resolveInstrument({ symbol, positions, results: searchResults, pinned })
  }, [symbol, positions, searchResults, pinnedUic, pinnedAssetType])

  // `instrument`, when the caller already has it (a watchlist row, a search
  // pick), pins the exact uic so an ambiguous ticker like "NOW" can't
  // resolve to the wrong company once symbol search runs again on arrival.
  const selectSymbol = (next, picked) => {
    const nextParams = { symbol: next }
    if (picked?.uic) {
      nextParams.uic = picked.uic
      if (picked.assetType) nextParams.assetType = picked.assetType
    }
    setParams(nextParams, { replace: true })
  }

  return { symbol, instrument, position, positions, selectSymbol }
}
```

- [ ] **Step 3: Create `useChartData.js`**

```js
import { useEffect, useMemo } from 'react'

import {
  useChart,
  useInstrumentDetails,
  useQuotes,
  useSymbolEarnings,
  useSymbolNote,
} from '../../api/queries'
import { computeIndicatorsForRange } from '../../lib/indicators'
import { recordLook } from '../../lib/lastLook'
import { DAILY_HORIZON, WIDEST_RANGE_COUNT, barsForRange, earningsMarkersForBars } from '../../lib/research'
import { useChartLines } from './useChartLines'

// Hoisted so an empty result keeps a stable identity and the memos below do
// not recompute on every render.
const NO_BARS = []

export function useChartData({ symbol, instrument, range }) {
  const uic = instrument?.uic
  const assetType = instrument?.assetType

  // One fetch at the widest range; the narrower ones are its tail. Keying on
  // the range instead meant six Saxo calls to walk 1W→ALL.
  const chart = useChart({ uic, assetType, horizon: DAILY_HORIZON, count: WIDEST_RANGE_COUNT })
  const allBars = chart.data ?? NO_BARS
  const bars = useMemo(() => barsForRange(allBars, range), [allBars, range])
  // Indicators run on everything fetched and are sliced to match, so MA-50 has
  // a value on a one-month view instead of being null for want of history.
  const ind = useMemo(() => computeIndicatorsForRange(allBars, bars.length), [allBars, bars.length])

  const details = useInstrumentDetails({ uic, assetType })
  const earnings = useSymbolEarnings(symbol)
  const note = useSymbolNote(symbol)
  const priceLines = useChartLines({ symbol, uic, assetType, note: note?.data })
  const earningsMarkers = useMemo(
    () => earningsMarkersForBars(bars, earnings.data?.available ? earnings.data.history : []),
    [bars, earnings.data],
  )
  const liveQuotes = useQuotes(uic ? [uic] : [], assetType)

  useEffect(() => {
    recordLook(symbol, liveQuotes.data?.[0]?.price)
  }, [symbol, liveQuotes.data])

  return {
    chart,
    bars,
    ind,
    earnings,
    earningsMarkers,
    note,
    priceLines,
    quote: liveQuotes.data?.[0],
    details,
  }
}
```

- [ ] **Step 4: Create `useWatchlistToggle.js`**

```js
import { useWatchlistMutations, useWatchlists } from '../../api/queries'

export function useWatchlistToggle({ symbol, instrument, details, position }) {
  const { data: watchlists = [] } = useWatchlists()
  const { addItem, removeItem } = useWatchlistMutations()

  const toggleList = (list) => {
    const existing = list.items.find((item) => item.uic === instrument?.uic)
    if (existing) {
      removeItem.mutate({ id: list.id, itemId: existing.id })
      return
    }
    if (!instrument) return
    addItem.mutate({
      id: list.id,
      item: {
        symbol,
        uic: instrument.uic,
        asset_type: instrument.assetType,
        description: details?.description ?? position?.name ?? '',
        exchange: details?.exchange ?? '',
      },
    })
  }

  return { watchlists, toggleList }
}
```

- [ ] **Step 5: Rewrite `Research.jsx` on top of the hooks**

Replace the whole file with the following. The JSX is unchanged apart from `quote={quote}` and the `details` / `earnings` / `note` names now coming from `useChartData`; kept comments are the originals.

```jsx
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { useFundamentals, useMarkReviewedMutation, useSymbolNoteMutation } from '../api/queries'
import { isEtf } from '../lib/research'
import { PageHeader } from '../components/ui'
import InstrumentSearchBar from '../components/InstrumentSearchBar'
import SaxoConnectionStatus from '../components/SaxoConnectionStatus'
import { readRecentSymbols } from '../lib/recentSymbols'
import ChartPanel from '../components/research/ChartPanel'
import EarningsTab from '../components/research/EarningsTab'
import GuideTab from '../components/research/GuideTab'
import NewsTab from '../components/research/NewsTab'
import OverviewTab from '../components/research/OverviewTab'
import PeersTab from '../components/research/PeersTab'
import SymbolBar from '../components/research/SymbolBar'
import ValuationTab from '../components/research/ValuationTab'
import WatchlistRail from '../components/research/WatchlistRail'
import { useChartControls } from '../components/research/useChartControls'
import { useChartData } from '../components/research/useChartData'
import { useResearchInstrument } from '../components/research/useResearchInstrument'
import { useWatchlistToggle } from '../components/research/useWatchlistToggle'

// `equityOnly` tabs are all Finnhub company-fundamentals underneath, which
// Finnhub's free tier never returns for an ETF - so unlike a stock with
// temporarily missing data, there's nothing to wait on. Marked here, once,
// so the visible tab list and the hidden-tab reset below can't drift apart.
const TABS = [
  ['overview', 'Overview'],
  ['valuation', 'Valuation', { equityOnly: true }],
  ['peers', 'Peers', { equityOnly: true }],
  ['earnings', 'Earnings', { equityOnly: true }],
  ['news', 'News'],
  ['guide', 'Guide'],
]

const TAB_KEYS = new Set(TABS.map(([key]) => key))
const EQUITY_ONLY_TAB_KEYS = new Set(TABS.filter(([, , meta]) => meta?.equityOnly).map(([key]) => key))

export default function Research() {
  const [params] = useSearchParams()
  const { symbol, instrument, position, positions, selectSymbol } = useResearchInstrument()

  const controls = useChartControls()
  const [hover, setHover] = useState(null)
  const requestedTab = params.get('tab')
  const [tab, setTab] = useState(TAB_KEYS.has(requestedTab) ? requestedTab : 'overview')

  const [scaledSymbol, setScaledSymbol] = useState(symbol)
  if (scaledSymbol !== symbol) {
    setScaledSymbol(symbol)
    controls.setYScale(1)
  }

  const recentSymbols = readRecentSymbols().filter((s) => s !== symbol)

  const instrumentIsEtf = isEtf(instrument)
  const visibleTabs = instrumentIsEtf ? TABS.filter(([, , meta]) => !meta?.equityOnly) : TABS

  // Adjusted during render, React's own pattern for "reset state when a prop
  // makes it invalid" - covers both a stale `?tab=` link and switching to an
  // ETF mid-session (the watchlist rail, ⌘K) while an equity-only tab is open.
  if (instrumentIsEtf && EQUITY_ONLY_TAB_KEYS.has(tab)) {
    setTab('overview')
  }

  const { chart, bars, ind, earnings, earningsMarkers, note, priceLines, quote, details } = useChartData({
    symbol,
    instrument,
    range: controls.range,
  })
  const fundamentals = useFundamentals(symbol)
  const noteMutation = useSymbolNoteMutation(symbol)
  const reviewMutation = useMarkReviewedMutation(symbol)
  const { watchlists, toggleList } = useWatchlistToggle({
    symbol,
    instrument,
    details: details.data,
    position,
  })

  const heldSymbols = useMemo(() => new Set(positions.map((p) => p.ticker)), [positions])

  // A stale hover index outlives its dataset when the range or symbol changes;
  // clamping here beats an effect that fires after a bad render.
  const safeHover = hover != null && hover < bars.length ? hover : null

  return (
    <div>
      <PageHeader
        title="Research"
        subtitle="Prices, indicators and watchlists, straight from Saxo"
        right={<SaxoConnectionStatus />}
      />

      <div className="mb-3">
        <InstrumentSearchBar />
      </div>

      {recentSymbols.length > 0 && (
        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
          <span className="text-[var(--fig-2xs)] uppercase tracking-wide text-zinc-600">Recent</span>
          {recentSymbols.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => selectSymbol(s)}
              className="h-6 px-2 rounded border border-white/[0.06] text-[var(--fig-xs)] text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04]"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-4">
        <SymbolBar
          symbol={symbol}
          instrument={instrument}
          details={details.data}
          position={position}
          quote={quote}
          bars={bars}
          watchlists={watchlists}
          onToggleList={toggleList}
        />

        {/* The rail drops below the chart under 1280px, where 300px of it
            would leave the candles too narrow to read. */}
        <div className="grid gap-4 items-start grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-4 min-w-0">
            <ChartPanel
              bars={bars}
              ind={ind}
              isLoading={chart.isLoading}
              error={chart.error}
              controls={controls}
              hover={safeHover}
              setHover={setHover}
              symbol={symbol}
              unresolved={!instrument && !chart.isLoading}
              earningsMarkers={earningsMarkers}
              lines={priceLines.lines}
              onMoveLine={priceLines.move}
              onCreateLine={priceLines.create}
              onDeleteLine={priceLines.remove}
              lineSaveFailed={priceLines.saveFailed}
            />

            <div className="flex items-center gap-1 border-b border-white/[0.06] pb-px">
              {visibleTabs.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  aria-current={tab === key}
                  className={`h-8 px-3 text-[var(--fig-sm)] font-medium border-b-2 -mb-px transition-colors ${
                    tab === key
                      ? 'text-zinc-100 border-blue-500'
                      : 'text-zinc-500 border-transparent hover:text-zinc-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === 'overview' ? (
              <OverviewTab
                symbol={symbol}
                position={position}
                details={details.data}
                detailsLoading={details.isLoading}
                bars={bars}
                range={controls.range}
                fundamentals={fundamentals}
                note={note}
                onSaveNote={(patch) => noteMutation.mutate(patch)}
                onMarkReviewed={() => reviewMutation.mutate()}
                reviewing={reviewMutation.isPending}
                isEtf={instrumentIsEtf}
              />
            ) : null}
            {tab === 'valuation' ? <ValuationTab fundamentals={fundamentals} /> : null}
            {tab === 'peers' ? <PeersTab symbol={symbol} fundamentals={fundamentals} /> : null}
            {tab === 'earnings' ? (
              <EarningsTab symbol={symbol} earnings={earnings} fundamentals={fundamentals} />
            ) : null}
            {tab === 'news' ? <NewsTab symbol={symbol} /> : null}
            {tab === 'guide' ? <GuideTab /> : null}
          </div>

          <WatchlistRail symbol={symbol} onSelectSymbol={selectSymbol} heldSymbols={heldSymbols} />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Run the safety net, the full suite and lint**

Run: `npx vitest run src/pages/Research.test.jsx` — Expected: PASS (26 tests, unchanged).
Run: `npx vitest run && npx eslint .` — Expected: green.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/research/useResearchInstrument.js frontend/src/components/research/useChartData.js \
  frontend/src/components/research/useWatchlistToggle.js frontend/src/pages/Research.jsx
git commit -m "refactor: extract Research instrument, chart-data and watchlist hooks"
```

---

### Task 3: Split ChartPanel into canvas + menus, add the expand link

**Files:**
- Create: `frontend/src/components/research/ChartCanvas.jsx`
- Create: `frontend/src/components/research/chartMenus.jsx`
- Modify: `frontend/src/components/research/ChartPanel.jsx` (whole file)
- Modify: `frontend/src/lib/research.js:207-215` (`researchHref` + new `chartHref`)
- Modify: `frontend/src/lib/research.test.js` (add `chartHref` block after the `researchHref` block, ~line 295)
- Modify: `frontend/src/pages/Research.jsx` (pass `expandHref`)
- Modify: `frontend/src/pages/Research.test.jsx` (one new test)

**Interfaces:**
- Consumes: `CHART_TYPES`, `OVERLAY_DEFS`, `PANE_DEFS`, `DEFAULT_PANE_HEIGHTS`, `activeIndicatorCount` (Task 1).
- Produces:
  - `chartHref(symbol: string, instrument?: {uic, assetType}) → '/research/chart?symbol=…[&uic=…[&assetType=…]]'`.
  - `<ChartCanvas bars ind controls hover setHover symbol isLoading error unresolved earningsMarkers lines onMoveLine onCreateLine onDeleteLine priceHeight paneHeights? placingLine? onPlaced? />` — legend + `TVChart` (height `priceHeight`) + enabled lower panes (heights from `paneHeights`, default `DEFAULT_PANE_HEIGHTS`) + time axis, or the `chartPlaceholderFor` placeholder at `priceHeight`. `placingLine`/`onPlaced` are passed straight to `TVChart` (Task 4 makes them do something).
  - `<ChartTypeMenuItems controls />`, `<IndicatorMenuItems controls />` — the `MenuRow` bodies of the two chart menus.
  - `<ChartPanel … expandHref? />` — when `expandHref` is given, renders a link labelled "Open advanced chart".

- [ ] **Step 1: Write the failing `chartHref` tests**

Append to `frontend/src/lib/research.test.js` (add `chartHref` to the import list at the top):

```js
describe('chartHref', () => {
  it('builds a symbol-only advanced chart link', () => {
    expect(chartHref('NVDA')).toBe('/research/chart?symbol=NVDA')
  })

  it('pins the exact instrument, like researchHref', () => {
    expect(chartHref('NOW', { uic: 204300, assetType: 'Stock' })).toBe(
      '/research/chart?symbol=NOW&uic=204300&assetType=Stock',
    )
  })

  it('leaves out an asset type without a uic', () => {
    expect(chartHref('NOW', { assetType: 'Stock' })).toBe('/research/chart?symbol=NOW')
  })
})
```

Run: `npx vitest run src/lib/research.test.js` — Expected: FAIL (`chartHref` is not exported).

- [ ] **Step 2: Implement `chartHref` sharing `researchHref`'s param rules**

Replace `researchHref` in `frontend/src/lib/research.js` with:

```js
function pinInstrument(params, instrument) {
  if (!instrument?.uic) return
  params.set('uic', instrument.uic)
  if (instrument.assetType) params.set('assetType', instrument.assetType)
}

export function researchHref(symbol, tab, instrument) {
  const params = new URLSearchParams({ symbol })
  if (tab) params.set('tab', tab)
  pinInstrument(params, instrument)
  return `/research?${params.toString()}`
}

export function chartHref(symbol, instrument) {
  const params = new URLSearchParams({ symbol })
  pinInstrument(params, instrument)
  return `/research/chart?${params.toString()}`
}
```

(Keep any doc comment that currently sits above `researchHref` where it is.)

Run: `npx vitest run src/lib/research.test.js` — Expected: PASS.

- [ ] **Step 3: Write the failing expand-link test**

Add to `frontend/src/pages/Research.test.jsx` inside `describe('Research')`:

```jsx
  it('links the chart to the advanced view, keeping the exact instrument', () => {
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    expect(screen.getByRole('link', { name: 'Open advanced chart' })).toHaveAttribute(
      'href',
      '/research/chart?symbol=NVDA&uic=211&assetType=Stock',
    )
  })
```

Run: `npx vitest run src/pages/Research.test.jsx` — Expected: FAIL (no such link).

- [ ] **Step 4: Create `chartMenus.jsx`**

```jsx
import { OVERLAY_STROKES } from '../../lib/chartGeometry'
import { CHART_TYPES, OVERLAY_DEFS, PANE_DEFS } from '../../lib/chartOptions'
import { MenuLabel, MenuRow, MenuSeparator } from './menu'

export function ChartTypeMenuItems({ controls }) {
  return CHART_TYPES.map(([key, label]) => (
    <MenuRow key={key} checked={controls.type === key} onClick={() => controls.setType(key)}>
      {label}
    </MenuRow>
  ))
}

export function IndicatorMenuItems({ controls }) {
  return (
    <>
      <MenuLabel>Overlays</MenuLabel>
      {OVERLAY_DEFS.map((overlay) => (
        <MenuRow
          key={overlay.key}
          checked={controls.overlays[overlay.key]}
          dot={OVERLAY_STROKES[overlay.key]}
          onClick={() => controls.toggleOverlay(overlay.key)}
        >
          {overlay.label}
        </MenuRow>
      ))}
      <MenuSeparator />
      <MenuLabel>Lower panes</MenuLabel>
      {PANE_DEFS.map((pane) => (
        <MenuRow key={pane.key} checked={controls.panes[pane.key]} onClick={() => controls.togglePane(pane.key)}>
          {pane.label}
        </MenuRow>
      ))}
    </>
  )
}
```

- [ ] **Step 5: Create `ChartCanvas.jsx`**

`OhlcLegend` and `valueAt` move here verbatim from `ChartPanel.jsx`.

```jsx
import { fmtNum, fmtPct } from '../../lib/format'
import { barChange } from '../../lib/research'
import { chartPlaceholderFor } from '../../lib/chartState'
import { OVERLAY_STROKES } from '../../lib/chartGeometry'
import { DEFAULT_PANE_HEIGHTS, OVERLAY_DEFS } from '../../lib/chartOptions'
import { MacdPane, RsiPane, TimeAxis, VolumePane } from './panes'
import { SubPane, TVChart } from './TVChart'

function valueAt(series, hover) {
  if (!series?.length) return null
  return series[hover ?? series.length - 1]
}

function OhlcLegend({ bar, change, overlays, ind, hover }) {
  const up = bar.close >= bar.open

  return (
    <div className="flex items-center gap-3 px-3 pt-2 text-[var(--fig-2xs)] num font-mono flex-wrap">
      <span className="text-zinc-400">{bar.date}</span>
      {[
        ['O', bar.open],
        ['H', bar.high],
        ['L', bar.low],
        ['C', bar.close],
      ].map(([key, value]) => (
        <span key={key} className="text-zinc-500">
          {key} <span className={up ? 'text-emerald-400' : 'text-red-400'}>{fmtNum(value, 2)}</span>
        </span>
      ))}
      {change == null ? null : (
        <span className={change >= 0 ? 'text-emerald-400' : 'text-red-400'}>{fmtPct(change)}</span>
      )}
      <span className="text-zinc-500">
        Vol <span className="text-zinc-300">{fmtNum(bar.volume / 1e6, 1)}M</span>
      </span>
      {OVERLAY_DEFS.filter((o) => overlays[o.key] && o.key !== 'bb').map((o) => {
        const value = valueAt(ind[o.key], hover)
        return (
          <span key={o.key} style={{ color: OVERLAY_STROKES[o.key] }} className="text-[var(--fig-2xs)]">
            {o.label} {value == null ? '—' : fmtNum(value, 2)}
          </span>
        )
      })}
    </div>
  )
}

export default function ChartCanvas({
  bars,
  ind,
  controls,
  hover,
  setHover,
  symbol,
  isLoading,
  error,
  unresolved,
  earningsMarkers = [],
  lines,
  onMoveLine,
  onCreateLine,
  onDeleteLine,
  priceHeight,
  paneHeights = DEFAULT_PANE_HEIGHTS,
  placingLine = false,
  onPlaced,
}) {
  const { type, overlays, panes, yScale, setYScale } = controls
  const bar = bars[hover ?? bars.length - 1]

  const placeholder = chartPlaceholderFor({
    isLoading,
    error,
    data: bars,
    minPoints: 2,
    height: priceHeight,
    symbol,
    unresolved,
  })
  if (placeholder) return placeholder

  return (
    <>
      {bar ? (
        <OhlcLegend bar={bar} change={barChange(bars, hover)} overlays={overlays} ind={ind} hover={hover} />
      ) : null}

      <div className="px-1 pb-1">
        <TVChart
          key={symbol}
          data={bars}
          ind={ind}
          type={type}
          overlays={overlays}
          hover={hover}
          setHover={setHover}
          height={priceHeight}
          earningsMarkers={earningsMarkers}
          yScale={yScale}
          onYScaleChange={setYScale}
          lines={lines}
          onMoveLine={onMoveLine}
          onCreateLine={onCreateLine}
          onDeleteLine={onDeleteLine}
          placingLine={placingLine}
          onPlaced={onPlaced}
        />
        {panes.volume ? (
          <SubPane title="Volume" height={paneHeights.volume}>
            <VolumePane data={bars} hover={hover} setHover={setHover} />
          </SubPane>
        ) : null}
        {panes.rsi ? (
          <SubPane title={`RSI 14 ${fmtNum(valueAt(ind.rsi, hover) ?? 0, 1)}`} height={paneHeights.rsi}>
            <RsiPane values={ind.rsi} hover={hover} setHover={setHover} />
          </SubPane>
        ) : null}
        {panes.macd ? (
          <SubPane title="MACD 12 26 9" height={paneHeights.macd}>
            <MacdPane macd={ind.macd} hover={hover} setHover={setHover} />
          </SubPane>
        ) : null}
        <TimeAxis data={bars} />
      </div>
    </>
  )
}
```

- [ ] **Step 6: Rewrite `ChartPanel.jsx` as toolbar + canvas**

```jsx
import { Link } from 'react-router-dom'
import { CandlestickChart, Maximize2, Sigma } from 'lucide-react'

import { fmtPct } from '../../lib/format'
import { INTERVALS, periodChange } from '../../lib/research'
import { CHART_TYPES, DEFAULT_PANE_HEIGHTS, activeIndicatorCount } from '../../lib/chartOptions'
import { Card, TBtn } from '../ui'
import { Menu } from './menu'
import { ChartTypeMenuItems, IndicatorMenuItems } from './chartMenus'
import ChartCanvas from './ChartCanvas'

const CHART_HEIGHT = 390

export default function ChartPanel({
  bars,
  ind,
  isLoading,
  error,
  controls,
  hover,
  setHover,
  symbol,
  unresolved,
  earningsMarkers = [],
  lines,
  onMoveLine,
  onCreateLine,
  onDeleteLine,
  lineSaveFailed = false,
  expandHref,
}) {
  const { range, type, setRange } = controls
  const activeCount = activeIndicatorCount(controls)
  const period = periodChange(bars)

  return (
    <Card padding={false}>
      <div className="flex items-center gap-1 px-2.5 py-2 border-b border-white/[0.06] flex-wrap">
        <div className="flex items-center gap-0.5">
          {INTERVALS.map((interval) => (
            <TBtn key={interval} active={range === interval} onClick={() => setRange(interval)}>
              {interval}
            </TBtn>
          ))}
        </div>

        <span className="w-px h-5 bg-white/[0.08] mx-1.5" />

        <Menu label={Object.fromEntries(CHART_TYPES)[type]} icon={CandlestickChart} width={160}>
          <ChartTypeMenuItems controls={controls} />
        </Menu>

        <Menu label={`Indicators${activeCount ? ` · ${activeCount}` : ''}`} icon={Sigma} width={230}>
          <IndicatorMenuItems controls={controls} />
        </Menu>

        {lineSaveFailed ? (
          <span role="alert" className="ml-2 text-[var(--fig-2xs)] text-red-400">
            Couldn't save line
          </span>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          {period == null ? null : (
            <span className="text-[var(--fig-2xs)] text-zinc-500">
              Period{' '}
              <span className={`num font-mono ${period >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {fmtPct(period)}
              </span>
            </span>
          )}
          {expandHref ? (
            <Link
              to={expandHref}
              aria-label="Open advanced chart"
              title="Open advanced chart"
              className="w-7 h-7 rounded flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.05]"
            >
              <Maximize2 size={13} />
            </Link>
          ) : null}
        </div>
      </div>

      <ChartCanvas
        bars={bars}
        ind={ind}
        controls={controls}
        hover={hover}
        setHover={setHover}
        symbol={symbol}
        isLoading={isLoading}
        error={error}
        unresolved={unresolved}
        earningsMarkers={earningsMarkers}
        lines={lines}
        onMoveLine={onMoveLine}
        onCreateLine={onCreateLine}
        onDeleteLine={onDeleteLine}
        priceHeight={CHART_HEIGHT}
        paneHeights={DEFAULT_PANE_HEIGHTS}
      />
    </Card>
  )
}
```

In `Research.jsx`, add `chartHref` to the `../lib/research` import and pass
`expandHref={chartHref(symbol, instrument)}` to `<ChartPanel>`.

- [ ] **Step 7: Run tests and lint**

Run: `npx vitest run src/pages/Research.test.jsx src/lib/research.test.js` — Expected: PASS (27 Research tests).
Run: `npx vitest run && npx eslint .` — Expected: green.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/research/ChartCanvas.jsx frontend/src/components/research/chartMenus.jsx \
  frontend/src/components/research/ChartPanel.jsx frontend/src/lib/research.js frontend/src/lib/research.test.js \
  frontend/src/pages/Research.jsx frontend/src/pages/Research.test.jsx
git commit -m "feat: split the chart canvas out of ChartPanel and link to the advanced view"
```

---

### Task 4: One-shot line placing in TVChart

**Files:**
- Modify: `frontend/src/components/research/TVChart.jsx:320-402` (props, container handlers)
- Modify: `frontend/src/components/research/TVChart.test.jsx` (new tests after the double-click tests, ~line 284)

**Interfaces:**
- Consumes: nothing new.
- Produces: `TVChart` props `placingLine?: boolean` (default `false`) and `onPlaced?: () => void`. While `placingLine` is true, a *single* click inside the plot area (not the axis gutter, not a line badge/hit area — those stop propagation already) calls `onCreateLine(roundPrice(priceAtY(y)))` then `onPlaced()`, and the container cursor is `crosshair`. The `dblclick` whose first click placed a line creates nothing. Without `placingLine`, behaviour is unchanged.

- [ ] **Step 1: Write the failing tests**

Add inside `describe('TVChart')` in `TVChart.test.jsx` (after "double-clicking a line does not create another"):

```jsx
  it('places a line on a single click while the line tool is armed', () => {
    const onCreateLine = vi.fn()
    const onPlaced = vi.fn()
    const { container } = renderChart({ lines: [], onCreateLine, placingLine: true, onPlaced })

    fireEvent.mouseDown(container.firstChild, { detail: 1 })
    fireEvent.click(container.firstChild, { detail: 1, clientX: 100, clientY: 200 })

    const geometry = priceGeometry({ data: bars, ind: computeIndicators(bars), width: 760, height: 360, withBands: false, yScale: 1 })
    expect(onCreateLine).toHaveBeenCalledTimes(1)
    expect(onCreateLine).toHaveBeenCalledWith(roundPrice(geometry.priceAtY(200)))
    expect(onPlaced).toHaveBeenCalledTimes(1)
  })

  it('does not place a line on a single click when the tool is not armed', () => {
    const onCreateLine = vi.fn()
    const { container } = renderChart({ lines: [], onCreateLine })

    fireEvent.click(container.firstChild, { detail: 1, clientX: 100, clientY: 200 })

    expect(onCreateLine).not.toHaveBeenCalled()
  })

  it('creates exactly one line when the armed tool is double-clicked', () => {
    const onCreateLine = vi.fn()
    const { container, rerender } = renderChart({ lines: [], onCreateLine, placingLine: true, onPlaced: vi.fn() })
    const plot = container.firstChild

    fireEvent.mouseDown(plot, { detail: 1 })
    fireEvent.click(plot, { detail: 1, clientX: 100, clientY: 200 })
    rerender(chart({ lines: [], onCreateLine, placingLine: false, onPlaced: vi.fn() }))
    fireEvent.mouseDown(plot, { detail: 2 })
    fireEvent.click(plot, { detail: 2, clientX: 100, clientY: 200 })
    fireEvent.doubleClick(plot, { detail: 2, clientX: 100, clientY: 200 })

    expect(onCreateLine).toHaveBeenCalledTimes(1)
  })

  it('still creates a line on a later double-click after placing one', () => {
    const onCreateLine = vi.fn()
    const { container, rerender } = renderChart({ lines: [], onCreateLine, placingLine: true, onPlaced: vi.fn() })
    const plot = container.firstChild

    fireEvent.mouseDown(plot, { detail: 1 })
    fireEvent.click(plot, { detail: 1, clientX: 100, clientY: 200 })
    rerender(chart({ lines: [], onCreateLine }))
    fireEvent.mouseDown(plot, { detail: 1 })
    fireEvent.click(plot, { detail: 1, clientX: 100, clientY: 150 })
    fireEvent.mouseDown(plot, { detail: 2 })
    fireEvent.doubleClick(plot, { detail: 2, clientX: 100, clientY: 150 })

    expect(onCreateLine).toHaveBeenCalledTimes(2)
  })

  it('never places a line from a click in the price-axis gutter', () => {
    const onCreateLine = vi.fn()
    const onPlaced = vi.fn()
    const { container } = renderChart({ lines: [], onCreateLine, placingLine: true, onPlaced })

    fireEvent.click(container.firstChild, { detail: 1, clientX: 740, clientY: 200 })

    expect(onCreateLine).not.toHaveBeenCalled()
    expect(onPlaced).not.toHaveBeenCalled()
  })

  it('shows a crosshair cursor only while the line tool is armed', () => {
    const armed = renderChart({ lines: [], onCreateLine: vi.fn(), placingLine: true })
    const idle = renderChart({ lines: [], onCreateLine: vi.fn() })

    expect(armed.container.firstChild).toHaveStyle({ cursor: 'crosshair' })
    expect(idle.container.firstChild).not.toHaveStyle({ cursor: 'crosshair' })
  })
```

Run: `npx vitest run src/components/research/TVChart.test.jsx` — Expected: FAIL on the placing, one-line and cursor tests.

- [ ] **Step 2: Implement in `TVChart.jsx`**

Add the two props to the `TVChart` signature (after `onDeleteLine`):

```jsx
  placingLine = false,
  onPlaced,
```

Add a ref next to the other state (after `const [editingId, setEditingId] = useState(null)`):

```jsx
  const placedRef = useRef(false)
```

Replace the container `<div ref={ref} …>` opening tag's props (currently `className`, `style`, `onMouseMove`, `onMouseLeave`, `onClick`, `onDoubleClick`) with:

```jsx
    <div
      ref={ref}
      className="relative w-full select-none"
      style={{ height, cursor: placingLine ? 'crosshair' : undefined }}
      onMouseMove={(e) => setHover(indexFromPointer(e, geometry.slot, data.length))}
      onMouseLeave={() => setHover(null)}
      onMouseDown={(e) => {
        if (e.detail <= 1) placedRef.current = false
      }}
      onClick={(e) => {
        setSelectedId(null)
        if (!placingLine || !onCreateLine || e.detail > 1) return
        const y = plotY(e)
        if (y == null) return
        placedRef.current = true
        onCreateLine(roundPrice(geometry.priceAtY(y)))
        onPlaced?.()
      }}
      onDoubleClick={(e) => {
        if (placedRef.current) {
          placedRef.current = false
          return
        }
        if (!onCreateLine) return
        const y = plotY(e)
        if (y != null) onCreateLine(roundPrice(geometry.priceAtY(y)))
      }}
    >
```

(`useRef` is already imported at the top of the file.)

- [ ] **Step 3: Run tests and lint**

Run: `npx vitest run src/components/research/TVChart.test.jsx` — Expected: PASS (all existing double-click tests still pass: without a placing click, `placedRef` stays false).
Run: `npx vitest run && npx eslint .` — Expected: green.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/research/TVChart.jsx frontend/src/components/research/TVChart.test.jsx
git commit -m "feat: let TVChart place a horizontal line on one click when the line tool is armed"
```

---

### Task 5: The chart tool rail

Use the `saxodash-design-system` skill (and `frontend-design` / `ui-ux-pro-max` for the rail's visual details) while building this — icon size, hover/active tokens, and the right-opening menu must match the existing toolbar's look.

**Files:**
- Modify: `frontend/src/components/research/menu.jsx:11-60` (`Menu` gains `side`)
- Create: `frontend/src/components/research/ChartToolRail.jsx`
- Create: `frontend/src/components/research/ChartToolRail.test.jsx`

**Interfaces:**
- Consumes: `ChartTypeMenuItems`, `IndicatorMenuItems` (Task 3); `controls` shape (Task 1).
- Produces:
  - `Menu` prop `side?: 'bottom' | 'right'` (default `'bottom'`, unchanged look). With `side="right"` the trigger is a 36×36 icon-only button whose accessible name and `title` are `label`, and the panel opens to the right of the trigger, top-aligned.
  - `<ChartToolRail controls placingLine onPlacingLineChange canPlaceLine backHref />` — a `<nav aria-label="Chart tools">` with buttons named "Crosshair", "Horizontal line", "Chart type" (menu), "Indicators" (menu), "Reset price scale", and a link named "Back to Research" to `backHref`.

- [ ] **Step 1: Write the failing rail tests**

`frontend/src/components/research/ChartToolRail.test.jsx`:

```jsx
import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { renderWithProviders } from '../../test/renderWithProviders'
import { DEFAULT_CHART_PREFS } from '../../lib/chartPrefs'
import ChartToolRail from './ChartToolRail'

const makeControls = (overrides = {}) => ({
  ...DEFAULT_CHART_PREFS,
  yScale: 1,
  setRange: vi.fn(),
  setType: vi.fn(),
  setYScale: vi.fn(),
  toggleOverlay: vi.fn(),
  togglePane: vi.fn(),
  ...overrides,
})

const renderRail = (props = {}) => {
  const all = {
    controls: makeControls(),
    placingLine: false,
    onPlacingLineChange: vi.fn(),
    canPlaceLine: true,
    backHref: '/research?symbol=NOW&uic=204300&assetType=Stock',
    ...props,
  }
  renderWithProviders(<ChartToolRail {...all} />)
  return all
}

describe('ChartToolRail', () => {
  it('shows the crosshair as the active tool by default', () => {
    renderRail()
    expect(screen.getByRole('button', { name: 'Crosshair' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Horizontal line' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('arms the line tool', async () => {
    const { onPlacingLineChange } = renderRail()
    await userEvent.click(screen.getByRole('button', { name: 'Horizontal line' }))
    expect(onPlacingLineChange).toHaveBeenCalledWith(true)
  })

  it('disarms the line tool from the line button or the crosshair', async () => {
    const { onPlacingLineChange } = renderRail({ placingLine: true })
    expect(screen.getByRole('button', { name: 'Horizontal line' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(screen.getByRole('button', { name: 'Horizontal line' }))
    await userEvent.click(screen.getByRole('button', { name: 'Crosshair' }))

    expect(onPlacingLineChange).toHaveBeenNthCalledWith(1, false)
    expect(onPlacingLineChange).toHaveBeenNthCalledWith(2, false)
  })

  it('disables the line tool when lines cannot be created', () => {
    renderRail({ canPlaceLine: false })
    expect(screen.getByRole('button', { name: 'Horizontal line' })).toBeDisabled()
  })

  it('disables reset while the price scale is already automatic', () => {
    renderRail()
    expect(screen.getByRole('button', { name: 'Reset price scale' })).toBeDisabled()
  })

  it('resets a stretched price scale', async () => {
    const controls = makeControls({ yScale: 2.4 })
    renderRail({ controls })
    await userEvent.click(screen.getByRole('button', { name: 'Reset price scale' }))
    expect(controls.setYScale).toHaveBeenCalledWith(1)
  })

  it('changes the chart type from its menu', async () => {
    const { controls } = renderRail()
    await userEvent.click(screen.getByRole('button', { name: 'Chart type' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Line' }))
    expect(controls.setType).toHaveBeenCalledWith('line')
  })

  it('toggles overlays and lower panes from the indicators menu', async () => {
    const { controls } = renderRail()
    await userEvent.click(screen.getByRole('button', { name: 'Indicators' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /Bollinger/ }))
    await userEvent.click(screen.getByRole('menuitem', { name: /MACD/ }))
    expect(controls.toggleOverlay).toHaveBeenCalledWith('bb')
    expect(controls.togglePane).toHaveBeenCalledWith('macd')
  })

  it('links back to Research for the same exact instrument', () => {
    renderRail()
    expect(screen.getByRole('link', { name: 'Back to Research' })).toHaveAttribute(
      'href',
      '/research?symbol=NOW&uic=204300&assetType=Stock',
    )
  })
})
```

Run: `npx vitest run src/components/research/ChartToolRail.test.jsx` — Expected: FAIL (module missing).

- [ ] **Step 2: Give `Menu` a right-opening, icon-only variant**

In `menu.jsx`, replace the `Menu` function's signature and its `return (...)` block (the `useState`/`useRef`/`useEffect` body stays as is; the doc comment above it stays):

```jsx
export function Menu({ label, icon: Icon, children, width = 220, align = 'left', side = 'bottom' }) {
```

```jsx
  const rail = side === 'right'
  const idle = 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05]'
  const openTone = 'bg-white/[0.09] text-zinc-100'

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={rail ? label : undefined}
        title={rail ? label : undefined}
        className={
          rail
            ? `w-9 h-9 rounded flex items-center justify-center transition-colors ${open ? openTone : idle}`
            : `h-7 px-2.5 rounded text-[var(--fig-xs)] font-medium flex items-center gap-1.5 transition-colors ${
                open ? openTone : idle
              }`
        }
      >
        {rail ? (
          <Icon size={16} />
        ) : (
          <>
            {Icon ? <Icon size={12} /> : null}
            {label}
            <ChevronDown size={11} />
          </>
        )}
      </button>

      {open ? (
        <div
          role="menu"
          style={rail ? { width, left: '100%', top: 0 } : { width, [align]: 0 }}
          className={`absolute z-30 ${rail ? 'ml-2' : 'mt-1'} rounded-lg border border-white/10 bg-zinc-900 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.8)] p-1.5`}
        >
          {children}
        </div>
      ) : null}
    </div>
  )
```

- [ ] **Step 3: Create `ChartToolRail.jsx`**

```jsx
import { Link } from 'react-router-dom'
import { CandlestickChart, Crosshair, Minimize2, Minus, RotateCcw, Sigma } from 'lucide-react'

import { Menu } from './menu'
import { ChartTypeMenuItems, IndicatorMenuItems } from './chartMenus'

const RAIL_BUTTON = 'w-9 h-9 rounded flex items-center justify-center transition-colors'

function RailButton({ label, icon: Icon, pressed, disabled = false, onClick }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`${RAIL_BUTTON} disabled:opacity-35 disabled:pointer-events-none ${
        pressed ? 'bg-blue-500/15 text-blue-300' : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06]'
      }`}
    >
      <Icon size={16} />
    </button>
  )
}

export default function ChartToolRail({ controls, placingLine, onPlacingLineChange, canPlaceLine, backHref }) {
  return (
    <nav aria-label="Chart tools" className="flex flex-col items-center gap-1 py-2 border-r border-white/[0.06]">
      <RailButton label="Crosshair" icon={Crosshair} pressed={!placingLine} onClick={() => onPlacingLineChange(false)} />
      <RailButton
        label="Horizontal line"
        icon={Minus}
        pressed={placingLine}
        disabled={!canPlaceLine}
        onClick={() => onPlacingLineChange(!placingLine)}
      />

      <span className="w-6 h-px bg-white/[0.08] my-1" />

      <Menu side="right" label="Chart type" icon={CandlestickChart} width={160}>
        <ChartTypeMenuItems controls={controls} />
      </Menu>
      <Menu side="right" label="Indicators" icon={Sigma} width={230}>
        <IndicatorMenuItems controls={controls} />
      </Menu>
      <RailButton
        label="Reset price scale"
        icon={RotateCcw}
        disabled={controls.yScale === 1}
        onClick={() => controls.setYScale(1)}
      />

      <Link
        to={backHref}
        aria-label="Back to Research"
        title="Back to Research"
        className={`${RAIL_BUTTON} mt-auto text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06]`}
      >
        <Minimize2 size={16} />
      </Link>
    </nav>
  )
}
```

- [ ] **Step 4: Run tests and lint**

Run: `npx vitest run src/components/research/ChartToolRail.test.jsx` — Expected: PASS (9 tests).
Run: `npx vitest run && npx eslint .` — Expected: green (Research's bottom-opening menus are untouched by the default `side`).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/research/menu.jsx frontend/src/components/research/ChartToolRail.jsx \
  frontend/src/components/research/ChartToolRail.test.jsx
git commit -m "feat: add the vertical chart tool rail with a right-opening menu variant"
```

---

### Task 6: Supporting props — search target, stretching rail, compact symbol bar, shared ⌘K

**Files:**
- Modify: `frontend/src/components/InstrumentSearchBar.jsx:23-67` (`hrefFor` prop)
- Modify: `frontend/src/components/InstrumentSearchBar.test.jsx` (one new test)
- Modify: `frontend/src/components/research/WatchlistRail.jsx:25,70,185` (`fill` prop)
- Modify: `frontend/src/components/research/WatchlistRail.test.jsx` (two new tests)
- Modify: `frontend/src/components/research/SymbolBar.jsx:22-31,83-90` (`compact` prop)
- Create: `frontend/src/components/useCommandPalette.js`
- Create: `frontend/src/components/useCommandPalette.test.js`
- Modify: `frontend/src/components/Layout.jsx` (use the hook)

**Interfaces:**
- Produces:
  - `InstrumentSearchBar({ hrefFor? })` — `hrefFor(result) → string`; default builds `researchHref(result.symbol, undefined, { uic: result.uic, assetType: result.asset_type })` (unchanged behaviour).
  - `WatchlistRail({ symbol, onSelectSymbol, heldSymbols, fill? })` — `fill` makes the card `h-full` and lets the watchlist rows take all remaining height instead of the 420px cap.
  - `SymbolBar({ …, compact? })` — `compact` hides the Day range and Volume stats.
  - `useCommandPalette() → { open: boolean, setOpen(bool) }` — owns the ⌘K/Ctrl+K listener.

- [ ] **Step 1: Write the failing tests**

Add to `InstrumentSearchBar.test.jsx` inside its `describe`:

```jsx
  it('navigates wherever hrefFor points when the caller supplies it', async () => {
    queries.useInstrumentSearch.mockReturnValue({ data: [tsla], isError: false })
    renderWithProviders(<InstrumentSearchBar hrefFor={(r) => `/research/chart?symbol=${r.symbol}`} />)
    await userEvent.type(screen.getByRole('textbox', { name: /search instruments/i }), 'tsla')
    await userEvent.click(screen.getByText('Tesla Inc'))
    expect(navigate).toHaveBeenCalledWith('/research/chart?symbol=TSLA')
  })
```

Add to `WatchlistRail.test.jsx` inside `describe('WatchlistRail')` (its `beforeEach` already calls the file's `stub()`; `render` is the file's own helper that spreads extra props):

```jsx
  it('caps the watchlist rows at 420px by default', () => {
    const { container } = render()
    expect(container.querySelector('.max-h-\\[420px\\]')).not.toBeNull()
  })

  it('lets the watchlist rows fill the height when asked to', () => {
    const { container } = render({ fill: true })
    expect(container.querySelector('.max-h-\\[420px\\]')).toBeNull()
    expect(container.firstChild).toHaveClass('h-full')
  })
```

`frontend/src/components/useCommandPalette.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { act, fireEvent, renderHook } from '@testing-library/react'

import { useCommandPalette } from './useCommandPalette'

describe('useCommandPalette', () => {
  it('starts closed', () => {
    const { result } = renderHook(() => useCommandPalette())
    expect(result.current.open).toBe(false)
  })

  it('opens on Cmd+K and Ctrl+K', () => {
    const { result } = renderHook(() => useCommandPalette())
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(result.current.open).toBe(true)

    act(() => result.current.setOpen(false))
    fireEvent.keyDown(window, { key: 'K', ctrlKey: true })
    expect(result.current.open).toBe(true)
  })

  it('ignores a plain k', () => {
    const { result } = renderHook(() => useCommandPalette())
    fireEvent.keyDown(window, { key: 'k' })
    expect(result.current.open).toBe(false)
  })
})
```

`SymbolBar`'s `compact` has no test here: it is covered by the Task 7 page test `hides the day range in the compact symbol bar`.

Run: `npx vitest run src/components/InstrumentSearchBar.test.jsx src/components/research/WatchlistRail.test.jsx src/components/useCommandPalette.test.js`
Expected: FAIL (hrefFor ignored, `fill` ignored, hook missing).

- [ ] **Step 2: `InstrumentSearchBar` — `hrefFor`**

Above the component:

```jsx
const researchResultHref = (result) =>
  researchHref(result.symbol, undefined, { uic: result.uic, assetType: result.asset_type })
```

Signature: `export default function InstrumentSearchBar({ hrefFor = researchResultHref }) {`
In `go`: replace the `navigate(researchHref(...))` call with `navigate(hrefFor(result))`.

- [ ] **Step 3: `WatchlistRail` — `fill`**

Signature: `export default function WatchlistRail({ symbol, onSelectSymbol, heldSymbols, fill = false }) {`
Outer card: `<Card padding={false} className={fill ? 'h-full min-h-0 flex flex-col' : ''}>`
Rows container (currently `<div className="max-h-[420px] overflow-y-auto">`):
`<div className={fill ? 'flex-1 min-h-0 overflow-y-auto' : 'max-h-[420px] overflow-y-auto'}>`

- [ ] **Step 4: `SymbolBar` — `compact`**

Add `compact = false,` to the destructured props (after `onToggleList`). Change `{last ? (` (the Day range / Volume block) to `{last && !compact ? (`.

- [ ] **Step 5: `useCommandPalette` + `Layout`**

`frontend/src/components/useCommandPalette.js`:

```js
import { useEffect, useState } from 'react'

export function useCommandPalette() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return { open, setOpen }
}
```

In `Layout.jsx`: delete `const [paletteOpen, setPaletteOpen] = useState(false)` and the second `useEffect` (the ⌘K one); add `import { useCommandPalette } from './useCommandPalette'` and `const palette = useCommandPalette()`; replace `setPaletteOpen(true)` with `palette.setOpen(true)` and the palette element with `<CommandPalette open={palette.open} onClose={() => palette.setOpen(false)} />`.

- [ ] **Step 6: Run tests and lint**

Run: `npx vitest run src/components/InstrumentSearchBar.test.jsx src/components/research/WatchlistRail.test.jsx src/components/useCommandPalette.test.js` — Expected: PASS.
Run: `npx vitest run && npx eslint .` — Expected: green.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/InstrumentSearchBar.jsx frontend/src/components/InstrumentSearchBar.test.jsx \
  frontend/src/components/research/WatchlistRail.jsx frontend/src/components/research/WatchlistRail.test.jsx \
  frontend/src/components/research/SymbolBar.jsx frontend/src/components/useCommandPalette.js \
  frontend/src/components/useCommandPalette.test.js frontend/src/components/Layout.jsx
git commit -m "feat: let search, the watchlist rail and the symbol bar serve a full-page chart"
```

---

### Task 7: The `/research/chart` page

Use the `saxodash-design-system` skill for the page shell (spacing, card usage, header density).

**Files:**
- Modify: `frontend/src/lib/chartGeometry.js:62-81` (`useSize`, `useWidth` on top of it, `pricePaneHeight`)
- Modify: `frontend/src/lib/chartGeometry.test.js` (new `pricePaneHeight` block)
- Create: `frontend/src/pages/ResearchChart.jsx`
- Create: `frontend/src/pages/ResearchChart.test.jsx`
- Modify: `frontend/src/App.jsx` (route)

**Interfaces:**
- Consumes: everything from Tasks 1–6 — `useResearchInstrument`, `useChartData`, `useWatchlistToggle`, `useChartControls`, `ChartCanvas`, `ChartToolRail`, `chartHref`, `researchHref`, `ADVANCED_PANE_HEIGHTS`, `InstrumentSearchBar({hrefFor})`, `WatchlistRail({fill})`, `SymbolBar({compact})`, `useCommandPalette`.
- Produces: `useSize() → [ref, { width, height }]`; `useWidth() → [ref, width]` (unchanged contract); `pricePaneHeight({ total, panes, paneHeights }) → number` (≥ `MIN_PRICE_HEIGHT` = 240); default-exported page `ResearchChart`.

- [ ] **Step 1: Write the failing geometry tests**

Append to `frontend/src/lib/chartGeometry.test.js` (add `pricePaneHeight`, `MIN_PRICE_HEIGHT` to its import from `./chartGeometry`):

```js
describe('pricePaneHeight', () => {
  const paneHeights = { volume: 96, rsi: 120, macd: 120 }
  const none = { volume: false, rsi: false, macd: false }

  it('gives the price pane everything but the legend, time axis and padding', () => {
    expect(pricePaneHeight({ total: 800, panes: none, paneHeights })).toBe(800 - 26 - 22 - 4)
  })

  it('subtracts each enabled lower pane and its border', () => {
    const panes = { volume: true, rsi: true, macd: false }
    expect(pricePaneHeight({ total: 800, panes, paneHeights })).toBe(800 - 26 - 22 - 4 - 97 - 121)
  })

  it('never shrinks below the readable floor in a short window with every pane on', () => {
    const panes = { volume: true, rsi: true, macd: true }
    expect(pricePaneHeight({ total: 300, panes, paneHeights })).toBe(MIN_PRICE_HEIGHT)
    expect(pricePaneHeight({ total: 0, panes, paneHeights })).toBe(MIN_PRICE_HEIGHT)
  })
})
```

Run: `npx vitest run src/lib/chartGeometry.test.js` — Expected: FAIL (not exported).

- [ ] **Step 2: Implement `useSize` / `pricePaneHeight`**

In `chartGeometry.js`, replace `useWidth` with:

```js
export function useSize() {
  const ref = useRef(null)
  const [size, setSize] = useState({ width: FALLBACK_WIDTH, height: 0 })

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return

    const measure = () =>
      setSize((current) => {
        const width = element.clientWidth || FALLBACK_WIDTH
        const height = element.clientHeight
        return width === current.width && height === current.height ? current : { width, height }
      })
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    measure()
    return () => observer.disconnect()
  }, [])

  return [ref, size]
}

export function useWidth() {
  const [ref, size] = useSize()
  return [ref, size.width]
}

const LEGEND_HEIGHT = 26
const TIME_AXIS_HEIGHT = 22
const CANVAS_PADDING = 4
export const MIN_PRICE_HEIGHT = 240

export function pricePaneHeight({ total, panes, paneHeights }) {
  const lower = Object.keys(panes)
    .filter((key) => panes[key])
    .reduce((sum, key) => sum + paneHeights[key] + 1, 0)
  return Math.max(MIN_PRICE_HEIGHT, Math.floor(total - LEGEND_HEIGHT - TIME_AXIS_HEIGHT - CANVAS_PADDING - lower))
}
```

(Keep the existing doc comment above `useWidth` if there is one — move it above `useSize`.)

Run: `npx vitest run src/lib/chartGeometry.test.js` — Expected: PASS.

- [ ] **Step 3: Write the failing page tests**

`frontend/src/pages/ResearchChart.test.jsx`:

```jsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { renderWithProviders } from '../test/renderWithProviders'
import { WIDEST_RANGE_COUNT } from '../lib/research'
import ResearchChart from './ResearchChart'

vi.mock('../api/queries')
import * as queries from '../api/queries'

const bars = Array.from({ length: 40 }, (_, i) => ({
  date: `2026-07-${String(i + 1).padStart(2, '0')}`,
  open: 100 + i,
  high: 104 + i,
  low: 98 + i,
  close: 102 + i,
  volume: 1_000_000,
}))

const position = { ticker: 'NVDA', name: 'NVIDIA Corporation', uic: 211, asset_type: 'Stock', qty: 15 }
const tsla = { symbol: 'TSLA', description: 'Tesla Inc', exchange: 'NASDAQ', uic: 9, asset_type: 'Stock' }
const watchlist = {
  id: 1,
  name: 'Tech',
  items: [{ id: 5, symbol: 'TSLA', uic: 9, asset_type: 'Stock', exchange: 'NASDAQ', description: 'Tesla Inc' }],
}

const idle = { data: undefined, isLoading: false, error: null }
let lineMutations

function stubQueries() {
  lineMutations = { create: { mutate: vi.fn() }, update: { mutate: vi.fn() }, remove: { mutate: vi.fn() } }
  queries.usePositions.mockReturnValue({ ...idle, data: [position] })
  queries.useChart.mockReturnValue({ data: bars, isLoading: false, error: null })
  queries.useInstrumentDetails.mockReturnValue({
    ...idle,
    data: { symbol: 'NVDA', description: 'NVIDIA Corporation', exchange: 'NASDAQ', currency: 'USD', uic: 211 },
  })
  queries.useInstrumentSearch.mockImplementation((query) => ({
    ...idle,
    data: query?.toLowerCase().startsWith('ts') ? [tsla] : [],
    isError: false,
  }))
  queries.useQuotes.mockReturnValue({ ...idle, data: [{ uic: 211, price: 875.4, change_pct: 1.42 }] })
  queries.useQuotesByAssetType.mockReturnValue({ data: [], isLoading: false })
  queries.useWatchlists.mockReturnValue({ ...idle, data: [watchlist] })
  queries.useWatchlistMutations.mockReturnValue({
    create: { mutate: vi.fn() },
    rename: { mutate: vi.fn() },
    remove: { mutate: vi.fn() },
    addItem: { mutate: vi.fn() },
    removeItem: { mutate: vi.fn() },
  })
  queries.useSaxoStatus.mockReturnValue({ ...idle, data: { connected: true } })
  queries.useSymbolEarnings.mockReturnValue({ ...idle, data: { available: false, reason: 'x' } })
  queries.useSymbolNote.mockReturnValue({ ...idle, data: { symbol: 'NVDA', target_price: '130.00' } })
  queries.useNoteLevelMutation.mockReturnValue({ mutate: vi.fn() })
  queries.usePriceLines.mockReturnValue({ ...idle, data: [] })
  queries.usePriceLineMutations.mockReturnValue(lineMutations)
}

const plot = () => screen.getByTestId('price-scale').closest('svg').parentElement
const backLink = () => screen.getByRole('link', { name: 'Back to Research' })

describe('ResearchChart', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    stubQueries()
  })

  it('lays out the tool rail, the chart, instrument search and the watchlist', () => {
    renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })

    expect(screen.getByRole('navigation', { name: 'Chart tools' })).toBeInTheDocument()
    expect(screen.getByTestId('price-scale')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /search instruments/i })).toBeInTheDocument()
    expect(screen.getByText('Tech')).toBeInTheDocument()
  })

  it('fetches the same widest-range chart as Research, so the two views share a cache entry', () => {
    renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })

    expect(queries.useChart).toHaveBeenLastCalledWith(
      expect.objectContaining({ uic: 211, assetType: 'Stock', count: WIDEST_RANGE_COUNT, horizon: 1440 }),
    )
  })

  it('does not load company fundamentals', () => {
    renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })

    expect(queries.useFundamentals).not.toHaveBeenCalled()
  })

  it('falls back to the first held position when no symbol is given', () => {
    renderWithProviders(<ResearchChart />, { route: '/research/chart' })

    expect(backLink()).toHaveAttribute('href', '/research?symbol=NVDA&uic=211&assetType=Stock')
  })

  it('hides the day range in the compact symbol bar', () => {
    renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })

    expect(screen.queryByText('Day range')).not.toBeInTheDocument()
  })

  it('switches symbol within the chart view from a watchlist row', async () => {
    renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })

    await userEvent.click(screen.getByRole('button', { name: /^TSLA/ }))

    expect(backLink()).toHaveAttribute('href', '/research?symbol=TSLA&uic=9&assetType=Stock')
  })

  it('keeps a search pick in the chart view', async () => {
    renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })

    await userEvent.type(screen.getByRole('textbox', { name: /search instruments/i }), 'tsla')
    await userEvent.click(screen.getByText('Tesla Inc'))

    expect(backLink()).toHaveAttribute('href', '/research?symbol=TSLA&uic=9&assetType=Stock')
  })

  it('places one line with the armed line tool, then returns to the crosshair', async () => {
    renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })

    await userEvent.click(screen.getByRole('button', { name: 'Horizontal line' }))
    fireEvent.mouseDown(plot(), { detail: 1 })
    fireEvent.click(plot(), { detail: 1, clientX: 100, clientY: 120 })

    expect(lineMutations.create.mutate).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Crosshair' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('disarms the line tool when the symbol changes', async () => {
    renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })

    await userEvent.click(screen.getByRole('button', { name: 'Horizontal line' }))
    await userEvent.click(screen.getByRole('button', { name: /^TSLA/ }))

    expect(screen.getByRole('button', { name: 'Horizontal line' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('remembers a lower pane turned on here after the page is left and reopened', async () => {
    const first = renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })
    await userEvent.click(screen.getByRole('button', { name: 'Indicators' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /RSI/ }))
    first.unmount()

    renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })

    expect(screen.getByText(/^RSI 14/)).toBeInTheDocument()
  })
})
```

Notes for the implementer: the watchlist row is a `div role="button"` whose accessible name starts with "TSLA" (the logo `img` has `alt=""`); `/^TSLA/` deliberately excludes the row's "Remove TSLA" button. "Tesla Inc" appears only in the search dropdown — watchlist rows show the exchange, not the description. If a selector still proves ambiguous, adjust the selector only, never the behaviour under test.

Run: `npx vitest run src/pages/ResearchChart.test.jsx` — Expected: FAIL (module missing).

- [ ] **Step 4: Create `ResearchChart.jsx`**

```jsx
import { useMemo, useState } from 'react'

import { fmtPct } from '../lib/format'
import { ADVANCED_PANE_HEIGHTS } from '../lib/chartOptions'
import { pricePaneHeight, useSize } from '../lib/chartGeometry'
import { INTERVALS, chartHref, periodChange, researchHref } from '../lib/research'
import { Card, TBtn } from '../components/ui'
import CommandPalette from '../components/CommandPalette'
import InstrumentSearchBar from '../components/InstrumentSearchBar'
import SaxoConnectionStatus from '../components/SaxoConnectionStatus'
import { useCommandPalette } from '../components/useCommandPalette'
import ChartCanvas from '../components/research/ChartCanvas'
import ChartToolRail from '../components/research/ChartToolRail'
import SymbolBar from '../components/research/SymbolBar'
import WatchlistRail from '../components/research/WatchlistRail'
import { useChartControls } from '../components/research/useChartControls'
import { useChartData } from '../components/research/useChartData'
import { useResearchInstrument } from '../components/research/useResearchInstrument'
import { useWatchlistToggle } from '../components/research/useWatchlistToggle'

const chartResultHref = (result) => chartHref(result.symbol, { uic: result.uic, assetType: result.asset_type })

export default function ResearchChart() {
  const { symbol, instrument, position, positions, selectSymbol } = useResearchInstrument()
  const controls = useChartControls()
  const [hover, setHover] = useState(null)
  const [placingLine, setPlacingLine] = useState(false)

  const [shownSymbol, setShownSymbol] = useState(symbol)
  if (shownSymbol !== symbol) {
    setShownSymbol(symbol)
    controls.setYScale(1)
    setPlacingLine(false)
  }

  const { chart, bars, ind, earningsMarkers, priceLines, quote, details } = useChartData({
    symbol,
    instrument,
    range: controls.range,
  })
  const { watchlists, toggleList } = useWatchlistToggle({ symbol, instrument, details: details.data, position })
  const heldSymbols = useMemo(() => new Set(positions.map((p) => p.ticker)), [positions])
  const palette = useCommandPalette()

  const [canvasRef, canvasSize] = useSize()
  const priceHeight = pricePaneHeight({
    total: canvasSize.height,
    panes: controls.panes,
    paneHeights: ADVANCED_PANE_HEIGHTS,
  })
  const safeHover = hover != null && hover < bars.length ? hover : null
  const period = periodChange(bars)

  return (
    <div className="h-screen overflow-hidden bg-zinc-950 text-zinc-100 grid grid-cols-[48px_minmax(0,1fr)] lg:grid-cols-[48px_minmax(0,1fr)_300px]">
      <ChartToolRail
        controls={controls}
        placingLine={placingLine}
        onPlacingLineChange={setPlacingLine}
        canPlaceLine={Boolean(priceLines.create)}
        backHref={researchHref(symbol, undefined, instrument)}
      />

      <main className="flex flex-col gap-2 p-2 min-w-0 min-h-0">
        <SymbolBar
          compact
          symbol={symbol}
          instrument={instrument}
          details={details.data}
          position={position}
          quote={quote}
          bars={bars}
          watchlists={watchlists}
          onToggleList={toggleList}
        />

        <Card padding={false} className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="flex items-center gap-1 px-2.5 py-2 border-b border-white/[0.06]">
            <div className="flex items-center gap-0.5">
              {INTERVALS.map((interval) => (
                <TBtn key={interval} active={controls.range === interval} onClick={() => controls.setRange(interval)}>
                  {interval}
                </TBtn>
              ))}
            </div>
            {priceLines.saveFailed ? (
              <span role="alert" className="ml-2 text-[var(--fig-2xs)] text-red-400">
                Couldn't save line
              </span>
            ) : null}
            <div className="ml-auto flex items-center gap-3">
              {period == null ? null : (
                <span className="text-[var(--fig-2xs)] text-zinc-500">
                  Period{' '}
                  <span className={`num font-mono ${period >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {fmtPct(period)}
                  </span>
                </span>
              )}
              <SaxoConnectionStatus />
            </div>
          </div>

          <div ref={canvasRef} className="flex-1 min-h-0 overflow-hidden">
            <ChartCanvas
              bars={bars}
              ind={ind}
              controls={controls}
              hover={safeHover}
              setHover={setHover}
              symbol={symbol}
              isLoading={chart.isLoading}
              error={chart.error}
              unresolved={!instrument && !chart.isLoading}
              earningsMarkers={earningsMarkers}
              lines={priceLines.lines}
              onMoveLine={priceLines.move}
              onCreateLine={priceLines.create}
              onDeleteLine={priceLines.remove}
              priceHeight={priceHeight}
              paneHeights={ADVANCED_PANE_HEIGHTS}
              placingLine={placingLine}
              onPlaced={() => setPlacingLine(false)}
            />
          </div>
        </Card>
      </main>

      <aside className="hidden lg:flex flex-col gap-2 p-2 pl-0 min-h-0">
        <InstrumentSearchBar hrefFor={chartResultHref} />
        <div className="flex-1 min-h-0">
          <WatchlistRail fill symbol={symbol} onSelectSymbol={selectSymbol} heldSymbols={heldSymbols} />
        </div>
      </aside>

      <CommandPalette open={palette.open} onClose={() => palette.setOpen(false)} />
    </div>
  )
}
```

- [ ] **Step 5: Add the route**

In `App.jsx`: `import ResearchChart from './pages/ResearchChart'`, and inside the `<Route element={<RequireAuth />}>` block, as a sibling *before* `<Route element={<Layout />}>`:

```jsx
        <Route path='research/chart' element={<ResearchChart />} />
```

- [ ] **Step 6: Run tests and lint**

Run: `npx vitest run src/pages/ResearchChart.test.jsx src/lib/chartGeometry.test.js` — Expected: PASS.
Run: `npx vitest run && npx eslint .` — Expected: green.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/chartGeometry.js frontend/src/lib/chartGeometry.test.js \
  frontend/src/pages/ResearchChart.jsx frontend/src/pages/ResearchChart.test.jsx frontend/src/App.jsx
git commit -m "feat: add the full-page advanced chart view at /research/chart"
```

---

### Task 8: Visual pass in the running app, docs

Use the `saxodash-design-system` skill's critique → implement → screenshot → fix workflow and its screenshot-review harness recipe; `frontend-design` / `ui-ux-pro-max` for any polish decisions.

**Files:**
- Modify: whichever of `ResearchChart.jsx`, `ChartToolRail.jsx`, `menu.jsx`, `ChartPanel.jsx` the review finds wanting (styling only; any behaviour change gets a test first)
- Modify: `docs/next-steps.md` (mark §1 done, point at §2)

- [ ] **Step 1: Start the stack**

Run from the repo root: `scripts/dev.sh` (see `docs/running-the-stack.md`; if FortiClient VPN is connected, disconnect it — it hangs local dev servers). Log in, open `/research?symbol=NVDA`.

- [ ] **Step 2: Screenshot and critique**

Capture with the harness, at 1440×900 and 1100×800 (below the `lg` breakpoint the right column hides):
1. Research with the new expand button (toolbar right end).
2. `/research/chart?symbol=NVDA` defaults (Volume on).
3. Same with RSI + MACD on and Bollinger on.
4. Chart-type and Indicators menus open from the rail (panel must not clip against the viewport or sit under the chart card).
5. Line tool armed (crosshair cursor) and a placed line.
6. A symbol from a watchlist row; a symbol from the search bar (stays on `/research/chart`).

Check against `docs/design-system.md`: rail icon tones match `TBtn`/`Menu` idle/active, header density, no page scroll at 900px tall, the OHLC legend not wrapping into the price pane at 1100px (if it wraps, raise `LEGEND_HEIGHT` handling or tighten the legend — decide from the screenshot), the search bar's All/Stocks/ETFs filter fitting in 300px.

- [ ] **Step 3: Fix and re-screenshot** until the critique list is empty. Re-run `npx vitest run && npx eslint .` after any change.

- [ ] **Step 4: Manual behaviour checks** (the annotation leftovers note in `docs/next-steps.md` asks for this after any chart change): drag the price axis, drag target/stop/free lines, click a badge to edit, double-click to create, Delete a selected line — in both views. Toggle MACD in the big view, collapse, confirm it is on in Research; reload, still on.

- [ ] **Step 5: Update `docs/next-steps.md`**

Replace §1's body with a short "Done 2026-09-28 — `/research/chart`, spec `docs/superpowers/specs/2026-09-28-advanced-chart-view-design.md`" note and make §2 (axis panning) the recommended next step.

- [ ] **Step 6: Commit**

```bash
git add -A frontend/src docs/next-steps.md
git commit -m "feat: polish the advanced chart view after a visual pass"
```

If anything in Tasks 1–8 was genuinely surprising (a framework behaviour contradicting the obvious reading, a rejected approach), append a learning record under `learning/learning-records/` per AGENTS.md — it is gitignored, so it is not part of the commit.
