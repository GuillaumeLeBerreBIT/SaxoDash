# Research Chart: Trend Lines (Rays) and Text Annotations — Design

**Status:** Design approved in chat 2026-09-30; spec awaiting user review.

## Problem

The chart's line tool (`lib/priceLines.js`, `PriceLine` model) only draws
full-width horizontal lines — support/resistance, target and stop. There is
no way to mark a *diagonal* support/resistance level (the thing you actually
draw when sketching a pattern by eye), and no way to caption a line or leave
a free note pinned to a point on the chart. The full "drawing tools" item on
`docs/next-steps.md` (trend line, ray, rectangle, Fibonacci, text) is bigger
than what's wanted here — this covers only the two shapes actually used:
a projecting trend line and text.

## Decisions

1. **Ray, not a bounded segment.** You place two points to set the slope;
   the line keeps extending past the second point toward future bars,
   always in the direction of increasing time regardless of click order.
   Unlike TradingView's separate "Trend Line" (stops at its second point)
   and "Ray" tools, only the projecting form is built — that's the useful
   one for support/resistance, and it's what "keeps it simple" means here.
2. **Two new models, siblings to `PriceLine`, not one polymorphic model or
   an extended `PriceLine`.** `TrendLine` and `TextAnnotation` each stay a
   single shape with no fields that are meaningless for the other kind —
   matching how `PriceLine` and `SymbolNote` are already separate.
3. **Anchored by bar date, not pixel or index.** Per the standing rule that
   chart bars are identified by their date, both a ray's endpoints and a
   text block's point store a `bar_date` + `price`, not a raw x position —
   that's what lets them survive a pan, zoom, or range switch instead of
   drifting.
4. **Labels are a field, not a separate feature.** `PriceLine` gains an
   optional `label` (so an existing horizontal line can be captioned too);
   `TrendLine` is born with one. Set/edited by double-clicking the line —
   no dedicated "add label" tool.
5. **Same interaction language as today's freeform lines.** Click-to-select,
   Delete/Backspace to remove, drag to move — the rail just gets two more
   tools alongside Crosshair and Horizontal line.
6. **Out of scope for this round** (see also "Out of scope" below): a
   bounded (non-projecting) trend-line variant, channels, rectangle/Fib/
   text-block styling, scripting, alerts when a line is crossed, and
   dragging a ray by its middle (only its two endpoints are draggable).

## Phase 1 — Ray tool and line labels

### Backend (`research` app)

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
```

Migration `0008_trendline.py`, plus `0009_priceline_label.py` adding
`PriceLine.label` (same field definition as above). Both run against the
dev database (`manage.py migrate`), not just the test suite.

Serializer validation: `start_price` and `end_price` must be `> 0`;
`start_bar_date != end_bar_date` is rejected (a ray needs two distinct bars
to have a slope — the frontend also refuses to commit a same-bar second
click, so this is a backstop, not the primary UX guard). `PriceLineSerializer`
adds `label` as a normal optional field alongside `price`.

Endpoints, authenticated, no throttle (local writes, no third-party call),
mirroring `price-lines/`:

- `GET/POST /api/research/trend-lines/<uic>/<asset_type>/`
- `PATCH/DELETE /api/research/trend-lines/<id>/`

`POST` body: `{start_bar_date, start_price, end_bar_date, end_price}`.
`PATCH` accepts any subset of those four plus `label`, so dragging an
endpoint and editing the label are separate calls.

### Frontend geometry (`lib/trendLines.js`, new — mirrors `lib/priceLines.js`)

Each fetched bar already carries its trading date (used for the x-axis
labels today). `indexForDate(data, date)` does a direct lookup against the
*full* fetched dataset (not the windowed slice) and returns the bar's index,
or `null` if that date isn't present — same treatment as `PriceLine`'s
`edgeOf` gives an out-of-range price: the annotation renders nothing rather
than guessing.

To draw a ray:

```js
function rayGeometry({ data, offset, line, geometry }) {
  const i1 = indexForDate(data, line.start_bar_date)
  const i2 = indexForDate(data, line.end_bar_date)
  if (i1 == null || i2 == null) return null

  const [iEarly, iLate] = i1 < i2 ? [i1, i2] : [i2, i1]
  const [pEarly, pLate] = i1 < i2 ? [line.start_price, line.end_price] : [line.end_price, line.start_price]
  const slope = (pLate - pEarly) / (iLate - iEarly)  // price per bar-index step

  const edgeIndex = data.length - 1
  const edgePrice = pEarly + slope * (edgeIndex - iEarly)

  return {
    x1: geometry.xAt(iEarly - offset), y1: geometry.scaleY(pEarly),
    x2: geometry.xAt(edgeIndex - offset), y2: geometry.scaleY(edgePrice),
  }
}
```

Extrapolation is in equal per-bar-slot steps (matching every other
bar-indexed overlay, like VWAP), not calendar time — sidesteps guessing
future trading-day spacing. `offset` re-bases the full-dataset index against
whatever window is currently visible (`lib/timeWindow.js`), so panning moves
the ray correctly using the same `xAt`/`scaleY` the candles use.

If `edgePrice` at the current window's right edge falls outside the visible
price range, nothing renders — a ray's value constantly changes, so unlike
a horizontal line there's no single "above/below range" edge marker that
would mean anything.

### Interaction (`ChartToolRail.jsx`, `TVChart.jsx`)

- `placingLine` (boolean) becomes `tool`: `'crosshair' | 'hline' | 'ray' | 'text'`.
  Rail gets two more buttons (a diagonal-line icon for Ray, `Type` icon for
  Text from `lucide-react`), same exclusive-pressed styling as today.
- **Placing a ray:** first click records `{bar_date, price}` under the
  pointer; the pointer moving after that draws a live preview line to the
  current position; a second click commits (`POST`) using both points, with
  same-bar-date second clicks ignored (no-op, stays in placing mode) rather
  than committing a degenerate ray. Escape cancels the first point.
- **Selecting/dragging:** clicking a ray selects it (thicker stroke, same
  as freeform horizontal lines). Each endpoint gets its own small draggable
  handle (~10px hit target, matching `HIT_WIDTH` on today's lines);
  dragging one re-runs `indexForDate`/`priceAtY` for that end only and
  `PATCH`es just that endpoint. Delete/Backspace removes the selected ray
  (same ignore-while-typing guard `TVChart.jsx` already has).
- **Labels:** double-clicking a ray or horizontal line (anywhere along it,
  not just an endpoint) opens the same small `<input>`-over-the-chart
  pattern `PriceEditor` already uses, pre-filled with the current label;
  Enter/blur saves, Escape cancels. Empty stays a normal unlabeled line.

## Phase 2 — Text annotations

### Backend

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
```

