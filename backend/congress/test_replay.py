from datetime import date

from django.test import SimpleTestCase

from investors.prices import Series

from .replay import TradeRow, dedupe, replay

D1, D2, D3, D4 = date(2025, 1, 2), date(2025, 1, 3), date(2025, 2, 3), date(2025, 2, 4)


def series(*closes):
    days = [D1, D2, D3, D4]
    return Series(days[:len(closes)], list(closes))


def row(ticker, kind='purchase', low=15001, high=50000, filed_on=D2, traded_on=D1, option='', exercise=False,
        priceable=True, amended=False):
    return TradeRow(
        filed_on=filed_on, traded_on=traded_on, ticker=ticker, kind=kind, option=option, exercise=exercise,
        amount_low=low, amount_high=high, priceable=priceable, amended=amended, asset=f'{ticker} Inc.', owner='SP',
    )


PRICES = {'NVDA': series(100, 100, 200, 200), 'AAPL': series(50, 50, 50, 50)}


def holdings(period):
    return dict(period.holdings)


class ReplayTest(SimpleTestCase):
    def test_a_purchase_is_sized_at_the_range_midpoint(self):
        result = replay([row('NVDA', low=1001, high=15000)], PRICES)
        self.assertEqual(len(result.periods), 1)
        self.assertAlmostEqual(holdings(result.periods[0])['NVDA'], 8000.5)

    def test_holdings_are_valued_at_the_filing_date_close(self):
        result = replay([row('NVDA', low=100, high=100, filed_on=D3)], PRICES)
        self.assertAlmostEqual(holdings(result.periods[0])['NVDA'], 200)

    def test_a_partial_sale_is_capped_at_what_is_held(self):
        rows = [row('AAPL', low=1000, high=1000), row('AAPL', kind='partial_sale', low=5000, high=5000, filed_on=D3, traded_on=D3)]
        result = replay(rows, PRICES)
        self.assertNotIn('AAPL', holdings(result.periods[-1]))

    def test_a_full_sale_closes_the_position(self):
        rows = [row('AAPL', low=1000, high=1000), row('AAPL', kind='sale', low=1, high=1, filed_on=D3, traded_on=D3)]
        self.assertNotIn('AAPL', holdings(replay(rows, PRICES).periods[-1]))

    def test_a_sale_of_something_never_seen_bought_is_counted_not_applied(self):
        result = replay([row('AAPL', kind='sale')], PRICES)
        self.assertEqual(result.basis['unseen_sales'], 1)
        self.assertEqual(holdings(result.periods[0]), {})

    def test_a_call_counts_as_the_underlying_and_a_put_is_ignored(self):
        rows = [row('NVDA', option='call', low=100, high=100), row('AAPL', option='put', low=100, high=100)]
        self.assertEqual(set(holdings(replay(rows, PRICES).periods[0])), {'NVDA'})

    def test_exercise_replaces_the_call_position(self):
        rows = [
            row('NVDA', option='call', low=100, high=100),
            row('NVDA', exercise=True, low=1000, high=1000, filed_on=D3, traded_on=D3),
        ]
        self.assertAlmostEqual(holdings(replay(rows, PRICES).periods[-1])['NVDA'], 1000)

    def test_unpriceable_and_unpriced_trades_are_counted(self):
        rows = [row(None, priceable=False), row('ZZZZ')]
        basis = replay(rows, PRICES).basis
        self.assertEqual((basis['trades'], basis['unpriced']), (2, 2))

    def test_one_period_per_filing_date(self):
        rows = [row('NVDA'), row('AAPL'), row('AAPL', filed_on=D3, traded_on=D3)]
        self.assertEqual([period.filed_on for period in replay(rows, PRICES).periods], [D2, D3])


class DedupeTest(SimpleTestCase):
    def test_amended_duplicate_counts_once_at_the_first_filing(self):
        original = row('NVDA', filed_on=D2)
        amended = row('NVDA', filed_on=D3, amended=True)
        kept = dedupe([original, amended])
        self.assertEqual(len(kept), 1)
        self.assertTrue(kept[0].amended)
        self.assertEqual(kept[0].filed_on, D2)

    def test_two_different_trades_are_both_kept(self):
        self.assertEqual(len(dedupe([row('NVDA'), row('NVDA', kind='partial_sale')])), 2)
