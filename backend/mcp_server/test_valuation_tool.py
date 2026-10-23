from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase

from .tools.research import get_valuation_history
from .views import ViewResult

LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}


def instrument(currency='USD'):
    return {'symbol': 'NVDA', 'name': 'NVDA Inc', 'uic': 1, 'asset_type': 'Stock', 'currency': currency, 'exchange': 'X'}


SERIES = {
    'annual': {'pe': [{'period': '2023-12-31', 'v': 25}]},
    'quarterly': {
        'pe_ttm': [{'period': '2024-06-30', 'v': 30}, {'period': '2024-09-30', 'v': 40}],
        'eps': [{'period': '2024-03-31', 'v': 1.0}, {'period': '2024-06-30', 'v': 1.0},
                {'period': '2024-09-30', 'v': 1.0}, {'period': '2024-12-31', 'v': 1.0}],
    },
}


def candles():
    days = ['2025-01-06', '2025-01-07', '2025-01-10', '2025-01-13']
    return [{'date': d, 'close': 40.0} for d in days]


@override_settings(CACHES=LOCMEM)
class ValuationToolTest(APITestCase):
    def setUp(self):
        cache.clear()
        get_user_model().objects.create_user('u', password='p')

    def test_tool_withholds_non_usd(self):
        with patch('mcp_server.tools.research.resolve', return_value=instrument('EUR')), \
                patch('research.finnhub.valuation_series', side_effect=AssertionError('called')):
            result = get_valuation_history('ASML')
        self.assertIsNone(result['data'])
        self.assertTrue(result['warnings'])

    def test_weekly_sampling_medians_and_latest(self):
        with patch('mcp_server.tools.research.resolve', return_value=instrument()), \
                patch('research.finnhub.valuation_series', return_value=SERIES), \
                patch('mcp_server.tools.research.call_view', return_value=ViewResult(200, candles())):
            data = get_valuation_history('NVDA')['data']
        self.assertEqual(data['daily_pe'], [['2025-01-10', 10.0], ['2025-01-13', 10.0]])
        self.assertEqual(data['latest']['pe_ttm'], 40)
        self.assertEqual(data['latest']['daily_pe'], 10.0)
        self.assertEqual(data['medians_5y']['pe_ttm'], 35.0)

    def test_loss_making_company_has_null_pe(self):
        losing = {**SERIES, 'quarterly': {**SERIES['quarterly'], 'eps': [
            {'period': p, 'v': -1.0} for p in ('2024-03-31', '2024-06-30', '2024-09-30', '2024-12-31')]}}
        with patch('mcp_server.tools.research.resolve', return_value=instrument()), \
                patch('research.finnhub.valuation_series', return_value=losing), \
                patch('mcp_server.tools.research.call_view', return_value=ViewResult(200, candles())):
            data = get_valuation_history('NVDA')['data']
        self.assertIsNone(data['latest']['daily_pe'])

    def test_unresolved_symbol_keeps_finnhub_series_with_warning(self):
        with patch('mcp_server.tools.research.resolve', return_value=None), \
                patch('research.finnhub.valuation_series', return_value=SERIES):
            result = get_valuation_history('NVDA')
        self.assertIsNone(result['data']['latest']['daily_pe'])
        self.assertEqual(result['data']['daily_pe'], [])
        self.assertEqual(len(result['warnings']), 2)

    def test_loss_quarters_stay_out_of_latest_and_median(self):
        losing = {**SERIES, 'quarterly': {**SERIES['quarterly'], 'pe_ttm': [
            {'period': '2024-03-31', 'v': 20}, {'period': '2024-06-30', 'v': 30}, {'period': '2024-09-30', 'v': None}]}}
        with patch('mcp_server.tools.research.resolve', return_value=instrument()), \
                patch('research.finnhub.valuation_series', return_value=losing), \
                patch('mcp_server.tools.research.call_view', return_value=ViewResult(200, candles())):
            data = get_valuation_history('NVDA')['data']
        self.assertIsNone(data['latest']['pe_ttm'])
        self.assertEqual(data['medians_5y']['pe_ttm'], 25.0)

    def test_non_us_company_is_warned(self):
        foreign = {**SERIES, 'country': 'TW'}
        with patch('mcp_server.tools.research.resolve', return_value=instrument()), \
                patch('research.finnhub.valuation_series', return_value=foreign), \
                patch('mcp_server.tools.research.call_view', return_value=ViewResult(200, candles())):
            warnings = get_valuation_history('TSM')['warnings']
        self.assertTrue(any('TW' in w and 'daily P/E' in w for w in warnings))

    def test_us_company_is_not_warned_about_country(self):
        domestic = {**SERIES, 'country': 'US'}
        with patch('mcp_server.tools.research.resolve', return_value=instrument()), \
                patch('research.finnhub.valuation_series', return_value=domestic), \
                patch('mcp_server.tools.research.call_view', return_value=ViewResult(200, candles())):
            warnings = get_valuation_history('NVDA')['warnings']
        self.assertFalse(any('daily P/E may' in w for w in warnings))
