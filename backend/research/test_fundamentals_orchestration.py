from unittest.mock import patch
from django.core.cache import cache
from django.test import TestCase, override_settings

from . import finnhub

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


@override_settings(CACHES=LOCMEM, FINNHUB_API_KEY='test-key')
class FundamentalsNoDataTest(TestCase):
    def setUp(self):
        cache.clear()

    @patch('research.finnhub.get_earnings_history')
    @patch('research.finnhub.get_recommendation_trends')
    @patch('research.finnhub.get_basic_financials')
    @patch('research.finnhub.get_profile')
    def test_a_profile_with_no_name_raises_finnhub_no_data(
        self, mock_profile, mock_financials, mock_recs, mock_earnings
    ):
        mock_profile.return_value = {}

        with self.assertRaises(finnhub.FinnhubNoData):
            finnhub.fundamentals('ZZZZZZ')

        mock_financials.assert_not_called()
        mock_recs.assert_not_called()
        mock_earnings.assert_not_called()

    @patch('research.finnhub.get_profile')
    def test_a_no_data_result_is_not_cached(self, mock_profile):
        mock_profile.return_value = {}

        with self.assertRaises(finnhub.FinnhubNoData):
            finnhub.fundamentals('ZZZZZZ')

        self.assertIsNone(cache.get(finnhub._cache_key('ZZZZZZ')))


@override_settings(CACHES=LOCMEM)
class FundamentalsCacheTest(TestCase):
    def setUp(self):
        cache.clear()

    @patch('research.finnhub.get_financials_reported')
    @patch('research.finnhub.get_earnings_history')
    @patch('research.finnhub.get_recommendation_trends')
    @patch('research.finnhub.get_basic_financials')
    @patch('research.finnhub.get_profile')
    def test_a_second_call_for_the_same_symbol_does_not_refetch(
        self, mock_profile, mock_financials, mock_recs, mock_earnings, mock_reported
    ):
        mock_profile.return_value = SAMPLE_PROFILE
        mock_financials.return_value = SAMPLE_FINANCIALS
        mock_recs.return_value = SAMPLE_RECOMMENDATION
        mock_earnings.return_value = SAMPLE_EARNINGS
        mock_reported.return_value = {'data': []}

        finnhub.fundamentals('AAPL')
        finnhub.fundamentals('AAPL')

        self.assertEqual(mock_profile.call_count, 1)


@override_settings(CACHES=LOCMEM)
class PeersShapingTest(TestCase):
    def setUp(self):
        cache.clear()

    @patch('research.finnhub.get_peers')
    def test_drops_the_query_symbol_and_caps_at_five(self, mock_get_peers):
        mock_get_peers.return_value = ['AAPL', 'MSFT', 'GOOGL', 'META', 'AMZN', 'NFLX']

        result = finnhub.peers('AAPL')

        self.assertTrue(result['available'])
        self.assertEqual(result['symbols'], ['MSFT', 'GOOGL', 'META', 'AMZN', 'NFLX'])

    @patch('research.finnhub.get_peers')
    def test_a_second_call_for_the_same_symbol_does_not_refetch(self, mock_get_peers):
        mock_get_peers.return_value = ['AAPL', 'MSFT']

        finnhub.peers('AAPL')
        finnhub.peers('AAPL')

        self.assertEqual(mock_get_peers.call_count, 1)

    @patch('research.finnhub.get_peers')
    def test_an_empty_peer_list_is_available_with_no_symbols(self, mock_get_peers):
        mock_get_peers.return_value = []

        result = finnhub.peers('ZZZZZZ')

        self.assertTrue(result['available'])
        self.assertEqual(result['symbols'], [])

    @patch('research.finnhub.get_peers')
    def test_a_provider_error_propagates(self, mock_get_peers):
        mock_get_peers.side_effect = finnhub.FinnhubAPIError('boom')

        with self.assertRaises(finnhub.FinnhubAPIError):
            finnhub.peers('AAPL')


@override_settings(CACHES=LOCMEM)
class IndustryShapingTest(TestCase):
    """finnhub.industry() backs the Position.sector backfill (portfolio.
    sectors) - a small, separately-cached read of just the profile, not the
    full fundamentals() payload (which also fetches financials/recommendations/
    earnings - unneeded weight for a sync that only wants one field)."""

    def setUp(self):
        cache.clear()

    @patch('research.finnhub.get_profile')
    def test_returns_finnhubs_industry_classification(self, mock_get_profile):
        mock_get_profile.return_value = SAMPLE_PROFILE  # finnhubIndustry: 'Technology'

        self.assertEqual(finnhub.industry('AAPL'), 'Technology')

    @patch('research.finnhub.get_profile')
    def test_a_second_call_for_the_same_symbol_does_not_refetch(self, mock_get_profile):
        mock_get_profile.return_value = SAMPLE_PROFILE

        finnhub.industry('AAPL')
        finnhub.industry('AAPL')

        self.assertEqual(mock_get_profile.call_count, 1)

    @patch('research.finnhub.get_profile')
    def test_a_provider_error_propagates(self, mock_get_profile):
        mock_get_profile.side_effect = finnhub.FinnhubAPIError('boom')

        with self.assertRaises(finnhub.FinnhubAPIError):
            finnhub.industry('AAPL')

    @patch('research.finnhub.get_profile')
    def test_a_profile_with_no_industry_raises_no_data(self, mock_get_profile):
        # An ETF or unlisted instrument: Finnhub answers 200 with a
        # near-empty profile. Same "raise before caching" reasoning as
        # fundamentals()'s own no-name check - a wrong "no data" answer
        # should not get pinned for a week.
        mock_get_profile.return_value = {'name': 'iShares Core MSCI World'}

        with self.assertRaises(finnhub.FinnhubNoData):
            finnhub.industry('IWDA')
