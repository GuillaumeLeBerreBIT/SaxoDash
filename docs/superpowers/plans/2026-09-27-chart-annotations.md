# Research Chart: Price-Axis Scaling and Price Lines — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Research price chart editable: drag the price axis to stretch/compress it, show the thesis target and a new stop price as draggable lines, and let the user draw, move and delete their own horizontal price lines.

**Architecture:** All drawing stays in the hand-rolled SVG chart (`TVChart.jsx`). Pure maths lives in `lib/chartGeometry.js` (scaled domain, inverse scale) and a new `lib/priceLines.js` (line list, rounding, parsing). A new `PriceLines.jsx` renders lines and the exact-value input; `TVChart` owns selection/editing state and chart-level gestures. A new `useChartLines` hook turns the note + saved lines into one list and routes saves to the right mutation. Backend: `SymbolNote.stop_price` plus a new `PriceLine` model keyed by `uic` + `asset_type`.

**Tech Stack:** Django + DRF (`research` app, `APITestCase`), React 19 + TanStack Query + vitest/jsdom/Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-27-chart-annotations-design.md`

## Global Constraints

- Generated code carries **zero comments** (AGENTS.md). Existing comments in touched files stay as they are. Tool directives (`// eslint-disable-next-line`) are the only exception.
- A migration is not done until `manage.py migrate` has run against the dev database, not only `manage.py test`.
- Prices are stored and sent with 2 decimal places; DRF returns them as strings (`"250.00"`), the frontend converts with `Number()`.
- Minimum savable price is `0.01`; the server rejects `<= 0` for `target_price`, `stop_price` and `PriceLine.price`.
- `PriceLine` is keyed by `uic` + `asset_type`; `stop_price` lives on `SymbolNote` (keyed by `symbol`).
- The automatic price domain is computed from bars only — annotation prices never widen it.
- `yScale` is clamped to `[0.1, 20]`, resets to `1` on symbol change, survives range/type changes, is not persisted.
- Colours come from `lib/charts.js`: target `POSITIVE`, stop `NEGATIVE`, freeform `CATEGORY_AXIS_TEXT`. Target/stop are dashed (`6 4`), freeform solid.
- Backend tests: `cd backend && .venv/bin/python manage.py test <module>`. Frontend tests: `cd frontend && npx vitest run <path>`.
- jsdom has no `setPointerCapture`: always call it as `e.currentTarget.setPointerCapture?.(e.pointerId)`. jsdom's `getBoundingClientRect()` returns zeros, so in tests `clientY` equals the SVG-local y.

## Review Focus

1. **A click is not a drag.** Pointer down/up on a line with no movement (e.g. clicking to select) must not save anything. → Task 6 test "does not save when a line is clicked without moving".
2. **Dragging below zero.** With the axis compressed (`yScale` 20) the domain's bottom is negative; dropping a line there must save `0.01`, never `0` or a negative the server would 400. → Task 5 `roundPrice` tests + Task 6 test "clamps a line dragged below zero to the minimum price".
3. **Double-click collisions.** Double-clicking the price axis resets the scale and must not also create a line; double-clicking an existing line must not create a duplicate under it. → Task 6 tests "double-clicking the axis does not create a line" and "double-clicking a line does not create another".
4. **Bad exact-value input.** Empty, non-numeric, comma-decimal (`12,5`) or negative text must cancel rather than save `NaN`/`0`; Escape followed by the input's blur must not save. → Task 5 `parsePriceInput` tests + Task 6 editor tests.
5. **Decimal strings and empty levels.** DRF sends `"250.00"`; a `null` or `""` target/stop must draw no line (not a line at 0). → Task 5 `chartLines` tests.

---

## Phase 1 — Price-axis scaling

### Task 1: Scalable price domain in `chartGeometry`

**Files:**
- Modify: `frontend/src/lib/chartGeometry.js` (`priceGeometry`, new exports)
- Test: `frontend/src/lib/chartGeometry.test.js`

**Interfaces:**
- Produces:
  - `priceGeometry({ data, ind, width, height, withBands, yScale = 1 })` now also returns `top: number`, `bottom: number`, `priceAtY(y: number): number`.
  - `scaleFromDrag(startScale: number, dy: number): number`
  - `MIN_Y_SCALE = 0.1`, `MAX_Y_SCALE = 20`

- [ ] **Step 1: Write the failing tests**

Change the import line at the top of `frontend/src/lib/chartGeometry.test.js` to:

```js
import {
  MAX_Y_SCALE,
  MIN_Y_SCALE,
  PAD_R,
  donutOuterRadius,
  indexFromPointer,
  linePath,
  paneGeometry,
  priceGeometry,
  scaleFromDrag,
} from './chartGeometry'
```

Append to the end of the file:

```js
describe('price scale', () => {
  it('maps a price to y and back', () => {
    const { scaleY, priceAtY } = geometry()

    expect(priceAtY(scaleY(107.5))).toBeCloseTo(107.5)
  })

  it('keeps the automatic domain when the scale is 1', () => {
    const { top, bottom } = geometry()

    expect(top).toBeCloseTo(120 + 30 * 0.07)
    expect(bottom).toBeCloseTo(90 - 30 * 0.07)
  })

  it('widens the domain around the same midpoint when compressed', () => {
    const base = geometry()
    const wide = geometry({ yScale: 2 })

    expect((wide.top + wide.bottom) / 2).toBeCloseTo((base.top + base.bottom) / 2)
    expect(wide.top - wide.bottom).toBeCloseTo(2 * (base.top - base.bottom))
  })

  it('narrows the domain when stretched', () => {
    const base = geometry()
    const narrow = geometry({ yScale: 0.5 })

    expect(narrow.top - narrow.bottom).toBeCloseTo((base.top - base.bottom) / 2)
  })

  it('puts the ticks on the scaled domain', () => {
    const { ticks, top, bottom } = geometry({ yScale: 3 })

    expect(ticks[0]).toBeCloseTo(bottom)
    expect(ticks[ticks.length - 1]).toBeCloseTo(top)
  })
})

describe('scaleFromDrag', () => {
  it('leaves the scale alone when the pointer has not moved', () => {
    expect(scaleFromDrag(1.5, 0)).toBe(1.5)
  })

  it('compresses when dragged down', () => {
    expect(scaleFromDrag(1, 60)).toBeGreaterThan(1)
  })

  it('stretches when dragged up', () => {
    expect(scaleFromDrag(1, -60)).toBeLessThan(1)
  })

  it('clamps to the allowed range', () => {
    expect(scaleFromDrag(1, 100_000)).toBe(MAX_Y_SCALE)
    expect(scaleFromDrag(1, -100_000)).toBe(MIN_Y_SCALE)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/chartGeometry.test.js`
Expected: FAIL — `scaleFromDrag is not a function` / `priceAtY is not a function`.

- [ ] **Step 3: Implement**

In `frontend/src/lib/chartGeometry.js`, below `const PAD_B = 6`, add:

```js
export const MIN_Y_SCALE = 0.1
export const MAX_Y_SCALE = 20

export function scaleFromDrag(startScale, dy) {
  return Math.min(MAX_Y_SCALE, Math.max(MIN_Y_SCALE, startScale * Math.exp(dy / 150)))
}
```

In `priceGeometry`, change the signature to
`export function priceGeometry({ data, ind, width, height, withBands, yScale = 1 }) {`
and replace

```js
  const pad = (max - min) * 0.07 || 1
  const top = max + pad
  const bottom = min - pad
```

with

```js
  const pad = (max - min) * 0.07 || 1
  const mid = (max + min) / 2
  const half = ((max - min) / 2 + pad) * yScale
  const top = mid + half
  const bottom = mid - half
```

and in the returned object add, after `scaleY`:

```js
    priceAtY: (y) => top - ((y - PAD_T) / chartH) * (top - bottom),
    top,
    bottom,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/chartGeometry.test.js`
