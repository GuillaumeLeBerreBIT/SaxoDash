# Discover: shelves over the S&P 500 and Nasdaq-100

Date: 2026-09-30
Status: approved in conversation, awaiting written-spec review

## Purpose

A browse-first page, in the spirit of an app store or Netflix front page, that
surfaces large-cap US stocks worth a look: overbought or oversold names,
quality companies trading below their 200-day moving average, strong trends,
cheap valuations. The fixed universe keeps small caps out.

This is the "market-wide universe / browse page" that
`2026-09-29-market-heatmaps-design.md` explicitly left out of scope.

## Decisions taken in brainstorming

- **Shape:** shelves (horizontal rows of cards), each with a "See all" list.
  Not a filter table.
- **Universe:** S&P 500 ∪ Nasdaq-100 (~520 symbols) from a CSV checked into the
  repo, refreshed by hand. No free live constituents feed exists (Finnhub's is
  premium) and index membership changes slowly.
- **Data approach:** a nightly snapshot table filled by one background task,
  read by the page. Not on-demand fetching: a page load must never fan out into
  hundreds of provider calls.
- **Prices stay Saxo-only** (standing decision); fundamentals come from Finnhub,
  as on Research.

## Universe

`backend/research/universe.csv`, columns: `ticker, name, sector, indexes`
(`indexes` is `SP500`, `NDX` or `SP500|NDX`). A loader upserts it into
`ScreenerRow`; a ticker removed from the CSV is deleted from the table on the
next load. The CSV is the only source of truth for membership.

## Data model: `ScreenerRow` (research app)

One row per universe symbol.

| Group | Fields |
|---|---|
| Identity | `ticker` (unique), `name`, `sector`, `indexes`, `uic` (null until resolved), `asset_type` |
| Technicals (Saxo) | `last_close`, `change_1d`, `change_1m`, `change_3m`, `change_1y`, `ma50`, `ma200`, `pct_vs_ma200`, `rsi14`, `pct_from_52w_high`, `rvol`, `sparkline` (JSON, ~60 closes) |
| Fundamentals (Finnhub) | `pe`, `forward_pe`, `roe`, `net_margin`, `eps_growth_5y`, `debt_to_equity`, `dividend_yield`, `market_cap` |
| Freshness | `technicals_at`, `fundamentals_at`, `status` (`ok` / `unmatched` / `failed`), `error` (short text) |

Every metric is nullable. **A missing metric is stored as null, never zero**:
the AGENTS.md rule for Finnhub applies to every field here.

Finnhub percentages arrive as plain numbers (15 means 15%). They are stored
unchanged, and shelf thresholds are written in the same units. The shelf tests
pin this down.

Finnhub keys: `peNormalizedAnnual`, `forwardPE`, `roeTTM`,
`netProfitMarginTTM`, `epsGrowth5Y`, `totalDebt/totalEquityAnnual`,
`dividendYieldIndicatedAnnual`, `marketCapitalization`.

## Pipeline: `research.tasks.scan_universe`

One Celery task, wrapped in `@synced` so sync health reports it, scheduled
nightly after the US close (via django-celery-beat), and a management command
`scan_universe` for the first fill and manual reruns.

Per symbol, in order:

1. **Resolve.** If `uic` is null, look the ticker up through the existing
   `market.search` and take the US primary listing of asset type `Stock`.
   Store `uic` + `asset_type` on the row. No match sets `status=unmatched`;
   unmatched rows are retried on the next run.
2. **Technicals.** Fetch ~260 daily bars through `market.chart` (existing
   cache and `to_candle` cleaning apply), then compute every technical field
   with `research/technicals.py`.
3. **Fundamentals.** One `finnhub.get_basic_financials` call, shaped into the
   fundamentals fields. Calls are paced to ~50/min to stay under the free
   tier's 60/min.

**Isolation:** an exception on one symbol sets that row's `status=failed` and
`error`, and the run moves on. One bad ticker never aborts the batch. A
`ProviderNotConnected` from Saxo is different: the technicals step stops for
the whole run, the `SyncRun` is recorded as skipped, and existing rows keep
their previous values and timestamps.

## `research/technicals.py`

Pure functions over a list of closes / bars: `sma`, `rsi` (Wilder smoothing,
period 14), `relative_volume` (last volume against the mean of the previous 20
sessions, at least 75% of them present), plus the derived fields above. They
use **the same definitions as `frontend/src/lib/indicators.js`**. A shared
JSON fixture of bars and expected values is asserted by both a Python test and
a vitest spec, so "RSI 78" on a Discover card and on the chart cannot drift
apart.

