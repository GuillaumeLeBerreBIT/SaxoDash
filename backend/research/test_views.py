from datetime import date, timedelta
from unittest.mock import patch

from cryptography.fernet import Fernet
from django.conf import settings
from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APITestCase
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken

from portfolio.models import Position

from . import finnhub

TEST_KEY = Fernet.generate_key().decode()

# Redis is the real cache; these tests must not need it running, and must not
# leak entries into a developer's running instance.
LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}

SAMPLE_PROFILE = {
    'name': 'Apple Inc',
    'exchange': 'NASDAQ',
    'finnhubIndustry': 'Technology',
    'logo': 'https://example.com/aapl.png',
    'marketCapitalization': 3_100_000.0,
    'shareOutstanding': 15_200.0,
}

SAMPLE_FINANCIALS = {'metric': {'peNormalizedAnnual': 32.1}}

SAMPLE_RECOMMENDATION = [
    {'buy': 20, 'hold': 8, 'period': '2026-09-01', 'sell': 1, 'strongBuy': 12, 'strongSell': 0},
]

SAMPLE_EARNINGS = [
    {'period': '2026-06-30', 'actual': 1.65, 'estimate': 1.58, 'surprisePercent': 4.43},
]

RAW_NEWS_ROW = {
    'category': 'company', 'datetime': 1_760_000_000, 'headline': 'Apple ships a thing',
    'id': 7, 'image': 'https://example.com/x.png', 'related': 'AAPL',
    'source': 'Reuters', 'summary': 'A short summary.', 'url': 'https://example.com/story',
}


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

    @patch('research.finnhub.get_financials_reported')
    @patch('research.finnhub.get_earnings_history')
    @patch('research.finnhub.get_recommendation_trends')
    @patch('research.finnhub.get_basic_financials')
    @patch('research.finnhub.get_profile')
    def test_returns_available_true_with_shaped_data(
        self, mock_profile, mock_financials, mock_recs, mock_earnings, mock_reported
    ):
        mock_profile.return_value = SAMPLE_PROFILE
        mock_financials.return_value = SAMPLE_FINANCIALS
        mock_recs.return_value = SAMPLE_RECOMMENDATION
        mock_earnings.return_value = SAMPLE_EARNINGS
        mock_reported.return_value = {'data': []}

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

    @patch('research.finnhub.get_financials_reported')
    @patch('research.finnhub.get_earnings_history')
    @patch('research.finnhub.get_recommendation_trends')
    @patch('research.finnhub.get_basic_financials')
    @patch('research.finnhub.get_profile')
    def test_returns_available_false_on_malformed_finnhub_response(
        self, mock_profile, mock_financials, mock_recs, mock_earnings, mock_reported
    ):
        """Test that a malformed Finnhub payload (unexpected shape) still returns 200."""
        mock_profile.return_value = SAMPLE_PROFILE
        mock_financials.return_value = SAMPLE_FINANCIALS
        # Return a dict instead of a list - this will cause TypeError when
        # to_fundamentals tries to do recommendations[0]
        mock_recs.return_value = {'error': 'unexpected'}
        mock_earnings.return_value = SAMPLE_EARNINGS
        mock_reported.return_value = {'data': []}

        with self.assertLogs('research.providers', level='ERROR'):
            response = self.client.get('/api/research/fundamentals/AAPL/')

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['available'])
        self.assertEqual(response.data['reason'], 'Fundamentals data is unavailable.')

    @patch('research.finnhub.get_profile')
    def test_returns_available_false_for_a_symbol_finnhub_does_not_recognize(self, mock_profile):
        mock_profile.return_value = {}

        response = self.client.get('/api/research/fundamentals/ZZZZZZ/')

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['available'])
        self.assertIn('reason', response.data)

    def test_rejects_a_malformed_symbol(self):
        response = self.client.get('/api/research/fundamentals/AAPL%20US/')
        self.assertEqual(response.status_code, 400)


@override_settings(SAXO_TOKEN_ENCRYPTION_KEY=TEST_KEY, CACHES=LOCMEM, FINNHUB_API_KEY='test-key')
class PeersViewTest(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(username='alex', password='pw')
        token = RefreshToken.for_user(self.user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_requires_authentication(self):
        self.client.credentials()
        response = self.client.get('/api/research/peers/AAPL/')
        self.assertEqual(response.status_code, 401)

    @patch('research.finnhub.get_peers')
    def test_returns_available_true_with_symbols(self, mock_get_peers):
        mock_get_peers.return_value = ['AAPL', 'MSFT', 'GOOGL']

        response = self.client.get('/api/research/peers/AAPL/')

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['available'])
        self.assertEqual(response.data['symbols'], ['MSFT', 'GOOGL'])

    @override_settings(FINNHUB_API_KEY='')
    def test_returns_available_false_when_not_configured(self):
        response = self.client.get('/api/research/peers/AAPL/')

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['available'])
        self.assertIn('reason', response.data)

    @patch('research.finnhub.get_peers')
    def test_returns_available_false_on_a_finnhub_error(self, mock_get_peers):
        mock_get_peers.side_effect = finnhub.FinnhubAPIError('boom')

        response = self.client.get('/api/research/peers/AAPL/')

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['available'])

    def test_rejects_a_malformed_symbol(self):
        response = self.client.get('/api/research/peers/AAPL%20US/')
        self.assertEqual(response.status_code, 400)


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
        self.assertEqual(self.client.get('/api/research/news/not%20a%20symbol/').status_code, 400)