Migration `0010_textannotation.py`. Same auth/throttle posture as the other
two models:

- `GET/POST /api/research/text-annotations/<uic>/<asset_type>/`
- `PATCH/DELETE /api/research/text-annotations/<id>/`

`text` blank is rejected (an empty text block is pointless — the frontend
also never commits an empty placement, this is the backstop).

### Frontend

- `lib/textAnnotations.js`: reuses `indexForDate` from `trendLines.js`;
  placement is a single point, no slope math, so this is the smaller half.
- **Placing:** click with Text tool armed records `{bar_date, price}` and
  opens the same inline `<input>`-over-the-chart pattern used for labels,
  empty this time; Enter/blur with non-blank text `POST`s and shows the
  committed text at that point; Escape (or blur while still blank) cancels
  without creating anything.
- **Selecting/editing/deleting:** click to select (highlight), drag to move
  (updates `bar_date`+`price` via `PATCH`), a second click while selected
  (or double-click) reopens the inline editor to change the text,
  Delete/Backspace removes it — identical lifecycle to a ray, just one
  point instead of two.
- Off-screen rule matches the ray: `indexForDate` returning `null` means it
  doesn't render, no edge marker (a point, unlike a horizontal line, has no
  natural "above/below the visible range" direction to badge).

## Error handling

Same rule the existing `PriceLine`/target/stop lines already follow: a
failed `POST`/`PATCH`/`DELETE` drops the local optimistic change and
invalidates the query, snapping the UI back to whatever is actually
persisted. `ChartPanel`'s existing "Couldn't save line" text covers ray and
text-annotation mutation failures too — one shared error surface, not a new
one per annotation type.

## Testing

Backend (`research` `APITestCase`s, one file per model, matching the
existing `PriceLine` tests):

- `TrendLine`: list scoped to uic+asset_type; create takes uic/asset_type
  from the URL; `start_bar_date == end_bar_date` rejected; either price
  `<= 0` rejected; `PATCH` can change one endpoint or the label
  independently; `DELETE` removes; unauthenticated rejected.
- `TextAnnotation`: same list/create/PATCH/DELETE/auth coverage; blank
  `text` rejected.
- `PriceLineSerializer`: `label` round-trips, still optional.

Frontend (vitest):

- `trendLines.js`: `indexForDate` hits and misses; `rayGeometry` picks the
  later bar to extrapolate past regardless of click order; extrapolated
  point math; off-screen (`null` index, or projected price outside range)
  returns nothing to render.
- `textAnnotations.js`: equivalent off-screen/placement math, minus slope.
- Component-level: placing a ray takes two clicks and a same-date second
  click is a no-op; Delete removes a selected ray/text block but not while
  an input has focus (same guard as today); a label edit opens pre-filled
  and empty stays unlabeled.
- Drag gestures verified by hand in the browser, per the working agreement
  on UI changes (jsdom pointer capture isn't worth faking) — consistent
  with how the original price-line drag work was verified.

## Out of scope

- A bounded (non-projecting) trend-line variant and channels (parallel
  trend lines) — explicitly deferred from the earlier next-steps
  discussion.
- Rectangle, Fibonacci, and any other drawing-tool shape.
- Per-line colour/style customisation beyond the fixed neutral colour
  freeform lines already use.
- Dragging a ray by its body to translate both endpoints at once — only
  the two endpoint handles are draggable in this round.
- Price alerts when a ray or level is crossed.
- Scripting / technical scoring — a distinct, later feature discussed
  separately, not part of this spec.
