# Research workspace: connective tissue + Research depth (Slice 1 + 3)

## Context

SaxoDash is a personal finance dashboard (DRF backend, Vite + React 19
frontend) against the live Saxo OpenAPI, with Finnhub free tier for company
fundamentals and earnings, and self-computed analytics from a daily
`NetWorthSnapshot`. Seven pages: Dashboard, Portfolio, Analytics, Research,
Earnings, Transactions, Accounts.

A full-product audit (2026-09-10) found the app is a set of pages, not a
workspace: the core path *holding -> research that company* does not exist
(no clickable rows, no global search), there is no "what changed?" layer, and
Research under-uses data it already fetches (the Finnhub `/stock/metric`
bundle returns 134 metric fields plus a decades-deep `series` block; the code
surfaces ~8 fields and discards `series`). "Market context" is a permanent
`ComingSoon`. No news anywhere.

The audit decomposed the work into six independently shippable slices. This
spec covers **Slice 1 (connective tissue)** and **Slice 3 (Research depth)**,
chosen together because they deliver most of the "what happened -> why -> does
it matter -> what next" arc. A *consolidate-only* design pass is threaded
through (no restyle).

## Decisions (settled during brainstorming)

- **Global search = a Cmd/Ctrl+K command palette overlay**, not a new top bar
  and not a sidebar field. No new persistent chrome, no per-page layout
  change, fits the terminal feel.
- **Investment Snapshot = grouped metric rows + a one-line rule-based verdict
  per group. No composite score.** Every number traceable to a source; the
  rules are stated in an `InfoTip`. A black-box 0-100 score was rejected even
  with methodology shown.
- **Company news replaces the "Market context" tab.** Macro / Buffett
  indicator / CAPE stay deferred (need FRED + another source) exactly as
  `AGENTS.md` already records.
- **The Saxo instrument-reference card is demoted to a thin metadata strip**
  (Exchange / Currency / ISIN / Uic / Lot size / Asset type), freeing the
  Overview grid for company + snapshot content.
- **Design pass is consolidate-only**: token scale, stat strips, skeletons,
  responsive fixes. No change to the palette, the radial page-glow, card
  gradients or shadows.

## Out of scope (later slices, do not pull forward)

- Peers, company-comparison view, screener, curated discovery lists (Slice 5).
- Watchlist "what changed since last look" (Slice 5).
- Earnings comparative narrative -- "revenue growth accelerated 8% -> 14%",
  "beat EPS but revenue slowed", margin-vs-revenue reads (Slice 4). This spec
  uses `series.annual` for valuation ranges only, not `series.quarterly` for
  growth-acceleration prose.
- Market-context data of any kind (macro, Buffett, CAPE).
- Any new data provider; Finnhub stays free tier; no new background sync.
- A persistent top bar; any restyle; touching colors / glow / gradients.
- Real-time / intraday quotes -- Saxo SIM has no market-data entitlement
  (structural, unchanged).

---

## Backend

All changes live in the existing `research` app. No new Django app, no new
models, no Celery task. Mirrors `research/market.py` / `research/finnhub.py`
conventions: call -> shape (snake_case) -> cache with a per-endpoint TTL, and
translate failures through `research/providers.py` (`provider_response`).

### 1. `research/finnhub.py` -- widen `to_fundamentals`

The backend already calls `get_basic_financials(symbol)` ->
`/stock/metric?metric=all`, whose response is
`{"metric": {...134 keys...}, "series": {"annual": {...}, "quarterly": {...}}}`.
Today `to_fundamentals` reads ~8 keys from `metric` and ignores `series`.

Add these keys to the shaped payload, each via the existing `_metric()`
helper (returns `None` when absent -- never defaulted to zero). Field names
are verified against the live capture in
`docs/notes/2026-09-05-finnhub-live-capture.md`:

