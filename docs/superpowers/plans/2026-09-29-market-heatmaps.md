# Market Heatmaps (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A value-sized, sector-grouped Portfolio heatmap on the Dashboard, a move-sorted Watchlist heatmap in the Advanced View rail, a Today / Since purchase toggle on `MoversCard`, and elevated-volume shading on the chart's volume pane.

**Architecture:** Pure layout and ranking logic lives in `frontend/src/lib/heatmap.js` (a hand-rolled squarified treemap, sector grouping, day-move maths); color comes from one new `performanceFill` in `lib/charts.js`. Two thin components render HTML tiles through a shared `HeatTile`. All data already exists — the batched `/api/research/quotes/` call — except one backend field, `change_basis`, which discloses when a "today" move is really the last completed session.

**Tech Stack:** Django + DRF (backend tests via `manage.py test`), React 19, TanStack Query v5, Tailwind, lucide-react, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-29-market-heatmaps-design.md`

## Global Constraints

- Generated code carries **zero comments** (AGENTS.md "Code style"). Existing comments in touched files stay as they are.
- Chart colors come only from `frontend/src/lib/charts.js`; no literal hex/rgba for gain/loss in components. One green (`POSITIVE`), one red (`NEGATIVE`).
- Financial state is never color-only: every tile prints a signed percentage or `—`.
- An absent figure is not zero: a missing quote renders `—` and the no-data fill (`TRACK`), never `0%`.
- `fmtEur` for already-converted EUR figures, `fmtPct` for percentages.
- No new npm or pip dependencies. Recharts is not used for the heatmaps.
- Performance caps: `day: 3`, `sincePurchase: 30`, `month: 9`. Flat band: `|pct| < 0.1`.
- Relative volume: window `20`, elevated at `≥ 2`, needs `≥ 15` valid prior sessions, volume `0` = missing.
- Toggle labels: `Today` (or `Last session` when any quote is `last_close`) and `Since purchase`.
- Rail view preference key: `saxodash:watchlist-view` (`'list'` | `'grid'`).
- Frontend commands run from `frontend/`: `npx vitest run <path>`, `npx eslint <files>`, `npm run build`. Backend from `backend/`: `.venv/bin/python manage.py test <module>`.

## Review Focus

- **A holding with no uic / no quote** (rows that predate the sync, or an asset-type group whose quote call failed) must render `—` on the no-data fill in Today mode, never `0%` or green — pinned in Task 5 (`KO` fixture) and Task 3 (`dayMoves`).
- **A tile too small for text** (one dominant holding plus a tiny one) must stay a focusable link with a full accessible name — pinned in Task 5 ("keeps a tile too small for text reachable").
- **Mixed quote bases** (some `live`, some `last_close`) must label the whole view "Last session", not "Today" — pinned in Task 2 (`moveLabel`) and Tasks 5/7/8.
- **An exactly-flat or near-flat move** (`0`, `0.05%`) must read as flat — neutral fill, not counted as a riser — pinned in Task 2 (`performanceFill`) and Task 8 (breadth).
- **A zero- or negative-value position** must drop out of the layout without `NaN` geometry — pinned in Task 3 (`squarify`, `groupBySector`).

---

### Task 1: Disclose a quote move's basis (`change_basis`)

**Files:**
- Modify: `backend/research/market.py` (`to_quote`, `quotes`)
- Test: `backend/research/test_market.py`

**Interfaces:**
- Produces: every row from `GET /api/research/quotes/` carries `change_basis: 'live' | 'last_close' | None`.

- [ ] **Step 1: Write the failing tests**

In `ShapingTest` (class at line ~50) add:

```python
    def test_quote_marks_a_saxo_change_as_live(self):
        self.assertEqual(market.to_quote(SAMPLE_INFOPRICE)['change_basis'], 'live')

    def test_quote_without_a_change_has_no_basis(self):
        row = {'Uic': 211, 'AssetType': 'Stock', 'Quote': {}}
        self.assertIsNone(market.to_quote(row)['change_basis'])
```

In `MarketDataViewTest`, next to `test_quotes_falls_back_to_the_last_close_to_close_move_without_live_entitlement`, add:

```python
    @patch('research.market.client.get_chart')
    @patch('research.market.client.get_infoprices')
    def test_quotes_mark_a_fallback_move_as_last_close(self, mock_infoprices, mock_get_chart):
        self._connect_saxo()
        mock_infoprices.return_value = [{'Uic': 211, 'AssetType': 'Stock', 'Quote': {}}]
        mock_get_chart.return_value = [
            {**SAMPLE_CANDLE, 'Time': '2026-08-28T00:00:00Z', 'Close': 400.0},
            {**SAMPLE_CANDLE, 'Time': '2026-08-31T00:00:00Z', 'Close': 410.0},
        ]

        response = self.client.get('/api/research/quotes/?uics=211&asset_type=Stock')

        self.assertEqual(response.data[0]['change_basis'], 'last_close')

    @patch('research.market.client.get_chart')
    @patch('research.market.client.get_infoprices')
    def test_quotes_leave_the_basis_empty_when_no_move_is_known(self, mock_infoprices, mock_get_chart):
        self._connect_saxo()
        mock_infoprices.return_value = [{'Uic': 211, 'AssetType': 'Stock', 'Quote': {}}]
        mock_get_chart.return_value = []

        response = self.client.get('/api/research/quotes/?uics=211&asset_type=Stock')

        self.assertIsNone(response.data[0]['change_pct'])
        self.assertIsNone(response.data[0]['change_basis'])

    @patch('research.market.client.get_infoprices')
    def test_quotes_mark_a_live_move_as_live(self, mock_infoprices):
        self._connect_saxo()
        mock_infoprices.return_value = [SAMPLE_INFOPRICE]

        response = self.client.get('/api/research/quotes/?uics=211&asset_type=Stock')

        self.assertEqual(response.data[0]['change_basis'], 'live')
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test research.test_market -v 2`
Expected: the five new tests FAIL with `KeyError: 'change_basis'`.

- [ ] **Step 3: Implement**

In `to_quote`, replace the return with:

```python
    change_pct = price_info.get('PercentChange')
    return {
        'uic': row.get('Uic'),
        'asset_type': row.get('AssetType', ''),
        'price': None if price is None else float(price),
        'bid': quote.get('Bid'),
        'ask': quote.get('Ask'),
        'change_pct': change_pct,
        'change_basis': None if change_pct is None else 'live',
    }
```

In `quotes.produce`, replace the fallback loop with:

```python
        for row in mapped:
            if row['change_pct'] is None and row['uic'] is not None:
                row['change_pct'] = _last_session_change_pct(row['uic'], asset_type)
                if row['change_pct'] is not None:
                    row['change_basis'] = 'last_close'
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd backend && .venv/bin/python manage.py test research -v 1`
Expected: all research tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/research/market.py backend/research/test_market.py
git commit -m "feat: tell the frontend whether a quote's move is live or the last session's"
```

---

### Task 2: `performanceFill`, `moveLabel`, and the monthly heatmap migration

**Files:**
- Modify: `frontend/src/lib/charts.js`, `frontend/src/lib/pricing.js`, `frontend/src/components/analytics/MonthlyReturnsHeatmap.jsx`
- Test: `frontend/src/lib/charts.test.js`, `frontend/src/lib/pricing.test.js`

**Interfaces:**
- Produces (`lib/charts.js`): `PERFORMANCE_CAPS = { day: 3, sincePurchase: 30, month: 9 }`, `FLAT_MOVE = 0.1`, `FLAT_FILL: string`, `performanceFill(pct: number|string|null, { cap: number, flat?: number }): string | null`.
- Produces (`lib/pricing.js`): `moveLabel(quotes: Iterable<{change_basis?}>): 'Today' | 'Last session'`, `LAST_SESSION_NOTE: string`.

- [ ] **Step 1: Write the failing tests**

Replace the import line of `frontend/src/lib/charts.test.js` and append:

```js
import { describe, expect, it } from 'vitest'
import { FLAT_FILL, NEGATIVE, PERFORMANCE_CAPS, POSITIVE, colorForCategory, performanceFill, withAlpha } from './charts'
```

```js
describe('performanceFill', () => {
  it('has no fill for an unknown move', () => {
    expect(performanceFill(null, { cap: 3 })).toBeNull()
    expect(performanceFill(undefined, { cap: 3 })).toBeNull()
  })

  it('reads a move inside the flat band as flat, not as a faint gain or loss', () => {
    expect(performanceFill(0, { cap: 3 })).toBe(FLAT_FILL)
    expect(performanceFill(-0.05, { cap: 3 })).toBe(FLAT_FILL)
  })

  it('tints gains green and losses red in proportion to the cap', () => {
    expect(performanceFill(1.5, { cap: 3 })).toBe(withAlpha(POSITIVE, 0.12 + 0.5 * 0.65))
    expect(performanceFill(-1.5, { cap: 3 })).toBe(withAlpha(NEGATIVE, 0.12 + 0.5 * 0.65))
  })

  it('saturates at the cap', () => {
    expect(performanceFill(12, { cap: 3 })).toBe(performanceFill(3, { cap: 3 }))
  })

  it('accepts the numeric strings the API sends', () => {
    expect(performanceFill('1.5', { cap: 3 })).toBe(performanceFill(1.5, { cap: 3 }))
  })

  it('keeps the monthly scale unchanged when the flat band is off', () => {
    expect(performanceFill(0, { cap: PERFORMANCE_CAPS.month, flat: 0 })).toBe(withAlpha(POSITIVE, 0.12))
  })
})
```

In `frontend/src/lib/pricing.test.js`, add `moveLabel` to the import and append:

```js
describe('moveLabel', () => {
  it('says Today when every move is live', () => {
    expect(moveLabel([{ change_basis: 'live' }, { change_basis: null }])).toBe('Today')
  })

  it('says Last session as soon as one move is a last close', () => {
    expect(moveLabel([{ change_basis: 'live' }, { change_basis: 'last_close' }])).toBe('Last session')
  })

  it("reads a Map's values", () => {
    expect(moveLabel(new Map([[1, { change_basis: 'last_close' }]]).values())).toBe('Last session')
  })

  it('says Today with no quotes at all', () => {
    expect(moveLabel([])).toBe('Today')
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run src/lib/charts.test.js src/lib/pricing.test.js`
Expected: FAIL — `performanceFill` / `moveLabel` are not exported.

- [ ] **Step 3: Implement**

In `lib/charts.js`, after the `withAlpha` function:

```js
export const PERFORMANCE_CAPS = { day: 3, sincePurchase: 30, month: 9 }
export const FLAT_MOVE = 0.1
export const FLAT_FILL = withAlpha(AXIS_TEXT, 0.18)

export function performanceFill(pct, { cap, flat = FLAT_MOVE }) {
  if (pct == null || Number.isNaN(Number(pct))) return null
  const n = Number(pct)
  if (Math.abs(n) < flat) return FLAT_FILL
  const intensity = Math.min(1, Math.abs(n) / cap)
  return withAlpha(n >= 0 ? POSITIVE : NEGATIVE, 0.12 + intensity * 0.65)
}
```

In `lib/pricing.js`, append:

```js
export const LAST_SESSION_NOTE = 'No live market data on this account — showing the last completed session'

export function moveLabel(quotes) {
  for (const quote of quotes) {
    if (quote?.change_basis === 'last_close') return 'Last session'
  }
  return 'Today'
}
```

In `MonthlyReturnsHeatmap.jsx`, add `PERFORMANCE_CAPS, performanceFill` to the `../../lib/charts` import and replace `cellStyle`'s body (keep the comment above it):

```js
function cellStyle(pct) {
  return { background: performanceFill(pct, { cap: PERFORMANCE_CAPS.month, flat: 0 }) ?? 'rgba(255,255,255,0.02)' }
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd frontend && npx vitest run src/lib/charts.test.js src/lib/pricing.test.js src/components/analytics`
Expected: PASS (the monthly heatmap renders identically — `flat: 0` and the same alpha formula).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/charts.js frontend/src/lib/charts.test.js frontend/src/lib/pricing.js frontend/src/lib/pricing.test.js frontend/src/components/analytics/MonthlyReturnsHeatmap.jsx
git commit -m "feat: one performance color scale with a cap per metric, and a label for a move's basis"
```

---

### Task 3: `lib/heatmap.js` — layout, grouping and move maths

**Files:**
- Create: `frontend/src/lib/heatmap.js`
- Test: `frontend/src/lib/heatmap.test.js`

**Interfaces:**
- Consumes: `FLAT_MOVE` from `lib/charts.js` (Task 2).
- Produces:
  - `squarify(items: {value:number}[], rect: {x,y,width,height}) → (item & {x,y,width,height})[]`
  - `groupBySector(positions) → {sector:string, value:number, positions:object[]}[]`
  - `SECTOR_HEADER = 18`
  - `layoutPortfolio(positions, {width, height}) → { sectors: {sector, pct, headed, x, y, width, height}[], tiles: {position, sector, value, x, y, width, height}[] }`
  - `labelLevel(width, height) → 'full' | 'ticker' | 'none'`
  - `dayMoves(positions, quotes: Map<uic, quote>) → {position, changePct: number|null, impactEur: number|null}[]`
  - `daySummary(moves) → {impactEur, pct, driver} | null`
  - `rankDayMoves(moves, count = 3) → {best: move[], worst: move[]}`
  - `sincePurchaseSummary(positions) → {contributor: position|null, drag: position|null} | null`
  - `sortByMove(items: {symbol, uic}[], quotes) → items[]`
  - `breadth(changes: (number|null)[]) → {up:number, down:number}`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/heatmap.test.js`:

```js
import { describe, expect, it } from 'vitest'
import {
  breadth,
  dayMoves,
  daySummary,
  groupBySector,
  labelLevel,
  layoutPortfolio,
  rankDayMoves,
  sincePurchaseSummary,
  sortByMove,
  squarify,
} from './heatmap'

const rect = { x: 0, y: 0, width: 600, height: 400 }
const area = (t) => t.width * t.height
const overlap = (a, b) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))

describe('squarify', () => {
  const items = [6, 6, 4, 3, 2, 2, 1].map((value, id) => ({ id, value }))

  it('gives each tile an area proportional to its value', () => {
    for (const tile of squarify(items, rect)) {
      expect(area(tile)).toBeCloseTo((tile.value / 24) * 240_000, 6)
    }
  })

  it('covers the rect exactly, inside its bounds, without overlaps', () => {
    const tiles = squarify(items, rect)
    expect(tiles.reduce((sum, t) => sum + area(t), 0)).toBeCloseTo(240_000, 6)
    for (const t of tiles) {
      expect(t.x).toBeGreaterThanOrEqual(-1e-9)
      expect(t.y).toBeGreaterThanOrEqual(-1e-9)
      expect(t.x + t.width).toBeLessThanOrEqual(600 + 1e-9)
      expect(t.y + t.height).toBeLessThanOrEqual(400 + 1e-9)
    }
    for (let i = 0; i < tiles.length; i++) {
      for (let j = i + 1; j < tiles.length; j++) expect(overlap(tiles[i], tiles[j])).toBeLessThan(1e-6)
    }
  })

  it('keeps equal items near square', () => {
    const tiles = squarify(Array.from({ length: 6 }, (_, id) => ({ id, value: 1 })), rect)
    for (const t of tiles) expect(Math.max(t.width / t.height, t.height / t.width)).toBeLessThan(3)
  })

  it('drops zero, negative and non-numeric values instead of drawing NaN', () => {
    const tiles = squarify([{ value: 0 }, { value: -2 }, { value: NaN }, { value: 5 }], rect)
    expect(tiles).toHaveLength(1)
    expect(tiles[0]).toMatchObject({ x: 0, y: 0, width: 600, height: 400 })
  })

  it('returns nothing for an empty list or an empty rect', () => {
    expect(squarify([], rect)).toEqual([])
    expect(squarify(items, { x: 0, y: 0, width: 0, height: 400 })).toEqual([])
  })
})

describe('groupBySector', () => {
  it('buckets a blank sector as Unknown and orders groups by value', () => {
    const groups = groupBySector([
      { ticker: 'A', sector: 'Tech', value: '100' },
      { ticker: 'B', sector: '', value: '300' },
      { ticker: 'C', sector: 'Tech', value: '50' },
      { ticker: 'D', sector: null, value: '10' },
    ])
    expect(groups.map((g) => [g.sector, g.value])).toEqual([['Unknown', 310], ['Tech', 150]])
  })

  it('leaves out positions with no positive value', () => {
    const groups = groupBySector([
      { ticker: 'A', sector: 'Tech', value: '0' },
      { ticker: 'B', sector: 'Tech', value: '-5' },
      { ticker: 'C', sector: 'Tech', value: '20' },
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].positions.map((p) => p.ticker)).toEqual(['C'])
  })
})

describe('layoutPortfolio', () => {
  const positions = [
    { ticker: 'NVDA', sector: 'Technology', value: '6000' },
    { ticker: 'MSFT', sector: 'Technology', value: '3000' },
    { ticker: 'KO', sector: 'Staples', value: '1000' },
  ]

  it('gives every position one tile tagged with its sector', () => {
    const { tiles } = layoutPortfolio(positions, { width: 760, height: 280 })
    expect(tiles.map((t) => [t.position.ticker, t.sector]).sort()).toEqual([
      ['KO', 'Staples'], ['MSFT', 'Technology'], ['NVDA', 'Technology'],
    ])
  })

  it('heads a sector tall enough to carry a label, with its share', () => {
    const { sectors } = layoutPortfolio(positions, { width: 760, height: 280 })
    expect(sectors[0]).toMatchObject({ sector: 'Technology', headed: true })
    expect(sectors[0].pct).toBeCloseTo(90, 6)
  })

  it('drops the header on a sector too short for one', () => {
    const { sectors } = layoutPortfolio(positions, { width: 760, height: 30 })
    expect(sectors.every((s) => !s.headed)).toBe(true)
  })

  it('lays out nothing for an empty book', () => {
    expect(layoutPortfolio([], { width: 760, height: 280 })).toEqual({ sectors: [], tiles: [] })
  })
})

describe('labelLevel', () => {
  it('fits ticker and move, then ticker only, then nothing', () => {
    expect(labelLevel(56, 34)).toBe('full')
    expect(labelLevel(55, 34)).toBe('ticker')
    expect(labelLevel(36, 18)).toBe('ticker')
    expect(labelLevel(35, 40)).toBe('none')
  })
})

describe('dayMoves', () => {
  const quotes = new Map([[1, { uic: 1, change_pct: 5 }]])

  it("turns a % move into today's euro effect on the current value", () => {
    const [move] = dayMoves([{ ticker: 'A', uic: 1, value: '1050.00' }], quotes)
    expect(move.changePct).toBe(5)
    expect(move.impactEur).toBeCloseTo(50, 9)
  })

  it('leaves a position with no uic or no quote unknown, not zero', () => {
    const moves = dayMoves([{ ticker: 'B', uic: null, value: '10' }, { ticker: 'C', uic: 9, value: '10' }], quotes)
    expect(moves.map((m) => [m.changePct, m.impactEur])).toEqual([[null, null], [null, null]])
  })
})

describe('daySummary', () => {
  const move = (ticker, value, changePct, impactEur) => ({ position: { ticker, value }, changePct, impactEur })

  it('sums the euro effect and names the biggest driver by size', () => {
    const summary = daySummary([move('A', '1050', 5, 50), move('B', '980', -2, -20), move('C', '10', null, null)])
    expect(summary.impactEur).toBeCloseTo(30, 9)
    expect(summary.pct).toBeCloseTo(1.5, 9)
    expect(summary.driver.position.ticker).toBe('A')
  })

  it('is null when no position has a move', () => {
    expect(daySummary([move('C', '10', null, null)])).toBeNull()
  })
})

describe('rankDayMoves', () => {
  const move = (ticker, changePct) => ({ position: { ticker }, changePct, impactEur: changePct })

  it('keeps gainers and losers apart and skips unknown moves', () => {
    const { best, worst } = rankDayMoves([move('A', 1), move('B', 4), move('C', -2), move('D', null), move('E', -5)])
    expect(best.map((m) => m.position.ticker)).toEqual(['B', 'A'])
    expect(worst.map((m) => m.position.ticker)).toEqual(['E', 'C'])
  })

  it('takes at most three a side', () => {
    const { best } = rankDayMoves([1, 2, 3, 4].map((c) => move(`T${c}`, c)))
    expect(best.map((m) => m.position.ticker)).toEqual(['T4', 'T3', 'T2'])
  })
})

describe('sincePurchaseSummary', () => {
  it('names the largest euro gain and the largest euro loss', () => {
    const summary = sincePurchaseSummary([
      { ticker: 'A', pnl: '100' }, { ticker: 'B', pnl: '-40' }, { ticker: 'C', pnl: '2500' },
    ])
    expect(summary.contributor.ticker).toBe('C')
    expect(summary.drag.ticker).toBe('B')
  })

  it('has no drag when nothing is under water', () => {
    expect(sincePurchaseSummary([{ ticker: 'A', pnl: '100' }]).drag).toBeNull()
  })

  it('is null for an empty book', () => {
    expect(sincePurchaseSummary([])).toBeNull()
  })
})

describe('sortByMove', () => {
  it('orders by move, biggest gain first, unknown last, ties by symbol', () => {
    const items = ['KO', 'AAPL', 'NVDA', 'TSLA', 'MSFT'].map((symbol, uic) => ({ symbol, uic }))
    const quotes = new Map([
      [0, { change_pct: 1 }], [1, { change_pct: 1 }], [2, { change_pct: 3 }], [3, { change_pct: -2 }],
    ])
    expect(sortByMove(items, quotes).map((i) => i.symbol)).toEqual(['NVDA', 'AAPL', 'KO', 'TSLA', 'MSFT'])
  })
})

describe('breadth', () => {
  it('counts risers and fallers, leaving flat and unknown out', () => {
    expect(breadth([2, 0.05, -1, null, 0, -0.2, 0.1])).toEqual({ up: 2, down: 2 })
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run src/lib/heatmap.test.js`
Expected: FAIL — cannot resolve `./heatmap`.