Expected: PASS (all, including the pre-existing `priceGeometry` tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/chartGeometry.js frontend/src/lib/chartGeometry.test.js
git commit -m "feat: let the Research price domain scale around its midpoint"
```

---

### Task 2: Drag the price axis to scale the chart

**Files:**
- Modify: `frontend/src/components/research/useChartControls.js`
- Modify: `frontend/src/components/research/TVChart.jsx`
- Modify: `frontend/src/components/research/ChartPanel.jsx`
- Modify: `frontend/src/pages/Research.jsx`
- Test: `frontend/src/components/research/TVChart.test.jsx`

**Interfaces:**
- Consumes: `priceGeometry({ ..., yScale })`, `scaleFromDrag` (Task 1).
- Produces:
  - `useChartControls()` returns `yScale: number` and `setYScale(next: number)` in addition to its current fields.
  - `TVChart` props `yScale = 1`, `onYScaleChange?: (next: number) => void`. When `onYScaleChange` is absent there is no scale handle.
  - The scale handle is `rect[data-testid="price-scale"]`.
  - `ChartBody` takes a `clipId` prop; plot content is inside `g[clip-path="url(#<clipId>)"]`.

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/components/research/TVChart.test.jsx`:

```jsx
describe('price-axis scaling', () => {
  it('has no scale handle unless the parent can change the scale', () => {
    const { container } = renderChart()

    expect(container.querySelector('[data-testid="price-scale"]')).toBeNull()
  })

  it('compresses the scale when the axis is dragged down', () => {
    const onYScaleChange = vi.fn()
    const { getByTestId } = renderChart({ yScale: 1, onYScaleChange })

    const handle = getByTestId('price-scale')
    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientY: 160, pointerId: 1 })
    fireEvent.pointerUp(handle, { clientY: 160, pointerId: 1 })

    expect(onYScaleChange).toHaveBeenCalled()
    expect(onYScaleChange.mock.calls.at(-1)[0]).toBeGreaterThan(1)
  })

  it('ignores pointer movement over the axis when no drag started', () => {
    const onYScaleChange = vi.fn()
    const { getByTestId } = renderChart({ yScale: 1, onYScaleChange })

    fireEvent.pointerMove(getByTestId('price-scale'), { clientY: 160, pointerId: 1 })

    expect(onYScaleChange).not.toHaveBeenCalled()
  })

  it('resets the scale on a double-click of the axis', () => {
    const onYScaleChange = vi.fn()
    const { getByTestId } = renderChart({ yScale: 4, onYScaleChange })

    fireEvent.doubleClick(getByTestId('price-scale'))

    expect(onYScaleChange).toHaveBeenCalledWith(1)
  })

  it('clips the candles to the plot area', () => {
    const { container } = renderChart({ yScale: 0.2, onYScaleChange: vi.fn() })

    const clipped = container.querySelector('g[clip-path]')
    expect(clipped).not.toBeNull()
    expect(clipped.querySelectorAll(`rect[fill="${UP}"], rect[fill="${DOWN}"]`)).toHaveLength(bars.length)
  })
})
```

and change the Testing Library import at the top to `import { fireEvent, render } from '@testing-library/react'`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/research/TVChart.test.jsx`
Expected: FAIL — `Unable to find an element by: [data-testid="price-scale"]`, and no `g[clip-path]`.

- [ ] **Step 3: Add `yScale` to the chart controls**

In `frontend/src/components/research/useChartControls.js`, add `yScale: 1,` to the initial state object (after `panes`) and add to the returned object:

```js
    setYScale: (next) => setState((s) => ({ ...s, yScale: next })),
```

- [ ] **Step 4: Clip the plot and add the scale handle in `TVChart.jsx`**

Change the imports at the top:

```jsx
import { memo, useId, useMemo, useRef } from 'react'

import {
  DOWN,
  OVERLAY_STROKES,
  PAD_R,
  PAD_T,
  UP,
  indexFromPointer,
  linePath,
  priceGeometry,
  scaleFromDrag,
  useWidth,
} from '../../lib/chartGeometry'
```

Replace the `ChartBody` component with (same content; the series, overlays, earnings markers and last-price dashed line move into a clipped group; axis and last-price badge stay outside):

```jsx
const ChartBody = memo(function ChartBody({ data, ind, type, overlays, geometry, width, earningsMarkers, clipId }) {
  const { xAt, scaleY, chartH, chartW } = geometry
  const closes = data.map((bar) => bar.close)
  const pricePath = linePath(closes, xAt, scaleY)
  const last = closes[closes.length - 1]

  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <rect x={0} y={PAD_T} width={chartW} height={chartH} />
        </clipPath>
      </defs>

      <PriceAxis ticks={geometry.ticks} scaleY={scaleY} width={width} />

      <g clipPath={`url(#${clipId})`}>
        {/* SERIES_TOTAL is named for the net-worth chart's "Total" line, but is
            really just the app's one accent blue for "the headline line" in
            any chart - reused here for the price line itself. */}
        {type === 'area' ? (
          <g>
            <defs>
              <linearGradient id="tvArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SERIES_TOTAL} stopOpacity="0.28" />
                <stop offset="100%" stopColor={SERIES_TOTAL} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d={`${pricePath} L ${xAt(data.length - 1)} ${PAD_T + chartH} L ${xAt(0)} ${PAD_T + chartH} Z`}
              fill="url(#tvArea)"
            />
            <path d={pricePath} fill="none" stroke={SERIES_TOTAL} strokeWidth="1.5" />
          </g>
        ) : null}
        {type === 'line' ? <path d={pricePath} fill="none" stroke={SERIES_TOTAL} strokeWidth="1.5" /> : null}
        {type === 'candles' ? <Candles data={data} geometry={geometry} /> : null}
        {type === 'bars' ? <Bars data={data} geometry={geometry} /> : null}

        {overlays.bb ? (
          <g>
            <path
              d={linePath(ind.bb.up, xAt, scaleY)}
              fill="none"
              stroke={OVERLAY_STROKES.bb}
              strokeWidth="1"
              opacity="0.55"
            />
            <path
              d={linePath(ind.bb.mid, xAt, scaleY)}
              fill="none"
              stroke={OVERLAY_STROKES.bb}
              strokeWidth="1"
              opacity="0.35"
              strokeDasharray="3 3"
            />
            <path
              d={linePath(ind.bb.lo, xAt, scaleY)}
              fill="none"
              stroke={OVERLAY_STROKES.bb}
              strokeWidth="1"
              opacity="0.55"
            />
          </g>
        ) : null}
        {['ma20', 'ma50', 'ma200', 'ema9'].map((key) =>
          overlays[key] ? (
            <path
              key={key}
              d={linePath(ind[key], xAt, scaleY)}
              fill="none"
              stroke={OVERLAY_STROKES[key]}
              strokeWidth="1.3"
            />
          ) : null,
        )}
        {overlays.vwap ? (
          <path
            d={linePath(ind.vwap, xAt, scaleY)}
            fill="none"
            stroke={OVERLAY_STROKES.vwap}
            strokeWidth="1.2"
            strokeDasharray="4 3"
          />
        ) : null}

        {earningsMarkers.length > 0 ? (
          <EarningsMarkers markers={earningsMarkers} geometry={geometry} />
        ) : null}

        <line
          x1={0}
          x2={width - PAD_R}
          y1={scaleY(last)}
          y2={scaleY(last)}
          stroke="#3f7fd8"
          strokeDasharray="3 3"
          opacity="0.7"
        />
      </g>

      <g>
        <rect x={width - PAD_R + 2} y={scaleY(last) - 8} width={PAD_R - 4} height={16} rx={2} fill={REPORTED} />
        <text
          x={width - PAD_R + 6}
          y={scaleY(last) + 3.5}
          fill="#fff"
          fontSize="10"
          fontFamily="Geist Mono"
        >
          {last.toFixed(2)}
        </text>
      </g>
    </g>
  )
})
```

In `Crosshair`, change the outer `<g>` to `<g pointerEvents="none">` so the crosshair badge never swallows a drag on the axis.

Add, above `export function TVChart`:

```jsx
function ScaleHandle({ width, height, yScale, onChange }) {
  const drag = useRef(null)

  if (!onChange) return null

  const end = () => {
    drag.current = null
  }

  return (
    <rect
      data-testid="price-scale"
      x={width - PAD_R}
      y={0}
      width={PAD_R}
      height={height}
      fill="transparent"
      style={{ cursor: 'ns-resize' }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId)
        drag.current = { y: e.clientY, scale: yScale }
      }}
      onPointerMove={(e) => {
        if (drag.current) onChange(scaleFromDrag(drag.current.scale, e.clientY - drag.current.y))
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onChange(1)
      }}
    />
  )
}
```

Replace the `TVChart` function with:

```jsx
export function TVChart({
  data,
  ind,
  type,
  overlays,
  hover,
  setHover,
  height = 360,
  earningsMarkers = [],
  yScale = 1,
  onYScaleChange,
}) {
  const [ref, width] = useWidth()
  const clipId = `tv-plot-${useId().replace(/[^\w-]/g, '')}`

  const geometry = useMemo(
    () => priceGeometry({ data, ind, width, height, withBands: overlays.bb, yScale }),
    [data, ind, width, height, overlays.bb, yScale],
  )

  if (data.length === 0) return null

  return (
    <div
      ref={ref}
      className="relative w-full select-none"
      style={{ height }}
      onMouseMove={(e) => setHover(indexFromPointer(e, geometry.slot, data.length))}
      onMouseLeave={() => setHover(null)}
    >
      <svg width={width} height={height}>
        <ChartBody
          data={data}
          ind={ind}
          type={type}
          overlays={overlays}
          geometry={geometry}
          width={width}
          earningsMarkers={earningsMarkers}
          clipId={clipId}
        />
        <ScaleHandle width={width} height={height} yScale={yScale} onChange={onYScaleChange} />
        {hover != null && data[hover] ? (
          <Crosshair bar={data[hover]} index={hover} geometry={geometry} width={width} />
        ) : null}
      </svg>
    </div>
  )
}
```

- [ ] **Step 5: Pass the scale through `ChartPanel`**

In `frontend/src/components/research/ChartPanel.jsx` change the destructuring line to

```jsx
  const { range, type, overlays, panes, yScale, setRange, setType, setYScale, toggleOverlay, togglePane } = controls
```

and add to the `<TVChart ... />` props:

```jsx
              yScale={yScale}
              onYScaleChange={setYScale}
```

- [ ] **Step 6: Reset the scale when the symbol changes**

In `frontend/src/pages/Research.jsx`, directly after the line
`const symbol = params.get('symbol') ?? positions[0]?.ticker ?? FALLBACK_SYMBOL`, add:

```jsx
  const [scaledSymbol, setScaledSymbol] = useState(symbol)
  if (scaledSymbol !== symbol) {
    setScaledSymbol(symbol)
    controls.setYScale(1)
  }
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/research/TVChart.test.jsx src/pages/Research.test.jsx`
Expected: PASS (new tests and all pre-existing ones).

- [ ] **Step 8: Check it in the browser**

Start the stack (`scripts/dev.sh`, or reuse a running one) and open Research on a symbol with chart data. Verify: dragging the price axis down compresses the candles, up stretches them; candles never draw into the top padding or over the Volume pane; axis tick labels follow; double-clicking the axis resets; changing range keeps the scale; switching symbol resets it; the hover crosshair still works everywhere on the plot. If a local dev server hangs, disconnect the FortiClient VPN (known issue).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/research/useChartControls.js frontend/src/components/research/TVChart.jsx frontend/src/components/research/TVChart.test.jsx frontend/src/components/research/ChartPanel.jsx frontend/src/pages/Research.jsx
git commit -m "feat: drag the Research price axis to stretch or compress the chart"
```

---

## Phase 2 — Target and stop lines

### Task 3: `SymbolNote.stop_price` and price-level validation

**Files:**
- Modify: `backend/research/models.py` (`SymbolNote`)
- Create: `backend/research/migrations/0006_symbolnote_stop_price.py` (generated)
- Modify: `backend/research/serializers.py` (`SymbolNoteSerializer`, new `_positive_or_none`)
- Test: `backend/research/test_symbol_notes.py`

**Interfaces:**
- Produces: `PATCH /api/research/notes/<symbol>/` accepts and returns `stop_price` (string like `"180.50"` or `null`); `target_price`/`stop_price` `<= 0` → 400 with the field name as key. Module function `_positive_or_none(value)` in `research/serializers.py` (reused by Task 8).

- [ ] **Step 1: Write the failing tests**

Append inside `class SymbolNoteAPITest` in `backend/research/test_symbol_notes.py`:

```python
    def test_patch_sets_and_clears_the_stop_price(self):
        response = self.client.patch('/api/research/notes/AAPL/', {'stop_price': '180.50'}, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['stop_price'], '180.50')
        self.assertEqual(SymbolNote.objects.get(symbol='AAPL').stop_price, Decimal('180.50'))

        response = self.client.patch('/api/research/notes/AAPL/', {'stop_price': None}, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data['stop_price'])

    def test_rejects_a_price_level_at_or_below_zero(self):
        for field in ('target_price', 'stop_price'):
            for value in ('0', '-5.00'):
                with self.subTest(field=field, value=value):
                    response = self.client.patch('/api/research/notes/AAPL/', {field: value}, format='json')

                    self.assertEqual(response.status_code, 400)
                    self.assertIn(field, response.data)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test research.test_symbol_notes`
Expected: FAIL — `KeyError: 'stop_price'` and 200 instead of 400.

- [ ] **Step 3: Add the field and migration**

