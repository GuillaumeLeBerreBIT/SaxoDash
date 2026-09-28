# Research: Advanced Chart View — Design

**Status:** Design approved in chat 2026-09-28; spec awaiting user review.

## Problem

The Research chart is 390px tall and shares the page with the symbol bar,
fundamentals tabs and a watchlist rail that drops below it under 1280px. It is
fine for a glance and cramped for actual chart work: flipping through a
watchlist, reading indicators in lower panes, placing price lines.

`docs/next-steps.md` ranked an "advanced chart view" first: an expand button
opens a full-page, TradingView-lite workspace — slim tool rail on the left,
big chart in the centre, instrument search and watchlists on the right. No
heavy customisation.

Assumed everyday use (confirmed in chat): flip through watchlist charts on a
big canvas and place lines. Fundamentals, tabs and notes stay on the normal
Research page.

## Decisions

1. **Its own route, not an overlay.** `/research/chart?symbol=&uic=&assetType=`
   — the same params Research already uses. Reload, back and bookmarks work,
   and search can target the route.
2. **Full-bleed, outside `Layout`.** Inside `RequireAuth`, but no app sidebar
   and no page max-width padding: the viewport is the workspace.
3. **The left rail holds existing controls, vertically.** Crosshair /
   horizontal-line tool, chart type, indicators, reset price scale, back to
   Research. No new drawing model.
4. **Chart prefs are one persisted preference both views share.** Range, chart
   type, overlays and panes live in localStorage; toggling MACD in the big view
   means it is on after collapsing and after a reload. `yScale` is *not*
   persisted — it stays per page and resets on symbol change as today.
5. **Esc does not close the view.** Esc already deselects a line and closes
   menus and the search dropdown; overloading it makes the view easy to lose.
   The rail's "Back to Research" button is the way out.
6. **Shared logic is extracted, not forked.** Instrument resolution and chart
   data loading move out of `Research.jsx` into hooks both pages use — the
   instrument-resolution logic has had subtle bugs (ambiguous "NOW" ticker)
   and must exist once.

## Architecture

### Routing and shell

- `App.jsx`: new `research/chart` route inside `<RequireAuth>` and *outside*
  `<Layout>`, rendering `pages/ResearchChart.jsx`.
- `lib/research.js`: `chartHref(symbol, instrument)` next to `researchHref`,
  producing `/research/chart?symbol=…[&uic=…[&assetType=…]]` with the same
  param rules.
- **Expand:** a `Maximize2` icon button at the right end of Research's chart
  toolbar (`ChartPanel`), a link to `chartHref(symbol, instrument)`.
- **Collapse:** the bottom button of the tool rail navigates to
  `researchHref(symbol, undefined, instrument)`.
- **⌘K:** `Layout`'s key handling and palette open state move into a
  `useCommandPalette()` hook (`components/useCommandPalette.js`) returning
  `{ open, setOpen }`; `Layout` and `ResearchChart` both use it and both render
  `<CommandPalette>`.

### Layout of `ResearchChart`

`h-screen` grid `grid-cols-[48px_minmax(0,1fr)_300px]`, no page scroll.

- **Header** (above the chart column): `SymbolBar` with a new `compact` prop
  that hides the day-range/volume stats; the range buttons (`INTERVALS`); the
  period change; the "Couldn't save line" alert; `SaxoConnectionStatus`.
- **Centre:** `ChartCanvas` filling the remaining height.
- **Right column:** `InstrumentSearchBar` on top, `WatchlistRail` filling the
  rest. The rail's hard-coded list caps (`max-h-[230px]`, `max-h-[420px]`)
  become props with today's values as defaults, so this page can let the lists
  stretch.
- **Below 1024px** the right column is hidden and the chart takes its width.
  No stacked/mobile layout.

### Chart sizing

- `lib/chartGeometry.js`: `useSize()` — `useWidth` generalised to report
  `{ width, height }` from the same `ResizeObserver`. `useWidth` stays as a
  thin wrapper so existing callers are untouched.
- `ChartCanvas` takes a `height` for the whole canvas. Price-pane height =
  `height − legend − enabled lower panes − time axis`, floored at 240px.
- Lower pane heights become props of `ChartCanvas`: Research keeps Volume 74,
  RSI/MACD 92; the big view uses Volume 96, RSI/MACD 120.

### Splitting `ChartPanel`

- `components/research/chartOptions.js`: `CHART_TYPES`, `OVERLAY_DEFS`,
  `PANE_DEFS` moved out of `ChartPanel.jsx` so both toolbars read one list.
- `components/research/ChartCanvas.jsx`: OHLC legend + `TVChart` + lower
  panes + time axis + placeholder handling, given `bars`, `ind`, `controls`,
  hover, lines and callbacks, `height`, pane heights, and the optional
  line-placing props below.
- `ChartPanel` keeps its horizontal toolbar and renders `ChartCanvas` at the
  existing 390px price pane — Research looks and behaves the same, plus the
  expand button.

### Tool rail

`components/research/ChartToolRail.jsx`, 48px wide, icon buttons with
`title`/`aria-label`, using the existing `Menu` primitives (menus open to the
right of the rail).

1. **Crosshair** (default) / **Horizontal line** — a two-state tool. Arming
   the line tool makes the next single click on the plot create a line at that
   price, then the tool drops back to crosshair. Double-click-to-create keeps
   working in both states.
