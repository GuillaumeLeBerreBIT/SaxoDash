# Chart Splits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `/research/chart` show 1–4 chart panes in five preset arrangements, each pane its own symbol, picked from a Layout menu in the tool rail.

**Architecture:** Pure preset and slot logic lives in `lib/chartLayouts.js`, and per-browser persistence in `lib/chartWorkspace.js`. A `useChartWorkspace` hook keeps `{ layout, slots, active }`: the active pane is whatever the URL names (every existing entry point navigates, so none change), and the other panes render from their stored uic + asset type. `ChartPane` owns one pane's data and canvas. `ResearchChart` becomes a toolbar row above a CSS grid of panes.

**Tech Stack:** React 19.2 (JavaScript), react-router-dom 7, TanStack Query 5, Tailwind, lucide-react, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-29-chart-splits-design.md`

## Global Constraints

- **Prerequisite:** start only after `feat/axis-panning` has merged into `main`. Both change `frontend/src/pages/ResearchChart.jsx`, and panning may change `ChartCanvas`'s props. The code below is written against `main` at `4e4ff93`. Where panning added or renamed a `ChartCanvas` prop or page-level state, carry it through exactly as the merged `ResearchChart` passes it. Shared chart state goes on the page and is passed to every pane; per-chart state goes inside `ChartPane`.
- Generated code carries **zero comments** (AGENTS.md "Code style"). Existing comments in touched files stay as they are.
- ESLint runs `eslint-plugin-react-hooks` 7 `recommended`, which includes `set-state-in-effect`, `set-state-in-render`, `refs` and `exhaustive-deps`. So: no `setState` inside `useEffect`; for derived state, use the conditional "adjust state during render" pattern `ResearchChart` already uses (`if (shownSymbol !== symbol) { … }`); no `ref.current` reads during render; use `useEffectEvent` (React 19.2) for effect logic that calls a non-stable callback.
- No new npm dependencies. Chart colours only from `lib/charts.js`; everything else uses the Tailwind classes already in use (`ring-1 ring-blue-500` is the active treatment).
- Presets, exactly: `1` "Single chart", `2h` "Side by side", `2v` "Stacked", `3` "One large, two small", `4` "Grid of four".
- Storage key: `saxodash:chart-workspace`. Every read and write goes in try/catch and falls back to the defaults.
- An instrument is a uic *and* an asset type (AGENTS.md): a slot is `{ symbol, uic, assetType }`.
- Frontend commands run from `frontend/`: `npx vitest run <paths>`, `npx eslint <files>`, `npm run build`.

## Review Focus

- **A stored pane with no uic** (a slot saved while its symbol was still resolving) must render the chart's "unresolved" placeholder, not crash or fetch with an undefined uic. Pinned in Task 5.
- **localStorage unavailable** (private window, blocked site data) must give a working single-pane chart. Pinned in Task 2.
- **Two panes on the same instrument** must both render. Their requests dedupe through TanStack Query. Pinned in Task 7.
- **Shrinking below the active pane** must move the active pane to the last one kept and put its symbol in the URL. Pinned in Task 3.
- **Opening `/research/chart` with no `?symbol=`** must restore the saved active symbol, not the first-position/NVDA fallback. Pinned in Task 3.

---

### Task 1: Layout presets and slot maths

**Files:**
- Create: `frontend/src/lib/chartLayouts.js`
- Test: `frontend/src/lib/chartLayouts.test.js`

**Interfaces:**
- Produces: `CHART_LAYOUTS: { id, label, panes, columns, rows, tallPane }[]`, `layoutById(id) → preset` (falls back to `'1'`), `resizeSlots(slots, count) → slots`, `activeAfterResize(active, previousCount, slots) → index`, `gridStyle(preset) → { gridTemplateColumns, gridTemplateRows }`, `paneStyle(preset, index) → { gridRow: 'span 2' } | undefined`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, expect, it } from 'vitest'
import { CHART_LAYOUTS, activeAfterResize, gridStyle, layoutById, paneStyle, resizeSlots } from './chartLayouts'

const nvda = { symbol: 'NVDA', uic: 211, assetType: 'Stock' }
const amd = { symbol: 'AMD', uic: 7, assetType: 'Stock' }
const tsla = { symbol: 'TSLA', uic: 9, assetType: 'Stock' }
const cells = (template) => template.split(' ').length

describe('CHART_LAYOUTS', () => {
  it('lists the five presets in menu order', () => {
    expect(CHART_LAYOUTS.map((preset) => [preset.id, preset.label])).toEqual([
      ['1', 'Single chart'],
      ['2h', 'Side by side'],
      ['2v', 'Stacked'],
      ['3', 'One large, two small'],
      ['4', 'Grid of four'],
    ])
  })

  it('gives every preset exactly one grid cell per pane', () => {
    for (const preset of CHART_LAYOUTS) {
      const spanned = preset.tallPane == null ? 0 : 1
      expect(cells(preset.columns) * cells(preset.rows) - spanned).toBe(preset.panes)
    }
  })
})

describe('layoutById', () => {
  it('finds a preset by id', () => {
    expect(layoutById('2v').panes).toBe(2)
  })

  it('falls back to a single chart for an unknown id', () => {
    expect(layoutById('9x9').id).toBe('1')
    expect(layoutById(undefined).id).toBe('1')
  })
})

describe('resizeSlots', () => {
  it('pads a grown layout with empty slots', () => {
    expect(resizeSlots([nvda], 3)).toEqual([nvda, null, null])
  })

  it('keeps the first slots when shrinking', () => {
    expect(resizeSlots([nvda, amd, tsla, null], 2)).toEqual([nvda, amd])
  })

  it('returns a new array', () => {
    const slots = [nvda]
    expect(resizeSlots(slots, 1)).not.toBe(slots)
  })
})

describe('activeAfterResize', () => {
  it('activates the first empty slot when the layout grows', () => {
    expect(activeAfterResize(0, 1, [nvda, null, null, null])).toBe(1)
  })

  it('prefers an already-empty slot over a new one', () => {
    expect(activeAfterResize(0, 2, [nvda, null, null, null])).toBe(1)
  })

  it('clamps the active slot when the layout shrinks past it', () => {
    expect(activeAfterResize(3, 4, [nvda, amd])).toBe(1)
  })

  it('keeps an active slot that survives the shrink', () => {
    expect(activeAfterResize(0, 4, [nvda, amd])).toBe(0)
  })
})

describe('gridStyle and paneStyle', () => {
  it('turns a preset into grid templates', () => {
    expect(gridStyle(layoutById('3'))).toEqual({ gridTemplateColumns: '2fr 1fr', gridTemplateRows: '1fr 1fr' })
  })

  it('lets only the tall pane span both rows', () => {
    expect(paneStyle(layoutById('3'), 0)).toEqual({ gridRow: 'span 2' })
    expect(paneStyle(layoutById('3'), 1)).toBeUndefined()
    expect(paneStyle(layoutById('4'), 0)).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run src/lib/chartLayouts.test.js`
