from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase

from research.models import ScreenerRow

from .envelope import answer
from .tools import research
from .tools.compare import compare_companies
from .views import ViewResult

LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}


def instrument(symbol, currency='USD'):
    return {'symbol': symbol, 'name': f'{symbol} Inc', 'uic': 1, 'asset_type': 'Stock', 'currency': currency, 'exchange': 'X'}


def company(**metrics):
    base = {
        'revenue_growth_5y': 12.0, 'revenue_growth_ttm_yoy': 8.0, 'eps_growth_ttm_yoy': 9.0,
        'gross_margin': 60.0, 'operating_margin_ttm': 30.0, 'net_margin': 25.0, 'roe': 40.0,
        'debt_to_equity': 0.5, 'current_ratio': 2.0, 'forward_pe': 22.0, 'peg_ratio': 1.4,
    }
    data = {
        'profile': {'name': 'Acme Corp'},
        'metrics': {**base, **metrics},
        'ratio_history': [{'period': '2024-12-31', 'roic': 18.0}],
    }
    return answer(data, sources=['finnhub'])


def valuation(pe=30.0, pe_median=20.0):
    data = {
        'latest': {'pe_ttm': 30.0, 'ps_ttm': 10.0, 'pfcf_ttm': 30.0, 'ev_ebitda_ttm': 20.0, 'daily_pe': pe},
        'medians_5y': {'pe_ttm': 20.0, 'ps_ttm': 5.0, 'pfcf_ttm': 0, 'ev_ebitda_ttm': None, 'daily_pe': pe_median},
    }
    return answer(data, sources=['finnhub'])


def prices():
    summary = {'change_3m_pct': 5.0, 'change_1y_pct': 30.0, 'pct_from_52w_high': -4.0, 'rsi14': 61.0}
    return answer({'summary': summary, 'zone': 'trend'}, sources=['saxo'])


def ownership():
    return answer({'ticker': 'X', 'investors': {'stock': {'owners': 3}}, 'congress': None}, sources=['13f'])


def refused(reason):
    return answer(None, sources=['finnhub'], warnings=[reason])


class Patched:
    def __init__(self, resolver, comp=None, val=None, price=None):
        self.patches = [
            patch('mcp_server.tools.compare.resolve', side_effect=resolver),
            patch('mcp_server.tools.compare.get_company', side_effect=comp or (lambda s: company())),
            patch('mcp_server.tools.compare.get_valuation_history', side_effect=val or (lambda s: valuation())),
            patch('mcp_server.tools.compare.get_price_history', side_effect=price or (lambda s, **k: prices())),
            patch('mcp_server.tools.compare.get_ticker_ownership', side_effect=lambda s: ownership()),
        ]

    def __enter__(self):
        for p in self.patches:
            p.start()

    def __exit__(self, *exc):
        for p in self.patches:
            p.stop()


def usd(symbol):
    return instrument(symbol)