In `backend/research/models.py`, in `SymbolNote`, directly after the `target_price` line add:

```python
    stop_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
```

Run: `cd backend && .venv/bin/python manage.py makemigrations research -n symbolnote_stop_price`
Expected: `Migrations for 'research': research/migrations/0006_symbolnote_stop_price.py - Add field stop_price to symbolnote`

- [ ] **Step 4: Expose and validate it**

In `backend/research/serializers.py`, add above `class SymbolNoteSerializer`:

```python
def _positive_or_none(value):
    if value is not None and value <= 0:
        raise serializers.ValidationError('Must be greater than zero.')
    return value
```

and replace `SymbolNoteSerializer` with:

```python
class SymbolNoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = SymbolNote
        fields = [
            'symbol', 'business_summary', 'risks_to_watch',
            'bull_case', 'bear_case', 'target_price', 'stop_price', 'sell_trigger',
            'reviewed_at', 'updated_at',
        ]
        read_only_fields = ['symbol', 'reviewed_at', 'updated_at']

    def validate_target_price(self, value):
        return _positive_or_none(value)

    def validate_stop_price(self, value):
        return _positive_or_none(value)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python manage.py test research`
Expected: PASS (whole `research` app, so `test_thesis.py` confirms nothing depended on a non-positive target).

- [ ] **Step 6: Migrate the dev database**

Run: `cd backend && .venv/bin/python manage.py migrate research && .venv/bin/python manage.py migrate --check`
Expected: `Applying research.0006_symbolnote_stop_price... OK`, then the check exits 0 with no output.

- [ ] **Step 7: Commit**

```bash
git add backend/research/models.py backend/research/migrations/0006_symbolnote_stop_price.py backend/research/serializers.py backend/research/test_symbol_notes.py
git commit -m "feat: give the thesis a numeric stop price"
```

---

### Task 4: Stop price field in the thesis card

**Files:**
- Modify: `frontend/src/components/research/SymbolNotesCard.jsx`
- Test: `frontend/src/components/research/SymbolNotesCard.test.jsx`

**Interfaces:**
- Consumes: `stop_price` on the note (Task 3).
- Produces: `ThesisAndRisksCard` calls `onSave({ stop_price: string | null })`.

- [ ] **Step 1: Write the failing tests**

Append inside `describe('ThesisAndRisksCard', ...)` in `frontend/src/components/research/SymbolNotesCard.test.jsx`:

```jsx
  it('shows the saved stop price', () => {
    render(
      <ThesisAndRisksCard
        note={{ stop_price: '180.50' }}
        onSave={() => {}}
        fundamentals={{ data: { available: false } }}
      />,
    )
    expect(screen.getByDisplayValue('180.50')).toBeInTheDocument()
  })

  it('saves a changed stop price and clears an emptied one', () => {
    const onSave = vi.fn()
    render(
      <ThesisAndRisksCard
        note={{ stop_price: '180.50' }}
        onSave={onSave}
        fundamentals={{ data: { available: false } }}
      />,
    )
    const field = screen.getByLabelText(/stop price/i)

    fireEvent.change(field, { target: { value: '175' } })
    fireEvent.blur(field)
    expect(onSave).toHaveBeenLastCalledWith({ stop_price: '175' })

    fireEvent.change(field, { target: { value: '' } })
    fireEvent.blur(field)
    expect(onSave).toHaveBeenLastCalledWith({ stop_price: null })
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/research/SymbolNotesCard.test.jsx`
Expected: FAIL — no element with display value `180.50` / no label "stop price".

- [ ] **Step 3: Generalise the price field and add the stop field**

In `frontend/src/components/research/SymbolNotesCard.jsx`, replace the whole `TargetPriceField` function with:

```jsx
function PriceLevelField({ label, value, currency, onSave }) {
  const [draft, setDraft] = useState(value ?? '')
  const [syncedValue, setSyncedValue] = useState(value ?? '')
  if ((value ?? '') !== syncedValue) {
    setSyncedValue(value ?? '')
    setDraft(value ?? '')
  }

  return (
    <label className="block">
      <div className="text-[var(--fig-2xs)] text-zinc-500 uppercase tracking-wide font-medium mb-1">
        {label} {currency ? `(${currency})` : ''}
      </div>
      <input
        type="number"
        step="0.01"
        min="0.01"
        value={draft}
        placeholder="—"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const next = draft === '' ? null : draft
          if (next !== (value ?? null)) onSave(next)
        }}
        className={`${FIELD_CLASS} num font-mono`}
      />
    </label>
  )
}
```

Replace the grid that holds `TargetPriceField` and the sell-trigger `NoteField` with:

```jsx
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <PriceLevelField
          label="Target price"
          value={note?.target_price}
          currency={currency}
          onSave={(v) => onSave({ target_price: v })}
        />
        <PriceLevelField
          label="Stop price"
          value={note?.stop_price}
          currency={currency}
          onSave={(v) => onSave({ stop_price: v })}
        />
      </div>
      <div className="mt-3">
        <NoteField
          label="Sell trigger"
          value={note?.sell_trigger}
          placeholder="What would make you sell"
          onSave={(v) => onSave({ sell_trigger: v })}
        />
      </div>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/research/SymbolNotesCard.test.jsx src/components/research/OverviewTab.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/research/SymbolNotesCard.jsx frontend/src/components/research/SymbolNotesCard.test.jsx
git commit -m "feat: edit the thesis stop price next to the target"
```

---

### Task 5: `lib/priceLines.js` — the pure line logic

**Files:**
- Create: `frontend/src/lib/priceLines.js`
- Test: `frontend/src/lib/priceLines.test.js`

**Interfaces:**
- Produces (a line is `{ id: 'target' | 'stop' | number, kind: 'target' | 'stop' | 'free', price: number }`):
  - `LINE_STROKES: { target, stop, free }` colour strings
  - `MIN_PRICE = 0.01`
  - `chartLines(note?: object, freeLines?: Array<{ id: number, price: string }>): Line[]`
  - `roundPrice(value: number): number` — 2 dp, never below `MIN_PRICE`
  - `parsePriceInput(text: string): number | null`
  - `edgeOf(price: number, geometry: { top, bottom }): 'above' | 'below' | null`
  - `isTypingTarget(element: Element | null): boolean`
  - `linePatch(line: Line, price: number): { target_price: string } | { stop_price: string } | null`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/priceLines.test.js`:

```js
import { describe, expect, it } from 'vitest'

import { CATEGORY_AXIS_TEXT, NEGATIVE, POSITIVE } from './charts'
import {
  LINE_STROKES,
  MIN_PRICE,
  chartLines,
  edgeOf,
  isTypingTarget,
  linePatch,
  parsePriceInput,
  roundPrice,
} from './priceLines'

describe('chartLines', () => {
  it('turns the decimal strings DRF sends into numbers', () => {
    const lines = chartLines(
      { target_price: '250.00', stop_price: '180.50' },
      [{ id: 7, price: '95.25' }],
    )

    expect(lines).toEqual([
      { id: 'target', kind: 'target', price: 250 },
      { id: 'stop', kind: 'stop', price: 180.5 },
      { id: 7, kind: 'free', price: 95.25 },
    ])
  })

  it('draws no line for a missing or empty level', () => {
    expect(chartLines({ target_price: null, stop_price: '' })).toEqual([])
    expect(chartLines(undefined)).toEqual([])
  })

  it('drops a level that is not a positive number', () => {
    expect(chartLines({ target_price: '0.00', stop_price: 'abc' }, [{ id: 1, price: '-2' }])).toEqual([])
  })
})

describe('roundPrice', () => {
  it('rounds to cents', () => {
    expect(roundPrice(123.456)).toBe(123.46)
  })

  it('never goes below the minimum price', () => {
    expect(roundPrice(0)).toBe(MIN_PRICE)
    expect(roundPrice(-40)).toBe(MIN_PRICE)
    expect(roundPrice(0.001)).toBe(MIN_PRICE)
  })
})

describe('parsePriceInput', () => {
  it('reads a plain or decimal number', () => {
    expect(parsePriceInput('112')).toBe(112)
    expect(parsePriceInput(' 112.5 ')).toBe(112.5)
    expect(parsePriceInput('.5')).toBe(0.5)
    expect(parsePriceInput('99.999')).toBe(100)
  })

  it('rejects anything that is not a positive number', () => {
    for (const text of ['', '   ', 'abc', '12,5', '-3', '0', '0.00', '1e3', '12.3.4']) {
      expect(parsePriceInput(text)).toBeNull()
    }
  })
})

describe('edgeOf', () => {
  const geometry = { top: 120, bottom: 80 }

  it('places a price above, below or inside the visible range', () => {
    expect(edgeOf(130, geometry)).toBe('above')
    expect(edgeOf(70, geometry)).toBe('below')
    expect(edgeOf(100, geometry)).toBeNull()
  })
})

