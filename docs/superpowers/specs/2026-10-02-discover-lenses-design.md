# Discover: transparent lenses, a working "See all", and a path into Research

Builds on `2026-09-30-discover-shelves-design.md` (the nightly `ScreenerRow`
snapshot and the shelf pipeline stay as they are). This spec changes what a
shelf *is* (data, not prose), what the pages show, and how a stock found here
reaches Research.

## Purpose

Discover answers **"what should I look at?"**. Research answers "what do I need
to know about it?"; Analytics answers "how is my money behaving?". Every
change below is checked against that split: Discover filters and explains, it
never scores, ranks by merit or recommends.

The three surfaces keep distinct jobs. The **landing page** is for visual
scanning: it keeps today's spacious, marketplace-like shelves and cards and
does not become a screener or dashboard. **See all** is where density,
filtering and sorting live. **Research** is the single-stock investigation.

Three rules carry through every section:

1. **A lens is a filter, described by what it measures.** Its name states the
   measurement; its criteria are shown exactly; nothing implies cheap, good or buy.
2. **Every stock says why it is here**, using the same numbers the rule tested.
   The explanation is generated from the rule, so the two cannot drift.
3. **Order is a disclosed choice, not a verdict.** Each lens is ordered by its
   own defining metric, or by market cap when it has several, and says so.

## Grounding: what the live data says (scan of 1 Oct 2026)

511 of 518 symbols scanned OK; fundamentals on ~508. Today's shelves:

| Shelf | Count | Note |
|---|---|---|
| Oversold | 99 | broad weak session: 307 of 511 below their 200-day MA |
| Quality on sale | 95 | sorted deepest-below-200D first |
| Strong trend | 87 | |
| Cheap by P/E | 85 | |
| Near 52-week high | 17 | **all 17 are also in Strong trend** |
| Overbought | 7 | |
| Unusual volume | 3 | |

Overlaps: 29 Oversold ∩ Quality on sale, 27 Oversold ∩ Cheap P/E, 23 Quality on
sale ∩ Cheap P/E. 15 Nasdaq-100-only tickers have no sector in `universe.csv`.
Market cap (USD millions, from Finnhub) runs $6.6B–$5.5T: 151 under $25B, 299
in $25–200B, 61 over $200B.

What already exists and is reused, not rebuilt: `ScreenerRow`, `shelves.matching`,
`discover.health/as_of`, `useDiscover`/`useDiscoverShelf`, `WatchlistStar`
(+ `useWatchlistToggle`), `InstrumentLogo`, `DayChange`, `Sparkline`, `InfoTip`,
`Th`/`Td`/`Tr`, `researchHref`/`chartHref`, `PeersTab` (`resolvePeerSlots`,
`MAX_PEER_SLOTS = 5`), and Finnhub's market-week earnings calendar
(`earnings._market_week`). No table in the app sorts today (`aria-sort` appears
nowhere), so sortable headers are new.

## 1. Lens catalogue

### Naming principle

Title = the measurement. Subtitle = the exact thresholds, generated from the
criteria. Established technical terms with a fixed definition (Oversold,
Overbought) are kept, because their subtitle states the definition and the
criteria popover says what they do *not* mean.

| Current | New title | Rejected alternatives |
|---|---|---|
| Quality on sale | **Profitable & below 200-day average** | "Quality & below 200D" (quality is a verdict); "High ROE & below 200-day average" (accurate but hides the margin and EPS tests) |
| Cheap by P/E | **P/E under 15** | "Low P/E" (relative to what?), "Value" (a verdict) |
| Strong trend | **Above 50- & 200-day averages** | "Uptrend" (an interpretation of the rule, and the rule doesn't check that the averages are rising); "Strong trend" (strength isn't measured) |
| Near 52-week high | removed; it is a subset of the lens above, and `pct_from_52w_high` becomes one of that lens's columns | |

### Catalogue

`group` drives the landing page sections. `short` is the label used in "Also
matches". Sort is ascending unless marked ↓.

**Price action**

