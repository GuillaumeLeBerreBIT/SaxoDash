# Market heatmaps (Phase 1) — design

Date: 2026-09-29
Status: draft, awaiting review
Follows: `2026-09-28-advanced-chart-view-design.md`. Axis panning is sequenced
directly after this work (decided 2026-09-29).

## Goal

Two heatmaps that answer two different questions, plus two small supporting
changes:

| Surface | Question it answers |
|---|---|
| Dashboard — **Portfolio heatmap** | "Where is my portfolio capital allocated, and what is moving it?" |
| Advanced View — **Watchlist heatmap** | "Which stocks in my watchlist are moving today?" |
| Dashboard — `MoversCard` toggle | "What moved most today?" next to "what has done best since I bought it?" |
| Advanced View / Research — volume shading | "Was this move made on unusual volume?" |

Inspiration came from OpenMarket, whose real API is crypto/Polymarket-only
(order-book heatmaps, liquidation maps). The concepts were translated to a
long-term equity context rather than copied: movement is framed against
capital at risk, and nothing here is market-wide.

**Constraint that shapes everything:** neither Saxo nor Finnhub's free tier has
a market-wide or screener feed. Both heatmaps run over a bounded universe the
app already prices — your positions and your watchlist — using the batched
`/api/research/quotes/` call that `WatchlistRail` and `usePositionQuotes`
already make.

## What validation changed

The direction approved in chat was checked against the code before writing
this. Six findings changed the design:

1. **Recharts' `Treemap` is not used.** It renders SVG with no focus/keyboard
   model, has no padding for labelled group headers (needed for sector
   groups), and — like every `ResponsiveContainer` chart here — renders
   nothing in jsdom, so tile behaviour would be untestable (`ExposureCard`'s
   tests only assert its HTML legend for this reason). The Advanced View case
   isn't a treemap at all (equal-sized tiles). Instead: a ~50-line pure
   `squarify` layout in `lib/heatmap.js`, rendering HTML tiles. Unit-testable,
   accessible, no new dependency.
2. **`SECTOR_PALETTE` is not used for tile fill.** It is six near-identical
   blues, tuned for a padded donut; adjacent treemap tiles in those blues are
   indistinguishable, and index-based assignment isn't stable across views.
   Sector becomes **spatial grouping with labelled headers**, not color. That
   also removes the "sector" color mode: color always means performance.
3. **The red/green scale is reused as a function, not as a constant.**
   `MonthlyReturnsHeatmap` saturates at ±9% — right for months, wrong for days
   (a typical daily move of 0.5–2% would read as near-blank). The scale
   (`withAlpha(POSITIVE|NEGATIVE, 0.12 + intensity × 0.65)`) moves into
   `lib/charts.js` as `performanceFill(pct, cap)` with a cap per metric, and
   `MonthlyReturnsHeatmap` is migrated onto it. One visual language, three
   calibrations.
4. **"Today" is not always today.** The SIM account has no live-quote
   entitlement, so `market.quotes` fills `change_pct` from the last two daily
   closes — yesterday's move — and the frontend can't tell which it got. Per
   the app's "a stale mark is disclosed, not passed off as live" rule, quote
   rows gain a `change_basis` field (`live` / `last_close`), and every "Today"
   label becomes "Last session" when any shown row is `last_close`. This is
   the one backend change.
5. **"All-time" in `MoversCard` is ambiguous.** It is `pnl_pct` of the
   currently open position against its *average cost*: unrealized, excluding
   realized sells and dividends. The toggle is **Today | Since purchase**,
   subtitle "Unrealized return vs. average cost". The heatmap uses the same
   two words.
6. **The Dashboard already shows sector allocation** (`ExposureCard`'s sector
   donut), and its layout comments record that a duplicated allocation view
   was "the single largest redundancy on this page". The heatmap's sector
   groups show sector weights with more information, so **`ExposureCard`
   drops its sector donut** and keeps currency exposure + the concentration
   caption. *(Reviewer: veto point — see Open questions.)*

Confirmed as fine, no change needed:

- **Shared quotes don't double-fetch or churn.** `researchKeys.quotes` sorts
  uics, so the same position set maps to one cache entry across Dashboard and
  Portfolio. `useQueries`' `combine` output goes through `replaceEqualDeep`
  (checked in `query-core/queriesObserver.js`), so an unchanged refetch keeps
  the same reference and downstream `useMemo`s hold.
- **The 20-bar volume window means the same thing on every range.** Every
  range (1W…ALL) is a slice of one daily series (`DAILY_HORIZON`, fetched once
  at `WIDEST_RANGE_COUNT`). 20 bars = 20 sessions ≈ one trading month
  everywhere; the range only changes zoom.
