# Earnings — a portfolio-wide earnings calendar and a per-symbol Research tab

## Context

Research shipped v1 (Saxo-powered chart/quote/search/watchlists) and then a
Finnhub fundamentals pass (`docs/superpowers/specs/2026-09-05-fundamentals-provider-design.md`):
Overview's fundamentals card and a full Valuation tab are live. The Valuation
tab already carries an **EPS actual-vs-estimate** chart fed by Finnhub's
`/stock/earnings` bundle (last ~4 quarters, no revenue, no forward date).

This pass adds the forward-looking half and a portfolio-wide view:

1. A **standalone `/earnings` page** — an agenda of upcoming (and recently
   reported) earnings dates across every held position and every watchlist
   symbol. This is the "Earnings" page from the original 7-page Claude Design
   mockup.
2. A **Research "Earnings" tab** — per-symbol depth for whatever instrument
   the Research page is showing: a next-earnings card, EPS and revenue
   history, a surprise trend.

**Provider:** Finnhub free tier, same `FINNHUB_API_KEY` as fundamentals. No
new provider, no new key.

**Feasibility verified against a live call during design** (not assumed):
`GET /calendar/earnings?symbol=&from=&to=` is on the free tier. Per-symbol
queries work. Each row carries `symbol, date, hour` (`bmo`/`amc`/`dmh`/`""`),
`quarter, year, epsEstimate, epsActual, revenueEstimate, revenueActual`. Past
quarters come back with the `*Actual` fields filled, future ones with
estimates only. So **revenue history is feasible from this one endpoint** —
no premium `/stock/financials-reported` needed. `surprisePercent` is not in
the calendar payload; it is computed in-app when both EPS values are present.

## Decisions

**Backend owner: `research` app.** Same reasoning as the fundamentals pass —
`research` already owns "this page's data needs end-to-end." No new Django
app. No new model: the on-demand + cache pattern needs neither (approach A
below; approaches B/C were considered and rejected — B adds a model + beat
task for tiny, slow-changing data the cache already covers; C fetches the
whole-market calendar and filters in-app, wasteful to re-fetch).

**A compose module, `research/earnings.py`, separate from `finnhub.py`.**
Mirrors the hardening split of `analytics/report.py` from `benchmarks.py`:
`finnhub.py` stays the thin client (one `requests.get` wrapper per endpoint);
`earnings.py` owns symbol collection, the per-symbol cache fan-out, shaping,
and the history/next split.

**`research` reads `portfolio.models.Position`.** The calendar's symbol list
is `Position.ticker` ∪ `WatchlistItem.symbol`. This is one read-only leaf
import, declared in the `earnings.py` docstring. It is not the coupling the
hardening removed (Analytics reaching through Research into `saxo` for
benchmark data) — it is a leaf app reading another leaf app's rows, the same
way several views already read across apps.

**Symbol, not uic.** Finnhub is keyed by ticker. `Position.ticker` and
`WatchlistItem.symbol` are both already stored bare (no exchange suffix).
Non-US listings needing a suffix (`SAP.DE`) will not resolve — a known,
out-of-scope gap, same as the fundamentals pass, not silently "handled".

**Always 200 on the per-symbol endpoint**, `{available: false, reason}` on
failure — the existing `ProviderUnavailable` contract (`research/providers.py`).
The calendar endpoint always returns 200 too, with an `unavailable` list of
symbols whose Finnhub call failed, so a partial outage degrades one row
instead of the whole page.

**Day-stamped cache keys.** `research:earnings-cal:{symbol}:{YYYY-MM-DD}` and
`research:earnings:{symbol}:{YYYY-MM-DD}`. Earnings data barely moves
intraday; a date in the key rolls the window at the day boundary without a
cron.

**The Valuation tab's EPS chart moves to the Earnings tab.** Once the
Earnings tab renders EPS history from the richer calendar window, the
4-quarter chart on Valuation is redundant. Valuation keeps ratios,
recommendations, price performance — each tab single-purpose. This is a
targeted cleanup of code this pass already touches, not a wider refactor.

## Backend

### `research/finnhub.py`

One new client function, same style as `get_earnings_history`:

```python
def get_earnings_calendar(symbol, date_from, date_to):
    return _get('/calendar/earnings', symbol=symbol, **{'from': date_from, 'to': date_to})
```

Returns the parsed body; `earnings.py` reads `.get('earningsCalendar', [])`.
Failures raise the existing `FinnhubAPIError` / `FinnhubNotConfigured` /
`FinnhubUnexpected` (all `ProviderUnavailable` subclasses) — unchanged.

New TTL constants alongside the existing ones:
`EARNINGS_CAL_TTL = 43200` (12h), `EARNINGS_TTL = 86400` (24h).

### `research/earnings.py` (new)

