from django.test import TestCase

from research import shelves
from research.models import ScreenerRow
from research.screener_fields import FIELDS


def row(ticker, **fields):
    return ScreenerRow.objects.create(ticker=ticker, name=ticker, indexes='SP500', uic=len(ticker) * 1000 + ord(ticker[0]), status=fields.pop('status', ScreenerRow.OK), **fields)


def tickers(key):
    return [r.ticker for r in shelves.matching(shelves.by_key(key))]


def profitable(ticker, **overrides):
    fields = dict(roe=20.0, net_margin=15.0, eps_growth_5y=8.0, pct_vs_ma200=-6.0, market_cap=500.0)
    fields.update(overrides)
    return row(ticker, **fields)


class ShelfRulesTest(TestCase):
    def test_overbought_threshold_is_inclusive_and_sorted_high_first(self):
        row('AAA', rsi14=70.0)
        row('BBB', rsi14=85.0)
        row('CCC', rsi14=69.9)
        self.assertEqual(tickers('overbought'), ['BBB', 'AAA'])

    def test_oversold_threshold_is_inclusive_and_sorted_low_first(self):
        row('AAA', rsi14=30.0)
        row('BBB', rsi14=12.0)
        row('CCC', rsi14=31.0)
        self.assertEqual(tickers('oversold'), ['BBB', 'AAA'])

    def test_profitable_below_200d_needs_every_condition_and_lists_largest_first(self):
        profitable('GOOD')
        profitable('BIG', market_cap=900.0, pct_vs_ma200=-2.0)
        profitable('ABOVE', pct_vs_ma200=4.0)
        profitable('THIN', net_margin=5.0)
        profitable('NOROE', roe=None)
        profitable('SHRINK', eps_growth_5y=0.0)
        self.assertEqual(tickers('profitable-below-200d'), ['BIG', 'GOOD'])

    def test_a_null_sort_value_excludes_the_row(self):
        profitable('SIZED')
        profitable('UNSIZED', market_cap=None)
        self.assertEqual(tickers('profitable-below-200d'), ['SIZED'])

    def test_above_moving_averages_needs_stacked_averages_and_lists_furthest_above_first(self):
        row('UP', last_close=120.0, ma50=110.0, ma200=100.0, pct_vs_ma200=20.0)
        row('UP2', last_close=130.0, ma50=110.0, ma200=100.0, pct_vs_ma200=30.0)
        row('MIXED', last_close=105.0, ma50=110.0, ma200=100.0, pct_vs_ma200=5.0)
        row('CROSS', last_close=120.0, ma50=95.0, ma200=100.0, pct_vs_ma200=20.0)
        row('YOUNG', last_close=120.0, ma50=110.0)
        self.assertEqual(tickers('above-moving-averages'), ['UP2', 'UP'])

    def test_a_null_card_field_does_not_exclude_the_row(self):
        listed = row('UP', last_close=120.0, ma50=110.0, ma200=100.0, pct_vs_ma200=20.0)
        self.assertEqual(tickers('above-moving-averages'), ['UP'])
        reasons = shelves.card(listed, shelves.by_key('above-moving-averages'))['reasons']
        self.assertEqual([(r['field'], r['value']) for r in reasons], [('pct_vs_ma200', 20.0), ('pct_from_52w_high', None)])

    def test_pe_under_15_excludes_negative_and_null_and_lists_lowest_first(self):
        row('LOW', pe=9.0)
        row('LOWER', pe=6.0)
        row('LOSS', pe=-4.0)
        row('EDGE', pe=15.0)
        row('NONE')
        self.assertEqual(tickers('pe-under-15'), ['LOWER', 'LOW'])

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


class ShelfTextTest(TestCase):
    def subtitle(self, key):
        return shelves.subtitle(shelves.by_key(key))

    def test_a_single_threshold(self):
        self.assertEqual(self.subtitle('oversold'), 'RSI 14 ≤ 30')
        self.assertEqual(self.subtitle('unusual-volume'), 'Relative volume ≥ 2×')

    def test_every_criterion_is_listed_with_its_unit(self):
        self.assertEqual(
            self.subtitle('profitable-below-200d'),
            'ROE ≥ 15% · Net margin ≥ 10% · 5-year EPS growth > 0% · Price vs 200-day MA < 0%',
        )

    def test_a_lower_and_upper_bound_on_one_field_read_as_a_range(self):
        self.assertEqual(self.subtitle('pe-under-15'), '0 < P/E < 15')

    def test_a_field_compared_to_a_field_names_both(self):
        self.assertEqual(self.subtitle('above-moving-averages'), 'Close > 50-day MA · 50-day MA > 200-day MA')

    def test_order_names_the_sort_field_and_direction(self):
        self.assertEqual(shelves.order(shelves.by_key('oversold')), 'Ordered by RSI 14, lowest first')
        self.assertEqual(shelves.order(shelves.by_key('profitable-below-200d')), 'Ordered by market cap, highest first')

    def test_card_reasons_follow_card_fields_with_short_labels(self):
        stock = profitable('ACME', last_close=50.0, change_1d=-1.5, sector='Industrials', sparkline=[1.0, 2.0])
        self.assertEqual(shelves.card(stock, shelves.by_key('profitable-below-200d')), {
            'ticker': 'ACME', 'name': 'ACME', 'uic': stock.uic, 'asset_type': 'Stock', 'sector': 'Industrials',
            'last_close': 50.0, 'change_1d': -1.5, 'sparkline': [1.0, 2.0],
            'reasons': [
                {'field': 'roe', 'label': 'ROE', 'value': 20.0, 'format': 'pct'},
                {'field': 'net_margin', 'label': 'Margin', 'value': 15.0, 'format': 'pct'},
                {'field': 'eps_growth_5y', 'label': 'EPS 5Y', 'value': 8.0, 'format': 'signed_pct'},
                {'field': 'pct_vs_ma200', 'label': 'vs 200D', 'value': -6.0, 'format': 'signed_pct'},
            ],
        })


class CatalogueTest(TestCase):
    def test_keys_are_unique_and_retired_keys_are_gone(self):
        keys = [shelf.key for shelf in shelves.SHELVES]
        self.assertEqual(keys, [
            'oversold', 'overbought', 'above-moving-averages', 'unusual-volume',
            'profitable-below-200d', 'pe-under-15',
        ])
        for retired in ('quality-on-sale', 'cheap-pe', 'strong-trend', 'near-high', 'nope'):
            self.assertIsNone(shelves.by_key(retired))

    def test_shelves_follow_group_order(self):
        group_keys = [key for key, _ in shelves.GROUPS]
        positions = [group_keys.index(shelf.group) for shelf in shelves.SHELVES]
        self.assertEqual(positions, sorted(positions))

    def test_cards_show_between_one_and_four_values(self):
        for shelf in shelves.SHELVES:
            self.assertTrue(1 <= len(shelf.card_fields) <= 4, shelf.key)

    def test_every_field_a_lens_uses_is_described(self):
        for shelf in shelves.SHELVES:
            used = {shelf.sort, *shelf.card_fields}
            for criterion in shelf.criteria:
                used.update(criterion.fields)
            self.assertLessEqual(used, set(FIELDS), shelf.key)
