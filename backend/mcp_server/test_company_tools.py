from decimal import Decimal
from unittest.mock import patch

from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase

from research.models import PriceLine, SymbolNote, Watchlist, WatchlistItem

from research import company_data
from research.listings import Listing
from users.testing import the_owner

from .tools.research import (
    get_company,
    get_filings_and_insiders,
    get_financial_statements,
    get_my_notes,
    get_news,
    get_watchlists,
)

LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}


def instrument(currency='USD', asset_type='Stock', symbol='NVDA'):
    return Listing(
        ticker=symbol, symbol=symbol, name=f'{symbol} Inc', uic=1, asset_type=asset_type,
        currency=currency, exchange='NASDAQ',
    )


def fundamentals_payload():
    return {
        'available': True, 'name': 'NVIDIA', 'exchange': 'NASDAQ', 'industry': 'Semis',
        'logo': 'x.png', 'website': 'https://x', 'market_cap': 3000.0, 'pe_ratio': 40.0,
        'ratio_history': {'pe': [1, 2]}, 'eps_history': [{'actual': 1.0}],
        'recommendation': {'buy': 1}, 'recommendation_history': [{'buy': 1}, {'buy': 2}],
    }


@override_settings(CACHES=LOCMEM)
class CompanyToolsTest(APITestCase):
    def setUp(self):
        cache.clear()
        the_owner()

    def test_foreign_listing_is_refused_without_calling_finnhub(self):
        with patch('mcp_server.tools.research.look_up', return_value=instrument('EUR', symbol='ASML')), \
                patch('research.finnhub._get', side_effect=AssertionError('finnhub called')):
            result = get_company('ASML')
        self.assertIsNone(result['data'])
        self.assertEqual(result['warnings'], [company_data.refusal('foreign')])

    def test_etf_gets_news_but_not_statements(self):
        news = {'available': True, 'items': [{'headline': 'h', 'url': 'u', 'datetime': 1}]}
        with patch('mcp_server.tools.research.look_up', return_value=instrument(asset_type='Etf', symbol='SPY')), \
                patch('research.finnhub.news', return_value=news), \
                patch('research.statements.statements', side_effect=AssertionError('called')):
            refused = get_financial_statements('SPY')
            allowed = get_news('SPY')
        self.assertIsNone(refused['data'])
        self.assertEqual(refused['warnings'], [company_data.refusal('fund')])
        self.assertEqual(len(allowed['data']['items']), 1)

    def test_unmatched_symbol_is_answered_with_an_assumption_warning(self):
        items = [{'headline': 'h', 'url': 'u', 'datetime': 1}]
        with patch('mcp_server.tools.research.look_up', return_value=Listing.unresolved('NVDA')), \
                patch('research.finnhub.news', return_value={'available': True, 'items': items}), \
                patch('research.statements.statements', return_value={'available': True, 'annual': [], 'quarterly': []}):
            news = get_news('NVDA')
            statements = get_financial_statements('NVDA')
        warning = 'NVDA could not be matched to a Saxo listing, so it is assumed to be US-listed.'
        self.assertIn(warning, news['warnings'])
        self.assertIn(warning, statements['warnings'])
        self.assertIsNotNone(news['data'])

    def test_news_is_capped_at_limit(self):
        items = [{'headline': str(i), 'url': 'u', 'datetime': i} for i in range(5)]
        with patch('mcp_server.tools.research.look_up', return_value=instrument()), \
                patch('research.finnhub.news', return_value={'available': True, 'items': items}):
            result = get_news('NVDA', limit=2)
        self.assertEqual(len(result['data']['items']), 2)
        self.assertEqual(result['data']['truncated'], 3)

    def test_company_merges_views_and_drops_presentation_keys(self):
        earnings = {'available': True, 'history': [], 'next': None, 'upcoming': [], 'score': None}
        peers = {'available': True, 'symbols': ['AMD']}
        with patch('mcp_server.tools.research.look_up', return_value=instrument()), \
                patch('research.finnhub.fundamentals', return_value=fundamentals_payload()), \
                patch('research.earnings.symbol_earnings', return_value=earnings), \
                patch('research.finnhub.peers', return_value=peers):
            result = get_company('NVDA')
        data = result['data']
        self.assertEqual(data['profile']['name'], 'NVIDIA')
        self.assertNotIn('logo', data['profile'])
        self.assertNotIn('website', data['profile'])
        self.assertEqual(data['metrics']['pe_ratio'], 40.0)
        self.assertEqual(data['peers'], ['AMD'])
        self.assertEqual(len(data['recommendation_trend']), 2)
        self.assertEqual(data['earnings']['history'], [])
        self.assertEqual(result['warnings'], [])

    def test_unavailable_part_is_null_with_reason(self):
        earnings = {'available': True, 'history': [], 'next': None, 'upcoming': [], 'score': None}
        peers = {'available': False, 'reason': 'x'}
        with patch('mcp_server.tools.research.look_up', return_value=instrument()), \
                patch('research.finnhub.fundamentals', return_value=fundamentals_payload()), \
                patch('research.earnings.symbol_earnings', return_value=earnings), \
                patch('research.finnhub.peers', return_value=peers):
            result = get_company('NVDA')
        self.assertIsNone(result['data']['peers'])
        self.assertIn('x', result['warnings'])
        self.assertEqual(result['data']['profile']['name'], 'NVIDIA')

    def test_statements_quarterly_param_reaches_the_view(self):
        payload = {'available': True, 'annual': [{'label': 'A'}], 'quarterly': [{'label': 'Q'}], 'partial': False}
        with patch('mcp_server.tools.research.look_up', return_value=instrument()), \
                patch('research.statements.statements', return_value=payload):
            quarterly = get_financial_statements('NVDA', period='quarterly')
            annual = get_financial_statements('NVDA')
            bad = get_financial_statements('NVDA', period='weekly')
        self.assertEqual(quarterly['data']['periods'], [{'label': 'Q'}])
        self.assertEqual(quarterly['data']['period'], 'quarterly')
        self.assertEqual(annual['data']['periods'], [{'label': 'A'}])
        self.assertIsNone(bad['data'])

    def test_filings_and_insiders_are_combined(self):
        with patch('mcp_server.tools.research.look_up', return_value=instrument()), \
                patch('research.filings.filings', return_value={'available': True, 'items': [1]}), \
                patch('research.filings.insiders', return_value={'available': False, 'reason': 'busy'}):
            result = get_filings_and_insiders('NVDA')
        self.assertEqual(result['data']['filings']['items'], [1])
        self.assertIsNone(result['data']['insiders'])
        self.assertIn('busy', result['warnings'])

    def test_notes_include_target_and_stop(self):
        SymbolNote.objects.create(symbol='NVDA', bull_case='AI', target_price=Decimal('200'), stop_price=Decimal('90'))
        result = get_my_notes('nvda')
        self.assertEqual(result['data']['bull_case'], 'AI')
        self.assertEqual(result['data']['target_price'], 200.0)
        self.assertEqual(result['data']['stop_price'], 90.0)

    def test_notes_carry_the_instrument_price_lines(self):
        PriceLine.objects.create(uic=1, asset_type='Stock', price=Decimal('150'), label='breakout')
        PriceLine.objects.create(uic=2, asset_type='Stock', price=Decimal('9'), label='other')
        with patch('mcp_server.tools.research.look_up', return_value=instrument()):
            result = get_my_notes('NVDA')
        self.assertEqual([(line['price'], line['label']) for line in result['data']['price_lines']], [(150.0, 'breakout')])
        self.assertEqual(PriceLine.objects.count(), 2)

    def test_an_unmatched_symbol_has_no_price_lines(self):
        with patch('mcp_server.tools.research.look_up', return_value=Listing.unresolved('NVDA')):
            self.assertEqual(get_my_notes('NVDA')['data']['price_lines'], [])

    def test_unnoted_symbol_is_read_without_creating_a_row(self):
        result = get_my_notes('TYPO')
        self.assertEqual(SymbolNote.objects.count(), 0)
        self.assertEqual(result['data']['symbol'], 'TYPO')
        self.assertIsNone(result['data']['target_price'])

    def test_foreign_listing_refuses_filings_and_news(self):
        with patch('mcp_server.tools.research.look_up', return_value=instrument('EUR', symbol='ASML')), \
                patch('research.finnhub._get', side_effect=AssertionError('finnhub called')):
            filings = get_filings_and_insiders('ASML')
            news = get_news('ASML')
        for result in (filings, news):
            self.assertIsNone(result['data'])
            self.assertEqual(result['warnings'], [company_data.refusal('foreign')])

    def test_watchlists_keep_identity_only(self):
        watchlist = Watchlist.objects.create(name='Core')
        WatchlistItem.objects.create(watchlist=watchlist, symbol='NVDA', uic=1, asset_type='Stock', description='NVIDIA')
        result = get_watchlists()
        [row] = result['data']['watchlists']
        self.assertEqual(row['name'], 'Core')
        self.assertEqual(row['items'], [{'symbol': 'NVDA', 'name': 'NVIDIA', 'uic': 1, 'asset_type': 'Stock'}])
