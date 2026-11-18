from datetime import date, timedelta

from django.test import SimpleTestCase

from signals.series import Series
from verdicts import yardsticks

START = date(2010, 1, 4)
CYCLE = (90.0, 95.0, 105.0, 110.0)


def sessions(count, start=START):
    days, day = [], start
    while len(days) < count:
        if day.weekday() < 5:
            days.append(day)
        day += timedelta(days=1)
    return days


def series(days, closes):
    dates = [day.isoformat() for day in days]
    return Series(dates, list(closes), list(closes), list(closes), list(closes), [1000] * len(days))


def cycling(days):
    return [CYCLE[(day - START).days // 7 % len(CYCLE)] for day in days]


def quarter_ends(first_year, last_year):
    return [
        date(year, month, 30 if month in (6, 9) else 31)
        for year in range(first_year, last_year + 1) for month in (3, 6, 9, 12)
    ]


def true_at(values):
    return [i for i, flag in enumerate(values) if flag]


class PeRangeFlagsTest(SimpleTestCase):
    def test_a_price_below_its_usual_pe_is_cheap_on_the_next_month_start_only(self):
        days = sessions(700)
        closes = cycling(days)
        drop = 650
        closes[drop:] = [60.0] * (len(days) - drop)
        eps = [(day, 1.0) for day in quarter_ends(2008, 2013)]
        flags = yardsticks.monthly_flags(series(days, closes), eps)
        month_after = next(i for i in range(drop, len(days)) if days[i].month != days[i - 1].month)
        self.assertIn(month_after, true_at(flags['pe_cheap']))
        starts = {i for i in range(1, len(days)) if days[i].month != days[i - 1].month}
        self.assertTrue(set(true_at(flags['pe_cheap'])) <= starts | {0})
        self.assertNotIn(month_after, true_at(flags['pe_expensive']))

    def test_a_quarter_ending_twenty_days_before_a_session_is_not_yet_known(self):
        days = sessions(700)
        closes = cycling(days)
        month_start = next(i for i in range(600, len(days)) if days[i].month != days[i - 1].month)
        closes[month_start] = 60.0
        loss_quarter = days[month_start] - timedelta(days=20)
        eps = [(day, 1.0) for day in quarter_ends(2008, 2013) if day < loss_quarter] + [(loss_quarter, -50.0)]
        flags = yardsticks.monthly_flags(series(days, closes), eps)
        self.assertTrue(flags['pe_cheap'][month_start])

    def test_flags_on_a_day_never_change_when_later_prices_are_added(self):
        days = sessions(1500)
        closes = [close * (1.3 if day.month % 6 < 3 else 1.0) for day, close in zip(days, cycling(days))]
        eps = [(day, 1.0) for day in quarter_ends(2006, 2016)]
        cut = 1100
        full = yardsticks.monthly_flags(series(days, closes), eps)
        early = yardsticks.monthly_flags(series(days[:cut], closes[:cut]), eps)
        for key in yardsticks.KEYS:
            self.assertEqual(full[key][:cut], early[key], key)
        self.assertTrue(any(full['pe_cheap'][:cut]) and any(full['pe_expensive'][:cut]))

    def test_a_loss_gives_no_flag(self):
        days = sessions(700)
        eps = [(day, -1.0) for day in quarter_ends(2008, 2013)]
        flags = yardsticks.monthly_flags(series(days, [50.0] * len(days)), eps)
        for key in yardsticks.KEYS:
            self.assertEqual(true_at(flags[key]), [], key)


class GrowthFlagsTest(SimpleTestCase):
    def growing(self, rate):
        return [(day, round(1.0 * (1 + rate) ** (n / 4), 4)) for n, day in enumerate(quarter_ends(2004, 2013))]

    def test_a_capped_step_is_never_expensive(self):
        days = sessions(700)
        flags = yardsticks.monthly_flags(series(days, [100000.0] * len(days)), self.growing(0.6))
        self.assertEqual(true_at(flags['growth_expensive']), [])

    def test_an_uncapped_step_far_below_the_price_is_expensive(self):
        days = sessions(700)
        flags = yardsticks.monthly_flags(series(days, [100000.0] * len(days)), self.growing(0.2))
        self.assertTrue(true_at(flags['growth_expensive']))

    def test_a_price_far_below_the_line_is_cheap(self):
        days = sessions(700)
        flags = yardsticks.monthly_flags(series(days, [1.0] * len(days)), self.growing(0.2))
        self.assertTrue(true_at(flags['growth_cheap']))


class SplitSuspectsTest(SimpleTestCase):
    def test_a_four_for_one_split_in_prices_with_unadjusted_eps_is_counted(self):
        days = sessions(700)
        closes = [100.0] * 400 + [25.0] * 300
        eps = [(day, 1.0) for day in quarter_ends(2008, 2013)]
        self.assertEqual(yardsticks.split_suspects(series(days, closes), eps), 1)
        self.assertEqual(yardsticks.split_suspects(series(days, [100.0] * 700), eps), 0)