@override_settings(CACHES=LOCMEM)
class CompareToolTest(APITestCase):
    def setUp(self):
        cache.clear()
        get_user_model().objects.create_user('u', password='p')

    def test_one_symbol_is_refused(self):
        result = compare_companies(['NVDA'])
        self.assertIsNone(result['data'])
        self.assertEqual(result['warnings'], ['Compare two to five companies.'])

    def test_six_symbols_are_refused(self):
        result = compare_companies(list('ABCDEF'))
        self.assertIsNone(result['data'])
        self.assertEqual(result['warnings'], ['Compare two to five companies.'])

    def test_duplicates_count_once(self):
        result = compare_companies(['NVDA', 'nvda', 'NVDA:xnas'])
        self.assertIsNone(result['data'])

    def test_foreign_company_keeps_status_and_null_pillars(self):
        def resolver(symbol):
            return instrument(symbol, 'EUR' if symbol == 'ASML' else 'USD')

        with Patched(resolver):
            data = compare_companies(['NVDA', 'ASML'])['data']
        by = {c['symbol']: c for c in data['companies']}
        self.assertEqual(by['ASML']['status'], 'foreign')
        self.assertIsNone(by['ASML']['pillars'])
        self.assertEqual(by['NVDA']['status'], 'eligible')
        self.assertEqual(by['NVDA']['name'], 'Acme Corp')

    def test_pillars_map_the_metric_keys(self):
        with Patched(usd):
            data = compare_companies(['NVDA', 'AAPL'])['data']
        pillars = data['companies'][0]['pillars']
        self.assertEqual(pillars['growth']['revenue_growth_5y_pct'], 12.0)
        self.assertEqual(pillars['growth']['revenue_growth_yoy_pct'], 8.0)
        self.assertEqual(pillars['profitability']['operating_margin_pct'], 30.0)
        self.assertEqual(pillars['profitability']['roic_pct'], 18.0)
        self.assertIsNone(pillars['profitability']['fcf_margin_pct'])
        self.assertEqual(pillars['health']['current_ratio'], 2.0)
        self.assertIsNone(pillars['health']['net_debt_to_equity'])
        self.assertEqual(pillars['trend']['zone'], 'trend')
        self.assertEqual(pillars['trend']['rsi14'], 61.0)
        self.assertEqual(data['companies'][0]['ownership']['investors']['stock']['owners'], 3)

    def test_screener_row_fills_missing_five_year_eps_growth(self):
        ScreenerRow.objects.create(ticker='NVDA', name='NVDA', indexes='sp500', eps_growth_5y=17.5)
        with Patched(usd):
            data = compare_companies(['NVDA', 'AAPL'])['data']
        by = {c['symbol']: c for c in data['companies']}
        self.assertEqual(by['NVDA']['pillars']['growth']['eps_growth_5y_pct'], 17.5)
        self.assertIsNone(by['AAPL']['pillars']['growth']['eps_growth_5y_pct'])

    def test_busy_finnhub_degrades_one_company(self):
        def comp(symbol):
            return refused('busy') if symbol == 'AAPL' else company()

        def val(symbol):
            return refused('busy') if symbol == 'AAPL' else valuation()

        with Patched(usd, comp=comp, val=val):
            result = compare_companies(['NVDA', 'AAPL'])
        by = {c['symbol']: c for c in result['data']['companies']}
        valuation_pillar = by['AAPL']['pillars']['valuation']
        self.assertTrue(all(v is None for v in valuation_pillar.values()))
        self.assertEqual(by['AAPL']['pillars']['trend']['zone'], 'trend')
        self.assertIn('AAPL: busy', result['warnings'])

    def test_valuation_vs_median(self):
        with Patched(usd):
            data = compare_companies(['NVDA', 'AAPL'])['data']
        valuation_pillar = data['companies'][0]['pillars']['valuation']
        self.assertEqual(valuation_pillar['pe_ttm'], 30.0)
        self.assertEqual(valuation_pillar['pe_ttm_vs_5y_median'], 1.5)
        self.assertEqual(valuation_pillar['ps_ttm_vs_5y_median'], 2.0)
        self.assertIsNone(valuation_pillar['pfcf_ttm_vs_5y_median'])
        self.assertIsNone(valuation_pillar['ev_ebitda_ttm_vs_5y_median'])
        self.assertEqual(valuation_pillar['forward_pe'], 22.0)
        self.assertIsNone(valuation_pillar['forward_pe_vs_5y_median'])

    def test_loss_maker_pe_is_null(self):
        with Patched(usd, comp=lambda s: company(eps_ttm=-2.0)):
            data = compare_companies(['NVDA', 'AAPL'])['data']
        valuation_pillar = data['companies'][0]['pillars']['valuation']
        self.assertIsNone(valuation_pillar['pe_ttm'])
        self.assertIsNone(valuation_pillar['pe_ttm_vs_5y_median'])


@override_settings(CACHES=LOCMEM)
class ResolveCacheTest(APITestCase):
    def setUp(self):
        cache.clear()
        get_user_model().objects.create_user('u', password='p')

    def test_second_resolve_does_not_search_again(self):
        row = {'symbol': 'NVDA', 'uic': 1, 'asset_type': 'Stock', 'description': 'N', 'exchange': 'X', 'currency': 'USD'}
        with patch('mcp_server.tools.research.call_view', return_value=ViewResult(200, [row])) as view:
            first = research.resolve('NVDA')
            second = research.resolve('nvda')
        self.assertEqual(first, second)
        self.assertEqual(view.call_count, 1)

    def test_a_miss_is_not_cached(self):
        with patch('mcp_server.tools.research.call_view', return_value=ViewResult(200, [])) as view:
            research.resolve('ZZZZ')
            research.resolve('ZZZZ')
        self.assertEqual(view.call_count, 2)
