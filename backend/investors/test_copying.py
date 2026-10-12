from datetime import date, timedelta

from django.test import SimpleTestCase, TestCase

from . import copying
from .copying import Period
from .factories import make_investor, store_quarter
from .models import CopyPerformance, PriceHistory, Security
from .prices import Series

START = date(2026, 1, 5)


def weekdays(count, start=START):
    days, day = [], start
    while len(days) < count:
        if day.weekday() < 5:
            days.append(day)
        day += timedelta(days=1)
    return days


DAYS = weekdays(30)


def series(closes, days=DAYS):
    return Series(list(days[:len(closes)]), list(closes))


def flat(close=100.0, count=len(DAYS)):
    return series([close] * count)


def ramp(first, last, count=len(DAYS)):
    step = (last - first) / (count - 1)
    return series([first + step * index for index in range(count)])


def period(filed_on, *holdings, stock_value=None):
    return Period(filed_on, list(holdings), stock_value or sum(value for _, value in holdings))


def last(result):
    return result['series'][-1]


class MeasureTest(SimpleTestCase):
    def test_nothing_filed_or_no_benchmark_is_no_measurement(self):
        self.assertIsNone(copying.measure([], {}, flat()))
        self.assertIsNone(copying.measure([period(DAYS[0], ('AAA', 100))], {'AAA': flat()}, Series([], [])))

    def test_buys_at_the_close_of_the_first_session_after_the_filing(self):
        prices = {'AAA': series([10, 50, 100, 200])}
        benchmark = series([100, 100, 100, 100])

        result = copying.measure([period(DAYS[0], ('AAA', 100))], prices, benchmark)

        self.assertEqual((result['since'], result['until']), (DAYS[1], DAYS[3]))
        self.assertEqual(result['clone_return_pct'], 300.0)
        self.assertEqual(result['benchmark_return_pct'], 0.0)

    def test_a_filing_on_a_weekend_buys_on_monday(self):
        saturday = DAYS[4] + timedelta(days=1)
        prices = {'AAA': ramp(100, 129)}

        result = copying.measure([period(saturday, ('AAA', 100))], prices, flat())

        self.assertEqual(result['since'], DAYS[5])

    def test_holdings_are_weighted_by_disclosed_value(self):
        prices = {'AAA': series([100, 100, 200]), 'BBB': series([100, 100, 100])}

        result = copying.measure([period(DAYS[0], ('AAA', 750), ('BBB', 250))], prices, flat(count=3))

        self.assertEqual(result['clone_return_pct'], 75.0)

    def test_each_filing_rebalances_into_the_new_holdings(self):
        prices = {'AAA': series([100, 100, 200, 400, 800]), 'BBB': series([10, 10, 10, 10, 15])}
        periods = [period(DAYS[0], ('AAA', 100)), period(DAYS[2], ('BBB', 100))]

        result = copying.measure(periods, prices, flat(count=5))

        self.assertEqual(result['clone_return_pct'], 500.0)
        self.assertEqual(result['periods'], 2)

    def test_the_benchmark_is_measured_over_the_same_days(self):
        benchmark = series([50, 100, 110, 121])

        result = copying.measure([period(DAYS[0], ('AAA', 100))], {'AAA': flat()}, benchmark)

        self.assertEqual(result['benchmark_return_pct'], 21.0)
        self.assertEqual(result['clone_return_pct'], 0.0)

    def test_a_holding_without_a_price_is_left_out_and_the_rest_reweighted(self):
        prices = {'AAA': series([100, 100, 150])}
        holdings = (('AAA', 600), (None, 300), ('ZZZ', 100))

        result = copying.measure([period(DAYS[0], *holdings)], prices, flat(count=3))

        self.assertEqual(result['clone_return_pct'], 50.0)
        self.assertEqual(result['coverage_pct'], 60.0)

    def test_coverage_is_measured_against_the_whole_stock_portfolio(self):
        prices = {'AAA': series([100, 100, 150])}

        result = copying.measure([period(DAYS[0], ('AAA', 600), stock_value=1000)], prices, flat(count=3))

        self.assertEqual(result['coverage_pct'], 60.0)

    def test_a_period_priced_for_less_than_half_its_holdings_sits_in_cash(self):
        prices = {'AAA': series([100, 100, 200, 200, 400]), 'BBB': series([100, 100, 100, 100, 900])}
        periods = [period(DAYS[0], ('AAA', 100)), period(DAYS[2], ('BBB', 40), ('ZZZ', 60))]

        result = copying.measure(periods, prices, flat(count=5))

        self.assertEqual(result['clone_return_pct'], 100.0)
        self.assertEqual((result['periods'], result['skipped_periods']), (1, 1))

    def test_measurement_starts_at_the_first_period_that_can_be_priced(self):
        prices = {'BBB': series([100, 100, 100, 100, 150])}
        periods = [period(DAYS[0], ('ZZZ', 100)), period(DAYS[2], ('BBB', 100))]

        result = copying.measure(periods, prices, series([100, 200, 300, 400, 500]))

        self.assertEqual(result['since'], DAYS[3])
        self.assertEqual((result['clone_return_pct'], result['benchmark_return_pct']), (50.0, 25.0))
        self.assertEqual(result['skipped_periods'], 0)

    def test_a_price_series_that_starts_after_the_purchase_day_cannot_be_bought(self):
        late = Series(DAYS[3:6], [100, 100, 100])

        result = copying.measure([period(DAYS[0], ('AAA', 100))], {'AAA': late}, flat())

        self.assertIsNone(result)

    def test_a_stale_last_price_is_not_a_purchase_price(self):
        stale = Series(DAYS[:1], [100])
        filed = DAYS[20]

        result = copying.measure([period(filed, ('AAA', 100))], {'AAA': stale}, flat())

        self.assertIsNone(result)

    def test_a_holding_that_stops_trading_keeps_its_last_price(self):
        prices = {'AAA': series([100, 100, 130])}

        result = copying.measure([period(DAYS[0], ('AAA', 100))], prices, flat(count=6))

        self.assertEqual(result['until'], DAYS[5])
        self.assertEqual(result['clone_return_pct'], 30.0)

    def test_a_filing_after_the_last_price_changes_nothing_yet(self):
        prices = {'AAA': series([100, 100, 120])}
        periods = [period(DAYS[0], ('AAA', 100)), period(DAYS[10], ('BBB', 100))]

        result = copying.measure(periods, prices, flat(count=3))

        self.assertEqual((result['clone_return_pct'], result['periods']), (20.0, 1))

    def test_the_series_starts_level_and_ends_on_the_last_session(self):
        result = copying.measure([period(DAYS[0], ('AAA', 100))], {'AAA': ramp(100, 129)}, ramp(100, 158))

        self.assertEqual(result['series'][0], [DAYS[1].isoformat(), 100.0, 100.0])
        self.assertEqual(last(result)[0], DAYS[-1].isoformat())
        self.assertLess(len(result['series']), len(DAYS))

    def test_the_series_keeps_every_rebalance_day(self):
        periods = [period(DAYS[0], ('AAA', 100)), period(DAYS[12], ('AAA', 100))]

        result = copying.measure(periods, {'AAA': ramp(100, 129)}, flat())

        self.assertIn(DAYS[13].isoformat(), [point[0] for point in result['series']])

    def test_a_span_under_a_year_is_not_annualised(self):
        result = copying.measure([period(DAYS[0], ('AAA', 100))], {'AAA': ramp(100, 129)}, flat())

        self.assertEqual((result['clone_cagr_pct'], result['benchmark_cagr_pct']), (None, None))

    def test_a_span_over_a_year_is_annualised(self):
        days = weekdays(523, date(2024, 1, 1))
        prices = {'AAA': Series(days, [100.0] * 522 + [400.0])}
        benchmark = Series(days, [100.0] * 523)

        result = copying.measure([period(days[0] - timedelta(days=1), ('AAA', 100))], prices, benchmark)

        self.assertEqual(result['clone_return_pct'], 300.0)
        self.assertAlmostEqual(result['clone_cagr_pct'], 100.0, delta=0.5)
        self.assertEqual(result['benchmark_cagr_pct'], 0.0)