- **The 300px aside fits a useful grid.** ~276px inner width → three 84px
  tile columns; a 20-symbol watchlist is 7 rows (~370px), inside a rail that
  already scrolls.

## 1. Component architecture

```
lib/charts.js         performanceFill(pct, cap), PERFORMANCE_CAPS
lib/heatmap.js        squarify(), groupBySector(), layoutPortfolio(), labelLevel(),
                      dayMoves(), daySummary(), rankDayMoves(), sincePurchaseSummary(),
                      sortByMove(), breadth()
lib/pricing.js        moveLabel(quotes) -> 'Today' | 'Last session', LAST_SESSION_NOTE
lib/indicators.js     relativeVolume(bars, window); computeIndicatorsForRange adds `rvol`

components/heatmap/HeatTile.jsx                 shared tile: fill, ticker, signed %, a11y label
components/heatmap/ScaleLegend.jsx              −cap … +cap gradient (also adopted by MonthlyReturnsHeatmap)
components/dashboard/PortfolioHeatmap.jsx       squarified, sector-grouped, value-sized
components/research/WatchlistHeatmap.jsx        uniform CSS grid, sorted by move
```

Changed: `Dashboard.jsx`, `ExposureCard.jsx`, `MoversCard.jsx`,
`WatchlistRail.jsx`, `ResearchChart.jsx`, `panes.jsx` (`VolumePane`),
`ChartCanvas.jsx` (legend), `MonthlyReturnsHeatmap.jsx`,
`backend/research/market.py`.

**Related but intentionally different.** The two heatmaps share only
`HeatTile` (tile look, text, accessibility) and `performanceFill` (color).
Everything that encodes their question differs:

| | Portfolio heatmap | Watchlist heatmap |
|---|---|---|
| Size | Position value (EUR) | Uniform |
| Arrangement | Grouped by sector, squarified | Sorted by move, grid |
| Color metric | Today (default) / Since purchase | Today only |
| Header | Day P&L in EUR + biggest driver | Breadth: ▲ n ▼ n |
| Click | Research overview for the holding | Loads the symbol into the chart |

`HeatTile` is a shared primitive because both heatmaps would otherwise
duplicate the same fill + label + aria logic (the design system's
promote-on-second-use rule).

## 2. Data / query flow

**Backend — `market.to_quote` / `market.quotes`.** `to_quote` sets
`change_basis: 'live'` when Saxo sent `PriceInfo.PercentChange`, else `None`;
the `_last_session_change_pct` fallback sets `'last_close'` when it fills the
value. No new endpoint, no new Saxo call.

**Dashboard.**

```
usePositions() ─┬─> usePositionQuotes(positions)  (called once, in Dashboard)
                │         └─> Map<uic, quote>
                ├─> PortfolioHeatmap({ positions, quotes })
                └─> MoversCard({ movers: insights.movers, positions, quotes })
```

`dayMoves(positions, quotes)` → per position `{ ticker, changePct, impactEur }`
with `impactEur = value × c / (100 + c)`: today's EUR effect of the price
move on the current EUR value. It excludes the day's FX move (the quote's %
is in the instrument currency); the tooltip says "price move". Positions with
no uic or no quote get `changePct: null` and render as no-data, never as 0.

**Advanced View.** `WatchlistRail` already holds `items` and the
`quotes` map for the active list. The grid view receives both as props —
zero new hooks, zero new requests.

**Volume.** `relativeVolume(allBars, 20)` runs inside the existing
`computeIndicatorsForRange` over the full series before slicing (same as the
moving averages), so a 1W view still has a 20-session baseline.

## 3. State management

- **Heatmap metric toggle** (Today / Since purchase): local `useState` in
  `PortfolioHeatmap`, default *Today* — the "what is moving it" half of its
  question.
- **MoversCard toggle**: local `useState`, default *Since purchase* (today's
  behaviour). With the heatmap defaulting to Today, the page shows
  complementary views out of the box. The two toggles are independent.
- **Rail view mode** (list / grid): `WatchlistRail` state, persisted per
  viewer under `saxodash:watchlist-view` (try/catch, falls back to list).
  The grid option only renders when the new `gridView` prop is set, which
  only `ResearchChart` passes — the Research page's rail is unchanged.
- **Tooltips**: the native `title` attribute plus a matching `aria-label` —
  no hover state to manage, and the same text reaches a screen reader.
- No server state beyond the existing queries; nothing new in TanStack.

## 4. Responsive / layout behaviour

**Dashboard.** The heatmap sits in Tier 2, directly under the "Portfolio —
At a glance" `StatStrip`, full width: it *is* the portfolio glance. Card body
height is fixed (280px at `md+`, 220px below); width is measured with the
existing `useSize`. Tier 3 keeps its three cards (`MoversCard`,
`ExposureCard` — now currency + concentration — and `UpcomingEarnings`);
the grid gets `items-start` if `ExposureCard` ends up shorter than its
neighbours (a known anti-pattern in `design-system.md`).

