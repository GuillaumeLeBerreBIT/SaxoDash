# Research workspace: connective tissue + depth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SaxoDash feel like one workspace — every holding links to its Research page, a ⌘K palette jumps to any instrument — and deepen Research with an Investment Snapshot, growth/margin trends, valuation-vs-history context, and a company News tab, all from data the app already fetches plus one new free-tier Finnhub endpoint.

**Architecture:** Backend changes are additive shaping inside the existing `research` app (`finnhub.py` widened; one new `CompanyNewsView`) — no new app, model, or Celery task. Frontend adds pure helpers (`researchHref`, `recentSymbols`, `snapshot`), one overlay component (`CommandPalette`), one Research tab (`NewsTab`), and swaps the dead "Market context" tab. A consolidate-only design pass (`StatStrip`/`Skeleton` primitives, responsive fixes) is the last step and changes no colours.

**Tech Stack:** Django REST Framework, Finnhub free tier, Redis cache, `ScopedRateThrottle`; Vite + React 19 (JS, not TS), React Router 7, TanStack Query, Recharts, Lucide, Tailwind v4 (`@theme` in `index.css`); vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-10-research-workspace-connective-tissue-design.md` — read it alongside this plan.

## Global Constraints

- **No new data provider.** Finnhub stays free tier. No new background/Celery sync. Fetch-on-demand + cache only.
- **An absent figure is never zero.** A metric the free tier omits is `None` on the backend and renders `—` on the frontend — never defaulted, guessed, or `0`.
- **Provider error contract:** Finnhub failures return HTTP `200` with `{available: false, reason: ...}` via `provider_response`. Never a `409` (that means "Saxo not connected", named once in `api/client.js`) and never a `500` for a payload-shape problem.
- **Design pass is consolidate-only.** Do not change the colour palette, the `body::before` radial glow, card gradients, or shadows. Keep the dark terminal look exactly.
- **Out of scope — do not build:** peers / comparison view / screener / discovery lists; watchlist "since last look"; earnings comparative narrative ("rev growth 8%→14%"); macro / Buffett / CAPE; a persistent top bar; any restyle; intraday/real-time quotes (Saxo SIM has no entitlement).
- **Testing:** backend `APITestCase`/`TestCase` in `backend/research/tests.py` is primary coverage; frontend vitest specs alongside every change. Run backend `cd backend && .venv/bin/python manage.py test research`; frontend `cd frontend && npm test`; lint `cd frontend && npm run lint`; build `cd frontend && npm run build`. All green at the end of every task.
- **Commit style:** `type: imperative summary`, ending with `Claude-Session: https://claude.ai/code/session_01PybJQDy4bPtNvqd9tzRJ4v`. Branch: `research-workspace-connective-tissue` (already created).

---

## File Structure

**Backend (`backend/`):**
- `research/finnhub.py` — MODIFY: widen `to_fundamentals`; add `_series_stats`, `_valuation_history`, `CACHE_V`, versioned `_cache_key`; add `get_company_news`, `_to_news_item`, `news`, news TTL/window constants; widen datetime import, add `import statistics`.
- `research/views.py` — MODIFY: add `CompanyNewsView`.
- `research/urls.py` — MODIFY: import + route `news/<str:symbol>/`.
- `backend/settings.py` — MODIFY: add `'research.news': '30/min'` to `DEFAULT_THROTTLE_RATES`.
- `research/tests.py` — MODIFY: extend `FundamentalsShapingTest`, add `ValuationHistoryTest`, `CompanyNewsClientTest`, `CompanyNewsShapingTest`, `CompanyNewsViewTest`; add `CompanyNewsView` to `ThrottleScopeConfigTest`; extend `SAMPLE_FINANCIALS`.

**Frontend (`frontend/src/`):**
- `lib/research.js` — MODIFY: add `researchHref`.
- `lib/recentSymbols.js` — CREATE: `readRecentSymbols`, `pushRecentSymbol`.
- `lib/commands.js` — CREATE: static page list for the palette.
- `lib/snapshot.js` — CREATE: one pure verdict function per snapshot group.
- `components/CommandPalette.jsx` — CREATE: ⌘K overlay.
- `components/Layout.jsx` — MODIFY: register the ⌘K listener, render the palette.
- `components/Sidebar.jsx` — MODIFY: add a "Search ⌘K" button that opens the palette.
- `components/research/NewsTab.jsx` — CREATE.
- `components/research/SnapshotSection.jsx` — CREATE.
- `pages/Research.jsx` — MODIFY: `pushRecentSymbol` effect, recent-chip strip, swap `market`→`news` tab.
- `pages/Dashboard.jsx`, `pages/Portfolio.jsx`, `components/analytics/Attribution.jsx` — MODIFY: link the ticker cell.
- `components/research/OverviewTab.jsx` — MODIFY: render `SnapshotSection`, replace `InstrumentCard` with `ReferenceStrip`.
- `components/research/ValuationTab.jsx` — MODIFY: add `HistoryContext` under the ratio grid.
- `api/client.js` — MODIFY: add `getCompanyNews`.
- `api/queries.js` — MODIFY: add `queryKeys.companyNews`, `useCompanyNews`.
- `components/ui.jsx` — MODIFY: add `StatStrip`, `StatRow`, `Skeleton`, lifted `Metric`.
- `index.css` — MODIFY: add documented type/space scale tokens to `@theme`.
- Tests: `lib/research.test.js`, `lib/recentSymbols.test.js` (CREATE), `lib/snapshot.test.js` (CREATE), `components/CommandPalette.test.jsx` (CREATE), `components/research/NewsTab.test.jsx` (CREATE), `pages/Portfolio.test.jsx`, `components/analytics/Attribution.test.jsx`, `pages/Research.test.jsx`, `components/research/OverviewTab.test.jsx`, `components/research/ValuationTab.test.jsx`, `api/client.test.js`, `components/ui.test.jsx` (CREATE or extend).

---

## Task 1: Backend — widen `to_fundamentals`, version the fundamentals cache key

**Files:**
- Modify: `backend/research/finnhub.py`
- Test: `backend/research/tests.py` (`FundamentalsShapingTest`, plus `SAMPLE_FINANCIALS`)

**Interfaces:**
- Produces: `finnhub.to_fundamentals(profile, financials, recommendations, earnings)` return dict gains these keys, each `float | None`: `revenue_growth_ttm_yoy`, `eps_growth_ttm_yoy`, `revenue_growth_3y`, `revenue_growth_5y`, `eps_growth_3y`, `operating_margin_ttm`, `operating_margin_5y`, `gross_margin_5y`, `net_margin_5y`, `debt_to_equity`, `long_term_debt_to_equity`, `interest_coverage`, `quick_ratio`.
- Produces: `finnhub.CACHE_V = 'v2'`; `finnhub._cache_key(symbol) -> f'research:fundamentals:{CACHE_V}:{symbol}'`.

- [ ] **Step 1: Extend the shared financials fixture**

In `backend/research/tests.py`, add to `SAMPLE_FINANCIALS['metric']` (alongside the existing keys):

```python
        'revenueGrowthTTMYoy': 14.2,
        'epsGrowthTTMYoy': 32.6,
        'revenueGrowth3Y': 1.8,
        'revenueGrowth5Y': 8.7,
        'epsGrowth3Y': 6.9,
        'operatingMarginTTM': 33.2,
        'operatingMargin5Y': 30.7,
        'grossMargin5Y': 44.5,
        'netProfitMargin5Y': 25.5,
        'totalDebt/totalEquityQuarterly': 0.78,
        'longTermDebt/equityQuarterly': 0.66,
        'netInterestCoverageTTM': 622.5,
        'quickRatioQuarterly': 0.93,
```

- [ ] **Step 2: Write the failing tests**

Add to `class FundamentalsShapingTest`:

```python
    def test_shapes_the_growth_and_leverage_fields(self):
        result = finnhub.to_fundamentals(
            SAMPLE_PROFILE, SAMPLE_FINANCIALS, SAMPLE_RECOMMENDATION, SAMPLE_EARNINGS
        )
        self.assertEqual(result['revenue_growth_ttm_yoy'], 14.2)
        self.assertEqual(result['eps_growth_ttm_yoy'], 32.6)
        self.assertEqual(result['revenue_growth_3y'], 1.8)
        self.assertEqual(result['revenue_growth_5y'], 8.7)
        self.assertEqual(result['eps_growth_3y'], 6.9)
        self.assertEqual(result['operating_margin_ttm'], 33.2)
        self.assertEqual(result['operating_margin_5y'], 30.7)
        self.assertEqual(result['gross_margin_5y'], 44.5)
        self.assertEqual(result['net_margin_5y'], 25.5)
        self.assertEqual(result['debt_to_equity'], 0.78)
        self.assertEqual(result['long_term_debt_to_equity'], 0.66)
        self.assertEqual(result['interest_coverage'], 622.5)
        self.assertEqual(result['quick_ratio'], 0.93)

    def test_growth_and_leverage_fields_absent_from_the_free_tier_are_none(self):
        result = finnhub.to_fundamentals(
            SAMPLE_PROFILE, {'metric': {'peNormalizedAnnual': 32.1}},
            SAMPLE_RECOMMENDATION, SAMPLE_EARNINGS,
        )
        self.assertIsNone(result['revenue_growth_ttm_yoy'])
        self.assertIsNone(result['debt_to_equity'])
        self.assertIsNone(result['interest_coverage'])

    def test_cache_key_carries_the_shape_version(self):
        self.assertEqual(finnhub._cache_key('AAPL'), 'research:fundamentals:v2:AAPL')
```

- [ ] **Step 3: Run the tests, verify they fail**

Run: `cd backend && .venv/bin/python manage.py test research.tests.FundamentalsShapingTest -v 2`
Expected: FAIL — `KeyError: 'revenue_growth_ttm_yoy'` and the cache-key assertion mismatches `research:fundamentals:AAPL`.

- [ ] **Step 4: Widen `to_fundamentals`**

In `backend/research/finnhub.py`, inside `to_fundamentals`, add these entries to the returned dict (next to the existing `_metric(...)` lines):

```python
        'revenue_growth_ttm_yoy': _metric(financials, 'revenueGrowthTTMYoy'),
        'eps_growth_ttm_yoy': _metric(financials, 'epsGrowthTTMYoy'),
        'revenue_growth_3y': _metric(financials, 'revenueGrowth3Y'),
        'revenue_growth_5y': _metric(financials, 'revenueGrowth5Y'),
        'eps_growth_3y': _metric(financials, 'epsGrowth3Y'),
        'operating_margin_ttm': _metric(financials, 'operatingMarginTTM'),
        'operating_margin_5y': _metric(financials, 'operatingMargin5Y'),
        'gross_margin_5y': _metric(financials, 'grossMargin5Y'),
        'net_margin_5y': _metric(financials, 'netProfitMargin5Y'),
        'debt_to_equity': _metric(financials, 'totalDebt/totalEquityQuarterly'),
        'long_term_debt_to_equity': _metric(financials, 'longTermDebt/equityQuarterly'),
        'interest_coverage': _metric(financials, 'netInterestCoverageTTM'),
        'quick_ratio': _metric(financials, 'quickRatioQuarterly'),
```

- [ ] **Step 5: Version the cache key**

In `backend/research/finnhub.py`, near the other TTL constants add:

```python
CACHE_V = 'v2'  # bump when the shaped fundamentals payload changes shape
```

and change `_cache_key`:

```python
def _cache_key(symbol):
    # Normalization (uppercasing) is the caller's job - FundamentalsView does
    # it once, on the way in.
    return f'research:fundamentals:{CACHE_V}:{symbol}'
```

- [ ] **Step 6: Run the tests, verify they pass**

Run: `cd backend && .venv/bin/python manage.py test research.tests.FundamentalsShapingTest research.tests.FundamentalsCacheTest research.tests.FundamentalsNoDataTest -v 2`
Expected: PASS (all).

- [ ] **Step 7: Run the full research suite**

Run: `cd backend && .venv/bin/python manage.py test research`
Expected: PASS — no regression.