## Shelves: `research/shelves.py`

Each shelf is a declarative rule: `key`, `title`, `subtitle` (the rule in
words, with its real thresholds), `metric` (the field the card highlights),
`filter`, `order`, `limit=20`. Only `status=ok` rows qualify, and **a rule
never matches on a null metric**.

| key | Title | Rule | Order |
|---|---|---|---|
| `quality-on-sale` | Quality on sale | `roe ≥ 15`, `net_margin ≥ 10`, `eps_growth_5y > 0`, `pct_vs_ma200 < 0` | `pct_vs_ma200` ascending |
| `overbought` | Overbought | `rsi14 ≥ 70` | `rsi14` descending |
| `oversold` | Oversold | `rsi14 ≤ 30` | `rsi14` ascending |
| `strong-trend` | Strong trend | `last_close > ma50 > ma200` | `change_3m` descending |
| `near-high` | Near 52-week high | `pct_from_52w_high ≥ -3` | `pct_from_52w_high` descending |
| `cheap-pe` | Cheap by P/E | `0 < pe < 15` | `pe` ascending |
| `unusual-volume` | Unusual volume | `rvol ≥ 2` | `rvol` descending |

A stock may appear on several shelves. "Trending" means price momentum (Strong
trend, Unusual volume): neither provider has a news or social trending feed.

## API

Both are JWT-authenticated and read only our database, so they take no provider
throttle scope.

- `GET /api/research/discover/`:
  `{ as_of, health: { state: ok|stale|failed|never, last_run_at }, shelves: [ { key, title, subtitle, metric, total, items: [card…] } ] }`,
  where each card is `{ ticker, name, uic, asset_type, last_close, change_1d, metric_value, sparkline }`.
  Shelves with no matches are included with `total: 0` and no items, so the
  client can render the "Nothing … today" note.
- `GET /api/research/discover/<key>/`: every match for one shelf, same card
  shape. An unknown key is a 404.

`as_of` is the oldest `technicals_at` among `ok` rows. `health` is `stale`
when the last successful run is older than 36 hours, `failed` when the latest
`scan_universe` SyncRun failed, `never` when no run has succeeded yet.

## Frontend

- **Route** `/discover`, a `Discover` page inside the authenticated layout, with a
  nav entry beside Research.
- **Shelf row:** title, subtitle, "See all (n)" link, then a horizontally
  scrolling row of cards (scroll-snap, keyboard reachable, arrow buttons on
  desktop). An empty shelf collapses to a single muted line ("Nothing
  oversold today").
- **Card:** logo via `lib/logos.js::instrumentLogoUrl`, ticker, name,
  `fmtMoney(last_close, 'USD')`, 1-day change with sign (never colour
  alone), the shelf's highlighted metric (for example "RSI 78", "−8.2% vs 200-day MA"),
  and a sparkline of `sparkline`. A star toggles the watchlist through the
  existing watchlist toggle. Clicking the card opens
  `/research/chart?symbol=<ticker>`.
- **See all:** `/discover/:key`, a sorted list of every match with the same
  fields and the same click-through.
- **Header:** "Data as of <date>". A `stale` or `failed` health shows a
  banner saying so; `never` shows the empty state ("No scan yet. It runs
  nightly, or run `manage.py scan_universe`.").
- Design-system rules apply: `Card`, tokens, one gain/loss pair from
  `lib/charts.js`, screenshot review at 1440px and 390px.

## Testing (test-first)

Backend (`APITestCase` and plain `TestCase`):

- Each shelf: threshold edges, sort order, null exclusion, non-`ok` rows excluded.
- Both endpoints: shape, `total`, 404 on unknown key, each `health` state.
- `scan_universe` with fake providers: one symbol raising (others still
  written), one unmatched, Finnhub omitting a metric (stored null), Saxo not
  connected (run recorded skipped, rows untouched).
- Universe loader: upsert, removal, index merge.
- `technicals.py` against the shared fixture.

Frontend (vitest): card renders the shelf metric and signed change; empty
shelf note; stale/failed banner; `never` empty state; See-all navigation;
`indicators.js` against the shared fixture.

## Out of scope

User-defined shelves or filters, intraday refresh, other markets, alerts, a
news/social trending signal, automatic constituents updates.