# ScopedRateThrottle caches THROTTLE_RATES on the class at import, so
# override_settings can't reach it - patch the dict directly.
@patch.dict(
    ScopedRateThrottle.THROTTLE_RATES,
    {'research.search': '3/min', 'research.market': '3/min'},
)
@override_settings(CACHES=LOCMEM)
class ThrottleTest(APITestCase):
    def setUp(self):
        cache.clear()
        user = User.objects.create_user(username='alex', password='pw')
        token = RefreshToken.for_user(user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_search_is_throttled_past_its_scope_rate(self):
        # q=n stays under the 2-char floor, so it answers 200 without touching
        # Saxo - but the throttle still counts every request.
        codes = [
            self.client.get('/api/research/instruments/?q=n').status_code
            for _ in range(4)
        ]
        self.assertEqual(codes[:3], [200, 200, 200])
        self.assertEqual(codes[3], 429)

    def test_a_different_scope_keeps_its_own_budget(self):
        for _ in range(3):
            self.client.get('/api/research/instruments/?q=n')
        # search is now exhausted; a market-scope call has its own budget.
        response = self.client.get('/api/research/chart/?uic=211&asset_type=Stock')
        self.assertNotEqual(response.status_code, 429)


class ThrottleScopeConfigTest(TestCase):
    """A typo'd throttle_scope silently disables the limit - ScopedRateThrottle
    treats an unknown scope as unlimited and every other test still passes."""

    def test_every_proxy_view_scope_has_a_configured_rate(self):
        from research import views as research_views

        rates = settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']
        for view in (
            research_views.ChartView,
            research_views.InstrumentSearchView,
            research_views.InstrumentDetailsView,
            research_views.QuotesView,
            research_views.FundamentalsView,
            research_views.EarningsCalendarView,
            research_views.SymbolEarningsView,
            research_views.CompanyNewsView,
            research_views.PeersView,
        ):
            self.assertIn(view.throttle_scope, rates, view.__name__)


@override_settings(SAXO_TOKEN_ENCRYPTION_KEY=TEST_KEY, CACHES=LOCMEM, FINNHUB_API_KEY='test-key')
class EarningsCalendarViewTest(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(username='u', password='p')
        token = RefreshToken.for_user(self.user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_requires_authentication(self):
        self.client.credentials()
        self.assertEqual(self.client.get('/api/research/earnings/calendar/').status_code, 401)

    @patch('research.earnings.finnhub.get_earnings_calendar')
    def test_returns_the_week_with_tagged_rows(self, mock_cal):
        Position.objects.create(
            ticker='AAPL', name='Apple', qty=1, avg_cost=1, current_price=1,
            sector='Tech', type='STOCK', color='#fff',
        )
        today = date.today()
        monday = (today - timedelta(days=today.weekday())).isoformat()
        mock_cal.return_value = {'earningsCalendar': [{
            'symbol': 'AAPL', 'date': monday, 'hour': 'amc', 'quarter': 1, 'year': 2026,
            'epsEstimate': 1.0, 'epsActual': None, 'revenueEstimate': 9, 'revenueActual': None,
        }]}

        response = self.client.get('/api/research/earnings/calendar/')

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['ok'])
        self.assertEqual(response.data['events'][0]['symbol'], 'AAPL')
        self.assertTrue(response.data['events'][0]['held'])
        self.assertEqual(response.data['window']['week'], 0)

    @patch('research.earnings.finnhub.get_earnings_calendar')
    def test_scope_mine_filters_and_week_shifts_the_window(self, mock_cal):
        mock_cal.return_value = {'earningsCalendar': []}

        response = self.client.get('/api/research/earnings/calendar/?scope=mine&week=2')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['events'], [])
        self.assertEqual(response.data['window']['week'], 2)

    def test_rejects_an_unknown_scope(self):
        self.assertEqual(
            self.client.get('/api/research/earnings/calendar/?scope=nope').status_code, 400,
        )

    def test_rejects_a_non_integer_week(self):
        self.assertEqual(
            self.client.get('/api/research/earnings/calendar/?week=soon').status_code, 400,
        )


@override_settings(SAXO_TOKEN_ENCRYPTION_KEY=TEST_KEY, CACHES=LOCMEM, FINNHUB_API_KEY='test-key')
class SymbolEarningsViewTest(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(username='u', password='p')
        token = RefreshToken.for_user(self.user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    @patch('research.earnings.finnhub.get_earnings_calendar')
    @patch('research.earnings.finnhub.get_earnings_history')
    def test_returns_available_true_with_history_and_next(self, mock_hist, mock_cal):
        mock_hist.return_value = [{'period': '2026-06-30', 'actual': 1.6, 'estimate': 1.5, 'surprisePercent': 6.7}]
        future = (date.today() + timedelta(days=20)).isoformat()
        mock_cal.return_value = {'earningsCalendar': [{
            'symbol': 'AAPL', 'date': future, 'hour': 'amc', 'quarter': 1, 'year': 2027,
            'epsEstimate': 2.0, 'epsActual': None, 'revenueEstimate': 9, 'revenueActual': None,
        }]}

        response = self.client.get('/api/research/earnings/AAPL/')

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['available'])
        self.assertEqual(response.data['history'][0]['eps_actual'], 1.6)
        self.assertEqual(response.data['next']['date'], future)

    @override_settings(FINNHUB_API_KEY='')
    def test_returns_available_false_when_not_configured(self):
        response = self.client.get('/api/research/earnings/AAPL/')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['available'])
        self.assertIn('reason', response.data)
        self.assertEqual(response.data['reason'], 'Market data is not configured.')

    @patch('research.earnings.finnhub.get_earnings_history')
    def test_returns_available_false_on_a_finnhub_error(self, mock_hist):
        mock_hist.side_effect = finnhub.FinnhubAPIError('/stock/earnings failed: 500')
        response = self.client.get('/api/research/earnings/AAPL/')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['available'])