- [ ] **Step 8: Commit**

```bash
git add backend/research/finnhub.py backend/research/tests.py
git commit -m "feat: surface Finnhub growth and leverage metrics we already fetch

$(printf 'Claude-Session: https://claude.ai/code/session_01PybJQDy4bPtNvqd9tzRJ4v')"
```

---

## Task 2: Backend — `valuation_history` from `series.annual`

**Files:**
- Modify: `backend/research/finnhub.py`
- Test: `backend/research/tests.py` (new `ValuationHistoryTest`)

**Interfaces:**
- Consumes: `to_fundamentals`'s `financials` arg — now also reads `financials['series']['annual']`.
- Produces: `finnhub._series_stats(series_annual: dict, key: str) -> dict | None` where dict is `{'latest': float, 'min': float, 'median': float, 'max': float, 'n': int}`.
- Produces: `finnhub._valuation_history(financials: dict) -> dict | None` — `{'pe': stats, 'ps': stats, 'pb': stats, 'ev_ebitda': stats}` minus any sub-key with no data; `None` when `series.annual` is missing/empty.
- Produces: `to_fundamentals(...)` return dict gains `'valuation_history'` **only when** `_valuation_history` is truthy (key absent otherwise).

- [ ] **Step 1: Add imports**

In `backend/research/finnhub.py` add near the top:

```python
import statistics
```

(There is no `datetime` import yet; Task 3 adds it. This task needs only `statistics`.)

- [ ] **Step 2: Write the failing tests**

Add to `backend/research/tests.py` (near `FundamentalsShapingTest`):

```python
SAMPLE_SERIES = {
    'annual': {
        'pe': [
            {'period': '2026-09-30', 'v': 34.0},
            {'period': '2025-09-30', 'v': 28.0},
            {'period': '2024-09-30', 'v': 24.0},
        ],
        'ps': [
            {'period': '2026-09-30', 'v': 10.0},
            {'period': '2025-09-30', 'v': 8.0},
        ],
        'pb': [],
    }
}


class ValuationHistoryTest(TestCase):
    def test_series_stats_reduces_a_named_annual_series(self):
        stats = finnhub._series_stats(SAMPLE_SERIES['annual'], 'pe')
        self.assertEqual(
            stats, {'latest': 34.0, 'min': 24.0, 'median': 28.0, 'max': 34.0, 'n': 3}
        )

    def test_series_stats_is_none_for_an_empty_or_missing_series(self):
        self.assertIsNone(finnhub._series_stats(SAMPLE_SERIES['annual'], 'pb'))
        self.assertIsNone(finnhub._series_stats(SAMPLE_SERIES['annual'], 'evEbitda'))

    def test_valuation_history_is_built_from_series_annual(self):
        financials = {**SAMPLE_FINANCIALS, 'series': SAMPLE_SERIES}
        result = finnhub.to_fundamentals(SAMPLE_PROFILE, financials, [], [])
        self.assertEqual(result['valuation_history']['pe']['median'], 28.0)
        self.assertIn('ps', result['valuation_history'])
        self.assertNotIn('pb', result['valuation_history'])
        self.assertNotIn('ev_ebitda', result['valuation_history'])

    def test_valuation_history_is_absent_without_a_series_block(self):
        result = finnhub.to_fundamentals(SAMPLE_PROFILE, SAMPLE_FINANCIALS, [], [])
        self.assertNotIn('valuation_history', result)
```

- [ ] **Step 3: Run the tests, verify they fail**

Run: `cd backend && .venv/bin/python manage.py test research.tests.ValuationHistoryTest -v 2`
Expected: FAIL — `AttributeError: module 'research.finnhub' has no attribute '_series_stats'`.

- [ ] **Step 4: Implement the helpers**

In `backend/research/finnhub.py`, add above `to_fundamentals`:

```python
_VALUATION_SERIES = {'pe': 'pe', 'ps': 'ps', 'pb': 'pb', 'ev_ebitda': 'evEbitda'}


def _series_stats(series_annual, key):
    points = [p['v'] for p in (series_annual.get(key) or []) if p.get('v') is not None]
    if not points:
        return None
    return {
        'latest': points[0],  # Finnhub sends newest first
        'min': min(points),
        'median': round(statistics.median(points), 2),
        'max': max(points),
        'n': len(points),
    }


def _valuation_history(financials):
    annual = (financials.get('series') or {}).get('annual') or {}
    if not annual:
        return None
    out = {}
    for out_key, series_key in _VALUATION_SERIES.items():
        stats = _series_stats(annual, series_key)
        if stats:
            out[out_key] = stats
    return out or None
```

- [ ] **Step 5: Wire it into `to_fundamentals`**

Refactor the tail of `to_fundamentals` from `return { ... }` to build, conditionally extend, then return:

```python
    shaped = {
        # ... all existing keys, unchanged, including the Task 1 additions ...
    }
    history = _valuation_history(financials)
    if history:
        shaped['valuation_history'] = history
    return shaped
```

- [ ] **Step 6: Run the tests, verify they pass**

Run: `cd backend && .venv/bin/python manage.py test research.tests.ValuationHistoryTest research.tests.FundamentalsShapingTest -v 2`
Expected: PASS.

- [ ] **Step 7: Full research suite**

Run: `cd backend && .venv/bin/python manage.py test research`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/research/finnhub.py backend/research/tests.py
git commit -m "feat: derive P/E P/S P/B EV-EBITDA history from Finnhub's series block

$(printf 'Claude-Session: https://claude.ai/code/session_01PybJQDy4bPtNvqd9tzRJ4v')"
```

---

## Task 3: Backend — company news endpoint

**Files:**
- Modify: `backend/research/finnhub.py`, `backend/research/views.py`, `backend/research/urls.py`, `backend/backend/settings.py`
- Test: `backend/research/tests.py` (new `CompanyNewsClientTest`, `CompanyNewsShapingTest`, `CompanyNewsViewTest`; extend `ThrottleScopeConfigTest`)

**Interfaces:**
- Produces: `finnhub.get_company_news(symbol, date_from, date_to) -> list[dict]` (raw Finnhub rows).
- Produces: `finnhub._to_news_item(row) -> {'id', 'datetime' (ISO 8601 str | None), 'headline', 'source', 'summary', 'url'}` — no `image`.
- Produces: `finnhub.news(symbol) -> {'available': True, 'items': list[news_item]}` — items newest-first, capped at `NEWS_MAX_ITEMS`, only rows with a headline + url + datetime.
- Produces: `GET /api/research/news/<symbol>/` → `CompanyNewsView`, `throttle_scope = 'research.news'`; renders `ProviderUnavailable` as `200 {'available': false, 'reason': ...}` via `provider_response`.
- Produces: `settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']['research.news'] = '30/min'`.

- [ ] **Step 1: Widen the datetime import**

In `backend/research/finnhub.py`, add:

```python
from datetime import date, datetime, timedelta, timezone
```

- [ ] **Step 2: Write the failing client + shaping tests**

Add to `backend/research/tests.py`:

```python
RAW_NEWS_ROW = {
    'category': 'company', 'datetime': 1_760_000_000, 'headline': 'Apple ships a thing',
    'id': 7, 'image': 'https://example.com/x.png', 'related': 'AAPL',
    'source': 'Reuters', 'summary': 'A short summary.', 'url': 'https://example.com/story',
}


class CompanyNewsClientTest(TestCase):
    @override_settings(FINNHUB_API_KEY='test-key')
    @patch('research.finnhub.requests.get')
    def test_calls_the_company_news_endpoint_with_the_window(self, mock_get):
        mock_get.return_value = Mock(ok=True, json=lambda: [])

        finnhub.get_company_news('AAPL', '2026-01-01', '2026-01-15')

        (url,), kwargs = mock_get.call_args
        self.assertEqual(url, 'https://finnhub.io/api/v1/company-news')
        self.assertEqual(kwargs['params']['symbol'], 'AAPL')
        self.assertEqual(kwargs['params']['from'], '2026-01-01')
        self.assertEqual(kwargs['params']['to'], '2026-01-15')


class CompanyNewsShapingTest(TestCase):
    def test_shapes_a_row_and_drops_the_image(self):
        item = finnhub._to_news_item(RAW_NEWS_ROW)
        self.assertEqual(item['id'], 7)
        self.assertEqual(item['headline'], 'Apple ships a thing')
        self.assertEqual(item['source'], 'Reuters')
        self.assertEqual(item['summary'], 'A short summary.')
        self.assertEqual(item['url'], 'https://example.com/story')
        self.assertNotIn('image', item)
        self.assertTrue(item['datetime'].startswith('2026-'))  # epoch -> ISO

    def test_a_row_without_a_timestamp_has_a_none_datetime(self):
        item = finnhub._to_news_item({k: v for k, v in RAW_NEWS_ROW.items() if k != 'datetime'})
        self.assertIsNone(item['datetime'])
```

- [ ] **Step 3: Run, verify fail**

Run: `cd backend && .venv/bin/python manage.py test research.tests.CompanyNewsClientTest research.tests.CompanyNewsShapingTest -v 2`
Expected: FAIL — `AttributeError: ... has no attribute 'get_company_news' / '_to_news_item'`.

- [ ] **Step 4: Implement client, shaping, and `news()`**

In `backend/research/finnhub.py`, add near the other TTL constants:

```python
NEWS_TTL = 7200           # 2h -- headlines move through the day, not by the second
NEWS_WINDOW_DAYS = 14
NEWS_MAX_ITEMS = 40
```

and add these functions (near `get_earnings_calendar`):

```python
def get_company_news(symbol, date_from, date_to):
    # Finnhub names the window params `from` / `to` (reserved in Python).
    return _get('/company-news', symbol=symbol, **{'from': date_from, 'to': date_to})


def _to_news_item(row):
    ts = row.get('datetime')
    return {
        'id': row.get('id'),
        'datetime': datetime.fromtimestamp(ts, tz=timezone.utc).isoformat() if ts else None,
        'headline': row.get('headline', ''),
        'source': row.get('source', ''),
        'summary': row.get('summary', ''),
        'url': row.get('url', ''),
    }


def news(symbol):
    today = date.today()
    start = today - timedelta(days=NEWS_WINDOW_DAYS)
    key = f'research:news:v1:{symbol}:{today.isoformat()}'

    def produce():
        rows = get_company_news(symbol, start.isoformat(), today.isoformat()) or []
        items = [_to_news_item(r) for r in rows if r.get('headline') and r.get('url')]
        items = [item for item in items if item['datetime']]
        items.sort(key=lambda item: item['datetime'], reverse=True)
        return items[:NEWS_MAX_ITEMS]

    return {'available': True, 'items': cache.get_or_set(key, produce, NEWS_TTL)}
```

- [ ] **Step 5: Run the client + shaping tests, verify pass**

Run: `cd backend && .venv/bin/python manage.py test research.tests.CompanyNewsClientTest research.tests.CompanyNewsShapingTest -v 2`
Expected: PASS.

- [ ] **Step 6: Write the failing view test**

Add to `backend/research/tests.py`:

