# Fundamentals Provider (Finnhub) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Company fundamentals" and "Valuation" `ComingSoon` placeholders on the Research page with real data from Finnhub's free tier — P/E, market cap, dividend yield, 52-week range, in-app ratios, analyst recommendation trend, and EPS-surprise history.

**Architecture:** A new `research/finnhub.py` module mirrors `research/market.py`'s shape (call → shape → cache) but reads a static `FINNHUB_API_KEY` instead of a per-user OAuth credential. One combined view (`GET /api/research/fundamentals/<symbol>/`) returns everything both tabs need behind one 24h cache entry, always with HTTP 200 and an `available` boolean rather than a special status code — 409 is already claimed to mean "not connected to Saxo."

**Tech Stack:** Django REST Framework, `requests`, Django's cache framework (matches existing `research/market.py`); React 19, TanStack Query, Recharts (matches existing Analytics/Research components).

**Spec:** `docs/superpowers/specs/2026-09-05-fundamentals-provider-design.md`

## Global Constraints

- Backend built directly (not coach mode) for this feature, per user's explicit choice this session.
- Company fundamentals only this pass — no Market-context tab, no Buffett indicator, no macro series (FRED or otherwise).
- Symbol resolution uses `saxo.mapping.bare_symbol()` unchanged — works for US-listed tickers only; non-US symbols are a known, out-of-scope gap.
- No new Django app, no new models, no Celery Beat schedule — fetch-on-demand + Redis cache only.
- Never invent a field value: a metric the free tier doesn't return is omitted (`None` → `'—'` on the frontend), never computed from a guess or defaulted to zero.
- 409 is reserved for "not connected to Saxo" (AGENTS.md, decided) — the fundamentals endpoint always returns 200 with `available: false` on failure instead.

---

## Prerequisites (human, before Task 1)

1. Sign up for a free Finnhub account: https://finnhub.io/register — no credit card required.
2. Copy the API key from the Finnhub dashboard.
3. Add it to `backend/.env`: `FINNHUB_API_KEY=<your key>`.

