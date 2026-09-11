# Dashboard command centre — portfolio intelligence + "What changed?" (Slice 2)

## Context

SaxoDash (DRF backend, Vite + React 19 frontend). A 2026-09-10 product audit
decomposed a large optimisation brief into six slices. Slices 1 and 3
(connective tissue + Research depth) merged to local `main` 2026-09-10
(`docs/superpowers/specs/2026-09-10-research-workspace-connective-tissue-design.md`).

This is **Slice 2**: turn the Dashboard from a flat summary into a command
centre that answers *what happened → does it matter → what needs attention*,
using data already in the app. The audit's Phase 7 (portfolio intelligence)
and Phase 10 ("what changed?" layer).

## Decisions (settled during brainstorming)

- **Reorganise the Dashboard around a value hero** (net worth + deltas + a
  "needs attention" band + movers/contributors on top; the existing tables
  move below). Not a bolt-on band.
- **Change metric = daily net-worth-snapshot deltas.** Saxo SIM has no quote
  feed, so there is no intraday figure. `core.NetWorthSnapshot` is written
  once a day; "day change" = latest vs previous snapshot ("since yesterday's
  close"), plus 7d / 30d / YTD / all-time from snapshot history. Labelled
  end-of-day, never "live". No new per-position price-history storage.
- **One backend aggregation endpoint**, `GET /api/portfolio/insights/`,
  server-computed, shaped, tested. Matches `analytics/report.py` +
  `portfolio/services.py` patterns.
- **Dashboard only** this slice. The Portfolio page is untouched.
- **Charts kept and added.** The allocation pie stays. New: a sector-exposure
  donut, a small currency-exposure donut, a contributors diverging bar chart,
  and a hero sparkline. The user likes charts — this slice adds, never
  removes, visualisation.

## Out of scope (later slices / not this pass)

- Per-position period change and any per-position price-history table + sync.
- Any Portfolio / Analytics / Earnings page change.
- Live / intraday anything.
- Alert acknowledgement or any persisted "I've seen this" state — the
  attention band is passive and recomputed every load.
- Push notifications / email.
- Endpoint-level caching (the queries are trivial; the one external call —
  earnings — is already cached inside `research`).

---

## Backend

### 1. `portfolio/insights.py` (new)

Composes the payload from three sources, all read-only:

- `portfolio.models.Position.objects.all()` — `value`, `cost`, `pnl`,
  `pnl_pct`, `weight`, `sector`, `currency`, `price_source`, `ticker`,
  `name`, `color`. `value`/`cost`/`pnl` are already in `REPORTING_CURRENCY`
  (safe to sum); `currency` is the instrument's own currency (what
  "currency exposure" wants).
- `core.models.NetWorthSnapshot.objects.order_by('date')` — `(date,
  portfolio_value, bank_total, net_worth)`.
- `research.earnings` — for held names reporting soon. **Function-level
  import** inside `insights.py` to avoid the `portfolio ↔ research` module
  cycle (`research.earnings` already imports `portfolio.models`). Wrapped
  best-effort: any exception ⇒ `upcoming_earnings = None`, the rest of the
  payload still returns.

Module constants for every threshold:

```python
STALE_DAYS = 2
SINGLE_NAME_PCT = 30
TOP3_PCT = 60
EARNINGS_SOON_DAYS = 7
EARNINGS_HORIZON_DAYS = 14
SPARK_POINTS = 30
MOVERS = 3
CONTRIBUTORS = 8
```

**Public function** `build_insights() -> dict`:

```jsonc
{
  "as_of": "2026-09-10" | null,        // latest snapshot date
  "stale": false,                       // latest snapshot older than STALE_DAYS
  "value": {                            // rounded decimals, REPORTING_CURRENCY
    "net_worth": …, "portfolio": …, "bank": …
  },
  "change": {                          // portfolio leg only, from snapshots
    "day":   {"abs": …, "pct": …} | null,   // latest vs previous snapshot
    "week":  … | null,                       // trailing 7 calendar days
    "month": … | null,                       // trailing 30
    "ytd":   … | null,
    "all_time": … | null                     // first snapshot vs latest
  },
  "spark": [ {"date": "2026-08-12", "value": 30112.4}, … ],   // last SPARK_POINTS portfolio values, oldest-first
  "concentration": {
    "top1": {"ticker": "NVDA", "pct": 34.2} | null,
    "top3_pct": 61.0 | null,
    "hhi": 0.21 | null,                 // sum((value/total)**2), 0..1
    "positions": 6
  },
  "sector_exposure":   [ {"name": "Technology", "pct": 55.0, "value": …}, … ],   // desc by value
  "currency_exposure": [ {"currency": "USD",    "pct": 72.0, "value": …}, … ],   // desc by value
  "movers": {                          // by all-time pnl_pct
    "best":  [ {"ticker","name","pnl_pct","pnl","value"}, … ≤ MOVERS ],
    "worst": [ … ≤ MOVERS ]
  },
  "contributors": [                    // desc by abs(contribution_pp), ≤ CONTRIBUTORS
    {"ticker","pnl","contribution_pp","share_of_gain_pct"}
  ],
  "attention": [ {"kind","severity","text","ticker"?}, … ],  // most severe first, then by the fixed kind order below; `ticker` present only on `earnings_soon`
  "upcoming_earnings":                // held tickers, date >= today, not yet reported, <= EARNINGS_HORIZON_DAYS, soonest first
    [ {"ticker","date","days_until","session","eps_estimate"} ] | null
}
```

Helpers (all in `insights.py`, unit-tested):

- `_delta(pairs, cutoff_date) -> {"abs","pct"} | None` — `pairs` is
  date-ascending `(date, Decimal)`. Take the last pair as the end; the anchor
  is the first pair with `date >= cutoff_date`, or `None` if fewer than 2
  usable points. `pct` guards divide-by-zero (anchor value 0 ⇒ `pct: None`,
  `abs` still returned).
- `_day_delta(pairs)` — last two pairs; `None` if `< 2`.
- `_concentration(positions, total)` — `top1`, `top3_pct`, `hhi`,
  `positions`; all `None`/`0` for an empty book.
- `_exposure(positions, total, key)` — group `value` by `key` (`sector` /
  `currency`), `[{<key-name>, pct, value}]` desc. Blank/empty key label ⇒
  `"Unknown"`.
- `_movers(positions)` — sort by `pnl_pct`; take head and tail; a position
  with `cost == 0` (⇒ `pnl_pct` is `0`) is eligible but sorts as flat.
- `_contributors(positions, total_cost)` — `contribution_pp = pnl /
  total_cost * 100`, `share_of_gain_pct = pnl / total_pnl * 100` (guard both
  denominators). Sort desc by `abs(contribution_pp)`.
- `_attention(...)` — appends, in this fixed order, when the rule fires:

  | kind | condition | severity | text example |
  |---|---|---|---|
  | `single_name` | `top1.pct >= SINGLE_NAME_PCT` | `warn` | `NVDA alone is 34% of the portfolio.` |
  | `concentration` | `top3_pct >= TOP3_PCT` | `warn` | `Top 3 holdings are 61% of the portfolio.` |
  | `stale_value` | latest snapshot age `> STALE_DAYS` | `warn` | `Portfolio value is 4 days old (last Sep 6).` |
  | `price_basis` | any position `price_source != 'live'` | `info` | `3 holdings are priced off Saxo P/L, not a live quote.` |
  | `earnings_soon` | a held ticker reports within `EARNINGS_SOON_DAYS` | `info` | `MSFT reports in 3 days.` (soonest only; item also carries `"ticker": "MSFT"`) |
  | `no_history` | `< 2` snapshots | `info` | `Not enough history yet for change metrics.` |

- `_upcoming_earnings(held_tickers, today)` — best-effort. Calls
  `research.earnings.window_earnings('mine', 0)` and `('mine', 1)`, merges
  `events`, keeps rows whose `symbol` is held, `date >= today`, `eps_actual
  is None`, `date <= today + EARNINGS_HORIZON_DAYS`; sorts by date; maps to
  the shape above with `days_until`. Any exception (feed down, shape change)
  ⇒ return `None`, logged at WARNING.

Change series uses the **portfolio leg** (`portfolio_value`), not `net_worth`
— the slice is about the investment book. `_delta` reuses nothing from
`analytics/metrics.py` (different anchor semantics: by-date, abs+pct); it is
its own ~10-line helper.

### 2. `portfolio/views.py`

```python
class PortfolioInsightsView(APIView):
    def get(self, request):
        return Response(insights.build_insights())
```

