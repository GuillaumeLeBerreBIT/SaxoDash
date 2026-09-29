# Axis panning — design

Date: 2026-09-29
Branch: `feat/axis-panning` (worktree `../SaxoDash-axis-panning`, cut from `main`)
Status: approved in brainstorming, awaiting spec review

## Goal

Make the Research chart feel like a real charting tool: move the price scale up and
down, and go back through history, by dragging or horizontal scrolling. Applies to
both the Research page chart and the `/research/chart` big view — they share
`ChartCanvas` / `TVChart`.

Success means: panned to any position, the candles, overlays (MA/EMA/BB/VWAP),
volume, RSI, MACD, earnings markers, crosshair, OHLC legend and time labels all agree
on which bars are shown; indicators at the left edge still have values; dragging and
placing price lines keeps working exactly as today.

## Scope decisions

- **History limit: only what is already fetched.** The chart fetches 1,200 daily bars
  once (Saxo's per-call ceiling, `CHART_MAX_COUNT`, ~4¾ years). Panning moves within
  that. No backend change, no extra Saxo calls. Loading older pages on demand
  (`Mode=UpTo` + `Time`) is a possible later extension and not part of this work.
- **Gestures: the TradingView model.**
  - Drag empty chart body → pan both axes (horizontal = time, vertical = price).
  - Drag time axis → pan time.
  - Drag price axis → zoom price (unchanged).
  - Horizontal wheel / trackpad swipe (and Shift+wheel) → pan time. A vertical wheel
    is never captured, so the page keeps scrolling.
- **Bars stay daily or coarser.** Nothing about bar identity changes (see AGENTS.md
  "Chart bars are identified by their date").
- **Whole-bar steps.** Time pans in integer bars. On 1W/1M a bar is wide, so a drag
  visibly steps; sub-bar smooth panning is a possible follow-up.

## State and data flow

- `useChartControls` gains two in-memory values beside `yScale` (none of them are
  written to chart prefs):
  - `timeOffset` — integer ≥ 0, bars back from the newest bar.
  - `yShift` — float, fraction of the visible price span; 0 = auto-centred.
- New pure helper in `lib/research.js`:
  `visibleWindow(total, range, timeOffset) → { start, end }`, with
  `count = RANGE_COUNTS[range]` and the offset clamped to `[0, max(0, total − count)]`.
  You cannot pan past the oldest bar or into the future; when `count ≥ total`
  (e.g. ALL) the window cannot move. `barsForRange` is re-expressed through it with
  offset 0 and keeps its behaviour.
- `computeIndicatorsForRange(allBars, window)` computes every series over the full
  history and slices it to `[start, end)` instead of the tail. VWAP stays anchored to
  the visible window (it restarts at `start`), as it is anchored to the visible range
  today. `computeIndicators(bars)` keeps its signature.
- `useChartData({ symbol, instrument, range, timeOffset })` returns `bars` and `ind`
  already sliced to the window. Earnings markers map onto `bars` and follow for free.
  Everything downstream keeps receiving "the visible bars", so index `i` means the
  same bar in every pane, the crosshair and the markers.
- `priceGeometry({ …, yScale, yShift })`: after the existing `yScale` expansion,
  `top` and `bottom` both move by `yShift × (top − bottom)`. The auto-fit still comes
  from the visible bars only (AGENTS.md: "The Research price scale is the bars', not
  the annotations'").
- Resets:
  - Choosing a range pill → `timeOffset = 0`, `yShift = 0` (snap to latest).
  - Double-click price axis → `yScale = 1`, `yShift = 0` (today it resets `yScale` only).
  - Double-click time axis → `timeOffset = 0`.
  - Symbol change → all three reset, by the same mechanism `yScale` resets today.
- The OHLC legend with no hover shows the last *visible* bar
  (`bars[bars.length − 1]`, as it does already).

## Gestures in detail

The chart body already owns three click behaviours that panning must not break:
click deselects a selected line; click with the line tool armed places a line;
double-click on empty area creates a line. Existing lines handle their own pointer
events and `stopPropagation`, so a line drag never reaches the body.

- **Body drag** (a `usePan` hook on the `TVChart` wrapper):
  - `pointerdown`, left button, on empty chart area (not the price gutter, not a
    line) records the start point and the starting `timeOffset` / `yShift`; it does
    not capture the pointer yet.
  - Once movement passes `DRAG_THRESHOLD` (3px) it is a pan: capture the pointer,
    show a `grabbing` cursor, and on every move set
    - `timeOffset = startOffset + round(dx / slot)` — dragging right reveals older
      bars; clamped by `visibleWindow`.
    - `yShift = startShift + dy / chartH` — dragging down reveals higher prices.
  - If the pointer moved, the `click` that follows `pointerup` is swallowed, so a pan
    never deselects a line or places one with the tool armed. A still click behaves
    exactly as today.
  - Body double-click keeps its current job (create a line); resets live on the axes.
- **Price axis** (`ScaleHandle`): drag still zooms; double-click resets `yScale` and
  `yShift`.
- **Time axis** (`TimeAxis`): draggable with an `ew-resize` cursor; pans time only,
  using the same `round(dx / slot)` conversion from `paneGeometry(width, data.length)`.
  Double-click resets `timeOffset`.
- **Horizontal wheel**: a native `wheel` listener with `{ passive: false }` on the
  price pane (React's `onWheel` is passive and cannot `preventDefault`). It acts only
  when `|deltaX| > |deltaY|` (macOS already maps Shift+wheel to `deltaX`),
  accumulates pixels into whole bars, and calls `preventDefault` — which also stops a
  two-finger swipe from triggering browser Back navigation. Vertical wheel is left
  alone.
- **Jump to latest**: while `timeOffset > 0`, a small `»` button at the bottom-right
  of the price pane resets `timeOffset` to 0.
- **Time labels**: when the visible window lies outside the current year or spans
  more than ~6 months, labels read `Mar 24` instead of `12 Mar`.
- **Crosshair / hover**: unchanged; they keep tracking the pointer during a pan.
- **Lower panes** (volume, RSI, MACD): render-only in this pass — no drag of their
  own. They move together with the price pane because they receive the same sliced
  `bars` / `ind`.

## Testing

Test-first, vitest.

- `lib/research.test.js` — `visibleWindow`: offset 0 is the latest tail; a mid offset
  gives the right `{start, end}`; clamps at the oldest bar and at 0; ALL and short
  histories cannot pan; `barsForRange` unchanged.
- `lib/indicators.test.js` — `computeIndicatorsForRange(allBars, window)`: for a
  panned window, MA/EMA/BB/RSI/MACD equal the full-series values at those indices;
  VWAP restarts at the window's first bar.
- `lib/chartGeometry.test.js` — `priceGeometry` with `yShift` translates `top` and
  `bottom` by `yShift × span` without changing the span; pure pixel→bars and
  pixel→shift helpers; year-aware time-label format.
- `useChartControls.test.js` — `setRange` resets `timeOffset` and `yShift`; the
  reset helpers do what the axes' double-click expects.
- `TVChart.test.jsx` — body drag past the threshold pans and neither creates nor
  deselects a line; a still click still places a line when armed; price-axis
  double-click resets scale and shift; a horizontal wheel pans and is
  `preventDefault`ed, a vertical wheel is not; "Jump to latest" shows only when panned.
- `ChartCanvas.test.jsx` / `ResearchChart.test.jsx` — dragging the time axis pans;
  the legend shows the last visible bar; a symbol change resets the pan.
- Manual browser pass on both chart views (next-steps: annotation features deserve a
  check after any chart change): pan with price lines, the line tool, target/stop and
  earnings markers present; screenshots via the `saxodash-design-system` harness.

## Known edges

- 1W/1M pan in visible whole-bar steps (accepted; smooth sub-bar panning is a
  follow-up).
- ALL has nothing to pan in time; vertical pan still works.
- A price line pushed off-screen by a vertical pan becomes an edge marker (existing
  behaviour).
- Per-symbol resets stay keyed on the ticker, like `yScale` today — the existing
  next-steps leftover, not widened here.
- The "click on the chart to close a rail menu also places a line" leftover is not
  touched.

## Out of scope

- Fetching history older than the 1,200-bar fetch.
- Wheel or pinch time zoom.

## Addendum 2026-09-29: time-axis zoom

Added after review at the user's request. Dragging the date strip now zooms time
the way dragging the price axis zooms price, and no longer pans. Panning stays on
dragging the candles and horizontal swipes. Dragging right shows fewer bars and
dragging left shows more (`barCountFromDrag`, exponential, 5 to all fetched). The
newest visible bar stays anchored. While `barCount` is set, no range button is
highlighted; a range pick, a symbol switch or a double-click on the strip returns
to the range.
- Panning from the lower panes.
- Persisting the pan across reloads.