| key | title / short | criteria | default order | See-all columns |
|---|---|---|---|---|
| `oversold` | Oversold / Oversold | `rsi14 ≤ 30` | `rsi14` | rsi14, change_1m, pct_vs_ma200 |
| `overbought` | Overbought / Overbought | `rsi14 ≥ 70` | `rsi14` ↓ | rsi14, change_1m, pct_from_52w_high |
| `above-moving-averages` | Above 50- & 200-day averages / Above MAs | `last_close > ma50`, `ma50 > ma200` | `pct_vs_ma200` ↓ | pct_vs_ma200, change_3m, pct_from_52w_high |
| `unusual-volume` | Unusual volume / Unusual volume | `rvol ≥ 2` | `rvol` ↓ | rvol, change_1d, change_1m |

**Fundamentals**

| key | title / short | criteria | default order | See-all columns |
|---|---|---|---|---|
| `profitable-below-200d` | Profitable & below 200-day average / Profitable < 200D | `roe ≥ 15`, `net_margin ≥ 10`, `eps_growth_5y > 0`, `pct_vs_ma200 < 0` | `market_cap` ↓ | roe, net_margin, eps_growth_5y, pct_vs_ma200 |
| `pe-under-15` | P/E under 15 / P/E < 15 | `pe > 0`, `pe < 15` | `pe` | pe, forward_pe, net_margin, dividend_yield |
| `dividend-yield` *(Phase 4)* | Dividend yield 3% or more / Yield 3%+ | `dividend_yield ≥ 3` | `dividend_yield` ↓ | dividend_yield, payout_ratio, debt_to_equity, change_1y |
| `eps-growth` *(Phase 4)* | 5-year EPS growth 15% or more / EPS growth | `eps_growth_5y ≥ 15`, `revenue_growth_5y ≥ 10`, `net_margin > 0` | `eps_growth_5y` ↓ | eps_growth_5y, revenue_growth_5y, net_margin, forward_pe |

**Events**

| key | title / short | criteria | default order | See-all columns |
|---|---|---|---|---|
| `reporting-soon` *(Phase 4)* | Reporting in the next 7 days / Reports soon | `next_earnings_date` within 7 days | `next_earnings_date` | next_earnings_date, change_1m, pe |

Calibration today: Yield 3%+ 127; EPS growth (without the revenue test) 143.

**Decided against:**
- A debt/equity guard on the dividend lens. It is sector-distorted (banks and
  utilities run high D/E by design), so it would quietly exclude whole sectors.
  D/E and payout ratio are shown as columns, and the user judges them.
- Separate Momentum and Value lenses: they duplicate Above MAs and P/E < 15.
- Analyst ratings and revisions: one Finnhub call per symbol, which would
  double the scan.

### Ordering principle

- A lens with **one defining metric** is ordered by that metric, from the
  threshold outward (most extreme first).
- A lens with **several criteria** (only `profitable-below-200d` today) is
  ordered by **market cap, largest first**. It favours none of its criteria
  and puts familiar names first. Ordering by drawdown, which is what happens
  today, would put the most broken charts first.
- Every lens discloses its order: "Ordered by RSI, lowest first" in the
  criteria popover, and as the active sort in See all.
- Cards show the top 20 *in that order*, labelled "20 of 95".
- **Number of lens matches is never a sort key** (see §3).

## 2. Criteria as data (backend, Phase 1)

`research/shelves.py` changes from hand-written `Q` + prose to declarative criteria:

```python
@dataclass(frozen=True)
class Criterion:
    field: str
    op: str                 # 'gt' | 'gte' | 'lt' | 'lte'  ('within_days' added in Phase 4)
    value: float | None = None
    ref: str | None = None  # compare against another field, e.g. ma50


@dataclass(frozen=True)
class Shelf:
    key: str
    title: str
    short: str
    group: str
    criteria: tuple[Criterion, ...]
    sort: str
    descending: bool
    card_fields: tuple[str, ...]   # at most 4: the values a card shows as "why"
    # columns: tuple[str, ...]     # Phase 2
```

- `Criterion.q()` builds `Q(**{f'{field}__{op}': F(ref) if ref else value})`;
  `Shelf.rule()` ANDs its criteria.
- **The backend owns lens text.** `research/screener_fields.py` is a field
  registry `{name: Field(label, short, unit, format)}` for the fields lenses
  use. From it, `shelves.py` generates:
  - the **subtitle**, e.g. `ROE ≥ 15% · Net margin ≥ 10% · …`. A lower and an
    upper bound on the same field collapse to `0 < P/E < 15`, and a `ref`
    criterion reads `Close > 50-day MA`.
  - the **order sentence**, e.g. `Ordered by RSI 14, lowest first`
  - each item's **reasons**, `[{field, label, value, format}]`

  The frontend only formats a `value` by its `format` kind (`number`, `pct`,
  `signed_pct`, `ratio`, `multiple`, `cap`, `money`) with the existing `lib/format.js`
  helpers. That one formatter serves both reasons and, in Phase 2, See-all
  cells, so labels have one home and number formatting has one home.
