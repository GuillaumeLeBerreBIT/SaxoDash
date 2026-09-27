# Research Chart: Price-Axis Scaling and Price Lines — Design

**Status:** Design approved in chat 2026-09-27; spec awaiting user review.

## Problem

The Research price chart (`frontend/src/components/research/TVChart.jsx`) is
read-only. Its vertical scale is fixed to the visible bars' high/low plus 7%
padding (`priceGeometry` in `lib/chartGeometry.js`), and the thesis levels the
user has already written down — `SymbolNote.target_price`, and a stop level
that today only exists as free text in `sell_trigger` — are never drawn
against price. There is also no way to mark a support/resistance level.

Parked on 2026-09-25 as "for after the basics are done"; picked up now.

## Decisions

1. **Three phases, shipped in order.** (1) drag the price axis to stretch or
   compress the vertical scale; (2) target and stop as draggable lines tied to
   `SymbolNote`; (3) freeform horizontal price lines. Each phase is usable on
   its own. Phase 1 comes first because phases 2–3 rely on it to bring an
   off-screen line into view.
2. **The price scale stays bars-only.** Annotation prices do *not* widen the
   automatic domain — a target 3× the current price would crush the candles
   into a sliver. A line outside the visible range is shown as an edge marker
   (see Phase 2) and the user drags the axis to reach it.
3. **Editing is drag plus an exact-value input.** Dragging is for quick
   placement; clicking a line's price badge on the axis opens an input for an
   exact price.
4. **Autosave on drop.** Releasing a drag saves immediately — no confirm step.
5. **Freeform lines are created by double-clicking the plot, uncapped,
   plain price only (no label).** Click to select, Delete/Backspace to remove.
6. **Keying.** `stop_price` lives on `SymbolNote`, which is keyed by `symbol`
   like `target_price` already is. The new `PriceLine` model is keyed by
   **`uic` + `asset_type`**, per the AGENTS.md rule that an instrument is a
   uic *and* an asset type: `NVDA:xnas` and `NVDA:xetr` trade at different
   prices, so a level drawn on one does not belong on the other.
7. **`sell_trigger` stays.** It is the *reason* to sell; `stop_price` is the
   *level*. Both remain editable in `SymbolNotesCard`.
8. **Axis scaling is view state, not persisted.** It resets when the symbol
   changes and survives range/type changes.

## Phase 1 — Price-axis scaling

### Geometry (`lib/chartGeometry.js`)

`priceGeometry` takes a new `yScale` argument (default `1`). After computing
the automatic `top`/`bottom`, it rescales them around their midpoint:

```
mid  = (top + bottom) / 2
half = (top - bottom) / 2 * yScale
top' = mid + half ; bottom' = mid - half
```

`yScale > 1` compresses the candles (more price range visible); `< 1`
stretches them. Ticks already derive from `top`/`bottom`, so they follow.

A new pure helper `scaleFromDrag(startScale, dy)` returns
`clamp(startScale * exp(dy / 150), 0.1, 20)` — dragging down compresses,
dragging up stretches, matching TradingView's price-scale feel. The geometry
object also gains `priceAtY(y)`, the inverse of `scaleY`
(`top - ((y - PAD_T) / chartH) * (top - bottom)`), which Phases 2–3 need.

### State

`yScale` joins the chart controls in `useChartControls` (alongside `range`,
`type`, `overlays`, `panes`) with a `setYScale`. `Research.jsx` resets it to
`1` when `symbol` changes, next to where it already clears the stale hover
index.

### Interaction (`TVChart.jsx`)

- A transparent `<rect>` covers the axis gutter (the `PAD_R` strip) with
  `cursor: ns-resize`. `pointerdown` captures the pointer and records the
  start y and start scale; `pointermove` calls
  `setYScale(scaleFromDrag(start, dy))`; `pointerup` releases.
- Double-clicking the gutter resets `yScale` to `1`.
- Stretched candles would draw over the padding and the lower panes, so the
  plot content (candles/bars/line/area, overlays, earnings markers) is wrapped
  in an SVG `<clipPath>` sized to the plot area. The axis labels and the
  last-price badge stay outside the clip.
- The hover crosshair's `onMouseMove` stays on the wrapper; moving over the
  gutter is fine as today.

## Phase 2 — Target and stop lines

### Backend

- `SymbolNote.stop_price = DecimalField(max_digits=12, decimal_places=2,
  null=True, blank=True)` — same shape as `target_price`. One migration
  (`0006_symbolnote_stop_price`), run against the dev database, not only the
  test suite.
- `SymbolNoteSerializer` exposes `stop_price`. No new endpoint: the existing
  `PATCH /api/research/notes/<symbol>/` carries it.
- Serializer validation: `target_price` and `stop_price` must be `> 0` when
  present.

### Frontend

- `SymbolNotesCard` gains a "Stop price" numeric field next to "Target
  price", saved through the same `onSave` path.
- New `components/research/PriceLines.jsx`, rendered inside `TVChart`'s SVG
  after the chart body and before the crosshair. It receives `geometry`,
  `width`, the line list, and callbacks; it fetches nothing.
- `ChartPanel` receives `note`, `onSaveNote` and `currency` from `Research.jsx`
  (which already owns `useSymbolNote` / `useSymbolNoteMutation`) and passes the
  derived lines into `TVChart`.