| Output field                | Finnhub `metric` key            |
|-----------------------------|---------------------------------|
| `revenue_growth_ttm_yoy`    | `revenueGrowthTTMYoy`           |
| `eps_growth_ttm_yoy`        | `epsGrowthTTMYoy`               |
| `revenue_growth_3y`         | `revenueGrowth3Y`               |
| `revenue_growth_5y`         | `revenueGrowth5Y`               |
| `eps_growth_3y`             | `epsGrowth3Y`                   |
| `operating_margin_ttm`      | `operatingMarginTTM`            |
| `operating_margin_5y`       | `operatingMargin5Y`             |
| `gross_margin_5y`           | `grossMargin5Y`                 |
| `net_margin_5y`             | `netProfitMargin5Y`             |
| `debt_to_equity`            | `totalDebt/totalEquityQuarterly`|
| `long_term_debt_to_equity`  | `longTermDebt/equityQuarterly`  |
| `interest_coverage`         | `netInterestCoverageTTM`        |
| `quick_ratio`               | `quickRatioQuarterly`           |

(`eps_growth_5y` is already emitted via `epsGrowth5Y`; keep it.) The two keys
containing `/` are ordinary dict keys -- `financials['metric'].get('totalDebt/totalEquityQuarterly')`
works unchanged; `_metric()` already does `(financials.get('metric') or {}).get(key)`.

### 2. `research/finnhub.py` -- `valuation_history` from `series.annual`

`research/finnhub.py` gains `import statistics` and widens its datetime
import to `from datetime import date, datetime, timedelta, timezone` for the
helpers below.

Add a `_valuation_history(financials)` helper. `series.annual.<name>` is a
list of `{"period": "YYYY-MM-DD", "v": <number>}`, newest first, for names
including `pe`, `ps`, `pb`, `evEbitda` (confirmed in the live-capture
`_metric_names`). For each of those four:

```python
def _series_stats(series_annual, key):
    points = [p["v"] for p in (series_annual.get(key) or []) if p.get("v") is not None]
    if not points:
        return None
    return {
        "latest": points[0],                 # newest first
        "min": min(points),
        "median": round(statistics.median(points), 2),
        "max": max(points),
        "n": len(points),
    }
```

Emit `valuation_history` as `{"pe": <stats|omitted>, "ps": ..., "pb": ...,
"ev_ebitda": ...}`, dropping any sub-key whose stats are `None`. Omit the
whole `valuation_history` key when `financials.get("series")` is missing or
`series.get("annual")` is empty -- a shape change degrades to "no history
context", never a 500 (consistent with `FinnhubUnexpected` handling: a
`KeyError`/`TypeError`/`IndexError` inside `produce()` is already caught and
turned into `FinnhubUnexpected`, a 200 with `available: false`).

No cap on how many annual points `series` carries; `_series_stats` uses them
all. Typical depth is ~20-30 years; that is fine for min/median/max.

### 3. Fundamentals cache-key version bump

`fundamentals()` caches under `research:fundamentals:{symbol}` with no version
segment. Adding fields changes the payload shape. Introduce a module-level
`CACHE_V = "v2"` and key on `f"research:fundamentals:{CACHE_V}:{symbol}"`
(same rationale as `earnings.CACHE_V`). Update `_cache_key(symbol)`
accordingly. Old unversioned entries expire on their own 24h TTL.

### 4. Company news endpoint

**Client** (`research/finnhub.py`):

```python
def get_company_news(symbol, date_from, date_to):
    return _get("/company-news", symbol=symbol, **{"from": date_from, "to": date_to})
```

`/company-news` is Finnhub free tier. Response is a list of
`{category, datetime (epoch seconds), headline, id, image, related, source,
summary, url}`.

**Shape + cache** (`research/finnhub.py`):

