from django.test import SimpleTestCase

from .price_line import SPARK_POINTS, YEAR_SESSIONS, from_bars


def bars(closes, highs=None):
    highs = highs or closes
    return [[f'd{i}', c, h, c, c, 100.0] for i, (c, h) in enumerate(zip(closes, highs))]


class FromBarsTests(SimpleTestCase):
    def test_takes_one_close_a_week_ending_on_the_latest(self):
        spark, _ = from_bars(bars(range(1, 301)))
        self.assertEqual(len(spark), SPARK_POINTS)
        self.assertEqual(spark[-1], 300)
        self.assertEqual(spark[-2], 295)
        self.assertEqual(spark[0], 300 - 5 * (SPARK_POINTS - 1))

    def test_a_short_history_gives_a_shorter_line(self):
        spark, _ = from_bars(bars([10, 11, 12, 13, 14, 15, 16]))
        self.assertEqual(spark, [11, 16])

    def test_the_high_is_the_highest_intraday_high_of_the_last_year(self):
        closes = [500] + [100] * (YEAR_SESSIONS - 1) + [120]
        highs = [500] + [101] * (YEAR_SESSIONS - 1) + [130]
        _, high = from_bars(bars(closes, highs))
        self.assertEqual(high, 130)

    def test_less_than_a_year_of_bars_gives_no_high(self):
        _, high = from_bars(bars([100] * (YEAR_SESSIONS - 1)))
        self.assertIsNone(high)

    def test_no_bars_gives_no_line_and_no_high(self):
        self.assertEqual(from_bars([]), ([], None))
        self.assertEqual(from_bars(None), ([], None))

    def test_a_bar_without_a_close_is_skipped(self):
        spark, _ = from_bars([['d0', 1, 1, 1, None, 1], ['d1', 2, 2, 2, 7.0, 1]])
        self.assertEqual(spark, [7.0])