- **Reasons are declared, not inferred from criteria.** A `ref` criterion
  (`Close > 50-day MA`) has no single value worth showing, and a future
  many-criteria lens must not flood a card. `card_fields` names at most 4
  fields; See all shows the full criteria and, from Phase 2, lens columns.
- `matching(shelf)` keeps today's null-exclusion. It now excludes nulls on
  **every criterion field (including `ref` fields) and the sort field**, not
  only the metric: a rule never matches a null metric, and a null can't be
  ordered. A null *card field* just renders `—`.
- `empty` becomes one generic sentence generated for every lens.
- **Transitional (Phase 1A → 1B only):** the payload keeps `metric` (=
  `card_fields[0]`) and each item keeps `metric_value`, so today's frontend
  keeps rendering while the backend is under review. Phase 1B switches the
  cards to `reasons` and removes both fields and `formatShelfMetric`.
- `GROUPS = (('price', 'Price action'), ('fundamentals', 'Fundamentals'), ('events', 'Events'))`
  lives beside `SHELVES`, so a lens's whole definition is in one file.
- Lens keys are renamed (`quality-on-sale` → `profitable-below-200d`, etc.).
  Old `/discover/<old-key>` URLs then 404. This is a single-user app with no
  external links, so there are no aliases.

### Payload shapes

`GET /api/research/discover/?sector=<name>`

```json
{
  "as_of": "…", "health": { … }, "universe_count": 511,
  "groups": [{ "key": "price", "title": "Price action" }],
  "context": { … },
  "shelves": [{
    "key": "oversold", "title": "Oversold", "short": "Oversold", "group": "price",
    "subtitle": "RSI 14 ≤ 30", "order": "Ordered by RSI 14, lowest first",
    "empty": "No stocks match these criteria in the last session.",
    "criteria": [{ "field": "rsi14", "op": "lte", "value": 30, "ref": null }],
    "sort": { "field": "rsi14", "descending": false },
    "total": 99,
    "items": [{
      "ticker": "…", "name": "…", "uic": 1, "asset_type": "Stock", "sector": "…",
      "last_close": 0, "change_1d": 0, "sparkline": [],
      "reasons": [{ "field": "rsi14", "label": "RSI", "value": 24.1, "format": "number" }],
      "also": ["pe-under-15"]
    }]
  }]
}
```

- `context` and `also` arrive in Phase 3; until then they are absent.
- `reasons` follows `card_fields`. From Phase 2, See-all items also carry a
  `values` map of the lens's `columns`.
- `sector` filters every shelf **server-side**. The landing page holds only the
  top 20 per shelf, so filtering those in the browser would give wrong counts
  and empty rows.

`GET /api/research/discover/<key>/` returns the same shelf object, plus
`as_of` and `universe_count`, with **all** matching rows and no `sparkline`. Each item gains `market_cap` plus every
column field. It is about 150 rows × ~12 numbers at most, so it's sent whole
and sorted/filtered in the browser.

`GET /api/research/discover/stocks/<ticker>/` *(Phase 4)* returns
`{ ticker, as_of, matches: [{ key, title, criteria, values }] }`, or 404 if the
ticker isn't in the universe. It feeds the Research banner (§6).

## 3. Multiple-lens matches ("Also matches")

**Computation.** `shelves.memberships()` runs each shelf's `matching()` as one
`values_list('ticker')` (≤10 small queries over ≤511 rows) and returns
`{ticker: [keys in page order]}`. It is computed once per request and shared
by all shelves in the payload. `also` = the stock's other lenses, in page
order. It is always computed **without** the sector filter, since it is a
property of the stock.