Expected: FAIL — cannot resolve `./chartLayouts`.

- [ ] **Step 3: Implement**

```js
export const CHART_LAYOUTS = [
  { id: '1', label: 'Single chart', panes: 1, columns: '1fr', rows: '1fr', tallPane: null },
  { id: '2h', label: 'Side by side', panes: 2, columns: '1fr 1fr', rows: '1fr', tallPane: null },
  { id: '2v', label: 'Stacked', panes: 2, columns: '1fr', rows: '1fr 1fr', tallPane: null },
  { id: '3', label: 'One large, two small', panes: 3, columns: '2fr 1fr', rows: '1fr 1fr', tallPane: 0 },
  { id: '4', label: 'Grid of four', panes: 4, columns: '1fr 1fr', rows: '1fr 1fr', tallPane: null },
]

export function layoutById(id) {
  return CHART_LAYOUTS.find((preset) => preset.id === id) ?? CHART_LAYOUTS[0]
}

export function resizeSlots(slots, count) {
  return Array.from({ length: count }, (_, index) => slots[index] ?? null)
}

export function activeAfterResize(active, previousCount, slots) {
  if (slots.length > previousCount) {
    const empty = slots.indexOf(null)
    if (empty !== -1) return empty
  }
  return Math.min(active, slots.length - 1)
}

export function gridStyle(preset) {
  return { gridTemplateColumns: preset.columns, gridTemplateRows: preset.rows }
}

export function paneStyle(preset, index) {
  return index === preset.tallPane ? { gridRow: 'span 2' } : undefined
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npx vitest run src/lib/chartLayouts.test.js && npx eslint src/lib/chartLayouts.js src/lib/chartLayouts.test.js`
Expected: PASS, no lint output.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/chartLayouts.js frontend/src/lib/chartLayouts.test.js
git commit -m "feat: chart layout presets and slot maths"
```

---

### Task 2: Per-browser workspace storage

**Files:**
- Create: `frontend/src/lib/chartWorkspace.js`
- Test: `frontend/src/lib/chartWorkspace.test.js`

**Interfaces:**
- Consumes: `layoutById`, `resizeSlots` (Task 1).
- Produces: `sanitizeWorkspace(raw) → { layout, slots, active }`, `readWorkspace()`, `writeWorkspace({ layout, slots, active }) → boolean`, `sameSlot(a, b) → boolean`, `withActiveSlot(workspace, slot) → workspace` (same object back when nothing changes).

- [ ] **Step 1: Write the failing test**

```js
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readWorkspace, sameSlot, sanitizeWorkspace, withActiveSlot, writeWorkspace } from './chartWorkspace'

const nvda = { symbol: 'NVDA', uic: 211, assetType: 'Stock' }
const amd = { symbol: 'AMD', uic: 7, assetType: 'Stock' }
const DEFAULTS = { layout: '1', slots: [null], active: 0 }

describe('sanitizeWorkspace', () => {
  it('defaults to one empty pane', () => {
    expect(sanitizeWorkspace(null)).toEqual(DEFAULTS)
    expect(sanitizeWorkspace('garbage')).toEqual(DEFAULTS)
  })

  it('falls back to a single chart for an unknown layout', () => {
    expect(sanitizeWorkspace({ layout: '7', slots: [nvda, amd], active: 1 })).toEqual({
      layout: '1',
      slots: [nvda],
      active: 0,
    })
  })

  it('fits the slots to the layout', () => {
    expect(sanitizeWorkspace({ layout: '4', slots: [nvda], active: 0 }).slots).toEqual([nvda, null, null, null])
    expect(sanitizeWorkspace({ layout: '2h', slots: [nvda, amd, nvda], active: 0 }).slots).toEqual([nvda, amd])
  })

  it('empties a malformed slot and drops a non-integer uic', () => {
    const { slots } = sanitizeWorkspace({
      layout: '2h',
      slots: [{ symbol: '' }, { symbol: 'AMD', uic: '7', assetType: 5 }],
      active: 0,
    })
    expect(slots).toEqual([null, { symbol: 'AMD', uic: null, assetType: null }])
  })

  it('resets an active index outside the layout', () => {
    expect(sanitizeWorkspace({ layout: '2h', slots: [nvda, amd], active: 3 }).active).toBe(0)
    expect(sanitizeWorkspace({ layout: '2h', slots: [nvda, amd], active: -1 }).active).toBe(0)
  })
})

describe('readWorkspace and writeWorkspace', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('round-trips a workspace', () => {
    const workspace = { layout: '2v', slots: [nvda, amd], active: 1 }
    expect(writeWorkspace(workspace)).toBe(true)
    expect(readWorkspace()).toEqual(workspace)
  })

  it('reads the defaults when nothing is stored', () => {
    expect(readWorkspace()).toEqual(DEFAULTS)
  })

  it('survives storage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readWorkspace()).toEqual(DEFAULTS)
    expect(writeWorkspace(DEFAULTS)).toBe(false)
  })
})

describe('withActiveSlot', () => {
  const workspace = { layout: '2h', slots: [nvda, null], active: 1 }

  it('puts the slot into the active pane', () => {
    expect(withActiveSlot(workspace, amd)).toEqual({ layout: '2h', slots: [nvda, amd], active: 1 })
  })

  it('returns the same workspace when the active pane already holds it', () => {
    const filled = { layout: '2h', slots: [nvda, amd], active: 1 }
    expect(withActiveSlot(filled, { ...amd })).toBe(filled)
  })
})

