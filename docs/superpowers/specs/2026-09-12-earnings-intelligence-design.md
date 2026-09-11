# Earnings intelligence: quarterly trend insights + chart markers (Slice 4)

## Context

SaxoDash (DRF backend, Vite + React 19 frontend). Slices 1+3 (Research
connective tissue + depth) and 2 (Dashboard command centre) are merged to
local `main`. This is **Slice 4** from the original 6-slice audit roadmap:
earnings comparative insights ("revenue growth accelerated from 8% to 14%",
"beat EPS but revenue growth slowed") and earnings markers on the Research
price chart.

## Data-reliability finding (settled before design)

The audit's original plan assumed historical revenue could come from
`/calendar/earnings` queried with a wide backward date range for one symbol.
That is **already known not to work**: `research/earnings.py`'s
`_eps_history` docstring records that `/calendar/earnings` "only reliably
carries the *next* date, not deep history" — which is exactly why the
existing EPS-history charts read from `/stock/earnings` instead. And
`/stock/earnings` carries no revenue field at all (confirmed against the
live capture in `docs/notes/2026-09-05-finnhub-live-capture.md`).

**Decision:** revenue-growth commentary uses `salesPerShare` from Finnhub's
`series.quarterly` block (part of the `/stock/metric` bundle already fetched
for fundamentals, currently discarded beyond the `series.annual` work in
Slice 3). It is a **per-share proxy, not raw revenue in dollars** — every
piece of UI copy says "revenue per share," never bare "revenue," so nothing
overstates what the free tier actually gives us. EPS growth and margin
trends (gross/net/operating) use the same `series.quarterly` block directly
— those are real reported ratios, not proxies.

## Decisions (settled during brainstorming)

- **Insight card lives only on the Research Earnings tab**, above the
  existing `EpsBarChart`. Not on the Earnings calendar page, not on Overview.
- **Chart markers**: a small beat/miss/in-line tick on the Research price
  chart at each past earnings date, using the EPS history already fetched
  by `useSymbolEarnings` — no new endpoint. Exact-date match only against
  the bars on screen; a marker whose date isn't in the loaded bars (rare —
  a provider date landing on a non-trading day) is silently skipped, not
  fuzzy-matched. That keeps the mapping a straight lookup, no new failure
  mode to reason about.
- **Derivation is frontend, pure, and tested in isolation** — same
  architecture as `lib/snapshot.js` (Slice 3): the backend shapes raw
  quarterly numbers, the frontend computes the comparisons and produces the
  sentences. No backend insight-text generation.
- **No new provider, no new endpoint on the markers side.** One additive
  field on the existing fundamentals payload for the trend data.

## Out of scope (later slices / not this pass)

- Company comparison / peers / discovery (Slice 5).
- Earnings calendar page (`pages/Earnings.jsx`) — untouched.
- Any raw-dollar revenue figure — the free tier cannot support one reliably
  per quarter; do not fabricate one from `salesPerShare` × an assumed share
  count.
- Chart markers beyond price — no volume-pane or sub-pane markers.

---

## Backend

### `research/finnhub.py` — `quarterly_trends`

Finnhub's `/stock/metric` response already carries
`series.quarterly.<name>` as `[{"period": "YYYY-MM-DD", "v": <number>}, ...]`,
newest first (confirmed in the live capture; quarterly `_metric_names`
include `eps`, `salesPerShare`, `grossMargin`, `netMargin`,
`operatingMargin`, among others).

```python
QUARTERLY_TREND_KEYS = {
    'eps': 'eps',
    'revenue_per_share': 'salesPerShare',
    'gross_margin': 'grossMargin',
    'net_margin': 'netMargin',
    'operating_margin': 'operatingMargin',
}
QUARTERLY_MIN_POINTS = 8   # two YoY comparisons need index-5..index-1 to exist
QUARTERLY_TREND_POINTS = 12  # cap at ~3 years, oldest-first
```

`_quarterly_trends(financials)`:

1. Read `financials['series']['quarterly']`; empty/missing → `None`.
2. Build `{period: v}` maps for `eps` and `salesPerShare` (the two keys the
   insight math needs on every row). Rows where **either** is absent for a
   period are dropped — the insight math needs both eps and the revenue
   proxy at the same period, and a partial row would silently break the
   index-4 (same-quarter-prior-year) alignment the frontend relies on.
3. Sort the surviving periods ascending (oldest first — Finnhub sends
   newest first).
4. For each surviving period, also look up `grossMargin` / `netMargin` /
   `operatingMargin` at that exact period from their own `{period: v}` maps;
   missing → `None` for that field only (margins are supplementary, not
   required to keep a row).
5. Take the last `QUARTERLY_TREND_POINTS` rows.
6. If fewer than `QUARTERLY_MIN_POINTS` rows survive, return `None` — the
   insight card degrades to "not enough quarterly history," never computes
   from a too-short series.

Each row: `{'period': str, 'eps': float, 'revenue_per_share': float,
'gross_margin': float | None, 'net_margin': float | None,
'operating_margin': float | None}`.

In `to_fundamentals`, add conditionally (same pattern as `valuation_history`
in Slice 3):

```python
trends = _quarterly_trends(financials)
if trends:
    shaped['quarterly_trends'] = trends
```

### Cache version bump

The fundamentals payload shape changes again. Bump `finnhub.CACHE_V` from
`'v2'` to `'v3'` (same rationale as the `v1→v2` bump in Slice 3 — a deploy
must never hand new code an old-shaped cached entry).

### No other backend change

Chart markers reuse `GET /api/research/earnings/<symbol>/` unchanged — its
`history` array (`{date, eps_actual, eps_estimate, eps_surprise_pct}`,
oldest-first) already carries everything a marker needs.

### Backend testing (`research/tests.py`)

- `QuarterlyTrendsTest`: a fixture `series.quarterly` with 10+ aligned
  `eps`/`salesPerShare` periods plus partial margin coverage → asserts row
  count, ordering (oldest-first), a margin `None` where the fixture omits
  it, and the `QUARTERLY_TREND_POINTS` cap. A fixture with only 5 aligned
  periods → `_quarterly_trends` returns `None` and `to_fundamentals` omits
  `quarterly_trends` entirely. A fixture with `eps` but no `salesPerShare`
  at a given period → that period dropped, not included with a null.
- Extend the cache-key test: `finnhub._cache_key('AAPL') ==
  'research:fundamentals:v3:AAPL'`.
- Full `research` suite still green (confirms no regression from the
  `CACHE_V` bump).

---

## Frontend

### `lib/earningsInsights.js` (new) — pure, no React, no query

```js
const YOY_LOOKBACK = 4          // quarters
const ACCEL_THRESHOLD_PP = 3    // pp change in YoY rate to call it accel/decel
const EPS_GAP_THRESHOLD_PP = 5  // pp gap between EPS and revenue-per-share YoY
const MARGIN_MOVE_THRESHOLD_PP = 1
```

- `yoyGrowthSeries(values)` → same-length array; entry `i` is the % change
  vs `values[i - 4]`, or `null` when `i < 4`, `values[i-4]` is `null`/`0`, or
  `values[i]` is `null`.