- [ ] **Step 3: Implement**

Create `frontend/src/lib/heatmap.js`:

```js
import { FLAT_MOVE } from './charts'

export const SECTOR_HEADER = 18
const MIN_HEADED_GROUP = 40

function worst(row, side, scale) {
  const areas = row.map((item) => item.value * scale)
  const sum = areas.reduce((total, a) => total + a, 0)
  const side2 = side * side
  const sum2 = sum * sum
  return Math.max((side2 * Math.max(...areas)) / sum2, sum2 / (side2 * Math.min(...areas)))
}

function placeRow(row, free, scale, placed) {
  const rowArea = row.reduce((total, item) => total + item.value * scale, 0)
  if (free.width >= free.height) {
    const width = rowArea / free.height
    let y = free.y
    for (const item of row) {
      const height = (item.value * scale) / width
      placed.push({ ...item, x: free.x, y, width, height })
      y += height
    }
    return { x: free.x + width, y: free.y, width: free.width - width, height: free.height }
  }
  const height = rowArea / free.width
  let x = free.x
  for (const item of row) {
    const width = (item.value * scale) / height
    placed.push({ ...item, x, y: free.y, width, height })
    x += width
  }
  return { x: free.x, y: free.y + height, width: free.width, height: free.height - height }
}

export function squarify(items, rect) {
  const sized = items
    .filter((item) => Number.isFinite(item.value) && item.value > 0)
    .sort((a, b) => b.value - a.value)
  const total = sized.reduce((sum, item) => sum + item.value, 0)
  if (!total || !(rect.width > 0) || !(rect.height > 0)) return []

  const scale = (rect.width * rect.height) / total
  const placed = []
  let free = { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  let row = []
  for (const item of sized) {
    const side = Math.min(free.width, free.height)
    if (row.length === 0 || worst([...row, item], side, scale) <= worst(row, side, scale)) {
      row.push(item)
    } else {
      free = placeRow(row, free, scale, placed)
      row = [item]
    }
  }
  if (row.length) placeRow(row, free, scale, placed)
  return placed
}

export function groupBySector(positions) {
  const groups = new Map()
  for (const position of positions) {
    const value = Number(position.value)
    if (!(value > 0)) continue
    const sector = (position.sector || '').trim() || 'Unknown'
    const group = groups.get(sector) ?? { sector, value: 0, positions: [] }
    group.value += value
    group.positions.push(position)
    groups.set(sector, group)
  }
  return [...groups.values()].sort((a, b) => b.value - a.value)
}

export function layoutPortfolio(positions, { width, height }) {
  const groups = groupBySector(positions)
  const total = groups.reduce((sum, group) => sum + group.value, 0)
  const tiles = []
  const sectors = squarify(groups, { x: 0, y: 0, width, height }).map((group) => {
    const headed = group.height >= MIN_HEADED_GROUP
    const inner = headed
      ? { x: group.x, y: group.y + SECTOR_HEADER, width: group.width, height: group.height - SECTOR_HEADER }
      : { x: group.x, y: group.y, width: group.width, height: group.height }
    const members = group.positions.map((position) => ({ position, value: Number(position.value) }))
    for (const tile of squarify(members, inner)) tiles.push({ ...tile, sector: group.sector })
    return {
      sector: group.sector,
      pct: (group.value / total) * 100,
      headed,
      x: group.x,
      y: group.y,
      width: group.width,
      height: group.height,
    }
  })
  return { sectors, tiles }
}

export function labelLevel(width, height) {
  if (width >= 56 && height >= 34) return 'full'
  if (width >= 36 && height >= 18) return 'ticker'
  return 'none'
}

export function dayMoves(positions, quotes) {
  return positions.map((position) => {
    const changePct = quotes.get(position.uic)?.change_pct ?? null
    const value = Number(position.value)
    const impactEur = changePct == null ? null : (value * changePct) / (100 + changePct)
    return { position, changePct, impactEur }
  })
}

export function daySummary(moves) {
  const known = moves.filter((move) => move.impactEur != null)
  if (known.length === 0) return null
  const impactEur = known.reduce((sum, move) => sum + move.impactEur, 0)
  const before = known.reduce((sum, move) => sum + Number(move.position.value) - move.impactEur, 0)
  const driver = known.reduce((best, move) => (Math.abs(move.impactEur) > Math.abs(best.impactEur) ? move : best))
  return { impactEur, pct: before ? (impactEur / before) * 100 : null, driver }
}

export function rankDayMoves(moves, count = 3) {
  const known = moves.filter((move) => move.changePct != null)
  return {
    best: known.filter((m) => m.changePct > 0).sort((a, b) => b.changePct - a.changePct).slice(0, count),
    worst: known.filter((m) => m.changePct < 0).sort((a, b) => a.changePct - b.changePct).slice(0, count),
  }
}

export function sincePurchaseSummary(positions) {
  const ranked = positions.filter((p) => p.pnl != null).sort((a, b) => Number(b.pnl) - Number(a.pnl))
  if (ranked.length === 0) return null
  const top = ranked[0]
  const bottom = ranked[ranked.length - 1]
  return {
    contributor: Number(top.pnl) > 0 ? top : null,
    drag: Number(bottom.pnl) < 0 ? bottom : null,
  }
}

export function sortByMove(items, quotes) {
  const change = (item) => quotes.get(item.uic)?.change_pct ?? null
  return [...items].sort((a, b) => {
    const ca = change(a)
    const cb = change(b)
    if (ca == null && cb == null) return a.symbol.localeCompare(b.symbol)
    if (ca == null) return 1
    if (cb == null) return -1
    return cb - ca || a.symbol.localeCompare(b.symbol)
  })
}

export function breadth(changes) {
  let up = 0
  let down = 0
  for (const change of changes) {
    if (change == null) continue
    if (change >= FLAT_MOVE) up += 1
    else if (change <= -FLAT_MOVE) down += 1
  }
  return { up, down }
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd frontend && npx vitest run src/lib/heatmap.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/heatmap.js frontend/src/lib/heatmap.test.js
git commit -m "feat: squarified treemap layout, sector grouping and day-move maths for the heatmaps"
```

---

### Task 4: `HeatTile` and `ScaleLegend`

**Files:**
- Create: `frontend/src/components/heatmap/HeatTile.jsx`, `frontend/src/components/heatmap/ScaleLegend.jsx`
- Modify: `frontend/src/components/analytics/MonthlyReturnsHeatmap.jsx` (header legend)
- Test: `frontend/src/components/heatmap/HeatTile.test.jsx`, `frontend/src/components/heatmap/ScaleLegend.test.jsx`