**Not a score.** It is shown as the names of other lenses, never as a number
or badge colour, and is never a sort key. It is a fact ("this stock also meets
these other published filters"), not a count to maximise.

**Card.** One extra line, only when `also` is non-empty, in muted text:
`Also matches: Oversold · P/E < 15`. At most two names, then `+1`. The full
list goes in the line's `title`. No chip backgrounds and no colour, so the line
reads as metadata, not as a signal.

**See all.** An "Also matches" column of the same muted short names, hidden
below `sm`. A filter toggle, **"Matches another lens"** (boolean), sits in the
toolbar. Combined with the sector filter, it answers "which of these also pass
something else", without any ranking.

## 4. Market context (Phase 3)

Context, not a dashboard: a single `Card`, two rows on desktop, no charts
beyond one split bar.

```
Market context · last session 1 Oct · 511 stocks
▲228 ▼272 [━━━━━━━━──────────]   41% above 200-day avg   19% RSI ≤ 30
Energy +1.2%  Utilities +0.6%  …  Information Technology −1.4%   (click to filter)
```

- `discover.market_context(rows)` is computed in Python from one `values_list`
  of OK rows. It returns `stocks`, `advancers`, `decliners`, `unchanged`,
  `above_ma200_pct`, `rsi_le_30_pct`, and
  `sectors: [{ sector, count, median_change_1d, above_ma200_pct }]`.
  Each percentage's denominator is the rows with that field non-null.
- The sector move is the **median** 1-day change, equal-weighted and labelled
  "median". Sectors stay in **fixed alphabetical order**, never sorted by
  move, so the strip reads as reference, not a leaderboard. The value text
  takes a muted pos/neg tone: no filled tiles, no bars, no rank numbers.
- The strip is subordinate: smaller type than shelf titles, no card header
  of its own, and placed above the first group without competing with it.
- **Clicking a sector** navigates to `/discover?sector=<name>`. Every shelf
  refetches filtered, counts become in-sector counts, the chip shows as
  selected with a clear (×), and "See all" links carry `?sector=` into the
  table.
- Phone width: the stats wrap and the sector chips scroll horizontally on one
  line. The card stays under ~110 px, so the lenses keep the focus.
- No index levels (no data source), and no movers list (it duplicates
  Dashboard's `MoversCard` concept, and the strip should stay small).

## 5. Landing page and cards

```
Discover                     Stocks matching published filters · S&P 500 + Nasdaq-100 · last session 1 Oct
[Market context card]                                               (Phase 3)
Price action
  Oversold · 99 ⓘ                                                    See all →
  RSI 14 at or below 30
  [card][card][card] …
Fundamentals
  …
```

- Each shelf header shows the title, **count** ("99", or "12 in Energy" when a
  sector filter is active), and an `InfoTip` with the criteria list, the
  ordering sentence, and "A filter, not a recommendation." The subtitle is the
  generated criteria sentence.
- Card (`DiscoverCard`):
  - logo · ticker · name · ☆, then price · 1D
  - the **reasons line**: the lens's `card_fields` (at most 4), e.g.
    `ROE 31% · Margin 29% · EPS 5Y +14% · vs 200D −22%` for the
    four-criterion lens, or `RSI 24` for Oversold. It wraps to two lines at
    most and replaces today's single blue metric line in the same place, so the
    card keeps its size and look.
  - "Also matches" (Phase 3), then the sparkline
- **Card click → Research Overview**, `researchHref(ticker, 'overview', {uic, assetType})`
  plus `lens=<key>`, with router state `{ discoverReturn: pathname + search }`.
  The card has no chart action; the chart is a secondary action in See all and
  inside Research.

## 6. Discover → Research

```
Discover card / See-all row
  └─► /research?symbol=FICO&uic=…&asset_type=…&tab=overview&lens=profitable-below-200d
        ┌───────────────────────────────────────────────────────────────┐
        │ ← Discover · Profitable & below 200-day average               │
        │ ROE 31% · Margin 29% · EPS 5Y +14% · −22% vs 200D             │
        │ Also matches: P/E < 15                                        │
        └───────────────────────────────────────────────────────────────┘
        Research as today: Overview / Valuation / Peers / … , ☆, Open chart, notes
```

- **Phase 1:** links change to Research Overview (no banner yet).
- **Phase 4:** `DiscoverContextBanner` renders above `SymbolBar` when `lens` is
  in the URL. It reads `useDiscoverStock(ticker)` (the endpoint in §2), shows
  that lens's criteria values and the stock's other matches, and if the stock
  no longer matches says "No longer matches <title> as of <date>".
- **Back** is a `Link` to `location.state.discoverReturn`. Because all See-all
  state lives in the URL (§7), that restores the lens, sort, filters, search and
  sector exactly. On a deep link or after a refresh, where there is no state, it
  falls back to `/discover/<lens>`.
- Picking another symbol inside Research drops `lens` from the URL, so the
  banner never describes the wrong stock. (The plan must confirm
  `selectSymbol` rebuilds the params rather than merging them.)
- **Known limit:** the window scroll position isn't restored. The app uses
  `BrowserRouter` (no `ScrollRestoration`), and URL state already covers what
  matters.

## 7. See all: a lens-specific screener (Phase 2)

```
← Discover   Profitable & below 200-day average · 95 of 511   ⓘ
ROE ≥ 15% · net margin ≥ 10% · EPS 5Y > 0 · below 200-day average · ordered by market cap
[ search ticker or name ] [ Sector ▾ ] [ All | <$25B | $25–200B | >$200B ] [ ☐ Matches another lens ]
☐ Stock        Sector   Mkt cap   Last    1D    ROE   Margin  EPS 5Y  vs 200D  Also matches   ☆  📈
☐ FICO  Fair…  IT       $12.7B    …       …     …     …       …       −22%     P/E < 15       ☆  📈
                                                         [ Compare 3 in Research → ]  (Phase 4)
```

- **Fixed columns:** Stock, Sector, Mkt cap, Last, 1D. **Lens columns:**
  `shelf.columns`. Then "Also matches" (Phase 3), ☆ (`WatchlistStar`, Phase 1),
  📈 (`chartHref`, labelled "Open chart"), and ☐ for compare (Phase 4). No
  column picker.
- **Row click → Research** (same link as the card). The ☆, 📈 and ☐ controls
  stop propagation.
- **Sorting:** every column except Stock, Also matches and the actions sorts.
  `Th` gains optional `sortKey`/`sort`/`onSort` props, rendering a button with
  `aria-sort`. Nulls always sort last. The default is the lens's own sort.
- **Filters:**
  - search matches ticker or name, case-insensitive substring
  - sector is a `Select` over the sectors present in the rows
  - market cap is three buckets (shown above); 151/299/61 today
  - the "Matches another lens" toggle
- **URL state:** `?q=&sector=&cap=&sort=&dir=&also=1`. Only non-default
  values are written; `replace` is used for keystrokes, `push` for discrete
  changes.
- Header count reads "95 of 511", or "12 of 95 shown" while filtered.
- **Phone width:** Sector and Also matches are hidden below `sm`, the table
  scrolls horizontally, and the Stock column is sticky.

## 8. Compare (Phase 4)

A checkbox column in See all; at most `1 + MAX_PEER_SLOTS` (6). Selection is
ephemeral component state: it is a gesture, not a view. A bar appears once 2+
are selected: **Compare in Research** →
`/research?symbol=<first>&tab=peers&peers=<rest>&lens=<key>`. `PeersTab` seeds
its `overrides` from a `peers` param on first render. "Open as chart panes" is
deferred (it would mean writing the chart workspace from outside
`useChartWorkspace`).

## 9. Unused data: what useful question can it already answer?

Fields stored but not shown today: `change_1m`, `change_1y`, `forward_pe`,
`debt_to_equity`, `dividend_yield`, `market_cap`, `sector`, `indexes`.

| Question | Data | Verdict |
|---|---|---|
| **Is a catalyst imminent?** Which of these report in the next days? | next earnings date: **not stored**. One Finnhub market-calendar call per scan fills it | **Biggest gap.** Add `next_earnings_date` to `ScreenerRow`, fill it at the end of the scan (one call, not per symbol), and power `reporting-soon`. Phase 4 also shows a "Reports in N days" column wherever it is ≤ 14 days |
| Is the market pricing earnings growth? | `forward_pe` vs `pe` | Column in P/E < 15 and EPS growth. **Not a lens:** 283 stocks have forward < 0.8 × trailing, so the filter is too broad, and it compares a normalised P/E with a forward one |
| Is EPS growth real or engineered? | `revenue_growth_5y`: **not stored**, but already in the Finnhub response the scan fetches (`revenueGrowth5Y`) | Add the field (migration, zero new calls), used as a criterion in `eps-growth` |
| Is a yield sustainable? | payout ratio: **not stored**, in the same response (`payoutRatioTTM`; verify the key in a live payload before relying on it) | Add as a column in `dividend-yield`, not a criterion |
| What has the market abandoned / chased over a year? | `change_1y` (60 stocks down ≥ 30%, 61 up ≥ 50%) | Column and sort key only; a lens would overlap below-200D / Above MAs |
| Where is today's movement? | `sector`, `change_1d`, `pct_vs_ma200` | The Market context strip (§4) |
| How big is it? | `market_cap` | Column and filter (§7) |
| Defensive vs volatile | `beta`: in the same Finnhub response, not stored | **Deferred.** A plausible "Beta under 0.8" lens, but wait until the planned lenses have been used for a while |
| Valuation relative to its own sector | `pe` + `sector` | **Deferred.** "P/E below its sector median" is explainable and fairer to tech than P/E < 15, but it is a second valuation lens |
| Index membership | `indexes` | Not exposed: low value |

## 10. Frontend modules

| Module | Change | Phase |
|---|---|---|
| `lib/discover.js` | `formatFieldValue(format, value)` and `formatReason(reason)` over `lib/format.js`; replaces `METRIC_LABELS`/`formatShelfMetric` | 1B |
| `components/discover/DiscoverCard.jsx` | reasons line; Research link + `lens` + return state; "Also matches" line | 1, 3 |
| `components/discover/ShelfRow.jsx` | count, `InfoTip` criteria, generated subtitle, sector-aware See-all link | 1 |
| `pages/Discover.jsx` | group sections; reads `?sector=`; passes it to `useDiscover(sector)` | 1, 3 |
| `pages/DiscoverShelf.jsx` | rebuilt as the screener: toolbar, sortable table, URL state | 1 (☆, links), 2 |
| `lib/discoverTable.js` (new) | pure `readTableState(params)`, `writeTableState`, `filterRows`, `sortRows`, `capBucket` | 2 |
| `components/ui.jsx` `Th` | optional sortable mode with `aria-sort` | 2 |
| `components/discover/MarketContext.jsx` (new) | the strip; sector chips navigate | 3 |
| `components/research/DiscoverContextBanner.jsx` (new) + `pages/Research.jsx` | banner, Back | 4 |
| `components/research/PeersTab.jsx` | seed overrides from `peers` param | 4 |
| `api/queries/research.js` | `useDiscover(sector)` key `['discover', sector]`; `useDiscoverStock(ticker)` | 3, 4 |

## 11. Backend changes

| Area | Change | Phase |
|---|---|---|
| `screener_fields.py` (new) | field registry: label, short, unit, format | 1A |
| `shelves.py` | `Criterion`, `Shelf` reshape, `GROUPS`, renamed keys, null-exclusion on all fields, generated subtitle/order/reasons, `card`/`shelf_payload` builders; later `matching(shelf, sector)`, `memberships()` | 1A, 3 |
| `views.py` | `_shelf_payload` moves into `shelves.py`; `DiscoverView` takes `sector`; `DiscoverStockView` | 1A, 3, 4 |
| `discover.py` | `market_context()` | 3 |
| `universe.csv` | fill the 15 missing sectors (ALAB, ALNY, ARM, ASML, CCEP, CRWV, FER, MELI, MSTR, NBIS, PDD, RKLB, SHOP, SPCX, TRI), each checked against its GICS sector | 1 |
| `models.py` + migration | `revenue_growth_5y`, `payout_ratio`, `next_earnings_date` on `ScreenerRow`; `migrate` on the dev DB, then a rescan | 4 |
| `finnhub.py` `SCREENER_METRICS` | the two new metric keys | 4 |
| `scan.py` | after the loop: one market-calendar call, then set `next_earnings_date`; a failure there is logged and leaves the dates as they were (it never fails the scan) | 4 |
| `DiscoverSnapshot` model *(Phase 4, last)* | `{scanned_at, memberships}`, last two kept, written at scan end; "New" marker = in this snapshot's lens, not in the previous one | 4 |

## 12. Phases

1. **Criteria as data + honesty pass**, in two reviewed checkpoints:
   - **1A, backend foundation:**
     - the Criterion/Shelf model and field registry
     - criteria → query, subtitle, order sentence and reasons
     - the ordering principle and widened null handling
     - renamed lenses (the six current ones; Near 52-week high removed)
     - payload changes with the transitional `metric`/`metric_value`
     - backend tests

     No frontend or unrelated changes.
   - **1B, Discover UI:**
     - generated subtitle, counts and the criteria `InfoTip` on the shelf header
     - the reasons line on cards (replacing the metric line)
     - Research Overview links on cards and rows, plus a chart action in rows
     - ☆ in See all
     - the sector CSV fix
     - removal of the transitional fields
     - screenshot review

     The landing page's visual design is preserved.
2. **See all screener.** Lens columns, sortable `Th`, search, sector and cap
   filters, URL state, sticky Stock column on phones.
3. **Context and overlap.** `market_context`, `MarketContext` strip, server-side
   sector filter on the landing page, `memberships()` → "Also matches" on cards
   and rows, and the "Matches another lens" filter.
4. **New lenses and the research loop.**
   - Migration + rescan, then Yield 3%+, EPS growth, Reporting in 7 days
   - the stock endpoint + `DiscoverContextBanner` + Back
   - Compare via Peers
   - `DiscoverSnapshot` "New since last scan"

Later, as a separate view, not part of this work: market map reusing `HeatTile`/`lib/heatmap.js`, saved
screens, custom thresholds, beta and sector-relative P/E lenses, opening a
selection as chart panes.

Phase 2 depends on Phase 1's `values`/`columns`. Phase 4's Back depends on
Phase 2's URL state. Nothing is built twice.

## 13. Reconsidered against the code

- **The sector filter can't be client-side on the landing page.** It holds the
  top 20 per shelf, so the filter is a server query param.
- **"Reporting soon" is not a request-time Finnhub call.** The date is stored by
  the scan, so the lens is an ordinary criterion and the page still makes zero
  provider calls.
- **Near 52-week high becomes a column, not a badge.** A badge would add the
  clutter §3 avoids.
- **Lens keys are renamed without aliases** (old See-all URLs 404).
- **The subtitle moves to the frontend**, generated from criteria with one
  field registry, so the backend has no formatting code and the text can't
  drift from the rule.
- **Null exclusion widens** from the metric to every criterion field and the
  sort field. Without this, a stock with a null sort value would sort
  unpredictably.
- **Compare tops out at 6** (`MAX_PEER_SLOTS` + 1), not an arbitrary 4.
- **Scroll position on Back is not restored** (see §6).

## 14. Testing

Backend (`APITestCase`, test-first):
- `test_shelves.py` (1A):
  - each lens's rule and order
  - `ref` criteria
  - null exclusion across criterion, ref and sort fields
  - a null card field doesn't exclude
  - generated subtitle (including range collapse and `ref` wording), order
    sentence and reasons
  - `card_fields` ≤ 4 and every field used is in the registry

  Later: sector filter, `memberships` order and exclusion of the current lens,
  `within_days`.
- `test_discover_views.py`: payload shape (`criteria`, `sort`, `values`,
  `columns` fields only); `sector` param changes `total`; 404 for an old key;
  stock endpoint 200/404; `context` denominators ignore nulls.
- `test_scan.py`: the earnings-calendar step sets dates, and its failure leaves
  the scan `ok`.

Frontend (vitest):
- `discoverFields.test.js`: every criterion op and every field formats; null
  renders `—`.
- `discoverTable.test.js`: URL round-trip, nulls last, cap buckets at the edges,
  search on ticker and name.
- `DiscoverCard.test.jsx`: link target is Research with `lens` and return
  state; the reasons line lists every criterion; "Also matches" hidden when
  empty and truncates at two.
- `DiscoverShelf.test.jsx`: clicking a header sets `aria-sort` and the URL;
  filters reduce rows; ☆ does not navigate.
- `MarketContext.test.jsx`: a sector click navigates with `?sector=`.
- `DiscoverContextBanner.test.jsx`: Back goes to the state URL, or falls back
  to `/discover/<lens>`; shows the "no longer matches" text.

Screenshot review per `saxodash-design-system` at 1440×1000 and 390×844 after
Phases 1, 2 and 3.

## Out of scope

ML or scoring, proprietary stock scores, recommendation rankings, ranking by
number of matched lenses, analyst ratings or revisions, user-defined thresholds
or saved screens, any market treemap or map, intraday data, markets beyond
S&P 500 ∪ Nasdaq-100, and Dashboard/Analytics changes.