2. **Chart type** menu — candles / bars / line / area.
3. **Indicators** menu — overlays and lower panes, as on Research.
4. **Reset price scale** — sets `yScale` to 1; disabled when it already is.
5. Separator, then **Back to Research**, pinned to the bottom.

`TVChart` gains optional `placingLine` (bool) and `onPlaced()` props. When
`placingLine` is true, a single click inside the plot area calls
`onCreateLine(roundPrice(priceAtY(y)))` then `onPlaced()`, and the cursor is
`crosshair`. The double-click that a placing click can be the first half of
must not create a second line: a `dblclick` landing within the same gesture
as a placement is ignored. When the props are absent, behaviour is unchanged.

### Search targets the chart route

`InstrumentSearchBar` takes an optional `hrefFor(result)`; the default builds
`researchHref(...)` as today. `ResearchChart` passes one that builds
`chartHref(...)`, so a pick stays in the big view. Watchlist row clicks call
the page's `selectSymbol`, which rewrites this route's own params exactly as
Research does.

## State and data

### Persisted chart prefs

- `lib/chartPrefs.js`: `readChartPrefs()`, `writeChartPrefs(prefs)`,
  `sanitizeChartPrefs(raw, defaults)`. localStorage key
  `saxodash:chart-prefs`, best-effort like `lib/recentSymbols.js`: unavailable
  storage or corrupt JSON yields defaults, never an error.
- Sanitising merges stored values over the defaults key by key: unknown
  overlay/pane keys are dropped, non-boolean toggles fall back to the default,
  a `range` not in `INTERVALS` or a `type` not in `CHART_TYPES` falls back to
  the default. A newly added overlay therefore appears with its default, and a
  stale blob cannot break the chart.
- `useChartControls` seeds its state from `readChartPrefs()` and writes
  `{ range, type, overlays, panes }` back on every change. `yScale` is excluded
  from both.
- The two routes are never mounted at once, so reading on mount is all the
  sharing needed. No cross-tab sync.

### Extracted hooks

- `useResearchInstrument()` (`components/research/useResearchInstrument.js`):
  reads `symbol`/`uic`/`assetType` from the URL, falls back to the first
  position then `NVDA`, runs the conditional instrument search, resolves the
  instrument, and returns
  `{ symbol, instrument, position, positions, selectSymbol }`.
  `selectSymbol(next, instrument)` rewrites the current route's params
  (`replace: true`), whichever route that is.
- `useChartData({ symbol, instrument, range })`
  (`components/research/useChartData.js`): the widest-range chart fetch,
  `allBars`, `bars` (sliced to `range`), `ind`, symbol earnings and earnings
  markers, the symbol note, `useChartLines`, the live quote and instrument
  details. Returns
  `{ chart, bars, ind, earningsMarkers, priceLines, quote, details, note }`.
- `useWatchlistToggle({ symbol, instrument, details, position })`
  (`components/research/useWatchlistToggle.js`): Research's `toggleList`
  (add/remove the current instrument from a list), moved so both pages'
  `SymbolBar` star works. Returns `{ watchlists, toggleList }`.
- `Research.jsx` switches to these hooks with unchanged behaviour; its existing
  tests guard the refactor. The per-symbol `yScale` reset and the hover clamp
  stay page-level (both pages need them; they are a few lines each).
- The big view loads no fundamentals, news or peers — opening it costs no
  Finnhub calls. Identical TanStack query keys mean moving between the views
  is served from cache.

## Error handling

Reused as-is: `chartPlaceholderFor` covers loading, 409 not connected,
unresolved instrument and too few bars, rendered at the measured canvas
height. `SaxoConnectionStatus` in the header keeps a disconnect visible. A
failed line save shows the existing "Couldn't save line" alert in the header.

## Testing (vitest, test-first)

- `lib/chartPrefs.test.js` — round-trip; corrupt JSON; unknown keys dropped;
  invalid range/type fall back; non-boolean toggle falls back; storage that
  throws on read and on write.
- `lib/research` tests — `chartHref` with and without uic/assetType.
- `useChartControls` — changes are persisted; `yScale` is not.
- `TVChart` — with `placingLine`, a single click in the plot creates a line at
  the clicked price and calls `onPlaced`; a double-click while placing creates
  exactly one line; without it, a single click creates nothing; a click in the
  axis gutter never places.
- `ChartToolRail` — arming/disarming the line tool; reset disabled at
  `yScale` 1 and calls `setYScale(1)` otherwise; chart-type and indicator rows
  call the controls; back button targets `researchHref` with uic/assetType.
- `InstrumentSearchBar` — `hrefFor` is used when given; default unchanged.
- `ResearchChart.test.jsx` — renders chart, rail and watchlist for
  `?symbol=`; a watchlist click switches symbol within `/research/chart`.
- `Research.test.jsx` — the expand link points at `chartHref` with
  uic/assetType; all existing tests stay green after the hook extraction.
- Visual pass with the `saxodash-design-system` screenshot harness once built
  (both views, a few pane/overlay combinations, narrow window).

## Out of scope

- Axis panning / scrolling back through history (next-steps #2).
- Per-line colour or style (next-steps #3).
- New drawing tools (trend lines, rays, Fibonacci).
- A mobile/stacked layout for the big view.
- Cross-tab sync of chart prefs.