```python
@override_settings(CACHES=LOCMEM)
class CompanyNewsViewTest(APITestCase):
    URL = '/api/research/news/AAPL/'

    def setUp(self):
        cache.clear()
        user = User.objects.create_user(username='alex', password='pw')
        token = RefreshToken.for_user(user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_requires_authentication(self):
        self.client.credentials()
        self.assertEqual(self.client.get(self.URL).status_code, 401)

    @override_settings(FINNHUB_API_KEY='test-key')
    @patch('research.finnhub.get_company_news')
    def test_returns_available_true_with_items_newest_first(self, mock_news):
        mock_news.return_value = [
            {**RAW_NEWS_ROW, 'id': 1, 'datetime': 1_759_000_000, 'headline': 'older'},
            {**RAW_NEWS_ROW, 'id': 2, 'datetime': 1_760_000_000, 'headline': 'newer'},
        ]
        response = self.client.get(self.URL)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['available'])
        self.assertEqual([i['headline'] for i in response.data['items']], ['newer', 'older'])
        self.assertNotIn('image', response.data['items'][0])

    @override_settings(FINNHUB_API_KEY='test-key')
    @patch('research.finnhub.get_company_news')
    def test_an_empty_feed_is_still_available_true(self, mock_news):
        mock_news.return_value = []
        response = self.client.get(self.URL)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {'available': True, 'items': []})

    @override_settings(FINNHUB_API_KEY='')
    def test_returns_available_false_when_not_configured(self):
        response = self.client.get(self.URL)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['available'])

    @override_settings(FINNHUB_API_KEY='test-key')
    @patch('research.finnhub.get_company_news')
    def test_returns_available_false_on_a_finnhub_error(self, mock_news):
        mock_news.side_effect = finnhub.FinnhubAPIError('boom')
        response = self.client.get(self.URL)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['available'])

    def test_rejects_a_malformed_symbol(self):
        self.assertEqual(self.client.get('/api/research/news/not a symbol/').status_code, 404)
```

Also add `research_views.CompanyNewsView` to the tuple in
`ThrottleScopeConfigTest.test_every_proxy_view_scope_has_a_configured_rate`.

- [ ] **Step 7: Run, verify fail**

Run: `cd backend && .venv/bin/python manage.py test research.tests.CompanyNewsViewTest research.tests.ThrottleScopeConfigTest -v 2`
Expected: FAIL — 404 on the URL (route missing) and `AttributeError` for `research_views.CompanyNewsView`.

- [ ] **Step 8: Add the view, route, and throttle rate**

`backend/research/views.py` — add (after `SymbolEarningsView`):

```python
class CompanyNewsView(APIView):
    throttle_scope = 'research.news'

    def get(self, request, symbol):
        symbol = _symbol(symbol)
        return provider_response(lambda: finnhub.news(symbol))
```

`backend/research/urls.py` — add `CompanyNewsView` to the import list and this route (place it above the `earnings/<str:symbol>/` route is unnecessary — prefixes differ — but keep it grouped with the other Finnhub routes):

```python
    path('news/<str:symbol>/', CompanyNewsView.as_view(), name='research-company-news'),
```

`backend/backend/settings.py` — in `DEFAULT_THROTTLE_RATES` add:

```python
        'research.news': '30/min',
```

- [ ] **Step 9: Run the view + throttle tests, verify pass**

Run: `cd backend && .venv/bin/python manage.py test research.tests.CompanyNewsViewTest research.tests.ThrottleScopeConfigTest -v 2`
Expected: PASS.

- [ ] **Step 10: Full backend suite**

Run: `cd backend && .venv/bin/python manage.py test`
Expected: PASS — no regression in any app.

- [ ] **Step 11: Commit**

```bash
git add backend/research/finnhub.py backend/research/views.py backend/research/urls.py backend/backend/settings.py backend/research/tests.py
git commit -m "feat: add a cached company-news proxy on the free Finnhub tier

$(printf 'Claude-Session: https://claude.ai/code/session_01PybJQDy4bPtNvqd9tzRJ4v')"
```

---

## Task 4: Frontend — `researchHref` + recent-symbols store

**Files:**
- Modify: `frontend/src/lib/research.js`
- Create: `frontend/src/lib/recentSymbols.js`
- Test: `frontend/src/lib/research.test.js` (extend), `frontend/src/lib/recentSymbols.test.js` (create)

**Interfaces:**
- Produces: `researchHref(symbol, tab)` — `string`. `researchHref('NVDA')` → `'/research?symbol=NVDA'`; `researchHref('BRK.B', 'earnings')` → `'/research?symbol=BRK.B&tab=earnings'`.
- Produces: `readRecentSymbols()` → `string[]` (newest first, ≤8, `[]` on any storage error).
- Produces: `pushRecentSymbol(symbol)` → `void` (dedups, caps at 8, never throws).

- [ ] **Step 1: Write the failing `researchHref` tests**

Add to `frontend/src/lib/research.test.js`:

```js
import { researchHref } from './research'

describe('researchHref', () => {
  it('builds a symbol-only research link', () => {
    expect(researchHref('NVDA')).toBe('/research?symbol=NVDA')
  })
  it('adds the tab when given one', () => {
    expect(researchHref('AAPL', 'earnings')).toBe('/research?symbol=AAPL&tab=earnings')
  })
  it('encodes an ampersand in the symbol', () => {
    expect(researchHref('A&B')).toBe('/research?symbol=A%26B')
  })
})
```

- [ ] **Step 2: Run, verify fail**

Run: `cd frontend && npx vitest run src/lib/research.test.js`
Expected: FAIL — `researchHref is not a function`.

- [ ] **Step 3: Implement `researchHref`**

Add to `frontend/src/lib/research.js`:

```js
/** Canonical link to the Research page for a symbol, optionally on a tab.
 *  One builder so every "open this company" affordance agrees on the URL. */
export function researchHref(symbol, tab) {
  const params = new URLSearchParams({ symbol })
  if (tab) params.set('tab', tab)
  return `/research?${params.toString()}`
}
```

- [ ] **Step 4: Run, verify pass**

Run: `cd frontend && npx vitest run src/lib/research.test.js`
Expected: PASS.

- [ ] **Step 5: Write the failing recent-symbols tests**

Create `frontend/src/lib/recentSymbols.test.js`:

```js
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readRecentSymbols, pushRecentSymbol } from './recentSymbols'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('recentSymbols', () => {
  it('returns an empty list when nothing is stored', () => {
    expect(readRecentSymbols()).toEqual([])
  })

  it('pushes newest-first and dedups', () => {
    pushRecentSymbol('AAPL')
    pushRecentSymbol('NVDA')
    pushRecentSymbol('AAPL')
    expect(readRecentSymbols()).toEqual(['AAPL', 'NVDA'])
  })

  it('caps the list at eight', () => {
    for (const s of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']) pushRecentSymbol(s)
    expect(readRecentSymbols()).toHaveLength(8)
    expect(readRecentSymbols()[0]).toBe('I')
  })

  it('ignores a falsy symbol', () => {
    pushRecentSymbol('')
    expect(readRecentSymbols()).toEqual([])
  })

  it('returns [] when reading throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(readRecentSymbols()).toEqual([])
  })

  it('does not throw when writing throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => pushRecentSymbol('AAPL')).not.toThrow()
  })
})
```

- [ ] **Step 6: Run, verify fail**

Run: `cd frontend && npx vitest run src/lib/recentSymbols.test.js`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement the store**

Create `frontend/src/lib/recentSymbols.js`:

```js
/** Recently-viewed Research symbols, newest first, for the ⌘K palette and the
 *  Research recent-chip strip. localStorage-backed and best-effort: a private
 *  window or disabled storage just means the feature is empty, never an error. */
const KEY = 'saxodash:recent-symbols'
const CAP = 8

export function readRecentSymbols() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? []
  } catch {
    return []
  }
}

export function pushRecentSymbol(symbol) {
  if (!symbol) return
  try {
    const next = [symbol, ...readRecentSymbols().filter((s) => s !== symbol)].slice(0, CAP)
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* storage unavailable - the feature degrades to empty */
  }
}
```

- [ ] **Step 8: Run, verify pass**

Run: `cd frontend && npx vitest run src/lib/recentSymbols.test.js`
Expected: PASS.

- [ ] **Step 9: Lint + commit**

```bash
cd frontend && npm run lint && cd ..
git add frontend/src/lib/research.js frontend/src/lib/research.test.js frontend/src/lib/recentSymbols.js frontend/src/lib/recentSymbols.test.js
git commit -m "feat: add researchHref and a recent-symbols store

$(printf 'Claude-Session: https://claude.ai/code/session_01PybJQDy4bPtNvqd9tzRJ4v')"
```

---

## Task 5: Frontend — link holdings to Research

**Files:**
- Modify: `frontend/src/pages/Dashboard.jsx`, `frontend/src/pages/Portfolio.jsx`, `frontend/src/components/analytics/Attribution.jsx`
- Test: `frontend/src/pages/Portfolio.test.jsx` (extend), `frontend/src/components/analytics/Attribution.test.jsx` (extend)

**Interfaces:**
- Consumes: `researchHref` from `../lib/research` (Dashboard, Portfolio) / `../../lib/research` (Attribution).
- No new exports.

- [ ] **Step 1: Write the failing Portfolio link test**

Add to `frontend/src/pages/Portfolio.test.jsx` inside `describe('Portfolio holdings table', ...)`:

```js
  it('links each holding name to its research page', () => {
    renderWithProviders(<Portfolio />)
    const link = screen.getByRole('link', { name: /MSFT/ })
    expect(link).toHaveAttribute('href', '/research?symbol=MSFT')
  })
```

- [ ] **Step 2: Run, verify fail**

Run: `cd frontend && npx vitest run src/pages/Portfolio.test.jsx`
Expected: FAIL — no link with that name (the ticker is a plain `<span>`).

- [ ] **Step 3: Link the Portfolio ticker cell**

In `frontend/src/pages/Portfolio.jsx`:
- add `import { Link } from 'react-router-dom'` and `import { researchHref } from '../lib/research'` (a `researchHref`-only import line is fine; there is no existing `lib/research` import in this file).
- replace the holdings `<td>` name cell's inner `<div className="flex items-center gap-2.5">…</div>` with:

```jsx
                      <Link to={researchHref(p.ticker)} className="flex items-center gap-2.5 group">
                        <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                        <span className="font-medium text-zinc-100 group-hover:text-blue-300">{p.ticker}</span>
                        <span className="text-zinc-500 truncate max-w-[140px]">{p.name}</span>
                      </Link>
```

Leave the `Total (…)` row unchanged.

- [ ] **Step 4: Run, verify pass**

Run: `cd frontend && npx vitest run src/pages/Portfolio.test.jsx`
Expected: PASS (all cases — the existing `getByText('MSFT').closest('tr')` lookups still resolve; the text is now inside a link inside the row).

- [ ] **Step 5: Link the Dashboard "Top positions" ticker cell**

In `frontend/src/pages/Dashboard.jsx` (`Link` is already imported):
- add `import { researchHref } from '../lib/research'`.
- replace the `<td className="px-5 py-3">` name cell's inner `<div className="flex items-center gap-2.5">…</div>` with the same `<Link to={researchHref(p.ticker)} className="flex items-center gap-2.5 group">` wrapper, `max-w-[160px]` on the name span, `group-hover:text-blue-300` on the ticker span.

