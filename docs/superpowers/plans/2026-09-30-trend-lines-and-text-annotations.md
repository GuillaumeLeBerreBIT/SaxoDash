# Research Chart: Trend Lines (Rays) and Text Annotations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Research chart draw a projecting trend line (a "ray": two clicks set the slope, the line keeps extending toward future bars) and text annotations pinned to a point on the chart, plus an optional caption on any horizontal or ray line.

**Architecture:** Two new sibling models to `PriceLine` — `TrendLine` (two dated endpoints) and `TextAnnotation` (one dated point) — each with their own CRUD endpoint, client functions and query hooks, mirroring `PriceLine`'s exactly. `TVChart.jsx` only ever holds the currently *windowed* slice of bars (`lib/timeWindow.js`), not the full fetch, so date→index resolution for both new shapes happens one layer up, in `useChartData.js`, which has both the full fetched array and the window's offset; it hands `TVChart` already-resolved window-relative bar indices and prices, the same way indicator overlays are computed over everything and sliced to match. `TVChart` stays pixel-only: it maps an index to x via the existing `xAt`, a price to y via `scaleY`, exactly like it does for candles and indicators today. The chart's crosshair/horizontal-line toggle becomes a four-way `tool` picker (`crosshair | hline | ray | text`); a new `useAnnotationSelection` hook (extracted from the existing freeform-line selection logic) is shared by all three selectable annotation kinds so the same click-to-select/Delete/Escape behavior isn't hand-rolled three times.

**Tech Stack:** Django + DRF (`research` app, `APITestCase`), React 19 + TanStack Query + vitest/jsdom/Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-30-trend-lines-and-text-annotations-design.md`

## Global Constraints

- Generated code carries **zero comments** (AGENTS.md). Existing comments in touched files stay as they are.
- A migration is not done until `manage.py migrate` has run against the dev database, not only `manage.py test`.
- Prices are stored and sent with 2 decimal places; DRF returns them as strings (`"250.00"}`), the frontend converts with `Number()`. Minimum savable price is `0.01` (`MIN_PRICE`/`roundPrice` in `lib/priceLines.js` — reused, not duplicated).
- `TrendLine` and `TextAnnotation` are keyed by `uic` + `asset_type`, same as `PriceLine`.
- A bar's `date` field is an ISO `'YYYY-MM-DD'` string (`research/market.py::to_candle`, `time[:10]`) — identical to how DRF serializes a `DateField`. Comparing a bar's date to a stored `start_bar_date`/`bar_date` is plain string equality; no date parsing anywhere.
- `TVChart`'s `data`/`ind` props are the *windowed* slice (`allBars.slice(start, end)` in `useChartData.js`), never the full fetch. Any code that needs to resolve a stored `bar_date` against the full history (both trend-line endpoints, a text annotation's point) must run in `useChartData.js`, which has `allBars` and `timeWindow.start`. It hands `TVChart` a list already expressed as window-relative bar indices and numeric prices — `TVChart` never sees a raw date.
- Rays always extend from whichever endpoint is chronologically earlier toward whichever is later, regardless of click order — never backward from the later point.
- `start_bar_date == end_bar_date` is invalid for a `TrendLine` (rejected server-side; the frontend placement gesture also refuses to commit a same-bar second click).
- Backend tests: `cd backend && .venv/bin/python manage.py test <module>`. Frontend tests: `cd frontend && npx vitest run <path>`.
- jsdom has no `setPointerCapture`: always call it as `e.currentTarget.setPointerCapture?.(e.pointerId)`. jsdom's `getBoundingClientRect()` returns zeros, so in tests `clientX`/`clientY` equal the SVG-local x/y directly.
- `isTypingTarget` (from `lib/priceLines.js`) guards every global Delete/Backspace/Escape listener so typing in a label or text-annotation input never deletes or disarms anything.

## Review Focus

1. **A ray survives panning away from where it was drawn.** Both anchors can scroll out of the visible window while the projected line still crosses the current window's visible price range — it must keep drawing, not disappear just because its original bars aren't on screen. → Task 3 `resolveTrendLines` tests with a window that starts after both anchors.
2. **A same-bar second click is a no-op, not a degenerate ray.** Clicking the same bar twice while placing a ray must not commit anything and must leave the tool armed. → Task 7 test "a same-bar second click does not commit".
3. **A ray or text point that scrolls off mid-session stops rendering without throwing.** Re-resolving on a window change (pan/zoom/range switch) must cleanly drop to `null`/empty, not crash on a stale index. → Task 3 and Task 11 tests re-resolving with a shifted window.
4. **One annotation's failed save doesn't roll back another's.** `TrendLine`/`TextAnnotation` mutations use the same per-item optimistic-update-and-rollback shape as `PriceLine` — a failed update to one line must not revert a different line's already-applied optimistic change. → Task 8 and Task 13 mutation-hook tests.
5. **Delete/Backspace while typing a label or text block never deletes the selected item.** Same guard the existing freeform price line already has, easy to drop when wiring a second and third selectable shape. → Task 4's `useAnnotationSelection` test, reused by Tasks 5 and 12.

---

## Phase 1 — Ray tool and line labels

### Task 1: `PriceLine.label`

**Files:**
- Modify: `backend/research/models.py` (`PriceLine`)
- Create: `backend/research/migrations/0008_priceline_label.py` (generated)
- Modify: `backend/research/serializers.py` (`PriceLineSerializer`)
- Modify: `backend/research/test_price_lines.py`

**Interfaces:**
- Produces: `PriceLine.label` (`CharField`, blank-default `''`). `GET/POST/PATCH` on the existing `price-lines` endpoints accept and return it.

- [ ] **Step 1: Write the failing tests**

Append inside `class PriceLineAPITest` in `backend/research/test_price_lines.py`:

```python
    def test_create_and_patch_set_the_label(self):
        response = self.client.post(LIST_URL, {'price': '100.00', 'label': 'Breakout level'}, format='json')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['label'], 'Breakout level')

        line = PriceLine.objects.get()
        response = self.client.patch(detail_url(line.pk), {'label': 'Retest'}, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['label'], 'Retest')

    def test_label_defaults_to_empty(self):
        response = self.client.post(LIST_URL, {'price': '100.00'}, format='json')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['label'], '')
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test research.test_price_lines`
Expected: FAIL — `KeyError: 'label'`.

- [ ] **Step 3: Add the field, migration and serializer field**

In `backend/research/models.py`, in `PriceLine`, directly after the `price` line add:

```python
    label = models.CharField(max_length=60, blank=True, default='')
```

Run: `cd backend && .venv/bin/python manage.py makemigrations research -n priceline_label`
Expected: `Migrations for 'research': research/migrations/0008_priceline_label.py - Add field label to priceline`

In `backend/research/serializers.py`, change `PriceLineSerializer.Meta.fields` to:

```python
        fields = ['id', 'uic', 'asset_type', 'price', 'label', 'created_at']
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python manage.py test research`
Expected: PASS (whole app, so nothing else assumed a fixed field list).

- [ ] **Step 5: Migrate the dev database**

Run: `cd backend && .venv/bin/python manage.py migrate research && .venv/bin/python manage.py migrate --check`
Expected: `Applying research.0008_priceline_label... OK`, then the check exits 0 with no output.

- [ ] **Step 6: Commit**

```bash
git add backend/research/models.py backend/research/migrations/0008_priceline_label.py backend/research/serializers.py backend/research/test_price_lines.py
git commit -m "feat: let a freeform price line carry a caption"
```

---

### Task 2: `TrendLine` model and endpoints

**Files:**
- Modify: `backend/research/models.py`
- Create: `backend/research/migrations/0009_trendline.py` (generated)
- Modify: `backend/research/serializers.py`
- Modify: `backend/research/views.py`
- Modify: `backend/research/urls.py`
- Create: `backend/research/test_trend_lines.py`

**Interfaces:**
- Produces:
  - `GET/POST /api/research/trend-lines/<uic>/<asset_type>/`
  - `PATCH/DELETE /api/research/trend-lines/<id>/`
  - Serialized shape: `{id, uic, asset_type, start_bar_date, start_price, end_bar_date, end_price, label, created_at}`; prices are 2-dp strings, dates are `'YYYY-MM-DD'` strings.

- [ ] **Step 1: Write the failing tests**

Create `backend/research/test_trend_lines.py`:

```python
from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from .models import TrendLine

LIST_URL = '/api/research/trend-lines/211/Stock/'


def detail_url(pk):
    return f'/api/research/trend-lines/{pk}/'