- `tracked_symbols()` → `sorted({*Position.objects.values_list('ticker', flat=True),
  *WatchlistItem.objects.values_list('symbol', flat=True)} - {'', None})`.
- `_shape(row)` → snake_case event:
  `{symbol, date, session, quarter, year, eps_estimate, eps_actual,
  revenue_estimate, revenue_actual, eps_surprise_pct}`.
  `session` normalises `hour`: `'bmo'|'amc'|'dmh'` pass through, `''`/missing → `None`.
  `eps_surprise_pct = round((eps_actual - eps_estimate) / abs(eps_estimate) * 100, 2)`
  when both are non-null and `eps_estimate != 0`, else `None`.
- `_calendar(symbol, date_from, date_to)` → shaped, date-sorted list for one
  symbol, wrapped in `cache.get_or_set(key, ..., ttl)` with a day-stamped key.
  A `ProviderUnavailable` propagates to the caller (not swallowed here).
- `upcoming_earnings(symbols)` — for the standalone page. `today = date.today()`,
  window `today - 7d … today + 31d`. For each symbol, call `_calendar` inside
  a `try/except ProviderUnavailable`: on failure, log a warning and add the
  symbol to `unavailable`. Merge all events, sort by `(date, symbol)`. Return
  `{'events': [...], 'unavailable': [...], 'window': {'from': ..., 'to': ...}}`.
- `symbol_earnings(symbol)` — for the Research tab. Window `today - 3y …
  today + 120d`, one `_calendar` call. Split, with no row in both:
  `history` = `date < today OR eps_actual is not None` (oldest-first);
  `next` = the soonest row with `date >= today AND eps_actual is None`, or
  `None`. Return `{'available': True, 'history': [...], 'next': {...} | None}`.
  A `ProviderUnavailable` is **not** caught here — the view renders it.

### `research/views.py` + `urls.py`

```python
class EarningsCalendarView(APIView):
    throttle_scope = 'research.earnings'
    def get(self, request):
        return Response(earnings.upcoming_earnings(earnings.tracked_symbols()))

class SymbolEarningsView(APIView):
    throttle_scope = 'research.earnings'
    def get(self, request, symbol):
        return provider_response(lambda: earnings.symbol_earnings(symbol))
```

- `path('earnings/calendar/', EarningsCalendarView.as_view(), name='research-earnings-calendar')`
- `path('earnings/<str:symbol>/', SymbolEarningsView.as_view(), name='research-earnings-symbol')`

`provider_response` already maps `ProviderUnavailable` → 200 `{available:
false, reason}`, so `SymbolEarningsView` needs no bespoke try/except.

### `backend/settings.py`

Add `'research.earnings': '30/min'` to `DEFAULT_THROTTLE_RATES`.
`ThrottleScopeConfigTest` (already in `research/tests.py`) then covers the two
new views automatically — it asserts every `throttle_scope` in the app
resolves to a configured rate.

## Frontend

### API layer

- `api/client.js`: `getEarningsCalendar()` → `/api/research/earnings/calendar/`;
  `getSymbolEarnings(symbol)` → `/api/research/earnings/${symbol}/`.
- `api/queries.js`: `queryKeys.earningsCalendar`, `queryKeys.symbolEarnings(symbol)`;
  `useEarningsCalendar()` (`staleTime` ~12h), `useSymbolEarnings(symbol)`
  (`enabled: !!symbol`, `staleTime` ~24h).

### Standalone page — `pages/Earnings.jsx`

- Route: `<Route path='earnings' element={<Earnings />} />` in `App.jsx`,
  inside the `<Layout>` group.
- `components/Sidebar.jsx`: `{ to: '/earnings', label: 'Earnings', icon: CalendarClock }`
  after the Research entry (`CalendarClock` from `lucide-react`).
- Layout: one column, `PageHeader title="Earnings"`. Events from
  `useEarningsCalendar()` bucketed by date relative to today:
  **Recent** (`date < today`, rendered dimmed, at the top), **This week**,
  **Next week**, **Later** (through +30d). Empty buckets are omitted.
- Row: date + weekday · symbol monogram + ticker · company name · a `Held`
  or `Watchlist` tag (from `usePositions()` — held wins) · session chip
  (`BMO` / `AMC` / `—`) · EPS estimate. A `date < today` row also shows EPS
  actual and a beat/miss delta chip coloured from `eps_surprise_pct`.
- Row click → `navigate('/research?symbol=' + row.symbol + '&tab=earnings')`.
- Empty state (`events` empty): "No earnings in the next 30 days across your
  holdings or watchlists." When `unavailable.length`, a quiet line below:
  "Couldn't load N symbol(s)."

### Research Earnings tab

