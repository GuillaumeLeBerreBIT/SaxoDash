from unittest.mock import Mock, patch

from django.core.cache import cache
from django.test import TestCase, override_settings

from . import finnhub

LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}

FILING = {'data': [{'form': '10-K', 'year': 2025}]}


@override_settings(CACHES=LOCMEM, FINNHUB_API_KEY='test-key', FINNHUB_CALLS_PER_MINUTE=2)
class CallBudgetTest(TestCase):
    def setUp(self):
        cache.clear()

    @patch('research.finnhub.requests.get')
    def test_refuses_a_call_beyond_the_budget_without_reaching_finnhub(self, mock_get):
        mock_get.return_value = Mock(ok=True, json=lambda: {})
        finnhub._get('/stock/profile2', symbol='AAPL')
        finnhub._get('/stock/metric', symbol='AAPL')

        with self.assertRaises(finnhub.FinnhubBusy):
            finnhub._get('/stock/earnings', symbol='AAPL')

        self.assertEqual(mock_get.call_count, 2)

    @patch('research.finnhub.requests.get')
    def test_the_budget_refills_with_the_next_minute(self, mock_get):
        mock_get.return_value = Mock(ok=True, json=lambda: {})
        with patch('research.finnhub._minute', return_value=100):
            finnhub._get('/a')
            finnhub._get('/b')
        with patch('research.finnhub._minute', return_value=101):
            finnhub._get('/c')

        self.assertEqual(mock_get.call_count, 3)

    @patch('research.finnhub.requests.get')
    def test_a_refused_call_does_not_spend_from_the_next_minute(self, mock_get):
        mock_get.return_value = Mock(ok=True, json=lambda: {})
        with patch('research.finnhub._minute', return_value=100):
            finnhub._get('/a')
            finnhub._get('/b')
            for _ in range(5):
                with self.assertRaises(finnhub.FinnhubBusy):
                    finnhub._get('/c')
        with patch('research.finnhub._minute', return_value=101):
            finnhub._get('/d')
            finnhub._get('/e')

        self.assertEqual(mock_get.call_count, 4)

    @patch('research.finnhub.requests.get')
    def test_a_broken_cache_does_not_block_calls(self, mock_get):
        mock_get.return_value = Mock(ok=True, json=lambda: {})
        with patch('research.finnhub.cache') as broken:
            broken.add.side_effect = ConnectionError('redis is down')
            for _ in range(5):
                finnhub._get('/a')

        self.assertEqual(mock_get.call_count, 5)

    def test_a_refusal_tells_the_client_to_try_again(self):
        body = finnhub.FinnhubBusy().body()

        self.assertFalse(body['available'])
        self.assertIn('Try again in a minute', body['reason'])

    @override_settings(FINNHUB_API_KEY='')
    def test_a_missing_key_is_reported_before_any_budget_is_spent(self):
        with self.assertRaises(finnhub.FinnhubNotConfigured):
            finnhub._get('/a')
        self.assertIsNone(cache.get(finnhub._budget_key()))


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
