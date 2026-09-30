# SaxoDash — next steps

Candidate directions after the Research chart annotations work (price-axis scaling,
draggable target/stop lines, freeform price lines — merged 2026-09-28). Pick one and
brainstorm it before building.

## 1. Advanced chart view

Done 2026-09-28 — `/research/chart`, spec
`docs/superpowers/specs/2026-09-28-advanced-chart-view-design.md`.

## Chart splits

Done 2026-09-30 — up to four panes on `/research/chart`, each its own symbol,
spec `docs/superpowers/specs/2026-09-29-chart-splits-design.md`. Next Advanced
View slices, in rough order (see that spec's "Roadmap"):

1. Workspace follow-ups: sync switches (symbol, range, crosshair; time/scroll
   sync after axis panning), a custom rows × cols grid, saved named workspace
   tabs.
2. Panels menu: Overview (fundamentals of the active pane), News (compact),
   Notes (thesis/target/stop), Lines (price lines).
3. Drawing tools: trend line, ray, rectangle, Fibonacci and text, with visible
   modes, alongside today's line/crosshair pair.
4. Styling & config: per-line colour/style, indicator parameters, themes.
5. Scripting: user-defined indicators from a small formula language, shown as
   overlays or panes.
6. ML / scoring: backtest scripted rules, technical scoring — not "prediction".

## 2. Market heatmaps (Phase 1)

Done 2026-09-29 — spec
`docs/superpowers/specs/2026-09-29-market-heatmaps-design.md`.

## 3. Axis panning

Done 2026-09-29 — spec `docs/superpowers/specs/2026-09-29-axis-panning-design.md`,
plus time-axis zoom (drag the date strip). Possible follow-ups: smooth sub-bar
panning (1W/1M step a whole bar at a time), paging older history from Saxo past the
1,200-bar fetch, pinch / Ctrl+scroll zoom.

## 4. Per-line customisation (recommended next)

A small toolbar for a selected line: colour, maybe style.

- **Size:** smallest of the list — a `PriceLine` column (+ migration) and a small
  line toolbar. Target/stop colours stay fixed unless decided otherwise.

## 5. "App store / Netflix" browse view for stocks

A discovery page with rows/grids of instruments (themes, movers, holdings, watchlists).

- **Constraint:** each tile wants company data, and Finnhub's free tier is 60 calls a
  minute (one fundamentals miss is four calls). Needs caching/batching before it
  scales; no third-party price data beyond Saxo (a closed decision).

## 6. ML prediction (last)

- **Why last:** high effort (training/backtest pipeline) and, on a personal-finance
  app, a real risk of presenting noise as signal. If ever picked up, scope it down to
  simple technical scoring rather than "prediction".

## Known small leftovers from the annotations work

- Two saves at once to the same query key can drop one's optimistic change.
- A dropped line can stick at an unsaved price if a save fails before TanStack
  Query's notify flush (practically unreachable with real network latency).
- Hovering a line badge shows the resize cursor rather than a text cursor.
- Manual browser checks of the annotation features are worth a pass after any chart
  change.
- At `/research/chart` with Volume + RSI + MACD all on, `MIN_PRICE_HEIGHT`'s
  240px floor can still push the canvas a little past the container at narrow
  widths, since the legend height is now measured rather than assumed — a
  pre-existing, accepted trade-off (see `chartGeometry.test.js`'s "never
  shrinks below the readable floor" case), not eliminated by measuring the
  legend, just no longer tied to a stale pixel guess.
- At the big view, hovering near a width where the legend sits on the edge of
  wrapping to a second row can shift the price pane's height by one legend
  row mid-hover.
- The big view's per-symbol resets (price-scale zoom, line tool, chart
  remount) are keyed on the ticker, not on uic + asset type, so switching
  between two instruments that happen to share a ticker doesn't reset them.
- With the line tool armed, clicking the chart to close an open rail menu
  also places a line.