- `Research.jsx`: add `['earnings', 'Earnings']` to `TABS`; render
  `<EarningsTab symbol={symbol} />` when `tab === 'earnings'`. On mount, seed
  `tab` from `params.get('tab')` when it names a known tab, so the agenda's
  deep link lands on it.
- `components/research/EarningsTab.jsx`, driven by `useSymbolEarnings(symbol)`,
  reusing the `FundamentalsGate` loading/`available:false` pattern
  (generalise the gate's name or add a sibling — implementation detail):
  - **Next earnings card** — date, countdown ("in 12 days" / "today"),
    session, EPS estimate, revenue estimate (`fmtCompact`). `next === null` →
    "No scheduled earnings date."
  - **EPS history** — actual vs estimate bars (the component moved off
    `ValuationTab`), now over the calendar's wider window.
  - **Revenue history** — actual vs estimate bars, `fmtCompact` Y axis.
  - **Surprise trend** — a per-quarter row of `eps_surprise_pct`, green/red.
- `ValuationTab.jsx`: remove `EpsHistoryChart` and its `eps_history` use;
  keep ratios, `PricePerformance`, `RecommendationBar`. The `eps_history`
  field stays in the `fundamentals` payload for now (harmless; a later pass
  can drop it from `to_fundamentals`).

## Testing

### Backend

- `finnhub` — `get_earnings_calendar` hits the right path/params
  (`@patch('research.finnhub.requests.get')`, assert `call_args`).
- `earnings._shape` — field rename; `session` normalisation; surprise math
  including the `eps_estimate == 0` and null-input guards.
- `earnings.upcoming_earnings` — merges + sorts across symbols; a per-symbol
  `FinnhubAPIError` lands in `unavailable` and the other symbols still
  return; day-stamped cache means a second call in the same test makes no new
  upstream call (`@override_settings` LocMem cache, assert `get.call_count`).
- `earnings.symbol_earnings` — history is oldest-first and past-only; `next`
  is the soonest future estimate; `next is None` when none upcoming.
- `APITestCase`:
  - `EarningsCalendarView` — happy path with a `Position` + a `WatchlistItem`;
    no tracked symbols → `{events: [], unavailable: [], ...}`; Finnhub down →
    200 with every symbol in `unavailable`.
  - `SymbolEarningsView` — happy 200 `{available: true, ...}`; missing key /
    Finnhub error → 200 `{available: false, reason}`.

### Frontend

- `Earnings.test.jsx` (`renderWithProviders`, `vi.mock('../api/queries')`):
  buckets render in order; a past row shows the beat/miss chip; `Held` badge
  when a mocked position matches; empty state; `unavailable` note.
- `EarningsTab.test.jsx`: next-earnings card fields; both history charts
  render from mocked data; `available: false` → gate fallback; `next: null`
  copy.
- `client.test.js`: `getEarningsCalendar` / `getSymbolEarnings` request
  shape.
- `ValuationTab.test.jsx`: assert the EPS chart is gone, ratios still render.

## Phasing

Two plan phases, each green on its own:

- **Phase 1** — `finnhub.get_earnings_calendar`, `research/earnings.py`, both
  endpoints, the throttle-rate line, and the **Research Earnings tab**
  (including the EPS-chart move off Valuation and the `?tab=` seed). Reuses
  all existing Research plumbing.
- **Phase 2** — the standalone `pages/Earnings.jsx`, its route, the sidebar
  entry, and the agenda → `?symbol=&tab=earnings` deep link.

## Open questions (resolve during implementation)

1. **`hour` value set** — the live probe returned `amc` and `""`; `bmo` /
   `dmh` are documented but unconfirmed against this key's data. `_shape`
   passes any non-empty value through and maps empty → `None`; the frontend
   chip labels the three known codes and shows `—` otherwise. No code change
   expected, just confirm during the backend step.
2. **History depth** — how many past quarters `/calendar/earnings` returns
   over a 3-year window on the free tier is unconfirmed (the fundamentals
   pass hit the same unknown for `/stock/earnings`). The charts render
   whatever comes back; the 3-year window is the ask, not a guarantee.
3. **`FundamentalsGate` reuse vs. rename** — the gate is
   fundamentals-specific in name only. Either generalise it (rename +
   re-point the two existing callers) or add a thin sibling for earnings.
   Decide in the frontend step; not load-bearing.

## Out of scope

- Any non-US / suffix-bearing symbol resolution.
- Price reaction to earnings (needs a post-earnings price series join).
- Earnings-call transcripts, guidance text, whisper numbers (premium).
- A Celery-driven pre-sync or an `EarningsEvent` model (approach B).
- Dropping `eps_history` from the `fundamentals` payload — a later tidy.
- Market-context tab and target-weight/drift — separate sub-projects,
  already identified, not part of this spec.