describe('sameSlot', () => {
  it('compares symbol, uic and asset type', () => {
    expect(sameSlot(nvda, { ...nvda })).toBe(true)
    expect(sameSlot(nvda, { ...nvda, assetType: 'Cfd' })).toBe(false)
    expect(sameSlot(null, nvda)).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run src/lib/chartWorkspace.test.js`
Expected: FAIL — cannot resolve `./chartWorkspace`.

- [ ] **Step 3: Implement**

```js
import { layoutById, resizeSlots } from './chartLayouts'

const KEY = 'saxodash:chart-workspace'

function sanitizeSlot(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.symbol !== 'string' || raw.symbol === '') return null
  return {
    symbol: raw.symbol,
    uic: Number.isInteger(raw.uic) ? raw.uic : null,
    assetType: typeof raw.assetType === 'string' && raw.assetType ? raw.assetType : null,
  }
}

export function sanitizeWorkspace(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const preset = layoutById(source.layout)
  const slots = resizeSlots(Array.isArray(source.slots) ? source.slots.map(sanitizeSlot) : [], preset.panes)
  const active =
    Number.isInteger(source.active) && source.active >= 0 && source.active < preset.panes ? source.active : 0
  return { layout: preset.id, slots, active }
}

export function readWorkspace() {
  try {
    return sanitizeWorkspace(JSON.parse(localStorage.getItem(KEY)))
  } catch {
    return sanitizeWorkspace(null)
  }
}

export function writeWorkspace({ layout, slots, active }) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ layout, slots, active }))
    return true
  } catch {
    return false
  }
}

export function sameSlot(a, b) {
  return Boolean(a && b) && a.symbol === b.symbol && a.uic === b.uic && a.assetType === b.assetType
}