Authenticated (project default). No throttle scope — it hits our own DB, not
a provider; the one external call inside is `research.earnings`'s, already
throttled/cached there.

### 3. `portfolio/urls.py`

```python
path('insights/', PortfolioInsightsView.as_view(), name='portfolio-insights'),
```

### Backend testing (`portfolio/tests.py`)

- `insights` unit tests (plain `TestCase`, build fixtures with the ORM):
  - `_delta` — day/week/ytd over a fixture snapshot series; `< 2` points ⇒
    `None`; anchor value 0 ⇒ `pct None`, `abs` present.
  - `_concentration` — HHI and top-N maths on a known book; empty book ⇒
    nulls.
  - `_exposure` — sector and currency grouping, ordering, blank key ⇒
    `"Unknown"`.
  - `_movers` / `_contributors` — ordering, `≤ MOVERS` / `≤ CONTRIBUTORS`,
    zero-denominator guards.
  - `_attention` — each rule fires exactly at its threshold and not below;
    order is stable; `no_history` with one snapshot.
  - `_upcoming_earnings` — `@patch('portfolio.insights.<lazy import path>')`
    or patch `research.earnings.window_earnings`; held filter + horizon +
    unreported filter; exception ⇒ `None`.
  - `build_insights` — empty portfolio + zero snapshots returns a
    well-formed payload (nulls, `no_history`), does not raise.
- `PortfolioInsightsView` `APITestCase`:
  - auth required (401 without token);
  - happy path — seed positions + snapshots, assert the top-level keys and a
    couple of computed values;
  - earnings feed unavailable (mock raising) ⇒ `200`, `upcoming_earnings is
    None`;
  - no positions ⇒ `200`, sane nulls/zeros.

---

## Frontend

### 1. Client + query

- `api/client.js`: `getPortfolioInsights = () => apiFetch('/api/portfolio/insights/')`.
- `api/queries.js`: `queryKeys.portfolioInsights = ['portfolio-insights']`;
  `usePortfolioInsights()` — `staleTime: 5 * 60_000`, no refetch interval
  (EOD data).

### 2. New components — `components/dashboard/`

Each is a small presentational component taking plain props (no direct query
use), so it renders in isolation under test.

- **`HeroValue.jsx`** — `props: { value, change, spark }`.
  Big `net_worth` (reuse the `--fig-2xl`/mono treatment), a row of delta
  pills — Day / Week / Month / YTD — each `{abs, pct}` coloured
  green/red, `—` when the entry is `null`; `portfolio` and `bank` as small
  sub-values. A ~44px-tall Recharts `AreaChart` sparkline of `spark`
  (`isAnimationActive={false}`, no axes/grid/tooltip, single stroke + faint
  fill). Empty `spark` ⇒ no sparkline, no gap.
- **`AttentionBand.jsx`** — `props: { items }`.
  `items` as a wrap row of chips: `warn` → amber tint, `info` → zinc tint,
  a matching Lucide icon. A chip links when its `kind` maps to a target:
  `concentration` / `single_name` / `price_basis` → `/portfolio`;
  `earnings_soon` → `researchHref(item.ticker, 'earnings')` (the backend puts
  the ticker on the item, so no prose parsing). Other kinds render as plain
  chips. Empty `items` ⇒ a single muted "Nothing needs attention right now."
  line.
- **`MoversCard.jsx`** — `props: { movers }`. Two labelled columns
  (Gainers / Losers), each ≤3 rows: ticker (links via `researchHref`),
  `pnl_pct` coloured, a 2px inline proportional bar. Empty ⇒ "No holdings yet".
- **`ContributorsCard.jsx`** — `props: { contributors }`. A Recharts
  vertical `BarChart` of `contribution_pp`, green/red `Cell`s, centre
  baseline, ticker on the Y axis (same idiom as `GainersLosersChart`).
  A caption: "Each holding's share of total return." Empty ⇒ placeholder.
- **`UpcomingEarnings.jsx`** — `props: { items }` (`insights.upcoming_earnings`).
  `null` ⇒ render nothing. `[]` ⇒ "No holdings report in the next 2 weeks."
  Otherwise ≤5 rows: ticker → `researchHref(ticker,'earnings')`, the date,
  `days_until` as "in 3 days", session tag, EPS estimate.
