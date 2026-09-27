# Chart Annotation Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three deferred findings from the chart-annotations branch: an unvalidated `asset_type` URL segment, price-line badges overflowing at prices ≥ 10,000, and badges blocking the price-axis drag.

**Architecture:** One backend routing change (regex route), one pure formatting helper in `lib/priceLines.js`, and a change of ownership in the price-axis gutter: the gutter rect (`ScaleHandle` in `TVChart.jsx`) becomes the single pointer surface for the gutter — drag scales, a click without movement opens the editor of the line whose badge is under the pointer — and badges stop receiving pointer events.

**Tech Stack:** Django + DRF (`research` app), React 19 + vitest/jsdom/Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-27-chart-annotations-design.md` (the feature), plus the design approved in chat on 2026-09-27, restated here:
1. The price-lines list/create route accepts only asset types matching `[A-Za-z]{1,20}`; anything else is a 404 at routing.
2. Price-line badges and edge markers show a price ≥ 10,000 without decimals (`T 12346`); below that, 2 decimals as today. The exact-value editor still shows 2 decimals. Last-price and crosshair badges are unchanged (no tag, fit until 100,000).
3. Badges stop catching the pointer. In the gutter: drag past 3px scales the axis; a click without movement on a line's badge opens that line's editor; a click on bare axis does nothing; a double-click resets the scale.

## Global Constraints

- Generated code carries **zero comments** (AGENTS.md). Existing comments in touched files stay as they are.
- Backend tests: `cd backend && .venv/bin/python manage.py test research`. Frontend tests: `cd frontend && npx vitest run <path>`; lint `cd frontend && npx eslint <files>`.
- jsdom has no `setPointerCapture`: call it as `e.currentTarget.setPointerCapture?.(e.pointerId)`. jsdom's `getBoundingClientRect()` returns zeros, so in tests `clientY` equals the SVG-local y.
- jsdom does not apply CSS `pointer-events`; `fireEvent` on an element with `pointerEvents="none"` still dispatches. Tests of gutter behaviour must fire on `[data-testid="price-scale"]`, not on a badge.
- Commit on the current branch `fix/chart-annotation-polish`; never push.

## Review Focus

1. **A 3px-or-less wobble on the axis is a click, not a scale.** Pressing a badge with a tiny wobble must open the editor and leave `yScale` untouched. → Task 3 test "treats a press with a tiny wobble on a badge as a click".
2. **Clicking the gutter where there is no badge does nothing** — no editor, no scale change. → Task 3 test "does nothing on a click on bare axis".
3. **Lines without a scale handler.** A chart given `lines` but no `onYScaleChange` must still let the user open a badge's editor. → Task 3 test "opens a badge editor even when the scale cannot change".
4. **Off-screen lines have no badge to click.** A click at the gutter's top edge where an edge marker sits must not open an editor for the off-screen line. → Task 3 test "does not open an editor for an off-screen line".
5. **Exactly 10,000.** The boundary is inclusive: `10000` shows `10000`, `9999.99` shows `9999.99`. → Task 2 `badgePrice` tests.

---

### Task 1: Only letters in the price-line asset-type segment

**Files:**
- Modify: `backend/research/urls.py`
- Test: `backend/research/test_price_lines.py`

**Interfaces:**
- Produces: `GET/POST /api/research/price-lines/<uic>/<asset_type>/` matches only when `asset_type` is 1–20 ASCII letters; otherwise Django answers 404. The URL name `research-price-lines` and view `PriceLineListCreateView` are unchanged.

- [ ] **Step 1: Write the failing tests** — append inside `class PriceLineAPITest`:

```python
    def test_rejects_an_asset_type_that_is_not_letters(self):
        for asset_type in ('Stock1', 'Cfd-On-Stock', 'Stock%20X'):
            with self.subTest(asset_type=asset_type):
                response = self.client.get(f'/api/research/price-lines/211/{asset_type}/')

                self.assertEqual(response.status_code, 404)

    def test_rejects_an_asset_type_longer_than_twenty_letters(self):
        response = self.client.post(
            f'/api/research/price-lines/211/{"A" * 21}/', {'price': '1.00'}, format='json'
        )

        self.assertEqual(response.status_code, 404)
        self.assertFalse(PriceLine.objects.exists())

    def test_accepts_a_saxo_asset_type_of_exactly_twenty_letters(self):
        response = self.client.post(
            f'/api/research/price-lines/211/{"A" * 20}/', {'price': '1.00'}, format='json'
        )

        self.assertEqual(response.status_code, 201)

    def test_accepts_a_compound_saxo_asset_type(self):
        PriceLine.objects.create(uic=211, asset_type='CfdOnStock', price=Decimal('10.00'))

        response = self.client.get('/api/research/price-lines/211/CfdOnStock/')

        self.assertEqual([line['price'] for line in response.data], ['10.00'])
