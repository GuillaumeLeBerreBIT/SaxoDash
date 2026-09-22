from unittest.mock import Mock, patch
from django.test import TestCase, override_settings

from . import finnhub

RAW_NEWS_ROW = {
    'category': 'company', 'datetime': 1_760_000_000, 'headline': 'Apple ships a thing',
    'id': 7, 'image': 'https://example.com/x.png', 'related': 'AAPL',
    'source': 'Reuters', 'summary': 'A short summary.', 'url': 'https://example.com/story',
}


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

    @override_settings(FINNHUB_API_KEY='test-key')
    @patch('research.finnhub.requests.get')
    def test_raises_on_a_non_json_response_body(self, mock_get):
        mock_get.return_value = Mock(ok=True, json=lambda: (_ for _ in ()).throw(ValueError('bad json')))

        with self.assertRaises(finnhub.FinnhubAPIError):
            finnhub._get('/stock/profile2', symbol='AAPL')

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


class PeersClientTest(TestCase):
    @override_settings(FINNHUB_API_KEY='test-key')
    @patch('research.finnhub.requests.get')
    def test_get_peers_calls_the_peers_endpoint(self, mock_get):
        mock_get.return_value = Mock(ok=True, json=lambda: ['AAPL', 'MSFT'])

        result = finnhub.get_peers('AAPL')

        self.assertEqual(result, ['AAPL', 'MSFT'])
        self.assertEqual(mock_get.call_args.args[0], 'https://finnhub.io/api/v1/stock/peers')
        self.assertEqual(mock_get.call_args.kwargs['params']['symbol'], 'AAPL')


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


class EarningsCalendarClientTest(TestCase):
    @override_settings(FINNHUB_API_KEY='test-key')
    @patch('research.finnhub.requests.get')
    def test_calls_the_calendar_endpoint_with_the_symbol_and_window(self, mock_get):
        mock_get.return_value = Mock(ok=True, status_code=200)
        mock_get.return_value.json.return_value = {'earningsCalendar': []}

        finnhub.get_earnings_calendar('AAPL', '2026-06-01', '2026-12-31')

        (url,), kwargs = mock_get.call_args
        self.assertEqual(url, 'https://finnhub.io/api/v1/calendar/earnings')
        self.assertEqual(kwargs['params']['symbol'], 'AAPL')
        self.assertEqual(kwargs['params']['from'], '2026-06-01')
        self.assertEqual(kwargs['params']['to'], '2026-12-31')

    @override_settings(FINNHUB_API_KEY='test-key')
    @patch('research.finnhub.requests.get')
    def test_a_falsy_symbol_omits_the_symbol_param_for_the_whole_market(self, mock_get):
        mock_get.return_value = Mock(ok=True, status_code=200)
        mock_get.return_value.json.return_value = {'earningsCalendar': []}

        finnhub.get_earnings_calendar(None, '2026-06-01', '2026-06-07')

        _, kwargs = mock_get.call_args
        self.assertNotIn('symbol', kwargs['params'])
