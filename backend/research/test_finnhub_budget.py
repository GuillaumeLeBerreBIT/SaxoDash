from unittest.mock import Mock, patch

from django.core.cache import cache
from django.test import TestCase, override_settings

from . import finnhub

LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}

FILING = {'data': [{'form': '10-K', 'year': 2025}]}


def at(seconds):
    return patch('research.finnhub._now', return_value=float(seconds))


@override_settings(CACHES=LOCMEM, FINNHUB_API_KEY='test-key', FINNHUB_CALLS_PER_MINUTE=2, FINNHUB_BACKGROUND_RESERVE=1)
class CallBudgetTest(TestCase):
    def setUp(self):
        cache.clear()
        requests_get = patch('research.finnhub.requests.get', return_value=Mock(ok=True, json=lambda: {}))
        self.requests_get = requests_get.start()
        self.addCleanup(requests_get.stop)

    def test_refuses_a_call_beyond_the_budget_without_reaching_finnhub(self):
        with at(6000):
            finnhub._get('/stock/profile2', symbol='AAPL')
            finnhub._get('/stock/metric', symbol='AAPL')
            with self.assertRaises(finnhub.FinnhubBusy):
                finnhub._get('/stock/earnings', symbol='AAPL')

        self.assertEqual(self.requests_get.call_count, 2)

    def test_the_budget_is_whole_again_a_full_minute_later(self):
        with at(6000):
            finnhub._get('/a')
            finnhub._get('/b')
        with at(6120):
            finnhub._get('/c')
            finnhub._get('/d')

        self.assertEqual(self.requests_get.call_count, 4)

    def test_calls_just_before_a_minute_boundary_still_count_just_after_it(self):
        with at(6059):
            finnhub._get('/a')
            finnhub._get('/b')
        with at(6061):
            with self.assertRaises(finnhub.FinnhubBusy):
                finnhub._get('/c')

    def test_the_earlier_minute_fades_as_the_new_one_goes_on(self):
        with at(6059):
            finnhub._get('/a')
            finnhub._get('/b')
        with at(6095):
            finnhub._get('/c')

        self.assertEqual(self.requests_get.call_count, 3)

    def test_refused_calls_are_not_counted_as_spent(self):
        with at(6000):
            finnhub._get('/a')
            finnhub._get('/b')
            for _ in range(5):
                with self.assertRaises(finnhub.FinnhubBusy):
                    finnhub._get('/c')

        self.assertEqual(cache.get(finnhub._budget_key(100)), 2)

    def test_background_work_leaves_a_reserve_for_interactive_calls(self):
        with at(6000):
            with finnhub.background_calls():
                finnhub._get('/a')
                with self.assertRaises(finnhub.FinnhubBusy):
                    finnhub._get('/b')
            finnhub._get('/c')

        self.assertEqual(self.requests_get.call_count, 2)

    def test_says_how_long_until_the_minute_turns(self):
        with at(6042):
            self.assertEqual(finnhub.seconds_until_budget_refills(), 18)

    def test_a_cache_that_cannot_count_does_not_block_calls(self):
        with patch('research.finnhub.cache') as broken:
            broken.add.side_effect = ConnectionError('redis is down')
            for _ in range(5):
                finnhub._get('/a')

        self.assertEqual(self.requests_get.call_count, 5)

    def test_a_refusal_tells_the_client_to_try_again(self):
        body = finnhub.FinnhubBusy().body()

        self.assertFalse(body['available'])
        self.assertIn('Try again in a minute', body['reason'])

    @override_settings(FINNHUB_API_KEY='')
    def test_a_missing_key_is_reported_before_any_budget_is_spent(self):
        with at(6000):
            with self.assertRaises(finnhub.FinnhubNotConfigured):
                finnhub._get('/a')

        self.assertIsNone(cache.get(finnhub._budget_key(100)))


@override_settings(CACHES=LOCMEM, FINNHUB_API_KEY='test-key')
class BusyFundamentalsTest(TestCase):
    def setUp(self):
        cache.clear()

    @patch('research.finnhub.get_earnings_history', return_value=[])
    @patch('research.finnhub.get_recommendation_trends', return_value=[])
    @patch('research.finnhub.get_basic_financials', return_value={'metric': {}})
    @patch('research.finnhub.get_profile', return_value={'name': 'Apple Inc'})
    @patch('research.finnhub.get_financials_reported', side_effect=finnhub.FinnhubBusy())
    def test_a_busy_refusal_is_not_cached_as_fundamentals_without_results(self, mock_reported, *others):
        with self.assertRaises(finnhub.FinnhubBusy):
            finnhub.fundamentals('AAPL')
        mock_reported.side_effect = None
        mock_reported.return_value = FILING

        finnhub.fundamentals('AAPL')

        self.assertEqual(mock_reported.call_count, 2)


@override_settings(CACHES=LOCMEM, FINNHUB_API_KEY='test-key')
class ReportedAnnualTest(TestCase):
    def setUp(self):
        cache.clear()

    @patch('research.finnhub.get_financials_reported', return_value=FILING)
    def test_fetches_the_annual_filings_once_per_symbol(self, mock_reported):
        first = finnhub.reported_annual('AAPL')
        second = finnhub.reported_annual('AAPL')

        self.assertEqual(first, FILING)
        self.assertEqual(second, FILING)
        mock_reported.assert_called_once_with('AAPL', 'annual')

    @patch('research.finnhub.get_financials_reported', return_value=FILING)
    def test_keeps_symbols_apart(self, mock_reported):
        finnhub.reported_annual('AAPL')
        finnhub.reported_annual('MSFT')

        self.assertEqual(mock_reported.call_count, 2)

    @patch('research.finnhub.get_financials_reported', return_value={'data': []})
    def test_an_answer_with_no_filings_is_not_kept(self, mock_reported):
        finnhub.reported_annual('ZZZZ')
        finnhub.reported_annual('ZZZZ')

        self.assertEqual(mock_reported.call_count, 2)

    @patch('research.finnhub.get_financials_reported', side_effect=finnhub.FinnhubAPIError('boom'))
    def test_a_failure_propagates_and_is_not_kept(self, mock_reported):
        with self.assertRaises(finnhub.FinnhubAPIError):
            finnhub.reported_annual('AAPL')
        with self.assertRaises(finnhub.FinnhubAPIError):
            finnhub.reported_annual('AAPL')

        self.assertEqual(mock_reported.call_count, 2)