class PeriodsTest(TestCase):
    Q1, Q2 = date(2026, 3, 31), date(2026, 6, 30)

    def setUp(self):
        self.investor = make_investor()
        Security.objects.create(cusip='037833100', ticker='AAPL')
        Security.objects.create(cusip='30231G102', ticker='XOM', inherited_via=Security.ALIAS)
        Security.objects.create(cusip='30233Q108', ticker='XOM')

    def test_a_period_is_a_quarters_stock_holdings_from_its_first_filing_date(self):
        store_quarter(self.investor, self.Q1, [
            ('037833100', 'APPLE INC', 10, 600), ('999999999', 'ACME', 1, 300), ('037833100', 'APPLE INC', 1, 100, 'CALL'),
        ], filed_on=date(2026, 5, 15))
        store_quarter(
            self.investor, self.Q1, [('037833100', 'APPLE INC', 10, 700), ('999999999', 'ACME', 1, 300)],
            filed_on=date(2026, 6, 1), amendment_type='RESTATEMENT',
        )

        periods = copying.periods(self.investor)

        self.assertEqual(periods, [Period(date(2026, 5, 15), [('AAPL', 700), (None, 300)], 1000)])

    def test_two_identifiers_of_one_stock_are_one_holding(self):
        store_quarter(self.investor, self.Q1, [
            ('30231G102', 'EXXON MOBIL CORP', 1, 100), ('30233Q108', 'EXXONMOBIL HOLDINGS', 1, 50),
        ])

        self.assertEqual(copying.periods(self.investor)[0].holdings, [('XOM', 150)])

    def test_only_the_largest_holdings_are_copied_but_all_count_toward_the_portfolio(self):
        rows = [(f'{index:09d}', f'ISSUER {index}', 1, 100 - index) for index in range(copying.HOLDINGS + 5)]
        store_quarter(self.investor, self.Q1, rows)

        only = copying.periods(self.investor)[0]

        self.assertEqual(len(only.holdings), copying.HOLDINGS)
        self.assertEqual(only.holdings[0], (None, 100))
        self.assertEqual(only.stock_value, sum(row[3] for row in rows))

    def test_quarters_come_oldest_first(self):
        store_quarter(self.investor, self.Q2, [('037833100', 'APPLE INC', 10, 600)], filed_on=date(2026, 8, 14))
        store_quarter(self.investor, self.Q1, [('037833100', 'APPLE INC', 10, 600)], filed_on=date(2026, 5, 15))

        self.assertEqual([p.filed_on for p in copying.periods(self.investor)], [date(2026, 5, 15), date(2026, 8, 14)])