**Interfaces:**
- Consumes: `TRACK`, `NEGATIVE`, `POSITIVE`, `withAlpha` from `lib/charts.js`.
- Produces: `HeatTile({ as = 'button', ticker, pct, fill, level = 'full', active = false, marker = null, className, style, ...rest })` — renders `Tag` with `background: fill ?? TRACK`, `aria-current` when active, every other prop (`aria-label`, `title`, `onClick`, `to`) passed through. `ScaleLegend({ cap })`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/components/heatmap/HeatTile.test.jsx`:

```jsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Link, MemoryRouter } from 'react-router-dom'

import HeatTile from './HeatTile'

describe('HeatTile', () => {
  it('prints the ticker and the signed move at full size', () => {
    render(<HeatTile ticker="NVDA" pct={1.234} fill="rgb(1, 2, 3)" aria-label="NVDA +1.2%" />)
    expect(screen.getByText('NVDA')).toBeInTheDocument()
    expect(screen.getByText('+1.2%')).toBeInTheDocument()
  })

  it('shows a dash for an unknown move, never 0%', () => {
    render(<HeatTile ticker="KO" pct={null} fill={null} aria-label="KO" />)
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'KO' }).style.background).toBe('rgba(255, 255, 255, 0.06)')
  })

  it('drops the move when only the ticker fits', () => {
    render(<HeatTile ticker="NVDA" pct={1.2} level="ticker" aria-label="NVDA" />)
    expect(screen.queryByText('+1.2%')).not.toBeInTheDocument()
  })

  it('keeps an unlabeled tile reachable by its accessible name', () => {
    render(<HeatTile ticker="NVDA" pct={1.2} level="none" aria-label="NVDA +1.2%" />)
    expect(screen.getByRole('button', { name: 'NVDA +1.2%' })).toBeInTheDocument()
    expect(screen.queryByText('NVDA')).not.toBeInTheDocument()
  })

  it('marks the active tile', () => {
    render(<HeatTile ticker="NVDA" pct={1.2} active aria-label="NVDA" />)
    expect(screen.getByRole('button', { name: 'NVDA' })).toHaveAttribute('aria-current', 'true')
  })

  it('renders as a link when given one', () => {
    render(
      <MemoryRouter>
        <HeatTile as={Link} to="/research?symbol=NVDA" ticker="NVDA" pct={1.2} aria-label="NVDA" />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'NVDA' })).toHaveAttribute('href', '/research?symbol=NVDA')
  })
})
```

`frontend/src/components/heatmap/ScaleLegend.test.jsx`:

```jsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import ScaleLegend from './ScaleLegend'

