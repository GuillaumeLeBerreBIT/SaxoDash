from datetime import date
from unittest.mock import patch

from django.core.cache import cache
from django.test import SimpleTestCase, TestCase, override_settings

from research import finnhub
from research.valuation import median_since, trailing_pe

LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}


def quarters(*values):
    return [(date(2024, 3 * (i + 1), 28), v) for i, v in enumerate(values)]


class TrailingPeTest(SimpleTestCase):
    def test_ttm_needs_four_quarters(self):
        closes = [(date(2024, 10, 1), 100.0)]
        self.assertEqual(trailing_pe(closes, quarters(1, 1, 1)), [(date(2024, 10, 1), None)])

    def test_negative_ttm_is_null(self):
        closes = [(date(2025, 1, 5), 100.0)]
        self.assertEqual(trailing_pe(closes, quarters(-1, 0.2, 0.2, 0.2)), [(date(2025, 1, 5), None)])

    def test_ttm_rolls_on_period_end(self):
        eps = [(date(2024, 3, 31), 1.0), (date(2024, 6, 30), 1.0), (date(2024, 9, 30), 1.0),
               (date(2024, 12, 31), 1.0), (date(2025, 3, 31), 2.0)]
        closes = [(date(2025, 1, 1), 40.0), (date(2025, 4, 1), 60.0)]
        self.assertEqual(trailing_pe(closes, eps), [(date(2025, 1, 1), 10.0), (date(2025, 4, 1), 12.0)])

    def test_close_before_any_quarter_is_null(self):
        self.assertEqual(trailing_pe([(date(2020, 1, 1), 5.0)], quarters(1, 1, 1, 1)), [(date(2020, 1, 1), None)])


class MedianTest(SimpleTestCase):
    def test_median_since_five_years(self):
        points = [(date(2018, 1, 1), 1000.0), (date(2021, 6, 1), 10.0), (date(2022, 6, 1), 20.0), (date(2024, 6, 1), 30.0)]
        self.assertEqual(median_since(points, years=5, today=date(2025, 1, 1)), 20.0)

    def test_median_ignores_nulls_and_empty_is_none(self):
        self.assertIsNone(median_since([(date(2024, 1, 1), None)], today=date(2025, 1, 1)))
        self.assertIsNone(median_since([], today=date(2025, 1, 1)))


@override_settings(CACHES=LOCMEM)
class ValuationSeriesTest(TestCase):
    def setUp(self):
        cache.clear()

    def test_series_shaping_omits_missing_and_orders_oldest_first(self):
        payload = {'series': {
            'annual': {'pe': [{'period': '2024-12-31', 'v': 30}, {'period': '2023-12-31', 'v': 25}]},
            'quarterly': {'peTTM': [{'period': '2025-03-31', 'v': 40}, {'period': '2024-12-31', 'v': 35}],
                          'eps': [{'period': '2025-03-31', 'v': 1.0}]},
        }}
        with patch('research.finnhub._get', return_value=payload) as get:
            result = finnhub.valuation_series('NVDA')
            finnhub.valuation_series('NVDA')
        self.assertEqual([call.args[0] for call in get.call_args_list].count('/stock/metric'), 1)
        self.assertEqual(result['annual'], {'pe': [{'period': '2023-12-31', 'v': 25}, {'period': '2024-12-31', 'v': 30}]})
        self.assertEqual(result['quarterly']['pe_ttm'][0], {'period': '2024-12-31', 'v': 35})
        self.assertEqual(set(result['quarterly']), {'pe_ttm', 'eps'})

    def test_non_positive_multiples_are_null_not_negative(self):
        payload = {'series': {
            'annual': {'pe': [{'period': '2023-12-31', 'v': -12}, {'period': '2024-12-31', 'v': 25}]},
            'quarterly': {
                'peTTM': [{'period': '2024-12-31', 'v': 35}, {'period': '2025-03-31', 'v': -40}],
                'pfcfTTM': [{'period': '2025-03-31', 'v': 0}],
                'evEbitdaTTM': [{'period': '2025-03-31', 'v': -3}],
                'psTTM': [{'period': '2025-03-31', 'v': 4}],
                'eps': [{'period': '2025-03-31', 'v': -1.0}],
            },
        }}
        with patch('research.finnhub._get', return_value=payload):
            result = finnhub.valuation_series('LOSS')
        quarterly = result['quarterly']
        self.assertEqual(quarterly['pe_ttm'], [{'period': '2024-12-31', 'v': 35}, {'period': '2025-03-31', 'v': None}])
        self.assertEqual(quarterly['pfcf_ttm'], [{'period': '2025-03-31', 'v': None}])
        self.assertEqual(quarterly['ev_ebitda_ttm'], [{'period': '2025-03-31', 'v': None}])
        self.assertEqual(quarterly['ps_ttm'], [{'period': '2025-03-31', 'v': 4}])
        self.assertEqual(quarterly['eps'], [{'period': '2025-03-31', 'v': -1.0}])
        self.assertEqual(result['annual']['pe'][0], {'period': '2023-12-31', 'v': None})

    def test_series_carries_the_profile_country(self):
        def get(path, **params):
            return {'name': 'Taiwan Semi', 'country': 'TW'} if path == '/stock/profile2' else {'series': {}}

        with patch('research.finnhub._get', side_effect=get):
            self.assertEqual(finnhub.valuation_series('TSM')['country'], 'TW')

    def test_series_shares_the_metric_call_with_fundamentals(self):
        def get(path, **params):
            if path == '/stock/profile2':
                return {'name': 'NVIDIA', 'country': 'US'}
            if path == '/stock/metric':
                return {'metric': {}, 'series': {'quarterly': {'peTTM': [{'period': '2025-03-31', 'v': 40}]}}}
            if path == '/stock/financials-reported':
                return {'data': []}
            return []

        with patch('research.finnhub._get', side_effect=get) as calls:
            finnhub.fundamentals('NVDA')
            finnhub.valuation_series('NVDA')
        paths = [call.args[0] for call in calls.call_args_list]
        self.assertEqual(paths.count('/stock/metric'), 1)
        self.assertEqual(paths.count('/stock/profile2'), 1)