```python
NEWS_TTL = 7200          # 2h -- headlines move through the day, not by the second
NEWS_WINDOW_DAYS = 14
NEWS_MAX_ITEMS = 40

def _to_news_item(row):
    ts = row.get("datetime")
    return {
        "id": row.get("id"),
        "datetime": (
            datetime.fromtimestamp(ts, tz=timezone.utc).isoformat() if ts else None
        ),
        "headline": row.get("headline", ""),
        "source": row.get("source", ""),
        "summary": row.get("summary", ""),
        "url": row.get("url", ""),
    }

def news(symbol):
    today = date.today()
    start = today - timedelta(days=NEWS_WINDOW_DAYS)
    key = f"research:news:v1:{symbol}:{today.isoformat()}"

    def produce():
        rows = get_company_news(symbol, start.isoformat(), today.isoformat()) or []
        items = [_to_news_item(r) for r in rows if r.get("headline") and r.get("url")]
        items = [i for i in items if i["datetime"]]
        items.sort(key=lambda i: i["datetime"], reverse=True)   # newest first
        return items[:NEWS_MAX_ITEMS]

    return {"available": True, "items": cache.get_or_set(key, produce, NEWS_TTL)}
```

`image` is intentionally dropped (calm / consolidate-only). Errors:
`_get` already raises `FinnhubNotConfigured` / `FinnhubAPIError` (both
`ProviderUnavailable` subclasses); a malformed payload -> `FinnhubUnexpected`
via the same `(KeyError, TypeError, IndexError)` guard pattern used by
`fundamentals()`. Wrap `produce`'s body the same way if needed, or rely on
the view's `provider_response`.

**View** (`research/views.py`):

```python
class CompanyNewsView(APIView):
    throttle_scope = "research.news"

    def get(self, request, symbol):
        symbol = _symbol(symbol)                 # reuse the existing validator
        return provider_response(lambda: finnhub.news(symbol))
```

`provider_response` renders `ProviderUnavailable` as `200 {"available": false,
"reason": ...}` -- the Finnhub contract, same as `FundamentalsView`.

**URL** (`research/urls.py`): `path("news/<str:symbol>/", CompanyNewsView.as_view(), name="research-company-news")`.

**Throttle** (`backend/backend/settings.py`): add `"research.news": "30/min"`
to `DEFAULT_THROTTLE_RATES`.

### Backend testing

`research/tests.py` (DRF `APITestCase` + `unittest.mock`):

- `to_fundamentals` shaping: mock a `metric` bundle with the new keys present
  and a second with them absent; assert exact snake_case output and `None`
  for the absent case (`_metric` contract).
- `_valuation_history`: mock `series.annual` with `pe`/`ps`/`pb`/`evEbitda`
  point lists -> assert `{latest,min,median,max,n}`; mock with `series`
  missing -> assert `valuation_history` key absent from payload; mock one
  sub-key empty -> assert that sub-key absent, others present.
- `CompanyNewsView`: configured + happy path (mock `requests.get` at the
  client boundary, assert grouped/sorted `items`, `image` absent, cap
  applied); `FINNHUB_API_KEY` empty -> `200 {"available": false}`; Finnhub
  non-200 -> `200 {"available": false}` with a generic `reason`.
- Assert `research.news` throttle scope resolves (one request over the rate
  returns 429 in a throttled test, matching the existing throttle tests).

---

## Frontend -- Slice 1: connective tissue

### 1. `researchHref` + clickable rows

`lib/research.js`:

```js
export function researchHref(symbol, tab) {
  const q = new URLSearchParams({ symbol })
  if (tab) q.set("tab", tab)
  return `/research?${q.toString()}`
}
```

Make the **ticker/name cell** a `react-router` `<Link>` (not a whole-`<tr>`
click -- keeps text selection and keyboard nav intact):

- `pages/Dashboard.jsx` -- "Top positions" table.
- `pages/Portfolio.jsx` -- "Holdings" table (the `Total` row stays plain).
- `components/analytics/Attribution.jsx` -- the ticker label.

Affordance: the ticker text gets `hover:text-blue-300`; the row keeps its
existing `hover:bg-*`. No new per-row icon.