Tasks 1–2 work without this (they're mocked). **Task 3 requires it** — it makes real calls to confirm exact field names before Task 4 writes the shaping code.

---

### Task 1: Config plumbing and the `_get` request helper

**Files:**
- Modify: `backend/backend/settings.py` (near `SAXO_TOKEN_ENCRYPTION_KEY`, line ~222)
- Modify: `backend/.env.example` (near the `SAXO_*` block)
- Create: `backend/research/finnhub.py`
- Modify: `backend/research/tests.py` (new imports + new test class at the end)

**Interfaces:**
- Produces: `finnhub.FinnhubNotConfigured`, `finnhub.FinnhubAPIError` (exceptions), `finnhub._get(path, **params)` → parsed JSON dict, used internally by Task 2's client functions.

- [ ] **Step 1: Add the setting**

In `backend/backend/settings.py`, immediately after the `SAXO_TOKEN_ENCRYPTION_KEY` line:

```python
FINNHUB_API_KEY = os.environ.get('FINNHUB_API_KEY', '')
```

- [ ] **Step 2: Add the `.env.example` entry**

In `backend/.env.example`, after the `SAXO_TOKEN_ENCRYPTION_KEY=` line, add a blank line then:

```
# Company fundamentals (Research page's Overview/Valuation tabs). Free key
# from https://finnhub.io/register - the page degrades to "unavailable"
# without one, it does not crash.
FINNHUB_API_KEY=
```

- [ ] **Step 3: Write the failing tests**

Append to `backend/research/tests.py` (add `from unittest.mock import Mock` to the existing `from unittest.mock import patch` import line, changing it to `from unittest.mock import Mock, patch`; add `from . import finnhub` to the existing `from . import market, tasks` import, changing it to `from . import finnhub, market, tasks`):

```python
class FinnhubClientTest(TestCase):
    @override_settings(FINNHUB_API_KEY='')
    def test_raises_when_the_api_key_is_not_set(self):
        with self.assertRaises(finnhub.FinnhubNotConfigured):
            finnhub._get('/stock/profile2', symbol='AAPL')

    @override_settings(FINNHUB_API_KEY='test-key')
    @patch('research.finnhub.requests.get')
    def test_raises_on_a_non_200_response(self, mock_get):
        mock_get.return_value = Mock(ok=False, status_code=500, text='boom')

        with self.assertRaises(finnhub.FinnhubAPIError):
            finnhub._get('/stock/profile2', symbol='AAPL')

    @override_settings(FINNHUB_API_KEY='test-key')
    @patch('research.finnhub.requests.get')
    def test_returns_parsed_json_and_sends_the_token(self, mock_get):
        mock_get.return_value = Mock(ok=True, json=lambda: {'name': 'Apple Inc'})

        result = finnhub._get('/stock/profile2', symbol='AAPL')

        self.assertEqual(result, {'name': 'Apple Inc'})
        called_url = mock_get.call_args.args[0]
        called_params = mock_get.call_args.kwargs['params']
        self.assertEqual(called_url, 'https://finnhub.io/api/v1/stock/profile2')
        self.assertEqual(called_params, {'symbol': 'AAPL', 'token': 'test-key'})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test research.tests.FinnhubClientTest -v 2`
Expected: FAIL — `ModuleNotFoundError: No module named 'research.finnhub'` (or `ImportError`).

- [ ] **Step 3: Write the minimal implementation**

Create `backend/research/finnhub.py`:

```python
"""Read-only company fundamentals from Finnhub, shaped and cached the same
way market.py does for Saxo - call, shape, cache. Finnhub needs a static API
key, not a per-user OAuth token, so there is no credential lookup here.
"""

import requests
from django.conf import settings

API_BASE = 'https://finnhub.io/api/v1'
REQUEST_TIMEOUT = 10
ERROR_BODY_LIMIT = 200


class FinnhubNotConfigured(Exception):
    """Raised when FINNHUB_API_KEY is not set."""


class FinnhubAPIError(Exception):
    """Raised when a Finnhub request fails."""


def _get(path, **params):
    if not settings.FINNHUB_API_KEY:
        raise FinnhubNotConfigured('FINNHUB_API_KEY is not set.')

    try:
        response = requests.get(
            f'{API_BASE}{path}',
            params={**params, 'token': settings.FINNHUB_API_KEY},
            timeout=REQUEST_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise FinnhubAPIError(f'{path} failed: {exc}') from exc

    if not response.ok:
        body = response.text[:ERROR_BODY_LIMIT]
        raise FinnhubAPIError(f'{path} failed: {response.status_code} {body}')

    return response.json()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python manage.py test research.tests.FinnhubClientTest -v 2`
Expected: `Ran 3 tests ... OK`

- [ ] **Step 5: Commit**

```bash
git add backend/backend/settings.py backend/.env.example backend/research/finnhub.py backend/research/tests.py
git commit -m "feat: add Finnhub config and the request helper it shares"
```

---

### Task 2: The four Finnhub client functions

**Files:**
- Modify: `backend/research/finnhub.py`
- Modify: `backend/research/tests.py` (extend `FinnhubClientTest`)

**Interfaces:**
- Consumes: `finnhub._get(path, **params)` from Task 1.
- Produces: `finnhub.get_profile(symbol)`, `finnhub.get_basic_financials(symbol)`, `finnhub.get_recommendation_trends(symbol)`, `finnhub.get_earnings_history(symbol)` — each returns Finnhub's raw parsed JSON (dict or list), used by Task 4's shaping function.

- [ ] **Step 1: Write the failing tests**

Append to `FinnhubClientTest` in `backend/research/tests.py`:

```python
    @override_settings(FINNHUB_API_KEY='test-key')
    @patch('research.finnhub.requests.get')
    def test_get_profile_calls_the_profile_endpoint(self, mock_get):
        mock_get.return_value = Mock(ok=True, json=lambda: {'name': 'Apple Inc'})

        result = finnhub.get_profile('AAPL')

        self.assertEqual(result['name'], 'Apple Inc')
        self.assertEqual(mock_get.call_args.args[0], 'https://finnhub.io/api/v1/stock/profile2')
        self.assertEqual(mock_get.call_args.kwargs['params']['symbol'], 'AAPL')

    @override_settings(FINNHUB_API_KEY='test-key')
    @patch('research.finnhub.requests.get')
    def test_get_basic_financials_asks_for_every_metric(self, mock_get):
        mock_get.return_value = Mock(ok=True, json=lambda: {'metric': {}})

        finnhub.get_basic_financials('AAPL')

        self.assertEqual(mock_get.call_args.args[0], 'https://finnhub.io/api/v1/stock/metric')
        self.assertEqual(
            mock_get.call_args.kwargs['params'], {'symbol': 'AAPL', 'metric': 'all', 'token': 'test-key'}
        )

    @override_settings(FINNHUB_API_KEY='test-key')
    @patch('research.finnhub.requests.get')
    def test_get_recommendation_trends_calls_the_recommendation_endpoint(self, mock_get):
        mock_get.return_value = Mock(ok=True, json=lambda: [])

        finnhub.get_recommendation_trends('AAPL')

        self.assertEqual(mock_get.call_args.args[0], 'https://finnhub.io/api/v1/stock/recommendation')

    @override_settings(FINNHUB_API_KEY='test-key')
    @patch('research.finnhub.requests.get')
    def test_get_earnings_history_calls_the_earnings_endpoint(self, mock_get):
        mock_get.return_value = Mock(ok=True, json=lambda: [])

        finnhub.get_earnings_history('AAPL')

        self.assertEqual(mock_get.call_args.args[0], 'https://finnhub.io/api/v1/stock/earnings')
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test research.tests.FinnhubClientTest -v 2`
Expected: FAIL — `AttributeError: module 'research.finnhub' has no attribute 'get_profile'`

- [ ] **Step 3: Write the minimal implementation**

Append to `backend/research/finnhub.py`:

```python
def get_profile(symbol):
    return _get('/stock/profile2', symbol=symbol)


def get_basic_financials(symbol):
    return _get('/stock/metric', symbol=symbol, metric='all')


def get_recommendation_trends(symbol):
    return _get('/stock/recommendation', symbol=symbol)


def get_earnings_history(symbol):
    return _get('/stock/earnings', symbol=symbol)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python manage.py test research.tests.FinnhubClientTest -v 2`
Expected: `Ran 7 tests ... OK`

- [ ] **Step 5: Commit**

```bash
git add backend/research/finnhub.py backend/research/tests.py
git commit -m "feat: add the four Finnhub client functions"
```

---

### Task 3: Live capture — confirm real field names before shaping

This task has no red/green cycle: it produces a reference document, not code. **Requires `FINNHUB_API_KEY` set in `backend/.env`** (see Prerequisites).

**Files:**
- Create: `docs/notes/2026-09-05-finnhub-live-capture.md`

- [ ] **Step 1: Run the capture script**

```bash
cd backend && .venv/bin/python manage.py shell -c "
from research import finnhub
import json
for name, fn in [
    ('profile', finnhub.get_profile),
    ('basic_financials', finnhub.get_basic_financials),
    ('recommendation_trends', finnhub.get_recommendation_trends),
    ('earnings_history', finnhub.get_earnings_history),
]:
    print(f'--- {name} ---')
    print(json.dumps(fn('AAPL'), indent=2))
"
```

- [ ] **Step 2: Save the output**

Paste the full output into `docs/notes/2026-09-05-finnhub-live-capture.md` under a `## Raw responses (AAPL, captured 2026-09-05)` heading, one fenced code block per section.

- [ ] **Step 3: Reconcile field names against Task 4**

Before starting Task 4, compare its assumed field names against this capture:

- Profile: `name`, `finnhubIndustry`, `marketCapitalization`, `shareOutstanding`.
- Basic financials `metric` object: `peNormalizedAnnual`, `psTTM`, `pbAnnual`, `epsGrowth5Y`, `dividendYieldIndicatedAnnual`, `epsInclExtraItemsTTM`, `52WeekHigh`, `52WeekLow`, `roeTTM`, `netProfitMarginTTM`, `grossMarginTTM`.
- Recommendation trends: list of `{buy, hold, sell, strongBuy, strongSell, period}`, newest first.
- Earnings history: list of `{period, actual, estimate, surprisePercent}`.

**If any of these differ in the real capture, use the real name throughout Task 4** — the capture file is the source of truth, this list is only a starting assumption written before a live call was possible.

- [ ] **Step 4: Commit**

```bash
git add docs/notes/2026-09-05-finnhub-live-capture.md
git commit -m "docs: capture real Finnhub response shapes for AAPL"
```

---

### Task 4: Shape the combined `fundamentals(symbol)` payload, cached

**Files:**
- Modify: `backend/research/finnhub.py`
- Modify: `backend/research/tests.py`

**Interfaces:**
- Consumes: the four client functions from Task 2; field names confirmed/corrected in Task 3.
- Produces: `finnhub.fundamentals(symbol)` → dict shaped as below, used by Task 5's view. `finnhub.FUNDAMENTALS_TTL` (int, seconds).

Shaped output:

```python
{
    'name': str, 'exchange': str, 'industry': str, 'logo': str,
    'market_cap': float | None, 'shares_outstanding': float | None,
    'pe_ratio': float | None, 'ps_ratio': float | None, 'pb_ratio': float | None,
    'peg_ratio': float | None, 'dividend_yield': float | None, 'eps_ttm': float | None,
    'week52_high': float | None, 'week52_low': float | None,
    'roe': float | None, 'net_margin': float | None, 'gross_margin': float | None,
    'recommendation': {'strong_buy': int, 'buy': int, 'hold': int, 'sell': int, 'strong_sell': int, 'period': str} | None,
    'eps_history': [{'period': str, 'actual': float | None, 'estimate': float | None, 'surprise_percent': float | None}],  # oldest first
}
```

- [ ] **Step 1: Write the failing tests**

Append to `backend/research/tests.py`:

```python
SAMPLE_PROFILE = {
    'name': 'Apple Inc',
    'exchange': 'NASDAQ',
    'finnhubIndustry': 'Technology',
    'logo': 'https://example.com/aapl.png',
    'marketCapitalization': 3_100_000.0,
    'shareOutstanding': 15_200.0,
}

SAMPLE_FINANCIALS = {
    'metric': {
        'peNormalizedAnnual': 32.1,
        'psTTM': 8.4,
        'pbAnnual': 48.2,
        'epsGrowth5Y': 12.5,
        'dividendYieldIndicatedAnnual': 0.44,
        'epsInclExtraItemsTTM': 6.13,
        '52WeekHigh': 260.1,
        '52WeekLow': 164.08,
        'roeTTM': 147.2,
        'netProfitMarginTTM': 26.3,
        'grossMarginTTM': 46.2,
    }
}

SAMPLE_RECOMMENDATION = [
    {'buy': 20, 'hold': 8, 'period': '2026-09-01', 'sell': 1, 'strongBuy': 12, 'strongSell': 0},
    {'buy': 18, 'hold': 9, 'period': '2026-08-01', 'sell': 2, 'strongBuy': 11, 'strongSell': 0},
]

SAMPLE_EARNINGS = [
    {'period': '2026-06-30', 'actual': 1.65, 'estimate': 1.58, 'surprisePercent': 4.43},
    {'period': '2026-03-31', 'actual': 1.52, 'estimate': 1.5, 'surprisePercent': 1.33},
]


class FundamentalsShapingTest(TestCase):
    def test_shapes_the_combined_payload(self):
        result = finnhub.to_fundamentals(SAMPLE_PROFILE, SAMPLE_FINANCIALS, SAMPLE_RECOMMENDATION, SAMPLE_EARNINGS)

        self.assertEqual(result['name'], 'Apple Inc')
        self.assertEqual(result['market_cap'], 3_100_000.0)
        self.assertEqual(result['pe_ratio'], 32.1)
        self.assertEqual(result['week52_high'], 260.1)
        self.assertEqual(result['recommendation'], {
            'strong_buy': 12, 'buy': 20, 'hold': 8, 'sell': 1, 'strong_sell': 0, 'period': '2026-09-01',
        })

    def test_eps_history_is_oldest_first(self):
        result = finnhub.to_fundamentals(SAMPLE_PROFILE, SAMPLE_FINANCIALS, SAMPLE_RECOMMENDATION, SAMPLE_EARNINGS)

        self.assertEqual([row['period'] for row in result['eps_history']], ['2026-03-31', '2026-06-30'])

    def test_peg_ratio_is_computed_from_pe_and_five_year_eps_growth(self):
        result = finnhub.to_fundamentals(SAMPLE_PROFILE, SAMPLE_FINANCIALS, SAMPLE_RECOMMENDATION, SAMPLE_EARNINGS)

        self.assertAlmostEqual(result['peg_ratio'], 32.1 / 12.5, places=2)

    def test_a_metric_the_free_tier_does_not_return_is_none_not_zero(self):
        thin_financials = {'metric': {'peNormalizedAnnual': 32.1}}

        result = finnhub.to_fundamentals(SAMPLE_PROFILE, thin_financials, [], [])

        self.assertIsNone(result['dividend_yield'])
        self.assertIsNone(result['peg_ratio'])
        self.assertIsNone(result['recommendation'])
        self.assertEqual(result['eps_history'], [])


@override_settings(CACHES=LOCMEM)
class FundamentalsCacheTest(TestCase):
    def setUp(self):
        cache.clear()

    @patch('research.finnhub.get_earnings_history')
    @patch('research.finnhub.get_recommendation_trends')
    @patch('research.finnhub.get_basic_financials')
    @patch('research.finnhub.get_profile')
    def test_a_second_call_for_the_same_symbol_does_not_refetch(
        self, mock_profile, mock_financials, mock_recs, mock_earnings
    ):
        mock_profile.return_value = SAMPLE_PROFILE
        mock_financials.return_value = SAMPLE_FINANCIALS
        mock_recs.return_value = SAMPLE_RECOMMENDATION
        mock_earnings.return_value = SAMPLE_EARNINGS

        finnhub.fundamentals('AAPL')
        finnhub.fundamentals('AAPL')

        self.assertEqual(mock_profile.call_count, 1)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test research.tests.FundamentalsShapingTest research.tests.FundamentalsCacheTest -v 2`
Expected: FAIL — `AttributeError: module 'research.finnhub' has no attribute 'to_fundamentals'`

- [ ] **Step 3: Write the minimal implementation**

Add `from django.core.cache import cache` to the top of `backend/research/finnhub.py` (alongside the existing `import requests` / `from django.conf import settings`). Append:

```python
FUNDAMENTALS_TTL = 86400


def _cache_key(symbol):
    return f'research:fundamentals:{symbol.upper()}'


def _metric(financials, key):
    return (financials.get('metric') or {}).get(key)


def _peg_ratio(pe, eps_growth_5y):
    if pe is None or not eps_growth_5y:
        return None
    return round(pe / eps_growth_5y, 2)


def _to_recommendation(row):
    if not row:
        return None
    return {
        'strong_buy': row.get('strongBuy', 0),
        'buy': row.get('buy', 0),
        'hold': row.get('hold', 0),
        'sell': row.get('sell', 0),
        'strong_sell': row.get('strongSell', 0),
        'period': row.get('period', ''),
    }


def _to_eps_row(row):
    return {
        'period': row.get('period', ''),
        'actual': row.get('actual'),
        'estimate': row.get('estimate'),
        'surprise_percent': row.get('surprisePercent'),
    }


def to_fundamentals(profile, financials, recommendations, earnings):
    pe = _metric(financials, 'peNormalizedAnnual')
    eps_growth_5y = _metric(financials, 'epsGrowth5Y')

    return {
        'name': profile.get('name', ''),
        'exchange': profile.get('exchange', ''),
        'industry': profile.get('finnhubIndustry', ''),
        'logo': profile.get('logo', ''),
        'market_cap': profile.get('marketCapitalization'),
        'shares_outstanding': profile.get('shareOutstanding'),
        'pe_ratio': pe,
        'ps_ratio': _metric(financials, 'psTTM'),
        'pb_ratio': _metric(financials, 'pbAnnual'),
        'peg_ratio': _peg_ratio(pe, eps_growth_5y),
        'dividend_yield': _metric(financials, 'dividendYieldIndicatedAnnual'),
        'eps_ttm': _metric(financials, 'epsInclExtraItemsTTM'),
        'week52_high': _metric(financials, '52WeekHigh'),
        'week52_low': _metric(financials, '52WeekLow'),
        'roe': _metric(financials, 'roeTTM'),
        'net_margin': _metric(financials, 'netProfitMarginTTM'),
        'gross_margin': _metric(financials, 'grossMarginTTM'),
        # Finnhub sends newest-first; the most recent period is "the" trend.
        'recommendation': _to_recommendation(recommendations[0] if recommendations else None),
        # Oldest-first, same convention as market.chart's candles - the chart draws left to right.
        'eps_history': [_to_eps_row(row) for row in reversed(earnings)],
    }


def fundamentals(symbol):
    def produce():
        return to_fundamentals(
            get_profile(symbol),
            get_basic_financials(symbol),
            get_recommendation_trends(symbol),
            get_earnings_history(symbol),
        )

    return cache.get_or_set(_cache_key(symbol), produce, FUNDAMENTALS_TTL)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python manage.py test research.tests.FundamentalsShapingTest research.tests.FundamentalsCacheTest -v 2`
Expected: `Ran 6 tests ... OK`

- [ ] **Step 5: Commit**

```bash
git add backend/research/finnhub.py backend/research/tests.py
git commit -m "feat: shape and cache the combined fundamentals payload"
```

---

### Task 5: `FundamentalsView` and its route

**Files:**
- Modify: `backend/research/views.py`
- Modify: `backend/research/urls.py`
- Modify: `backend/research/tests.py`

**Interfaces:**
- Consumes: `finnhub.fundamentals(symbol)`, `finnhub.FinnhubNotConfigured`, `finnhub.FinnhubAPIError` from Task 4.
- Produces: `GET /api/research/fundamentals/<symbol>/` → 200 `{available: true, ...fundamentals fields}` or 200 `{available: false, reason: str}`. Consumed by Task 6's frontend client.

- [ ] **Step 1: Write the failing tests**

Append to `backend/research/tests.py` (reuses the `MarketDataViewTest.setUp`/auth pattern — this is a new class with its own `setUp`):

```python
@override_settings(SAXO_TOKEN_ENCRYPTION_KEY=TEST_KEY, CACHES=LOCMEM, FINNHUB_API_KEY='test-key')
class FundamentalsViewTest(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(username='alex', password='pw')
        token = RefreshToken.for_user(self.user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_requires_authentication(self):
        self.client.credentials()
        response = self.client.get('/api/research/fundamentals/AAPL/')
        self.assertEqual(response.status_code, 401)

    @patch('research.finnhub.get_earnings_history')
    @patch('research.finnhub.get_recommendation_trends')
    @patch('research.finnhub.get_basic_financials')
    @patch('research.finnhub.get_profile')
    def test_returns_available_true_with_shaped_data(
        self, mock_profile, mock_financials, mock_recs, mock_earnings
    ):
        mock_profile.return_value = SAMPLE_PROFILE
        mock_financials.return_value = SAMPLE_FINANCIALS
        mock_recs.return_value = SAMPLE_RECOMMENDATION
        mock_earnings.return_value = SAMPLE_EARNINGS

        response = self.client.get('/api/research/fundamentals/AAPL/')

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['available'])
        self.assertEqual(response.data['name'], 'Apple Inc')

    @override_settings(FINNHUB_API_KEY='')
    def test_returns_available_false_when_not_configured(self):
        response = self.client.get('/api/research/fundamentals/AAPL/')

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['available'])
        self.assertIn('reason', response.data)

    @patch('research.finnhub.get_profile')
    def test_returns_available_false_on_a_finnhub_error(self, mock_profile):
        mock_profile.side_effect = finnhub.FinnhubAPIError('boom')

        response = self.client.get('/api/research/fundamentals/AAPL/')

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['available'])
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test research.tests.FundamentalsViewTest -v 2`
Expected: FAIL — 404, no such route yet.

- [ ] **Step 3: Write the minimal implementation**

In `backend/research/views.py`, change the `from . import market` import to `from . import finnhub, market`. Append:

```python
class FundamentalsView(APIView):
    def get(self, request, symbol):
        try:
            return Response({'available': True, **finnhub.fundamentals(symbol.upper())})
        except (finnhub.FinnhubNotConfigured, finnhub.FinnhubAPIError) as exc:
            return Response({'available': False, 'reason': str(exc)})
```

In `backend/research/urls.py`, add `FundamentalsView` to the `from .views import (...)` block (alphabetically, before `InstrumentDetailsView`) and add to `urlpatterns`:

```python
    path('fundamentals/<str:symbol>/', FundamentalsView.as_view(), name='research-fundamentals'),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python manage.py test research.tests.FundamentalsViewTest -v 2`
Expected: `Ran 4 tests ... OK`

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && .venv/bin/python manage.py test`
Expected: all tests pass (251 existing + this task's additions).

- [ ] **Step 6: Commit**

```bash
git add backend/research/views.py backend/research/urls.py backend/research/tests.py
git commit -m "feat: add the fundamentals endpoint"
```

---

### Task 6: Frontend API client function

**Files:**
- Modify: `frontend/src/api/client.js`
- Modify: `frontend/src/api/client.test.js`

**Interfaces:**
- Produces: `getFundamentals(symbol)` → `Promise<{available: boolean, reason?: string, ...}>`, used by Task 7's query hook.

- [ ] **Step 1: Write the failing test**

Add to the `describe('research endpoints', ...)` block in `frontend/src/api/client.test.js`:

```js
  it('asks for fundamentals by symbol', async () => {
    window.fetch = vi.fn().mockResolvedValue(jsonResponse({ available: true, name: 'Apple Inc' }))

    const result = await getFundamentals('AAPL')

    expect(window.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/research/fundamentals/AAPL/'),
      expect.anything()
    )
    expect(result.name).toBe('Apple Inc')
  })
```

Add `getFundamentals` to the existing `import { ... } from './client'` block at the top of the file.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- client.test.js`
Expected: FAIL — `getFundamentals is not defined`

- [ ] **Step 3: Write the minimal implementation**

In `frontend/src/api/client.js`, after the existing `getInstrumentDetails` line:

```js
export const getFundamentals = (symbol) => apiFetch(`/api/research/fundamentals/${symbol}/`)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- client.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/client.js frontend/src/api/client.test.js
git commit -m "feat: add the getFundamentals API client function"
```

---

### Task 7: `useFundamentals` query hook

**Files:**
- Modify: `frontend/src/api/queries.js`
- Modify: `frontend/src/api/queries.test.js` (create the test file if it does not already exist — check first with `ls frontend/src/api/queries.test.js`; if absent, this task's test lives alongside the others as the first case)

**Interfaces:**
- Consumes: `getFundamentals(symbol)` from Task 6.
- Produces: `queryKeys.fundamentals(symbol)`, `useFundamentals(symbol)` — a TanStack Query result object (`{data, isLoading, error}`), consumed by Task 8/9's components.

- [ ] **Step 1: Check for an existing queries test file**

Run: `ls frontend/src/api/queries.test.js`

If it exists, read it first to match its existing mocking conventions (it likely mocks `@tanstack/react-query`'s `useQuery` or wraps a `QueryClientProvider`) before writing Step 2 below in that same style. If it does not exist, `useFundamentals` is exercised indirectly through Task 8/9's component tests instead — skip straight to Step 2 (the query key), then Step 3 (import) and Step 4 (the hook itself); there is no dedicated unit test to write, verification comes from Task 8's `OverviewTab` test.

- [ ] **Step 2: Add the query key**

In `frontend/src/api/queries.js`, add to the `queryKeys` object, after `instrumentDetails`:

```js
  fundamentals: (symbol) => ['fundamentals', symbol],
```

- [ ] **Step 3: Add the import**

Add `getFundamentals` to the `import { ... } from './client'` block.

- [ ] **Step 4: Add the hook**

After `useInstrumentDetails`:

```js
// Fundamentals don't move intraday - the 24h staleTime matches the backend's
// own cache TTL, so there is no point refetching sooner than the data can change.
export function useFundamentals(symbol) {
  return useQuery({
    queryKey: queryKeys.fundamentals(symbol),
    queryFn: () => getFundamentals(symbol),
    enabled: !!symbol,
    staleTime: 24 * 60 * 60_000,
  })
}
```

- [ ] **Step 5: Verify with the frontend test suite**

Run: `cd frontend && npm run test`
Expected: no new failures (this hook has no dedicated unit test if `queries.test.js` doesn't exist yet — it's exercised by Task 8's component test instead).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/queries.js
git commit -m "feat: add the useFundamentals query hook"
```

---

### Task 8: Wire fundamentals into `Research.jsx` and fill `OverviewTab`'s placeholder

**Files:**
- Modify: `frontend/src/pages/Research.jsx`
- Modify: `frontend/src/components/research/OverviewTab.jsx`
- Modify: `frontend/src/pages/Research.test.jsx` (`stubQueries` helper)
- Create: `frontend/src/components/research/OverviewTab.test.jsx` (check first with `ls` — if it already exists, extend it instead of creating)
- Modify: `frontend/src/lib/format.js`

**Interfaces:**
- Consumes: `useFundamentals(symbol)` from Task 7.
- Produces: `fmtCompact(millions)` in `lib/format.js`, used again by Task 9's `ValuationTab`. `OverviewTab` gains a `fundamentals` prop: `{data, isLoading}` shaped like `useFundamentals`'s return.

- [ ] **Step 1: Add the compact-number formatter**

Add to `frontend/src/lib/format.js`, after `fmtNum`:

```js
// Finnhub sends market cap in millions of the reporting currency; this turns
// 3105000 into '3.11T' instead of a wall of digits.
export function fmtCompact(millions) {
  if (millions == null) return '—'
  const abs = Math.abs(millions)
  if (abs >= 1_000_000) return `${(millions / 1_000_000).toFixed(2)}T`
  if (abs >= 1_000) return `${(millions / 1_000).toFixed(2)}B`
  return `${millions.toFixed(0)}M`
}
```

- [ ] **Step 2: Check for an existing OverviewTab test file**

Run: `ls frontend/src/components/research/OverviewTab.test.jsx`

- [ ] **Step 3: Write the failing test**

Create (or extend) `frontend/src/components/research/OverviewTab.test.jsx`:

```jsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import OverviewTab from './OverviewTab'

const bars = []

describe('OverviewTab fundamentals', () => {
  it('shows real metrics when fundamentals are available', () => {
    render(
      <OverviewTab
        symbol="AAPL"
        position={null}
        details={null}
        detailsLoading={false}
        bars={bars}
        range="1M"
        fundamentals={{
          data: { available: true, name: 'Apple Inc', pe_ratio: 32.1, market_cap: 3_100_000, dividend_yield: 0.44 },
          isLoading: false,
        }}
      />
    )

    expect(screen.getByText('32.10')).toBeInTheDocument()
    expect(screen.getByText('3.10T')).toBeInTheDocument()
  })

  it('shows an unavailable message when Finnhub has no data for this symbol', () => {
    render(
      <OverviewTab
        symbol="AAPL"
        position={null}
        details={null}
        detailsLoading={false}
        bars={bars}
        range="1M"
        fundamentals={{ data: { available: false, reason: 'FINNHUB_API_KEY is not set.' }, isLoading: false }}
      />
    )

    expect(screen.getByText(/FINNHUB_API_KEY is not set/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd frontend && npm run test -- OverviewTab.test.jsx`
Expected: FAIL — `fundamentals` prop unused, `ComingSoon` renders instead.

- [ ] **Step 5: Write the minimal implementation**

In `frontend/src/components/research/OverviewTab.jsx`:

Change the import line `import { fmtEur, fmtMoney, fmtNum, fmtPct, fmtQty } from '../../lib/format'` to:

```js
import { fmtCompact, fmtEur, fmtMoney, fmtNum, fmtPct, fmtQty } from '../../lib/format'
```

Add a new component above `export default function OverviewTab`:

```jsx
function FundamentalsCard({ fundamentals }) {
  const { data, isLoading } = fundamentals

  if (isLoading) {
    return (
      <Card>
        <CardHeader title="Company fundamentals" subtitle="From Finnhub" />
        <div className="mt-3 text-[12px] text-zinc-500">Loading…</div>
      </Card>
    )
  }

  if (!data?.available) {
    return (
      <Card>
        <CardHeader title="Company fundamentals" subtitle="From Finnhub" />
        <p className="mt-3 text-[12px] text-zinc-500">{data?.reason || 'Fundamentals are unavailable for this symbol.'}</p>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader title="Company fundamentals" subtitle={data.industry || 'From Finnhub'} />
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Metric label="P/E ratio" value={fmtNum(data.pe_ratio, 2)} />
        <Metric label="Market cap" value={fmtCompact(data.market_cap)} />
        <Metric label="Dividend yield" value={fmtPct(data.dividend_yield, { sign: false })} />
        <Metric label="52W range" value={`${fmtNum(data.week52_low, 2)} – ${fmtNum(data.week52_high, 2)}`} />
      </div>
    </Card>
  )
}
```

Replace the `<ComingSoon feature="Company fundamentals" height={170} />` line with `<FundamentalsCard fundamentals={fundamentals} />`, and add `fundamentals` to the exported function's props: change `export default function OverviewTab({ symbol, position, details, detailsLoading, bars, range })` to `export default function OverviewTab({ symbol, position, details, detailsLoading, bars, range, fundamentals })`.

`fmtNum` on a `null` input must already render `'—'` — check `frontend/src/lib/format.js`'s current `fmtNum` implementation; if it does not guard `null`, add `if (value == null) return '—'` as its first line (this is a pre-existing gap unrelated to this feature, fix it here since this task is the first caller to hit it with an optional value).

- [ ] **Step 6: Run test to verify it passes**

Run: `cd frontend && npm run test -- OverviewTab.test.jsx`
Expected: PASS

- [ ] **Step 7: Wire `useFundamentals` into `Research.jsx`**

In `frontend/src/pages/Research.jsx`, add `useFundamentals` to the `import { ... } from '../api/queries'` block (alphabetically). After the `const details = useInstrumentDetails({...})` block, add:

```js
  const fundamentals = useFundamentals(symbol)
```

Change the `<OverviewTab ... />` call to pass `fundamentals={fundamentals}`.

- [ ] **Step 8: Update `Research.test.jsx`'s `stubQueries` so existing tests keep passing**

In `frontend/src/pages/Research.test.jsx`, add to `stubQueries`'s body, after the `queries.useSaxoStatus.mockReturnValue(...)` line:

```js
  queries.useFundamentals.mockReturnValue({ ...idle, data: { available: false, reason: 'not configured' } })
```

- [ ] **Step 9: Run the full frontend suite**

Run: `cd frontend && npm run test`
Expected: all tests pass, no regressions in `Research.test.jsx`.

- [ ] **Step 10: Lint and build**

Run: `cd frontend && npm run lint && npm run build`
Expected: both clean.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/lib/format.js frontend/src/pages/Research.jsx frontend/src/pages/Research.test.jsx frontend/src/components/research/OverviewTab.jsx frontend/src/components/research/OverviewTab.test.jsx
git commit -m "feat: fill Overview's fundamentals panel with real Finnhub data"
```

---

### Task 9: New `ValuationTab.jsx`

**Files:**
- Create: `frontend/src/components/research/ValuationTab.jsx`
- Create: `frontend/src/components/research/ValuationTab.test.jsx`
- Modify: `frontend/src/pages/Research.jsx`

**Interfaces:**
- Consumes: `fundamentals` prop shaped like `useFundamentals`'s return (same shape Task 8 passes to `OverviewTab`), `fmtCompact`/`fmtNum`/`fmtPct` from `lib/format.js`, `chartTooltipProps`/`gridProps`/`axisProps` from `lib/charts.js`.
- Produces: default export `ValuationTab({ fundamentals })`, wired into `Research.jsx` replacing the `tab === 'valuation'` `ComingSoon`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/research/ValuationTab.test.jsx`:

```jsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import ValuationTab from './ValuationTab'

const AVAILABLE = {
  available: true,
  pe_ratio: 32.1,
  ps_ratio: 8.4,
  pb_ratio: 48.2,
  peg_ratio: 2.57,
  roe: 147.2,
  net_margin: 26.3,
  gross_margin: 46.2,
  recommendation: { strong_buy: 12, buy: 20, hold: 8, sell: 1, strong_sell: 0, period: '2026-09-01' },
  eps_history: [
    { period: '2026-03-31', actual: 1.52, estimate: 1.5, surprise_percent: 1.33 },
    { period: '2026-06-30', actual: 1.65, estimate: 1.58, surprise_percent: 4.43 },
  ],
}

describe('ValuationTab', () => {
  it('shows in-app ratios when fundamentals are available', () => {
    render(<ValuationTab fundamentals={{ data: AVAILABLE, isLoading: false }} />)

    expect(screen.getByText('32.10')).toBeInTheDocument()
    expect(screen.getByText('2.57')).toBeInTheDocument()
  })

  it('shows the analyst recommendation counts', () => {
    render(<ValuationTab fundamentals={{ data: AVAILABLE, isLoading: false }} />)

    expect(screen.getByText('20')).toBeInTheDocument()
    expect(screen.getByText(/Buy/)).toBeInTheDocument()
  })

  it('shows an unavailable message instead of ratios when data is missing', () => {
    render(<ValuationTab fundamentals={{ data: { available: false, reason: 'no coverage' }, isLoading: false }} />)

    expect(screen.getByText(/no coverage/)).toBeInTheDocument()
    expect(screen.queryByText('32.10')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- ValuationTab.test.jsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the minimal implementation**

Create `frontend/src/components/research/ValuationTab.jsx`:

```jsx
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { fmtNum, fmtPct } from '../../lib/format'
import { axisProps, chartTooltipProps, gridProps } from '../../lib/charts'
import { Card, CardHeader } from '../ui'

function Ratio({ label, value }) {
  return (
    <div>
      <div className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium">{label}</div>
      <div className="text-[15px] num font-mono mt-1 text-zinc-100">{value}</div>
    </div>
  )
}

const RECOMMENDATION_SEGMENTS = [
  ['strong_buy', 'Strong buy', 'bg-emerald-500'],
  ['buy', 'Buy', 'bg-emerald-700'],
  ['hold', 'Hold', 'bg-zinc-500'],
  ['sell', 'Sell', 'bg-red-700'],
  ['strong_sell', 'Strong sell', 'bg-red-500'],
]

function RecommendationBar({ recommendation }) {
  if (!recommendation) return null

  const total = RECOMMENDATION_SEGMENTS.reduce((sum, [key]) => sum + (recommendation[key] || 0), 0)
  if (total === 0) return null

  return (
    <Card>
      <CardHeader title="Analyst recommendations" subtitle={`As of ${recommendation.period}`} />
      <div className="mt-4 flex h-2.5 rounded-full overflow-hidden">
        {RECOMMENDATION_SEGMENTS.map(([key, , color]) => {
          const count = recommendation[key] || 0
          return count > 0 ? (
            <span key={key} className={color} style={{ width: `${(count / total) * 100}%` }} />
          ) : null
        })}
      </div>
      <div className="mt-3 grid grid-cols-5 gap-2 text-center">
        {RECOMMENDATION_SEGMENTS.map(([key, label]) => (
          <div key={key}>
            <div className="text-[15px] num font-mono text-zinc-100">{recommendation[key] || 0}</div>
            <div className="text-[10px] text-zinc-500">{label}</div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function EpsHistoryChart({ epsHistory }) {
  if (!epsHistory?.length) return null

  return (
    <Card>
      <CardHeader title="EPS: actual vs. estimate" subtitle="Most recent quarters" />
      <div className="mt-4 h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={epsHistory} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis {...axisProps} dataKey="period" />
            <YAxis {...axisProps} width={44} />
            <Tooltip {...chartTooltipProps} formatter={(v) => fmtNum(v, 2)} />
            <Bar dataKey="estimate" name="Estimate" fill="#52525b" radius={[3, 3, 0, 0]} barSize={18} />
            <Bar dataKey="actual" name="Actual" fill="#3b82f6" radius={[3, 3, 0, 0]} barSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

export default function ValuationTab({ fundamentals }) {
  const { data, isLoading } = fundamentals

  if (isLoading) {
    return (
      <Card>
        <CardHeader title="Valuation" subtitle="From Finnhub" />
        <div className="mt-3 text-[12px] text-zinc-500">Loading…</div>
      </Card>
    )
  }

  if (!data?.available) {
    return (
      <Card>
        <CardHeader title="Valuation" subtitle="From Finnhub" />
        <p className="mt-3 text-[12px] text-zinc-500">{data?.reason || 'Valuation data is unavailable for this symbol.'}</p>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Ratios" subtitle="Computed in-app from Finnhub's raw fundamentals" />
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Ratio label="P/E" value={fmtNum(data.pe_ratio, 2)} />
          <Ratio label="P/S" value={fmtNum(data.ps_ratio, 2)} />
          <Ratio label="P/B" value={fmtNum(data.pb_ratio, 2)} />
          <Ratio label="PEG" value={fmtNum(data.peg_ratio, 2)} />
          <Ratio label="ROE" value={fmtPct(data.roe, { sign: false })} />
          <Ratio label="Net margin" value={fmtPct(data.net_margin, { sign: false })} />
          <Ratio label="Gross margin" value={fmtPct(data.gross_margin, { sign: false })} />
        </div>
      </Card>

      <RecommendationBar recommendation={data.recommendation} />
      <EpsHistoryChart epsHistory={data.eps_history} />
    </div>
  )
}
```

Note: `fmtNum(data.pe_ratio, 2)` on `32.1` must render `'32.10'` — check `frontend/src/lib/format.js`'s current `fmtNum(value, decimals)` implementation; if it doesn't already call `.toFixed(decimals)`, that's the fix needed (unlikely — `RangeStatsCard` in `OverviewTab.jsx` already relies on this).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- ValuationTab.test.jsx`
Expected: PASS

- [ ] **Step 5: Wire into `Research.jsx`**

Add `import ValuationTab from '../components/research/ValuationTab'` (alphabetically among the existing `components/research/*` imports). Replace `{tab === 'valuation' ? <ComingSoon feature="Valuation" /> : null}` with:

```jsx
            {tab === 'valuation' ? <ValuationTab fundamentals={fundamentals} /> : null}
```

- [ ] **Step 6: Run the full frontend suite, lint, and build**

Run: `cd frontend && npm run test && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/research/ValuationTab.jsx frontend/src/components/research/ValuationTab.test.jsx frontend/src/pages/Research.jsx
git commit -m "feat: add the Valuation tab - ratios, recommendations, EPS history"
```

---

### Task 10: Final verification and documentation

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Run the full backend suite**

Run: `cd backend && .venv/bin/python manage.py test`
Expected: all tests pass, no regressions.

- [ ] **Step 2: Run the full frontend suite, lint, and build**

Run: `cd frontend && npm run test && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 3: Record the decisions in AGENTS.md**

Add to the `## Decided` section, after the most recent entry:

```markdown
**Company fundamentals come from Finnhub, fetched on demand.** `research/finnhub.py`
mirrors `market.py`'s shape (call → shape → cache) but reads a static
`FINNHUB_API_KEY` instead of a per-user OAuth credential — one combined
endpoint, `GET /api/research/fundamentals/<symbol>/`, one 24h cache entry per
symbol, no background sync. It always answers 200 with an `available`
boolean rather than a status code: 409 already means "not connected to
Saxo" and reusing it here would blur that. A metric the free tier doesn't
return is omitted, never guessed or defaulted to zero. Symbol resolution
reuses `bare_symbol()` and only works for US-listed tickers - an
international listing needing an exchange suffix is a known gap. Market
context (Buffett indicator, macro series) is still deferred: it needs an
unrelated data source (FRED) and was deliberately kept out of this pass.
```

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md
git commit -m "docs: record the Finnhub fundamentals decision in AGENTS.md"
```

- [ ] **Step 5: Dispatch the architecture and code-quality review passes**

These run against the finished feature, not before it exists. Dispatch two agents:

1. An `Explore`-type agent (matching the pattern used for the Sep 5 "watchlist decoupling" review) with a prompt asking it to analyze `backend/research/finnhub.py`, `backend/research/views.py`'s `FundamentalsView`, and the new frontend files (`ValuationTab.jsx`, `OverviewTab.jsx`'s changes, `queries.js`/`client.js` additions) for design friction, leaky abstractions, or locality violations — same rubric as the two prior architecture-review passes this session. Have it write its findings to an HTML report on disk, same as before.
2. The `thermo-nuclear-code-quality-review` agent against the same diff, for maintainability/structure/spaghetti findings.

Apply any findings both agents surface with high confidence before considering this plan complete; report anything speculative to the user rather than applying it unasked.

---

## Self-Review Notes

- **Spec coverage:** Task 1–2 cover config + client functions; Task 3 covers the spec's "Open Questions" verification gate; Task 4 covers shaping/caching/ratio computation/omission-not-guessing; Task 5 covers the always-200 error shape; Tasks 6–9 cover the full frontend (client, hook, both tabs); Task 10 covers verification, AGENTS.md documentation, and the two review passes the user asked for. All spec sections have a task.
- **Type consistency checked:** `fundamentals` prop shape (`{data, isLoading}`) is identical across `Research.jsx`, `OverviewTab.jsx`, and `ValuationTab.jsx`. Field names in `to_fundamentals`'s output (Task 4) match exactly what `OverviewTab`/`ValuationTab` (Tasks 8–9) read.
- **No placeholders:** every step has runnable code; the one task without a red/green cycle (Task 3) is explicitly framed as a discovery task producing a reference document, with a stated reconciliation step rather than a "TBD."