- `buildEarningsInsights(trends)` → `Array<{tone, text}>`, `tone` one of
  `'pos' | 'neutral' | 'caution'` (reusing the Slice-3 vocabulary). Returns
  `[]` when `trends` is falsy or has fewer than `QUARTERLY_MIN_POINTS` (8)
  rows — the component treats `[]` as "not enough history," not silence.

  Computed once: `revGrowth = yoyGrowthSeries(trends.map(t =>
  t.revenue_per_share))`, `epsGrowth = yoyGrowthSeries(trends.map(t =>
  t.eps))`, `latest = trends.length - 1`, `prior = latest - 1`.

  Up to 3 insights, each included only when computable (no filler text):

  1. **Revenue-per-share acceleration** — needs `revGrowth[latest]` and
     `revGrowth[prior]` both non-null.
     `diff = revGrowth[latest] - revGrowth[prior]`.
     - `diff > ACCEL_THRESHOLD_PP` → `pos`, `"Revenue per share growth
       accelerated from {prior}% to {latest}% year over year."`
     - `diff < -ACCEL_THRESHOLD_PP` → `caution`, `"...decelerated from
       {prior}% to {latest}%..."`
     - otherwise → `neutral`, `"Revenue per share growth held steady
       around {latest}% year over year."`
  2. **EPS vs. revenue-per-share gap** — needs `epsGrowth[latest]` and
     `revGrowth[latest]` both non-null.
     `gap = epsGrowth[latest] - revGrowth[latest]`.
     - `gap > EPS_GAP_THRESHOLD_PP` → `pos`, `"EPS grew faster than revenue
       per share, consistent with margin expansion."`
     - `gap < -EPS_GAP_THRESHOLD_PP` → `caution`, `"EPS grew slower than
       revenue per share, consistent with margin pressure."`
     - otherwise omitted (no signal worth a sentence).
  3. **Margin move YoY** — prefers `operating_margin`, falls back to
     `net_margin` when operating is `None` at both `latest` and
     `latest - YOY_LOOKBACK`; needs both endpoints non-null for whichever
     margin is used.
     `delta = trends[latest][key] - trends[latest - YOY_LOOKBACK][key]`.
     - `delta > MARGIN_MOVE_THRESHOLD_PP` → `pos`, `"{Label} margin
       expanded from {old}% to {new}% year over year."`
     - `delta < -MARGIN_MOVE_THRESHOLD_PP` → `caution`, `"...contracted..."`
     - otherwise omitted.

  All percentages rounded to 1 decimal in the sentence. Every function here
  is pure and takes/returns plain data — no formatting helpers from
  `lib/format.js` inside this module (the component formats; this module
  only decides *what* to say).

### `components/research/EarningsInsights.jsx` (new)