export function withActiveSlot(workspace, slot) {
  if (sameSlot(workspace.slots[workspace.active], slot)) return workspace
  const slots = workspace.slots.slice()
  slots[workspace.active] = slot
  return { ...workspace, slots }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npx vitest run src/lib/chartWorkspace.test.js && npx eslint src/lib/chartWorkspace.js src/lib/chartWorkspace.test.js`
Expected: PASS, no lint output.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/chartWorkspace.js frontend/src/lib/chartWorkspace.test.js
git commit -m "feat: per-browser storage for the chart workspace"
```

---

### Task 3: `useChartWorkspace` — the active pane follows the URL

**Files:**
- Create: `frontend/src/components/research/useChartWorkspace.js`
- Test: `frontend/src/components/research/useChartWorkspace.test.jsx`

**Interfaces:**
- Consumes: `layoutById`, `resizeSlots`, `activeAfterResize` (Task 1); `readWorkspace`, `writeWorkspace`, `sameSlot`, `withActiveSlot` (Task 2); `useLocation`, `useSearchParams` (react-router-dom).
- Produces: `useChartWorkspace({ symbol, instrument, selectSymbol }) → { layout: string, slots: (slot|null)[], active: number, activate(index), setLayout(id) }`. `symbol`, `instrument` and `selectSymbol` are exactly what `useResearchInstrument()` returns.

How it works:
- **Mirroring:** on every render, compare `{ location.key, slot from the URL }` with the last one seen. When it differs, copy the URL's slot into the active pane. Because the trigger is `location.key`, re-picking the symbol already in the URL (a new navigation, same params) still fills an empty active pane.
- **Arrival:** without `?symbol=`, a stored active slot is restored with one `selectSymbol` call. Mirroring is off until the URL names a symbol, so the page's fallback symbol never overwrites the saved pane.
- **`activate` / `setLayout`:** these change `active` and, if the new active pane holds a symbol, navigate to it in the same event. An active change on its own never mirrors, so an intermediate render (react-router 7 wraps navigations in a transition) can't copy the old URL into the new pane.

- [ ] **Step 1: Write the failing test**

```jsx
import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { MemoryRouter, useSearchParams } from 'react-router-dom'

import { useChartWorkspace } from './useChartWorkspace'

const KEY = 'saxodash:chart-workspace'
const nvda = { symbol: 'NVDA', uic: 211, assetType: 'Stock' }
const amd = { symbol: 'AMD', uic: 7, assetType: 'Stock' }
const tsla = { symbol: 'TSLA', uic: 9, assetType: 'Stock' }

let navigations

function useHarness() {
  const [params, setParams] = useSearchParams()
  const symbol = params.get('symbol') ?? 'NVDA'
  const uic = Number(params.get('uic')) || null
  const instrument = uic ? { uic, assetType: params.get('assetType') } : null
  const selectSymbol = (next, picked) => {
    navigations.push(next)
    setParams({ symbol: next, uic: String(picked.uic), assetType: picked.assetType }, { replace: true })
  }
  return { workspace: useChartWorkspace({ symbol, instrument, selectSymbol }), selectSymbol, params }
}

const renderWorkspace = (route = '/research/chart?symbol=NVDA&uic=211&assetType=Stock') =>
  renderHook(useHarness, {
    wrapper: ({ children }) => <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>,
  })

const store = (workspace) => localStorage.setItem(KEY, JSON.stringify(workspace))
const stored = () => JSON.parse(localStorage.getItem(KEY))

describe('useChartWorkspace', () => {
  beforeEach(() => {
    localStorage.clear()
    navigations = []
  })

  it('starts as one pane showing the URL symbol', () => {
    const { result } = renderWorkspace()
    expect(result.current.workspace.layout).toBe('1')
    expect(result.current.workspace.slots).toEqual([nvda])
  })

  it('loads a new pick into the active pane', () => {
    const { result } = renderWorkspace()
    act(() => result.current.selectSymbol('TSLA', tsla))
    expect(result.current.workspace.slots).toEqual([tsla])
  })

  it('grows into empty panes and activates the first one without navigating', () => {
    const { result } = renderWorkspace()
    act(() => result.current.workspace.setLayout('4'))
    expect(result.current.workspace.slots).toEqual([nvda, null, null, null])
    expect(result.current.workspace.active).toBe(1)
    expect(navigations).toEqual([])
  })

  it('fills the empty active pane even when the pick is already in the URL', () => {
    const { result } = renderWorkspace()
    act(() => result.current.workspace.setLayout('2h'))
    act(() => result.current.selectSymbol('NVDA', nvda))
    expect(result.current.workspace.slots).toEqual([nvda, nvda])
  })

  it('activating a filled pane puts its symbol in the URL', () => {
    store({ layout: '2h', slots: [nvda, amd], active: 0 })
    const { result } = renderWorkspace()
    act(() => result.current.workspace.activate(1))
    expect(result.current.workspace.active).toBe(1)
    expect(result.current.params.get('symbol')).toBe('AMD')
    expect(result.current.workspace.slots).toEqual([nvda, amd])
  })

  it('activating an empty pane leaves the URL alone', () => {
    store({ layout: '2h', slots: [nvda, null], active: 0 })
    const { result } = renderWorkspace()
    act(() => result.current.workspace.activate(1))
    expect(result.current.workspace.active).toBe(1)
    expect(navigations).toEqual([])
    expect(result.current.workspace.slots).toEqual([nvda, null])
  })

  it('shrinking past the active pane activates the last pane kept and follows its symbol', () => {
    store({ layout: '4', slots: [nvda, amd, tsla, nvda], active: 3 })
    const { result } = renderWorkspace()
    act(() => result.current.workspace.setLayout('2h'))
    expect(result.current.workspace.active).toBe(1)
    expect(result.current.params.get('symbol')).toBe('AMD')
  })

  it('restores the stored active symbol when the URL names none', () => {
    store({ layout: '2h', slots: [nvda, amd], active: 1 })
    const { result } = renderWorkspace('/research/chart')
    expect(result.current.params.get('symbol')).toBe('AMD')
    expect(result.current.workspace.slots).toEqual([nvda, amd])
  })

  it('lets a deep link win over the stored active symbol', () => {
    store({ layout: '2h', slots: [nvda, amd], active: 1 })
    const { result } = renderWorkspace('/research/chart?symbol=TSLA&uic=9&assetType=Stock')
    expect(result.current.workspace.slots).toEqual([nvda, tsla])
    expect(navigations).toEqual([])
  })

  it('persists the workspace', () => {
    const { result } = renderWorkspace()
    act(() => result.current.workspace.setLayout('2v'))
    expect(stored()).toEqual({ layout: '2v', slots: [nvda, null], active: 1 })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run src/components/research/useChartWorkspace.test.jsx`
Expected: FAIL — cannot resolve `./useChartWorkspace`.

- [ ] **Step 3: Implement**

```js
import { useEffect, useEffectEvent, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'

import { activeAfterResize, layoutById, resizeSlots } from '../../lib/chartLayouts'
import { readWorkspace, sameSlot, withActiveSlot, writeWorkspace } from '../../lib/chartWorkspace'

function sameView(a, b) {
  return Boolean(a) && a.key === b.key && sameSlot(a.slot, b.slot)
}

function initialState(hasSymbolParam) {
  const workspace = readWorkspace()
  const stored = workspace.slots[workspace.active]
  return { workspace, seen: null, restoreTo: !hasSymbolParam && stored ? stored : null }
}

export function useChartWorkspace({ symbol, instrument, selectSymbol }) {
  const location = useLocation()
  const [params] = useSearchParams()
  const hasSymbolParam = params.has('symbol')
  const [state, setState] = useState(() => initialState(hasSymbolParam))
  const { workspace, seen, restoreTo } = state

  const view = {
    key: location.key,
    slot: { symbol, uic: instrument?.uic ?? null, assetType: instrument?.assetType ?? null },
  }
  if ((hasSymbolParam || !restoreTo) && !sameView(seen, view)) {
    setState((previous) => ({ ...previous, seen: view, workspace: withActiveSlot(previous.workspace, view.slot) }))
  }

  const restore = useEffectEvent(() => {
    if (restoreTo) selectSymbol(restoreTo.symbol, { uic: restoreTo.uic, assetType: restoreTo.assetType })
  })
  useEffect(() => {
    restore()
  }, [])

  useEffect(() => {
    writeWorkspace(workspace)
  }, [workspace])

  const show = (slot) => {
    if (slot) selectSymbol(slot.symbol, { uic: slot.uic, assetType: slot.assetType })
  }

  const activate = (index) => {
    if (index === workspace.active) return
    setState((previous) => ({ ...previous, workspace: { ...previous.workspace, active: index } }))
    show(workspace.slots[index])
  }

  const setLayout = (id) => {
    const preset = layoutById(id)
    const slots = resizeSlots(workspace.slots, preset.panes)
    const active = activeAfterResize(workspace.active, workspace.slots.length, slots)
    setState((previous) => ({ ...previous, workspace: { layout: preset.id, slots, active } }))
    if (active !== workspace.active) show(slots[active])
  }

  return { layout: workspace.layout, slots: workspace.slots, active: workspace.active, activate, setLayout }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npx vitest run src/components/research/useChartWorkspace.test.jsx && npx eslint src/components/research/useChartWorkspace.js src/components/research/useChartWorkspace.test.jsx`
Expected: PASS, no lint output.

If "fills the empty active pane even when the pick is already in the URL" fails, check that a `setSearchParams` call with identical params produced a new `location.key` (log `location.key` in the harness). The design depends on it. If react-router reuses the key, stop and report BLOCKED with the evidence rather than weakening the test.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/research/useChartWorkspace.js frontend/src/components/research/useChartWorkspace.test.jsx
git commit -m "feat: chart workspace state where the active pane follows the URL"
```

---

### Task 4: One move caption for the symbol bar and the panes

**Files:**
- Modify: `frontend/src/lib/research.js` (add `moveCaption`)
- Modify: `frontend/src/components/research/SymbolBar.jsx` (use it)
- Test: `frontend/src/lib/research.test.js`

**Interfaces:**
- Produces: `moveCaption(quote, bars) → { change: number|null, suffix: string|null }`. A quote move carries `moveLabel([quote]).toLowerCase()` ("today" / "latest session"). A move derived from bars has no suffix.

- [ ] **Step 1: Write the failing test**

Add `moveCaption` (and `barChange` if not already imported) to the `./research` import in `research.test.js`, then append:

```js
describe('moveCaption', () => {
  const bars = [{ close: 100 }, { close: 101 }]

  it('labels a live quote move as today', () => {
    expect(moveCaption({ change_pct: 1.5, change_basis: 'live' }, bars)).toEqual({ change: 1.5, suffix: 'today' })
  })

  it('labels a last-close quote move as the latest session', () => {
    expect(moveCaption({ change_pct: -0.4, change_basis: 'last_close' }, bars)).toEqual({
      change: -0.4,
      suffix: 'latest session',
    })
  })

  it('keeps a flat quote move instead of falling back to the bars', () => {
    expect(moveCaption({ change_pct: 0, change_basis: 'live' }, bars).change).toBe(0)
  })

  it('falls back to the latest bar with no suffix', () => {
    expect(moveCaption(null, bars)).toEqual({ change: barChange(bars), suffix: null })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run src/lib/research.test.js`
Expected: FAIL — `moveCaption` is not exported.

- [ ] **Step 3: Implement**

In `lib/research.js`, add `import { moveLabel } from './pricing'` beside the existing imports, and, after `barChange`:

```js
export function moveCaption(quote, bars) {
  const quoted = quote?.change_pct ?? null
  if (quoted != null) return { change: quoted, suffix: moveLabel([quote]).toLowerCase() }
  return { change: barChange(bars), suffix: null }
}
```

In `SymbolBar.jsx`, replace

```js
  const quoteChange = quote?.change_pct ?? null
  const change = quoteChange ?? barChange(bars)
  const changeSuffix = quoteChange == null ? null : moveLabel([quote]).toLowerCase()
```

with

```js
  const { change, suffix: changeSuffix } = moveCaption(quote, bars)
```

and update its imports: `import { isEtf, moveCaption } from '../../lib/research'`. Drop the `moveLabel` import and `barChange` if nothing else in the file uses them.

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npx vitest run src/lib/research.test.js src/components/research/SymbolBar.test.jsx && npx eslint src/lib/research.js src/components/research/SymbolBar.jsx`
Expected: PASS (SymbolBar's existing tests unchanged), no lint output.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/research.js frontend/src/lib/research.test.js frontend/src/components/research/SymbolBar.jsx
git commit -m "refactor: share the move caption between the symbol bar and chart panes"
```

---

### Task 5: `ChartPane`

**Files:**
- Create: `frontend/src/components/research/ChartPane.jsx`
- Test: `frontend/src/components/research/ChartPane.test.jsx`

**Interfaces:**
- Consumes: `useChartData` (existing; returns `{ chart, bars, ind, earningsMarkers, priceLines, quote, details }`); `moveCaption` (Task 4); `ChartCanvas`, `LineSaveAlert`, `PeriodChange`, `useSize`, `Card`, `InstrumentLogo` (existing).
- Produces: `ChartPane({ slot, active, outlined, controls, onActivate, placingLine, onPlaced, paneHeights, style, className = 'flex' })`. `slot` is `{ symbol, uic, assetType } | null`. It renders a `<section>` with `aria-label` `"<SYMBOL> chart"` or `"Empty chart"`, and `aria-current="true"` when active. `outlined` draws the blue ring; the page passes it only when more than one pane is shown.

- [ ] **Step 1: Write the failing test**

```jsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'

import { renderWithProviders } from '../../test/renderWithProviders'
import { DEFAULT_CHART_PREFS } from '../../lib/chartPrefs'
import { DEFAULT_PANE_HEIGHTS } from '../../lib/chartOptions'
import ChartPane from './ChartPane'

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
const nvda = { symbol: 'NVDA', uic: 211, assetType: 'Stock' }
const controls = { ...DEFAULT_CHART_PREFS, yScale: 1, setRange: vi.fn(), setType: vi.fn(), setYScale: vi.fn(), toggleOverlay: vi.fn(), togglePane: vi.fn() }

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
  queries.useQuotes.mockReturnValue({
    ...idle,
    data: [{ uic: 211, price: 875.4, change_pct: 1.42, change_basis: 'last_close' }],
  })
}

const renderPane = (props = {}) =>
  renderWithProviders(
    <ChartPane
      slot={nvda}
      active={false}
      outlined={false}
      controls={controls}
      onActivate={vi.fn()}
      placingLine={false}
      onPlaced={vi.fn()}
      paneHeights={DEFAULT_PANE_HEIGHTS}
      {...props}
    />,
  )

describe('ChartPane', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stub()
  })

  it('asks for a symbol when empty', () => {
    renderPane({ slot: null })
    const pane = screen.getByRole('region', { name: 'Empty chart' })
    expect(within(pane).getByText('Pick a symbol from the watchlist')).toBeInTheDocument()
    expect(screen.queryByTestId('price-scale')).not.toBeInTheDocument()
  })

  it('heads a filled pane with its ticker, price and labelled move', () => {
    renderPane()
    const pane = screen.getByRole('region', { name: 'NVDA chart' })
    expect(within(pane).getByText('NVDA')).toBeInTheDocument()
    expect(within(pane).getByText('875.40')).toBeInTheDocument()
    expect(within(pane).getByText('+1.42% latest session')).toBeInTheDocument()
    expect(within(pane).getByTestId('price-scale')).toBeInTheDocument()
  })

  it('shows the unresolved state for a stored pane with no uic', () => {
    renderPane({ slot: { symbol: 'XYZ', uic: null, assetType: null } })
    expect(screen.getByRole('region', { name: 'XYZ chart' })).toBeInTheDocument()
    expect(screen.queryByTestId('price-scale')).not.toBeInTheDocument()
    expect(queries.useChart).toHaveBeenLastCalledWith(expect.objectContaining({ uic: undefined }))
  })

  it('activates on press', () => {
    const onActivate = vi.fn()
    renderPane({ onActivate })
    fireEvent.mouseDown(screen.getByRole('region', { name: 'NVDA chart' }))
    expect(onActivate).toHaveBeenCalled()
  })

  it('marks the active pane', () => {
    renderPane({ active: true })
    expect(screen.getByRole('region', { name: 'NVDA chart' })).toHaveAttribute('aria-current', 'true')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run src/components/research/ChartPane.test.jsx`
Expected: FAIL — cannot resolve `./ChartPane`.

- [ ] **Step 3: Implement**

```jsx
import { useState } from 'react'

import { useSize } from '../../lib/chartGeometry'
import { fmtNum, fmtPct } from '../../lib/format'
import { moveCaption } from '../../lib/research'
import { Card, InstrumentLogo } from '../ui'
import ChartCanvas from './ChartCanvas'
import { LineSaveAlert, PeriodChange } from './chartHeader'
import { useChartData } from './useChartData'

function PaneHeader({ symbol, quote, bars, lineSaveFailed }) {
  const last = bars[bars.length - 1]
  const price = quote?.price ?? last?.close ?? null
  const { change, suffix } = moveCaption(quote, bars)
  return (
    <div className="flex items-center gap-2 px-2.5 h-8 border-b border-white/[0.06] min-w-0">
      <InstrumentLogo
        symbol={symbol}
        size={14}
        className="rounded-sm"
        fallback={<span className="w-1.5 h-1.5 rounded-full shrink-0 bg-zinc-700" />}
      />
      <span className="text-[var(--fig-xs)] font-medium text-zinc-100">{symbol}</span>
      <span className="text-[var(--fig-xs)] num font-mono text-zinc-300">{price == null ? '—' : fmtNum(price, 2)}</span>
      {change == null ? null : (
        <span
          className={`text-[var(--fig-2xs)] num font-mono whitespace-nowrap ${
            change >= 0 ? 'text-emerald-400' : 'text-red-400'
          }`}
        >
          {fmtPct(change)}{suffix ? ` ${suffix}` : ''}
        </span>
      )}
      <LineSaveAlert failed={lineSaveFailed} />
      <div className="ml-auto">
        <PeriodChange bars={bars} />
      </div>
    </div>
  )
}

function FilledPane({ slot, controls, placingLine, onPlaced, paneHeights }) {
  const instrument = slot.uic ? { uic: slot.uic, assetType: slot.assetType } : null
  const { chart, bars, ind, earningsMarkers, priceLines, quote } = useChartData({
    symbol: slot.symbol,
    instrument,
    range: controls.range,
  })
  const [hover, setHover] = useState(null)
  const [canvasRef, canvasSize] = useSize()
  const safeHover = hover != null && hover < bars.length ? hover : null

  return (
    <>
      <PaneHeader symbol={slot.symbol} quote={quote} bars={bars} lineSaveFailed={priceLines.saveFailed} />
      <div ref={canvasRef} className="flex-1 min-h-0 overflow-hidden">
        <ChartCanvas
          bars={bars}
          ind={ind}
          controls={controls}
          hover={safeHover}
          setHover={setHover}
          symbol={slot.symbol}
          isLoading={chart.isLoading}
          error={chart.error}
          unresolved={!instrument && !chart.isLoading}
          earningsMarkers={earningsMarkers}
          lines={priceLines.lines}
          onMoveLine={priceLines.move}
          onCreateLine={priceLines.create}
          onDeleteLine={priceLines.remove}
          fitHeight={canvasSize.height}
          paneHeights={paneHeights}
          placingLine={placingLine}
          onPlaced={onPlaced}
        />
      </div>
    </>
  )
}

export default function ChartPane({
  slot,
  active,
  outlined,
  controls,
  onActivate,
  placingLine,
  onPlaced,
  paneHeights,
  style,
  className = 'flex',
}) {
  return (
    <section
      aria-label={slot ? `${slot.symbol} chart` : 'Empty chart'}
      aria-current={active || undefined}
      onMouseDown={onActivate}
      style={style}
      className={`flex-col flex-1 min-h-0 min-w-0 ${className}`}
    >
      <Card padding={false} className={`flex-1 min-h-0 flex flex-col overflow-hidden ${outlined ? 'ring-1 ring-blue-500' : ''}`}>
        {slot ? (
          <FilledPane
            key={`${slot.symbol}:${slot.uic}:${slot.assetType}`}
            slot={slot}
            controls={controls}
            placingLine={active && placingLine}
            onPlaced={onPlaced}
            paneHeights={paneHeights}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-[var(--fig-xs)] text-zinc-500">
            Pick a symbol from the watchlist
          </div>
        )}
      </Card>
    </section>
  )
}
```

(Prerequisite reminder: if the panning merge changed the `ChartCanvas` props that `ResearchChart` passes, `FilledPane` passes the same set. Pan state that belongs to one chart lives here in `FilledPane`.)

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npx vitest run src/components/research/ChartPane.test.jsx && npx eslint src/components/research/ChartPane.jsx src/components/research/ChartPane.test.jsx`
Expected: PASS, no lint output. If the unresolved-state assertion on `useChart`'s args doesn't match how `useChartData` calls it after the panning merge, assert instead that no price scale renders and that `useChart` was called with a falsy `uic`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/research/ChartPane.jsx frontend/src/components/research/ChartPane.test.jsx
git commit -m "feat: a self-contained chart pane with its own header and data"
```

---

### Task 6: Layout menu in the tool rail

**Files:**
- Modify: `frontend/src/components/research/ChartToolRail.jsx`
- Test: `frontend/src/components/research/ChartToolRail.test.jsx`

**Interfaces:**
- Consumes: `CHART_LAYOUTS`, `gridStyle`, `paneStyle` (Task 1); `Menu`, `MenuRow` (existing `./menu`).
- Produces: `ChartToolRail` gains props `layout = '1'` and `onLayoutChange`.

- [ ] **Step 1: Write the failing test**

Append inside the file's `describe`:

```jsx
  it('offers the chart layouts and reports the one picked', async () => {
    const user = userEvent.setup()
    const props = renderRail({ layout: '1', onLayoutChange: vi.fn() })

    await user.click(screen.getByRole('button', { name: 'Layout' }))
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Single chart',
      'Side by side',
      'Stacked',
      'One large, two small',
      'Grid of four',
    ])

    await user.click(screen.getByRole('menuitem', { name: 'Grid of four' }))
    expect(props.onLayoutChange).toHaveBeenCalledWith('4')
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run src/components/research/ChartToolRail.test.jsx`
Expected: the new test FAILS (no "Layout" button).

- [ ] **Step 3: Implement**

In `ChartToolRail.jsx`:
- lucide import: add `Check, LayoutGrid`.
- `import { Menu, MenuRow } from './menu'`.
- `import { CHART_LAYOUTS, gridStyle, paneStyle } from '../../lib/chartLayouts'`.

Add above the default export:

```jsx
function LayoutIcon({ preset }) {
  return (
    <span
      aria-hidden="true"
      className="w-5 h-3.5 grid gap-px p-px rounded-sm border border-zinc-500 shrink-0"
      style={gridStyle(preset)}
    >
      {Array.from({ length: preset.panes }, (_, index) => (
        <span key={index} className="bg-zinc-600 rounded-[1px]" style={paneStyle(preset, index)} />
      ))}
    </span>
  )
}
```

Change the signature to `ChartToolRail({ controls, placingLine, onPlacingLineChange, canPlaceLine, backHref, layout = '1', onLayoutChange })`, and add this menu right after the Indicators `Menu`:

```jsx
      <Menu side="right" label="Layout" icon={LayoutGrid} width={210}>
        {CHART_LAYOUTS.map((preset) => (
          <MenuRow
            key={preset.id}
            onClick={() => onLayoutChange(preset.id)}
            right={preset.id === layout ? <Check size={12} className="text-blue-400" /> : null}
          >
            <LayoutIcon preset={preset} />
            {preset.label}
          </MenuRow>
        ))}
      </Menu>
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npx vitest run src/components/research/ChartToolRail.test.jsx && npx eslint src/components/research/ChartToolRail.jsx`
Expected: PASS, no lint output.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/research/ChartToolRail.jsx frontend/src/components/research/ChartToolRail.test.jsx
git commit -m "feat: layout menu in the chart tool rail"
```

---

### Task 7: `ResearchChart` becomes a grid of panes

**Files:**
- Modify: `frontend/src/pages/ResearchChart.jsx`
- Test: `frontend/src/pages/ResearchChart.test.jsx`

**Interfaces:**
- Consumes: `useChartWorkspace` (Task 3), `ChartPane` (Task 5), `ChartToolRail`'s `layout`/`onLayoutChange` (Task 6), `layoutById`, `gridStyle`, `paneStyle` (Task 1), `DEFAULT_PANE_HEIGHTS`, `ADVANCED_PANE_HEIGHTS` (`lib/chartOptions`).

- [ ] **Step 1: Write the failing tests**

Add to `ResearchChart.test.jsx` (it already mocks `../api/queries`, clears localStorage and stubs every query in `beforeEach`):

```jsx
const panes = () => screen.getAllByRole('region', { name: /chart$/ })

async function pickLayout(user, label) {
  await user.click(screen.getByRole('button', { name: 'Layout' }))
  await user.click(screen.getByRole('menuitem', { name: label }))
}
```

and inside the `describe`:

```jsx
  it('starts as one chart', () => {
    renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })
    expect(panes()).toHaveLength(1)
  })

  it('splits into four panes with the first new one active and empty', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })

    await pickLayout(user, 'Grid of four')

    expect(panes()).toHaveLength(4)
    expect(screen.getByRole('region', { name: 'NVDA chart' })).not.toHaveAttribute('aria-current')
    const empties = screen.getAllByRole('region', { name: 'Empty chart' })
    expect(empties).toHaveLength(3)
    expect(empties[0]).toHaveAttribute('aria-current', 'true')
  })

  it('loads a watchlist pick into the active pane and keeps the other', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })

    await pickLayout(user, 'Side by side')
    await user.click(screen.getByRole('button', { name: /^TSLA/ }))

    expect(screen.getByRole('region', { name: 'NVDA chart' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'TSLA chart' })).toHaveAttribute('aria-current', 'true')
  })

  it('disables the line tool while the active pane is empty', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })

    await pickLayout(user, 'Stacked')

    expect(screen.getByRole('button', { name: 'Horizontal line' })).toBeDisabled()
  })

  it('shows the same instrument in two panes', () => {
    localStorage.setItem(
      'saxodash:chart-workspace',
      JSON.stringify({
        layout: '2h',
        slots: [
          { symbol: 'NVDA', uic: 211, assetType: 'Stock' },
          { symbol: 'NVDA', uic: 211, assetType: 'Stock' },
        ],
        active: 0,
      }),
    )
    renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })
    expect(screen.getAllByRole('region', { name: 'NVDA chart' })).toHaveLength(2)
  })

  it('remembers the layout across visits', async () => {
    const user = userEvent.setup()
    const first = renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })
    await pickLayout(user, 'Stacked')
    first.unmount()

    renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })
    expect(panes()).toHaveLength(2)
  })
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run src/pages/ResearchChart.test.jsx`
Expected: the new tests FAIL (no regions, no Layout button in the page).

- [ ] **Step 3: Implement**

Rewrite `ResearchChart.jsx`. Written against `main` at `4e4ff93`; carry over anything the panning merge added, per the Global Constraints.

```jsx
import { useEffect, useMemo, useState } from 'react'

import { ADVANCED_PANE_HEIGHTS, DEFAULT_PANE_HEIGHTS } from '../lib/chartOptions'
import { gridStyle, layoutById, paneStyle } from '../lib/chartLayouts'
import { isTypingTarget } from '../lib/priceLines'
import { chartHref, researchHref } from '../lib/research'
import CommandPalette from '../components/CommandPalette'
import InstrumentSearchBar from '../components/InstrumentSearchBar'
import SaxoConnectionStatus from '../components/SaxoConnectionStatus'
import { useCommandPalette } from '../components/useCommandPalette'
import ChartPane from '../components/research/ChartPane'
import ChartToolRail from '../components/research/ChartToolRail'
import SymbolBar from '../components/research/SymbolBar'
import WatchlistRail from '../components/research/WatchlistRail'
import { RangeButtons } from '../components/research/chartHeader'
import { useChartControls } from '../components/research/useChartControls'
import { useChartData } from '../components/research/useChartData'
import { useChartWorkspace } from '../components/research/useChartWorkspace'
import { useResearchInstrument } from '../components/research/useResearchInstrument'
import { useWatchlistToggle } from '../components/research/useWatchlistToggle'

const chartResultHref = (result) => chartHref(result.symbol, { uic: result.uic, assetType: result.asset_type })
const paletteHrefFor = (symbol, instrument) => chartHref(symbol, instrument)

export default function ResearchChart() {
  const { symbol, instrument, position, positions, selectSymbol } = useResearchInstrument()
  const controls = useChartControls()
  const workspace = useChartWorkspace({ symbol, instrument, selectSymbol })
  const [placingLine, setPlacingLine] = useState(false)

  const [shownSymbol, setShownSymbol] = useState(symbol)
  if (shownSymbol !== symbol) {
    setShownSymbol(symbol)
    controls.setYScale(1)
    setPlacingLine(false)
  }

  useEffect(() => {
    if (!placingLine) return undefined
    const onKeyDown = (event) => {
      if (isTypingTarget(event.target)) return
      if (event.key === 'Escape') setPlacingLine(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [placingLine])

  const { bars, priceLines, quote, details } = useChartData({ symbol, instrument, range: controls.range })
  const { watchlists, toggleList } = useWatchlistToggle({ symbol, instrument, details: details.data, position })
  const heldSymbols = useMemo(() => new Set(positions.map((p) => p.ticker)), [positions])
  const palette = useCommandPalette()

  const layout = layoutById(workspace.layout)
  const split = layout.panes > 1
  const activeSlot = workspace.slots[workspace.active]
  const paneHeights = split ? DEFAULT_PANE_HEIGHTS : ADVANCED_PANE_HEIGHTS

  return (
    <div className="h-screen overflow-hidden bg-zinc-950 text-zinc-100 grid grid-cols-[48px_minmax(0,1fr)] lg:grid-cols-[48px_minmax(0,1fr)_300px]">
      <ChartToolRail
        controls={controls}
        placingLine={placingLine}
        onPlacingLineChange={setPlacingLine}
        canPlaceLine={Boolean(activeSlot && priceLines.create)}
        backHref={researchHref(symbol, undefined, instrument)}
        layout={workspace.layout}
        onLayoutChange={workspace.setLayout}
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

        <div className="flex items-center gap-1 px-1">
          <RangeButtons controls={controls} />
          <div className="ml-auto">
            <SaxoConnectionStatus />
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col gap-2 lg:grid" style={gridStyle(layout)}>
          {workspace.slots.map((slot, index) => {
            const active = index === workspace.active
            return (
              <ChartPane
                key={index}
                slot={slot}
                active={active}
                outlined={split && active}
                controls={controls}
                onActivate={() => workspace.activate(index)}
                placingLine={placingLine}
                onPlaced={() => setPlacingLine(false)}
                paneHeights={paneHeights}
                style={paneStyle(layout, index)}
                className={active ? 'flex' : 'hidden lg:flex'}
              />
            )
          })}
        </div>
      </main>

      <aside className="hidden lg:flex flex-col gap-2 p-2 pl-0 min-h-0">
        <InstrumentSearchBar hrefFor={chartResultHref} />
        <div className="flex-1 min-h-0">
          <WatchlistRail fill gridView symbol={symbol} onSelectSymbol={selectSymbol} heldSymbols={heldSymbols} />
        </div>
      </aside>

      <CommandPalette open={palette.open} onClose={() => palette.setOpen(false)} hrefFor={paletteHrefFor} />
    </div>
  )
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd frontend && npx vitest run src/pages/ResearchChart.test.jsx && npx eslint src/pages/ResearchChart.jsx src/pages/ResearchChart.test.jsx`
Expected: PASS, including every pre-existing test. They render the default single pane, so `getByTestId('price-scale')` stays unique. If a pre-existing test looked for the range buttons or the line-save alert inside the old chart `Card`, re-point it at their new place (the toolbar row; the pane header) without changing what it asserts.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/ResearchChart.jsx frontend/src/pages/ResearchChart.test.jsx
git commit -m "feat: advanced chart splits into up to four panes, each its own symbol"
```

---

### Task 8: Verify, screenshot, record the decision

**Files:**
- Modify: `AGENTS.md`, `docs/next-steps.md`

- [ ] **Step 1: Full checks**

```bash
cd frontend && npx vitest run && npx eslint src && npm run build
```

Expected: all green.

- [ ] **Step 2: Screenshot review**

Follow the harness recipe in `.claude/skills/saxodash-design-system/SKILL.md` (JWT into localStorage, Playwright from an existing `~/.npm/_npx/*/node_modules/playwright`). Seed the workspace by setting `localStorage['saxodash:chart-workspace']` before navigating. Capture `/research/chart`:
- at 1440px, layout `2h` with two different held symbols;
- at 1440px, layout `4` with Volume, RSI and MACD on;
- at 390px, layout `4` (only the active pane should show).

Check: the ring is on the active pane only; pane headers fit on one line; the price pane stays readable in `4` with all indicators; nothing overflows the viewport at 1440px. Fix real defects in this branch's UI (each with a test where meaningful, and a `fix:` commit), then re-run Step 1.

- [ ] **Step 3: Docs**

Append to AGENTS.md "Decided":

```markdown
**The active chart pane is the URL.** `/research/chart` shows up to four panes
(`lib/chartLayouts.js`), saved per browser under `saxodash:chart-workspace`. The
active pane is whatever `?symbol=` names: the watchlist, search and ⌘K reach it by
navigating, unchanged. `useChartWorkspace` copies each navigation into the active
slot, keyed on `location.key`, so re-picking the symbol already in the URL still
fills an empty pane. The other panes render from their stored uic + asset type
and never re-resolve.
```

In `docs/next-steps.md`, mark "Chart splits" done with the spec path. List the next Advanced View slices from the spec's roadmap: sync switches, Panels menu, drawing tools, styling & config, scripting, ML/scoring.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md docs/next-steps.md
git commit -m "docs: record the chart-splits decision and the advanced view roadmap"
```