describe('ScaleLegend', () => {
  it('labels both ends of the scale with the cap', () => {
    render(<ScaleLegend cap={3} />)
    expect(screen.getByText('−3%')).toBeInTheDocument()
    expect(screen.getByText('+3%')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run src/components/heatmap`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`frontend/src/components/heatmap/HeatTile.jsx`:

```jsx
import { TRACK } from '../../lib/charts'
import { fmtPct } from '../../lib/format'

export default function HeatTile({
  as: Tag = 'button',
  ticker,
  pct,
  fill,
  level = 'full',
  active = false,
  marker = null,
  className = '',
  style,
  ...rest
}) {
  const buttonProps = Tag === 'button' ? { type: 'button' } : {}
  return (
    <Tag
      {...buttonProps}
      {...rest}
      aria-current={active || undefined}
      className={`overflow-hidden rounded-sm flex flex-col items-center justify-center text-center leading-tight outline-none focus-visible:ring-2 focus-visible:ring-blue-400 hover:brightness-125 ${
        active ? 'ring-1 ring-blue-500' : ''
      } ${className}`}
      style={{ ...style, background: fill ?? TRACK }}
    >
      {level === 'none' ? null : (
        <span className="flex items-center gap-1 max-w-full px-1 truncate text-[var(--fig-xs)] font-medium text-zinc-50">
          {ticker}
          {marker}
        </span>
      )}
      {level === 'full' ? (
        <span className="text-[var(--fig-2xs)] num font-mono text-zinc-100">{fmtPct(pct, { decimals: 1 })}</span>
      ) : null}
    </Tag>
  )
}
```

`frontend/src/components/heatmap/ScaleLegend.jsx`:

```jsx
import { NEGATIVE, POSITIVE, withAlpha } from '../../lib/charts'

export default function ScaleLegend({ cap }) {
  return (
    <div className="flex items-center gap-1.5 text-[var(--fig-2xs)] text-zinc-500">
      <span>−{cap}%</span>
      <span
        className="w-16 h-2 rounded-full"
        style={{
          background: `linear-gradient(90deg, ${withAlpha(NEGATIVE, 0.8)}, rgba(255,255,255,0.06), ${withAlpha(POSITIVE, 0.8)})`,
        }}
      />
      <span>+{cap}%</span>
    </div>
  )
}
```

In `MonthlyReturnsHeatmap.jsx`: import `ScaleLegend from '../heatmap/ScaleLegend'`, replace the whole `right={<div …>−9% … +9%</div>}` block with `right={<ScaleLegend cap={PERFORMANCE_CAPS.month} />}`, and drop `NEGATIVE`, `POSITIVE`, `withAlpha` from its charts import if nothing else in the file uses them.

- [ ] **Step 4: Run to verify they pass**

Run: `cd frontend && npx vitest run src/components/heatmap src/components/analytics`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/heatmap frontend/src/components/analytics/MonthlyReturnsHeatmap.jsx
git commit -m "feat: shared heat tile and scale legend"
```

---

### Task 5: `PortfolioHeatmap` on the Dashboard

**Files:**
- Create: `frontend/src/components/dashboard/PortfolioHeatmap.jsx`
- Modify: `frontend/src/pages/Dashboard.jsx`
- Test: `frontend/src/components/dashboard/PortfolioHeatmap.test.jsx`, `frontend/src/pages/Dashboard.test.jsx`

**Interfaces:**
- Consumes: `layoutPortfolio`, `labelLevel`, `dayMoves`, `daySummary`, `sincePurchaseSummary`, `SECTOR_HEADER` (Task 3); `performanceFill`, `PERFORMANCE_CAPS` (Task 2); `moveLabel`, `LAST_SESSION_NOTE` (Task 2); `HeatTile`, `ScaleLegend` (Task 4); `useSize` from `lib/chartGeometry.js`; `usePositionQuotes` from `api/queries`.
- Produces: `PortfolioHeatmap({ positions, quotes: Map<uic, quote> })`. `Dashboard` now holds `quotes` (from one `usePositionQuotes` call) for Task 7 to reuse.

- [ ] **Step 1: Write the failing tests**

`frontend/src/components/dashboard/PortfolioHeatmap.test.jsx`:

```jsx
import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { renderWithProviders } from '../../test/renderWithProviders'
import { LAST_SESSION_NOTE } from '../../lib/pricing'
import PortfolioHeatmap from './PortfolioHeatmap'

const positions = [
  { id: 1, ticker: 'NVDA', name: 'NVIDIA', sector: 'Technology', value: '6000.00', weight: '60.0', pnl: '2500.00', pnl_pct: 71.4, uic: 211, asset_type: 'Stock' },
  { id: 2, ticker: 'MSFT', name: 'Microsoft', sector: 'Technology', value: '3000.00', weight: '30.0', pnl: '-200.00', pnl_pct: -6.3, uic: 212, asset_type: 'Stock' },
  { id: 3, ticker: 'KO', name: 'Coca-Cola', sector: 'Staples', value: '1000.00', weight: '10.0', pnl: '50.00', pnl_pct: 5.3, uic: null, asset_type: null },
]

const live = new Map([
  [211, { uic: 211, change_pct: 2.0, change_basis: 'live' }],
  [212, { uic: 212, change_pct: -1.0, change_basis: 'live' }],
])

const tile = (ticker) => screen.getByRole('link', { name: new RegExp(`^${ticker} `) })

describe('PortfolioHeatmap', () => {
  it('gives every holding a tile linking to its research page', () => {
    renderWithProviders(<PortfolioHeatmap positions={positions} quotes={live} />)
    expect(tile('NVDA')).toHaveAttribute('href', '/research?symbol=NVDA&uic=211&assetType=Stock')
    expect(tile('KO')).toHaveAttribute('href', '/research?symbol=KO')
  })

  it("opens on today's move, with a dash for a holding that has no quote", () => {
    renderWithProviders(<PortfolioHeatmap positions={positions} quotes={live} />)
    expect(tile('NVDA')).toHaveTextContent('+2.0%')
    expect(tile('MSFT')).toHaveTextContent('-1.0%')
    expect(tile('KO')).toHaveTextContent('—')
  })

  it('names each sector with its share of the book', () => {
    renderWithProviders(<PortfolioHeatmap positions={positions} quotes={live} />)
    expect(screen.getByText('Technology · 90%')).toBeInTheDocument()
    expect(screen.getByText('Staples · 10%')).toBeInTheDocument()
  })

  it('sums the day in euros and names the biggest driver', () => {
    renderWithProviders(<PortfolioHeatmap positions={positions} quotes={live} />)
    const summary = screen.getByText(/biggest driver/).closest('p')
    expect(summary).toHaveTextContent('+€87')
    expect(summary).toHaveTextContent('NVDA +€118')
  })

  it('switches to the return since purchase', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PortfolioHeatmap positions={positions} quotes={live} />)
    await user.click(screen.getByRole('button', { name: 'Since purchase' }))
    expect(tile('NVDA')).toHaveTextContent('+71.4%')
    const summary = screen.getByText(/Biggest contributor/).closest('p')
    expect(summary).toHaveTextContent('NVDA +€2,500')
    expect(summary).toHaveTextContent('MSFT -€200')
  })

  it('discloses a last-session move instead of calling it today', () => {
    const lastClose = new Map([[211, { uic: 211, change_pct: 2.0, change_basis: 'last_close' }]])
    renderWithProviders(<PortfolioHeatmap positions={positions} quotes={lastClose} />)
    expect(screen.getByRole('button', { name: 'Last session' })).toBeInTheDocument()
    expect(screen.getByText(LAST_SESSION_NOTE)).toBeInTheDocument()
  })

  it('keeps a tile too small for text reachable by name', () => {
    const lopsided = [
      { id: 1, ticker: 'BIG', name: 'Big', sector: 'Tech', value: '99900', weight: '99.99', pnl: '0', pnl_pct: 0, uic: 1, asset_type: 'Stock' },
      { id: 2, ticker: 'TINY', name: 'Tiny', sector: 'Tech', value: '10', weight: '0.01', pnl: '0', pnl_pct: 0, uic: 2, asset_type: 'Stock' },
    ]
    renderWithProviders(<PortfolioHeatmap positions={lopsided} quotes={new Map()} />)
    expect(tile('TINY')).toBeInTheDocument()
    expect(screen.queryByText('TINY')).not.toBeInTheDocument()
  })

  it('shows an empty state without holdings', () => {
    renderWithProviders(<PortfolioHeatmap positions={[]} quotes={new Map()} />)
    expect(screen.getByText('No holdings yet.')).toBeInTheDocument()
  })
})
```

Why these numbers: NVDA `6000 × 2 / 102 = 117.65`, MSFT `3000 × −1 / 99 = −30.30`, sum `+87.35` → `+€87`; KO has no uic so it is left out of the sum. jsdom has no layout, so `useSize` reports its 760px fallback width and 0 height; the component falls back to 280px — big enough for NVDA, MSFT and KO to carry full labels, and small enough for TINY (≈21 px²) to carry none.

In `frontend/src/pages/Dashboard.test.jsx`, add to `stub()`:

```js
  queries.usePositionQuotes.mockReturnValue(new Map())
```

and add a test inside the `describe`:

```js
  it('maps where the capital sits and what is moving it', () => {
    stub()
    renderWithProviders(<Dashboard />)
    expect(screen.getByText('Allocation & movement')).toBeInTheDocument()
  })
```

(Match the file's existing `beforeEach`/`stub()` pattern — if `stub()` is already called in a `beforeEach`, drop the `stub()` line from the new test.)

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run src/components/dashboard/PortfolioHeatmap.test.jsx src/pages/Dashboard.test.jsx`
Expected: FAIL — `PortfolioHeatmap` not found; Dashboard has no "Allocation & movement".

- [ ] **Step 3: Implement the component**

`frontend/src/components/dashboard/PortfolioHeatmap.jsx`:

```jsx
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { useSize } from '../../lib/chartGeometry'
import { PERFORMANCE_CAPS, performanceFill } from '../../lib/charts'
import { fmtEur, fmtNum, fmtPct } from '../../lib/format'
import {
  SECTOR_HEADER,
  dayMoves,
  daySummary,
  labelLevel,
  layoutPortfolio,
  sincePurchaseSummary,
} from '../../lib/heatmap'
import { LAST_SESSION_NOTE, moveLabel } from '../../lib/pricing'
import { researchHref } from '../../lib/research'
import { Card, CardHeader, TBtn } from '../ui'
import HeatTile from '../heatmap/HeatTile'
import ScaleLegend from '../heatmap/ScaleLegend'

const FALLBACK_HEIGHT = 280
const TILE_GAP = 2
const signedEur = (value) => fmtEur(value, { sign: true, decimals: 0 })

function tileTitle(position, sector, move, dayLabel) {
  const impact = move.impactEur == null ? '' : ` (≈ ${signedEur(move.impactEur)} price move)`
  return [
    `${position.ticker} · ${position.name} · ${sector}`,
    `${fmtEur(position.value)} · ${fmtPct(position.weight, { sign: false, decimals: 1 })} of portfolio`,
    `${dayLabel} ${fmtPct(move.changePct, { decimals: 1 })}${impact}`,
    `Since purchase ${fmtPct(position.pnl_pct, { decimals: 1 })}`,
  ].join('\n')
}

function DayLine({ summary, label }) {
  if (!summary) return 'No price moves available yet.'
  return (
    <>
      {label}{' '}
      <span className={summary.impactEur >= 0 ? 'text-emerald-400' : 'text-red-400'}>
        {signedEur(summary.impactEur)} ({fmtPct(summary.pct, { decimals: 1 })})
      </span>
      {' · biggest driver '}
      <span className="text-zinc-300">
        {summary.driver.position.ticker} {signedEur(summary.driver.impactEur)}
      </span>
    </>
  )
}

function SincePurchaseLine({ summary }) {
  if (!summary || (!summary.contributor && !summary.drag)) return 'No gains or losses yet.'
  const { contributor, drag } = summary
  return (
    <>
      {contributor ? (
        <>
          Biggest contributor{' '}
          <span className="text-emerald-400">
            {contributor.ticker} {signedEur(contributor.pnl)}
          </span>
        </>
      ) : null}
      {drag ? (
        <>
          {contributor ? ' · biggest drag ' : 'Biggest drag '}
          <span className="text-red-400">
            {drag.ticker} {signedEur(drag.pnl)}
          </span>
        </>
      ) : null}
    </>
  )
}

export default function PortfolioHeatmap({ positions, quotes }) {
  const [metric, setMetric] = useState('day')
  const [ref, size] = useSize()
  const height = size.height || FALLBACK_HEIGHT
  const layout = useMemo(
    () => layoutPortfolio(positions, { width: size.width, height }),
    [positions, size.width, height],
  )
  const moves = useMemo(
    () => new Map(dayMoves(positions, quotes).map((move) => [move.position.ticker, move])),
    [positions, quotes],
  )
  const dayLabel = moveLabel(quotes.values())
  const cap = metric === 'day' ? PERFORMANCE_CAPS.day : PERFORMANCE_CAPS.sincePurchase

  return (
    <Card>
      <CardHeader
        title="Allocation & movement"
        subtitle="Sized by value, grouped by sector"
        right={
          <div className="flex items-center gap-3">
            <ScaleLegend cap={cap} />
            <div className="flex items-center gap-0.5">
              <TBtn active={metric === 'day'} onClick={() => setMetric('day')}>{dayLabel}</TBtn>
              <TBtn active={metric === 'sincePurchase'} onClick={() => setMetric('sincePurchase')}>
                Since purchase
              </TBtn>
            </div>
          </div>
        }
      />
      <p className="mt-2 text-[var(--fig-xs)] text-zinc-500 num">
        {metric === 'day' ? (
          <DayLine summary={daySummary([...moves.values()])} label={dayLabel} />
        ) : (
          <SincePurchaseLine summary={sincePurchaseSummary(positions)} />
        )}
      </p>
      {metric === 'day' && dayLabel !== 'Today' ? (
        <p className="mt-1 text-[var(--fig-2xs)] text-amber-400/80">{LAST_SESSION_NOTE}</p>
      ) : null}

      <div ref={ref} className="relative mt-3 h-[220px] md:h-[280px]">
        {layout.tiles.length === 0 ? (
          <p className="text-[var(--fig-xs)] text-zinc-500">No holdings yet.</p>
        ) : null}
        {layout.sectors
          .filter((sector) => sector.headed)
          .map((sector) => (
            <div
              key={sector.sector}
              className="absolute px-1.5 truncate text-[var(--fig-2xs)] text-zinc-400"
              style={{
                left: sector.x,
                top: sector.y,
                width: sector.width,
                height: SECTOR_HEADER,
                lineHeight: `${SECTOR_HEADER}px`,
              }}
            >
              {sector.sector} · {fmtNum(sector.pct, 0)}%
            </div>
          ))}
        {layout.tiles.map((tile) => {
          const position = tile.position
          const move = moves.get(position.ticker)
          const pct = metric === 'day' ? move.changePct : position.pnl_pct
          const width = Math.max(0, tile.width - TILE_GAP)
          const tileHeight = Math.max(0, tile.height - TILE_GAP)
          const title = tileTitle(position, tile.sector, move, dayLabel)
          return (
            <HeatTile
              key={position.ticker}
              as={Link}
              to={researchHref(position.ticker, undefined, { uic: position.uic, assetType: position.asset_type })}
              ticker={position.ticker}
              pct={pct}
              fill={performanceFill(pct, { cap })}
              level={labelLevel(width, tileHeight)}
              title={title}
              aria-label={title.replaceAll('\n', ', ')}
              className="absolute"
              style={{ left: tile.x + TILE_GAP / 2, top: tile.y + TILE_GAP / 2, width, height: tileHeight }}
            />
          )
        })}
      </div>
    </Card>
  )
}
```

- [ ] **Step 4: Wire it into the Dashboard**

In `frontend/src/pages/Dashboard.jsx`:

1. Add `usePositionQuotes` to the `../api/queries` import, and `import PortfolioHeatmap from '../components/dashboard/PortfolioHeatmap'`.
2. Above `export default function Dashboard()`: `const NO_POSITIONS = []`.
3. After `const budgetProgressQuery = useBudgetProgress()` (before any early return — it is a hook):

```js
  const quotes = usePositionQuotes(positionsQuery.data ?? NO_POSITIONS)
```

4. Inside the Tier 2 `<div>`, directly after the closing `</StatStrip>`:

```jsx
        <div className="mt-4">
          <PortfolioHeatmap positions={positions} quotes={quotes} />
        </div>
```

- [ ] **Step 5: Run to verify they pass**

Run: `cd frontend && npx vitest run src/components/dashboard src/pages/Dashboard.test.jsx`
Expected: PASS. If a pre-existing Dashboard assertion now finds two `NVDA` matches, scope it with `within(...)` to its own card rather than loosening it to `getAll`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/dashboard/PortfolioHeatmap.jsx frontend/src/components/dashboard/PortfolioHeatmap.test.jsx frontend/src/pages/Dashboard.jsx frontend/src/pages/Dashboard.test.jsx
git commit -m "feat: portfolio heatmap - capital by sector, colored by today's move or return since purchase"
```

---

### Task 6: `ExposureCard` hands sector allocation to the heatmap

**Files:**
- Modify: `frontend/src/components/dashboard/ExposureCard.jsx`, `frontend/src/pages/Dashboard.jsx`
- Test: `frontend/src/components/dashboard/ExposureCard.test.jsx`

**Interfaces:**
- Produces: `ExposureCard({ currency, concentration })` — the `sector` prop is gone.

- [ ] **Step 1: Rewrite the tests (they fail against the current card)**

Replace `frontend/src/components/dashboard/ExposureCard.test.jsx` with:

```jsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import ExposureCard from './ExposureCard'

const concentration = { top1: { ticker: 'NVDA', pct: 60 }, top3_pct: 100, hhi: 0.46, positions: 3 }

describe('ExposureCard', () => {
  it('lists currencies and a concentration caption under its own title', () => {
    render(
      <ExposureCard
        concentration={concentration}
        currency={[
          { currency: 'USD', pct: 90, value: '9000.00' },
          { currency: 'EUR', pct: 10, value: '1000.00' },
        ]}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Currency & concentration' })).toBeInTheDocument()
    expect(screen.getByText('USD')).toBeInTheDocument()
    expect(screen.getByText(/Top 3: 100%/)).toBeInTheDocument()
    expect(screen.getByText(/HHI 0\.46/)).toBeInTheDocument()
  })

  it('shows a single currency as text, not a legend', () => {
    render(<ExposureCard concentration={concentration} currency={[{ currency: 'EUR', pct: 100, value: '10000.00' }]} />)
    expect(screen.getByText(/100% EUR/)).toBeInTheDocument()
  })

  it('shows an empty state with no holdings', () => {
    render(<ExposureCard concentration={{}} currency={[]} />)
    expect(screen.getByText('No holdings yet.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run src/components/dashboard/ExposureCard.test.jsx`
Expected: FAIL — no "Currency & concentration" heading; the card crashes on the missing `sector` prop.

- [ ] **Step 3: Implement**

In `ExposureCard.jsx`: delete `MAX_SECTOR_SLICES`, `topSectorsWithOther` (with its doc comment), `Donut`, and the `recharts` / `chartTooltipProps` / `fmtEur` imports; keep `Legend` and its `SECTOR_PALETTE` import. Replace the default export with:

```jsx
export default function ExposureCard({ currency, concentration }) {
  const c = concentration || {}
  const caption = [
    c.top3_pct != null && `Top 3: ${Math.round(c.top3_pct)}%`,
    c.hhi != null && `HHI ${c.hhi.toFixed(2)}`,
    c.positions != null && `${c.positions} position${c.positions === 1 ? '' : 's'}`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Card>
      <CardHeader title="Currency & concentration" subtitle="By value" />
      <div className="mt-3">
        {currency.length > 1 ? (
          <Legend rows={currency} nameKey="currency" />
        ) : currency.length === 1 ? (
          <p className="text-[var(--fig-xs)] text-zinc-500">100% {currency[0].currency}</p>
        ) : (
          <p className="text-[var(--fig-xs)] text-zinc-500">No holdings yet.</p>
        )}
      </div>
      {caption && <p className="mt-3 text-[var(--fig-2xs)] text-zinc-500">{caption}</p>}
    </Card>
  )
}
```

In `Dashboard.jsx`: remove `sector={insights.sector_exposure}` from `<ExposureCard …>`, and add `items-start` to the Tier 3 grid's class list (`grid grid-cols-1 lg:grid-cols-3 gap-4 items-start`) — the slimmer card must not be stretched to its neighbours' height.

- [ ] **Step 4: Run to verify they pass**

Run: `cd frontend && npx vitest run src/components/dashboard src/pages/Dashboard.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/ExposureCard.jsx frontend/src/components/dashboard/ExposureCard.test.jsx frontend/src/pages/Dashboard.jsx
git commit -m "refactor: leave sector allocation to the heatmap; exposure card keeps currency and concentration"
```

---

### Task 7: `MoversCard` — Today | Since purchase

**Files:**
- Modify: `frontend/src/components/dashboard/MoversCard.jsx`, `frontend/src/pages/Dashboard.jsx`
- Test: `frontend/src/components/dashboard/MoversCard.test.jsx`

**Interfaces:**
- Consumes: `dayMoves`, `rankDayMoves` (Task 3); `moveLabel` (Task 2); `quotes` held by `Dashboard` (Task 5).
- Produces: `MoversCard({ movers, positions = [], quotes = new Map() })`; defaults to Since purchase.

- [ ] **Step 1: Write the failing tests**

Append to the `describe` in `MoversCard.test.jsx` (add `userEvent` import):

```jsx
  const positions = [
    { ticker: 'NVDA', value: '1020.00', uic: 211 },
    { ticker: 'INTC', value: '990.00', uic: 212 },
    { ticker: 'KO', value: '500.00', uic: 213 },
  ]
  const live = new Map([
    [211, { uic: 211, change_pct: 2, change_basis: 'live' }],
    [212, { uic: 212, change_pct: -1, change_basis: 'live' }],
  ])

  it('opens on the unrealized return since purchase', () => {
    renderWithProviders(<MoversCard movers={movers} positions={positions} quotes={live} />)
    expect(screen.getByText('Unrealized return vs. average cost')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Since purchase' })).toHaveAttribute('aria-pressed', 'true')
  })

  it("ranks today's moves when switched, skipping holdings without a quote", async () => {
    const user = userEvent.setup()
    renderWithProviders(<MoversCard movers={movers} positions={positions} quotes={live} />)
    await user.click(screen.getByRole('button', { name: 'Today' }))
    expect(screen.getByText('+2.0%')).toBeInTheDocument()
    expect(screen.getByText('-1.0%')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'KO' })).not.toBeInTheDocument()
  })

  it('calls a last-close move the last session', async () => {
    const user = userEvent.setup()
    const lastClose = new Map([[211, { uic: 211, change_pct: 2, change_basis: 'last_close' }]])
    renderWithProviders(<MoversCard movers={movers} positions={positions} quotes={lastClose} />)
    await user.click(screen.getByRole('button', { name: 'Last session' }))
    expect(screen.getByText('Last completed session')).toBeInTheDocument()
  })

  it('says so when no holding has a move today', async () => {
    const user = userEvent.setup()
    renderWithProviders(<MoversCard movers={movers} positions={positions} quotes={new Map()} />)
    await user.click(screen.getByRole('button', { name: 'Today' }))
    expect(screen.getByText('No price moves available yet.')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run src/components/dashboard/MoversCard.test.jsx`
Expected: the four new tests FAIL (no toggle); the two existing ones PASS.

- [ ] **Step 3: Implement**

Replace `MoversCard.jsx` with (the existing "Stacked, not side-by-side" comment moves with its markup, unchanged):

```jsx
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { fmtEur, fmtPct } from '../../lib/format'
import { dayMoves, rankDayMoves } from '../../lib/heatmap'
import { moveLabel } from '../../lib/pricing'
import { researchHref } from '../../lib/research'
import { Card, CardHeader, TBtn } from '../ui'

const NO_POSITIONS = []
const NO_QUOTES = new Map()

function Row({ ticker, pct, eur }) {
  const up = Number(pct) >= 0
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <Link
        to={researchHref(ticker)}
        className="text-[var(--fig-sm)] font-medium text-zinc-100 hover:text-blue-300"
      >
        {ticker}
      </Link>
      <div className="flex items-center gap-2">
        <span className={`text-[var(--fig-xs)] num font-mono ${up ? 'text-emerald-400' : 'text-red-400'}`}>
          {fmtPct(pct, { decimals: 1 })}
        </span>
        <span className="text-[var(--fig-2xs)] num font-mono text-zinc-600">
          {fmtEur(eur, { sign: true, decimals: 0 })}
        </span>
      </div>
    </div>
  )
}

function Column({ title, rows }) {
  return (
    <div>
      <div className="text-[var(--fig-2xs)] uppercase tracking-wide text-zinc-600 mb-1">{title}</div>
      {rows.map((row) => <Row key={row.ticker} {...row} />)}
    </div>
  )
}

const sincePurchaseRows = (rows) => rows.map((r) => ({ ticker: r.ticker, pct: r.pnl_pct, eur: r.pnl }))
const dayRows = (moves) => moves.map((m) => ({ ticker: m.position.ticker, pct: m.changePct, eur: m.impactEur }))

export default function MoversCard({ movers, positions = NO_POSITIONS, quotes = NO_QUOTES }) {
  const [metric, setMetric] = useState('sincePurchase')
  const dayLabel = moveLabel(quotes.values())
  const today = useMemo(() => rankDayMoves(dayMoves(positions, quotes)), [positions, quotes])

  const rows =
    metric === 'day'
      ? { best: dayRows(today.best), worst: dayRows(today.worst) }
      : { best: sincePurchaseRows(movers.best), worst: sincePurchaseRows(movers.worst) }
  const empty = rows.best.length === 0 && rows.worst.length === 0
  const subtitle =
    metric === 'sincePurchase'
      ? 'Unrealized return vs. average cost'
      : dayLabel === 'Today'
        ? 'Price move today'
        : 'Last completed session'

  return (
    <Card>
      <CardHeader
        title="Movers"
        subtitle={subtitle}
        right={
          <div className="flex items-center gap-0.5">
            <TBtn active={metric === 'day'} onClick={() => setMetric('day')}>{dayLabel}</TBtn>
            <TBtn active={metric === 'sincePurchase'} onClick={() => setMetric('sincePurchase')}>
              Since purchase
            </TBtn>
          </div>
        }
      />
      {empty ? (
        <p className="mt-3 text-[var(--fig-xs)] text-zinc-500">
          {metric === 'day' ? 'No price moves available yet.' : 'No holdings to compare yet.'}
        </p>
      ) : (
        // Stacked, not side-by-side: this card now sits in a narrower
        // one-third column on Dashboard (previously it had half the page),
        // and a ticker + % + € row needs more width than a two-up layout
        // leaves it there.
        <div className="mt-3 space-y-4">
          <Column title="Gainers" rows={rows.best} />
          <Column title="Losers" rows={rows.worst} />
        </div>
      )}
    </Card>
  )
}
```

In `Dashboard.jsx`: `<MoversCard movers={insights.movers} positions={positions} quotes={quotes} />`.

- [ ] **Step 4: Run to verify they pass**

Run: `cd frontend && npx vitest run src/components/dashboard src/pages/Dashboard.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/MoversCard.jsx frontend/src/components/dashboard/MoversCard.test.jsx frontend/src/pages/Dashboard.jsx
git commit -m "feat: movers card switches between today's move and the return since purchase"
```

---

### Task 8: Watchlist heatmap in the Advanced View rail

**Files:**
- Create: `frontend/src/components/research/WatchlistHeatmap.jsx`
- Modify: `frontend/src/components/research/WatchlistRail.jsx`, `frontend/src/pages/ResearchChart.jsx`
- Test: `frontend/src/components/research/WatchlistHeatmap.test.jsx`, `frontend/src/components/research/WatchlistRail.test.jsx`

**Interfaces:**
- Consumes: `sortByMove`, `breadth` (Task 3); `performanceFill`, `PERFORMANCE_CAPS` (Task 2); `moveLabel` (Task 2); `HeatTile` (Task 4); the rail's own `items` and `quotes` map.
- Produces: `WatchlistHeatmap({ items, quotes, symbol, heldSymbols, onSelectSymbol })`; `WatchlistRail` gains `gridView = false`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/components/research/WatchlistHeatmap.test.jsx`:

```jsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import WatchlistHeatmap from './WatchlistHeatmap'

const items = [
  { id: 1, symbol: 'AAPL', uic: 1, asset_type: 'Stock' },
  { id: 2, symbol: 'NVDA', uic: 2, asset_type: 'Stock' },
  { id: 3, symbol: 'TSLA', uic: 3, asset_type: 'Stock' },
  { id: 4, symbol: 'IWDA', uic: 4, asset_type: 'Etf' },
  { id: 5, symbol: 'KO', uic: 5, asset_type: 'Stock' },
]

const quotes = new Map([
  [1, { uic: 1, change_pct: 0.05, change_basis: 'live' }],
  [2, { uic: 2, change_pct: 3.1, change_basis: 'live' }],
  [3, { uic: 3, change_pct: -2.4, change_basis: 'live' }],
  [5, { uic: 5, change_pct: 0.8, change_basis: 'live' }],
])

const renderGrid = (props = {}) => {
  const onSelectSymbol = vi.fn()
  render(
    <WatchlistHeatmap
      items={items}
      quotes={quotes}
      symbol="TSLA"
      heldSymbols={new Set(['NVDA'])}
      onSelectSymbol={onSelectSymbol}
      {...props}
    />,
  )
  return onSelectSymbol
}

describe('WatchlistHeatmap', () => {
  it('orders tiles from biggest gain to biggest loss, unknown last', () => {
    renderGrid()
    const order = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label').split(' ')[0])
    expect(order).toEqual(['NVDA', 'KO', 'AAPL', 'TSLA', 'IWDA'])
  })

  it('counts risers and fallers, leaving flat and unknown out', () => {
    renderGrid()
    expect(screen.getByLabelText('2 up, 1 down')).toBeInTheDocument()
  })

  it('marks the charted symbol and the held ones', () => {
    renderGrid()
    expect(screen.getByRole('button', { name: /^TSLA/ })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: /^NVDA/ })).toHaveAccessibleName('NVDA +3.1%, in portfolio')
  })

  it('loads a tile into the chart', async () => {
    const user = userEvent.setup()
    const onSelectSymbol = renderGrid()
    await user.click(screen.getByRole('button', { name: /^NVDA/ }))
    expect(onSelectSymbol).toHaveBeenCalledWith('NVDA', { uic: 2, assetType: 'Stock' })
  })

  it('calls a last-close move the last session', () => {
    renderGrid({ quotes: new Map([[2, { uic: 2, change_pct: 3.1, change_basis: 'last_close' }]]) })
    expect(screen.getByText('Last session · sorted by move')).toBeInTheDocument()
  })
})
```

Append to `WatchlistRail.test.jsx`'s `describe`:

```jsx
  it('offers no grid view outside the advanced chart', () => {
    render()
    expect(screen.queryByRole('button', { name: 'Grid view' })).not.toBeInTheDocument()
  })

  it('switches to the heatmap grid and remembers the choice', async () => {
    const user = userEvent.setup()
    const { unmount } = render({ gridView: true })

    await user.click(screen.getByRole('button', { name: 'Grid view' }))
    expect(screen.getByText(/sorted by move/)).toBeInTheDocument()
    expect(localStorage.getItem('saxodash:watchlist-view')).toBe('grid')

    unmount()
    render({ gridView: true })
    expect(screen.getByText(/sorted by move/)).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run src/components/research/WatchlistHeatmap.test.jsx src/components/research/WatchlistRail.test.jsx`
Expected: FAIL — module not found / no "Grid view" button.

- [ ] **Step 3: Implement `WatchlistHeatmap`**

```jsx
import { useMemo } from 'react'

import { PERFORMANCE_CAPS, performanceFill } from '../../lib/charts'
import { fmtPct } from '../../lib/format'
import { breadth, sortByMove } from '../../lib/heatmap'
import { moveLabel } from '../../lib/pricing'
import HeatTile from '../heatmap/HeatTile'

export default function WatchlistHeatmap({ items, quotes, symbol, heldSymbols, onSelectSymbol }) {
  const sorted = useMemo(() => sortByMove(items, quotes), [items, quotes])
  const counts = breadth(items.map((item) => quotes.get(item.uic)?.change_pct ?? null))

  return (
    <>
      <div className="flex items-center justify-between px-3 h-7 text-[var(--fig-2xs)] text-zinc-500 border-b border-white/[0.06]">
        <span>{moveLabel(quotes.values())} · sorted by move</span>
        <span className="num font-mono" aria-label={`${counts.up} up, ${counts.down} down`}>
          <span className="text-emerald-400">▲ {counts.up}</span>{' '}
          <span className="text-red-400">▼ {counts.down}</span>
        </span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-1 p-2">
        {sorted.map((item) => {
          const change = quotes.get(item.uic)?.change_pct ?? null
          const held = heldSymbols.has(item.symbol)
          return (
            <HeatTile
              key={item.id}
              ticker={item.symbol}
              pct={change}
              fill={performanceFill(change, { cap: PERFORMANCE_CAPS.day })}
              active={item.symbol === symbol}
              marker={held ? <span className="w-1.5 h-1.5 rounded-full bg-blue-400" /> : null}
              aria-label={`${item.symbol} ${fmtPct(change, { decimals: 1 })}${held ? ', in portfolio' : ''}`}
              className="h-12"
              onClick={() => onSelectSymbol(item.symbol, { uic: item.uic, assetType: item.asset_type })}
            />
          )
        })}
      </div>
    </>
  )
}
```

- [ ] **Step 4: Add the view toggle to `WatchlistRail`**

1. Imports: add `LayoutGrid, LayoutList` to the lucide import, `TBtn` to the `../ui` import, and `import WatchlistHeatmap from './WatchlistHeatmap'`.
2. Module level, after `NO_ITEMS`:

```js
const VIEW_KEY = 'saxodash:watchlist-view'

function readView() {
  try {
    return localStorage.getItem(VIEW_KEY) === 'grid' ? 'grid' : 'list'
  } catch {
    return 'list'
  }
}

function writeView(view) {
  try {
    localStorage.setItem(VIEW_KEY, view)
  } catch {
    return
  }
}
```

3. Signature: `export default function WatchlistRail({ symbol, onSelectSymbol, heldSymbols, fill = false, gridView = false })`.
4. With the other state:

```js
  const [view, setView] = useState(readView)
  const showGrid = gridView && view === 'grid'
  const chooseView = (next) => {
    setView(next)
    writeView(next)
  }
```

5. In the header row, directly after the `{items.length}` count `<span>`:

```jsx
        {gridView ? (
          <div className="flex items-center gap-0.5">
            <TBtn active={!showGrid} onClick={() => chooseView('list')} title="List view">
              <LayoutList size={12} />
            </TBtn>
            <TBtn active={showGrid} onClick={() => chooseView('grid')} title="Grid view">
              <LayoutGrid size={12} />
            </TBtn>
          </div>
        ) : null}
```

6. Wrap the `Symbol / Last / Chg%` column-header `<div>` in `{showGrid ? null : ( … )}`.
7. In the scroll container, replace `{items.map((item) => { … })}` with:

```jsx
        {showGrid ? (
          items.length > 0 ? (
            <WatchlistHeatmap
              items={items}
              quotes={quotes}
              symbol={symbol}
              heldSymbols={heldSymbols}
              onSelectSymbol={onSelectSymbol}
            />
          ) : null
        ) : (
          items.map((item) => { /* the existing row render, unchanged */ })
        )}
```

8. In `frontend/src/pages/ResearchChart.jsx`: `<WatchlistRail fill gridView symbol={symbol} … />`.

- [ ] **Step 5: Run to verify they pass**

Run: `cd frontend && npx vitest run src/components/research src/pages/ResearchChart.test.jsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/research/WatchlistHeatmap.jsx frontend/src/components/research/WatchlistHeatmap.test.jsx frontend/src/components/research/WatchlistRail.jsx frontend/src/components/research/WatchlistRail.test.jsx frontend/src/pages/ResearchChart.jsx
git commit -m "feat: watchlist heatmap grid in the advanced chart's rail, sorted by move"
```

---

### Task 9: Elevated-volume shading

**Files:**
- Modify: `frontend/src/lib/indicators.js`, `frontend/src/components/research/panes.jsx`, `frontend/src/components/research/ChartCanvas.jsx`
- Test: `frontend/src/lib/indicators.test.js`, `frontend/src/components/research/panes.test.jsx` (create), `frontend/src/components/research/ChartCanvas.test.jsx`

**Interfaces:**
- Produces: `RVOL_WINDOW = 20`, `RVOL_ELEVATED = 2`, `relativeVolume(bars, window = RVOL_WINDOW) → (number|null)[]`; `computeIndicatorsForRange(...)` result gains `rvol`; `VolumePane({ data, rvol = null, hover, setHover, height })`.

- [ ] **Step 1: Write the failing tests**

In `indicators.test.js`, add `relativeVolume` to the import and append:

```js
describe('relativeVolume', () => {
  const withVolumes = (volumes) => volumes.map((volume, i) => ({ ...bars([10])[0], date: `d${i}`, volume }))

  it('compares a bar with the 20 sessions before it, not including itself', () => {
    expect(relativeVolume(withVolumes([...Array(20).fill(100), 300]))[20]).toBe(3)
  })

  it('has no reading until 15 sessions of history exist', () => {
    const rvol = relativeVolume(withVolumes(Array(16).fill(100)))
    expect(rvol.slice(0, 15).every((v) => v == null)).toBe(true)
    expect(rvol[15]).toBe(1)
  })

  it('treats zero volume as missing, not as a quiet day', () => {
    expect(relativeVolume(withVolumes([...Array(15).fill(100), ...Array(5).fill(0), 200]))[20]).toBe(2)
  })

  it('gives no reading when too many prior sessions are missing', () => {
    expect(relativeVolume(withVolumes([...Array(14).fill(100), ...Array(6).fill(0), 200]))[20]).toBeNull()
  })

  it('gives no reading for a bar with no volume of its own', () => {
    expect(relativeVolume(withVolumes([...Array(20).fill(100), 0]))[20]).toBeNull()
  })
})
```

And inside the existing `describe('computeIndicatorsForRange', …)`:

```js
  it('warms relative volume up on the bars before the visible range', () => {
    const series = bars(Array.from({ length: 40 }, (_, i) => i + 1)).map((bar, i) => ({
      ...bar,
      volume: i === 39 ? 2000 : 1000,
    }))
    const ranged = computeIndicatorsForRange(series, 5)
    expect(ranged.rvol).toHaveLength(5)
    expect(ranged.rvol[4]).toBe(2)
  })
```

Create `frontend/src/components/research/panes.test.jsx`:

```jsx
import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'

import { VolumePane } from './panes'

const data = [
  { date: '2026-09-01', open: 1, high: 2, low: 1, close: 2, volume: 100 },
  { date: '2026-09-02', open: 2, high: 2, low: 1, close: 1, volume: 300 },
]

describe('VolumePane', () => {
  it('brightens a bar traded on elevated volume', () => {
    const { container } = render(<VolumePane data={data} rvol={[null, 2.5]} hover={null} setHover={vi.fn()} />)
    const opacities = [...container.querySelectorAll('rect')].map((rect) => rect.getAttribute('opacity'))
    expect(opacities).toEqual(['0.4', '0.8'])
  })

  it('draws every bar plainly without a relative-volume series', () => {
    const { container } = render(<VolumePane data={data} hover={null} setHover={vi.fn()} />)
    const opacities = [...container.querySelectorAll('rect')].map((rect) => rect.getAttribute('opacity'))
    expect(opacities).toEqual(['0.4', '0.4'])
  })
})
```

In `ChartCanvas.test.jsx`'s legend `describe`:

```jsx
  it("reads the bar's volume against its 20-session average", () => {
    render(canvas())
    expect(screen.getByText(/1\.0× 20d avg/)).toBeInTheDocument()
  })
```

(The fixture's volumes are all ≈1,000,000, so the latest bar reads 1.0×.)

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run src/lib/indicators.test.js src/components/research/panes.test.jsx src/components/research/ChartCanvas.test.jsx`
Expected: FAIL — `relativeVolume` not exported, all bars at 0.4, no "20d avg".

- [ ] **Step 3: Implement**

`lib/indicators.js`, after `vwapSeries`:

```js
export const RVOL_WINDOW = 20
export const RVOL_ELEVATED = 2

export function relativeVolume(bars, window = RVOL_WINDOW) {
  const minSamples = Math.ceil(window * 0.75)
  return bars.map((bar, i) => {
    if (!(bar.volume > 0)) return null
    const prior = bars
      .slice(Math.max(0, i - window), i)
      .map((b) => b.volume)
      .filter((volume) => volume > 0)
    if (prior.length < minSamples) return null
    return bar.volume / (prior.reduce((sum, volume) => sum + volume, 0) / prior.length)
  })
}
```

and in `computeIndicatorsForRange`'s returned object add `rvol: tail(relativeVolume(bars)),`.

`panes.jsx`: import `RVOL_ELEVATED` from `../../lib/indicators`; `VolumeBars` takes `rvol` and sets `opacity={rvol?.[i] >= RVOL_ELEVATED ? 0.8 : 0.4}`; `VolumePane` takes `rvol = null` and passes it: `<VolumeBars data={data} rvol={rvol} … />`.

`ChartCanvas.jsx`: import `RVOL_WINDOW` from `../../lib/indicators`. In `OhlcLegend` add `const rvol = valueAt(ind.rvol, hover)` and change the volume span to:

```jsx
      <span className="text-zinc-500">
        Vol <span className="text-zinc-300">{fmtNum(bar.volume / 1e6, 1)}M</span>
        {rvol == null ? null : <span> · {fmtNum(rvol, 1)}× {RVOL_WINDOW}d avg</span>}
      </span>
```

and pass the series to the pane: `<VolumePane data={bars} rvol={ind.rvol} hover={hover} setHover={setHover} />`.

- [ ] **Step 4: Run to verify they pass**

Run: `cd frontend && npx vitest run src/lib/indicators.test.js src/components/research`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/indicators.js frontend/src/lib/indicators.test.js frontend/src/components/research/panes.jsx frontend/src/components/research/panes.test.jsx frontend/src/components/research/ChartCanvas.jsx frontend/src/components/research/ChartCanvas.test.jsx
git commit -m "feat: shade volume bars traded at twice their 20-session average"
```

---

### Task 10: Verify end to end, then record the decisions

**Files:**
- Modify: `docs/next-steps.md`, `AGENTS.md`
- Create (gitignored): `learning/learning-records/NNNN-<slug>.md` (only if something surprised you)

- [ ] **Step 1: Full automated checks**

```bash
cd backend && .venv/bin/python manage.py test
cd ../frontend && npx vitest run && npx eslint src && npm run build
```

Expected: all green. `grep -rn "#[0-9a-fA-F]\{6\}" src/components/heatmap src/components/dashboard/PortfolioHeatmap.jsx src/components/research/WatchlistHeatmap.jsx` returns nothing (no inlined chart colors).

- [ ] **Step 2: Screenshot review**

Use the `saxodash-design-system` skill's harness: Dashboard and `/research/chart` (grid view on) at 1440px and 390px. Check: tile labels don't overflow, sector headers read, the Tier 3 row isn't stretched, the rail grid is three columns at 1440px, the elevated volume bars are visible but not louder than the candles. Fix and re-run Step 1 for anything found.

- [ ] **Step 3: Live check against SIM**

Reconnect Saxo (the refresh token expired 2026-09-29), load the Dashboard: the toggle should read "Last session" with the amber note, and tiles should carry real moves. Load `/research/chart`, switch the rail to grid.

- [ ] **Step 4: Docs**

`docs/next-steps.md`: under a new "Market heatmaps (Phase 1)" heading mark it done with the spec path; move "Axis panning" to "recommended next".

`AGENTS.md`, append to "Decided":

```markdown
**Heatmaps run over what the app already prices, and say what "today" means.**
The Dashboard's portfolio heatmap and the Advanced View's watchlist grid cover
your positions and your watchlist only — neither Saxo nor Finnhub's free tier
has a market-wide feed. A quote's `change_basis` is `live` or `last_close`
(the SIM fallback's close-to-close move); any `last_close` row turns "Today"
into "Last session". Layout is a hand-rolled squarify in `lib/heatmap.js`, not
Recharts' `Treemap`: HTML tiles are focusable, carry sector headers, and
render in jsdom.
```

- [ ] **Step 5: Commit**

```bash
git add docs/next-steps.md AGENTS.md
git commit -m "docs: record the heatmap decisions and queue axis panning next"
```