`components/GainersLosersChart.jsx` -- add `onClick` to `<Bar>` navigating to
`researchHref(payload.ticker)`. Optional; include if cheap.

### 2. Recent-symbols store

`lib/recentSymbols.js` -- localStorage-backed, every access in try/catch
(private windows / disabled storage throw):

```js
const KEY = "saxodash:recent-symbols"
const CAP = 8

export function readRecentSymbols() {
  try { return JSON.parse(localStorage.getItem(KEY)) ?? [] } catch { return [] }
}
export function pushRecentSymbol(symbol) {
  if (!symbol) return
  try {
    const next = [symbol, ...readRecentSymbols().filter((s) => s !== symbol)].slice(0, CAP)
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch { /* storage unavailable -- feature degrades silently */ }
}
```

`pages/Research.jsx` -- `useEffect(() => pushRecentSymbol(symbol), [symbol])`
after `symbol` is resolved.

### 3. Command palette (Cmd/Ctrl+K)

`components/CommandPalette.jsx` + `lib/commands.js` (static list:
`{ label, to }` for the seven pages).

- **Trigger**: `Layout.jsx` registers a `keydown` listener --
  `(e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k"` -> `preventDefault`,
  open. A "Search  Cmd K" button in `Sidebar` (footer area, above the user
  block; icon `Search`) also opens it. State (`open`) lives in `Layout`.
- **Overlay**: centered panel, `role="dialog"` `aria-modal="true"`, rendered
  in a fixed full-screen backdrop. Esc and backdrop click close. Focus moves
  to the input on open and returns to `document.body` on close. Respects
  `prefers-reduced-motion` (global rule in `index.css` already neutralises
  transitions).
- **Body**:
  - Text `<input>` (`aria-label="Search"`, `aria-controls` the listbox).
  - When `query.trim().length >= 2`: `useInstrumentSearch(query)` (existing
    hook). Results render as `SYMBOL — description  ·  exchange`. Activate ->
    `navigate(researchHref(result.symbol))`, close.
  - Page commands from `lib/commands.js` whose `label` matches `query`
    (case-insensitive substring). Activate -> `navigate(to)`, close.
  - When `query` is empty: a "Recent" group from `readRecentSymbols()` (each
    -> `researchHref(symbol)`).
  - Combined flat list with a single highlighted index; `ArrowUp` /
    `ArrowDown` move it (wrap), `Enter` activates, listbox/option ARIA roles.
- No results -> "No matches."

### 4. Recent-symbols chip strip on Research

Under `Research.jsx`'s `PageHeader`, a thin horizontal row of
`readRecentSymbols()` (excluding the current `symbol`), each a small button
-> `selectSymbol(s)`. Hidden entirely when the list is empty. Reads
localStorage on each render (cheap; the list is <=8). No back-button
semantics -- the URL param + browser back already covers "return".

### Slice 1 testing

- `lib/research.test.js` -- `researchHref` (with / without tab, encoding).
- `lib/recentSymbols.test.js` -- push/dedup/cap; `localStorage.getItem`
  throwing -> `readRecentSymbols()` returns `[]`; `setItem` throwing ->
  `pushRecentSymbol` does not throw.
- `components/CommandPalette.test.jsx` -- opens on `Cmd+K`; typing >=2 chars
  shows mocked instrument results; Enter navigates (assert
  `useNavigate` mock); empty query with a seeded localStorage list shows
  Recent; `localStorage` throwing still renders.
- `pages/Portfolio.test.jsx` / `pages/Dashboard.test.jsx` -- a holding
  ticker renders as a link to `/research?symbol=...`.

---

## Frontend -- Slice 3: Research depth

### 1. `SnapshotSection` (Investment Snapshot)

`components/research/SnapshotSection.jsx`, rendered in `OverviewTab` after
`PositionCard` and before the reference strip. Consumes the `useFundamentals`
result already passed to `OverviewTab`; wrapped in the existing
`FundamentalsGate` (`title="Investment snapshot"`, fallback text).