(No Dashboard test file exists; Portfolio's test covers the pattern. Do not create one in this task.)

- [ ] **Step 6: Write the failing Attribution link test**

Add to `frontend/src/components/analytics/Attribution.test.jsx` (follow the file's existing render setup — it renders `<Attribution positions={...} />` directly; reuse its fixture):

```js
  it('links each ticker to its research page', () => {
    // reuse this file's existing positions fixture / render helper
    render(<Attribution positions={positions} />)
    expect(screen.getByRole('link', { name: 'NVDA' })).toHaveAttribute(
      'href', '/research?symbol=NVDA',
    )
  })
```

If the file's fixture has no `NVDA`, use whatever ticker its first fixture row carries and assert the matching href.

- [ ] **Step 7: Run, verify fail**

Run: `cd frontend && npx vitest run src/components/analytics/Attribution.test.jsx`
Expected: FAIL — ticker is a `<span>`.

- [ ] **Step 8: Link the Attribution ticker**

In `frontend/src/components/analytics/Attribution.jsx`:
- add `import { Link } from 'react-router-dom'` and `import { researchHref } from '../../lib/research'`.
- change `<span className="text-[12.5px] font-medium text-zinc-100">{r.ticker}</span>` to:

```jsx
            <Link to={researchHref(r.ticker)} className="text-[12.5px] font-medium text-zinc-100 hover:text-blue-300">
              {r.ticker}
            </Link>
```

- [ ] **Step 9: Run the two test files, verify pass**

Run: `cd frontend && npx vitest run src/pages/Portfolio.test.jsx src/components/analytics/Attribution.test.jsx`
Expected: PASS.

- [ ] **Step 10: Full frontend suite + lint**

Run: `cd frontend && npm test && npm run lint`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/pages/Dashboard.jsx frontend/src/pages/Portfolio.jsx frontend/src/components/analytics/Attribution.jsx frontend/src/pages/Portfolio.test.jsx frontend/src/components/analytics/Attribution.test.jsx
git commit -m "feat: link every holding to its Research page

$(printf 'Claude-Session: https://claude.ai/code/session_01PybJQDy4bPtNvqd9tzRJ4v')"
```

---

## Task 6: Frontend — ⌘K command palette

**Files:**
- Create: `frontend/src/lib/commands.js`, `frontend/src/components/CommandPalette.jsx`, `frontend/src/components/CommandPalette.test.jsx`
- Modify: `frontend/src/components/Layout.jsx`, `frontend/src/components/Sidebar.jsx`

**Interfaces:**
- Consumes: `useInstrumentSearch` from `../api/queries`; `researchHref` from `../lib/research`; `readRecentSymbols` from `../lib/recentSymbols`.
- Produces: `PAGE_COMMANDS` from `lib/commands.js` — `Array<{ label: string, to: string }>`.
- Produces: `CommandPalette` default export — `props: { open: boolean, onClose: () => void }`.

- [ ] **Step 1: Create the page list**

Create `frontend/src/lib/commands.js`:

```js
/** Static page targets for the command palette. Kept beside the router's own
 *  route table conceptually - update both together. */
export const PAGE_COMMANDS = [
  { label: 'Dashboard', to: '/' },
  { label: 'Portfolio', to: '/portfolio' },
  { label: 'Analytics', to: '/analytics' },
  { label: 'Research', to: '/research' },
  { label: 'Earnings', to: '/earnings' },
  { label: 'Transactions', to: '/transactions' },
  { label: 'Accounts', to: '/accounts' },
]
```

- [ ] **Step 2: Write the failing palette tests**

Create `frontend/src/components/CommandPalette.test.jsx`:

```js
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { renderWithProviders } from '../test/renderWithProviders'
import CommandPalette from './CommandPalette'

vi.mock('../api/queries')
import * as queries from '../api/queries'

const navigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => navigate,
}))

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  queries.useInstrumentSearch.mockReturnValue({ data: [], isLoading: false, error: null })
})
afterEach(() => localStorage.clear())