describe('isTypingTarget', () => {
  it('is true for fields the user types into', () => {
    expect(isTypingTarget(document.createElement('input'))).toBe(true)
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true)
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    expect(isTypingTarget(editable)).toBe(true)
  })

  it('is false for everything else', () => {
    expect(isTypingTarget(document.body)).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})

describe('linePatch', () => {
  it('writes the thesis field that owns the line', () => {
    expect(linePatch({ id: 'target', kind: 'target', price: 1 }, 250)).toEqual({ target_price: '250.00' })
    expect(linePatch({ id: 'stop', kind: 'stop', price: 1 }, 180.456)).toEqual({ stop_price: '180.46' })
  })

  it('has nothing to patch for a freeform line', () => {
    expect(linePatch({ id: 7, kind: 'free', price: 1 }, 10)).toBeNull()
  })
})

describe('LINE_STROKES', () => {
  it('uses the app colours for each kind of line', () => {
    expect(LINE_STROKES).toEqual({ target: POSITIVE, stop: NEGATIVE, free: CATEGORY_AXIS_TEXT })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/priceLines.test.js`
Expected: FAIL — `Failed to resolve import "./priceLines"`.

- [ ] **Step 3: Implement**

Create `frontend/src/lib/priceLines.js`:

```js
import { CATEGORY_AXIS_TEXT, NEGATIVE, POSITIVE } from './charts'

export const LINE_STROKES = { target: POSITIVE, stop: NEGATIVE, free: CATEGORY_AXIS_TEXT }

export const MIN_PRICE = 0.01

const PRICE_TEXT = /^(\d+\.?\d*|\.\d+)$/

function toPrice(value) {
  if (value == null || value === '') return null
  const price = Number(value)
  return Number.isFinite(price) && price > 0 ? price : null
}

export function chartLines(note, freeLines = []) {
  const lines = []
  const target = toPrice(note?.target_price)
  const stop = toPrice(note?.stop_price)

  if (target != null) lines.push({ id: 'target', kind: 'target', price: target })
  if (stop != null) lines.push({ id: 'stop', kind: 'stop', price: stop })
  for (const line of freeLines) {
    const price = toPrice(line.price)
    if (price != null) lines.push({ id: line.id, kind: 'free', price })
  }

  return lines
}

export function roundPrice(value) {
  return Math.max(MIN_PRICE, Math.round(value * 100) / 100)
}

export function parsePriceInput(text) {
  const trimmed = String(text).trim()
  if (!PRICE_TEXT.test(trimmed)) return null
  const price = Number(trimmed)
  return price > 0 ? roundPrice(price) : null
}

export function edgeOf(price, { top, bottom }) {
  if (price > top) return 'above'
  if (price < bottom) return 'below'
  return null
}

export function isTypingTarget(element) {
  if (!element?.tagName) return false
  const tag = element.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return element.isContentEditable === true || element.getAttribute('contenteditable') === 'true'
}

export function linePatch(line, price) {
  const value = roundPrice(price).toFixed(2)
  if (line.kind === 'target') return { target_price: value }
  if (line.kind === 'stop') return { stop_price: value }
  return null
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/priceLines.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/priceLines.js frontend/src/lib/priceLines.test.js
git commit -m "feat: add the pure price-line helpers for the Research chart"
```

---

### Task 6: Draw, drag, select, create, delete and edit lines on the chart

**Files:**
- Create: `frontend/src/components/research/PriceLines.jsx`
- Modify: `frontend/src/components/research/TVChart.jsx`
- Test: `frontend/src/components/research/TVChart.test.jsx`

**Interfaces:**
- Consumes: `priceGeometry` with `priceAtY`/`top`/`bottom` (Task 1); `LINE_STROKES`, `edgeOf`, `roundPrice`, `parsePriceInput`, `isTypingTarget` (Task 5).
- Produces:
  - `PriceLines` default export: `({ lines, geometry, width, selectedId, onMove, onSelect, onEdit })`.
  - `PriceEditor` named export: `({ line, y, width, onCommit, onCancel })`.
  - `TVChart` new props: `lines?: Line[]`, `onMoveLine?: (line, price: number) => void`, `onCreateLine?: (price: number) => void`, `onDeleteLine?: (line) => void`. Prices handed out are already `roundPrice`d. No `onCreateLine` → double-click does nothing.
  - Test ids: `price-line-<id>`, `price-hit-<id>`, `price-badge-<id>`, `price-edge-<id>`; editor input has `aria-label="Line price"`.

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/components/research/TVChart.test.jsx` (also add `priceGeometry` to the `../../lib/chartGeometry` import):

```jsx
describe('price lines', () => {
  const target = { id: 'target', kind: 'target', price: 110 }
  const stop = { id: 'stop', kind: 'stop', price: 105 }
  const free = { id: 7, kind: 'free', price: 115 }
  const ind = computeIndicators(bars)
  const yOf = (price, yScale = 1) =>
    priceGeometry({ data: bars, ind, width: 760, height: 360, withBands: false, yScale }).scaleY(price)

  const drag = (element, fromY, toY) => {
    fireEvent.pointerDown(element, { clientY: fromY, pointerId: 1 })
    fireEvent.pointerMove(element, { clientY: toY, pointerId: 1 })
    fireEvent.pointerUp(element, { clientY: toY, pointerId: 1 })
  }

  it('draws target, stop and freeform lines', () => {
    const { getByTestId } = renderChart({ lines: [target, stop, free] })

    expect(getByTestId('price-line-target')).toBeInTheDocument()
    expect(getByTestId('price-line-stop')).toBeInTheDocument()
    expect(getByTestId('price-line-7')).toBeInTheDocument()
  })

  it('shows an edge marker instead of a line for a price outside the visible range', () => {
    const { queryByTestId, getByTestId } = renderChart({ lines: [{ ...target, price: 1000 }] })

    expect(queryByTestId('price-line-target')).toBeNull()
    expect(getByTestId('price-edge-target')).toBeInTheDocument()
  })

  it('saves a lower price when a line is dragged down', () => {
    const onMoveLine = vi.fn()
    const { getByTestId } = renderChart({ lines: [target], onMoveLine })

    const y = yOf(target.price)
    drag(getByTestId('price-hit-target'), y, y + 30)

    expect(onMoveLine).toHaveBeenCalledTimes(1)
    const [line, price] = onMoveLine.mock.calls[0]
    expect(line).toEqual(target)
    expect(price).toBeLessThan(target.price)
    expect(Number(price.toFixed(2))).toBe(price)
  })

  it('does not save when a line is clicked without moving', () => {
    const onMoveLine = vi.fn()
    const { getByTestId } = renderChart({ lines: [free], onMoveLine })

    const hit = getByTestId('price-hit-7')
    fireEvent.pointerDown(hit, { clientY: 100, pointerId: 1 })
    fireEvent.pointerUp(hit, { clientY: 100, pointerId: 1 })
    fireEvent.click(hit)

    expect(onMoveLine).not.toHaveBeenCalled()
  })

  it('clamps a line dragged below zero to the minimum price', () => {
    const onMoveLine = vi.fn()
    const { getByTestId } = renderChart({ lines: [target], onMoveLine, yScale: 20, onYScaleChange: vi.fn() })

    drag(getByTestId('price-hit-target'), yOf(target.price, 20), 353)

    expect(onMoveLine).toHaveBeenCalledWith(target, 0.01)
  })

  it('creates a freeform line where the plot is double-clicked', () => {
    const onCreateLine = vi.fn()
    const { container } = renderChart({ lines: [], onCreateLine })

    fireEvent.doubleClick(container.firstChild, { clientX: 100, clientY: 200 })

    expect(onCreateLine).toHaveBeenCalledTimes(1)
    expect(onCreateLine.mock.calls[0][0]).toBeGreaterThan(0)
  })

  it('does nothing on a double-click when lines cannot be created', () => {
    const { container } = renderChart({ lines: [] })

    expect(() => fireEvent.doubleClick(container.firstChild, { clientX: 100, clientY: 200 })).not.toThrow()
  })

  it('double-clicking the axis does not create a line', () => {
    const onCreateLine = vi.fn()
    const onYScaleChange = vi.fn()
    const { getByTestId } = renderChart({ lines: [], onCreateLine, onYScaleChange })

    fireEvent.doubleClick(getByTestId('price-scale'), { clientX: 740, clientY: 200 })

    expect(onYScaleChange).toHaveBeenCalledWith(1)
    expect(onCreateLine).not.toHaveBeenCalled()
  })

  it('double-clicking a line does not create another', () => {
    const onCreateLine = vi.fn()
    const { getByTestId } = renderChart({ lines: [free], onCreateLine })

    fireEvent.doubleClick(getByTestId('price-hit-7'), { clientX: 100, clientY: yOf(free.price) })

    expect(onCreateLine).not.toHaveBeenCalled()
  })

  it('deletes the selected freeform line with the Delete key', () => {
    const onDeleteLine = vi.fn()
    const { getByTestId } = renderChart({ lines: [free], onDeleteLine })

    fireEvent.click(getByTestId('price-hit-7'))
    fireEvent.keyDown(window, { key: 'Delete' })

    expect(onDeleteLine).toHaveBeenCalledWith(free)
  })

  it('does not delete a line while the user is typing in a field', () => {
    const onDeleteLine = vi.fn()
    const { getByTestId } = renderChart({ lines: [free], onDeleteLine })
    const field = document.createElement('textarea')
    document.body.appendChild(field)

    fireEvent.click(getByTestId('price-hit-7'))
    fireEvent.keyDown(field, { key: 'Backspace' })

    expect(onDeleteLine).not.toHaveBeenCalled()
    field.remove()
  })

  it('never selects the target or stop for deletion', () => {
    const onDeleteLine = vi.fn()
    const { getByTestId } = renderChart({ lines: [target], onDeleteLine })

    fireEvent.click(getByTestId('price-hit-target'))
    fireEvent.keyDown(window, { key: 'Delete' })

    expect(onDeleteLine).not.toHaveBeenCalled()
  })

  it('clears the selection when the empty plot is clicked', () => {
    const onDeleteLine = vi.fn()
    const { container, getByTestId } = renderChart({ lines: [free], onDeleteLine })

    fireEvent.click(getByTestId('price-hit-7'))
    fireEvent.click(container.firstChild)
    fireEvent.keyDown(window, { key: 'Delete' })

    expect(onDeleteLine).not.toHaveBeenCalled()
  })

  it('saves an exact price typed into the badge editor', () => {
    const onMoveLine = vi.fn()
    const { getByTestId, getByLabelText, queryByLabelText } = renderChart({ lines: [stop], onMoveLine })

    fireEvent.click(getByTestId('price-badge-stop'))
    const input = getByLabelText('Line price')
    expect(input).toHaveValue('105.00')

    fireEvent.change(input, { target: { value: '101.5' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onMoveLine).toHaveBeenCalledWith(stop, 101.5)
    expect(queryByLabelText('Line price')).toBeNull()
  })

  it('cancels the editor on text that is not a price', () => {
    const onMoveLine = vi.fn()
    const { getByTestId, getByLabelText, queryByLabelText } = renderChart({ lines: [stop], onMoveLine })

    fireEvent.click(getByTestId('price-badge-stop'))
    const input = getByLabelText('Line price')
    fireEvent.change(input, { target: { value: '12,5' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onMoveLine).not.toHaveBeenCalled()
    expect(queryByLabelText('Line price')).toBeNull()
  })

  it('does not save on Escape even when the field then blurs', () => {
    const onMoveLine = vi.fn()
    const { getByTestId, getByLabelText } = renderChart({ lines: [stop], onMoveLine })

    fireEvent.click(getByTestId('price-badge-stop'))
    const input = getByLabelText('Line price')
    fireEvent.change(input, { target: { value: '99' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    fireEvent.blur(input)

    expect(onMoveLine).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/research/TVChart.test.jsx`
Expected: FAIL — `Unable to find an element by: [data-testid="price-line-target"]`.

- [ ] **Step 3: Create `PriceLines.jsx`**

Create `frontend/src/components/research/PriceLines.jsx`:

```jsx
import { useRef, useState } from 'react'

import { PAD_R, PAD_T } from '../../lib/chartGeometry'
import { LINE_STROKES, edgeOf, parsePriceInput, roundPrice } from '../../lib/priceLines'

const TAG = { target: 'T', stop: 'S', free: '' }
const HIT_WIDTH = 10

const svgY = (event) => event.clientY - event.currentTarget.closest('svg').getBoundingClientRect().top
const stop = (event) => event.stopPropagation()

function Badge({ line, price, y, width, selected, onEdit }) {
  const color = LINE_STROKES[line.kind]

  return (
    <g
      data-testid={`price-badge-${line.id}`}
      style={{ cursor: 'text' }}
      onClick={(e) => {
        e.stopPropagation()
        onEdit(line)
      }}
      onDoubleClick={stop}
      onPointerDown={stop}
    >
      <rect
        x={width - PAD_R + 2}
        y={y - 8}
        width={PAD_R - 4}
        height={16}
        rx={2}
        fill={selected ? color : '#18181b'}
        stroke={color}
      />
      <text
        x={width - PAD_R + 6}
        y={y + 3.5}
        fill={selected ? '#09090b' : color}
        fontSize="10"
        fontFamily="Geist Mono"
      >
        {`${TAG[line.kind]} ${price.toFixed(2)}`.trim()}
      </text>
    </g>
  )
}

function EdgeMarker({ line, edge, width, chartH }) {
  const color = LINE_STROKES[line.kind]
  const x = width - PAD_R + 8
  const y = edge === 'above' ? PAD_T + 6 : PAD_T + chartH - 6
  const points =
    edge === 'above'
      ? `${x - 4},${y + 3} ${x + 4},${y + 3} ${x},${y - 4}`
      : `${x - 4},${y - 3} ${x + 4},${y - 3} ${x},${y + 4}`

  return (
    <g data-testid={`price-edge-${line.id}`} pointerEvents="none">
      <polygon points={points} fill={color} />
      <text x={x + 8} y={y + 3.5} fill={color} fontSize="10" fontFamily="Geist Mono">
        {line.price.toFixed(2)}
      </text>
    </g>
  )
}

function DraggableLine({ line, geometry, width, selected, onMove, onSelect, onEdit }) {
  const [preview, setPreview] = useState(null)
  const drag = useRef(null)

  const edge = preview == null ? edgeOf(line.price, geometry) : null
  if (edge) return <EdgeMarker line={line} edge={edge} width={width} chartH={geometry.chartH} />

  const price = preview ?? line.price
  const y = geometry.scaleY(price)
  const x2 = width - PAD_R

  const cancel = () => {
    drag.current = null
    setPreview(null)
  }

  return (
    <g data-testid={`price-line-${line.id}`}>
      <line
        x1={0}
        x2={x2}
        y1={y}
        y2={y}
        stroke={LINE_STROKES[line.kind]}
        strokeWidth={selected ? 2 : 1}
        strokeDasharray={line.kind === 'free' ? undefined : '6 4'}
        pointerEvents="none"
      />
      <line
        data-testid={`price-hit-${line.id}`}
        x1={0}
        x2={x2}
        y1={y}
        y2={y}
        stroke="transparent"
        strokeWidth={HIT_WIDTH}
        style={{ cursor: 'ns-resize' }}
        onPointerDown={(e) => {
          e.stopPropagation()
          e.currentTarget.setPointerCapture?.(e.pointerId)
          drag.current = { moved: false }
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          drag.current.moved = true
          setPreview(roundPrice(geometry.priceAtY(svgY(e))))
        }}
        onPointerUp={() => {
          const moved = drag.current?.moved
          cancel()
          if (moved && preview != null && preview !== line.price) onMove(line, preview)
        }}
        onPointerCancel={cancel}
        onClick={(e) => {
          e.stopPropagation()
          if (line.kind === 'free') onSelect(line.id)
        }}
        onDoubleClick={stop}
      />
      <Badge line={line} price={price} y={y} width={width} selected={selected} onEdit={onEdit} />
    </g>
  )
}

export default function PriceLines({ lines, geometry, width, selectedId, onMove, onSelect, onEdit }) {
  return lines.map((line) => (
    <DraggableLine
      key={line.id}
      line={line}
      geometry={geometry}
      width={width}
      selected={line.id === selectedId}
      onMove={onMove}
      onSelect={onSelect}
      onEdit={onEdit}
    />
  ))
}

export function PriceEditor({ line, y, width, onCommit, onCancel }) {
  const [draft, setDraft] = useState(line.price.toFixed(2))
  const done = useRef(false)

  const close = (price) => {
    if (done.current) return
    done.current = true
    if (price == null || price === line.price) onCancel()
    else onCommit(line, price)
  }

  return (
    <input
      autoFocus
      aria-label="Line price"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') close(parsePriceInput(draft))
        if (e.key === 'Escape') close(null)
      }}
      onBlur={() => close(parsePriceInput(draft))}
      onClick={stop}
      onDoubleClick={stop}
      onPointerDown={stop}
      className="absolute h-5 px-1 rounded bg-zinc-900 border border-blue-500/60 text-[10px] font-mono text-zinc-100 outline-none"
      style={{ left: width - PAD_R + 2, top: y - 10, width: PAD_R - 4 }}
    />
  )
}
```

- [ ] **Step 4: Wire lines into `TVChart`**

In `frontend/src/components/research/TVChart.jsx`, change the React import to

```jsx
import { memo, useEffect, useId, useMemo, useRef, useState } from 'react'
```

add below the `../../lib/charts` import:

```jsx
import { isTypingTarget, roundPrice } from '../../lib/priceLines'
import PriceLines, { PriceEditor } from './PriceLines'
```

add above `ScaleHandle`:

```jsx
const NO_LINES = []
```

and replace the `TVChart` function with:

```jsx
export function TVChart({
  data,
  ind,
  type,
  overlays,
  hover,
  setHover,
  height = 360,
  earningsMarkers = [],
  yScale = 1,
  onYScaleChange,
  lines = NO_LINES,
  onMoveLine,
  onCreateLine,
  onDeleteLine,
}) {
  const [ref, width] = useWidth()
  const clipId = `tv-plot-${useId().replace(/[^\w-]/g, '')}`
  const [selectedId, setSelectedId] = useState(null)
  const [editingId, setEditingId] = useState(null)

  const geometry = useMemo(
    () => priceGeometry({ data, ind, width, height, withBands: overlays.bb, yScale }),
    [data, ind, width, height, overlays.bb, yScale],
  )

  const selected = lines.find((line) => line.id === selectedId && line.kind === 'free') ?? null
  const editing = lines.find((line) => line.id === editingId) ?? null

  useEffect(() => {
    if (!selected) return undefined
    const onKeyDown = (event) => {
      if (isTypingTarget(event.target)) return
      if (event.key === 'Escape') setSelectedId(null)
      if ((event.key === 'Delete' || event.key === 'Backspace') && onDeleteLine) {
        event.preventDefault()
        setSelectedId(null)
        onDeleteLine(selected)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selected, onDeleteLine])

  if (data.length === 0) return null

  const plotY = (event) => {
    const box = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - box.left
    const y = event.clientY - box.top
    return x < width - PAD_R && y >= PAD_T && y <= PAD_T + geometry.chartH ? y : null
  }

  return (
    <div
      ref={ref}
      className="relative w-full select-none"
      style={{ height }}
      onMouseMove={(e) => setHover(indexFromPointer(e, geometry.slot, data.length))}
      onMouseLeave={() => setHover(null)}
      onClick={() => setSelectedId(null)}
      onDoubleClick={(e) => {
        if (!onCreateLine) return
        const y = plotY(e)
        if (y != null) onCreateLine(roundPrice(geometry.priceAtY(y)))
      }}
    >
      <svg width={width} height={height}>
        <ChartBody
          data={data}
          ind={ind}
          type={type}
          overlays={overlays}
          geometry={geometry}
          width={width}
          earningsMarkers={earningsMarkers}
          clipId={clipId}
        />
        <ScaleHandle width={width} height={height} yScale={yScale} onChange={onYScaleChange} />
        <PriceLines
          lines={lines}
          geometry={geometry}
          width={width}
          selectedId={selected?.id ?? null}
          onMove={(line, price) => onMoveLine?.(line, price)}
          onSelect={setSelectedId}
          onEdit={(line) => setEditingId(line.id)}
        />
        {hover != null && data[hover] ? (
          <Crosshair bar={data[hover]} index={hover} geometry={geometry} width={width} />
        ) : null}
      </svg>
      {editing ? (
        <PriceEditor
          key={editing.id}
          line={editing}
          y={geometry.scaleY(editing.price)}
          width={width}
          onCommit={(line, price) => {
            setEditingId(null)
            onMoveLine?.(line, price)
          }}
          onCancel={() => setEditingId(null)}
        />
      ) : null}
    </div>
  )
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/research/TVChart.test.jsx`
Expected: PASS (all price-line, price-axis and pre-existing tests).

- [ ] **Step 6: Lint**

Run: `cd frontend && npx eslint src/components/research/PriceLines.jsx src/components/research/TVChart.jsx src/lib/priceLines.js`
Expected: no errors (in particular no `react-refresh/only-export-components` — `PriceLines.jsx` exports only components).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/research/PriceLines.jsx frontend/src/components/research/TVChart.jsx frontend/src/components/research/TVChart.test.jsx
git commit -m "feat: draw draggable, editable price lines on the Research chart"
```

---

### Task 7: Save target/stop from the chart

**Files:**
- Modify: `frontend/src/api/queries/research.js` (`useSymbolNoteMutation`)
- Create: `frontend/src/api/queries/research.test.jsx`
- Create: `frontend/src/components/research/useChartLines.js`
- Create: `frontend/src/components/research/useChartLines.test.js`
- Modify: `frontend/src/components/research/ChartPanel.jsx`
- Modify: `frontend/src/pages/Research.jsx`

**Interfaces:**
- Consumes: `chartLines`, `linePatch` (Task 5); `TVChart` line props (Task 6); `stop_price` (Task 3).
- Produces:
  - `useSymbolNoteMutation(symbol)` now writes the patch into the cached note before the request resolves and refetches on settle (success or failure).
  - `useChartLines({ symbol, note }) → { lines: Line[], move(line, price): void, saveFailed: boolean }` (Task 10 extends the argument and return value).
  - `ChartPanel` props `lines`, `onMoveLine`, `onCreateLine`, `onDeleteLine`, `lineSaveFailed = false`.

- [ ] **Step 1: Write the failing query test**

Create `frontend/src/api/queries/research.test.jsx`:

```jsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'

vi.mock('../client')
import * as client from '../client'
import { researchKeys, useSymbolNote, useSymbolNoteMutation } from './research'

function setup(useHook) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  const { result } = renderHook(useHook, { wrapper })
  return { queryClient, result }
}

describe('useSymbolNoteMutation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the new level before the server answers', async () => {
    client.updateSymbolNote.mockReturnValue(new Promise(() => {}))
    const { queryClient, result } = setup(() => useSymbolNoteMutation('NVDA'))
    queryClient.setQueryData(researchKeys.symbolNote('NVDA'), { symbol: 'NVDA', target_price: '100.00' })

    act(() => result.current.mutate({ target_price: '120.00' }))

    await waitFor(() =>
      expect(queryClient.getQueryData(researchKeys.symbolNote('NVDA')).target_price).toBe('120.00'),
    )
  })

  it('goes back to the saved level when the save fails', async () => {
    client.getSymbolNote.mockResolvedValue({ symbol: 'NVDA', target_price: '100.00' })
    client.updateSymbolNote.mockRejectedValue(new Error('boom'))
    const { result } = setup(() => ({ note: useSymbolNote('NVDA'), save: useSymbolNoteMutation('NVDA') }))
    await waitFor(() => expect(result.current.note.data?.target_price).toBe('100.00'))

    act(() => result.current.save.mutate({ target_price: '120.00' }))

    await waitFor(() => expect(result.current.save.isError).toBe(true))
    await waitFor(() => expect(result.current.note.data.target_price).toBe('100.00'))
    expect(client.getSymbolNote).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx vitest run src/api/queries/research.test.jsx`
Expected: FAIL — the first test times out waiting for `'120.00'` (no optimistic write yet).

- [ ] **Step 3: Make the note mutation optimistic**

In `frontend/src/api/queries/research.js`, replace `useSymbolNoteMutation` with:

```js
export function useSymbolNoteMutation(symbol) {
  const queryClient = useQueryClient()
  const key = researchKeys.symbolNote(symbol)
  return useMutation({
    mutationFn: (patch) => updateSymbolNote(symbol, patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: key })
      queryClient.setQueryData(key, (old) => (old ? { ...old, ...patch } : old))
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  })
}
```

Run: `cd frontend && npx vitest run src/api/queries/research.test.jsx`
Expected: PASS.

- [ ] **Step 4: Write the failing hook test**

Create `frontend/src/components/research/useChartLines.test.js`:

```js
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'

vi.mock('../../api/queries')
import * as queries from '../../api/queries'
import { useChartLines } from './useChartLines'

const noteMutate = vi.fn()

describe('useChartLines', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queries.useSymbolNoteMutation.mockReturnValue({ mutate: noteMutate })
  })

  it('draws the thesis levels from the note', () => {
    const { result } = renderHook(() =>
      useChartLines({ symbol: 'NVDA', note: { target_price: '250.00', stop_price: '180.50' } }),
    )

    expect(result.current.lines).toEqual([
      { id: 'target', kind: 'target', price: 250 },
      { id: 'stop', kind: 'stop', price: 180.5 },
    ])
  })

  it('saves a moved target or stop onto the note', () => {
    const { result } = renderHook(() =>
      useChartLines({ symbol: 'NVDA', note: { target_price: '250.00', stop_price: '180.50' } }),
    )

    act(() => result.current.move(result.current.lines[0], 262.004))
    act(() => result.current.move(result.current.lines[1], 175))

    expect(noteMutate).toHaveBeenNthCalledWith(1, { target_price: '262.00' }, expect.any(Object))
    expect(noteMutate).toHaveBeenNthCalledWith(2, { stop_price: '175.00' }, expect.any(Object))
  })

  it('reports a failed save for the symbol it happened on only', () => {
    noteMutate.mockImplementation((_, { onError }) => onError(new Error('boom')))
    const { result, rerender } = renderHook((props) => useChartLines(props), {
      initialProps: { symbol: 'NVDA', note: { target_price: '250.00' } },
    })

    act(() => result.current.move(result.current.lines[0], 240))
    expect(result.current.saveFailed).toBe(true)

    rerender({ symbol: 'MSFT', note: {} })
    expect(result.current.saveFailed).toBe(false)
  })

  it('clears the failure once a save succeeds', () => {
    noteMutate.mockImplementationOnce((_, { onError }) => onError(new Error('boom')))
    noteMutate.mockImplementationOnce((_, { onSuccess }) => onSuccess())
    const { result } = renderHook(() => useChartLines({ symbol: 'NVDA', note: { target_price: '250.00' } }))

    act(() => result.current.move(result.current.lines[0], 240))
    act(() => result.current.move(result.current.lines[0], 241))

    expect(result.current.saveFailed).toBe(false)
  })
})
```

- [ ] **Step 5: Run it to verify it fails**

Run: `cd frontend && npx vitest run src/components/research/useChartLines.test.js`
Expected: FAIL — `Failed to resolve import "./useChartLines"`.

- [ ] **Step 6: Implement the hook**

Create `frontend/src/components/research/useChartLines.js`:

```js
import { useMemo, useState } from 'react'

import { useSymbolNoteMutation } from '../../api/queries'
import { chartLines, linePatch } from '../../lib/priceLines'

export function useChartLines({ symbol, note }) {
  const noteMutation = useSymbolNoteMutation(symbol)
  const [failedFor, setFailedFor] = useState(null)
  const lines = useMemo(() => chartLines(note), [note])

  const report = {
    onSuccess: () => setFailedFor(null),
    onError: () => setFailedFor(symbol),
  }

  return {
    lines,
    saveFailed: failedFor === symbol,
    move: (line, price) => {
      const patch = linePatch(line, price)
      if (patch) noteMutation.mutate(patch, report)
    },
  }
}
```

Run: `cd frontend && npx vitest run src/components/research/useChartLines.test.js`
Expected: PASS.

- [ ] **Step 7: Pass lines through `ChartPanel`**

In `frontend/src/components/research/ChartPanel.jsx`, change the signature to:

```jsx
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
}) {
```

In the toolbar, directly before `{period == null ? null : (`, add:

```jsx
        {lineSaveFailed ? (
          <span role="alert" className="ml-2 text-[var(--fig-2xs)] text-red-400">
            Couldn't save line
          </span>
        ) : null}
```

and add to the `<TVChart ... />` props:

```jsx
              lines={lines}
              onMoveLine={onMoveLine}
              onCreateLine={onCreateLine}
              onDeleteLine={onDeleteLine}
```

- [ ] **Step 8: Use the hook in `Research.jsx`**

In `frontend/src/pages/Research.jsx`, add the import after the `useChartControls` import:

```jsx
import { useChartLines } from '../components/research/useChartLines'
```

Directly after `const reviewMutation = useMarkReviewedMutation(symbol)`, add:

```jsx
  const priceLines = useChartLines({ symbol, note: note?.data })
```

and add to the `<ChartPanel ... />` props:

```jsx
              lines={priceLines.lines}
              onMoveLine={priceLines.move}
              lineSaveFailed={priceLines.saveFailed}
```

- [ ] **Step 9: Run the affected suites**

Run: `cd frontend && npx vitest run src/pages/Research.test.jsx src/components/research src/api/queries src/lib`
Expected: PASS.

- [ ] **Step 10: Check it in the browser**

On Research, set a target and a stop in the thesis card; both lines appear (green dashed "T", red dashed "S"). Drag each — the thesis card's field updates to the new value after the drop with no flicker back. Click a badge, type an exact price, Enter — line and field move. Set a target far above the visible range — an edge marker appears at the top of the axis; compress the axis until the line shows. Stop the Django server, drag a line — it snaps back and "Couldn't save line" appears; restart, drag again — the message clears.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/api/queries/research.js frontend/src/api/queries/research.test.jsx frontend/src/components/research/useChartLines.js frontend/src/components/research/useChartLines.test.js frontend/src/components/research/ChartPanel.jsx frontend/src/pages/Research.jsx
git commit -m "feat: set the thesis target and stop by dragging them on the chart"
```

---

## Phase 3 — Freeform price lines

### Task 8: `PriceLine` model and endpoints

**Files:**
- Modify: `backend/research/models.py` (new `PriceLine`)
- Create: `backend/research/migrations/0007_priceline.py` (generated)
- Modify: `backend/research/serializers.py` (new `PriceLineSerializer`)
- Modify: `backend/research/views.py` (new `PriceLineListCreateView`, `PriceLineDetailView`)
- Modify: `backend/research/urls.py`
- Test: `backend/research/test_price_lines.py`

**Interfaces:**
- Consumes: `_positive_or_none` (Task 3).
- Produces:
  - `GET /api/research/price-lines/<uic>/<asset_type>/` → `200 [{id, uic, asset_type, price: "123.45", created_at}]` (plain list, unpaginated, oldest first)
  - `POST` same URL with `{price}` → `201` line; uic/asset type from the URL only
  - `PATCH /api/research/price-lines/<id>/` with `{price}` → `200` line
  - `DELETE /api/research/price-lines/<id>/` → `204`
  - `GET /api/research/price-lines/<id>/` → `405`

- [ ] **Step 1: Write the failing tests**

Create `backend/research/test_price_lines.py`:

```python
from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from .models import PriceLine

LIST_URL = '/api/research/price-lines/211/Stock/'


def detail_url(pk):
    return f'/api/research/price-lines/{pk}/'


class PriceLineAPITest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='alex', password='pw')
        token = RefreshToken.for_user(self.user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def line(self, uic=211, asset_type='Stock', price='100.00'):
        return PriceLine.objects.create(uic=uic, asset_type=asset_type, price=Decimal(price))

    def test_requires_authentication(self):
        self.client.credentials()

        self.assertEqual(self.client.get(LIST_URL).status_code, 401)
        self.assertEqual(self.client.post(LIST_URL, {'price': '1.00'}, format='json').status_code, 401)

    def test_lists_only_the_lines_of_that_instrument(self):
        self.line(price='100.00')
        self.line(asset_type='CfdOnStock', price='101.00')
        self.line(uic=999, price='102.00')

        response = self.client.get(LIST_URL)

        self.assertEqual(response.status_code, 200)
        self.assertEqual([line['price'] for line in response.data], ['100.00'])

    def test_lists_oldest_first(self):
        first = self.line(price='120.00')
        second = self.line(price='90.00')

        response = self.client.get(LIST_URL)

        self.assertEqual([line['id'] for line in response.data], [first.pk, second.pk])

    def test_create_takes_the_instrument_from_the_url(self):
        response = self.client.post(
            LIST_URL, {'price': '123.45', 'uic': 5, 'asset_type': 'Etf'}, format='json'
        )

        self.assertEqual(response.status_code, 201)
        line = PriceLine.objects.get()
        self.assertEqual((line.uic, line.asset_type, line.price), (211, 'Stock', Decimal('123.45')))

    def test_rejects_a_price_at_or_below_zero(self):
        for value in ('0', '-1.00'):
            with self.subTest(value=value):
                response = self.client.post(LIST_URL, {'price': value}, format='json')

                self.assertEqual(response.status_code, 400)
                self.assertIn('price', response.data)
        self.assertFalse(PriceLine.objects.exists())

    def test_patch_moves_the_line_and_nothing_else(self):
        line = self.line()

        response = self.client.patch(
            detail_url(line.pk), {'price': '110.00', 'uic': 5, 'asset_type': 'Etf'}, format='json'
        )

        self.assertEqual(response.status_code, 200)
        line.refresh_from_db()
        self.assertEqual((line.uic, line.asset_type, line.price), (211, 'Stock', Decimal('110.00')))

    def test_patch_rejects_a_price_at_or_below_zero(self):
        line = self.line()

        response = self.client.patch(detail_url(line.pk), {'price': '0'}, format='json')

        self.assertEqual(response.status_code, 400)

    def test_patch_on_a_missing_line_is_404(self):
        response = self.client.patch(detail_url(4040), {'price': '1.00'}, format='json')

        self.assertEqual(response.status_code, 404)

    def test_delete_removes_the_line(self):
        line = self.line()

        response = self.client.delete(detail_url(line.pk))

        self.assertEqual(response.status_code, 204)
        self.assertFalse(PriceLine.objects.filter(pk=line.pk).exists())

    def test_a_single_line_cannot_be_read_on_its_own(self):
        line = self.line()

        self.assertEqual(self.client.get(detail_url(line.pk)).status_code, 405)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test research.test_price_lines`
Expected: FAIL — `ImportError: cannot import name 'PriceLine'`.

- [ ] **Step 3: Add the model and migration**

Append to `backend/research/models.py`:

```python
class PriceLine(models.Model):
    uic = models.PositiveIntegerField()
    asset_type = models.CharField(max_length=20)
    price = models.DecimalField(max_digits=12, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']
        indexes = [models.Index(fields=['uic', 'asset_type'])]

    def __str__(self):
        return f'{self.price} on {self.uic}:{self.asset_type}'
```

Run: `cd backend && .venv/bin/python manage.py makemigrations research -n priceline`
Expected: `research/migrations/0007_priceline.py - Create model PriceLine`

- [ ] **Step 4: Serializer, views, urls**

In `backend/research/serializers.py`, change the models import to
`from .models import PriceLine, SymbolNote, Watchlist, WatchlistItem` and append:

```python
class PriceLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = PriceLine
        fields = ['id', 'uic', 'asset_type', 'price', 'created_at']
        read_only_fields = ['id', 'uic', 'asset_type', 'created_at']

    def validate_price(self, value):
        return _positive_or_none(value)
```

In `backend/research/views.py`, change the models import to
`from .models import PriceLine, SymbolNote, Watchlist, WatchlistItem`, add `PriceLineSerializer,` to the `.serializers` import (keep it alphabetical: first in the list), and append:

```python
class PriceLineListCreateView(ListCreateAPIView):
    serializer_class = PriceLineSerializer
    pagination_class = None

    def get_queryset(self):
        return PriceLine.objects.filter(uic=self.kwargs['uic'], asset_type=self.kwargs['asset_type'])

    def perform_create(self, serializer):
        serializer.save(uic=self.kwargs['uic'], asset_type=self.kwargs['asset_type'])


class PriceLineDetailView(RetrieveUpdateDestroyAPIView):
    http_method_names = ['patch', 'delete', 'options']
    serializer_class = PriceLineSerializer
    queryset = PriceLine.objects.all()
```

In `backend/research/urls.py`, add `PriceLineDetailView,` and `PriceLineListCreateView,` to the `.views` import (alphabetical, after `PeersView`), and add to `urlpatterns` after the `notes/<str:symbol>/review/` entry:

```python
    path(
        'price-lines/<int:uic>/<str:asset_type>/',
        PriceLineListCreateView.as_view(),
        name='research-price-lines',
    ),
    path('price-lines/<int:pk>/', PriceLineDetailView.as_view(), name='research-price-line'),
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python manage.py test research`
Expected: PASS.

- [ ] **Step 6: Migrate the dev database**

Run: `cd backend && .venv/bin/python manage.py migrate research && .venv/bin/python manage.py migrate --check`
Expected: `Applying research.0007_priceline... OK`, then the check exits 0.

- [ ] **Step 7: Commit**

```bash
git add backend/research/models.py backend/research/migrations/0007_priceline.py backend/research/serializers.py backend/research/views.py backend/research/urls.py backend/research/test_price_lines.py
git commit -m "feat: store freeform price lines per instrument"
```

---

### Task 9: Price-line API client and query hooks

**Files:**
- Modify: `frontend/src/api/client/research.js`
- Modify: `frontend/src/api/queries/research.js`
- Test: `frontend/src/api/queries/research.test.jsx`

**Interfaces:**
- Consumes: the Task 8 endpoints.
- Produces:
  - client: `getPriceLines({ uic, assetType })`, `createPriceLine({ uic, assetType, price })`, `updatePriceLine(id, price)`, `deletePriceLine(id)` (`price` is a 2-dp string)
  - `researchKeys.priceLines(uic, assetType)`
  - `usePriceLines(uic, assetType)` — query, disabled until both are set, `data` is the plain array
  - `usePriceLineMutations(uic, assetType) → { create, update, remove }`; `create.mutate({ price })`, `update.mutate({ id, price })` (optimistic), `remove.mutate(id)` (optimistic); all refetch the list on settle

- [ ] **Step 1: Write the failing tests**

In `frontend/src/api/queries/research.test.jsx`, change the `./research` import to

```jsx
import {
  researchKeys,
  usePriceLineMutations,
  usePriceLines,
  useSymbolNote,
  useSymbolNoteMutation,
} from './research'
```

and append:

```jsx
describe('price lines', () => {
  beforeEach(() => vi.clearAllMocks())

  const useLines = () => ({ lines: usePriceLines(211, 'Stock'), edit: usePriceLineMutations(211, 'Stock') })

  it('does not fetch until the instrument is known', () => {
    setup(() => usePriceLines(undefined, undefined))

    expect(client.getPriceLines).not.toHaveBeenCalled()
  })

  it('moves a line in the cache before the server answers', async () => {
    client.getPriceLines.mockResolvedValue([{ id: 1, price: '100.00' }])
    client.updatePriceLine.mockReturnValue(new Promise(() => {}))
    const { result } = setup(useLines)
    await waitFor(() => expect(result.current.lines.data).toHaveLength(1))

    act(() => result.current.edit.update.mutate({ id: 1, price: '120.00' }))

    await waitFor(() => expect(result.current.lines.data[0].price).toBe('120.00'))
    expect(client.updatePriceLine).toHaveBeenCalledWith(1, '120.00')
  })

  it('puts a line back when the move fails', async () => {
    client.getPriceLines.mockResolvedValue([{ id: 1, price: '100.00' }])
    client.updatePriceLine.mockRejectedValue(new Error('boom'))
    const { result } = setup(useLines)
    await waitFor(() => expect(result.current.lines.data).toHaveLength(1))

    act(() => result.current.edit.update.mutate({ id: 1, price: '120.00' }))

    await waitFor(() => expect(result.current.edit.update.isError).toBe(true))
    await waitFor(() => expect(result.current.lines.data[0].price).toBe('100.00'))
  })

  it('removes a line from the cache immediately', async () => {
    client.getPriceLines.mockResolvedValue([{ id: 1, price: '100.00' }, { id: 2, price: '90.00' }])
    client.deletePriceLine.mockReturnValue(new Promise(() => {}))
    const { result } = setup(useLines)
    await waitFor(() => expect(result.current.lines.data).toHaveLength(2))

    act(() => result.current.edit.remove.mutate(1))

    await waitFor(() => expect(result.current.lines.data.map((line) => line.id)).toEqual([2]))
  })

  it('creates a line on the instrument and refetches the list', async () => {
    client.getPriceLines.mockResolvedValue([])
    client.createPriceLine.mockResolvedValue({ id: 3, price: '95.00' })
    const { result } = setup(useLines)
    await waitFor(() => expect(result.current.lines.isSuccess).toBe(true))

    await act(() => result.current.edit.create.mutateAsync({ price: '95.00' }))

    expect(client.createPriceLine).toHaveBeenCalledWith({ uic: 211, assetType: 'Stock', price: '95.00' })
    await waitFor(() => expect(client.getPriceLines).toHaveBeenCalledTimes(2))
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run src/api/queries/research.test.jsx`
Expected: FAIL — `usePriceLines is not a function`.

- [ ] **Step 3: Add the client functions**

In `frontend/src/api/client/research.js`, after `markSymbolNoteReviewed`, add:

```js
export const getPriceLines = ({ uic, assetType }) =>
  apiFetch(`/api/research/price-lines/${uic}/${assetType}/`)
export const createPriceLine = ({ uic, assetType, price }) =>
  jsonRequest(`/api/research/price-lines/${uic}/${assetType}/`, 'POST', { price })
export const updatePriceLine = (id, price) =>
  jsonRequest(`/api/research/price-lines/${id}/`, 'PATCH', { price })
export const deletePriceLine = (id) =>
  apiFetch(`/api/research/price-lines/${id}/`, { method: 'DELETE' })
```

- [ ] **Step 4: Add the key and hooks**

In `frontend/src/api/queries/research.js`:

Add `createPriceLine,`, `deletePriceLine,`, `getPriceLines,` and `updatePriceLine,` to the `../client` import list.

Add to `researchKeys` after `symbolNote`:

```js
  priceLines: (uic, assetType) => ['price-lines', instrumentKey(uic, assetType)],
```

Append after `useMarkReviewedMutation`:

```js
export function usePriceLines(uic, assetType) {
  return useQuery({
    queryKey: researchKeys.priceLines(uic, assetType),
    queryFn: () => getPriceLines({ uic, assetType }),
    enabled: Boolean(uic && assetType),
  })
}

export function usePriceLineMutations(uic, assetType) {
  const queryClient = useQueryClient()
  const key = researchKeys.priceLines(uic, assetType)
  const refetch = () => queryClient.invalidateQueries({ queryKey: key })
  const optimistic = (apply) => async (variables) => {
    await queryClient.cancelQueries({ queryKey: key })
    queryClient.setQueryData(key, (old) => (old ? apply(old, variables) : old))
  }

  return {
    create: useMutation({
      mutationFn: ({ price }) => createPriceLine({ uic, assetType, price }),
      onSettled: refetch,
    }),
    update: useMutation({
      mutationFn: ({ id, price }) => updatePriceLine(id, price),
      onMutate: optimistic((old, { id, price }) =>
        old.map((line) => (line.id === id ? { ...line, price } : line)),
      ),
      onSettled: refetch,
    }),
    remove: useMutation({
      mutationFn: (id) => deletePriceLine(id),
      onMutate: optimistic((old, id) => old.filter((line) => line.id !== id)),
      onSettled: refetch,
    }),
  }
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `cd frontend && npx vitest run src/api/queries/research.test.jsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/client/research.js frontend/src/api/queries/research.js frontend/src/api/queries/research.test.jsx
git commit -m "feat: add price-line API client and query hooks"
```

---

### Task 10: Draw, move and delete freeform lines on Research

**Files:**
- Modify: `frontend/src/components/research/useChartLines.js`
- Modify: `frontend/src/components/research/useChartLines.test.js`
- Modify: `frontend/src/pages/Research.jsx`
- Modify: `frontend/src/pages/Research.test.jsx`

**Interfaces:**
- Consumes: `usePriceLines`, `usePriceLineMutations` (Task 9); `chartLines`, `linePatch`, `roundPrice` (Task 5); `ChartPanel` line props (Task 7).
- Produces: `useChartLines({ symbol, uic, assetType, note }) → { lines, move(line, price), create?: (price) => void, remove(line), saveFailed }`. `create` is `undefined` while the instrument is unresolved.

- [ ] **Step 1: Update the hook tests (failing)**

Replace `frontend/src/components/research/useChartLines.test.js` with:

```js
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'

vi.mock('../../api/queries')
import * as queries from '../../api/queries'
import { useChartLines } from './useChartLines'

const noteMutate = vi.fn()
const createMutate = vi.fn()
const updateMutate = vi.fn()
const removeMutate = vi.fn()

const instrument = { symbol: 'NVDA', uic: 211, assetType: 'Stock' }

describe('useChartLines', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queries.useSymbolNoteMutation.mockReturnValue({ mutate: noteMutate })
    queries.usePriceLines.mockReturnValue({ data: [{ id: 7, uic: 211, asset_type: 'Stock', price: '95.50' }] })
    queries.usePriceLineMutations.mockReturnValue({
      create: { mutate: createMutate },
      update: { mutate: updateMutate },
      remove: { mutate: removeMutate },
    })
  })

  it('draws the thesis levels and the saved lines for the instrument', () => {
    const { result } = renderHook(() =>
      useChartLines({ ...instrument, note: { target_price: '250.00', stop_price: '180.50' } }),
    )

    expect(queries.usePriceLines).toHaveBeenCalledWith(211, 'Stock')
    expect(result.current.lines).toEqual([
      { id: 'target', kind: 'target', price: 250 },
      { id: 'stop', kind: 'stop', price: 180.5 },
      { id: 7, kind: 'free', price: 95.5 },
    ])
  })

  it('saves a moved target or stop onto the note', () => {
    const { result } = renderHook(() =>
      useChartLines({ ...instrument, note: { target_price: '250.00', stop_price: '180.50' } }),
    )

    act(() => result.current.move(result.current.lines[0], 262.004))
    act(() => result.current.move(result.current.lines[1], 175))

    expect(noteMutate).toHaveBeenNthCalledWith(1, { target_price: '262.00' }, expect.any(Object))
    expect(noteMutate).toHaveBeenNthCalledWith(2, { stop_price: '175.00' }, expect.any(Object))
    expect(updateMutate).not.toHaveBeenCalled()
  })

  it('saves a moved freeform line as that line', () => {
    const { result } = renderHook(() => useChartLines({ ...instrument, note: {} }))

    act(() => result.current.move(result.current.lines[0], 96.125))

    expect(updateMutate).toHaveBeenCalledWith({ id: 7, price: '96.13' }, expect.any(Object))
    expect(noteMutate).not.toHaveBeenCalled()
  })

  it('creates and removes freeform lines', () => {
    const { result } = renderHook(() => useChartLines({ ...instrument, note: {} }))

    act(() => result.current.create(101))
    act(() => result.current.remove(result.current.lines[0]))

    expect(createMutate).toHaveBeenCalledWith({ price: '101.00' }, expect.any(Object))
    expect(removeMutate).toHaveBeenCalledWith(7, expect.any(Object))
  })

  it('cannot create a line before the instrument is resolved', () => {
    queries.usePriceLines.mockReturnValue({ data: undefined })
    const { result } = renderHook(() =>
      useChartLines({ symbol: 'NVDA', uic: undefined, assetType: undefined, note: { target_price: '250.00' } }),
    )

    expect(result.current.create).toBeUndefined()
    expect(result.current.lines).toEqual([{ id: 'target', kind: 'target', price: 250 }])
  })

  it('reports a failed save for the symbol it happened on only', () => {
    updateMutate.mockImplementation((_, { onError }) => onError(new Error('boom')))
    const { result, rerender } = renderHook((props) => useChartLines(props), {
      initialProps: { ...instrument, note: {} },
    })

    act(() => result.current.move(result.current.lines[0], 90))
    expect(result.current.saveFailed).toBe(true)

    rerender({ symbol: 'MSFT', uic: 5, assetType: 'Stock', note: {} })
    expect(result.current.saveFailed).toBe(false)
  })

  it('clears the failure once a save succeeds', () => {
    noteMutate.mockImplementationOnce((_, { onError }) => onError(new Error('boom')))
    noteMutate.mockImplementationOnce((_, { onSuccess }) => onSuccess())
    const { result } = renderHook(() => useChartLines({ ...instrument, note: { target_price: '250.00' } }))

    act(() => result.current.move(result.current.lines[0], 240))
    act(() => result.current.move(result.current.lines[0], 241))

    expect(result.current.saveFailed).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run src/components/research/useChartLines.test.js`
Expected: FAIL — freeform line missing from `lines`, `create` not a function.

- [ ] **Step 3: Extend the hook**

Replace `frontend/src/components/research/useChartLines.js` with:

```js
import { useMemo, useState } from 'react'

import { usePriceLineMutations, usePriceLines, useSymbolNoteMutation } from '../../api/queries'
import { chartLines, linePatch, roundPrice } from '../../lib/priceLines'

export function useChartLines({ symbol, uic, assetType, note }) {
  const noteMutation = useSymbolNoteMutation(symbol)
  const saved = usePriceLines(uic, assetType)
  const lineMutations = usePriceLineMutations(uic, assetType)
  const [failedFor, setFailedFor] = useState(null)
  const lines = useMemo(() => chartLines(note, saved.data ?? []), [note, saved.data])

  const report = {
    onSuccess: () => setFailedFor(null),
    onError: () => setFailedFor(symbol),
  }
  const cents = (price) => roundPrice(price).toFixed(2)

  return {
    lines,
    saveFailed: failedFor === symbol,
    move: (line, price) => {
      const patch = linePatch(line, price)
      if (patch) noteMutation.mutate(patch, report)
      else lineMutations.update.mutate({ id: line.id, price: cents(price) }, report)
    },
    create: uic && assetType ? (price) => lineMutations.create.mutate({ price: cents(price) }, report) : undefined,
    remove: (line) => lineMutations.remove.mutate(line.id, report),
  }
}
```

Run: `cd frontend && npx vitest run src/components/research/useChartLines.test.js`
Expected: PASS.

- [ ] **Step 4: Wire it into Research**

In `frontend/src/pages/Research.jsx`, change the hook call to:

```jsx
  const priceLines = useChartLines({
    symbol,
    uic: instrument?.uic,
    assetType: instrument?.assetType,
    note: note?.data,
  })
```

and add to the `<ChartPanel ... />` props (next to `onMoveLine`):

```jsx
              onCreateLine={priceLines.create}
              onDeleteLine={priceLines.remove}
```

- [ ] **Step 5: Stub the new hooks in the Research page test**

In `frontend/src/pages/Research.test.jsx`, inside `stubQueries`, after the `useMarkReviewedMutation` line add:

```jsx
  queries.useSymbolNote.mockReturnValue({ ...idle, data: { symbol: 'NVDA', target_price: '130.00' } })
  queries.useSymbolNoteMutation.mockReturnValue({ mutate: vi.fn() })
  queries.usePriceLines.mockReturnValue({ ...idle, data: [{ id: 7, uic: 211, asset_type: 'Stock', price: '120.00' }] })
  queries.usePriceLineMutations.mockReturnValue({
    create: { mutate: vi.fn() },
    update: { mutate: vi.fn() },
    remove: { mutate: vi.fn() },
  })
```

and add, inside `describe('Research', ...)`:

```jsx
  it('draws the thesis target and the saved lines on the chart', () => {
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    expect(screen.getByTestId('price-line-target')).toBeInTheDocument()
    expect(screen.getByTestId('price-line-7')).toBeInTheDocument()
    expect(queries.usePriceLines).toHaveBeenCalledWith(211, 'Stock')
  })
```

(The fixture bars span 98–143, so `130.00` and `120.00` are on-screen.)

- [ ] **Step 6: Run the frontend suite**

Run: `cd frontend && npx vitest run`
Expected: PASS (whole suite — other pages mock `../api/queries` too and must be unaffected).

- [ ] **Step 7: Check it in the browser**

On Research: double-click the plot — a grey solid line appears at that price and survives a reload. Drag it; click its badge and type a price. Click it (thicker stroke, filled badge), press Delete — it disappears and stays gone after reload. With a line selected, click into the thesis "Bull case" box and press Backspace — only text is deleted. Double-click the price axis — the scale resets and no line is added. Switch to another symbol — its own lines show, not the previous symbol's. If the same ticker is on two exchanges in a watchlist, a line drawn on one does not appear on the other.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/research/useChartLines.js frontend/src/components/research/useChartLines.test.js frontend/src/pages/Research.jsx frontend/src/pages/Research.test.jsx
git commit -m "feat: draw, move and delete your own price lines on the Research chart"
```

---

### Task 11: Full verification and records

**Files:**
- Modify: `AGENTS.md` (Decided section)
- Create (only if something surprised you): `learning/learning-records/NNNN-<slug>.md` (gitignored)

- [ ] **Step 1: Run everything**

```bash
cd backend && .venv/bin/python manage.py test && .venv/bin/python manage.py migrate --check
cd ../frontend && npx vitest run && npx eslint . && npx vite build
```

Expected: all tests pass, `migrate --check` silent, eslint clean, build succeeds.

- [ ] **Step 2: Record the decision in AGENTS.md**

Append to the end of the **Decided** section of `AGENTS.md`:

```markdown
**The Research price scale is the bars', not the annotations'.** `priceGeometry`
takes a `yScale` the user sets by dragging the price axis, but never widens its
automatic domain to fit a target, stop or `PriceLine` — a target 3× the price
would flatten the candles. A line outside the visible range becomes an edge
marker in the gutter. Target/stop live on `SymbolNote` (per symbol, thesis
data); freeform lines are `PriceLine` rows keyed on uic + asset type like every
other per-instrument record.
```

- [ ] **Step 3: Learning record (conditional)**

If anything during implementation contradicted the obvious reading (e.g. a pointer/jsdom behaviour, a TanStack optimistic-update ordering surprise), append `learning/learning-records/0012-<slug>.md` describing the surprise and the reasoning. Skip if the work was routine.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md
git commit -m "docs: record that annotations never widen the Research price scale"
```