```

- [ ] **Step 2: Run** `cd backend && .venv/bin/python manage.py test research.test_price_lines` — expect the two rejection tests to FAIL (200/201 instead of 404).

- [ ] **Step 3: Implement** — in `backend/research/urls.py` change the import to `from django.urls import path, re_path` and replace the `price-lines/<int:uic>/<str:asset_type>/` entry with:

```python
    re_path(
        r'^price-lines/(?P<uic>[0-9]+)/(?P<asset_type>[A-Za-z]{1,20})/$',
        PriceLineListCreateView.as_view(),
        name='research-price-lines',
    ),
```

`uic` now arrives as a string; `PriceLine.objects.filter(uic=...)` and `serializer.save(uic=...)` coerce it, and the existing `test_create_takes_the_instrument_from_the_url` asserts the stored value is `211` — confirm it still passes.

- [ ] **Step 4: Run** `cd backend && .venv/bin/python manage.py test research` — all pass.

- [ ] **Step 5: Commit** `git commit -m "fix: only accept a letters-only asset type in the price-line URL"`

---

### Task 2: Badges fit prices of 10,000 and above

**Files:**
- Modify: `frontend/src/lib/priceLines.js`, `frontend/src/components/research/PriceLines.jsx`
- Test: `frontend/src/lib/priceLines.test.js`, `frontend/src/components/research/TVChart.test.jsx`

**Interfaces:**
- Produces: `badgePrice(price: number): string` exported from `lib/priceLines.js` — `price >= 10000 ? price.toFixed(0) : price.toFixed(2)`.

- [ ] **Step 1: Failing tests** — in `priceLines.test.js` add `badgePrice` to the import and:

```js
describe('badgePrice', () => {
  it('keeps cents below ten thousand', () => {
    expect(badgePrice(9999.99)).toBe('9999.99')
    expect(badgePrice(0.5)).toBe('0.50')
  })

  it('drops the decimals from ten thousand up so the badge fits', () => {
    expect(badgePrice(10000)).toBe('10000')
    expect(badgePrice(12345.67)).toBe('12346')
  })
})
```

In `TVChart.test.jsx`, inside `describe('price lines')`, add a test rendering the chart with bars scaled to the 12,000s so the line is on-screen. Build them locally in the test: `const bigBars = bars.map((b) => ({ ...b, open: b.open * 100, high: b.high * 100, low: b.low * 100, close: b.close * 100 }))`, render `renderChart({ data: bigBars, ind: computeIndicators(bigBars), lines: [{ id: 'target', kind: 'target', price: 12345.67 }] })`, and assert `getByTestId('price-badge-target').textContent === 'T 12346'`. Add a second assertion for an edge marker: same `bigBars`, `lines: [{ id: 'stop', kind: 'stop', price: 99999.5 }]` (above the ~14,000 domain, so it renders as an edge marker) → assert `getByTestId('price-edge-stop').textContent === '100000'` (`(99999.5).toFixed(0)` rounds up).

- [ ] **Step 2: Run** the two test files — expect FAIL (`badgePrice` missing; badge shows `T 12345.67`).

- [ ] **Step 3: Implement** — add to `lib/priceLines.js`:

```js
export function badgePrice(price) {
  return price >= 10000 ? price.toFixed(0) : price.toFixed(2)
}
```

In `PriceLines.jsx` import `badgePrice`; the `Badge` text becomes ``{`${TAG[line.kind]} ${badgePrice(price)}`.trim()}`` and the `EdgeMarker` text becomes `{badgePrice(line.price)}`. `PriceEditor` keeps `line.price.toFixed(2)`.

- [ ] **Step 4: Run** both files, then the full frontend suite, then eslint on the three touched source/test files.

- [ ] **Step 5: Commit** `git commit -m "fix: fit price-line badges at prices of ten thousand and up"`

---

### Task 3: The gutter owns every press — drag scales, click on a badge edits

**Files:**
- Modify: `frontend/src/components/research/TVChart.jsx` (`ScaleHandle`, `TVChart`), `frontend/src/components/research/PriceLines.jsx` (`Badge`, `PriceLines`, `DraggableLine` props)
- Test: `frontend/src/components/research/TVChart.test.jsx`

**Interfaces:**
- Consumes: `edgeOf` from `lib/priceLines.js`; `geometry.scaleY`.
- Produces:
  - `ScaleHandle({ width, height, yScale, onChange, onClickAt })` renders `rect[data-testid="price-scale"]` whenever `onChange` or `onClickAt` is given. `onClickAt(y: number)` receives the SVG-local y of a press released without moving more than 3px.
  - `Badge` renders with `pointerEvents="none"` and no event handlers; its `data-testid="price-badge-<id>"` stays for rendering assertions. `PriceLines`/`DraggableLine` no longer take `onEdit`.
  - `TVChart` passes `onClickAt` to `ScaleHandle` when `lines.length > 0`; it opens the editor of the on-screen line whose `geometry.scaleY(price)` is closest to `y` and within 8px (half the badge height); otherwise nothing happens.

**Behaviour to implement in `ScaleHandle`:**
- `pointerdown`: `setPointerCapture?.`, record `{ y: e.clientY, scale: yScale, moved: false }`.
- `pointermove`: if no drag, return. `dy = e.clientY - start.y`. If not yet moved and `Math.abs(dy) < 3`, return. Set `moved = true`; if `onChange`, call `onChange(scaleFromDrag(start.scale, dy))`.
- `pointerup`: read and clear the drag; if it existed and never moved and `onClickAt`, call `onClickAt(e.clientY - e.currentTarget.closest('svg').getBoundingClientRect().top)`.
- `pointercancel`: clear the drag.
- `dblclick`: `stopPropagation()`; if `onChange`, `onChange(1)`.
- Render nothing when both `onChange` and `onClickAt` are absent.

- [ ] **Step 1: Update and add tests** in `TVChart.test.jsx`:
  - Add a helper in `describe('price lines')`: `const clickGutter = (utils, y) => { const g = utils.getByTestId('price-scale'); fireEvent.pointerDown(g, { clientY: y, pointerId: 1 }); fireEvent.pointerUp(g, { clientY: y, pointerId: 1 }) }`.
  - Rewrite the three existing editor tests ("saves an exact price typed into the badge editor", "cancels the editor on text that is not a price", "does not save on Escape even when the field then blurs") to open the editor with `clickGutter(utils, yOf(stop.price))` instead of clicking `price-badge-stop`. Their other assertions stay unchanged.
  - In `describe('price-axis scaling')`, the "has no scale handle unless the parent can change the scale" test stays as-is (no lines, no `onYScaleChange`).
  - New tests:
    - "starts a scale drag on top of a badge" — `renderChart({ lines: [stop], onYScaleChange, yScale: 1 })`; on `price-scale`, pointerDown at `yOf(stop.price)`, pointerMove to `+60`, pointerUp → `onYScaleChange` last call `> 1`, and no `Line price` input in the document.
    - "treats a press with a tiny wobble on a badge as a click" — pointerDown at `yOf(stop.price)`, pointerMove to `+2`, pointerUp → `onYScaleChange` not called, `Line price` input present with value `'105.00'`.
    - "does nothing on a click on bare axis" — with `lines: [stop]` and `onYScaleChange`, `clickGutter` at a y ≥ 40px away from `yOf(stop.price)` (pick `yOf(stop.price) > 200 ? 30 : 330`) → no `Line price` input, `onYScaleChange` not called.
    - "opens a badge editor even when the scale cannot change" — `renderChart({ lines: [stop] })` (no `onYScaleChange`), `clickGutter` at `yOf(stop.price)` → `Line price` input present.
    - "does not open an editor for an off-screen line" — `lines: [{ ...target, price: 1000 }]`, `clickGutter` at `16` (where the top edge marker sits) → no `Line price` input.
    - "picks the nearest badge when two overlap" — `lines: [target, { ...stop, price: target.price - 0.5 }]`; `clickGutter` at `yOf(target.price)` → the editor shows `'110.00'`.

- [ ] **Step 2: Run** `cd frontend && npx vitest run src/components/research/TVChart.test.jsx` — expect the rewritten and new tests to FAIL.

- [ ] **Step 3: Implement** per the Interfaces and Behaviour above. In `PriceLines.jsx`, `Badge` loses `onEdit` and its handlers and gains `pointerEvents="none"` on its `<g>`; drop the `onEdit` prop from `DraggableLine` and `PriceLines`. In `TVChart.jsx`, remove `onEdit` from the `PriceLines` element, import `edgeOf`, and add:

```jsx
  const editAt = (y) => {
    let nearest = null
    for (const line of lines) {
      if (edgeOf(line.price, geometry)) continue
      const distance = Math.abs(geometry.scaleY(line.price) - y)
      if (distance <= 8 && (!nearest || distance < nearest.distance)) nearest = { line, distance }
    }
    if (nearest) setEditingId(nearest.line.id)
  }
```

(defined after the early `return null`, alongside `plotY`), and render `<ScaleHandle width={width} height={height} yScale={yScale} onChange={onYScaleChange} onClickAt={lines.length > 0 ? editAt : undefined} />`.

- [ ] **Step 4: Run** the TVChart tests, the full frontend suite, and eslint on `TVChart.jsx`, `PriceLines.jsx`, `TVChart.test.jsx`.

- [ ] **Step 5: Commit** `git commit -m "fix: let the price axis drag through line badges and open their editor on click"`