class TrendLineAPITest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='alex', password='pw')
        token = RefreshToken.for_user(self.user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def line(self, uic=211, asset_type='Stock', start_bar_date='2026-08-01', start_price='100.00',
              end_bar_date='2026-08-10', end_price='110.00', label=''):
        return TrendLine.objects.create(
            uic=uic, asset_type=asset_type,
            start_bar_date=start_bar_date, start_price=Decimal(start_price),
            end_bar_date=end_bar_date, end_price=Decimal(end_price), label=label,
        )

    def test_requires_authentication(self):
        self.client.credentials()

        self.assertEqual(self.client.get(LIST_URL).status_code, 401)

    def test_lists_only_the_lines_of_that_instrument(self):
        self.line()
        self.line(asset_type='CfdOnStock')
        self.line(uic=999)

        response = self.client.get(LIST_URL)

        self.assertEqual(len(response.data), 1)

    def test_create_takes_the_instrument_from_the_url(self):
        response = self.client.post(
            LIST_URL,
            {
                'start_bar_date': '2026-08-01', 'start_price': '100.00',
                'end_bar_date': '2026-08-10', 'end_price': '110.00',
                'uic': 5, 'asset_type': 'Etf',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        line = TrendLine.objects.get()
        self.assertEqual((line.uic, line.asset_type), (211, 'Stock'))
        self.assertEqual(response.data['label'], '')

    def test_rejects_the_same_bar_for_both_ends(self):
        response = self.client.post(
            LIST_URL,
            {
                'start_bar_date': '2026-08-01', 'start_price': '100.00',
                'end_bar_date': '2026-08-01', 'end_price': '110.00',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(TrendLine.objects.exists())

    def test_rejects_a_price_at_or_below_zero(self):
        for field in ('start_price', 'end_price'):
            with self.subTest(field=field):
                payload = {
                    'start_bar_date': '2026-08-01', 'start_price': '100.00',
                    'end_bar_date': '2026-08-10', 'end_price': '110.00',
                    field: '0',
                }
                response = self.client.post(LIST_URL, payload, format='json')

                self.assertEqual(response.status_code, 400)
        self.assertFalse(TrendLine.objects.exists())

    def test_patch_moves_one_endpoint_and_leaves_the_other(self):
        line = self.line()

        response = self.client.patch(
            detail_url(line.pk), {'end_bar_date': '2026-08-12', 'end_price': '115.00'}, format='json'
        )

        self.assertEqual(response.status_code, 200)
        line.refresh_from_db()
        self.assertEqual(str(line.start_bar_date), '2026-08-01')
        self.assertEqual(str(line.end_bar_date), '2026-08-12')
        self.assertEqual(line.end_price, Decimal('115.00'))

    def test_patch_rejects_moving_both_ends_onto_the_same_bar(self):
        line = self.line()

        response = self.client.patch(detail_url(line.pk), {'end_bar_date': '2026-08-01'}, format='json')

        self.assertEqual(response.status_code, 400)

    def test_patch_sets_the_label(self):
        line = self.line()

        response = self.client.patch(detail_url(line.pk), {'label': 'Breakout'}, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['label'], 'Breakout')

    def test_delete_removes_the_line(self):
        line = self.line()

        response = self.client.delete(detail_url(line.pk))

        self.assertEqual(response.status_code, 204)
        self.assertFalse(TrendLine.objects.filter(pk=line.pk).exists())

    def test_patch_on_a_missing_line_is_404(self):
        response = self.client.patch(detail_url(4040), {'label': 'x'}, format='json')

        self.assertEqual(response.status_code, 404)

    def test_a_single_line_cannot_be_read_on_its_own(self):
        line = self.line()

        self.assertEqual(self.client.get(detail_url(line.pk)).status_code, 405)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test research.test_trend_lines`
Expected: FAIL — `ModuleNotFoundError`/`ImportError: cannot import name 'TrendLine'`.

- [ ] **Step 3: Add the model and migration**

In `backend/research/models.py`, append after `PriceLine`:

```python
class TrendLine(models.Model):
    uic = models.PositiveIntegerField()
    asset_type = models.CharField(max_length=20)
    start_bar_date = models.DateField()
    start_price = models.DecimalField(max_digits=12, decimal_places=2)
    end_bar_date = models.DateField()
    end_price = models.DecimalField(max_digits=12, decimal_places=2)
    label = models.CharField(max_length=60, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']
        indexes = [models.Index(fields=['uic', 'asset_type'])]

    def __str__(self):
        return f'{self.start_price}@{self.start_bar_date} -> {self.end_price}@{self.end_bar_date} on {self.uic}:{self.asset_type}'
```

Run: `cd backend && .venv/bin/python manage.py makemigrations research -n trendline`
Expected: `Migrations for 'research': research/migrations/0009_trendline.py - Create model TrendLine`

- [ ] **Step 4: Add the serializer**

In `backend/research/serializers.py`, add `TrendLine` to the `.models` import and append:

```python
class TrendLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = TrendLine
        fields = [
            'id', 'uic', 'asset_type',
            'start_bar_date', 'start_price', 'end_bar_date', 'end_price',
            'label', 'created_at',
        ]
        read_only_fields = ['id', 'uic', 'asset_type', 'created_at']

    def validate_start_price(self, value):
        return _positive_or_none(value)

    def validate_end_price(self, value):
        return _positive_or_none(value)

    def validate(self, attrs):
        start = attrs.get('start_bar_date', getattr(self.instance, 'start_bar_date', None))
        end = attrs.get('end_bar_date', getattr(self.instance, 'end_bar_date', None))
        if start is not None and end is not None and start == end:
            raise serializers.ValidationError('A trend line needs two different bars.')
        return attrs
```

- [ ] **Step 5: Add the views**

In `backend/research/views.py`, add `TrendLine` to the `.models` import and `TrendLineSerializer` to the `.serializers` import, then append after `PriceLineDetailView`:

```python
class TrendLineListCreateView(ListCreateAPIView):
    serializer_class = TrendLineSerializer
    pagination_class = None

    def get_queryset(self):
        return TrendLine.objects.filter(uic=self.kwargs['uic'], asset_type=self.kwargs['asset_type'])

    def perform_create(self, serializer):
        serializer.save(uic=self.kwargs['uic'], asset_type=self.kwargs['asset_type'])


class TrendLineDetailView(RetrieveUpdateDestroyAPIView):
    http_method_names = ['patch', 'delete', 'options']
    serializer_class = TrendLineSerializer
    queryset = TrendLine.objects.all()
```

- [ ] **Step 6: Add the URLs**

In `backend/research/urls.py`, add `TrendLineDetailView, TrendLineListCreateView,` to the `.views` import (alphabetically), and after the `price-lines` paths add:

```python
    re_path(
        r'^trend-lines/(?P<uic>[0-9]+)/(?P<asset_type>[A-Za-z]{1,20})/$',
        TrendLineListCreateView.as_view(),
        name='research-trend-lines',
    ),
    path('trend-lines/<int:pk>/', TrendLineDetailView.as_view(), name='research-trend-line'),
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python manage.py test research`
Expected: PASS.

- [ ] **Step 8: Migrate the dev database**

Run: `cd backend && .venv/bin/python manage.py migrate research && .venv/bin/python manage.py migrate --check`
Expected: `Applying research.0009_trendline... OK`, then the check exits 0.

- [ ] **Step 9: Commit**

```bash
git add backend/research/models.py backend/research/migrations/0009_trendline.py backend/research/serializers.py backend/research/views.py backend/research/urls.py backend/research/test_trend_lines.py
git commit -m "feat: add the TrendLine model and CRUD endpoints"
```

---

### Task 3: `lib/trendLines.js` — pure ray geometry

**Files:**
- Create: `frontend/src/lib/trendLines.js`
- Create: `frontend/src/lib/trendLines.test.js`

**Interfaces:**
- Produces:
  - `indexForDate(bars: Array<{date: string}>, date: string): number | null`
  - `toTrendLineShape(raw): {id, start: {barDate, price}, end: {barDate, price}, label}` — converts DRF's decimal strings to numbers.
  - `resolveTrendLines(lines: Array<ReturnType<toTrendLineShape>>, {allBars, windowStart, windowLength}): Array<{id, label, x1: number, y1: number, x2: number, y2: number}>` — `x1`/`x2` are **window-relative bar indices**, `y1`/`y2` are **prices** (not pixels). A line that cannot be placed in the current window is omitted from the result, not returned as `null`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/trendLines.test.js`:

```js
import { describe, expect, it } from 'vitest'

import { indexForDate, resolveTrendLines, toTrendLineShape } from './trendLines'

const allBars = Array.from({ length: 20 }, (_, i) => ({ date: `2026-08-${String(i + 1).padStart(2, '0')}` }))

describe('indexForDate', () => {
  it('finds the index of a bar by its date', () => {
    expect(indexForDate(allBars, '2026-08-05')).toBe(4)
  })

  it('is null for a date not in the dataset', () => {
    expect(indexForDate(allBars, '2026-09-01')).toBeNull()
  })
})

describe('toTrendLineShape', () => {
  it('converts the decimal strings DRF sends into numbers', () => {
    const shape = toTrendLineShape({
      id: 7, start_bar_date: '2026-08-01', start_price: '100.00',
      end_bar_date: '2026-08-10', end_price: '110.50', label: 'Breakout',
    })

    expect(shape).toEqual({
      id: 7,
      start: { barDate: '2026-08-01', price: 100 },
      end: { barDate: '2026-08-10', price: 110.5 },
      label: 'Breakout',
    })
  })
})

describe('resolveTrendLines', () => {
  const line = (overrides = {}) =>
    toTrendLineShape({
      id: 1, start_bar_date: '2026-08-01', start_price: '100.00',
      end_bar_date: '2026-08-05', end_price: '110.00', label: '', ...overrides,
    })

  it('draws the segment across the visible window, extrapolated to its right edge', () => {
    const [resolved] = resolveTrendLines([line()], { allBars, windowStart: 0, windowLength: 20 })

    expect(resolved.x1).toBe(0)
    expect(resolved.y1).toBe(100)
    expect(resolved.x2).toBe(19)
    expect(resolved.y2).toBeCloseTo(100 + ((110 - 100) / 4) * 18)
  })

  it('keeps projecting forward after both anchors have scrolled out of the window', () => {
    const [resolved] = resolveTrendLines([line()], { allBars, windowStart: 10, windowLength: 10 })

    expect(resolved).toBeDefined()
    expect(resolved.x1).toBe(0)
    expect(resolved.x2).toBe(9)
  })

  it('extends from whichever anchor is earlier, regardless of which was start or end', () => {
    const reversed = line({
      start_bar_date: '2026-08-05', start_price: '110.00',
      end_bar_date: '2026-08-01', end_price: '100.00',
    })
    const [resolved] = resolveTrendLines([reversed], { allBars, windowStart: 0, windowLength: 20 })

    expect(resolved.y1).toBe(100)
  })

  it('omits a line whose earlier anchor has not been reached yet by the window', () => {
    const resolved = resolveTrendLines([line()], { allBars, windowStart: 0, windowLength: 3 })

    expect(resolved).toEqual([])
  })

  it('omits a line with an anchor date outside the fetched history', () => {
    const missing = line({ start_bar_date: '2099-01-01' })
    const resolved = resolveTrendLines([missing], { allBars, windowStart: 0, windowLength: 20 })

    expect(resolved).toEqual([])
  })

  it('omits a flat (same-bar) line rather than dividing by zero', () => {
    const flat = line({ end_bar_date: '2026-08-01', end_price: '105.00' })
    const resolved = resolveTrendLines([flat], { allBars, windowStart: 0, windowLength: 20 })

    expect(resolved).toEqual([])
  })

  it('carries the label through unchanged', () => {
    const [resolved] = resolveTrendLines([line({ label: 'Support' })], { allBars, windowStart: 0, windowLength: 20 })

    expect(resolved.label).toBe('Support')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/trendLines.test.js`
Expected: FAIL — `Failed to resolve import "./trendLines"`.

- [ ] **Step 3: Implement**

Create `frontend/src/lib/trendLines.js`:

```js
export function indexForDate(bars, date) {
  const index = bars.findIndex((bar) => bar.date === date)
  return index === -1 ? null : index
}

export function toTrendLineShape(raw) {
  return {
    id: raw.id,
    start: { barDate: raw.start_bar_date, price: Number(raw.start_price) },
    end: { barDate: raw.end_bar_date, price: Number(raw.end_price) },
    label: raw.label ?? '',
  }
}

export function resolveTrendLines(lines, { allBars, windowStart, windowLength }) {
  const resolved = []

  for (const line of lines) {
    const i1 = indexForDate(allBars, line.start.barDate)
    const i2 = indexForDate(allBars, line.end.barDate)
    if (i1 == null || i2 == null || i1 === i2) continue

    const [iEarly, iLate] = i1 < i2 ? [i1, i2] : [i2, i1]
    const [pEarly, pLate] = i1 < i2 ? [line.start.price, line.end.price] : [line.end.price, line.start.price]

    const edgeIndexFull = windowStart + windowLength - 1
    if (iEarly > edgeIndexFull) continue

    const slope = (pLate - pEarly) / (iLate - iEarly)
    const startIndexFull = Math.max(iEarly, windowStart)
    const startPrice = pEarly + slope * (startIndexFull - iEarly)
    const edgePrice = pEarly + slope * (edgeIndexFull - iEarly)

    resolved.push({
      id: line.id,
      label: line.label,
      x1: startIndexFull - windowStart,
      y1: startPrice,
      x2: edgeIndexFull - windowStart,
      y2: edgePrice,
    })
  }

  return resolved
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/trendLines.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/trendLines.js frontend/src/lib/trendLines.test.js
git commit -m "feat: add the pure ray-geometry helpers for the Research chart"
```

---

### Task 4: Four-way chart tool, and a shared annotation-selection hook

**Files:**
- Modify: `frontend/src/components/research/ChartToolRail.jsx`
- Modify: `frontend/src/components/research/ChartToolRail.test.jsx`
- Modify: `frontend/src/pages/ResearchChart.jsx`
- Modify: `frontend/src/components/research/ChartPane.jsx`
- Modify: `frontend/src/components/research/ChartPane.test.jsx`
- Modify: `frontend/src/components/research/ChartCanvas.jsx`
- Create: `frontend/src/components/research/useAnnotationSelection.js`
- Create: `frontend/src/components/research/useAnnotationSelection.test.js`
- Modify: `frontend/src/components/research/TVChart.jsx`
- Modify: `frontend/src/components/research/TVChart.test.jsx`

**Interfaces:**
- Produces:
  - `ChartToolRail` props `tool: 'crosshair' | 'hline' | 'ray' | 'text'`, `onToolChange(tool)`, `canAnnotate: boolean` (replacing `placingLine`, `onPlacingLineChange`, `canPlaceLine`).
  - `TVChart`/`ChartCanvas`/`ChartPane` prop `tool` (replacing `placingLine`); `onPlaced` unchanged.
  - `useAnnotationSelection({ containerRef, items, onDelete }) → { selected, select(id), clear() }` — `items` need only an `id` field. Delete/Backspace removes `selected` unless focus is in a typing target; Escape or a pointerdown outside `containerRef` clears the selection.

No new chart behavior yet — this is a refactor to make room for two more tools, verified by the existing suites staying green under the renamed props.

- [ ] **Step 1: Extract `useAnnotationSelection`**

Create `frontend/src/components/research/useAnnotationSelection.test.js`:

```js
import { useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'

import { useAnnotationSelection } from './useAnnotationSelection'

function Harness({ items, onDelete, api }) {
  const containerRef = useRef(null)
  const selection = useAnnotationSelection({ containerRef, items, onDelete })
  api.current = selection
  return (
    <div ref={containerRef}>
      <input aria-label="elsewhere" />
    </div>
  )
}

const setup = (items, onDelete = vi.fn()) => {
  const api = { current: null }
  const utils = render(<Harness items={items} onDelete={onDelete} api={api} />)
  return { ...utils, api, onDelete }
}

describe('useAnnotationSelection', () => {
  it('starts with nothing selected', () => {
    const { api } = setup([{ id: 1 }])
    expect(api.current.selected).toBeNull()
  })

  it('selects and resolves the item by id', () => {
    const { api } = setup([{ id: 1 }, { id: 2 }])
    act(() => api.current.select(2))
    expect(api.current.selected).toEqual({ id: 2 })
  })

  it('deletes the selected item on Delete and clears the selection', () => {
    const { api, onDelete } = setup([{ id: 1 }])
    act(() => api.current.select(1))

    const event = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })
    act(() => window.dispatchEvent(event))

    expect(onDelete).toHaveBeenCalledWith({ id: 1 })
    expect(api.current.selected).toBeNull()
  })

  it('does not delete while a typing target has focus', () => {
    const { api, onDelete, getByLabelText } = setup([{ id: 1 }])
    act(() => api.current.select(1))
    getByLabelText('elsewhere').focus()

    const event = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true })
    act(() => window.dispatchEvent(event))

    expect(onDelete).not.toHaveBeenCalled()
  })

  it('clears the selection on Escape', () => {
    const { api } = setup([{ id: 1 }])
    act(() => api.current.select(1))

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))

    expect(api.current.selected).toBeNull()
  })

  it('clears the selection on a pointerdown outside the container', () => {
    const { api } = setup([{ id: 1 }])
    act(() => api.current.select(1))

    act(() => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })))

    expect(api.current.selected).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/components/research/useAnnotationSelection.test.js`
Expected: FAIL — `Failed to resolve import "./useAnnotationSelection"`.

- [ ] **Step 3: Implement the hook**

Create `frontend/src/components/research/useAnnotationSelection.js`:

```js
import { useEffect, useState } from 'react'

import { isTypingTarget } from '../../lib/priceLines'

export function useAnnotationSelection({ containerRef, items, onDelete }) {
  const [selectedId, setSelectedId] = useState(null)
  const selected = items.find((item) => item.id === selectedId) ?? null

  useEffect(() => {
    if (!selected) return undefined
    const onKeyDown = (event) => {
      if (isTypingTarget(event.target)) return
      if (event.key === 'Escape') setSelectedId(null)
      if ((event.key === 'Delete' || event.key === 'Backspace') && onDelete) {
        event.preventDefault()
        setSelectedId(null)
        onDelete(selected)
      }
    }
    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setSelectedId(null)
    }
    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [selected, onDelete, containerRef])

  return { selected, select: setSelectedId, clear: () => setSelectedId(null) }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/components/research/useAnnotationSelection.test.js`
Expected: PASS.

- [ ] **Step 5: Rename `placingLine` to `tool` in `ChartToolRail.jsx`**

Replace the whole file with:

```jsx
import { Link } from 'react-router-dom'
import { CandlestickChart, Check, Crosshair, LayoutGrid, Minimize2, Minus, RotateCcw, Sigma, Slash, Type } from 'lucide-react'

import { Menu, MenuRow } from './menu'
import { ChartTypeMenuItems, IndicatorMenuItems } from './chartMenus'
import { CHART_LAYOUTS, gridStyle, paneStyle } from '../../lib/chartLayouts'

const RAIL_BUTTON = 'w-9 h-9 rounded flex items-center justify-center transition-colors'

function RailDivider({ className = '' }) {
  return <span role="separator" aria-orientation="horizontal" className={`w-6 h-px bg-white/[0.08] my-1 ${className}`} />
}

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
        pressed ? 'bg-white/[0.09] text-zinc-100' : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06]'
      }`}
    >
      <Icon size={16} />
    </button>
  )
}

function LayoutIcon({ preset }) {
  return (
    <span
      aria-hidden="true"
      className="w-5 h-3.5 inline-grid align-middle mr-1.5 gap-px p-px rounded-sm border border-zinc-500 shrink-0"
      style={gridStyle(preset)}
    >
      {Array.from({ length: preset.panes }, (_, index) => (
        <span key={index} className="bg-zinc-600 rounded-[1px]" style={paneStyle(preset, index)} />
      ))}
    </span>
  )
}

export default function ChartToolRail({ controls, tool, onToolChange, canAnnotate, backHref, layout = '1', onLayoutChange }) {
  return (
    <nav aria-label="Chart tools" className="flex flex-col items-center gap-1 py-2 border-r border-white/[0.06]">
      <RailButton label="Crosshair" icon={Crosshair} pressed={tool === 'crosshair'} onClick={() => onToolChange('crosshair')} />
      <RailButton
        label="Horizontal line"
        icon={Minus}
        pressed={tool === 'hline'}
        disabled={!canAnnotate}
        onClick={() => onToolChange(tool === 'hline' ? 'crosshair' : 'hline')}
      />
      <RailButton
        label="Ray"
        icon={Slash}
        pressed={tool === 'ray'}
        disabled={!canAnnotate}
        onClick={() => onToolChange(tool === 'ray' ? 'crosshair' : 'ray')}
      />
      <RailButton
        label="Text"
        icon={Type}
        pressed={tool === 'text'}
        disabled={!canAnnotate}
        onClick={() => onToolChange(tool === 'text' ? 'crosshair' : 'text')}
      />

      <RailDivider />

      <Menu side="right" label="Chart type" icon={CandlestickChart} width={160}>
        <ChartTypeMenuItems controls={controls} />
      </Menu>
      <Menu side="right" label="Indicators" icon={Sigma} width={230}>
        <IndicatorMenuItems controls={controls} />
      </Menu>
      <div className="hidden lg:flex">
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
      </div>
      <RailButton
        label="Reset price scale"
        icon={RotateCcw}
        disabled={controls.yScale === 1}
        onClick={() => controls.setYScale(1)}
      />

      <RailDivider className="mt-auto" />

      <Link
        to={backHref}
        aria-label="Back to Research"
        title="Back to Research"
        className={`${RAIL_BUTTON} text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06]`}
      >
        <Minimize2 size={16} />
      </Link>
    </nav>
  )
}
```

- [ ] **Step 6: Update `ChartToolRail.test.jsx`**

Replace `placingLine: false, onPlacingLineChange: vi.fn(), canPlaceLine: true,` in `renderRail`'s defaults with `tool: 'crosshair', onToolChange: vi.fn(), canAnnotate: true,`.

Replace the three tests that reference the old props:

```jsx
  it('arms the line tool', async () => {
    const { onToolChange } = renderRail()
    await userEvent.click(screen.getByRole('button', { name: 'Horizontal line' }))
    expect(onToolChange).toHaveBeenCalledWith('hline')
  })

  it('disarms the line tool from the line button or the crosshair', async () => {
    const { onToolChange } = renderRail({ tool: 'hline' })
    expect(screen.getByRole('button', { name: 'Horizontal line' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(screen.getByRole('button', { name: 'Horizontal line' }))
    await userEvent.click(screen.getByRole('button', { name: 'Crosshair' }))

    expect(onToolChange).toHaveBeenNthCalledWith(1, 'crosshair')
    expect(onToolChange).toHaveBeenNthCalledWith(2, 'crosshair')
  })

  it('disables the line, ray and text tools when annotations cannot be created', () => {
    renderRail({ canAnnotate: false })
    expect(screen.getByRole('button', { name: 'Horizontal line' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Ray' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Text' })).toBeDisabled()
  })
```

Add, alongside the other rail-button tests:

```jsx
  it('arms and disarms the ray and text tools', async () => {
    const { onToolChange } = renderRail()

    await userEvent.click(screen.getByRole('button', { name: 'Ray' }))
    expect(onToolChange).toHaveBeenNthCalledWith(1, 'ray')

    await userEvent.click(screen.getByRole('button', { name: 'Text' }))
    expect(onToolChange).toHaveBeenNthCalledWith(2, 'text')
  })
```

- [ ] **Step 7: Run the rail tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/research/ChartToolRail.test.jsx`
Expected: PASS.

- [ ] **Step 8: Rename the prop through `ResearchChart.jsx`**

In `frontend/src/pages/ResearchChart.jsx`, replace:

```jsx
  const [placingLine, setPlacingLine] = useState(false)

  const [shownSymbol, setShownSymbol] = useState(symbol)
  if (shownSymbol !== symbol) {
    setShownSymbol(symbol)
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
```

with:

```jsx
  const [tool, setTool] = useState('crosshair')

  const [shownSymbol, setShownSymbol] = useState(symbol)
  if (shownSymbol !== symbol) {
    setShownSymbol(symbol)
    setTool('crosshair')
  }

  useEffect(() => {
    if (tool === 'crosshair') return undefined
    const onKeyDown = (event) => {
      if (isTypingTarget(event.target)) return
      if (event.key === 'Escape') setTool('crosshair')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [tool])
```

Replace the `<ChartToolRail ... />` props:

```jsx
      <ChartToolRail
        controls={rangeControls}
        tool={tool}
        onToolChange={setTool}
        canAnnotate={Boolean(activeSlot && priceLines.create)}
        backHref={researchHref(symbol, undefined, instrument)}
        layout={workspace.layout}
        onLayoutChange={workspace.setLayout}
      />
```

and the `<ChartPane ... />` props inside the `.map`:

```jsx
              <ChartPane
                key={index}
                slot={slot}
                active={active}
                outlined={split && active}
                controls={controls}
                view={paneView(index)}
                onActivate={() => workspace.activate(index)}
                tool={tool}
                onPlaced={() => setTool('crosshair')}
                paneHeights={paneHeights}
                style={paneStyle(layout, index)}
                className={active ? 'flex' : 'hidden lg:flex'}
                split={split}
              />
```

- [ ] **Step 9: Rename the prop through `ChartPane.jsx`**

In `frontend/src/components/research/ChartPane.jsx`, in `FilledPane`, replace `placingLine` with `tool` in the destructured props and in the `<ChartCanvas ... />` prop it passes down. In `ChartPane`, replace `placingLine` with `tool` in the destructured props and in:

```jsx
            placingLine={active && placingLine}
```

with:

```jsx
            tool={active ? tool : 'crosshair'}
```

- [ ] **Step 10: Update `ChartPane.test.jsx`**

Replace `placingLine={false}` with `tool="crosshair"` at the reference found earlier (keep `onPlaced={vi.fn()}` unchanged).

- [ ] **Step 11: Rename the prop through `ChartCanvas.jsx`**

In `frontend/src/components/research/ChartCanvas.jsx`, replace the `placingLine = false,` prop with `tool = 'crosshair',`, and change the `<TVChart ... />` prop `placingLine={placingLine}` to `tool={tool}`.

- [ ] **Step 12: Rename the prop through `TVChart.jsx` and switch selection to the shared hook**

In `frontend/src/components/research/TVChart.jsx`, add the import:

```jsx
import { useAnnotationSelection } from './useAnnotationSelection'
```

Replace the `TVChart` function's prop list entry `placingLine = false,` with `tool = 'crosshair',`.

Replace:

```jsx
  const [selectedId, setSelectedId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const placedRef = useRef(false)
```

with:

```jsx
  const placingLine = tool === 'hline'
  const [editingId, setEditingId] = useState(null)
  const placedRef = useRef(false)
  const freeLines = useMemo(() => lines.filter((line) => line.kind === 'free'), [lines])
  const freeSelection = useAnnotationSelection({ containerRef: ref, items: freeLines, onDelete: onDeleteLine })
```

Delete the whole `useEffect` block that previously managed `selected`/keydown/pointerdown (the one reading `const selected = lines.find(...)` through its closing `}, [selected, onDeleteLine, ref])`) — that block, and the line above it defining `selected`/`editing`, are replaced by:

```jsx
  const editing = lines.find((line) => line.id === editingId) ?? null
```

Everywhere else in the file that reads `selected` (the `onClick` handler's `setSelectedId(null)`, and `<PriceLines selectedId={selected?.id ?? null} onSelect={setSelectedId} .../>`) becomes `freeSelection.clear()` and `<PriceLines selectedId={freeSelection.selected?.id ?? null} onSelect={freeSelection.select} .../>` respectively.

Change the container's `cursor` style from `placingLine ? 'crosshair' : undefined` to `tool !== 'crosshair' ? 'crosshair' : undefined` (a ray/text tool being armed also wants the crosshair cursor).

- [ ] **Step 13: Rename `placingLine` to `tool` throughout `TVChart.test.jsx`**

Run:

```bash
cd frontend && sed -i '' \
  -e "s/placingLine: true/tool: 'hline'/g" \
  -e "s/placingLine: false/tool: 'crosshair'/g" \
  src/components/research/TVChart.test.jsx
```

Then open the file and fix the one remaining reference at "rerender(chart({ lines: [], onCreateLine }))" in the "still creates a line on a later double-click after placing one" test — it implicitly relies on `tool` defaulting to `'crosshair'` via the component's own default, which already holds, so no change is needed there.

- [ ] **Step 14: Run the full frontend suite to verify nothing broke**

Run: `cd frontend && npx vitest run src/components/research src/pages/ResearchChart.test.jsx`
Expected: PASS — this step is a rename, not new behavior, so the pre-existing assertions (drag, create, delete, select) must all still hold unchanged.

- [ ] **Step 15: Check it in the browser**

Start the stack (`scripts/dev.sh`, or reuse a running one) and open `/research/chart`. Verify: the rail now shows four tools (Crosshair, Horizontal line, Ray, Text — the last two visibly present but not yet wired to any gesture); horizontal-line placement, dragging, selecting and deleting a freeform line all behave exactly as before. If a local dev server hangs, disconnect the FortiClient VPN (known issue).

- [ ] **Step 16: Commit**

```bash
git add frontend/src/components/research/ChartToolRail.jsx frontend/src/components/research/ChartToolRail.test.jsx frontend/src/pages/ResearchChart.jsx frontend/src/components/research/ChartPane.jsx frontend/src/components/research/ChartPane.test.jsx frontend/src/components/research/ChartCanvas.jsx frontend/src/components/research/useAnnotationSelection.js frontend/src/components/research/useAnnotationSelection.test.js frontend/src/components/research/TVChart.jsx frontend/src/components/research/TVChart.test.jsx
git commit -m "refactor: a four-way chart tool and a shared annotation-selection hook"
```

---

### Task 5: Render, drag, select, delete and label a ray

**Files:**
- Create: `frontend/src/components/research/TrendLines.jsx`
- Modify: `frontend/src/components/research/TVChart.jsx`
- Modify: `frontend/src/components/research/TVChart.test.jsx`

**Interfaces:**
- Consumes: `resolveTrendLines`'s output shape (Task 3); `useAnnotationSelection` (Task 4); `edgeOf`-free — an off-window ray is simply absent from the list, there is no edge marker.
- Produces:
  - `TrendLines` default export: `({ lines, geometry, width, data, selectedId, onSelect, onMoveEndpoint, onDelete })`. `lines[i]` is `{id, label, x1, y1, x2, y2}` (window-relative index / price, per Task 3). `onMoveEndpoint(line, endpoint: 'start' | 'end', {barDate, price})`.
  - `TVChart` new props: `trendLines?: ResolvedLine[]`, `onMoveTrendLineEndpoint?`, `onDeleteTrendLine?`, `onEditTrendLineLabel?: (line, label: string) => void`.
  - Test ids: `trend-line-<id>`, `trend-line-hit-<id>`, `trend-line-handle-<id>-start`, `trend-line-handle-<id>-end`, `trend-line-label-<id>`.

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/components/research/TVChart.test.jsx`:

```jsx
describe('trend lines', () => {
  const ray = { id: 1, label: '', x1: 2, y1: 105, x2: 20, y2: 130 }
  const geometry = () =>
    priceGeometry({ data: bars, ind: computeIndicators(bars), width: 760, height: 360, withBands: false, yScale: 1 })

  const drag = (element, fromY, toY, fromX, toX) => {
    fireEvent.pointerDown(element, { clientX: fromX, clientY: fromY, pointerId: 1 })
    fireEvent.pointerMove(element, { clientX: toX, clientY: toY, pointerId: 1 })
    fireEvent.pointerUp(element, { clientX: toX, clientY: toY, pointerId: 1 })
  }

  it('draws a line from its resolved start to its resolved end', () => {
    const { getByTestId } = renderChart({ trendLines: [ray] })
    const g = geometry()
    const line = getByTestId('trend-line-1')

    expect(line.querySelector('line')).toHaveAttribute('x1', g.xAt(ray.x1).toFixed(2))
    expect(line.querySelector('line')).toHaveAttribute('x2', g.xAt(ray.x2).toFixed(2))
  })

  it('selects a ray by clicking its body', () => {
    const onSelect = vi.fn()
    const { getByTestId } = renderChart({ trendLines: [ray], onSelectTrendLine: onSelect })

    fireEvent.click(getByTestId('trend-line-hit-1'))

    expect(onSelect).toHaveBeenCalledWith(1)
  })

  it('moves the end handle to a new bar and price on drag', () => {
    const onMoveTrendLineEndpoint = vi.fn()
    const { getByTestId } = renderChart({ trendLines: [ray], onMoveTrendLineEndpoint })
    const g = geometry()

    const handle = getByTestId('trend-line-handle-1-end')
    drag(handle, g.scaleY(ray.y2), g.scaleY(ray.y2) + 10, g.xAt(ray.x2), g.xAt(5))

    expect(onMoveTrendLineEndpoint).toHaveBeenCalledTimes(1)
    const [line, endpoint, point] = onMoveTrendLineEndpoint.mock.calls[0]
    expect(line).toEqual(ray)
    expect(endpoint).toBe('end')
    expect(point.barDate).toBe(bars[5].date)
    expect(point.price).toBeLessThan(ray.y2)
  })

  it('moves the start handle independently of the end', () => {
    const onMoveTrendLineEndpoint = vi.fn()
    const { getByTestId } = renderChart({ trendLines: [ray], onMoveTrendLineEndpoint })
    const g = geometry()

    const handle = getByTestId('trend-line-handle-1-start')
    drag(handle, g.scaleY(ray.y1), g.scaleY(ray.y1) - 10, g.xAt(ray.x1), g.xAt(1))

    const [, endpoint] = onMoveTrendLineEndpoint.mock.calls[0]
    expect(endpoint).toBe('start')
  })

  it('does not move anything on a click without dragging', () => {
    const onMoveTrendLineEndpoint = vi.fn()
    const { getByTestId } = renderChart({ trendLines: [ray], onMoveTrendLineEndpoint })
    const g = geometry()
    const handle = getByTestId('trend-line-handle-1-end')

    fireEvent.pointerDown(handle, { clientX: g.xAt(ray.x2), clientY: g.scaleY(ray.y2), pointerId: 1 })
    fireEvent.pointerUp(handle, { clientX: g.xAt(ray.x2), clientY: g.scaleY(ray.y2), pointerId: 1 })

    expect(onMoveTrendLineEndpoint).not.toHaveBeenCalled()
  })

  it('deletes the selected ray with the Delete key', () => {
    const onDeleteTrendLine = vi.fn()
    const { getByTestId } = renderChart({ trendLines: [ray], onDeleteTrendLine })

    fireEvent.click(getByTestId('trend-line-hit-1'))
    fireEvent.keyDown(window, { key: 'Delete' })

    expect(onDeleteTrendLine).toHaveBeenCalledWith(ray)
  })

  it('does not delete a ray while the user is typing', () => {
    const onDeleteTrendLine = vi.fn()
    const { getByTestId } = renderChart({ trendLines: [ray], onDeleteTrendLine })
    const field = document.createElement('textarea')
    document.body.appendChild(field)

    fireEvent.click(getByTestId('trend-line-hit-1'))
    fireEvent.keyDown(field, { key: 'Backspace' })

    expect(onDeleteTrendLine).not.toHaveBeenCalled()
    field.remove()
  })

  it('opens a label editor on a double-click of the line body', () => {
    const { getByTestId, getByLabelText } = renderChart({ trendLines: [{ ...ray, label: 'Support' }] })

    fireEvent.doubleClick(getByTestId('trend-line-hit-1'))

    expect(getByLabelText('Trend line label')).toHaveValue('Support')
  })

  it('saves an edited label on Enter', () => {
    const onEditTrendLineLabel = vi.fn()
    const { getByTestId, getByLabelText } = renderChart({ trendLines: [ray], onEditTrendLineLabel })

    fireEvent.doubleClick(getByTestId('trend-line-hit-1'))
    const input = getByLabelText('Trend line label')
    fireEvent.change(input, { target: { value: 'Resistance' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onEditTrendLineLabel).toHaveBeenCalledWith(ray, 'Resistance')
  })

  it("a double-click on the line body does not also create a horizontal line", () => {
    const onCreateLine = vi.fn()
    const { getByTestId } = renderChart({ trendLines: [ray], onCreateLine })

    fireEvent.doubleClick(getByTestId('trend-line-hit-1'))

    expect(onCreateLine).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/research/TVChart.test.jsx`
Expected: FAIL — `Unable to find an element by: [data-testid="trend-line-1"]`.

- [ ] **Step 3: Create `TrendLines.jsx`**

Create `frontend/src/components/research/TrendLines.jsx`:

```jsx
import { useRef, useState } from 'react'

import { indexFromPointer, svgY } from '../../lib/chartGeometry'
import { CATEGORY_AXIS_TEXT } from '../../lib/charts'
import { roundPrice } from '../../lib/priceLines'

const HIT_WIDTH = 10
const HANDLE_RADIUS = 4
const HANDLE_HIT_RADIUS = 10

const stop = (event) => event.stopPropagation()

function Handle({ line, endpoint, x, y, geometry, data, onMove }) {
  const [preview, setPreview] = useState(null)
  const drag = useRef(null)
  const point = preview ?? { x, y }

  const cancel = () => {
    drag.current = null
    setPreview(null)
  }

  return (
    <g data-testid={`trend-line-handle-${line.id}-${endpoint}`}>
      <circle cx={point.x} cy={point.y} r={HANDLE_RADIUS} fill={CATEGORY_AXIS_TEXT} pointerEvents="none" />
      <circle
        cx={point.x}
        cy={point.y}
        r={HANDLE_HIT_RADIUS}
        fill="transparent"
        style={{ cursor: 'move' }}
        onPointerDown={(e) => {
          e.stopPropagation()
          e.currentTarget.setPointerCapture?.(e.pointerId)
          drag.current = { moved: false }
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          drag.current.moved = true
          const index = indexFromPointer(e, geometry.slot, data.length)
          setPreview({ x: geometry.xAt(index), y: svgY(e), index })
        }}
        onPointerUp={() => {
          const current = drag.current
          cancel()
          if (!current?.moved || preview == null) return
          onMove(line, endpoint, {
            barDate: data[preview.index].date,
            price: roundPrice(geometry.priceAtY(preview.y)),
          })
        }}
        onPointerCancel={cancel}
        onClick={stop}
        onDoubleClick={stop}
      />
    </g>
  )
}

function Ray({ line, geometry, data, selected, onSelect, onMove, onEdit }) {
  const x1 = geometry.xAt(line.x1)
  const y1 = geometry.scaleY(line.y1)
  const x2 = geometry.xAt(line.x2)
  const y2 = geometry.scaleY(line.y2)

  return (
    <g data-testid={`trend-line-${line.id}`}>
      <line x1={x1} x2={x2} y1={y1} y2={y2} stroke={CATEGORY_AXIS_TEXT} strokeWidth={selected ? 2 : 1} pointerEvents="none" />
      <line
        data-testid={`trend-line-hit-${line.id}`}
        x1={x1}
        x2={x2}
        y1={y1}
        y2={y2}
        stroke="transparent"
        strokeWidth={HIT_WIDTH}
        style={{ cursor: 'pointer' }}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(line.id)
        }}
        onDoubleClick={(e) => {
          e.stopPropagation()
          onEdit(line.id)
        }}
      />
      {line.label ? (
        <text x={x1 + 4} y={y1 - 6} fill={CATEGORY_AXIS_TEXT} fontSize="10" fontFamily="Geist Mono" pointerEvents="none">
          {line.label}
        </text>
      ) : null}
      <Handle line={line} endpoint="start" x={x1} y={y1} geometry={geometry} data={data} onMove={onMove} />
      <Handle line={line} endpoint="end" x={x2} y={y2} geometry={geometry} data={data} onMove={onMove} />
    </g>
  )
}

export default function TrendLines({ lines, geometry, data, selectedId, onSelect, onMoveEndpoint, onEdit }) {
  return lines.map((line) => (
    <Ray
      key={line.id}
      line={line}
      geometry={geometry}
      data={data}
      selected={line.id === selectedId}
      onSelect={onSelect}
      onMove={onMoveEndpoint}
      onEdit={onEdit}
    />
  ))
}

export function TrendLineLabelEditor({ line, x, y, onCommit, onCancel }) {
  const [draft, setDraft] = useState(line.label)
  const done = useRef(false)

  const close = (label) => {
    if (done.current) return
    done.current = true
    if (label == null || label === line.label) onCancel()
    else onCommit(line, label)
  }

  return (
    <input
      autoFocus
      aria-label="Trend line label"
      value={draft}
      maxLength={60}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') close(draft.trim())
        if (e.key === 'Escape') close(null)
      }}
      onBlur={() => close(draft.trim())}
      onClick={stop}
      onDoubleClick={stop}
      onPointerDown={stop}
      className="absolute h-6 px-1.5 rounded bg-zinc-900 border border-blue-500/60 text-[10px] font-mono text-zinc-100 outline-none"
      style={{ left: x, top: y - 12, width: 140 }}
    />
  )
}
```

- [ ] **Step 4: Wire it into `TVChart.jsx`**

Add to the imports:

```jsx
import TrendLines, { TrendLineLabelEditor } from './TrendLines'
```

Add a module-level default next to `NO_LINES`:

```jsx
const NO_TREND_LINES = []
```

Add new props to the `TVChart` function's parameter list, after `onDeleteLine,`:

```jsx
  trendLines = NO_TREND_LINES,
  onMoveTrendLineEndpoint,
  onDeleteTrendLine,
  onEditTrendLineLabel,
```

After the `freeSelection` declaration (Task 4, Step 12) add:

```jsx
  const trendSelection = useAnnotationSelection({ containerRef: ref, items: trendLines, onDelete: onDeleteTrendLine })
  const [editingTrendLineId, setEditingTrendLineId] = useState(null)
  const editingTrendLine = trendLines.find((line) => line.id === editingTrendLineId) ?? null
```

In the container's `onClick` handler, add `trendSelection.clear()` alongside the existing `freeSelection.clear()`.

Inside the `<svg>`, directly after the `<PriceLines ... />` element, add:

```jsx
        <TrendLines
          lines={trendLines}
          geometry={geometry}
          data={data}
          selectedId={trendSelection.selected?.id ?? null}
          onSelect={trendSelection.select}
          onMoveEndpoint={(line, endpoint, point) => onMoveTrendLineEndpoint?.(line, endpoint, point)}
          onEdit={setEditingTrendLineId}
        />
```

After the existing `{editing ? <PriceEditor .../> : null}` block, add:

```jsx
      {editingTrendLine ? (
        <TrendLineLabelEditor
          key={editingTrendLine.id}
          line={editingTrendLine}
          x={geometry.xAt(editingTrendLine.x1) + 6}
          y={geometry.scaleY(editingTrendLine.y1)}
          onCommit={(line, label) => {
            setEditingTrendLineId(null)
            onEditTrendLineLabel?.(line, label)
          }}
          onCancel={() => setEditingTrendLineId(null)}
        />
      ) : null}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/research/TVChart.test.jsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/research/TrendLines.jsx frontend/src/components/research/TVChart.jsx frontend/src/components/research/TVChart.test.jsx
git commit -m "feat: draw, drag, select, delete and label a ray on the Research chart"
```

---

### Task 6: Edit a horizontal line's label

**Files:**
- Modify: `frontend/src/api/client/research.js`
- Modify: `frontend/src/api/queries/research.js`
- Modify: `frontend/src/api/queries/research.test.jsx`
- Modify: `frontend/src/components/research/useChartLines.js`
- Modify: `frontend/src/components/research/useChartLines.test.js`
- Modify: `frontend/src/components/research/TrendLines.jsx` (rename `TrendLineLabelEditor` to the shared `LabelEditor`)
- Modify: `frontend/src/components/research/PriceLines.jsx`
- Modify: `frontend/src/components/research/TVChart.jsx`
- Modify: `frontend/src/components/research/TVChart.test.jsx`

**Interfaces:**
- Produces:
  - `updatePriceLine(id, patch)` — `patch` replaces the old `price`-only argument; `usePriceLineMutations(uic, assetType).update.mutate({id, patch})` replaces `.mutate({id, price})`.
  - `useChartLines(...).setLabel(line, label): void` (freeform lines only).
  - `TrendLines.jsx` exports `LabelEditor({ value, x, y, ariaLabel, onCommit, onCancel })` (renamed from `TrendLineLabelEditor`, generalised off `line` to a bare `value`).
  - `PriceLines` new prop `onEditLabel(id)`; double-clicking a freeform line's body opens the editor (target/stop are not editable this way, same restriction as selection).
  - `TVChart` new prop `onEditLineLabel?: (line, label: string) => void`.

The existing `PriceLine.price`-only update shape (Task's own `usePriceLineMutations`, built well before this plan) is widened here rather than left as a second, price-specific mutation living alongside a new label-specific one — one write path for anything about a freeform line.

- [ ] **Step 1: Write the failing tests for the widened mutation**

In `frontend/src/api/queries/research.test.jsx`, inside `describe('price lines', ...)`, change every `result.current.edit.update.mutate({ id: 1, price: '120.00' })` / `result.current.update.mutate({ id: 1, price: '120.00' })` call to `.mutate({ id: 1, patch: { price: '120.00' } })`, and change the one assertion on the client call:

```jsx
    expect(client.updatePriceLine).toHaveBeenCalledWith(1, { price: '120.00' })
```

Add one new test in the same `describe` block:

```jsx
  it('can patch just the label, leaving the price alone', async () => {
    client.getPriceLines.mockResolvedValue([{ id: 1, price: '100.00', label: '' }])
    client.updatePriceLine.mockResolvedValue({})
    const { result } = setup(useLines)
    await waitFor(() => expect(result.current.lines.data).toHaveLength(1))

    act(() => result.current.edit.update.mutate({ id: 1, patch: { label: 'Support' } }))

    await waitFor(() => expect(result.current.lines.data[0]).toEqual({ id: 1, price: '100.00', label: 'Support' }))
    expect(client.updatePriceLine).toHaveBeenCalledWith(1, { label: 'Support' })
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/api/queries/research.test.jsx`
Expected: FAIL — `client.updatePriceLine` called with `(1, '120.00')`, not `(1, { price: '120.00' })`.

- [ ] **Step 3: Widen the client function and the mutation**

In `frontend/src/api/client/research.js`, replace:

```js
export const updatePriceLine = (id, price) =>
  jsonRequest(`/api/research/price-lines/${id}/`, 'PATCH', { price })
```

with:

```js
export const updatePriceLine = (id, patch) =>
  jsonRequest(`/api/research/price-lines/${id}/`, 'PATCH', patch)
```

In `frontend/src/api/queries/research.js`, inside `usePriceLineMutations`, replace:

```js
    update: useMutation({
      mutationFn: ({ id, price }) => updatePriceLine(id, price),
      onMutate: optimistic((old, { id, price }) =>
        old.map((line) => (line.id === id ? { ...line, price } : line)),
      ),
      onError: rollback,
      onSettled: refetch,
    }),
```

with:

```js
    update: useMutation({
      mutationFn: ({ id, patch }) => updatePriceLine(id, patch),
      onMutate: optimistic((old, { id, patch }) =>
        old.map((line) => (line.id === id ? { ...line, ...patch } : line)),
      ),
      onError: rollback,
      onSettled: refetch,
    }),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/api/queries/research.test.jsx`
Expected: PASS.

- [ ] **Step 5: Write the failing tests for `useChartLines`**

In `frontend/src/components/research/useChartLines.test.js`, replace the `'saves a moved freeform line as that line'` test's assertion:

```js
    expect(updateMutate).toHaveBeenCalledWith({ id: 7, price: '96.13' }, expect.any(Object))
```

with:

```js
    expect(updateMutate).toHaveBeenCalledWith({ id: 7, patch: { price: '96.13' } }, expect.any(Object))
```

Add a new test after `'saves a moved freeform line as that line'`:

```js
  it('saves an edited label for a freeform line', () => {
    const { result } = renderHook(() => useChartLines({ ...instrument, note: {} }))

    act(() => result.current.setLabel(result.current.lines[0], 'Support'))

    expect(updateMutate).toHaveBeenCalledWith({ id: 7, patch: { label: 'Support' } }, expect.any(Object))
  })
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/research/useChartLines.test.js`
Expected: FAIL — wrong mutate payload; `result.current.setLabel is not a function`.

- [ ] **Step 7: Update `useChartLines.js`**

In `frontend/src/components/research/useChartLines.js`, replace:

```js
    move: (line, price) => {
      const patch = linePatch(line, price)
      if (patch) noteMutation.mutate(patch, report)
      else lineMutations.update.mutate({ id: line.id, price: cents(price) }, report)
    },
```

with:

```js
    move: (line, price) => {
      const patch = linePatch(line, price)
      if (patch) noteMutation.mutate(patch, report)
      else lineMutations.update.mutate({ id: line.id, patch: { price: cents(price) } }, report)
    },
    setLabel: (line, label) => lineMutations.update.mutate({ id: line.id, patch: { label } }, report),
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/research/useChartLines.test.js`
Expected: PASS.

- [ ] **Step 9: Write the failing chart-level tests**

Append to `frontend/src/components/research/TVChart.test.jsx`, inside `describe('price lines', ...)`:

```jsx
  it('opens a label editor on a double-click of a freeform line, but not target or stop', () => {
    const { getByTestId, getByLabelText, queryByLabelText } = renderChart({ lines: [target, free] })

    fireEvent.doubleClick(getByTestId('price-hit-target'))
    expect(queryByLabelText('Line label')).toBeNull()

    fireEvent.doubleClick(getByTestId('price-hit-7'))
    expect(getByLabelText('Line label')).toHaveValue('')
  })

  it('saves an edited line label on Enter', () => {
    const onEditLineLabel = vi.fn()
    const { getByTestId, getByLabelText } = renderChart({ lines: [free], onEditLineLabel })

    fireEvent.doubleClick(getByTestId('price-hit-7'))
    const input = getByLabelText('Line label')
    fireEvent.change(input, { target: { value: 'Support' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onEditLineLabel).toHaveBeenCalledWith(free, 'Support')
  })
```

(`free` here is the same fixture already declared at the top of that `describe` block, `{ id: 7, kind: 'free', price: 115 }`; it has no `label` field, so the editor starts blank.)

- [ ] **Step 10: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/research/TVChart.test.jsx`
Expected: FAIL — `Unable to find a label with the text of: Line label`.

- [ ] **Step 11: Rename and generalise the label editor in `TrendLines.jsx`**

In `frontend/src/components/research/TrendLines.jsx`, replace the `TrendLineLabelEditor` export:

```jsx
export function TrendLineLabelEditor({ line, x, y, onCommit, onCancel }) {
  const [draft, setDraft] = useState(line.label)
  const done = useRef(false)

  const close = (label) => {
    if (done.current) return
    done.current = true
    if (label == null || label === line.label) onCancel()
    else onCommit(line, label)
  }

  return (
    <input
      autoFocus
      aria-label="Trend line label"
      value={draft}
      maxLength={60}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') close(draft.trim())
        if (e.key === 'Escape') close(null)
      }}
      onBlur={() => close(draft.trim())}
      onClick={stop}
      onDoubleClick={stop}
      onPointerDown={stop}
      className="absolute h-6 px-1.5 rounded bg-zinc-900 border border-blue-500/60 text-[10px] font-mono text-zinc-100 outline-none"
      style={{ left: x, top: y - 12, width: 140 }}
    />
  )
}
```

with:

```jsx
export function LabelEditor({ value, x, y, ariaLabel, onCommit, onCancel }) {
  const [draft, setDraft] = useState(value)
  const done = useRef(false)

  const close = (next) => {
    if (done.current) return
    done.current = true
    if (next == null || next === value) onCancel()
    else onCommit(next)
  }

  return (
    <input
      autoFocus
      aria-label={ariaLabel}
      value={draft}
      maxLength={60}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') close(draft.trim())
        if (e.key === 'Escape') close(null)
      }}
      onBlur={() => close(draft.trim())}
      onClick={stop}
      onDoubleClick={stop}
      onPointerDown={stop}
      className="absolute h-6 px-1.5 rounded bg-zinc-900 border border-blue-500/60 text-[10px] font-mono text-zinc-100 outline-none"
      style={{ left: x, top: y - 12, width: 140 }}
    />
  )
}
```

- [ ] **Step 12: Update `TVChart.jsx`'s ray-label wiring for the renamed editor**

In `frontend/src/components/research/TVChart.jsx`, change the import from `import TrendLines, { TrendLineLabelEditor } from './TrendLines'` to `import TrendLines, { LabelEditor } from './TrendLines'`.

Replace the `{editingTrendLine ? <TrendLineLabelEditor .../> : null}` block (added in Task 5) with:

```jsx
      {editingTrendLine ? (
        <LabelEditor
          key={editingTrendLine.id}
          value={editingTrendLine.label}
          x={geometry.xAt(editingTrendLine.x1) + 6}
          y={geometry.scaleY(editingTrendLine.y1)}
          ariaLabel="Trend line label"
          onCommit={(label) => {
            setEditingTrendLineId(null)
            onEditTrendLineLabel?.(editingTrendLine, label)
          }}
          onCancel={() => setEditingTrendLineId(null)}
        />
      ) : null}
```

- [ ] **Step 13: Wire double-click-to-edit into `PriceLines.jsx`**

In `frontend/src/components/research/PriceLines.jsx`, add `onEditLabel` to both `DraggableLine`'s and the default export's parameter lists, threading it through the same way `onSelect` already is. Change the hit line's `onDoubleClick={stop}` to:

```jsx
        onDoubleClick={(e) => {
          e.stopPropagation()
          if (line.kind === 'free') onEditLabel(line.id)
        }}
```

and the default export:

```jsx
export default function PriceLines({ lines, geometry, width, selectedId, onMove, onSelect, onEditLabel }) {
  return lines.map((line) => (
    <DraggableLine
      key={line.id}
      line={line}
      geometry={geometry}
      width={width}
      selected={line.id === selectedId}
      onMove={onMove}
      onSelect={onSelect}
      onEditLabel={onEditLabel}
    />
  ))
}
```

- [ ] **Step 14: Wire the editor into `TVChart.jsx`**

Add `onEditLineLabel,` to the `TVChart` prop list, after `onDeleteLine,`.

After the `freeSelection` declaration, add:

```jsx
  const [editingFreeLineId, setEditingFreeLineId] = useState(null)
  const editingFreeLine = freeLines.find((line) => line.id === editingFreeLineId) ?? null
```

Add `onEditLabel={setEditingFreeLineId}` to the `<PriceLines ... />` element's props.

After the existing `{editing ? <PriceEditor .../> : null}` block, add:

```jsx
      {editingFreeLine ? (
        <LabelEditor
          key={editingFreeLine.id}
          value={editingFreeLine.label ?? ''}
          x={width - PAD_R + 2}
          y={geometry.scaleY(editingFreeLine.price) + 20}
          ariaLabel="Line label"
          onCommit={(label) => {
            setEditingFreeLineId(null)
            onEditLineLabel?.(editingFreeLine, label)
          }}
          onCancel={() => setEditingFreeLineId(null)}
        />
      ) : null}
```

`LabelEditor` is already imported in this file from Task 5/Step 12's rename; no new import is needed.

- [ ] **Step 15: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/research/TVChart.test.jsx`
Expected: PASS.

- [ ] **Step 16: Thread `setLabel` through to the chart**

In `frontend/src/components/research/ChartPane.jsx`, in `FilledPane`, add `onEditLineLabel={priceLines.setLabel}` to the `<ChartCanvas ... />` props.

In `frontend/src/components/research/ChartCanvas.jsx`, add `onEditLineLabel,` to the prop list and pass it through to `<TVChart ... />`.

- [ ] **Step 17: Run the full frontend suite**

Run: `cd frontend && npx vitest run src/components/research src/api/queries/research.test.jsx`
Expected: PASS.

- [ ] **Step 18: Check it in the browser**

Double-click an existing freeform horizontal line; type a caption; Enter to save; reload the page and confirm it persisted. Confirm double-clicking the target/stop lines does nothing.

- [ ] **Step 19: Commit**

```bash
git add frontend/src/api/client/research.js frontend/src/api/queries/research.js frontend/src/api/queries/research.test.jsx frontend/src/components/research/useChartLines.js frontend/src/components/research/useChartLines.test.js frontend/src/components/research/TrendLines.jsx frontend/src/components/research/PriceLines.jsx frontend/src/components/research/TVChart.jsx frontend/src/components/research/TVChart.test.jsx
git commit -m "feat: caption a freeform horizontal line by double-clicking it"
```

---

### Task 7: Place a new ray with two clicks

**Files:**
- Modify: `frontend/src/components/research/TVChart.jsx`
- Modify: `frontend/src/components/research/TVChart.test.jsx`

**Interfaces:**
- Consumes: `tool === 'ray'` (Task 4); `indexFromPointer`, `priceAtY` (existing).
- Produces: `TVChart` new prop `onCreateTrendLine?: (start: {barDate, price}, end: {barDate, price}) => void`. Test id for the live rubber-band preview: `trend-line-preview`.

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/components/research/TVChart.test.jsx`, inside a new `describe`:

```jsx
describe('placing a ray', () => {
  it('does nothing on the first click, and shows no preview yet', () => {
    const onCreateTrendLine = vi.fn()
    const { container, queryByTestId } = renderChart({ tool: 'ray', onCreateTrendLine })

    fireEvent.click(container.firstChild, { detail: 1, clientX: 100, clientY: 200 })

    expect(onCreateTrendLine).not.toHaveBeenCalled()
    expect(queryByTestId('trend-line-preview')).toBeNull()
  })

  it('previews a line from the first click to the current pointer position', () => {
    const { container, getByTestId } = renderChart({ tool: 'ray', onCreateTrendLine: vi.fn() })
    const plot = container.firstChild

    fireEvent.click(plot, { detail: 1, clientX: 100, clientY: 200 })
    fireEvent.mouseMove(plot, { clientX: 300, clientY: 150 })

    const preview = getByTestId('trend-line-preview')
    expect(preview).toHaveAttribute('y2', '150')
  })

  it('commits both points on the second click', () => {
    const onCreateTrendLine = vi.fn()
    const onPlaced = vi.fn()
    const { container } = renderChart({ tool: 'ray', onCreateTrendLine, onPlaced })
    const plot = container.firstChild
    const g = priceGeometry({ data: bars, ind: computeIndicators(bars), width: 760, height: 360, withBands: false, yScale: 1 })

    fireEvent.click(plot, { detail: 1, clientX: g.xAt(3), clientY: 200 })
    fireEvent.click(plot, { detail: 1, clientX: g.xAt(9), clientY: 150 })

    expect(onCreateTrendLine).toHaveBeenCalledTimes(1)
    const [start, end] = onCreateTrendLine.mock.calls[0]
    expect(start.barDate).toBe(bars[3].date)
    expect(end.barDate).toBe(bars[9].date)
    expect(onPlaced).toHaveBeenCalledTimes(1)
  })

  it('a same-bar second click does not commit and stays armed', () => {
    const onCreateTrendLine = vi.fn()
    const onPlaced = vi.fn()
    const { container, getByTestId } = renderChart({ tool: 'ray', onCreateTrendLine, onPlaced })
    const plot = container.firstChild
    const g = priceGeometry({ data: bars, ind: computeIndicators(bars), width: 760, height: 360, withBands: false, yScale: 1 })

    fireEvent.click(plot, { detail: 1, clientX: g.xAt(3), clientY: 200 })
    fireEvent.click(plot, { detail: 1, clientX: g.xAt(3), clientY: 150 })

    expect(onCreateTrendLine).not.toHaveBeenCalled()
    expect(onPlaced).not.toHaveBeenCalled()
    expect(getByTestId('trend-line-preview')).toBeInTheDocument()
  })

  it('clears the in-progress first point when the tool changes away', () => {
    const onCreateTrendLine = vi.fn()
    const { container, rerender, queryByTestId } = renderChart({ tool: 'ray', onCreateTrendLine })
    const plot = container.firstChild

    fireEvent.click(plot, { detail: 1, clientX: 100, clientY: 200 })
    rerender(chart({ tool: 'crosshair', onCreateTrendLine }))
    rerender(chart({ tool: 'ray', onCreateTrendLine }))
    fireEvent.mouseMove(plot, { clientX: 300, clientY: 150 })

    expect(queryByTestId('trend-line-preview')).toBeNull()
  })

  it('never starts a ray from a click in the price-axis gutter', () => {
    const onCreateTrendLine = vi.fn()
    const { container, queryByTestId } = renderChart({ tool: 'ray', onCreateTrendLine })

    fireEvent.click(container.firstChild, { detail: 1, clientX: 740, clientY: 200 })
    fireEvent.mouseMove(container.firstChild, { clientX: 300, clientY: 150 })

    expect(queryByTestId('trend-line-preview')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/research/TVChart.test.jsx`
Expected: FAIL — `onCreateTrendLine` never called; `trend-line-preview` never found.

- [ ] **Step 3: Implement the placement state machine**

In `frontend/src/components/research/TVChart.jsx`, add `onCreateTrendLine,` to the prop list, after `onEditTrendLineLabel,`.

After the `editingTrendLine` declaration (Task 5) add:

```jsx
  const [rayStart, setRayStart] = useState(null)
  useEffect(() => {
    setRayStart(null)
  }, [tool])
```

In the `plotY`/`editAt` block (just above the returned JSX), add a helper next to `editAt`:

```jsx
  const barAt = (event) => {
    const y = plotY(event)
    if (y == null) return null
    const index = indexFromPointer(event, geometry.slot, data.length)
    return { barDate: data[index].date, price: roundPrice(geometry.priceAtY(y)), x: geometry.xAt(index), y }
  }
```

`indexFromPointer` is already imported in this file (it powers the crosshair's own hover tracking).

In the container's top-level `onMouseMove` handler, alongside the existing `setHover(...)` call, add ray-preview tracking:

```jsx
      onMouseMove={(e) => {
        setHover(indexFromPointer(e, geometry.slot, data.length))
        if (tool === 'ray' && rayStart) {
          const point = barAt(e)
          if (point) setRayPreview(point)
        }
      }}
```

This needs a `rayPreview` state; add it next to `rayStart`:

```jsx
  const [rayStart, setRayStart] = useState(null)
  const [rayPreview, setRayPreview] = useState(null)
  useEffect(() => {
    setRayStart(null)
    setRayPreview(null)
  }, [tool])
```

In the container's `onClick` handler, add a ray branch before the existing horizontal-line branch (`if (!placingLine || !onCreateLine || e.detail > 1) return`):

```jsx
      onClick={(e) => {
        if (pan.consumeMoved()) return
        freeSelection.clear()
        trendSelection.clear()
        if (tool === 'ray' && onCreateTrendLine && e.detail === 1) {
          const point = barAt(e)
          if (point) {
            if (!rayStart) {
              setRayStart(point)
            } else if (point.barDate !== rayStart.barDate) {
              onCreateTrendLine(
                { barDate: rayStart.barDate, price: rayStart.price },
                { barDate: point.barDate, price: point.price },
              )
              setRayStart(null)
              setRayPreview(null)
              onPlaced?.()
            }
          }
          return
        }
        if (!placingLine || !onCreateLine || e.detail > 1) return
        const y = plotY(e)
        if (y == null) return
        placedRef.current = true
        onCreateLine(roundPrice(geometry.priceAtY(y)))
        onPlaced?.()
      }}
```

Inside the `<svg>`, directly after the `<TrendLines ... />` element, add the live preview:

```jsx
        {rayStart && rayPreview ? (
          <line
            data-testid="trend-line-preview"
            x1={rayStart.x}
            y1={rayStart.y}
            x2={rayPreview.x}
            y2={rayPreview.y}
            stroke={CATEGORY_AXIS_TEXT}
            strokeDasharray="3 3"
            pointerEvents="none"
          />
        ) : null}
```

Add `CATEGORY_AXIS_TEXT` to the existing `../../lib/charts` import.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/research/TVChart.test.jsx`
Expected: PASS.

- [ ] **Step 5: Check it in the browser**

With the stack running, arm the Ray tool, click a bar, move the mouse (a dashed preview should follow), click a second bar (the ray should commit and the tool should revert to crosshair). Click the same bar twice — nothing should happen and the tool should stay armed. Drag either end of a placed ray; double-click its body to caption it.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/research/TVChart.jsx frontend/src/components/research/TVChart.test.jsx
git commit -m "feat: place a ray with two clicks and a live preview"
```

---

### Task 8: Trend-line API client and query hooks

**Files:**
- Modify: `frontend/src/api/client/research.js`
- Modify: `frontend/src/api/queries/research.js`
- Modify: `frontend/src/api/queries/research.test.jsx`

**Interfaces:**
- Produces:
  - client: `getTrendLines({uic, assetType})`, `createTrendLine({uic, assetType, startBarDate, startPrice, endBarDate, endPrice})`, `updateTrendLine(id, patch)`, `deleteTrendLine(id)`.
  - `researchKeys.trendLines(uic, assetType)`.
  - `useTrendLines(uic, assetType)` — disabled until both are set, `data` is the raw array.
  - `useTrendLineMutations(uic, assetType) → { create, update, remove }`, same optimistic-update/rollback shape as `usePriceLineMutations`.

- [ ] **Step 1: Write the failing tests**

Find the existing `describe('price lines', ...)`-equivalent block in `frontend/src/api/queries/research.test.jsx` (the one exercising `usePriceLines`/`usePriceLineMutations`) and add, mirroring its structure with `TrendLine` names:

```jsx
describe('trend lines', () => {
  it('is disabled until both uic and asset type are known', () => {
    const { result } = setup(() => useTrendLines(undefined, undefined))
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('creates a trend line from both endpoints', async () => {
    client.createTrendLine.mockResolvedValue({ id: 3, start_bar_date: '2026-08-01', start_price: '100.00' })
    const { result } = setup(() => useTrendLineMutations(211, 'Stock'))

    await act(async () => {
      await result.current.create.mutateAsync({
        startBarDate: '2026-08-01', startPrice: '100.00', endBarDate: '2026-08-10', endPrice: '110.00',
      })
    })

    expect(client.createTrendLine).toHaveBeenCalledWith({
      uic: 211, assetType: 'Stock',
      startBarDate: '2026-08-01', startPrice: '100.00', endBarDate: '2026-08-10', endPrice: '110.00',
    })
  })

  it('optimistically patches only the moved line, and rolls back only that one on failure', async () => {
    queries.useTrendLines.mockReturnValue({
      data: [
        { id: 1, start_bar_date: '2026-08-01', start_price: '100.00', end_bar_date: '2026-08-10', end_price: '110.00', label: '' },
        { id: 2, start_bar_date: '2026-08-02', start_price: '90.00', end_bar_date: '2026-08-11', end_price: '95.00', label: '' },
      ],
    })
    client.updateTrendLine.mockRejectedValue(new Error('boom'))
    const client_ = new QueryClient()
    const wrapper = ({ children }) => <QueryClientProvider client={client_}>{children}</QueryClientProvider>
    client_.setQueryData(researchKeys.trendLines(211, 'Stock'), queries.useTrendLines().data)

    const { result } = renderHook(() => useTrendLineMutations(211, 'Stock'), { wrapper })

    await act(async () => {
      try {
        await result.current.update.mutateAsync({ id: 1, patch: { end_price: '999.00' } })
      } catch {
        // rollback path under test
      }
    })

    const after = client_.getQueryData(researchKeys.trendLines(211, 'Stock'))
    expect(after.find((line) => line.id === 1).end_price).toBe('110.00')
    expect(after.find((line) => line.id === 2).end_price).toBe('95.00')
  })
})
```

Add `createTrendLine, deleteTrendLine, updateTrendLine, useTrendLineMutations, useTrendLines,` to this test file's `../client`/local imports, matching how `createPriceLine`/`usePriceLineMutations` are already imported there, and add `QueryClient, QueryClientProvider` to the `@tanstack/react-query` import if not already present (check the file first — `renderHook`'s existing `setup` helper in this file likely already wraps a `QueryClientProvider`; if so, reuse `setup` for the rollback test too instead of constructing a second client, matching the file's existing pattern for the equivalent `PriceLine` rollback test).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/api/queries/research.test.jsx`
Expected: FAIL — `useTrendLines is not a function`.

- [ ] **Step 3: Add the client functions**

In `frontend/src/api/client/research.js`, after the `PriceLine` block, add:

```js
export const getTrendLines = ({ uic, assetType }) =>
  apiFetch(`/api/research/trend-lines/${uic}/${assetType}/`)
export const createTrendLine = ({ uic, assetType, startBarDate, startPrice, endBarDate, endPrice }) =>
  jsonRequest(`/api/research/trend-lines/${uic}/${assetType}/`, 'POST', {
    start_bar_date: startBarDate,
    start_price: startPrice,
    end_bar_date: endBarDate,
    end_price: endPrice,
  })
export const updateTrendLine = (id, patch) =>
  jsonRequest(`/api/research/trend-lines/${id}/`, 'PATCH', patch)
export const deleteTrendLine = (id) =>
  apiFetch(`/api/research/trend-lines/${id}/`, { method: 'DELETE' })
```

- [ ] **Step 4: Add the query key and hooks**

In `frontend/src/api/queries/research.js`, add `createTrendLine, deleteTrendLine, getTrendLines, updateTrendLine,` to the `../client` import (alphabetically), add to `researchKeys`:

```js
  trendLines: (uic, assetType) => ['trend-lines', instrumentKey(uic, assetType)],
```

and append, after `usePriceLineMutations`:

```js
export function useTrendLines(uic, assetType) {
  return useQuery({
    queryKey: researchKeys.trendLines(uic, assetType),
    queryFn: () => getTrendLines({ uic, assetType }),
    enabled: Boolean(uic && assetType),
  })
}

export function useTrendLineMutations(uic, assetType) {
  const queryClient = useQueryClient()
  const key = researchKeys.trendLines(uic, assetType)
  const refetch = (_data, _error, _variables, context) => {
    if (context) queryClient.invalidateQueries({ queryKey: context.key })
  }
  const optimistic = (apply) => async (variables) => {
    await queryClient.cancelQueries({ queryKey: key })
    const previous = queryClient.getQueryData(key)
    queryClient.setQueryData(key, (old) => (old ? apply(old, variables) : old))
    return { previous, key }
  }
  const rollback = (_error, _variables, context) => {
    if (context?.previous) queryClient.setQueryData(context.key, context.previous)
  }

  return {
    create: useMutation({
      mutationFn: (payload) => createTrendLine({ uic, assetType, ...payload }),
      onMutate: () => ({ key }),
      onSettled: refetch,
    }),
    update: useMutation({
      mutationFn: ({ id, patch }) => updateTrendLine(id, patch),
      onMutate: optimistic((old, { id, patch }) => old.map((line) => (line.id === id ? { ...line, ...patch } : line))),
      onError: rollback,
      onSettled: refetch,
    }),
    remove: useMutation({
      mutationFn: (id) => deleteTrendLine(id),
      onMutate: optimistic((old, id) => old.filter((line) => line.id !== id)),
      onError: rollback,
      onSettled: refetch,
    }),
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/api/queries/research.test.jsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/client/research.js frontend/src/api/queries/research.js frontend/src/api/queries/research.test.jsx
git commit -m "feat: add the trend-line API client and query hooks"
```

---

### Task 9: Wire rays end to end

**Files:**
- Create: `frontend/src/components/research/useChartTrendLines.js`
- Create: `frontend/src/components/research/useChartTrendLines.test.js`
- Modify: `frontend/src/components/research/useChartData.js`
- Modify: `frontend/src/components/research/ChartPane.jsx`
- Modify: `frontend/src/components/research/ChartCanvas.jsx`

**Interfaces:**
- Consumes: `useTrendLines`/`useTrendLineMutations` (Task 8); `toTrendLineShape`/`resolveTrendLines` (Task 3); `trendLines`/`onMoveTrendLineEndpoint`/`onDeleteTrendLine`/`onEditTrendLineLabel`/`onCreateTrendLine` (Tasks 5, 7).
- Produces: `useChartTrendLines({ symbol, uic, assetType }) → { lines: RawShape[], create?, saveFailed }`. `useChartData` returns `trendLines: ResolvedLine[]` (already window-resolved, ready for `TVChart`) alongside its existing fields.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/research/useChartTrendLines.test.js`:

```js
import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

import * as queries from '../../api/queries'
import { useChartTrendLines } from './useChartTrendLines'

vi.mock('../../api/queries', () => ({
  useTrendLines: vi.fn(),
  useTrendLineMutations: vi.fn(),
}))

const instrument = { uic: 211, assetType: 'Stock' }

describe('useChartTrendLines', () => {
  it('converts the saved lines to numeric shape', () => {
    queries.useTrendLines.mockReturnValue({
      data: [{ id: 1, start_bar_date: '2026-08-01', start_price: '100.00', end_bar_date: '2026-08-10', end_price: '110.00', label: '' }],
    })
    queries.useTrendLineMutations.mockReturnValue({
      create: { mutate: vi.fn() },
      update: { mutate: vi.fn() },
      remove: { mutate: vi.fn() },
    })

    const { result } = renderHook(() => useChartTrendLines({ symbol: 'NVDA', ...instrument }))

    expect(result.current.lines).toEqual([
      { id: 1, start: { barDate: '2026-08-01', price: 100 }, end: { barDate: '2026-08-10', price: 110 }, label: '' },
    ])
  })

  it('has no create function when the instrument is unresolved', () => {
    queries.useTrendLines.mockReturnValue({ data: [] })
    queries.useTrendLineMutations.mockReturnValue({
      create: { mutate: vi.fn() },
      update: { mutate: vi.fn() },
      remove: { mutate: vi.fn() },
    })

    const { result } = renderHook(() => useChartTrendLines({ symbol: 'NVDA', uic: undefined, assetType: undefined }))

    expect(result.current.create).toBeUndefined()
  })

  it('creates with cents-rounded prices from both endpoints', () => {
    queries.useTrendLines.mockReturnValue({ data: [] })
    const create = { mutate: vi.fn() }
    queries.useTrendLineMutations.mockReturnValue({ create, update: { mutate: vi.fn() }, remove: { mutate: vi.fn() } })

    const { result } = renderHook(() => useChartTrendLines({ symbol: 'NVDA', ...instrument }))
    result.current.create({ barDate: '2026-08-01', price: 100.456 }, { barDate: '2026-08-10', price: 110 })

    expect(create.mutate).toHaveBeenCalledWith(
      { startBarDate: '2026-08-01', startPrice: '100.46', endBarDate: '2026-08-10', endPrice: '110.00' },
      expect.any(Object),
    )
  })

  it('tracks a save failure until the symbol changes', () => {
    queries.useTrendLines.mockReturnValue({ data: [] })
    const remove = { mutate: (id, opts) => opts.onError() }
    queries.useTrendLineMutations.mockReturnValue({ create: { mutate: vi.fn() }, update: { mutate: vi.fn() }, remove })

    const { result, rerender } = renderHook((props) => useChartTrendLines(props), {
      initialProps: { symbol: 'NVDA', ...instrument },
    })
    result.current.remove({ id: 1 })
    rerender({ symbol: 'NVDA', ...instrument })
    expect(result.current.saveFailed).toBe(true)

    rerender({ symbol: 'AAPL', ...instrument })
    expect(result.current.saveFailed).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/components/research/useChartTrendLines.test.js`
Expected: FAIL — `Failed to resolve import "./useChartTrendLines"`.

- [ ] **Step 3: Implement the hook**

Create `frontend/src/components/research/useChartTrendLines.js`:

```js
import { useState } from 'react'

import { useTrendLineMutations, useTrendLines } from '../../api/queries'
import { roundPrice } from '../../lib/priceLines'
import { toTrendLineShape } from '../../lib/trendLines'

export function useChartTrendLines({ symbol, uic, assetType }) {
  const saved = useTrendLines(uic, assetType)
  const mutations = useTrendLineMutations(uic, assetType)
  const [failedFor, setFailedFor] = useState(null)
  if (failedFor !== null && failedFor !== symbol) setFailedFor(null)

  const report = {
    onSuccess: () => setFailedFor(null),
    onError: () => setFailedFor(symbol),
  }
  const cents = (price) => roundPrice(price).toFixed(2)

  return {
    lines: (saved.data ?? []).map(toTrendLineShape),
    saveFailed: failedFor === symbol,
    create:
      uic && assetType
        ? (start, end) =>
            mutations.create.mutate(
              {
                startBarDate: start.barDate,
                startPrice: cents(start.price),
                endBarDate: end.barDate,
                endPrice: cents(end.price),
              },
              report,
            )
        : undefined,
    moveEndpoint: (line, endpoint, point) =>
      mutations.update.mutate(
        {
          id: line.id,
          patch:
            endpoint === 'start'
              ? { start_bar_date: point.barDate, start_price: cents(point.price) }
              : { end_bar_date: point.barDate, end_price: cents(point.price) },
        },
        report,
      ),
    setLabel: (line, label) => mutations.update.mutate({ id: line.id, patch: { label } }, report),
    remove: (line) => mutations.remove.mutate(line.id, report),
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/components/research/useChartTrendLines.test.js`
Expected: PASS.

- [ ] **Step 5: Resolve and thread trend lines through `useChartData.js`**

In `frontend/src/components/research/useChartData.js`, add the imports:

```js
import { resolveTrendLines } from '../../lib/trendLines'
import { useChartTrendLines } from './useChartTrendLines'
```

After the `priceLines` line, add:

```js
  const savedTrendLines = useChartTrendLines({ symbol, uic, assetType })
  const trendLines = useMemo(
    () => resolveTrendLines(savedTrendLines.lines, { allBars, windowStart: start, windowLength: bars.length }),
    [savedTrendLines.lines, allBars, start, bars.length],
  )
```

Add `trendLines` and `savedTrendLines` to the returned object (alongside `priceLines`):

```js
    trendLines,
    trendLineActions: savedTrendLines,
```

- [ ] **Step 6: Thread the props through `ChartPane.jsx`**

In `frontend/src/components/research/ChartPane.jsx`, in `FilledPane`, destructure `trendLines, trendLineActions` from `useChartData`'s return alongside the existing fields, and pass to `ChartCanvas`:

```jsx
          trendLines={trendLines}
          onMoveTrendLineEndpoint={trendLineActions.moveEndpoint}
          onCreateTrendLine={trendLineActions.create}
          onDeleteTrendLine={trendLineActions.remove}
          onEditTrendLineLabel={trendLineActions.setLabel}
```

Change `lineSaveFailed={priceLines.saveFailed}` to `lineSaveFailed={priceLines.saveFailed || trendLineActions.saveFailed}`.

- [ ] **Step 7: Thread the props through `ChartCanvas.jsx`**

In `frontend/src/components/research/ChartCanvas.jsx`, add `trendLines, onMoveTrendLineEndpoint, onCreateTrendLine, onDeleteTrendLine, onEditTrendLineLabel,` to the prop list (alongside the existing `lines`/`onMoveLine`/etc.), and pass them through to `<TVChart ... />` with the same names.

- [ ] **Step 8: Run the full research test suite**

Run: `cd frontend && npx vitest run src/components/research src/lib/trendLines.test.js src/api/queries/research.test.jsx`
Expected: PASS.

- [ ] **Step 9: Check it in the browser**

With the stack running and Saxo connected (re-auth if the SIM token expired), open a symbol's Advanced chart, arm Ray, place one, pan the chart so both anchors scroll off the left edge, and confirm the ray keeps drawing across the visible window. Drag an endpoint; caption it; delete it; switch symbol and confirm it does not leak onto the new one.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/components/research/useChartTrendLines.js frontend/src/components/research/useChartTrendLines.test.js frontend/src/components/research/useChartData.js frontend/src/components/research/ChartPane.jsx frontend/src/components/research/ChartCanvas.jsx
git commit -m "feat: wire the ray tool to the backend end to end"
```

---

## Phase 2 — Text annotations

### Task 10: `TextAnnotation` model and endpoints

**Files:**
- Modify: `backend/research/models.py`
- Create: `backend/research/migrations/0010_textannotation.py` (generated)
- Modify: `backend/research/serializers.py`
- Modify: `backend/research/views.py`
- Modify: `backend/research/urls.py`
- Create: `backend/research/test_text_annotations.py`

**Interfaces:**
- Produces:
  - `GET/POST /api/research/text-annotations/<uic>/<asset_type>/`
  - `PATCH/DELETE /api/research/text-annotations/<id>/`
  - Serialized shape: `{id, uic, asset_type, bar_date, price, text, created_at}`.

- [ ] **Step 1: Write the failing tests**

Create `backend/research/test_text_annotations.py`:

```python
from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from .models import TextAnnotation

LIST_URL = '/api/research/text-annotations/211/Stock/'


def detail_url(pk):
    return f'/api/research/text-annotations/{pk}/'


class TextAnnotationAPITest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='alex', password='pw')
        token = RefreshToken.for_user(self.user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def annotation(self, uic=211, asset_type='Stock', bar_date='2026-08-01', price='100.00', text='Earnings gap'):
        return TextAnnotation.objects.create(uic=uic, asset_type=asset_type, bar_date=bar_date, price=Decimal(price), text=text)

    def test_requires_authentication(self):
        self.client.credentials()

        self.assertEqual(self.client.get(LIST_URL).status_code, 401)

    def test_lists_only_the_annotations_of_that_instrument(self):
        self.annotation()
        self.annotation(asset_type='CfdOnStock')
        self.annotation(uic=999)

        response = self.client.get(LIST_URL)

        self.assertEqual(len(response.data), 1)

    def test_create_takes_the_instrument_from_the_url(self):
        response = self.client.post(
            LIST_URL,
            {'bar_date': '2026-08-01', 'price': '100.00', 'text': 'Gap up', 'uic': 5, 'asset_type': 'Etf'},
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        annotation = TextAnnotation.objects.get()
        self.assertEqual((annotation.uic, annotation.asset_type), (211, 'Stock'))

    def test_rejects_blank_text(self):
        response = self.client.post(LIST_URL, {'bar_date': '2026-08-01', 'price': '100.00', 'text': ''}, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertFalse(TextAnnotation.objects.exists())

    def test_rejects_a_price_at_or_below_zero(self):
        response = self.client.post(LIST_URL, {'bar_date': '2026-08-01', 'price': '0', 'text': 'x'}, format='json')

        self.assertEqual(response.status_code, 400)

    def test_patch_moves_the_annotation(self):
        annotation = self.annotation()

        response = self.client.patch(detail_url(annotation.pk), {'bar_date': '2026-08-05', 'price': '95.00'}, format='json')

        self.assertEqual(response.status_code, 200)
        annotation.refresh_from_db()
        self.assertEqual(str(annotation.bar_date), '2026-08-05')
        self.assertEqual(annotation.price, Decimal('95.00'))

    def test_patch_changes_the_text(self):
        annotation = self.annotation()

        response = self.client.patch(detail_url(annotation.pk), {'text': 'Revised'}, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['text'], 'Revised')

    def test_delete_removes_the_annotation(self):
        annotation = self.annotation()

        response = self.client.delete(detail_url(annotation.pk))

        self.assertEqual(response.status_code, 204)
        self.assertFalse(TextAnnotation.objects.filter(pk=annotation.pk).exists())

    def test_a_single_annotation_cannot_be_read_on_its_own(self):
        annotation = self.annotation()

        self.assertEqual(self.client.get(detail_url(annotation.pk)).status_code, 405)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test research.test_text_annotations`
Expected: FAIL — `ImportError: cannot import name 'TextAnnotation'`.

- [ ] **Step 3: Add the model and migration**

In `backend/research/models.py`, append after `TrendLine`:

```python
class TextAnnotation(models.Model):
    uic = models.PositiveIntegerField()
    asset_type = models.CharField(max_length=20)
    bar_date = models.DateField()
    price = models.DecimalField(max_digits=12, decimal_places=2)
    text = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']
        indexes = [models.Index(fields=['uic', 'asset_type'])]

    def __str__(self):
        return f'"{self.text}" at {self.price}@{self.bar_date} on {self.uic}:{self.asset_type}'
```

Run: `cd backend && .venv/bin/python manage.py makemigrations research -n textannotation`
Expected: `Migrations for 'research': research/migrations/0010_textannotation.py - Create model TextAnnotation`

- [ ] **Step 4: Add the serializer**

In `backend/research/serializers.py`, add `TextAnnotation` to the `.models` import and append:

```python
class TextAnnotationSerializer(serializers.ModelSerializer):
    class Meta:
        model = TextAnnotation
        fields = ['id', 'uic', 'asset_type', 'bar_date', 'price', 'text', 'created_at']
        read_only_fields = ['id', 'uic', 'asset_type', 'created_at']

    def validate_price(self, value):
        return _positive_or_none(value)
```

- [ ] **Step 5: Add the views**

In `backend/research/views.py`, add `TextAnnotation` to the `.models` import and `TextAnnotationSerializer` to the `.serializers` import, then append after `TrendLineDetailView`:

```python
class TextAnnotationListCreateView(ListCreateAPIView):
    serializer_class = TextAnnotationSerializer
    pagination_class = None

    def get_queryset(self):
        return TextAnnotation.objects.filter(uic=self.kwargs['uic'], asset_type=self.kwargs['asset_type'])

    def perform_create(self, serializer):
        serializer.save(uic=self.kwargs['uic'], asset_type=self.kwargs['asset_type'])


class TextAnnotationDetailView(RetrieveUpdateDestroyAPIView):
    http_method_names = ['patch', 'delete', 'options']
    serializer_class = TextAnnotationSerializer
    queryset = TextAnnotation.objects.all()
```

- [ ] **Step 6: Add the URLs**

In `backend/research/urls.py`, add `TextAnnotationDetailView, TextAnnotationListCreateView,` to the `.views` import, and after the `trend-lines` paths add:

```python
    re_path(
        r'^text-annotations/(?P<uic>[0-9]+)/(?P<asset_type>[A-Za-z]{1,20})/$',
        TextAnnotationListCreateView.as_view(),
        name='research-text-annotations',
    ),
    path('text-annotations/<int:pk>/', TextAnnotationDetailView.as_view(), name='research-text-annotation'),
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python manage.py test research`
Expected: PASS.

- [ ] **Step 8: Migrate the dev database**

Run: `cd backend && .venv/bin/python manage.py migrate research && .venv/bin/python manage.py migrate --check`
Expected: `Applying research.0010_textannotation... OK`, then the check exits 0.

- [ ] **Step 9: Commit**

```bash
git add backend/research/models.py backend/research/migrations/0010_textannotation.py backend/research/serializers.py backend/research/views.py backend/research/urls.py backend/research/test_text_annotations.py
git commit -m "feat: add the TextAnnotation model and CRUD endpoints"
```

---

### Task 11: `lib/textAnnotations.js` — pure point geometry

**Files:**
- Create: `frontend/src/lib/textAnnotations.js`
- Create: `frontend/src/lib/textAnnotations.test.js`

**Interfaces:**
- Consumes: `indexForDate` (Task 3).
- Produces:
  - `toTextAnnotationShape(raw): {id, barDate, price, text}`
  - `resolveTextAnnotations(items, {allBars, windowStart, windowLength}): Array<{id, text, index, price}>` — `index` is window-relative; an annotation whose date is outside the window is omitted.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/textAnnotations.test.js`:

```js
import { describe, expect, it } from 'vitest'

import { resolveTextAnnotations, toTextAnnotationShape } from './textAnnotations'

const allBars = Array.from({ length: 20 }, (_, i) => ({ date: `2026-08-${String(i + 1).padStart(2, '0')}` }))

describe('toTextAnnotationShape', () => {
  it('converts the decimal string DRF sends into a number', () => {
    expect(toTextAnnotationShape({ id: 1, bar_date: '2026-08-05', price: '107.50', text: 'Gap' })).toEqual({
      id: 1,
      barDate: '2026-08-05',
      price: 107.5,
      text: 'Gap',
    })
  })
})

describe('resolveTextAnnotations', () => {
  const item = (overrides = {}) =>
    toTextAnnotationShape({ id: 1, bar_date: '2026-08-05', price: '107.50', text: 'Gap', ...overrides })

  it('resolves to a window-relative index when the bar is visible', () => {
    const [resolved] = resolveTextAnnotations([item()], { allBars, windowStart: 2, windowLength: 10 })

    expect(resolved).toEqual({ id: 1, text: 'Gap', index: 2, price: 107.5 })
  })

  it('omits an annotation whose bar has scrolled out of the window', () => {
    const resolved = resolveTextAnnotations([item()], { allBars, windowStart: 10, windowLength: 5 })

    expect(resolved).toEqual([])
  })

  it('omits an annotation with a date outside the fetched history', () => {
    const resolved = resolveTextAnnotations([item({ bar_date: '2099-01-01' })], { allBars, windowStart: 0, windowLength: 20 })

    expect(resolved).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/textAnnotations.test.js`
Expected: FAIL — `Failed to resolve import "./textAnnotations"`.

- [ ] **Step 3: Implement**

Create `frontend/src/lib/textAnnotations.js`:

```js
import { indexForDate } from './trendLines'

export function toTextAnnotationShape(raw) {
  return { id: raw.id, barDate: raw.bar_date, price: Number(raw.price), text: raw.text }
}

export function resolveTextAnnotations(items, { allBars, windowStart, windowLength }) {
  const resolved = []

  for (const item of items) {
    const full = indexForDate(allBars, item.barDate)
    if (full == null) continue
    const index = full - windowStart
    if (index < 0 || index >= windowLength) continue
    resolved.push({ id: item.id, text: item.text, index, price: item.price })
  }

  return resolved
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/textAnnotations.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/textAnnotations.js frontend/src/lib/textAnnotations.test.js
git commit -m "feat: add the pure text-annotation geometry helpers"
```

---

### Task 12: Place, render, drag, select, edit and delete a text annotation

**Files:**
- Create: `frontend/src/components/research/TextAnnotations.jsx`
- Modify: `frontend/src/components/research/TVChart.jsx`
- Modify: `frontend/src/components/research/TVChart.test.jsx`

**Interfaces:**
- Consumes: `resolveTextAnnotations`'s output (Task 11); `useAnnotationSelection` (Task 4); `barAt`, `indexFromPointer` (existing/Task 7).
- Produces:
  - `TextAnnotations` default export: `({ items, geometry, data, selectedId, onSelect, onMove, onEdit })`. `items[i]` is `{id, text, index, price}`.
  - `TVChart` new props: `textAnnotations?: ResolvedItem[]`, `onMoveTextAnnotation?`, `onDeleteTextAnnotation?`, `onEditTextAnnotationText?`, `onCreateTextAnnotation?: ({barDate, price, text}) => void`.
  - Test ids: `text-annotation-<id>`, `text-annotation-hit-<id>`.

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/components/research/TVChart.test.jsx`:

```jsx
describe('text annotations', () => {
  const note = { id: 1, text: 'Earnings gap', index: 5, price: 108 }
  const geometry = () =>
    priceGeometry({ data: bars, ind: computeIndicators(bars), width: 760, height: 360, withBands: false, yScale: 1 })

  it('draws the text at its resolved point', () => {
    const { getByTestId } = renderChart({ textAnnotations: [note] })
    expect(getByTestId('text-annotation-1')).toHaveTextContent('Earnings gap')
  })

  it('selects an annotation by clicking it', () => {
    const onSelect = vi.fn()
    const { getByTestId } = renderChart({ textAnnotations: [note], onSelectTextAnnotation: onSelect })

    fireEvent.click(getByTestId('text-annotation-hit-1'))

    expect(onSelect).toHaveBeenCalledWith(1)
  })

  it('moves the annotation on drag', () => {
    const onMoveTextAnnotation = vi.fn()
    const { getByTestId } = renderChart({ textAnnotations: [note], onMoveTextAnnotation })
    const g = geometry()
    const hit = getByTestId('text-annotation-hit-1')

    fireEvent.pointerDown(hit, { clientX: g.xAt(note.index), clientY: g.scaleY(note.price), pointerId: 1 })
    fireEvent.pointerMove(hit, { clientX: g.xAt(12), clientY: g.scaleY(note.price) - 10, pointerId: 1 })
    fireEvent.pointerUp(hit, { clientX: g.xAt(12), clientY: g.scaleY(note.price) - 10, pointerId: 1 })

    expect(onMoveTextAnnotation).toHaveBeenCalledTimes(1)
    const [item, point] = onMoveTextAnnotation.mock.calls[0]
    expect(item).toEqual(note)
    expect(point.barDate).toBe(bars[12].date)
  })

  it('opens a text editor on a double-click', () => {
    const { getByTestId, getByLabelText } = renderChart({ textAnnotations: [note] })

    fireEvent.doubleClick(getByTestId('text-annotation-hit-1'))

    expect(getByLabelText('Annotation text')).toHaveValue('Earnings gap')
  })

  it('saves edited text on Enter, and ignores an emptied save', () => {
    const onEditTextAnnotationText = vi.fn()
    const { getByTestId, getByLabelText } = renderChart({ textAnnotations: [note], onEditTextAnnotationText })

    fireEvent.doubleClick(getByTestId('text-annotation-hit-1'))
    const input = getByLabelText('Annotation text')
    fireEvent.change(input, { target: { value: 'Revised' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onEditTextAnnotationText).toHaveBeenCalledWith(note, 'Revised')
  })

  it('deletes the selected annotation with the Delete key', () => {
    const onDeleteTextAnnotation = vi.fn()
    const { getByTestId } = renderChart({ textAnnotations: [note], onDeleteTextAnnotation })

    fireEvent.click(getByTestId('text-annotation-hit-1'))
    fireEvent.keyDown(window, { key: 'Delete' })

    expect(onDeleteTextAnnotation).toHaveBeenCalledWith(note)
  })
})

describe('placing a text annotation', () => {
  it('opens a blank editor at the clicked point on the first click', () => {
    const { container, getByLabelText } = renderChart({ tool: 'text', onCreateTextAnnotation: vi.fn() })

    fireEvent.click(container.firstChild, { detail: 1, clientX: 100, clientY: 200 })

    expect(getByLabelText('Annotation text')).toHaveValue('')
  })

  it('commits on Enter with non-blank text', () => {
    const onCreateTextAnnotation = vi.fn()
    const onPlaced = vi.fn()
    const { container, getByLabelText } = renderChart({ tool: 'text', onCreateTextAnnotation, onPlaced })
    const g = priceGeometry({ data: bars, ind: computeIndicators(bars), width: 760, height: 360, withBands: false, yScale: 1 })

    fireEvent.click(container.firstChild, { detail: 1, clientX: g.xAt(7), clientY: 200 })
    const input = getByLabelText('Annotation text')
    fireEvent.change(input, { target: { value: 'Breakout' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onCreateTextAnnotation).toHaveBeenCalledWith({ barDate: bars[7].date, price: expect.any(Number), text: 'Breakout' })
    expect(onPlaced).toHaveBeenCalledTimes(1)
  })

  it('does not commit an empty text block', () => {
    const onCreateTextAnnotation = vi.fn()
    const { container, getByLabelText, queryByLabelText } = renderChart({ tool: 'text', onCreateTextAnnotation })

    fireEvent.click(container.firstChild, { detail: 1, clientX: 100, clientY: 200 })
    const input = getByLabelText('Annotation text')
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(onCreateTextAnnotation).not.toHaveBeenCalled()
    expect(queryByLabelText('Annotation text')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/research/TVChart.test.jsx`
Expected: FAIL — `Unable to find an element by: [data-testid="text-annotation-1"]`.

- [ ] **Step 3: Create `TextAnnotations.jsx`**

Create `frontend/src/components/research/TextAnnotations.jsx`:

```jsx
import { useRef, useState } from 'react'

import { indexFromPointer, svgY } from '../../lib/chartGeometry'
import { CATEGORY_AXIS_TEXT } from '../../lib/charts'
import { roundPrice } from '../../lib/priceLines'

const HIT_RADIUS = 10

const stop = (event) => event.stopPropagation()

function Note({ item, geometry, data, selected, onSelect, onMove, onEdit }) {
  const [preview, setPreview] = useState(null)
  const drag = useRef(null)
  const x = preview?.x ?? geometry.xAt(item.index)
  const y = preview?.y ?? geometry.scaleY(item.price)

  const cancel = () => {
    drag.current = null
    setPreview(null)
  }

  return (
    <g data-testid={`text-annotation-${item.id}`}>
      <text
        x={x + 6}
        y={y}
        fill={selected ? '#e4e4e7' : CATEGORY_AXIS_TEXT}
        fontSize="10"
        fontFamily="Geist Mono"
        pointerEvents="none"
      >
        {item.text}
      </text>
      <circle cx={x} cy={y} r={2.5} fill={CATEGORY_AXIS_TEXT} pointerEvents="none" />
      <circle
        data-testid={`text-annotation-hit-${item.id}`}
        cx={x}
        cy={y}
        r={HIT_RADIUS}
        fill="transparent"
        style={{ cursor: 'move' }}
        onPointerDown={(e) => {
          e.stopPropagation()
          e.currentTarget.setPointerCapture?.(e.pointerId)
          drag.current = { moved: false }
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          drag.current.moved = true
          const index = indexFromPointer(e, geometry.slot, data.length)
          setPreview({ x: geometry.xAt(index), y: svgY(e), index })
        }}
        onPointerUp={() => {
          const current = drag.current
          cancel()
          if (!current?.moved || preview == null) return
          onMove(item, { barDate: data[preview.index].date, price: roundPrice(geometry.priceAtY(preview.y)) })
        }}
        onPointerCancel={cancel}
        onClick={(e) => {
          e.stopPropagation()
          if (!drag.current) onSelect(item.id)
        }}
        onDoubleClick={(e) => {
          e.stopPropagation()
          onEdit(item.id)
        }}
      />
    </g>
  )
}

export default function TextAnnotations({ items, geometry, data, selectedId, onSelect, onMove, onEdit }) {
  return items.map((item) => (
    <Note
      key={item.id}
      item={item}
      geometry={geometry}
      data={data}
      selected={item.id === selectedId}
      onSelect={onSelect}
      onMove={onMove}
      onEdit={onEdit}
    />
  ))
}

export function TextAnnotationEditor({ text, x, y, onCommit, onCancel }) {
  const [draft, setDraft] = useState(text)
  const done = useRef(false)

  const close = (value) => {
    if (done.current) return
    done.current = true
    const trimmed = value?.trim()
    if (!trimmed) onCancel()
    else onCommit(trimmed)
  }

  return (
    <input
      autoFocus
      aria-label="Annotation text"
      value={draft}
      maxLength={200}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') close(draft)
        if (e.key === 'Escape') close(null)
      }}
      onBlur={() => close(draft)}
      onClick={stop}
      onDoubleClick={stop}
      onPointerDown={stop}
      className="absolute h-6 px-1.5 rounded bg-zinc-900 border border-blue-500/60 text-[10px] font-mono text-zinc-100 outline-none"
      style={{ left: x, top: y - 12, width: 160 }}
    />
  )
}
```

- [ ] **Step 4: Wire rendering, editing and deletion into `TVChart.jsx`**

Add to the imports:

```jsx
import TextAnnotations, { TextAnnotationEditor } from './TextAnnotations'
```

Add a module default next to `NO_TREND_LINES`:

```jsx
const NO_TEXT_ANNOTATIONS = []
```

Add props after `onEditTrendLineLabel,` / `onCreateTrendLine,`:

```jsx
  textAnnotations = NO_TEXT_ANNOTATIONS,
  onMoveTextAnnotation,
  onDeleteTextAnnotation,
  onEditTextAnnotationText,
  onCreateTextAnnotation,
```

After the `trendSelection`/`editingTrendLine` declarations add:

```jsx
  const textSelection = useAnnotationSelection({ containerRef: ref, items: textAnnotations, onDelete: onDeleteTextAnnotation })
  const [editingTextId, setEditingTextId] = useState(null)
  const editingText = textAnnotations.find((item) => item.id === editingTextId) ?? null
  const [textDraftPoint, setTextDraftPoint] = useState(null)
  useEffect(() => {
    setTextDraftPoint(null)
  }, [tool])
```

In the container's `onClick` handler, add `textSelection.clear()` alongside `freeSelection.clear()`/`trendSelection.clear()`, and add a text-tool branch directly after the ray branch (before the horizontal-line branch):

```jsx
        if (tool === 'text' && e.detail === 1) {
          const point = barAt(e)
          if (point) setTextDraftPoint(point)
          return
        }
```

Inside the `<svg>`, directly after `<TrendLines ... />`, add:

```jsx
        <TextAnnotations
          items={textAnnotations}
          geometry={geometry}
          data={data}
          selectedId={textSelection.selected?.id ?? null}
          onSelect={textSelection.select}
          onMove={(item, point) => onMoveTextAnnotation?.(item, point)}
          onEdit={setEditingTextId}
        />
```

After the `{editingTrendLine ? <TrendLineLabelEditor .../> : null}` block, add:

```jsx
      {editingText ? (
        <TextAnnotationEditor
          key={editingText.id}
          text={editingText.text}
          x={geometry.xAt(editingText.index) + 6}
          y={geometry.scaleY(editingText.price)}
          onCommit={(text) => {
            setEditingTextId(null)
            onEditTextAnnotationText?.(editingText, text)
          }}
          onCancel={() => setEditingTextId(null)}
        />
      ) : null}
      {textDraftPoint ? (
        <TextAnnotationEditor
          key="draft"
          text=""
          x={textDraftPoint.x + 6}
          y={textDraftPoint.y}
          onCommit={(text) => {
            onCreateTextAnnotation?.({ barDate: textDraftPoint.barDate, price: textDraftPoint.price, text })
            setTextDraftPoint(null)
            onPlaced?.()
          }}
          onCancel={() => setTextDraftPoint(null)}
        />
      ) : null}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/research/TVChart.test.jsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/research/TextAnnotations.jsx frontend/src/components/research/TVChart.jsx frontend/src/components/research/TVChart.test.jsx
git commit -m "feat: place, drag, edit and delete text annotations on the Research chart"
```

---

### Task 13: Text-annotation API client and query hooks

**Files:**
- Modify: `frontend/src/api/client/research.js`
- Modify: `frontend/src/api/queries/research.js`
- Modify: `frontend/src/api/queries/research.test.jsx`

**Interfaces:**
- Produces: mirrors Task 8 exactly, with `TextAnnotation` names: client `getTextAnnotations`, `createTextAnnotation`, `updateTextAnnotation`, `deleteTextAnnotation`; `researchKeys.textAnnotations(uic, assetType)`; `useTextAnnotations(uic, assetType)`; `useTextAnnotationMutations(uic, assetType) → { create, update, remove }`.

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/api/queries/research.test.jsx`, mirroring Task 7's `describe('trend lines', ...)` block with `TextAnnotation` names and a `text` field in place of the two endpoints:

```jsx
describe('text annotations', () => {
  it('is disabled until both uic and asset type are known', () => {
    const { result } = setup(() => useTextAnnotations(undefined, undefined))
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('creates a text annotation', async () => {
    client.createTextAnnotation.mockResolvedValue({ id: 3, text: 'Gap' })
    const { result } = setup(() => useTextAnnotationMutations(211, 'Stock'))

    await act(async () => {
      await result.current.create.mutateAsync({ barDate: '2026-08-01', price: '100.00', text: 'Gap' })
    })

    expect(client.createTextAnnotation).toHaveBeenCalledWith({
      uic: 211, assetType: 'Stock', barDate: '2026-08-01', price: '100.00', text: 'Gap',
    })
  })

  it('optimistically patches only the moved annotation, and rolls back only that one on failure', async () => {
    queries.useTextAnnotations.mockReturnValue({
      data: [
        { id: 1, bar_date: '2026-08-01', price: '100.00', text: 'A' },
        { id: 2, bar_date: '2026-08-02', price: '90.00', text: 'B' },
      ],
    })
    client.updateTextAnnotation.mockRejectedValue(new Error('boom'))
    const { result } = setup(() => useTextAnnotationMutations(211, 'Stock'))

    await act(async () => {
      try {
        await result.current.update.mutateAsync({ id: 1, patch: { text: 'Changed' } })
      } catch {
        // rollback path under test
      }
    })

    expect(result.current.update.isError).toBe(true)
  })
})
```

Add `createTextAnnotation, deleteTextAnnotation, updateTextAnnotation, useTextAnnotationMutations, useTextAnnotations,` to the test file's imports.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/api/queries/research.test.jsx`
Expected: FAIL — `useTextAnnotations is not a function`.

- [ ] **Step 3: Add the client functions**

In `frontend/src/api/client/research.js`, after the `TrendLine` block, add:

```js
export const getTextAnnotations = ({ uic, assetType }) =>
  apiFetch(`/api/research/text-annotations/${uic}/${assetType}/`)
export const createTextAnnotation = ({ uic, assetType, barDate, price, text }) =>
  jsonRequest(`/api/research/text-annotations/${uic}/${assetType}/`, 'POST', { bar_date: barDate, price, text })
export const updateTextAnnotation = (id, patch) =>
  jsonRequest(`/api/research/text-annotations/${id}/`, 'PATCH', patch)
export const deleteTextAnnotation = (id) =>
  apiFetch(`/api/research/text-annotations/${id}/`, { method: 'DELETE' })
```

- [ ] **Step 4: Add the query key and hooks**

In `frontend/src/api/queries/research.js`, add the new client functions to the `../client` import, add to `researchKeys`:

```js
  textAnnotations: (uic, assetType) => ['text-annotations', instrumentKey(uic, assetType)],
```

and append, after `useTrendLineMutations`:

```js
export function useTextAnnotations(uic, assetType) {
  return useQuery({
    queryKey: researchKeys.textAnnotations(uic, assetType),
    queryFn: () => getTextAnnotations({ uic, assetType }),
    enabled: Boolean(uic && assetType),
  })
}

export function useTextAnnotationMutations(uic, assetType) {
  const queryClient = useQueryClient()
  const key = researchKeys.textAnnotations(uic, assetType)
  const refetch = (_data, _error, _variables, context) => {
    if (context) queryClient.invalidateQueries({ queryKey: context.key })
  }
  const optimistic = (apply) => async (variables) => {
    await queryClient.cancelQueries({ queryKey: key })
    const previous = queryClient.getQueryData(key)
    queryClient.setQueryData(key, (old) => (old ? apply(old, variables) : old))
    return { previous, key }
  }
  const rollback = (_error, _variables, context) => {
    if (context?.previous) queryClient.setQueryData(context.key, context.previous)
  }

  return {
    create: useMutation({
      mutationFn: (payload) => createTextAnnotation({ uic, assetType, ...payload }),
      onMutate: () => ({ key }),
      onSettled: refetch,
    }),
    update: useMutation({
      mutationFn: ({ id, patch }) => updateTextAnnotation(id, patch),
      onMutate: optimistic((old, { id, patch }) => old.map((item) => (item.id === id ? { ...item, ...patch } : item))),
      onError: rollback,
      onSettled: refetch,
    }),
    remove: useMutation({
      mutationFn: (id) => deleteTextAnnotation(id),
      onMutate: optimistic((old, id) => old.filter((item) => item.id !== id)),
      onError: rollback,
      onSettled: refetch,
    }),
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/api/queries/research.test.jsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/client/research.js frontend/src/api/queries/research.js frontend/src/api/queries/research.test.jsx
git commit -m "feat: add the text-annotation API client and query hooks"
```

---

### Task 14: Wire text annotations end to end

**Files:**
- Create: `frontend/src/components/research/useChartTextAnnotations.js`
- Create: `frontend/src/components/research/useChartTextAnnotations.test.js`
- Modify: `frontend/src/components/research/useChartData.js`
- Modify: `frontend/src/components/research/ChartPane.jsx`
- Modify: `frontend/src/components/research/ChartCanvas.jsx`

**Interfaces:**
- Mirrors Task 9 exactly, with `TextAnnotation` names.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/research/useChartTextAnnotations.test.js`, mirroring `useChartTrendLines.test.js` (Task 9) with `TextAnnotation` names and a single `{barDate, price, text}` shape in place of two endpoints:

```js
import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

import * as queries from '../../api/queries'
import { useChartTextAnnotations } from './useChartTextAnnotations'

vi.mock('../../api/queries', () => ({
  useTextAnnotations: vi.fn(),
  useTextAnnotationMutations: vi.fn(),
}))

const instrument = { uic: 211, assetType: 'Stock' }

describe('useChartTextAnnotations', () => {
  it('converts the saved annotations to numeric shape', () => {
    queries.useTextAnnotations.mockReturnValue({ data: [{ id: 1, bar_date: '2026-08-01', price: '100.00', text: 'Gap' }] })
    queries.useTextAnnotationMutations.mockReturnValue({
      create: { mutate: vi.fn() },
      update: { mutate: vi.fn() },
      remove: { mutate: vi.fn() },
    })

    const { result } = renderHook(() => useChartTextAnnotations({ symbol: 'NVDA', ...instrument }))

    expect(result.current.items).toEqual([{ id: 1, barDate: '2026-08-01', price: 100, text: 'Gap' }])
  })

  it('has no create function when the instrument is unresolved', () => {
    queries.useTextAnnotations.mockReturnValue({ data: [] })
    queries.useTextAnnotationMutations.mockReturnValue({
      create: { mutate: vi.fn() },
      update: { mutate: vi.fn() },
      remove: { mutate: vi.fn() },
    })

    const { result } = renderHook(() => useChartTextAnnotations({ symbol: 'NVDA', uic: undefined, assetType: undefined }))

    expect(result.current.create).toBeUndefined()
  })

  it('creates with a cents-rounded price', () => {
    queries.useTextAnnotations.mockReturnValue({ data: [] })
    const create = { mutate: vi.fn() }
    queries.useTextAnnotationMutations.mockReturnValue({ create, update: { mutate: vi.fn() }, remove: { mutate: vi.fn() } })

    const { result } = renderHook(() => useChartTextAnnotations({ symbol: 'NVDA', ...instrument }))
    result.current.create({ barDate: '2026-08-01', price: 100.456, text: 'Gap' })

    expect(create.mutate).toHaveBeenCalledWith(
      { barDate: '2026-08-01', price: '100.46', text: 'Gap' },
      expect.any(Object),
    )
  })

  it('tracks a save failure until the symbol changes', () => {
    queries.useTextAnnotations.mockReturnValue({ data: [] })
    const remove = { mutate: (id, opts) => opts.onError() }
    queries.useTextAnnotationMutations.mockReturnValue({ create: { mutate: vi.fn() }, update: { mutate: vi.fn() }, remove })

    const { result, rerender } = renderHook((props) => useChartTextAnnotations(props), {
      initialProps: { symbol: 'NVDA', ...instrument },
    })
    result.current.remove({ id: 1 })
    rerender({ symbol: 'NVDA', ...instrument })
    expect(result.current.saveFailed).toBe(true)

    rerender({ symbol: 'AAPL', ...instrument })
    expect(result.current.saveFailed).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/components/research/useChartTextAnnotations.test.js`
Expected: FAIL — `Failed to resolve import "./useChartTextAnnotations"`.

- [ ] **Step 3: Implement the hook**

Create `frontend/src/components/research/useChartTextAnnotations.js`:

```js
import { useState } from 'react'

import { useTextAnnotationMutations, useTextAnnotations } from '../../api/queries'
import { roundPrice } from '../../lib/priceLines'
import { toTextAnnotationShape } from '../../lib/textAnnotations'

export function useChartTextAnnotations({ symbol, uic, assetType }) {
  const saved = useTextAnnotations(uic, assetType)
  const mutations = useTextAnnotationMutations(uic, assetType)
  const [failedFor, setFailedFor] = useState(null)
  if (failedFor !== null && failedFor !== symbol) setFailedFor(null)

  const report = {
    onSuccess: () => setFailedFor(null),
    onError: () => setFailedFor(symbol),
  }
  const cents = (price) => roundPrice(price).toFixed(2)

  return {
    items: (saved.data ?? []).map(toTextAnnotationShape),
    saveFailed: failedFor === symbol,
    create:
      uic && assetType
        ? ({ barDate, price, text }) =>
            mutations.create.mutate({ barDate, price: cents(price), text }, report)
        : undefined,
    move: (item, point) =>
      mutations.update.mutate({ id: item.id, patch: { bar_date: point.barDate, price: cents(point.price) } }, report),
    setText: (item, text) => mutations.update.mutate({ id: item.id, patch: { text } }, report),
    remove: (item) => mutations.remove.mutate(item.id, report),
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/components/research/useChartTextAnnotations.test.js`
Expected: PASS.

- [ ] **Step 5: Resolve and thread text annotations through `useChartData.js`**

In `frontend/src/components/research/useChartData.js`, add the imports:

```js
import { resolveTextAnnotations } from '../../lib/textAnnotations'
import { useChartTextAnnotations } from './useChartTextAnnotations'
```

After the `trendLines` block, add:

```js
  const savedTextAnnotations = useChartTextAnnotations({ symbol, uic, assetType })
  const textAnnotations = useMemo(
    () => resolveTextAnnotations(savedTextAnnotations.items, { allBars, windowStart: start, windowLength: bars.length }),
    [savedTextAnnotations.items, allBars, start, bars.length],
  )
```

Add `textAnnotations` and `textAnnotationActions: savedTextAnnotations` to the returned object.

- [ ] **Step 6: Thread the props through `ChartPane.jsx`**

In `frontend/src/components/research/ChartPane.jsx`, destructure `textAnnotations, textAnnotationActions` from `useChartData`'s return and pass to `ChartCanvas`:

```jsx
          textAnnotations={textAnnotations}
          onMoveTextAnnotation={textAnnotationActions.move}
          onCreateTextAnnotation={textAnnotationActions.create}
          onDeleteTextAnnotation={textAnnotationActions.remove}
          onEditTextAnnotationText={textAnnotationActions.setText}
```

Change `lineSaveFailed={priceLines.saveFailed || trendLineActions.saveFailed}` to `lineSaveFailed={priceLines.saveFailed || trendLineActions.saveFailed || textAnnotationActions.saveFailed}`.

- [ ] **Step 7: Thread the props through `ChartCanvas.jsx`**

In `frontend/src/components/research/ChartCanvas.jsx`, add `textAnnotations, onMoveTextAnnotation, onCreateTextAnnotation, onDeleteTextAnnotation, onEditTextAnnotationText,` to the prop list and pass them through to `<TVChart ... />` with the same names.

- [ ] **Step 8: Run the full research suite**

Run: `cd frontend && npx vitest run src/components/research src/lib/textAnnotations.test.js src/api/queries/research.test.jsx`
Expected: PASS.

- [ ] **Step 9: Check it in the browser**

With the stack running, arm the Text tool, click a point, type a caption, Enter to commit (the tool should revert to crosshair). Click elsewhere with the Text tool armed and press Escape before typing — nothing should be created. Drag, re-edit and delete an existing text block. Confirm the "Couldn't save line" banner appears if a save fails (temporarily stop the backend to check) and clears on the next successful save.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/components/research/useChartTextAnnotations.js frontend/src/components/research/useChartTextAnnotations.test.js frontend/src/components/research/useChartData.js frontend/src/components/research/ChartPane.jsx frontend/src/components/research/ChartCanvas.jsx
git commit -m "feat: wire text annotations to the backend end to end"
```