Five groups, each: a label, 3-4 `Metric`-style figures (reuse `OverviewTab`'s
local `Metric`, or lift it into `ui.jsx` -- see design pass), and one
verdict line with a leading tone dot.

| Group             | Metrics shown                                                        |
|-------------------|---------------------------------------------------------------------|
| Growth            | `revenue_growth_ttm_yoy`, `eps_growth_ttm_yoy`, `revenue_growth_5y` |
| Profitability     | `roe`, `net_margin`, `gross_margin`, `operating_margin_ttm`         |
| Financial health  | `current_ratio`, `debt_to_equity`, `interest_coverage`, `quick_ratio` |
| Valuation         | `pe_ratio`, `forward_pe`, `peg_ratio`, `ev_ebitda`                  |
| Momentum          | `price_return_1m`, `price_return_ytd`, `price_return_1y`, `beta`    |

Verdict + tone come from a **pure** `lib/snapshot.js`, one function per group,
each returning `{ tone: "pos" | "neutral" | "caution", text: string }`.
Rules (all thresholds are constants at the top of the file, so the `InfoTip`
copy and the code stay in sync):

- **Growth**: by `revenue_growth_ttm_yoy` -- `> 15` "Revenue growing fast";
  `> 5` "Steady revenue growth" (neutral); `> 0` "Modest revenue growth"
  (neutral); `<= 0` "Revenue contracting" (caution). Append
  "; EPS outpacing revenue" when `eps_growth_ttm_yoy != null` and
  `eps_growth_ttm_yoy > revenue_growth_ttm_yoy + 3`; "; EPS lagging revenue"
  when `< revenue_growth_ttm_yoy - 3`.
- **Profitability**: `roe > 15 && net_margin > 10` -> pos "Highly profitable";
  `roe > 8 || net_margin > 5` -> neutral "Profitable"; else caution
  "Thin or negative margins".
- **Financial health**: caution if `debt_to_equity > 2` or
  `current_ratio < 1` or `interest_coverage < 3` ("Leveraged / tight
  liquidity"); pos if `debt_to_equity < 1 && current_ratio > 1.5`
  ("Conservative balance sheet"); else neutral "Adequate balance sheet".
- **Valuation**: needs `peg_ratio` and/or `valuation_history.pe`. `peg < 1`
  -> pos "Growth looks cheap vs. earnings growth"; `peg > 2` -> caution
  "Expensive vs. growth". Independently, if `valuation_history.pe` present:
  append "P/E above its {n}-yr range" (caution) / "below its {n}-yr range"
  (pos) / "in line with its {n}-yr range" (neutral): `pe_ratio > median * 1.1`
  -> above, `< median * 0.9` -> below, otherwise in line.
- **Momentum**: by `price_return_1y` -- `> 10` pos "Up over the past year";
  `< -10` caution "Down over the past year"; else neutral "Roughly flat over
  the past year". Append "; lagging YTD" when `price_return_ytd < 0`.

Any metric `null` -> render `—`. If a group has **no** usable inputs the
verdict is `{ tone: "neutral", text: "Limited data" }`. `InfoTip` on the
section header: one sentence per group naming the metric(s) and the
thresholds.

Tone dot: a 6px rounded span, `bg-emerald-400` / `bg-zinc-500` /
`bg-amber-400`. (Reuses the palette already in `lib/charts.js`; no new
colors.)

### 2. Valuation-history context in `ValuationTab`

`components/research/ValuationTab.jsx` "Ratios" card -- under the four
figures P/E, P/S, P/B, EV/EBITDA, add a `HistoryContext` sub-component when
`data.valuation_history?.[k]` exists: the min - median - max bar pattern from
`OverviewTab`'s `RangeStatsCard` (a 1.5px track with a marker positioned at
`(latest - min) / (max - min)`), labelled `{min} · median {median} · {max}
over {n} yrs`. Pure presentational; no new query.

### 3. News tab

