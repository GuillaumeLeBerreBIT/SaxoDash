# Chart splits (multi-chart layouts) — design

Date: 2026-09-29
Status: draft, awaiting review
Builds on: `2026-09-28-advanced-chart-view-design.md`. **Build after axis panning
(`feat/axis-panning`) merges** — both change `frontend/src/pages/ResearchChart.jsx`.

## Context

The Advanced View (`/research/chart`) is one chart. The goal is a research
workspace in the spirit of OpenMarket's chart page, whose workspace has three
configurable layers: saved workspace tabs, a **Layout** menu of preset chart splits
(1–16 panes plus a custom grid, with symbol/interval/crosshair/time sync), and a
**Panels** menu of toggleable side panels (watchlist, drawings, journal, news,
script editor).

This spec is the first slice only: **preset chart splits, each pane its own
symbol**, so instruments can be compared side by side. Chosen by the user
(2026-09-29) as the v1; everything else is a follow-up (see "Roadmap").

## Goal

Answer "how does this stock look next to that one?" without leaving the chart:
pick a split from the tool rail, put a different symbol in each pane.

## Behaviour

**Layout menu.** A new tool-rail button (`LayoutGrid` icon, label "Layout") opens
a menu of five presets, each drawn as a small grid icon:

| id | Panes | Arrangement |
|---|---|---|
| `1` | 1 | single chart (today's view) |
| `2h` | 2 | side by side |
| `2v` | 2 | stacked |
| `3` | 3 | one large pane on the left, two stacked on the right |
| `4` | 4 | 2 × 2 |

**Panes.** Each pane shows one instrument. Exactly one pane is **active**: blue
outline (the same active treatment as the watchlist row, `ring-1 ring-blue-500`).
Clicking anywhere in a pane activates it.

**What loads into the active pane:** a watchlist row click, an instrument-search
pick, a ⌘K pick, and a deep link `/research/chart?symbol=…`. None of these entry
points change: the active pane is driven by the URL exactly as the single chart is
today (`useResearchInstrument`).

**Shared across all panes:** range, chart type and overlays/indicator panes. One
set of preferences (`useChartControls`), one row of range buttons above the grid.
The line tool places on the active pane only.

**Per pane:** the view that axis panning added (price zoom, price shift, time
window) belongs to each pane (`usePaneViews`). Dragging one chart never moves
another. "Reset price scale" in the rail acts on the active pane. A pane's view
resets when its content or the range changes, not when another pane is
activated. Syncing the time window across panes is the later "Time sync" switch.

**Growing the split** adds empty panes. An empty pane shows "Pick a symbol from the
watchlist" and nothing else. The first empty pane becomes active, so the next
watchlist click fills it.

**Shrinking the split** keeps the first N panes' symbols and drops the rest. If the
active pane is dropped, the last remaining pane becomes active.

**Pane header** (per pane, compact, one line): logo, ticker, last price, move with
its basis suffix ("today" / "latest session", same rule as `SymbolBar`), and the
period change. The existing full `SymbolBar` stays at the top of the page and
follows the active pane.

**Small screens.** Below `lg`, only the active pane is shown (the others are
`hidden lg:flex`), matching the rail, which is already hidden there. No hook, CSS
only.

## Architecture

```
lib/chartLayouts.js          CHART_LAYOUTS, layoutById, resizeSlots, activeAfterResize
components/research/useChartWorkspace.js   workspace state + localStorage persistence
components/research/ChartPane.jsx          one pane: header + ChartCanvas, owns its data
pages/ResearchChart.jsx                    toolbar row + grid of ChartPane + rail
components/research/ChartToolRail.jsx      + Layout menu
```

**`lib/chartLayouts.js`** (pure, tested):
- `CHART_LAYOUTS`: the five presets — `{ id, label, panes, columns, rows, tallPane }`,
  where `columns`/`rows` are CSS grid templates and `tallPane` is the index of the
  one pane that spans two rows (layout `3`), else `null`. `gridStyle(preset)` and
  `paneStyle(preset, index)` turn a preset into inline grid styles.
- `layoutById(id)` → a preset, falling back to `1` for an unknown id.
- `resizeSlots(slots, count)` → the first `count` slots, padded with `null`.
- `activeAfterResize(active, slots)` → index of the first empty slot if the
  resize added one, else `min(active, slots.length - 1)`.

**`useChartWorkspace({ symbol, instrument, selectSymbol })`**:
- State `{ layout, slots, active }`, where `slots` is an array of
  `{ symbol, uic, assetType } | null`. Persisted per viewer under
  `saxodash:chart-workspace` (try/catch read and write, sanitised on read like
  `lib/chartPrefs.js`; missing or invalid → layout `1`, one slot).
- The **active slot mirrors the URL, on every navigation**. The trigger is
  `useLocation().key`, not the symbol value. Each `selectSymbol` call and each
  search/⌘K link creates a new location key, even when the URL is unchanged. On
  each new key, and when the resolved `instrument` arrives, the active slot is set
  to `{ symbol, uic: instrument?.uic, assetType: instrument?.assetType }`.
  Keying on the symbol value would break one case: with an empty pane active,
  picking the symbol already in the URL changes nothing, so the pane would stay
  empty.
- **Arrival:** with `?symbol=` in the URL, the URL wins (a deep link loads into the
  stored active pane). Without it, if the stored active slot holds a symbol, the
  hook calls `selectSymbol` with it once. That keeps `useResearchInstrument`'s
  fallback (first position, then NVDA) from overwriting the saved workspace:
  while that restore is pending, the active slot does not copy the URL.
- `activate(index)`: sets `active`, then, if the slot holds a symbol, calls
  `selectSymbol(slot.symbol, { uic, assetType })` in the same event, so the URL
  (and the `SymbolBar`, rail highlight and watchlist toggle) follow the new
  active pane. Activating an empty slot does not navigate, so the pane stays empty
  until the next pick. Until then the `SymbolBar` keeps showing the last symbol.
- `setLayout(id)`: `resizeSlots` + `activeAfterResize`.
- Returns `{ layout, slots, active, activate, setLayout }`.

A non-active pane never re-resolves its symbol: it renders from the stored
`{ symbol, uic, assetType }`. Every way a symbol reaches a pane (watchlist row,
search result, ⌘K, a held position) already carries the uic, so no search runs for
a non-active pane.

**`ChartPane({ slot, active, controls, onActivate, placingLine, onPlaced, paneHeights })`**
calls `useChartData` for its own slot and renders the compact header, the
`ChartCanvas` (with its own hover state and `useSize` measurement), and the empty
placeholder when `slot` is `null`. `useChartData` already does everything per
instrument (chart, details, earnings markers, price lines, quote). When two panes
show the same instrument, TanStack Query dedups every request.

**`ResearchChart`**: keeps the page grid (`48px | main | 300px`) and the rail.
`main` becomes a toolbar row (range buttons, line save alert for the active pane,
`SaxoConnectionStatus`) above a CSS grid built from the preset's
`columns`/`rows`. The top `SymbolBar` and `useWatchlistToggle` keep using the
active instrument (URL). The top `SymbolBar` needs the active pane's `details`,
`quote` and `bars`; it gets them from a `useChartData` call for the active slot at
page level. The query keys are identical to the pane's, so there are no extra
requests.

**Pane indicator heights.** With more than one pane, panes use
`DEFAULT_PANE_HEIGHTS` (74/92/92) instead of `ADVANCED_PANE_HEIGHTS` (96/120/120),
so a 2 × 2 grid with Volume + RSI + MACD keeps a readable price pane. The known
`MIN_PRICE_HEIGHT` overflow trade-off (`docs/next-steps.md`) stays as is.

## Data and performance

Per pane: one Saxo chart call (cached 15 min, deduped across panes), one details
call (cached a day), one batched quote poll every 30s, earnings/notes/lines as
today. Four panes stay well inside the `research.market` 60/min throttle. The one
multiplied cost is the quote poll (up to four per 30s), which is acceptable.
Batching the panes' quotes into one call is a possible later optimisation, not v1.

Rendering: each pane is today's SVG chart. At `ALL` (1,200 bars) × 4 panes that is
~4,800 candle nodes. The canvases are memoised per pane and hover state is
per-pane, so moving the pointer over one pane re-renders only that pane.

## Testing

- `lib/chartLayouts.test.js`: every preset's pane count matches its template;
  `layoutById` falls back; `resizeSlots` grow/shrink; `activeAfterResize` picks the
  first new empty slot on grow and clamps on shrink.
- `useChartWorkspace.test.js` (`renderHook`): persists and restores; bad
  localStorage → defaults; the active slot mirrors a URL change; re-selecting the
  symbol already in the URL fills an empty active slot; arriving without
  `?symbol=` restores the stored active symbol instead of the fallback; `activate`
  calls `selectSymbol` with the slot's instrument; activating an empty slot does
  not.
- `ChartPane.test.jsx`: empty placeholder; header shows ticker/move with the basis
  suffix; click calls `onActivate`.
- `ResearchChart.test.jsx`: choosing layout `4` renders four panes; the new empty
  pane is active; a watchlist selection loads into the active pane; the line tool
  is disabled while the active pane is empty.
- Manual: screenshot review at 1440px (layouts `2h` and `4`, indicators on) and
  390px (single pane), per the `saxodash-design-system` skill.

## Out of scope (roadmap)

In rough order, each its own spec:
1. **Workspace follow-ups:** sync switches (symbol, range, crosshair; time/scroll
   sync after axis panning), a custom rows × cols grid, saved named workspace tabs.
2. **Panels menu:** Overview (fundamentals of the active pane), News (compact),
   Notes (thesis/target/stop — data exists), Lines (price lines — data exists).
3. **Drawing tools:** the line/crosshair pair today is one pointer with two modes
   and a single tool. Add trend line, ray, rectangle, Fibonacci and text, with
   visible modes. Chart internals, so after panning.
4. **Styling & config:** per-line colour/style, indicator parameters, themes.
5. **Scripting:** user-defined indicators from a small formula language, shown as
   overlays or panes.
6. **ML / scoring:** backtest scripted rules, technical scoring. Not "prediction".