describe('CommandPalette', () => {
  it('renders nothing when closed', () => {
    renderWithProviders(<CommandPalette open={false} onClose={() => {}} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows recent symbols when the query is empty', () => {
    localStorage.setItem('saxodash:recent-symbols', JSON.stringify(['NVDA', 'AAPL']))
    renderWithProviders(<CommandPalette open onClose={() => {}} />)
    expect(screen.getByRole('option', { name: /NVDA/ })).toBeInTheDocument()
  })

  it('lists instrument results once the query is long enough', async () => {
    queries.useInstrumentSearch.mockReturnValue({
      data: [{ symbol: 'TSLA', description: 'Tesla Inc', exchange: 'NASDAQ', uic: 9, asset_type: 'Stock' }],
      isLoading: false, error: null,
    })
    renderWithProviders(<CommandPalette open onClose={vi.fn()} />)
    await userEvent.type(screen.getByRole('combobox'), 'tsla')
    expect(screen.getByRole('option', { name: /TSLA/ })).toBeInTheDocument()
  })

  it('navigates to Research on selecting an instrument', async () => {
    queries.useInstrumentSearch.mockReturnValue({
      data: [{ symbol: 'TSLA', description: 'Tesla Inc', exchange: 'NASDAQ', uic: 9, asset_type: 'Stock' }],
      isLoading: false, error: null,
    })
    const onClose = vi.fn()
    renderWithProviders(<CommandPalette open onClose={onClose} />)
    await userEvent.type(screen.getByRole('combobox'), 'tsla')
    await userEvent.click(screen.getByRole('option', { name: /TSLA/ }))
    expect(navigate).toHaveBeenCalledWith('/research?symbol=TSLA')
    expect(onClose).toHaveBeenCalled()
  })

  it('filters page commands by the query', async () => {
    renderWithProviders(<CommandPalette open onClose={vi.fn()} />)
    await userEvent.type(screen.getByRole('combobox'), 'analy')
    expect(screen.getByRole('option', { name: /Analytics/ })).toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    const onClose = vi.fn()
    renderWithProviders(<CommandPalette open onClose={onClose} />)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('still renders when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    renderWithProviders(<CommandPalette open onClose={vi.fn()} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run, verify fail**

Run: `cd frontend && npx vitest run src/components/CommandPalette.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `CommandPalette`**

Create `frontend/src/components/CommandPalette.jsx`:

```jsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'

import { useInstrumentSearch } from '../api/queries'
import { PAGE_COMMANDS } from '../lib/commands'
import { researchHref } from '../lib/research'
import { readRecentSymbols } from '../lib/recentSymbols'

/** ⌘K overlay: jump to any instrument's Research page or any app page.
 *  Controlled by Layout; renders nothing when `open` is false. */
export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)

  const trimmed = query.trim()
  const { data: results = [] } = useInstrumentSearch(trimmed)

  const items = useMemo(() => {
    const pages = PAGE_COMMANDS
      .filter((c) => !trimmed || c.label.toLowerCase().includes(trimmed.toLowerCase()))
      .map((c) => ({ key: `page:${c.to}`, label: c.label, hint: 'Page', to: c.to }))

    if (!trimmed) {
      const recent = readRecentSymbols().map((s) => ({
        key: `recent:${s}`, label: s, hint: 'Recent', to: researchHref(s),
      }))
      return [...recent, ...pages]
    }

    const instruments = results.map((r) => ({
      key: `sym:${r.uic}:${r.asset_type}`,
      label: `${r.symbol}  ·  ${r.description}`,
      hint: r.exchange || 'Instrument',
      to: researchHref(r.symbol),
    }))
    return [...instruments, ...pages]
  }, [trimmed, results])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      inputRef.current?.focus()
    }
  }, [open])

  useEffect(() => setActive(0), [query])

  if (!open) return null

  const go = (item) => {
    if (!item) return
    navigate(item.to)
    onClose()
  }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') return onClose()
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (items.length ? (i + 1) % items.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (items.length ? (i - 1 + items.length) % items.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(items[active])
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-[min(560px,92vw)] rounded-xl border border-white/10 bg-zinc-900 shadow-2xl shadow-black/50 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2 px-3 h-11 border-b border-white/[0.06]">
          <Search size={14} className="text-zinc-500" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-label="Search instruments and pages"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a symbol or a page…"
            className="flex-1 bg-transparent text-[13px] text-zinc-100 placeholder-zinc-600 outline-none"
          />
        </div>
        <ul id="command-palette-list" role="listbox" className="max-h-[320px] overflow-y-auto py-1">
          {items.length === 0 ? (
            <li className="px-3 py-3 text-[12px] text-zinc-500">No matches.</li>
          ) : (
            items.map((item, i) => (
              <li
                key={item.key}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(item)}
                className={`flex items-center justify-between gap-3 px-3 h-9 cursor-pointer text-[12.5px] ${
                  i === active ? 'bg-blue-500/10 text-blue-300' : 'text-zinc-200'
                }`}
              >
                <span className="truncate">{item.label}</span>
                <span className="text-[10px] uppercase tracking-wide text-zinc-600 shrink-0">{item.hint}</span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run, verify pass**

Run: `cd frontend && npx vitest run src/components/CommandPalette.test.jsx`
Expected: PASS.

- [ ] **Step 6: Wire it into `Layout`**

In `frontend/src/components/Layout.jsx`:
- import `CommandPalette` and `useState` is already imported (`useEffect, useState`).
- add state + a keydown listener; render the palette; pass an opener down to `Sidebar`:

```jsx
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
```

- pass `onOpenPalette={() => setPaletteOpen(true)}` to `<Sidebar ... />`.
- render `<CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />` inside the top-level `<div>`.

- [ ] **Step 7: Add the Sidebar button**

In `frontend/src/components/Sidebar.jsx`:
- accept `onOpenPalette` in props.
- add `Search` to the `lucide-react` import.
- directly above the `<nav>`, add (respecting the `collapsed` layout like the other buttons):

```jsx
      <button
        type="button"
        onClick={onOpenPalette}
        title="Search (⌘K)"
        className={`mx-2 mt-2 h-8 rounded-md border border-white/[0.06] text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 flex items-center ${
          collapsed ? 'justify-center' : 'px-2.5 gap-2'
        }`}
      >
        <Search size={14} />
        {!collapsed && <span className="text-[12px]">Search</span>}
        {!collapsed && <span className="ml-auto text-[10px] text-zinc-600">⌘K</span>}
      </button>
```

- [ ] **Step 8: Full frontend suite + lint**

Run: `cd frontend && npm test && npm run lint`
Expected: PASS. (No existing Layout/Sidebar test asserts the new button; if `Sidebar.test.jsx` exists and renders `<Sidebar />` without the prop, `onOpenPalette` is `undefined` — the button's `onClick={undefined}` is harmless. Leave those tests unchanged.)

- [ ] **Step 9: Commit**

```bash
git add frontend/src/lib/commands.js frontend/src/components/CommandPalette.jsx frontend/src/components/CommandPalette.test.jsx frontend/src/components/Layout.jsx frontend/src/components/Sidebar.jsx
git commit -m "feat: add a ⌘K command palette for instrument and page jumps

$(printf 'Claude-Session: https://claude.ai/code/session_01PybJQDy4bPtNvqd9tzRJ4v')"
```

---

## Task 7: Frontend — record and surface recent symbols on Research

**Files:**
- Modify: `frontend/src/pages/Research.jsx`
- Test: `frontend/src/pages/Research.test.jsx` (extend)

**Interfaces:**
- Consumes: `pushRecentSymbol`, `readRecentSymbols` from `../lib/recentSymbols`; `researchHref` not needed (uses `selectSymbol`).
- No new exports.

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/pages/Research.test.jsx` (inside `describe('Research', ...)`):

```js
  it('records the viewed symbol as recent', () => {
    renderWithProviders(<Research />, { route: '/research?symbol=AAPL' })
    expect(JSON.parse(localStorage.getItem('saxodash:recent-symbols'))).toContain('AAPL')
  })

  it('offers recent symbols as quick chips, excluding the current one', async () => {
    localStorage.setItem('saxodash:recent-symbols', JSON.stringify(['TSLA', 'AAPL']))
    renderWithProviders(<Research />, { route: '/research?symbol=AAPL' })
    const chip = screen.getByRole('button', { name: 'TSLA' })
    expect(chip).toBeInTheDocument()
    await userEvent.click(chip)
    expect(screen.getAllByText('TSLA').length).toBeGreaterThan(0)
  })
```

Add `import { beforeEach }`… already imported. Add a `localStorage.clear()` to the existing `beforeEach`.

- [ ] **Step 2: Run, verify fail**

Run: `cd frontend && npx vitest run src/pages/Research.test.jsx`
Expected: FAIL — nothing writes localStorage; no `TSLA` chip.

- [ ] **Step 3: Implement**

In `frontend/src/pages/Research.jsx`:
- `import { useEffect, useMemo, useState } from 'react'` — add `useEffect`.
- `import { pushRecentSymbol, readRecentSymbols } from '../lib/recentSymbols'`.
- after `symbol` is derived, add: `useEffect(() => { pushRecentSymbol(symbol) }, [symbol])`.
- directly under `<PageHeader ... />`, add the chip strip:

```jsx
        {(() => {
          const recent = readRecentSymbols().filter((s) => s !== symbol)
          return recent.length ? (
            <div className="flex items-center gap-1.5 mb-3 flex-wrap">
              <span className="text-[10px] uppercase tracking-wide text-zinc-600">Recent</span>
              {recent.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => selectSymbol(s)}
                  className="h-6 px-2 rounded border border-white/[0.06] text-[11.5px] text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04]"
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null
        })()}
```

(Reading localStorage on each render is fine — the list is ≤8 and the read is cheap. `selectSymbol` already exists in the component.)

- [ ] **Step 4: Run, verify pass**

Run: `cd frontend && npx vitest run src/pages/Research.test.jsx`
Expected: PASS (all cases, including the pre-existing ones).

- [ ] **Step 5: Full suite + lint + commit**

```bash
cd frontend && npm test && npm run lint && cd ..
git add frontend/src/pages/Research.jsx frontend/src/pages/Research.test.jsx
git commit -m "feat: remember recent Research symbols and offer them as chips

$(printf 'Claude-Session: https://claude.ai/code/session_01PybJQDy4bPtNvqd9tzRJ4v')"
```

---

## Task 8: Frontend — `getCompanyNews` + `useCompanyNews`

**Files:**
- Modify: `frontend/src/api/client.js`, `frontend/src/api/queries.js`
- Test: `frontend/src/api/client.test.js` (extend)

**Interfaces:**
- Produces: `getCompanyNews(symbol)` → `Promise<{available: boolean, items?: Array, reason?: string}>` hitting `GET /api/research/news/${symbol}/`.
- Produces: `queryKeys.companyNews = (symbol) => ['company-news', symbol]`.
- Produces: `useCompanyNews(symbol)` → TanStack Query result; `enabled: !!symbol`, `staleTime: 60 * 60_000`.

- [ ] **Step 1: Write the failing client test**

In `frontend/src/api/client.test.js`, follow the file's existing pattern for the other `get*` helpers and add:

```js
  it('getCompanyNews hits the per-symbol news route', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ available: true, items: [] }))
    await getCompanyNews('AAPL')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/research/news/AAPL/'),
      expect.any(Object),
    )
  })
```

(Use the same `fetchMock` / `jsonResponse` helpers and the same `import { getCompanyNews } from './client'` style already in the file. Match names to what the file actually defines.)

- [ ] **Step 2: Run, verify fail**

Run: `cd frontend && npx vitest run src/api/client.test.js`
Expected: FAIL — `getCompanyNews is not a function`.

- [ ] **Step 3: Add the client function**

In `frontend/src/api/client.js`, next to `getFundamentals`:

```js
export const getCompanyNews = (symbol) => apiFetch(`/api/research/news/${symbol}/`)
```

- [ ] **Step 4: Add the query hook**

In `frontend/src/api/queries.js`:
- add `getCompanyNews` to the import block from `./client`.
- add to `queryKeys`: `companyNews: (symbol) => ['company-news', symbol],`.
- add near `useFundamentals`:

```js
// News is a slow feed; 1h client staleness sits under the backend's 2h cache.
export function useCompanyNews(symbol) {
  return useQuery({
    queryKey: queryKeys.companyNews(symbol),
    queryFn: () => getCompanyNews(symbol),
    enabled: !!symbol,
    staleTime: 60 * 60_000,
  })
}
```

- [ ] **Step 5: Run, verify pass + full suite**

Run: `cd frontend && npx vitest run src/api/client.test.js && npm test`
Expected: PASS.

- [ ] **Step 6: Lint + commit**

```bash
cd frontend && npm run lint && cd ..
git add frontend/src/api/client.js frontend/src/api/queries.js frontend/src/api/client.test.js
git commit -m "feat: add the company-news client call and query hook

$(printf 'Claude-Session: https://claude.ai/code/session_01PybJQDy4bPtNvqd9tzRJ4v')"
```

---

## Task 9: Frontend — News tab replaces "Market context"

**Files:**
- Create: `frontend/src/components/research/NewsTab.jsx`, `frontend/src/components/research/NewsTab.test.jsx`
- Modify: `frontend/src/pages/Research.jsx`, `frontend/src/pages/Research.test.jsx`

**Interfaces:**
- Consumes: `useCompanyNews` from `../../api/queries`; `Card`, `CardHeader` from `../ui`.
- Produces: `NewsTab` default export — `props: { symbol: string }`.

- [ ] **Step 1: Write the failing NewsTab tests**

Create `frontend/src/components/research/NewsTab.test.jsx`:

```js
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

import NewsTab from './NewsTab'

vi.mock('../../api/queries')
import * as queries from '../../api/queries'

beforeEach(() => vi.clearAllMocks())

const item = (over) => ({
  id: 1, datetime: '2026-09-09T13:00:00+00:00', headline: 'A headline',
  source: 'Reuters', summary: 'A short summary.', url: 'https://example.com/a', ...over,
})

describe('NewsTab', () => {
  it('renders headlines as external links grouped by day', () => {
    queries.useCompanyNews.mockReturnValue({
      data: {
        available: true,
        items: [
          item({ id: 1, datetime: '2026-09-09T13:00:00+00:00', headline: 'Newer', url: 'https://x/1' }),
          item({ id: 2, datetime: '2026-09-08T09:00:00+00:00', headline: 'Older', url: 'https://x/2' }),
        ],
      },
      isLoading: false,
    })
    render(<NewsTab symbol="AAPL" />)
    const link = screen.getByRole('link', { name: 'Newer' })
    expect(link).toHaveAttribute('href', 'https://x/1')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByText('Older')).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
  })

  it('shows an empty state when there are no items', () => {
    queries.useCompanyNews.mockReturnValue({ data: { available: true, items: [] }, isLoading: false })
    render(<NewsTab symbol="AAPL" />)
    expect(screen.getByText(/No recent news for AAPL/)).toBeInTheDocument()
  })

  it('shows the reason when news is unavailable', () => {
    queries.useCompanyNews.mockReturnValue({
      data: { available: false, reason: 'Market data is not configured.' }, isLoading: false,
    })
    render(<NewsTab symbol="AAPL" />)
    expect(screen.getByText(/not configured/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run, verify fail**

Run: `cd frontend && npx vitest run src/components/research/NewsTab.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `NewsTab`**

Create `frontend/src/components/research/NewsTab.jsx`:

```jsx
import { useCompanyNews } from '../../api/queries'
import { Card, CardHeader } from '../ui'

const dayLabel = (iso) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
const timeLabel = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

function groupByDay(items) {
  const groups = []
  let current = null
  for (const item of items) {
    const key = new Date(item.datetime).toDateString()
    if (!current || current.key !== key) {
      current = { key, label: dayLabel(item.datetime), items: [] }
      groups.push(current)
    }
    current.items.push(item)
  }
  return groups
}

export default function NewsTab({ symbol }) {
  const { data, isLoading } = useCompanyNews(symbol)

  if (isLoading) {
    return (
      <Card>
        <CardHeader title="News" subtitle="From Finnhub" />
        <div className="mt-3 text-[12px] text-zinc-500">Loading…</div>
      </Card>
    )
  }

  if (!data?.available) {
    return (
      <Card>
        <CardHeader title="News" subtitle="From Finnhub" />
        <p className="mt-3 text-[12px] text-zinc-500">
          {data?.reason || `News is unavailable for ${symbol}.`}
        </p>
      </Card>
    )
  }

  if (data.items.length === 0) {
    return (
      <Card>
        <CardHeader title="News" subtitle="From Finnhub" />
        <p className="mt-3 text-[12px] text-zinc-500">No recent news for {symbol}.</p>
      </Card>
    )
  }

  return (
    <Card padding={false}>
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <CardHeader title="News" subtitle="Company headlines, last 14 days · Finnhub" />
      </div>
      <div className="divide-y divide-white/[0.04]">
        {groupByDay(data.items).map((group) => (
          <div key={group.key} className="px-4 py-2.5">
            <div className="text-[10px] uppercase tracking-wide text-zinc-600 mb-1.5">{group.label}</div>
            <ul className="space-y-2">
              {group.items.map((item) => (
                <li key={item.id ?? item.url}>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[12.5px] text-zinc-100 hover:text-blue-300"
                  >
                    {item.headline}
                  </a>
                  <div className="text-[11px] text-zinc-500 mt-0.5">
                    <span className="num font-mono">{timeLabel(item.datetime)}</span>
                    {' · '}
                    {item.source}
                    {item.summary ? <span className="line-clamp-1"> — {item.summary}</span> : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  )
}
```

- [ ] **Step 4: Run, verify pass**

Run: `cd frontend && npx vitest run src/components/research/NewsTab.test.jsx`
Expected: PASS.

- [ ] **Step 5: Swap the tab in `Research.jsx`**

In `frontend/src/pages/Research.jsx`:
- remove `import ComingSoon from '../components/research/ComingSoon'` and add `import NewsTab from '../components/research/NewsTab'`.
- change the `TABS` entry `['market', 'Market context']` to `['news', 'News']`.
- replace `{tab === 'market' ? <ComingSoon feature="Market context" /> : null}` with `{tab === 'news' ? <NewsTab symbol={symbol} /> : null}`.

(`TAB_KEYS` derives from `TABS`, so `?tab=market` now falls through the existing `TAB_KEYS.has(requestedTab) ? requestedTab : 'overview'` guard to Overview — no migration code needed.)

- [ ] **Step 6: Update `Research.test.jsx`**

- Add to `stubQueries` (so switching to the News tab in any future test does not crash the auto-mock):

```js
  queries.useCompanyNews.mockReturnValue({ ...idle, data: { available: true, items: [] } })
```

- Add these cases:

```js
  it('offers a News tab, not a Market context tab', () => {
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })
    expect(screen.getByRole('button', { name: 'News' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Market context' })).not.toBeInTheDocument()
  })

  it('shows the news feed on the News tab', async () => {
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })
    await userEvent.click(screen.getByRole('button', { name: 'News' }))
    expect(screen.getByText(/No recent news for NVDA/)).toBeInTheDocument()
  })

  it('falls back to Overview for the retired ?tab=market link', () => {
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA&tab=market' })
    expect(screen.getByText('Your position')).toBeInTheDocument()
  })
```

- [ ] **Step 7: Run Research tests + full suite + lint**

Run: `cd frontend && npx vitest run src/pages/Research.test.jsx src/components/research/NewsTab.test.jsx && npm test && npm run lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/research/NewsTab.jsx frontend/src/components/research/NewsTab.test.jsx frontend/src/pages/Research.jsx frontend/src/pages/Research.test.jsx
git commit -m "feat: replace the dead Market context tab with a company News feed

$(printf 'Claude-Session: https://claude.ai/code/session_01PybJQDy4bPtNvqd9tzRJ4v')"
```

---

## Task 10: Frontend — `lib/snapshot.js` verdict rules

**Files:**
- Create: `frontend/src/lib/snapshot.js`, `frontend/src/lib/snapshot.test.js`

**Interfaces:**
- Produces, each `(fundamentals) => { tone: 'pos' | 'neutral' | 'caution', text: string }`:
  `growthVerdict`, `profitabilityVerdict`, `healthVerdict`, `valuationVerdict`, `momentumVerdict`.
- Produces: `SNAPSHOT_GROUPS` — `Array<{ key, label, metrics: Array<{ label, field, fmt }>, verdict: fn }>` for the component to iterate. `fmt` is one of the string tags `'pct'` / `'num'` / `'x'` the component maps to a formatter.
- A verdict fn returns `{ tone: 'neutral', text: 'Limited data' }` when every field it needs is `null`/`undefined`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/snapshot.test.js`:

```js
import { describe, expect, it } from 'vitest'
import {
  growthVerdict, profitabilityVerdict, healthVerdict, valuationVerdict, momentumVerdict,
} from './snapshot'

describe('growthVerdict', () => {
  it('flags fast growth', () => {
    expect(growthVerdict({ revenue_growth_ttm_yoy: 22 }).tone).toBe('pos')
  })
  it('flags contraction', () => {
    expect(growthVerdict({ revenue_growth_ttm_yoy: -4 }).tone).toBe('caution')
  })
  it('notes EPS outpacing revenue', () => {
    expect(growthVerdict({ revenue_growth_ttm_yoy: 10, eps_growth_ttm_yoy: 20 }).text)
      .toMatch(/EPS outpacing revenue/)
  })
  it('is Limited data when nothing is present', () => {
    expect(growthVerdict({})).toEqual({ tone: 'neutral', text: 'Limited data' })
  })
})

describe('profitabilityVerdict', () => {
  it('calls high ROE + margin highly profitable', () => {
    expect(profitabilityVerdict({ roe: 25, net_margin: 15 }).tone).toBe('pos')
  })
  it('flags thin margins', () => {
    expect(profitabilityVerdict({ roe: 2, net_margin: 1 }).tone).toBe('caution')
  })
})

describe('healthVerdict', () => {
  it('flags leverage', () => {
    expect(healthVerdict({ debt_to_equity: 3, current_ratio: 0.8 }).tone).toBe('caution')
  })
  it('praises a conservative balance sheet', () => {
    expect(healthVerdict({ debt_to_equity: 0.4, current_ratio: 2 }).tone).toBe('pos')
  })
})

describe('valuationVerdict', () => {
  it('calls a low PEG cheap for the growth', () => {
    expect(valuationVerdict({ peg_ratio: 0.8 }).tone).toBe('pos')
  })
  it('reads P/E against its own history', () => {
    const v = valuationVerdict({ pe_ratio: 40, valuation_history: { pe: { min: 15, median: 25, max: 30, n: 6 } } })
    expect(v.text).toMatch(/above its 6-yr range/)
  })
})

describe('momentumVerdict', () => {
  it('flags a year of losses', () => {
    expect(momentumVerdict({ price_return_1y: -20 }).tone).toBe('caution')
  })
  it('notes YTD lag', () => {
    expect(momentumVerdict({ price_return_1y: 15, price_return_ytd: -3 }).text).toMatch(/lagging YTD/)
  })
})
```

- [ ] **Step 2: Run, verify fail**

Run: `cd frontend && npx vitest run src/lib/snapshot.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/snapshot.js`**

Create `frontend/src/lib/snapshot.js`:

```js
/** Rule-based one-line reads for the Research Investment Snapshot. Pure and
 *  tested in isolation; the component only renders what these return. Thresholds
 *  are named here so the InfoTip copy and the code cannot drift apart. */

const T = {
  revFast: 15, revSteady: 5,
  epsGap: 3,
  roeStrong: 15, marginStrong: 10, roeOk: 8, marginOk: 5,
  deHigh: 2, deLow: 1, currLow: 1, currStrong: 1.5, coverLow: 3,
  pegCheap: 1, pegRich: 2,
  momUp: 10, momDown: -10,
  histBand: 0.1,
}

const has = (...vals) => vals.some((v) => v != null)
const limited = { tone: 'neutral', text: 'Limited data' }

export function growthVerdict(f) {
  const rev = f.revenue_growth_ttm_yoy
  const eps = f.eps_growth_ttm_yoy
  if (!has(rev, eps, f.revenue_growth_5y)) return limited

  let tone = 'neutral'
  let text
  if (rev == null) {
    text = 'Revenue trend unclear'
  } else if (rev > T.revFast) { tone = 'pos'; text = 'Revenue growing fast' }
  else if (rev > T.revSteady) { text = 'Steady revenue growth' }
  else if (rev > 0) { text = 'Modest revenue growth' }
  else { tone = 'caution'; text = 'Revenue contracting' }

  if (rev != null && eps != null) {
    if (eps > rev + T.epsGap) text += '; EPS outpacing revenue'
    else if (eps < rev - T.epsGap) text += '; EPS lagging revenue'
  }
  return { tone, text }
}

export function profitabilityVerdict(f) {
  const { roe, net_margin: nm } = f
  if (!has(roe, nm, f.gross_margin, f.operating_margin_ttm)) return limited
  if ((roe ?? 0) > T.roeStrong && (nm ?? 0) > T.marginStrong) {
    return { tone: 'pos', text: 'Highly profitable' }
  }
  if ((roe ?? 0) > T.roeOk || (nm ?? 0) > T.marginOk) {
    return { tone: 'neutral', text: 'Profitable' }
  }
  return { tone: 'caution', text: 'Thin or negative margins' }
}

export function healthVerdict(f) {
  const { debt_to_equity: de, current_ratio: cr, interest_coverage: ic } = f
  if (!has(de, cr, ic, f.quick_ratio)) return limited
  if ((de ?? 0) > T.deHigh || (cr ?? 99) < T.currLow || (ic ?? 99) < T.coverLow) {
    return { tone: 'caution', text: 'Leveraged or tight on liquidity' }
  }
  if ((de ?? 99) < T.deLow && (cr ?? 0) > T.currStrong) {
    return { tone: 'pos', text: 'Conservative balance sheet' }
  }
  return { tone: 'neutral', text: 'Adequate balance sheet' }
}

export function valuationVerdict(f) {
  const peg = f.peg_ratio
  const pe = f.pe_ratio
  const hist = f.valuation_history?.pe
  if (!has(peg, pe) && !hist) return limited

  let tone = 'neutral'
  const parts = []
  if (peg != null) {
    if (peg < T.pegCheap) { tone = 'pos'; parts.push('growth looks cheap vs. earnings growth') }
    else if (peg > T.pegRich) { tone = 'caution'; parts.push('expensive vs. growth') }
    else parts.push('fairly priced vs. growth')
  }
  if (hist && pe != null) {
    if (pe > hist.median * (1 + T.histBand)) { tone = 'caution'; parts.push(`P/E above its ${hist.n}-yr range`) }
    else if (pe < hist.median * (1 - T.histBand)) { if (tone !== 'caution') tone = 'pos'; parts.push(`P/E below its ${hist.n}-yr range`) }
    else parts.push(`P/E in line with its ${hist.n}-yr range`)
  }
  return { tone, text: parts.join('; ') || 'Limited data' }
}

export function momentumVerdict(f) {
  const y = f.price_return_1y
  if (!has(y, f.price_return_ytd, f.price_return_1m)) return limited
  let tone = 'neutral'
  let text
  if (y == null) text = 'Price trend unclear'
  else if (y > T.momUp) { tone = 'pos'; text = 'Up over the past year' }
  else if (y < T.momDown) { tone = 'caution'; text = 'Down over the past year' }
  else text = 'Roughly flat over the past year'
  if ((f.price_return_ytd ?? 0) < 0) text += '; lagging YTD'
  return { tone, text }
}

export const SNAPSHOT_GROUPS = [
  {
    key: 'growth', label: 'Growth', verdict: growthVerdict,
    metrics: [
      { label: 'Revenue YoY', field: 'revenue_growth_ttm_yoy', fmt: 'pct' },
      { label: 'EPS YoY', field: 'eps_growth_ttm_yoy', fmt: 'pct' },
      { label: 'Revenue 5Y', field: 'revenue_growth_5y', fmt: 'pct' },
    ],
  },
  {
    key: 'profitability', label: 'Profitability', verdict: profitabilityVerdict,
    metrics: [
      { label: 'ROE', field: 'roe', fmt: 'pct' },
      { label: 'Net margin', field: 'net_margin', fmt: 'pct' },
      { label: 'Gross margin', field: 'gross_margin', fmt: 'pct' },
      { label: 'Op. margin', field: 'operating_margin_ttm', fmt: 'pct' },
    ],
  },
  {
    key: 'health', label: 'Financial health', verdict: healthVerdict,
    metrics: [
      { label: 'Current ratio', field: 'current_ratio', fmt: 'num' },
      { label: 'Debt/equity', field: 'debt_to_equity', fmt: 'num' },
      { label: 'Int. coverage', field: 'interest_coverage', fmt: 'num' },
      { label: 'Quick ratio', field: 'quick_ratio', fmt: 'num' },
    ],
  },
  {
    key: 'valuation', label: 'Valuation', verdict: valuationVerdict,
    metrics: [
      { label: 'P/E', field: 'pe_ratio', fmt: 'num' },
      { label: 'Forward P/E', field: 'forward_pe', fmt: 'num' },
      { label: 'PEG', field: 'peg_ratio', fmt: 'num' },
      { label: 'EV/EBITDA', field: 'ev_ebitda', fmt: 'num' },
    ],
  },
  {
    key: 'momentum', label: 'Momentum', verdict: momentumVerdict,
    metrics: [
      { label: '1 month', field: 'price_return_1m', fmt: 'pct' },
      { label: 'YTD', field: 'price_return_ytd', fmt: 'pct' },
      { label: '1 year', field: 'price_return_1y', fmt: 'pct' },
      { label: 'Beta', field: 'beta', fmt: 'num' },
    ],
  },
]
```

- [ ] **Step 4: Run, verify pass**

Run: `cd frontend && npx vitest run src/lib/snapshot.test.js`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
cd frontend && npm run lint && cd ..
git add frontend/src/lib/snapshot.js frontend/src/lib/snapshot.test.js
git commit -m "feat: add rule-based verdicts for the Research Investment Snapshot

$(printf 'Claude-Session: https://claude.ai/code/session_01PybJQDy4bPtNvqd9tzRJ4v')"
```

---

## Task 11: Frontend — `SnapshotSection` on the Overview tab

**Files:**
- Create: `frontend/src/components/research/SnapshotSection.jsx`, `frontend/src/components/research/SnapshotSection.test.jsx`
- Modify: `frontend/src/components/research/OverviewTab.jsx`, `frontend/src/components/research/OverviewTab.test.jsx`

**Interfaces:**
- Consumes: `SNAPSHOT_GROUPS` from `../../lib/snapshot`; `FundamentalsGate` from `./FundamentalsGate`; `Card`, `CardHeader`, `InfoTip` from `../ui`; `fmtNum`, `fmtPct` from `../../lib/format`.
- Produces: `SnapshotSection` default export — `props: { fundamentals }` (the raw `useFundamentals` result: `{ data, isLoading }`).

- [ ] **Step 1: Write the failing SnapshotSection tests**

Create `frontend/src/components/research/SnapshotSection.test.jsx`:

```js
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import SnapshotSection from './SnapshotSection'

const data = {
  available: true,
  revenue_growth_ttm_yoy: 22, eps_growth_ttm_yoy: 30, revenue_growth_5y: 12,
  roe: 25, net_margin: 15, gross_margin: 60, operating_margin_ttm: 30,
  current_ratio: 2, debt_to_equity: 0.4, interest_coverage: 40, quick_ratio: 1.8,
  pe_ratio: 40, forward_pe: 30, peg_ratio: 0.8, ev_ebitda: 22,
  price_return_1m: 3, price_return_ytd: 12, price_return_1y: 25, beta: 1.2,
  valuation_history: { pe: { min: 15, median: 25, max: 30, n: 6, latest: 40 } },
}

describe('SnapshotSection', () => {
  it('renders all five groups with a verdict each', () => {
    render(<SnapshotSection fundamentals={{ data, isLoading: false }} />)
    for (const label of ['Growth', 'Profitability', 'Financial health', 'Valuation', 'Momentum']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getByText('Revenue growing fast; EPS outpacing revenue')).toBeInTheDocument()
    expect(screen.getByText(/P\/E above its 6-yr range/)).toBeInTheDocument()
  })

  it('shows an em dash for a missing metric but still renders the group', () => {
    render(<SnapshotSection fundamentals={{ data: { available: true, roe: 25, net_margin: 15 }, isLoading: false }} />)
    expect(screen.getByText('Profitability')).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('defers to FundamentalsGate when unavailable', () => {
    render(<SnapshotSection fundamentals={{ data: { available: false, reason: 'no coverage' }, isLoading: false }} />)
    expect(screen.getByText(/no coverage/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run, verify fail**

Run: `cd frontend && npx vitest run src/components/research/SnapshotSection.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `SnapshotSection`**

Create `frontend/src/components/research/SnapshotSection.jsx`:

```jsx
import { fmtNum, fmtPct } from '../../lib/format'
import { SNAPSHOT_GROUPS } from '../../lib/snapshot'
import { Card, CardHeader, InfoTip } from '../ui'
import FundamentalsGate from './FundamentalsGate'

const TONE_DOT = { pos: 'bg-emerald-400', neutral: 'bg-zinc-500', caution: 'bg-amber-400' }

function fmtField(value, fmt) {
  if (value == null) return '—'
  if (fmt === 'pct') return fmtPct(value, { sign: false, decimals: 1 })
  return fmtNum(value, 2)
}

function Group({ group, data }) {
  const verdict = group.verdict(data)
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide text-zinc-500 font-medium">{group.label}</span>
        <span className="flex items-center gap-1.5 text-[11.5px] text-zinc-400">
          <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[verdict.tone]}`} />
          {verdict.text}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
        {group.metrics.map((m) => (
          <div key={m.field}>
            <div className="text-[10px] text-zinc-600 uppercase tracking-wide">{m.label}</div>
            <div className="text-[13px] num font-mono text-zinc-100 mt-0.5">{fmtField(data[m.field], m.fmt)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function SnapshotSection({ fundamentals }) {
  return (
    <FundamentalsGate
      fundamentals={fundamentals}
      title="Investment snapshot"
      fallback="A snapshot needs company fundamentals, which are unavailable for this symbol."
    >
      {(data) => (
        <Card>
          <CardHeader
            title="Investment snapshot"
            subtitle="Grouped reads from Finnhub fundamentals"
            right={
              <InfoTip>
                Growth reads TTM YoY revenue and EPS growth. Profitability reads ROE and net
                margin. Financial health reads debt/equity, current ratio and interest coverage.
                Valuation reads PEG and P/E against its own annual history. Momentum reads the
                1-year and YTD price return. No composite score.
              </InfoTip>
            }
          />
          <div className="mt-2 divide-y divide-white/[0.06]">
            {SNAPSHOT_GROUPS.map((group) => (
              <Group key={group.key} group={group} data={data} />
            ))}
          </div>
        </Card>
      )}
    </FundamentalsGate>
  )
}
```

- [ ] **Step 4: Run, verify pass**

Run: `cd frontend && npx vitest run src/components/research/SnapshotSection.test.jsx`
Expected: PASS.

- [ ] **Step 5: Render it in `OverviewTab` and fix the existing test's ambiguity**

In `frontend/src/components/research/OverviewTab.jsx`:
- `import SnapshotSection from './SnapshotSection'`.
- in the returned JSX, insert `<SnapshotSection fundamentals={fundamentals} />` immediately after `{position ? <PositionCard position={position} /> : null}` and before the `InstrumentCard`/`RangeStatsCard` grid.

In `frontend/src/components/research/OverviewTab.test.jsx` — the existing
`getByText('32.10')` now matches both the `FundamentalsCard` P/E and the
Snapshot Valuation P/E. Change the two assertions in
`test('shows real metrics when fundamentals are available')` to:

```js
    expect(screen.getAllByText('32.10').length).toBeGreaterThan(0)
    expect(screen.getByText('3.10T')).toBeInTheDocument()
```

and add:

```js
  it('renders the investment snapshot from the same fundamentals', () => {
    render(
      <OverviewTab
        symbol="AAPL" position={null} details={null} detailsLoading={false}
        bars={bars} range="1M"
        fundamentals={{
          data: {
            available: true, name: 'Apple Inc', pe_ratio: 32.1, market_cap: 3_100_000,
            dividend_yield: 0.44, revenue_growth_ttm_yoy: 12, net_margin: 25, roe: 30,
          },
          isLoading: false,
        }}
      />,
    )
    expect(screen.getByText('Investment snapshot')).toBeInTheDocument()
    expect(screen.getByText('Growth')).toBeInTheDocument()
  })
```

- [ ] **Step 6: Run OverviewTab tests + full suite + lint**

Run: `cd frontend && npx vitest run src/components/research/OverviewTab.test.jsx src/components/research/SnapshotSection.test.jsx && npm test && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/research/SnapshotSection.jsx frontend/src/components/research/SnapshotSection.test.jsx frontend/src/components/research/OverviewTab.jsx frontend/src/components/research/OverviewTab.test.jsx
git commit -m "feat: add a grouped Investment Snapshot to Research Overview

$(printf 'Claude-Session: https://claude.ai/code/session_01PybJQDy4bPtNvqd9tzRJ4v')"
```

---

## Task 12: Frontend — demote the instrument-reference card to a strip

**Files:**
- Modify: `frontend/src/components/research/OverviewTab.jsx`, `frontend/src/components/research/OverviewTab.test.jsx`

**Interfaces:**
- Produces: `ReferenceStrip({ symbol, details, isLoading })` — internal to `OverviewTab.jsx` (not exported).
- Removes: `InstrumentCard` from `OverviewTab.jsx`.

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/components/research/OverviewTab.test.jsx`:

```js
  it('shows instrument reference data as a compact strip, omitting missing fields', () => {
    render(
      <OverviewTab
        symbol="AAPL" position={null}
        details={{ symbol: 'AAPL', exchange_name: 'Nasdaq', currency: 'USD', isin: 'US0378331005', uic: 211 }}
        detailsLoading={false} bars={bars} range="1M"
        fundamentals={{ data: { available: false, reason: 'x' }, isLoading: false }}
      />,
    )
    expect(screen.getByText('US0378331005')).toBeInTheDocument()
    expect(screen.getByText('Nasdaq')).toBeInTheDocument()
    // 'Instrument reference data from Saxo' was the old card's subtitle — gone now.
    expect(screen.queryByText(/reference data from Saxo/)).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run, verify fail**

Run: `cd frontend && npx vitest run src/components/research/OverviewTab.test.jsx`
Expected: FAIL — the old subtitle text is still present.

- [ ] **Step 3: Replace `InstrumentCard` with `ReferenceStrip`**

In `frontend/src/components/research/OverviewTab.jsx`:
- delete the `InstrumentCard` function.
- add:

```jsx
function ReferenceStrip({ symbol, details, isLoading }) {
  if (isLoading) return <div className="h-4 w-64 rounded bg-white/[0.05]" />
  const pairs = [
    ['Exchange', details?.exchange_name || details?.exchange],
    ['Currency', details?.currency],
    ['ISIN', details?.isin],
    ['Uic', details?.uic],
    ['Lot size', details?.lot_size],
    ['Asset type', details?.asset_type],
  ].filter(([, v]) => v != null && v !== '')

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-zinc-500">
      <span className="text-zinc-400 font-medium">{details?.description || symbol}</span>
      {pairs.map(([label, value]) => (
        <span key={label}>
          {label} <span className="text-zinc-300 num font-mono">{value}</span>
        </span>
      ))}
    </div>
  )
}
```

- in the returned JSX, change the grid that held `<InstrumentCard .../>` + `<RangeStatsCard .../>`: pull `RangeStatsCard` out to full width (or keep it paired with `FundamentalsCard`), and render `<ReferenceStrip symbol={symbol} details={details} isLoading={detailsLoading} />` on its own line right after `<SnapshotSection .../>`. Final order:

```jsx
    <div className="space-y-4">
      {position ? <PositionCard position={position} /> : null}
      <SnapshotSection fundamentals={fundamentals} />
      <ReferenceStrip symbol={symbol} details={details} isLoading={detailsLoading} />
      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <RangeStatsCard bars={bars} range={range} />
        <FundamentalsCard fundamentals={fundamentals} />
      </div>
    </div>
```

- [ ] **Step 4: Run, verify pass + full suite + lint**

Run: `cd frontend && npx vitest run src/components/research/OverviewTab.test.jsx && npm test && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/research/OverviewTab.jsx frontend/src/components/research/OverviewTab.test.jsx
git commit -m "refactor: demote Saxo instrument reference data to a compact strip

$(printf 'Claude-Session: https://claude.ai/code/session_01PybJQDy4bPtNvqd9tzRJ4v')"
```

---

## Task 13: Frontend — valuation-vs-history context in `ValuationTab`

**Files:**
- Modify: `frontend/src/components/research/ValuationTab.jsx`, `frontend/src/components/research/ValuationTab.test.jsx`

**Interfaces:**
- Produces: `HistoryContext({ stats })` — internal to `ValuationTab.jsx`. `stats` is `{ latest, min, median, max, n }` or falsy.
- Consumes: `data.valuation_history` from the fundamentals payload (Task 2).

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/components/research/ValuationTab.test.jsx`:

```js
  it('shows P/E against its own multi-year range when history is available', () => {
    render(
      <ValuationTab
        fundamentals={{
          data: { ...AVAILABLE, valuation_history: { pe: { latest: 32.1, min: 12, median: 22, max: 35, n: 7 } } },
          isLoading: false,
        }}
      />,
    )
    expect(screen.getByText(/median 22/)).toBeInTheDocument()
    expect(screen.getByText(/over 7 yrs/)).toBeInTheDocument()
  })

  it('omits the history context when valuation_history is absent', () => {
    render(<ValuationTab fundamentals={{ data: AVAILABLE, isLoading: false }} />)
    expect(screen.queryByText(/over \d+ yrs/)).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run, verify fail**

Run: `cd frontend && npx vitest run src/components/research/ValuationTab.test.jsx`
Expected: FAIL — no history text.

- [ ] **Step 3: Implement `HistoryContext` and render it**

In `frontend/src/components/research/ValuationTab.jsx`:
- add:

```jsx
function HistoryContext({ stats }) {
  if (!stats || stats.min === stats.max) return null
  const pos = Math.min(100, Math.max(0, ((stats.latest - stats.min) / (stats.max - stats.min)) * 100))
  return (
    <div className="mt-1.5">
      <div className="relative h-1 bg-white/[0.07] rounded-full">
        <span
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-blue-400"
          style={{ left: `${pos}%` }}
        />
      </div>
      <div className="mt-1 text-[9.5px] num font-mono text-zinc-600">
        {fmtNum(stats.min, 1)} · median {fmtNum(stats.median, 1)} · {fmtNum(stats.max, 1)} over {stats.n} yrs
      </div>
    </div>
  )
}
```

- in the "Ratios" card, wrap the four `Ratio` cells that have history (`P/E`, `P/S`, `P/B`, `EV/EBITDA`) so each is followed by its context. Simplest: replace those four `<Ratio .../>` with a small local wrapper:

```jsx
              <div>
                <Ratio label="P/E" value={fmtNum(data.pe_ratio, 2)} />
                <HistoryContext stats={data.valuation_history?.pe} />
              </div>
              <div>
                <Ratio label="P/S" value={fmtNum(data.ps_ratio, 2)} />
                <HistoryContext stats={data.valuation_history?.ps} />
              </div>
              <div>
                <Ratio label="P/B" value={fmtNum(data.pb_ratio, 2)} />
                <HistoryContext stats={data.valuation_history?.pb} />
              </div>
              <div>
                <Ratio label="PEG" value={fmtNum(data.peg_ratio, 2)} />
              </div>
```

and move `EV/EBITDA`'s context similarly where that `Ratio` renders. Keep the rest of the grid unchanged.

- [ ] **Step 4: Run, verify pass + full suite + lint**

Run: `cd frontend && npx vitest run src/components/research/ValuationTab.test.jsx && npm test && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/research/ValuationTab.jsx frontend/src/components/research/ValuationTab.test.jsx
git commit -m "feat: show P/E P/S P/B EV/EBITDA against their own multi-year range

$(printf 'Claude-Session: https://claude.ai/code/session_01PybJQDy4bPtNvqd9tzRJ4v')"
```

---

## Task 14: Frontend — design tokens + shared primitives

**Files:**
- Modify: `frontend/src/index.css`, `frontend/src/components/ui.jsx`
- Test: `frontend/src/components/ui.test.jsx` (create)

**Interfaces:**
- Produces: `StatStrip({ children })` and `StatRow({ label, value, badge, badgeTone, note })` from `components/ui.jsx` — a single bordered container with `divide-x` between rows; `StatRow` prop surface matches `StatCard`.
- Produces: `Skeleton({ className })` from `components/ui.jsx`.
- Produces: `Metric({ label, value, tone, hint })` from `components/ui.jsx` (lifted; identical render to `OverviewTab`'s current local one).

- [ ] **Step 1: Add the documented scale to `@theme`**

In `frontend/src/index.css`, inside the `@theme { ... }` block, add:

```css
  /* Type scale — reference for new code; existing text-[..] usages migrate opportunistically. */
  --text-2xs: 0.6875rem;  /* 11px — meta / labels */
  --text-xs: 0.75rem;     /* 12px — secondary body */
  --text-sm: 0.8125rem;   /* 13px — body */
  --text-md: 0.9375rem;   /* 15px — metric value */
  --text-lg: 1.1875rem;   /* 19px — section figure */
  --text-xl: 1.375rem;    /* 22px — page title */
  --text-2xl: 1.5rem;     /* 24px — hero figure */
```

- [ ] **Step 2: Write the failing primitive tests**

Create `frontend/src/components/ui.test.jsx`:

```js
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { StatStrip, StatRow, Skeleton, Metric } from './ui'

describe('ui primitives', () => {
  it('StatStrip renders its StatRow children with label, value, badge and note', () => {
    render(
      <StatStrip>
        <StatRow label="Net worth" value="€1,000" badge="+2.1%" badgeTone="emerald" note="all-time" />
      </StatStrip>,
    )
    expect(screen.getByText('Net worth')).toBeInTheDocument()
    expect(screen.getByText('€1,000')).toBeInTheDocument()
    expect(screen.getByText('+2.1%')).toBeInTheDocument()
    expect(screen.getByText('all-time')).toBeInTheDocument()
  })

  it('Skeleton renders a block', () => {
    const { container } = render(<Skeleton className="h-4 w-20" />)
    expect(container.firstChild).toHaveClass('animate-pulse')
  })

  it('Metric shows a label, a value and an optional hint', () => {
    render(<Metric label="P/E" value="32.10" hint="hint text" />)
    expect(screen.getByText('P/E')).toBeInTheDocument()
    expect(screen.getByText('32.10')).toBeInTheDocument()
    expect(screen.getByText('hint text')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run, verify fail**

Run: `cd frontend && npx vitest run src/components/ui.test.jsx`
Expected: FAIL — exports missing.

- [ ] **Step 4: Implement the primitives**

Add to `frontend/src/components/ui.jsx`:

```jsx
/** A row of headline stats as one bordered strip with dividers — the calm
 *  alternative to N separate StatCards. */
export function StatStrip({ children, className = '' }) {
  return (
    <div className={`flex flex-col sm:flex-row rounded-xl border border-white/[0.06] bg-gradient-to-b from-zinc-900 to-zinc-900/70 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.06] ${className}`}>
      {children}
    </div>
  )
}

export function StatRow({ label, value, badge, badgeTone = 'zinc', note }) {
  return (
    <div className="flex-1 p-4">
      <div className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider">{label}</div>
      <div className="mt-2 text-[clamp(18px,1.7vw,24px)] font-semibold text-zinc-50 tracking-tight num font-mono whitespace-nowrap">
        {value}
      </div>
      {(badge || note) && (
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          {badge && (
            <span className={`inline-flex items-center whitespace-nowrap text-[11.5px] px-2 py-0.5 rounded-md font-medium num font-mono ${statTones[badgeTone] || statTones.zinc}`}>
              {badge}
            </span>
          )}
          {note && <span className="text-[12px] text-zinc-500">{note}</span>}
        </div>
      )}
    </div>
  )
}

export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse bg-white/[0.05] rounded ${className}`} />
}

/** A labelled figure with an optional sub-hint. Lifted here so OverviewTab,
 *  EarningsTab and SnapshotSection share one. */
export function Metric({ label, value, tone = 'text-zinc-100', hint }) {
  return (
    <div>
      <div className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium">{label}</div>
      <div className={`text-[15px] num font-mono mt-1 ${tone}`}>{value}</div>
      {hint ? <div className="text-[11px] text-zinc-500 mt-0.5 num font-mono">{hint}</div> : null}
    </div>
  )
}
```

(`statTones` already exists in `ui.jsx` for `StatCard` — reuse it. `animate-pulse` is a Tailwind built-in; the global `prefers-reduced-motion` rule in `index.css` already neutralises it.)

- [ ] **Step 5: Run, verify pass**

Run: `cd frontend && npx vitest run src/components/ui.test.jsx`
Expected: PASS.

- [ ] **Step 6: Full suite + lint + commit**

```bash
cd frontend && npm test && npm run lint && cd ..
git add frontend/src/index.css frontend/src/components/ui.jsx frontend/src/components/ui.test.jsx
git commit -m "feat: add StatStrip, Skeleton and a shared Metric primitive

$(printf 'Claude-Session: https://claude.ai/code/session_01PybJQDy4bPtNvqd9tzRJ4v')"
```

---

## Task 15: Frontend — apply the consolidation (Dashboard, Analytics, skeletons, responsive)

**Files:**
- Modify: `frontend/src/pages/Dashboard.jsx`, `frontend/src/pages/Analytics.jsx`, `frontend/src/pages/Portfolio.jsx`, `frontend/src/components/research/OverviewTab.jsx`, `frontend/src/components/research/EarningsTab.jsx`, `frontend/src/components/research/NewsTab.jsx`
- Test: `frontend/src/pages/Analytics.test.jsx` (adjust if it asserts `StatCard` markup)

**Interfaces:**
- Consumes: `StatStrip`, `StatRow`, `Skeleton`, `Metric` from `../components/ui` / `../ui`.
- No new exports.

- [ ] **Step 1: Dashboard stat row → `StatStrip`**

In `frontend/src/pages/Dashboard.jsx`:
- import `StatStrip, StatRow` from `../components/ui`; drop the `StatCard` import if now unused.
- replace the `<div className="grid grid-cols-3 gap-4"> ...three <StatCard/>... </div>` with:

```jsx
      <StatStrip>
        <StatRow label="Net worth" value={fmtEur(netWorth.net_worth)} note="Portfolio + bank accounts" />
        <StatRow
          label="Portfolio value"
          value={fmtEur(summary.total_value)}
          badge={fmtPct(summary.total_pnl_pct)}
          badgeTone={!pnlKnown ? 'zinc' : totalPnl >= 0 ? 'emerald' : 'red'}
          note={pnlKnown ? `${fmtEur(totalPnl, { sign: true })} all-time` : 'P/L unavailable until positions sync'}
        />
        <StatRow label="Bank balance" value={fmtEur(netWorth.bank_total)} note="All connected accounts" />
      </StatStrip>
```

- replace the bare `return <div className="text-zinc-500 text-sm">Loading…</div>` early-return with a `Skeleton` layout, e.g.:

```jsx
  if (!summaryQuery.data || !netWorthQuery.data)
    return (
      <div className="space-y-5">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-[300px] w-full" />
      </div>
    )
```

(import `Skeleton` too.)

- responsive: the `grid grid-cols-5 gap-4` block → `grid grid-cols-1 lg:grid-cols-5 gap-4`; the `Card className="col-span-3"` / `col-span-2` keep their spans (they collapse to full width at `<lg` automatically since the grid is single-column there).

- [ ] **Step 2: Analytics stat row → `StatStrip`**

In `frontend/src/pages/Analytics.jsx`:
- import `StatStrip, StatRow`; keep `StatCard` only if still used elsewhere (it is not — replace all four).
- replace `<div className="grid grid-cols-4 gap-4"> ...four <StatCard/>... </div>` with a `<StatStrip>` of four `<StatRow>` carrying the same props.
- if `frontend/src/pages/Analytics.test.jsx` asserts anything about the stat markup (e.g. a specific `role`/class), update those assertions to match `StatRow` (label + value text assertions should already pass unchanged).

- [ ] **Step 3: Responsive grids on Portfolio**

In `frontend/src/pages/Portfolio.jsx`, the summary `<Card>`'s `<div className="grid grid-cols-3 gap-0">` → `grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-0`, and add `sm:` guards to the borders (`sm:border-l`, `sm:pl-5`) so the three cells stack cleanly on narrow screens. The `grid-cols-20` custom-column holdings/side grid → add `grid-cols-1 lg:` prefix so the side column drops below the table under `lg`.

- [ ] **Step 4: Align tab-body loading states on `Skeleton`**

In `OverviewTab.jsx`, `EarningsTab.jsx`, `NewsTab.jsx`: replace the inline `<div className="mt-3 text-[12px] text-zinc-500">Loading…</div>` (and `FundamentalsGate`'s if trivial) with a couple of `<Skeleton className="h-4 w-40" />` / `<Skeleton className="h-24 w-full" />` blocks. Keep it minimal — one or two skeleton lines per panel. Also swap `OverviewTab`'s local `Metric` and `EarningsTab`'s local `Metric` for the imported one from `../ui` and delete the local definitions.

- [ ] **Step 5: Full suite + lint + build**

Run: `cd frontend && npm test && npm run lint && npm run build`
Expected: PASS — build emits no errors.

- [ ] **Step 6: Manual smoke (optional but recommended)**

Run the stack (`scripts/dev.sh`) and click through Dashboard → a holding → Research (Overview snapshot, News tab, Valuation history), ⌘K → jump to a symbol, Earnings row → Research. Confirm no layout collapse at ~800px width.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/Dashboard.jsx frontend/src/pages/Analytics.jsx frontend/src/pages/Portfolio.jsx frontend/src/components/research/OverviewTab.jsx frontend/src/components/research/EarningsTab.jsx frontend/src/components/research/NewsTab.jsx frontend/src/pages/Analytics.test.jsx
git commit -m "refactor: consolidate stat rows, loading states and responsive grids

$(printf 'Claude-Session: https://claude.ai/code/session_01PybJQDy4bPtNvqd9tzRJ4v')"
```

---

## Final verification

- [ ] `cd backend && .venv/bin/python manage.py test` — all apps green.
- [ ] `cd frontend && npm test` — all specs green.
- [ ] `cd frontend && npm run lint` — clean.
- [ ] `cd frontend && npm run build` — succeeds.
- [ ] Spot-check the spec's "Final quality test": holding → Research in one click; ⌘K reaches any instrument; Research Overview leads Snapshot → Reference → Fundamentals; News tab replaces Market context; Valuation shows history context; no colour/glow/gradient changes.
- [ ] Open a PR with `superpowers:finishing-a-development-branch` or the project's `new-branch-and-pr` flow; PR body links the spec and this plan, and ends with `https://claude.ai/code/session_01PybJQDy4bPtNvqd9tzRJ4v`.

---

## Self-review notes (done during planning)

- **Spec coverage:** Backend §1 → Task 1; §2 → Task 2; §3 (news) → Task 3. FE Slice 1: `researchHref` + recents → Task 4; clickable rows → Task 5; ⌘K → Task 6; recent chips + `pushRecentSymbol` → Task 7. FE Slice 3: `getCompanyNews`/`useCompanyNews` → Task 8; News tab + swap → Task 9; `lib/snapshot` → Task 10; `SnapshotSection` → Task 11; reference strip → Task 12; valuation history context → Task 13. Design pass: primitives + tokens → Task 14; migrations + skeletons + responsive → Task 15. No spec requirement is unassigned.
- **Type consistency:** `researchHref(symbol, tab)` used identically in Tasks 4/5/6. `useCompanyNews` shape `{data:{available, items|reason}, isLoading}` consistent across Tasks 8/9. `valuation_history` sub-stats `{latest,min,median,max,n}` identical in backend Task 2, `valuationVerdict` Task 10, `HistoryContext` Task 13. `SNAPSHOT_GROUPS[].verdict` returns `{tone,text}` — consumed only by `SnapshotSection` Task 11. `StatRow` mirrors `StatCard`'s props (Task 14) so Task 15's migration is prop-for-prop.
- **Known soft spots for the executor:** Task 5/8/9 assertions assume the existing test files' local helper names (`fetchMock`, `jsonResponse`, Attribution's fixture var) — match them to the file, don't invent. Task 15 Step 4 deletes two local `Metric` definitions; grep for other local `Metric` importers before deleting.
