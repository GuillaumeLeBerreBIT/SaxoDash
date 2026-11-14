from django.test import SimpleTestCase

from signals import context
from signals.series import from_bars


def series(closes, high=None):
    return from_bars([[f'd{i:04d}', close, high or close, close, close, 100] for i, close in enumerate(closes)])


class StandingTest(SimpleTestCase):
    def test_measures_the_distance_below_the_highest_high_of_the_last_year(self):
        closes = [100.0] * 100 + [200.0] + [100.0] * 199 + [150.0]
        self.assertEqual(context.standing(series(closes))['below_high_pct'], -25.0)

    def test_a_high_older_than_a_year_does_not_count(self):
        closes = [400.0] + [100.0] * 252
        self.assertEqual(context.standing(series(closes))['below_high_pct'], 0.0)

    def test_momentum_is_the_year_to_a_month_ago(self):
        closes = [100.0] * 231 + [150.0] * 22
        self.assertEqual(context.standing(series(closes))['momentum_pct'], 50.0)

    def test_too_little_history_gives_no_figures(self):
        self.assertEqual(context.standing(series([100.0] * 100)), {'below_high_pct': None, 'momentum_pct': None})
        self.assertEqual(context.standing(series([])), {'below_high_pct': None, 'momentum_pct': None})


class RankedTest(SimpleTestCase):
    MOMENTUM = {f'S{i}': float(i) for i in range(10)}

    def test_says_what_share_of_index_stocks_a_stock_is_ahead_of(self):
        ranks = context.ranked(self.MOMENTUM, set(self.MOMENTUM))
        self.assertEqual((ranks['S0'], ranks['S5'], ranks['S9']), (0, 50, 90))

    def test_a_stock_outside_the_index_is_ranked_against_it(self):
        ranks = context.ranked({**self.MOMENTUM, 'EXTRA': 4.5}, set(self.MOMENTUM))
        self.assertEqual(ranks['EXTRA'], 50)

    def test_no_momentum_or_too_few_index_stocks_gives_no_rank(self):
        self.assertIsNone(context.ranked({**self.MOMENTUM, 'NEW': None}, set(self.MOMENTUM))['NEW'])
        self.assertEqual(context.ranked({'A': 1.0, 'B': 2.0}, {'A', 'B'}), {'A': None, 'B': None})
