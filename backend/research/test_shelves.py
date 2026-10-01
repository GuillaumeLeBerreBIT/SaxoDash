from django.test import TestCase

from research import shelves
from research.models import ScreenerRow


def row(ticker, **fields):
    return ScreenerRow.objects.create(ticker=ticker, name=ticker, indexes='SP500', uic=len(ticker) * 1000 + ord(ticker[0]), status=fields.pop('status', ScreenerRow.OK), **fields)


def tickers(key):
    return [r.ticker for r in shelves.matching(shelves.by_key(key))]


class ShelfRulesTest(TestCase):
    def test_overbought_threshold_is_inclusive_and_sorted_high_first(self):
        row('AAA', rsi14=70.0)
        row('BBB', rsi14=85.0)
        row('CCC', rsi14=69.9)
        self.assertEqual(tickers('overbought'), ['BBB', 'AAA'])

    def test_oversold(self):
        row('AAA', rsi14=30.0)
        row('BBB', rsi14=12.0)
        row('CCC', rsi14=31.0)
        self.assertEqual(tickers('oversold'), ['BBB', 'AAA'])

    def test_quality_on_sale_needs_every_condition(self):
        row('GOOD', roe=20.0, net_margin=15.0, eps_growth_5y=8.0, pct_vs_ma200=-6.0)
        row('DEEP', roe=20.0, net_margin=15.0, eps_growth_5y=8.0, pct_vs_ma200=-12.0)
        row('ABOVE', roe=20.0, net_margin=15.0, eps_growth_5y=8.0, pct_vs_ma200=4.0)
        row('THIN', roe=20.0, net_margin=5.0, eps_growth_5y=8.0, pct_vs_ma200=-6.0)
        row('NOROE', net_margin=15.0, eps_growth_5y=8.0, pct_vs_ma200=-6.0)
        self.assertEqual(tickers('quality-on-sale'), ['DEEP', 'GOOD'])

    def test_strong_trend_needs_stacked_averages(self):
        row('UP', last_close=120.0, ma50=110.0, ma200=100.0, change_3m=15.0)
        row('UP2', last_close=120.0, ma50=110.0, ma200=100.0, change_3m=25.0)
        row('MIXED', last_close=105.0, ma50=110.0, ma200=100.0, change_3m=30.0)
        row('YOUNG', last_close=120.0, ma50=110.0, change_3m=40.0)
        self.assertEqual(tickers('strong-trend'), ['UP2', 'UP'])

    def test_near_high(self):
        row('AT', pct_from_52w_high=0.0)
        row('NEAR', pct_from_52w_high=-3.0)
        row('FAR', pct_from_52w_high=-3.1)
        self.assertEqual(tickers('near-high'), ['AT', 'NEAR'])

    def test_cheap_pe_excludes_negative_and_null(self):
        row('CHEAP', pe=9.0)
        row('CHEAPER', pe=6.0)
        row('LOSS', pe=-4.0)
        row('PRICEY', pe=15.0)
        row('NONE')
        self.assertEqual(tickers('cheap-pe'), ['CHEAPER', 'CHEAP'])

    def test_unusual_volume(self):
        row('HOT', rvol=3.5)
        row('WARM', rvol=2.0)
        row('COLD', rvol=1.9)
        self.assertEqual(tickers('unusual-volume'), ['HOT', 'WARM'])

    def test_only_ok_rows_qualify(self):
        row('OK', rsi14=80.0)
        row('BAD', rsi14=90.0, status=ScreenerRow.FAILED)
        row('LOST', rsi14=95.0, status=ScreenerRow.UNMATCHED)
        self.assertEqual(tickers('overbought'), ['OK'])

    def test_card_carries_the_shelf_metric(self):
        apple = row('AAPL', rsi14=77.0, last_close=230.0, change_1d=1.2, sparkline=[1.0, 2.0])
        self.assertEqual(shelves.card(apple, shelves.by_key('overbought')), {
            'ticker': 'AAPL', 'name': 'AAPL', 'uic': apple.uic, 'asset_type': 'Stock',
            'last_close': 230.0, 'change_1d': 1.2, 'metric_value': 77.0, 'sparkline': [1.0, 2.0],
        })

    def test_every_shelf_key_is_unique_and_described(self):
        keys = [shelf.key for shelf in shelves.SHELVES]
        self.assertEqual(len(keys), len(set(keys)))
        self.assertEqual(len(keys), 7)
        self.assertTrue(all(shelf.subtitle for shelf in shelves.SHELVES))
        self.assertTrue(all(shelf.empty for shelf in shelves.SHELVES))
        self.assertIsNone(shelves.by_key('nope'))