Label thresholds per tile: ticker + % at ≥ 56×34px; ticker only at ≥ 36×18px;
otherwise no text, but still focusable with a full aria-label and tooltip.
A sector group shorter than 40px drops its header strip and uses the full
rect; the sector name stays in each tile's tooltip. At phone width, tiles
shrink and shed labels by those rules. The existing phone-width overflow
from the fixed 220px `Sidebar` is out of scope and unchanged.

**Advanced View.** Grid is `repeat(auto-fill, minmax(80px, 1fr))`, 48px
tiles, inside the rail's existing scroll container. The aside stays
`hidden lg:flex`, so below `lg` neither view shows (unchanged behaviour).

## 5. Visual / UX behaviour

**Color.** `performanceFill(pct, cap)`:
- `null` → no-data fill (`TRACK`) with "—".
- `|pct| < 0.1` → neutral fill: flat stays flat instead of reading as a
  faint gain or loss.
- otherwise `withAlpha(POSITIVE|NEGATIVE, 0.12 + min(1, |pct|/cap) × 0.65)`.
- Caps: `DAY = 3`, `SINCE_PURCHASE = 30`, `MONTH = 9`
  (`MonthlyReturnsHeatmap`, unchanged look).
- The cap is shown as a small gradient legend ("−3% … +3%") in the
  Portfolio heatmap's header — the same device `MonthlyReturnsHeatmap` uses,
  extracted to a shared `ScaleLegend`. The rail grid has no room for one; its
  tiles print their signed % instead.

Every tile prints a signed percentage — color is never the only signal
(design-system rule). One green, one red, from `lib/charts.js` only.

