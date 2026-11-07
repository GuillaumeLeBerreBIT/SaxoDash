from datetime import date, timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase

from research import finnhub
from research.listings import Listing
from research.models import ScreenerRow

from .envelope import Reply
from .tools.compare import compare_companies

LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}
FOREIGN = {'ASML'}


def listing(symbol):
    currency = 'EUR' if symbol in FOREIGN else 'USD'
    return Listing(ticker=symbol, symbol=symbol, name=f'{symbol} Inc', uic=1, asset_type='Stock', currency=currency, exchange='X')


def fundamentals(symbol, **metrics):
    base = {
        'revenue_growth_5y': 12.0, 'revenue_growth_ttm_yoy': 8.0, 'eps_growth_ttm_yoy': 9.0,
        'gross_margin': 60.0, 'operating_margin_ttm': 30.0, 'net_margin': 25.0, 'roe': 40.0,
        'debt_to_equity': 0.5, 'current_ratio': 2.0, 'forward_pe': 22.0, 'peg_ratio': 1.4,
    }
    return {'available': True, 'name': 'Acme Corp', **base, **metrics, 'ratio_history': [{'period': '2024-12-31', 'roic': 18.0}]}


def series(symbol):
    recent = date.today() - timedelta(days=400)
    periods = [(recent + timedelta(days=91 * i)).isoformat() for i in range(3)]
    return {
        'annual': {},
        'quarterly': {
            'pe_ttm': [{'period': p, 'v': v} for p, v in zip(periods, (10.0, 20.0, 30.0))],
            'ps_ttm': [{'period': p, 'v': v} for p, v in zip(periods, (2.0, 5.0, 10.0))],
        },
        'country': 'US',
    }


def bars():
    first = date(2024, 1, 1)
    return [
        {'date': (first + timedelta(days=i)).isoformat(), 'open': 100.0 + i, 'high': 101.0 + i, 'low': 99.0 + i, 'close': 100.0 + i, 'volume': 1.0}
        for i in range(300)
    ]


def ownership(found):
    return Reply({'ticker': found.ticker, 'investors': {'stock': {'owners': 3}}, 'congress': None})


class Providers:
    def __init__(self, fundamentals=fundamentals, series=series):
        self.asked = []

        def recorded(name, produce):
            def call(*args, **kwargs):
                self.asked.append((name, args))
                return produce(*args)

            return call

        self.patches = [
            patch('mcp_server.tools.compare.look_up', side_effect=listing),
            patch('research.finnhub.fundamentals', side_effect=recorded('fundamentals', fundamentals)),
            patch('research.finnhub.valuation_series', side_effect=recorded('series', series)),
            patch('research.market.chart', side_effect=recorded('chart', lambda *a: bars())),
            patch('mcp_server.tools.compare.ownership', side_effect=recorded('ownership', ownership)),
        ]

    def calls(self, name):
        return [args for asked, args in self.asked if asked == name]

    def __enter__(self):
        for p in self.patches:
            p.start()
        return self

    def __exit__(self, *exc):
        for p in self.patches:
            p.stop()


def by_symbol(result):
    return {c['symbol']: c for c in result['data']['companies']}