class RebuildTest(TestCase):
    Q1 = date(2025, 12, 31)

    def setUp(self):
        self.investor = make_investor()
        Security.objects.create(cusip='037833100', ticker='AAPL')
        store_quarter(self.investor, self.Q1, [('037833100', 'APPLE INC', 10, 600)], filed_on=DAYS[0])

    def history(self, ticker, closes, status=PriceHistory.OK):
        rows = [[day.isoformat(), close] for day, close in zip(DAYS, closes)]
        return PriceHistory.objects.create(ticker=ticker, closes=rows, status=status)

    def test_stores_one_measurement_per_investor(self):
        self.history(copying.BENCHMARK_TICKER, [100, 100, 110])
        self.history('AAPL', [50, 50, 100])

        copying.rebuild(self.investor)

        stored = CopyPerformance.objects.get(investor=self.investor)
        self.assertEqual((stored.clone_return_pct, stored.benchmark_return_pct), (100.0, 10.0))
        self.assertEqual((stored.since, stored.until, stored.periods), (DAYS[1], DAYS[2], 1))
        self.assertEqual(stored.series[-1], [DAYS[2].isoformat(), 200.0, 110.0])

    def test_rebuilding_replaces_the_measurement(self):
        self.history(copying.BENCHMARK_TICKER, [100, 100, 110])
        aapl = self.history('AAPL', [50, 50, 100])
        copying.rebuild(self.investor)
        aapl.closes = [[day.isoformat(), close] for day, close in zip(DAYS, [50, 50, 75])]
        aapl.save()

        copying.rebuild(self.investor)

        self.assertEqual(CopyPerformance.objects.get().clone_return_pct, 50.0)

    def test_a_measurement_that_can_no_longer_be_made_is_removed(self):
        self.history(copying.BENCHMARK_TICKER, [100, 100, 110])
        aapl = self.history('AAPL', [50, 50, 100])
        copying.rebuild(self.investor)
        aapl.delete()

        copying.rebuild(self.investor)

        self.assertFalse(CopyPerformance.objects.exists())

    def test_a_series_that_failed_to_load_is_not_used(self):
        self.history(copying.BENCHMARK_TICKER, [100, 100, 110])
        self.history('AAPL', [50, 50, 100], status=PriceHistory.FAILED)

        copying.rebuild(self.investor)

        self.assertFalse(CopyPerformance.objects.exists())

    def test_rebuild_all_covers_every_investor(self):
        other = make_investor(cik=2, slug='other', firm='Other')
        store_quarter(other, self.Q1, [('037833100', 'APPLE INC', 10, 600)], filed_on=DAYS[0])
        self.history(copying.BENCHMARK_TICKER, [100, 100, 110])
        self.history('AAPL', [50, 50, 100])

        self.assertEqual(copying.rebuild_all(), 2)
        self.assertEqual(CopyPerformance.objects.count(), 2)