`Research.jsx`:

- `TABS`: replace `["market", "Market context"]` with `["news", "News"]`.
  `TAB_KEYS` derives from `TABS` so it updates automatically. Remove the
  now-unused `ComingSoon` import and the `tab === "market"` branch; add
  `{tab === "news" ? <NewsTab symbol={symbol} /> : null}`.
- A symbol arriving with `?tab=market` from an old link: `TAB_KEYS` no longer
  contains it, so the existing `TAB_KEYS.has(requestedTab) ? requestedTab :
  "overview"` guard already falls back to Overview. No migration needed.

`api/client.js`: `getCompanyNews(symbol)` -> `GET
/api/research/news/${symbol}/`.

`api/queries.js`: `queryKeys.companyNews = (symbol) => ["company-news",
symbol]`; `useCompanyNews(symbol)` -- `enabled: !!symbol`, `staleTime: 60 *
60_000` (news TTL on the backend is 2h; 1h client staleness is safe and
matches the pattern of the other Finnhub hooks).

`components/research/NewsTab.jsx`:

- `const { data, isLoading } = useCompanyNews(symbol)`.
- `isLoading` -> `Skeleton` rows (see design pass).
- `!data?.available` -> `<Card>` with `data?.reason ?? "News is unavailable
  for this symbol."`.
- `data.items.length === 0` -> "No recent news for {symbol}."
- Otherwise: group `items` by local calendar date (`new
  Date(item.datetime).toDateString()`), newest group first; each group a
  small muted date header + a list of rows:
  - `headline` as `<a href={item.url} target="_blank" rel="noopener
    noreferrer">` (`text-zinc-100 hover:text-blue-300`).
  - a line under it: `source` · local time · one-line-clamped `summary`
    (`line-clamp-1`, `text-zinc-500`).
- One `<Card padding={false}>` wrapper with divided rows, matching the
  Earnings docket's row rhythm.

### 4. Reference strip

`components/research/OverviewTab.jsx` -- delete `InstrumentCard`; add
`ReferenceStrip({ symbol, details })`: a single `flex flex-wrap gap-x-4
gap-y-1 text-[11.5px] text-zinc-500` line of `label value` pairs --
`Exchange` (`details.exchange_name || details.exchange`), `Currency`, `ISIN`,
`Uic`, `Lot size`, `Asset type`. Each value `text-zinc-300 num font-mono`.
Omit a pair whose value is missing. Rendered directly under `SnapshotSection`,
no `Card`. Loading -> a single skeleton line.

`OverviewTab`'s layout becomes: `PositionCard` (if held) -> `SnapshotSection`
-> `ReferenceStrip` -> `RangeStatsCard` + `FundamentalsCard` grid (kept).
The `FundamentalsCard`'s four-metric summary stays; it now sits below a
richer snapshot rather than standing alone.

### Slice 3 testing

- `lib/snapshot.test.js` -- one `describe` per group: a clearly-pos input, a
  clearly-caution input, an all-`null` input (-> "Limited data"), and the
  EPS-outpacing / P/E-vs-history append clauses.
- `components/research/NewsTab.test.jsx` -- `available` with two items across
  two days (assert grouping + external link attrs + no `<img>`); `available`
  empty; `available: false` with a `reason`.
- `components/research/ValuationTab.test.jsx` -- extend: `valuation_history`
  present -> `HistoryContext` renders with the marker; absent -> it does not.
- `components/research/OverviewTab.test.jsx` -- `SnapshotSection` renders
  from mocked fundamentals; `ReferenceStrip` shows details and omits missing
  pairs; old `InstrumentCard` assertions removed.
- `pages/Research.test.jsx` -- the tab list shows "News" not "Market
  context"; selecting it renders `NewsTab`; `?tab=market` falls back to
  Overview.
- `api/client.test.js` -- `getCompanyNews` hits the right URL.

---

## Frontend -- design pass (consolidate only)