- Target and stop lines use their own colours from the existing chart
  tokens (target: `POSITIVE`, stop: `NEGATIVE`, both dashed), each with a
  "T"/"S" tag plus a price badge in the axis gutter, like the last-price
  badge.
- **Drag:** `pointerdown` within 5px of a line's y (on the plot, not the
  gutter) starts a drag on that line and captures the pointer; `pointermove`
  updates a local preview price via `geometry.priceAtY`; `pointerup` rounds to
  2 dp, clamps to `> 0`, and calls `onSaveNote({ target_price })` or
  `onSaveNote({ stop_price })`. The preview price stays until the refetched
  note arrives, so the line does not flicker back.
- **Exact value:** clicking a line's badge opens an absolutely positioned HTML
  `<input>` over the badge (not a `foreignObject`); Enter saves, Escape or blur
  without a change cancels.
- **Off-screen:** a line whose price is above `top` or below `bottom` renders
  as a small arrow plus price pinned to the top or bottom edge of the gutter
  instead of the line. It is not draggable in that state.
- Clearing a target or stop happens in `SymbolNotesCard` (empty the field),
  not on the chart. They are thesis data, not standalone annotations.
- Target/stop are keyed by symbol, so they appear on every listing of that
  ticker. That is correct for thesis levels and matches the model.

## Phase 3 — Freeform price lines

### Backend (`research` app)

```python
class PriceLine(models.Model):
    uic = models.PositiveIntegerField()
    asset_type = models.CharField(max_length=20)
    price = models.DecimalField(max_digits=12, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']
        indexes = [models.Index(fields=['uic', 'asset_type'])]
```

Single-tenant like `Watchlist` and `SymbolNote` — no user FK. `price > 0`
enforced in the serializer.

Endpoints, both authenticated like the rest of `research`, no throttle (local
writes, no third-party call):

- `GET  /api/research/price-lines/<uic>/<asset_type>/` — lines for that
  instrument.
- `POST /api/research/price-lines/<uic>/<asset_type>/` — `{price}`; uic and
  asset type come from the URL, not the body.
- `PATCH  /api/research/price-lines/<id>/` — `{price}` only.
- `DELETE /api/research/price-lines/<id>/`.

### Frontend

- `api/client` gets `getPriceLines`, `createPriceLine`, `updatePriceLine`,
  `deletePriceLine`; `api/queries/research.js` gets `usePriceLines(uic,
  assetType)` (disabled until both are known) and create/update/delete
  mutations that invalidate `researchKeys.priceLines(uic, assetType)`.
- `Research.jsx` calls `usePriceLines(instrument?.uic, instrument?.assetType)`
  and passes lines plus handlers down through `ChartPanel` to `PriceLines`.
  No instrument resolved → no freeform lines and double-click does nothing.
- Freeform lines are drawn in the neutral axis colour, solid, 1px, with a
  price badge in the gutter. Drag, exact-value input, and off-screen markers
  behave exactly as for target/stop.
- **Create:** double-clicking the plot where no line is within 5px POSTs a
  line at `geometry.priceAtY(y)`, rounded to 2 dp.
- **Select:** clicking a freeform line selects it (thicker stroke + highlighted
  badge); clicking empty plot or pressing Escape deselects.
- **Delete:** while a line is selected, a `keydown` listener on `window`
  handles Delete/Backspace — **ignored when focus is in an `input`,
  `textarea` or `contenteditable`**, so typing in the thesis form never
  deletes a line. Target/stop are not selectable for deletion.
- Selection clears when the symbol changes.

## Error handling

The app has no toast system and the thesis form ignores save failures today.
For the chart:

- A failed PATCH/POST/DELETE drops the local preview and invalidates the
  relevant query, so the line snaps back to the persisted price.
- `ChartPanel`'s toolbar shows a small red "Couldn't save line" text while
  any line mutation is in its error state; it clears on the next successful
  mutation or symbol change.
- A 404 on PATCH/DELETE (line removed elsewhere) is handled the same way: the
  refetch drops it.

## Testing

Backend (`research` `APITestCase`s):

- `stop_price` round-trips through `PATCH /notes/<symbol>/`; `<= 0` is
  rejected for both target and stop; clearing to `null` works.
- `PriceLine`: list is scoped to the URL's uic + asset type (a line on
  `CfdOnStock` for the same uic does not appear under `Stock`); create takes
  uic/asset type from the URL and ignores them in the body; PATCH changes
  only `price`; DELETE removes; `price <= 0` rejected; unauthenticated
  requests rejected.

Frontend (vitest):

- `chartGeometry`: `priceAtY(scaleY(p)) ≈ p`; `yScale` widens and narrows
  `top`/`bottom` around the same midpoint; `scaleFromDrag` direction and
  clamping.
- `PriceLines`: renders target, stop and freeform lines at the right y;
  renders an off-screen marker instead of a line for an out-of-range price;
  Delete key removes the selected line but not when an input has focus.
- `SymbolNotesCard`: stop field saves `stop_price`.
- Drag gestures are verified by hand in the browser (jsdom pointer capture is
  not worth faking), per the working agreement on UI changes.

## Out of scope

- Vertical panning of the price scale (scale only, around the midpoint).
- Persisting `yScale` across sessions or symbols.
- Labels on freeform lines, colours per line, diagonal trend lines.
- Price alerts when a line is crossed. `stop_price` makes this possible later.
- Showing lines anywhere other than the Research price pane.