@override_settings(CACHES=LOCMEM)
class CompareToolTest(APITestCase):
    def setUp(self):
        cache.clear()
        get_user_model().objects.create_user('u', password='p')

    def test_one_symbol_is_refused(self):
        result = compare_companies(['NVDA'])
        self.assertIsNone(result['data'])
        self.assertEqual(result['warnings'][-1], 'Compare two to five companies.')

    def test_six_symbols_are_refused(self):
        self.assertIsNone(compare_companies(list('ABCDEF'))['data'])

    def test_duplicates_count_once(self):
        self.assertIsNone(compare_companies(['NVDA', 'nvda', 'NVDA:xnas'])['data'])

    def test_foreign_company_keeps_status_and_null_pillars_without_asking(self):
        with Providers() as providers:
            result = compare_companies(['NVDA', 'ASML'])
        by = by_symbol(result)
        self.assertEqual(by['ASML']['status'], 'foreign')
        self.assertIsNone(by['ASML']['pillars'])
        self.assertIsNone(by['ASML']['ownership'])
        self.assertEqual(by['NVDA']['status'], 'eligible')
        self.assertEqual(by['NVDA']['name'], 'Acme Corp')
        for name in ('fundamentals', 'series', 'ownership'):
            self.assertEqual(len(providers.calls(name)), 1, name)
        self.assertEqual(len(providers.calls('chart')), 1)
        self.assertEqual(sum(w.startswith('ASML: ') for w in result['warnings']), 1)

    def test_pillars_map_the_metric_keys(self):
        with Providers():
            by = by_symbol(compare_companies(['NVDA', 'AAPL']))
        pillars = by['NVDA']['pillars']
        self.assertEqual(pillars['growth']['revenue_growth_5y_pct'], 12.0)
        self.assertEqual(pillars['growth']['revenue_growth_yoy_pct'], 8.0)
        self.assertEqual(pillars['profitability']['operating_margin_pct'], 30.0)
        self.assertEqual(pillars['profitability']['roic_pct'], 18.0)
        self.assertIsNone(pillars['profitability']['fcf_margin_pct'])
        self.assertEqual(pillars['health']['current_ratio'], 2.0)
        self.assertIsNone(pillars['health']['net_debt_to_equity'])
        self.assertEqual(pillars['trend']['zone'], 'stretched')
        self.assertEqual(pillars['trend']['change_1y_pct'], round((399 / 147 - 1) * 100, 2))
        self.assertEqual(by['NVDA']['ownership']['investors']['stock']['owners'], 3)

    def test_one_chart_call_per_company(self):
        with Providers() as providers:
            compare_companies(['NVDA', 'AAPL'])
        self.assertEqual(len(providers.calls('chart')), 2)

    def test_screener_row_fills_missing_five_year_eps_growth(self):
        ScreenerRow.objects.create(ticker='NVDA', name='NVDA', indexes='sp500', eps_growth_5y=17.5)
        with Providers():
            by = by_symbol(compare_companies(['NVDA', 'AAPL']))
        self.assertEqual(by['NVDA']['pillars']['growth']['eps_growth_5y_pct'], 17.5)
        self.assertIsNone(by['AAPL']['pillars']['growth']['eps_growth_5y_pct'])

    def test_busy_finnhub_degrades_one_company(self):
        def busy_for_aapl(symbol):
            if symbol == 'AAPL':
                raise finnhub.FinnhubBusy()
            return fundamentals(symbol)

        def series_for(symbol):
            if symbol == 'AAPL':
                raise finnhub.FinnhubBusy()
            return series(symbol)

        with Providers(fundamentals=busy_for_aapl, series=series_for):
            result = compare_companies(['NVDA', 'AAPL'])
        aapl = by_symbol(result)['AAPL']['pillars']
        self.assertTrue(all(v is None for v in aapl['valuation'].values()))
        self.assertEqual(aapl['trend']['zone'], 'stretched')
        self.assertIn('AAPL: Market data is busy. Try again in a minute.', result['warnings'])

    def test_valuation_vs_median(self):
        with Providers():
            valuation_pillar = by_symbol(compare_companies(['NVDA', 'AAPL']))['NVDA']['pillars']['valuation']
        self.assertEqual(valuation_pillar['pe_ttm'], 30.0)
        self.assertEqual(valuation_pillar['pe_ttm_vs_5y_median'], 1.5)
        self.assertEqual(valuation_pillar['ps_ttm_vs_5y_median'], 2.0)
        self.assertIsNone(valuation_pillar['pfcf_ttm_vs_5y_median'])
        self.assertIsNone(valuation_pillar['ev_ebitda_ttm_vs_5y_median'])
        self.assertEqual(valuation_pillar['forward_pe'], 22.0)
        self.assertIsNone(valuation_pillar['forward_pe_vs_5y_median'])

    def test_loss_maker_pe_is_null(self):
        with Providers(fundamentals=lambda s: fundamentals(s, eps_ttm=-2.0)):
            valuation_pillar = by_symbol(compare_companies(['NVDA', 'AAPL']))['NVDA']['pillars']['valuation']
        self.assertIsNone(valuation_pillar['pe_ttm'])
        self.assertIsNone(valuation_pillar['pe_ttm_vs_5y_median'])

    def test_saxo_warnings_appear_once_for_the_whole_comparison(self):
        with Providers(), patch('mcp_server.tools.saxo_warnings', return_value=['Saxo needs re-authentication.']):
            result = compare_companies(['NVDA', 'AAPL', 'MSFT'])
        self.assertEqual(result['warnings'].count('Saxo needs re-authentication.'), 1)
        self.assertFalse(any('re-authentication' in w and ': ' in w for w in result['warnings']))
