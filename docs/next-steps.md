# SaxoDash — next steps

Candidate directions after the Research chart annotations work (price-axis scaling,
draggable target/stop lines, freeform price lines — merged 2026-09-28). Pick one and
brainstorm it before building.

## 1. Advanced chart view

Done 2026-09-28 — `/research/chart`, spec
`docs/superpowers/specs/2026-09-28-advanced-chart-view-design.md`.

## 2. Axis panning (recommended next)

Drag the price axis to move the chart up and down; drag the time axis (or scroll) to
go back through history.

- **Why next:** pairs naturally with the big view and makes the chart feel like a
  real charting tool.
- **Risk:** the trickiest change. Today the chart always shows exactly the selected
  range and the indicators are sliced to it (`barsForRange`,
  `computeIndicatorsForRange`); a panned window breaks that assumption. Horizon is
  daily-or-coarser only (see AGENTS.md "Chart bars are identified by their date").

## 3. Per-line customisation

A small toolbar for a selected line: colour, maybe style.

- **Size:** smallest of the list — a `PriceLine` column (+ migration) and a small
  line toolbar. Target/stop colours stay fixed unless decided otherwise.

## 4. "App store / Netflix" browse view for stocks

A discovery page with rows/grids of instruments (themes, movers, holdings, watchlists).

- **Constraint:** each tile wants company data, and Finnhub's free tier is 60 calls a
  minute (one fundamentals miss is four calls). Needs caching/batching before it
  scales; no third-party price data beyond Saxo (a closed decision).

## 5. ML prediction (last)

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
- At `/research/chart`, 1100×800 with Volume + RSI + MACD all on and a wrapped
  two-row legend, `MIN_PRICE_HEIGHT`'s floor still pushes the canvas a little past
  the container (time axis clipped by ~20px) — a pre-existing, accepted trade-off
  (see `chartGeometry.test.js`'s "never shrinks below the readable floor" case),
  now smaller after `LEGEND_HEIGHT` was corrected but not eliminated at the
  narrowest width with every pane enabled.
