from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase

from portfolio.models import Position
from research.providers import ProviderNotConnected
from research.technicals import sma

from .tools.research import get_price_history, get_quotes, resolve, search_instruments

LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}


def candles(count, start=100.0, step=0.5):
    first = date(2020, 1, 1)
    out = []
    for i in range(count):
        close = start + i * step
        out.append({
            'date': (first + timedelta(days=i)).isoformat(),
            'open': close, 'high': close + 1, 'low': close - 1, 'close': close, 'volume': 1000.0,
        })
    return out


def instrument(symbol, uic, currency='USD', asset_type='Stock'):
    return {
        'symbol': symbol, 'uic': uic, 'asset_type': asset_type,
        'description': f'{symbol} Inc', 'exchange': 'NASDAQ', 'currency': currency,
    }


@override_settings(CACHES=LOCMEM)
class PriceToolsTest(APITestCase):
    def setUp(self):
        cache.clear()
        get_user_model().objects.create_user('u', password='p')

    def test_held_position_resolves_without_saxo(self):
        Position.objects.create(
            ticker='GOOGL', name='Alphabet', qty=Decimal('1'), avg_cost=Decimal('1'),
            current_price=Decimal('1'), sector='Tech', type='STOCK', color='#000',
            uic=4711, asset_type='Stock', currency='USD',
        )
        with patch('saxo.client._get', side_effect=RuntimeError('no saxo')):
            found = resolve('googl')
        self.assertEqual(found['uic'], 4711)
        self.assertEqual(found['asset_type'], 'Stock')
        self.assertEqual(found['currency'], 'USD')

    def test_search_match_without_currency_is_completed_from_details(self):
        row = instrument('ASML', 99, currency='')
        with patch('research.market.search', return_value=[instrument('ASMLF', 1), row]), \
                patch('research.market.details', return_value={'currency': 'EUR'}):
            found = resolve('ASML:xams')
        self.assertEqual(found['uic'], 99)
        self.assertEqual(found['currency'], 'EUR')

    def test_unmatched_symbol_is_none(self):
        with patch('research.market.search', return_value=[instrument('ABC', 1)]):
            self.assertIsNone(resolve('XYZ'))

    def test_search_instruments_lists_matches(self):
        with patch('research.market.search', return_value=[instrument('NVDA', 5)]):
            result = search_instruments('nvda')
        self.assertEqual(result['data']['matches'][0]['symbol'], 'NVDA')
        self.assertEqual(result['data']['matches'][0]['currency'], 'USD')

    def test_weekly_bars_with_daily_summary(self):
        daily = candles(300)
        weekly = candles(150, step=3)

        def chart(uic, asset_type, horizon, count):
            return daily if horizon == 1440 else weekly

        with patch('research.market.search', return_value=[instrument('NVDA', 5)]), \
                patch('research.market.chart', side_effect=chart):
            data = get_price_history('NVDA')['data']
        self.assertLessEqual(len(data['bars']), 104)
        closes = [c['close'] for c in daily]
        self.assertEqual(data['summary']['ma200'], sma(closes, 200)[-1])
        self.assertEqual(data['summary']['last_close'], closes[-1])
        self.assertEqual(data['summary']['high_52w'], max(c['high'] for c in daily[-252:]))
        self.assertEqual(data['summary']['change_1m_pct'], round((closes[-1] / closes[-22] - 1) * 100, 2))
        self.assertIn(data['zone'], {'stretched', 'trend', 'pullback', 'below_200', 'unclassified'})

    def test_daily_is_capped_at_260(self):
        with patch('research.market.search', return_value=[instrument('NVDA', 5)]), \
                patch('research.market.chart', return_value=candles(400)):
            data = get_price_history('NVDA', interval='daily', bars=1000)['data']
        self.assertEqual(len(data['bars']), 260)

    def test_short_history_leaves_figures_none(self):
        with patch('research.market.search', return_value=[instrument('NVDA', 5)]), \
                patch('research.market.chart', return_value=candles(30)):
            data = get_price_history('NVDA', interval='daily')['data']
        self.assertIsNone(data['summary']['ma200'])
        self.assertIsNone(data['summary']['change_1y_pct'])
        self.assertIsNone(data['zone'])

    def test_pullback_zone_carries_the_value_pillar_warning(self):
        series = candles(300, start=100, step=0.5)
        for i, c in enumerate(series[-30:]):
            price = 235 - i * 0.6
            c.update(open=price, high=price + 1, low=price - 1, close=price)
        with patch('research.market.search', return_value=[instrument('NVDA', 5)]), \
                patch('research.market.chart', return_value=series):
            result = get_price_history('NVDA', interval='daily')
        self.assertEqual(result['data']['zone'], 'pullback')
        self.assertTrue(any('Value-pillar' in w for w in result['warnings']))

    def test_disconnected_saxo_returns_warning_not_error(self):
        with patch('research.market.search', return_value=[instrument('NVDA', 5)]), \
                patch('research.market.chart', side_effect=ProviderNotConnected('x')):
            result = get_price_history('NVDA')
        self.assertIsNone(result['data'])
        self.assertIn('Saxo is not connected — reconnect in the app.', result['warnings'])

    def test_unresolvable_symbol_is_a_warning(self):
        with patch('research.market.search', return_value=[]):
            result = get_price_history('NOPE')
        self.assertIsNone(result['data'])
        self.assertTrue(any('NOPE' in w for w in result['warnings']))

    def test_quotes_group_by_asset_type_and_warn_on_unresolved(self):
        listing = [instrument('NVDA', 5), instrument('SPY', 6, asset_type='Etf')]
        calls = []

        def quotes(uics, asset_type):
            calls.append((tuple(uics), asset_type))
            return [{'uic': u, 'asset_type': asset_type, 'price': 10.0, 'change_pct': 1.5, 'change_basis': 'live'} for u in uics]

        with patch('research.market.search', side_effect=lambda q, t: [r for r in listing if r['symbol'] == q.upper()]), \
                patch('research.market.quotes', side_effect=quotes):
            result = get_quotes(['NVDA', 'SPY', 'NOPE'])
        self.assertEqual(sorted(calls), [((5,), 'Stock'), ((6,), 'Etf')])
        self.assertEqual({q['symbol'] for q in result['data']['quotes']}, {'NVDA', 'SPY'})
        self.assertTrue(any('NOPE' in w for w in result['warnings']))