**Portfolio heatmap.** Title "Allocation & movement", subtitle "Sized by
value, grouped by sector". Header right: legend + segmented toggle
`Today | Since purchase` ("Last session" instead of "Today" when any quote is
`last_close`, with a one-line caption: "No live market data on this account —
showing the last completed session"). Summary line:
- Today: `+€1,240 (+0.8%) · biggest driver NVDA +€610`
- Since purchase: `Biggest contributor NVDA +€3,100 · biggest drag TSLA −€800`

Sector header strip: `Technology · 42%`. Tile tooltip: name, value, weight,
today % and ≈€ impact, since-purchase %. Tiles link to the holding's
Research overview (`researchHref`), like `MoversCard` rows.

**Watchlist heatmap.** A list/grid icon toggle (`List` / `LayoutGrid`,
lucide) in the rail header. Grid header: `Today · sorted by move` (or
`Last session …`) and breadth `▲ 12 ▼ 5` (flat and no-data not counted).
Tiles sorted by change, descending (gainers top-left, losers bottom-right,
no-data last, ties by symbol). The chart's current symbol gets the same blue
active treatment as the list row; held symbols keep the list's blue dot.
Click and Enter call `onSelectSymbol`, like list rows. Removing a symbol
stays a list-view action. The since-last-look badge stays list-only.

**MoversCard.** Toggle `Today | Since purchase`. Since purchase = today's
`insights.movers` (top/bottom 3), subtitle "Unrealized return vs. average
cost". Today = top/bottom 3 by `changePct` from `dayMoves`, showing % and
≈€ impact; subtitle follows `moveLabel`. Empty state when no position has a
quote: "No price moves available yet."

**Volume shading.** Bars with `rvol ≥ 2` draw at opacity 0.8 instead of 0.4
(same up/down color). The chart legend's volume reading becomes
`Vol 12.3M · 2.4× 20d avg` when `rvol` is known. `relativeVolume` treats
volume 0 as missing (`to_candle` maps an absent `Volume` to 0), excludes the
current bar from its own baseline, needs ≥ 15 valid sessions in the window,
and returns `null` otherwise. The newest bar may be an in-progress session
that undercounts, so it is flagged late rather than falsely. `VolumePane` is
shared, so the Research page chart gets the shading too.

## 6. Performance

- **Requests.** Dashboard gains quote polling (30s `refetchInterval`,
  paused in a background tab — TanStack default). Cost per poll is one
  `infoprices` call per asset type; the SIM fallback's per-uic
  `chart(count=2)` calls are cached 900s. The Portfolio page already pays
  this for the same key, so moving between the pages hits one cache entry.
  The watchlist grid adds nothing. No change to the `research.market` 60/min
  throttle is needed.
- **Renders.** One `usePositionQuotes` call in `Dashboard`, passed down.
  `combine` is structurally shared, so a no-change poll doesn't re-render.
  Layout is `useMemo`'d on `(positions, width, height)`; the metric toggle
  only recomputes fills. Tiles are plain HTML (tens of nodes); no animation.
- **Volume.** `rvol` is one pass with a 20-bar window (~24k operations at
  1,200 bars) inside the existing
  `computeIndicatorsForRange` memo. `VolumeBars` stays `memo`'d; the
  `rvol` prop is referentially stable with `ind`.

## 7. Testing strategy

Backend (`research/test_market.py`):
- `change_basis` is `live` when `PercentChange` is present, `last_close` when
  the fallback fills it, `None` when neither does.

Frontend unit (vitest):
- `lib/heatmap.test.js` — `squarify`: areas proportional to values, tiles
  exactly cover the rect, no overlaps, zero/negative values dropped, single
  item fills the rect, aspect ratios bounded. `groupBySector`: blank →
  `Unknown`, groups ordered by value. `dayMoves`: impact maths, null quote →
  null. `sortByMove` and `breadth`.
- `lib/charts.test.js` (or `heatmap.test.js`) — `performanceFill`: null,
  neutral band, sign, saturation at the cap.
- `lib/indicators.test.js` — `relativeVolume`: baseline excludes the current
  bar, zeros ignored, insufficient history → null, `rvol` aligned after
  slicing.
- `lib/pricing.test.js` — `moveLabel`.

Frontend components:
- `PortfolioHeatmap.test.jsx` — one tile per position with signed %, sector
  headers, toggle switches metric and summary, "Last session" disclosure,
  empty state, tile link targets.
- `WatchlistHeatmap.test.jsx` — sort order, no-data last, breadth counts,
  active symbol state, click/Enter select.
- `WatchlistRail.test.jsx` — grid toggle shows only with `gridView`, persists.
- `MoversCard.test.jsx` — toggle, Today ranking, empty state.
- `ExposureCard.test.jsx` — sector donut gone, currency + concentration stay.
- `Dashboard.test.jsx` — mocks `usePositionQuotes`; heatmap renders.
- `panes` / `ChartCanvas` — elevated bars and legend text.

HTML tiles with a fixed height and `useSize`'s fallback width lay out in
jsdom, so the tile tests are real rendering, not mocks.

Manual: `saxodash-design-system` screenshot review at 1440px and 390px for
Dashboard and `/research/chart`; one live check against SIM (the refresh
token expired 2026-09-29 — reconnect first) to see the "Last session" path
for real.

## 8. Implementation order

Each step is independently testable and leaves the app working.

1. **Backend `change_basis`** — test first in `test_market.py`, then
   `to_quote` / `quotes`.
2. **Color + label helpers** — `performanceFill` + caps in `lib/charts.js`,
   migrate `MonthlyReturnsHeatmap` onto it (visual no-op); `moveLabel` in
   `lib/pricing.js`.
3. **`lib/heatmap.js`** — `squarify`, `groupBySector`, `dayMoves`,
   `sortByMove`, `breadth`, all test-first.
4. **`HeatTile`** — the shared tile.
5. **`PortfolioHeatmap` + Dashboard wiring** — single `usePositionQuotes`
   call in `Dashboard`, heatmap under the `StatStrip`.
6. **`ExposureCard`** — drop the sector donut (or skip, per review).
7. **`MoversCard` toggle** — Today / Since purchase.
8. **`WatchlistHeatmap` + rail view toggle** — `gridView` prop, set only by
   `ResearchChart`.
9. **Volume shading** — `relativeVolume`, `rvol` in
   `computeIndicatorsForRange`, `VolumePane` opacity, legend text.
10. **Verify** — backend tests, `npx vitest run`, eslint on touched files,
    `npm run build`, screenshot review, live SIM check.
11. **Docs** — `docs/next-steps.md` (Phase 1 done, axis panning next);
    an AGENTS.md "Decided" entry: heatmaps run over positions + watchlist
    only, and a move's basis (`live` / `last_close`) is disclosed.

## Out of scope

- Any market-wide universe (browse/discovery page, sector ETFs as a proxy
  market): needs a data source the app doesn't have.
- Peer/sector relative-performance overlay on the chart (Phase 2, own spec;
  check `PeersTab` for overlap first).
- Axis panning (next, own spec).
- FX-inclusive day P&L.
- Removing `sector_exposure` from the insights payload once `ExposureCard`
  stops reading it — a separate backend cleanup.
- The phone-width `Sidebar` overflow.

## Open questions for review

1. **`ExposureCard` sector donut removal** (step 6). Recommended, because the
   heatmap's sector headers show the same weights. Keeping it is harmless
   but repeats sector allocation on one page.
2. **Defaults** — heatmap: Today; MoversCard: Since purchase. Swap if you'd
   rather both open on Today.
3. **Grid view on the Research page rail too?** Scoped to the Advanced View
   for now; enabling it elsewhere is one prop.