No visual redesign. No change to colors, the `body::before` radial glow, card
gradients, or shadows.

### Tokens

`index.css` `@theme` -- add a documented scale as custom properties, for new
code to reference (no mass migration of existing `text-[12.5px]` usages):

```css
@theme {
  /* type scale (px) */
  --text-2xs: 0.6875rem;   /* 11  -- labels, meta */
  --text-xs:  0.75rem;     /* 12  -- secondary body */
  --text-sm:  0.8125rem;   /* 13  -- body */
  --text-base:0.9375rem;   /* 15  -- metric value */
  --text-lg:  1.1875rem;   /* 19  -- section figure */
  --text-xl:  1.375rem;    /* 22  -- page title */
  --text-2xl: 1.5rem;      /* 24  -- hero figure */
  /* spacing scale already effectively 2/2.5/3/4/5 in Tailwind units; documented here */
}
```

### Primitives (`components/ui.jsx`)

- `StatStrip({ children })` + `StatRow({ label, value, badge, badgeTone,
  note })` -- one bordered container (`Card`-equivalent border, no per-item
  box) with `divide-x divide-white/[0.06]` between rows, the pattern
  `Portfolio.jsx`'s summary row already uses. Same props surface as
  `StatCard` so migration is mechanical.
- `Skeleton({ className })` -- `animate-pulse bg-white/[0.05] rounded`
  block; honours reduced-motion via the global rule.
- Lift `Metric` (currently duplicated in `OverviewTab` and `EarningsTab`)
  into `ui.jsx` and import it in both plus `SnapshotSection`.

### Migrations (mechanical, behaviour-preserving)

- `pages/Dashboard.jsx` -- the three `StatCard`s -> one `StatStrip`.
- `pages/Analytics.jsx` -- the four `StatCard`s -> one `StatStrip`.
- Bare `Loading…` strings -> `Skeleton` layouts on `Dashboard`, `Portfolio`,
  `Analytics`, and the Research tab bodies (`OverviewTab`, `NewsTab`,
  `EarningsTab`, `ValuationTab` already have their own; align them on
  `Skeleton`).
- Responsive: `Dashboard.jsx` `grid-cols-3` -> `grid-cols-1 sm:grid-cols-3`;
  `grid-cols-5` block -> `grid-cols-1 lg:grid-cols-5`; `Portfolio.jsx` the
  `grid-cols-20` custom split -> stack under `lg`. No other layout change.

### Design-pass testing

- `components/ui.test.jsx` (new or extended) -- `StatStrip`/`StatRow` render
  label+value+badge; `Skeleton` renders.
- Existing `Dashboard` / `Analytics` tests updated for the strip markup.

---

## Build order

Four steps, each independently reviewable and green before the next:

1. **Backend** -- `finnhub.py` widen `to_fundamentals`, `_valuation_history`,
   cache-key `CACHE_V`, `get_company_news` + `news()` + `CompanyNewsView` +
   URL + throttle rate. Full backend test suite.
2. **Connective tissue** -- `researchHref`, clickable rows,
   `lib/recentSymbols.js`, `CommandPalette` + `Layout` wiring + sidebar
   button, Research recent-chip strip.
3. **Research depth** -- `getCompanyNews`/`useCompanyNews`, `NewsTab` + tab
   swap, `lib/snapshot.js` + `SnapshotSection`, `ValuationTab`
   `HistoryContext`, `ReferenceStrip`.
4. **Design pass** -- `@theme` tokens, `StatStrip`/`StatRow`/`Skeleton`/lifted
   `Metric` in `ui.jsx`, Dashboard/Analytics strip + skeleton + responsive
   migrations.

## Gates

Per `AGENTS.md`: backend `APITestCase` per app is primary coverage; frontend
vitest specs alongside changes. All backend tests + frontend tests + lint +
build must pass at the end of each build-order step. No fake data ever
rendered as real; unavailable / missing / loading kept visually distinct
(`—`, `available: false` panels, `Skeleton`).