`props: { fundamentals }` — the raw `useFundamentals` result, gated through
the existing `FundamentalsGate` (title "What changed", fallback "Earnings
trend data is unavailable for this symbol."). Inside the gate:

```jsx
const insights = buildEarningsInsights(data.quarterly_trends)
```

- `insights.length === 0` → a plain line: "Not enough quarterly history yet
  for trend commentary." (distinct from the gate's own unavailable state —
  fundamentals *are* available, there just isn't enough quarterly depth).
- Otherwise, a short list, each row = the same tone-dot treatment
  `SnapshotSection` uses (`bg-emerald-400` / `bg-zinc-500` / `bg-amber-400`)
  + the sentence. No chart here — this card is prose, the numbers are
  already in the `EpsBarChart` below it.

### `EarningsTab.jsx` wiring

- Accepts a new `fundamentals` prop.
- Render order becomes: `NextEarningsCard` → `EarningsInsights` →
  `EpsBarChart` → `BeatRecord` (insight card sits between "what's coming"
  and "here's the historical chart," priming the reader before the
  numbers).

### `pages/Research.jsx` wiring

`<EarningsTab symbol={symbol} earnings={earnings} fundamentals={fundamentals} />`
— `fundamentals` is already fetched there for Overview/Valuation; no new
query, no new network call.

### Chart markers

`lib/research.js` — new pure helper:

```js
export function earningsMarkersForBars(bars = [], history = []) {
  const indexByDate = new Map(bars.map((b, i) => [b.date, i]))
  const markers = []
  for (const e of history) {
    const index = indexByDate.get(e.date)
    if (index == null) continue
    markers.push({
      index, date: e.date, sign: surpriseSign(e.eps_surprise_pct),
      actual: e.eps_actual, estimate: e.eps_estimate,
    })
  }
  return markers
}
```

Imports `surpriseSign` from `lib/charts.js` (one-directional import;
`charts.js` only imports from `lib/format.js`, so no cycle).

`pages/Research.jsx`:

```js
const earningsMarkers = useMemo(
  () => earningsMarkersForBars(bars, earnings.data?.available ? earnings.data.history : []),
  [bars, earnings.data],
)
```

passed to `<ChartPanel ... earningsMarkers={earningsMarkers} />`. Computed
from the same range-sliced `bars` that `ChartPanel`/`TVChart` already
render, so marker `index` values line up with `xAt(index)` with no
re-mapping inside the chart.

`components/research/ChartPanel.jsx` — accepts `earningsMarkers = []`,
forwards to `<TVChart ... earningsMarkers={earningsMarkers} />`.

`components/research/TVChart.jsx`:

- `ChartBody` (already `memo`-wrapped) gains an `earningsMarkers` prop,
  added to its prop list so memoisation still keys off it correctly.
- Import `BEAT, MISS, REPORTED` from `lib/charts.js` (the same three colours
  the Earnings calendar and `BulletBar` already use — no new colour
  introduced).
- Render each marker as a small triangle at the bottom of the price pane
  (`y = PAD_T + chartH - 6`), `x = xAt(marker.index)`, fill by
  `[MISS, REPORTED, BEAT][marker.sign + 1]`, with a native `<title>` child
  (`"{date}: {actual} vs est {estimate}"`, or just the date when `actual`
  is `null`) so hovering shows the browser's own tooltip — no new
  interactive state, consistent with the panel's "prop-driven, fetches
  nothing" design.
- `TVChart`'s own prop signature gains `earningsMarkers = []` and forwards
  it into `ChartBody`.

### Frontend testing

- `lib/earningsInsights.test.js`: `yoyGrowthSeries` (basic case, `null`
  guard at `i<4`, zero/`null` denominator); `buildEarningsInsights` —
  acceleration case, deceleration case, steady case, the EPS-vs-revenue gap
  in both directions and the "no signal" omission, a margin-expansion case
  using `operating_margin`, a fallback-to-`net_margin` case, and the `< 8`
  rows → `[]` case.
- `components/research/EarningsInsights.test.jsx`: renders sentences from a
  fixture `quarterly_trends`; shows the "not enough quarterly history" line
  when `quarterly_trends` is absent from otherwise-available fundamentals;
  defers to `FundamentalsGate`'s own unavailable state when
  `available: false`.
- `lib/research.test.js`: extend with `earningsMarkersForBars` — maps a
  history row onto the matching bar index and sign; skips a history date
  absent from `bars`; empty `history` → `[]`.
- `components/research/TVChart.test.jsx`: read the existing file first to
  match its assertion style; add a case asserting a marker element renders
  at the expected index for a beat and for a miss (colour or `<title>`
  text), and that no marker renders for an index outside the current
  `data` (already filtered upstream, but the component should not crash if
  handed one — cheap defensive test).
- `pages/Research.test.jsx`: extend `stubQueries`' `useSymbolEarnings` mock
  data (already exists) if a new assertion needs specific history rows;
  otherwise no change required since the wiring is prop-only.

---

## Build order

1. **Backend** — `_quarterly_trends`, `to_fundamentals` wiring, `CACHE_V`
   bump, full test coverage.
2. **Frontend derivation** — `lib/earningsInsights.js` + tests (no UI yet).
3. **Frontend insight card** — `EarningsInsights.jsx` + tests, wire into
   `EarningsTab.jsx` + `Research.jsx`.
4. **Frontend chart markers** — `earningsMarkersForBars` + tests, `TVChart`
   rendering + tests, `ChartPanel` + `Research.jsx` wiring.

## Gates

Backend `manage.py test`, frontend `npm test` + `npm run lint` + `npm run
build` green at the end of every build-order step. No raw revenue figure
ever presented as real; every proxy labeled as a proxy; insufficient data
renders a plain "not enough history" line, never a computed sentence from
too few points.