- **`ExposureCard.jsx`** — `props: { sector, currency, concentration }`.
  A sector donut (Recharts `PieChart`, `innerRadius`, the `SECTOR_PALETTE`
  already in `Portfolio.jsx` — lift it to `lib/charts.js`) with a legend;
  a small currency donut beside it, or — when `currency.length === 1` — the
  text "100% USD". A caption line from `concentration`:
  "Top 3: 61% · HHI 0.21 · 6 positions" (each part omitted if its value is
  `null`).

Chart styling reuses `lib/charts.js` (`chartTooltipProps`, palette). Lift
`SECTOR_PALETTE` from `Portfolio.jsx` into `lib/charts.js` and import it in
both places (no behaviour change to Portfolio).

### 3. Dashboard reorganisation (`pages/Dashboard.jsx`)

Hooks: **add** `usePortfolioInsights()`; **remove** `useNetWorth()`. Keep
`usePortfolioSummary()` (feeds the existing allocation pie unchanged),
`usePositions()` (Top-positions table), `useTransactions('?page_size=5')`.

Loading / error gate: fail if `insightsQuery.error || positionsQuery.error`;
show a `Skeleton` layout (hero block + band + chart placeholders) while
`!insightsQuery.data`.

New render order:

1. `PageHeader` (unchanged copy).
2. `<HeroValue value={insights.value} change={insights.change} spark={insights.spark} />`
3. `<AttentionBand items={insights.attention} />`
4. `<div className="grid gap-4 lg:grid-cols-2">` `<MoversCard movers={insights.movers} />` `<ContributorsCard contributors={insights.contributors} />` `</div>`
5. `<UpcomingEarnings items={insights.upcoming_earnings} />`
6. `<NetWorthChart />` (unchanged, moved here).
7. `<div className="grid gap-4 lg:grid-cols-2">` — **left:** the existing
   "Top positions" `Card` + table (unchanged, still links each ticker via
   `researchHref`); **right:** a column with the existing **Allocation pie
   `Card`** (unchanged) stacked above the new `<ExposureCard … />`.
8. Recent transactions `Card` (unchanged, bottom).

Everything below the fold (top-positions table, allocation pie, recent
transactions) keeps its current markup — this slice adds above it and moves
the net-worth chart, it does not rewrite the tables.

### Frontend testing

- `api/client.test.js` — `getPortfolioInsights` hits `/api/portfolio/insights/`.
- Component tests (Testing Library, plain props):
  - `HeroValue` — renders the value, a green and a red delta pill, `—` for a
    `null` entry, no sparkline when `spark` is `[]`.
  - `AttentionBand` — a `warn` and an `info` chip; an `earnings_soon` chip
    links to the Research earnings tab; empty ⇒ the "nothing" line.
  - `MoversCard` — gainers/losers split, ticker links, empty state.
  - `ContributorsCard` — renders bars for N contributors; empty placeholder.
  - `UpcomingEarnings` — `null` ⇒ nothing; `[]` ⇒ the two-weeks line; rows
    link to `researchHref(ticker,'earnings')`.
  - `ExposureCard` — sector legend entries; single-currency ⇒ "100% USD"
    text not a donut; caption assembles from `concentration`.
- **`pages/Dashboard.test.jsx` (new)** — mock `../api/queries`
  (`usePortfolioInsights`, `usePositions`, `usePortfolioSummary`,
  `useTransactions`); assert the hero value + a delta render, an attention
  chip renders, `MoversCard` shows a held ticker, and the loading state
  renders `Skeleton`s (no `usePortfolioInsights` data).

---

## Build order

1. **Backend** — `portfolio/insights.py` + helpers + `PortfolioInsightsView`
   + URL + full `portfolio/tests.py` coverage.
2. **Frontend data** — `getPortfolioInsights`, `usePortfolioInsights`,
   `client.test.js` case.
3. **Frontend components** — lift `SECTOR_PALETTE` to `lib/charts.js`; build
   `components/dashboard/*` with their tests.
4. **Dashboard reorg** — rewire hooks, new render order, `Dashboard.test.jsx`,
   skeleton loading.

## Gates

Per `AGENTS.md`: `APITestCase` per app is primary backend coverage; vitest
specs alongside every frontend change. Backend `manage.py test`, frontend
`npm test` + `npm run lint` + `npm run build` all green at the end of every
build-order step. No fake data rendered as real; `null` / empty / loading
kept visually distinct (`—`, empty-state lines, `Skeleton`). Every change
metric is labelled end-of-day, never "live".
