import math
import statistics
from datetime import date, timedelta
from unittest.mock import patch, sentinel

from django.test import TestCase, override_settings
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from portfolio.account_performance import GrowthSeries
from research.providers import ProviderNotConnected
from users.testing import the_owner

from . import benchmarks, history, metrics, report

# The real cache is Redis (see CACHES in settings), shared with whatever else
# is running against it - a prior live call can leave a benchmark's chart data
# cached and answer market.chart() before active_credential() is ever reached,
# masking exactly the SaxoNotConnected path these views are meant to handle.
LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}

TRADING_DAYS = 252
USER = sentinel.user


class DailyReturnsTest(TestCase):
    def test_computes_simple_returns_between_consecutive_values(self):
        returns = metrics.daily_returns([100, 110, 99])
        self.assertAlmostEqual(returns[0], 0.10)
        self.assertAlmostEqual(returns[1], -0.1)

    def test_fewer_than_two_values_yields_no_returns(self):
        self.assertEqual(metrics.daily_returns([100]), [])
        self.assertEqual(metrics.daily_returns([]), [])


class AnnualizedVolatilityTest(TestCase):
    def test_matches_the_annualised_stdev_formula(self):
        returns = [0.01, -0.02, 0.015, -0.005, 0.03]
        expected = statistics.stdev(returns) * math.sqrt(TRADING_DAYS) * 100
        self.assertAlmostEqual(metrics.annualized_volatility(returns), expected)

    def test_needs_at_least_two_returns(self):
        self.assertIsNone(metrics.annualized_volatility([0.01]))
        self.assertIsNone(metrics.annualized_volatility([]))


class ExpectedAnnualReturnTest(TestCase):
    def test_matches_the_annualised_mean_return(self):
        returns = [0.01, -0.02, 0.015, -0.005, 0.03]
        expected = statistics.mean(returns) * TRADING_DAYS * 100
        self.assertAlmostEqual(metrics.expected_annual_return(returns), expected)

    def test_needs_at_least_two_returns(self):
        self.assertIsNone(metrics.expected_annual_return([0.01]))
        self.assertIsNone(metrics.expected_annual_return([]))


class SharpeRatioTest(TestCase):
    def test_matches_the_annualised_sharpe_formula(self):
        returns = [0.01, -0.02, 0.015, -0.005, 0.03]
        risk_free = 0.02
        mean = statistics.mean(returns)
        stdev = statistics.stdev(returns)
        expected = (mean * TRADING_DAYS - risk_free) / (stdev * math.sqrt(TRADING_DAYS))
        self.assertAlmostEqual(metrics.sharpe_ratio(returns, risk_free), expected)

    def test_zero_volatility_has_no_sharpe(self):
        self.assertIsNone(metrics.sharpe_ratio([0.0, 0.0, 0.0], risk_free_annual=0.02))


class SortinoRatioTest(TestCase):
    def test_matches_the_downside_deviation_formula(self):
        returns = [0.01, -0.02, 0.015, -0.005, 0.03]
        risk_free = 0.02
        downside = [r for r in returns if r < 0]
        downside_dev = math.sqrt(sum(r ** 2 for r in downside) / len(returns))
        mean = statistics.mean(returns)
        expected = (mean * TRADING_DAYS - risk_free) / (downside_dev * math.sqrt(TRADING_DAYS))
        self.assertAlmostEqual(metrics.sortino_ratio(returns, risk_free), expected)

    def test_no_downside_periods_has_no_sortino(self):
        self.assertIsNone(metrics.sortino_ratio([0.01, 0.02, 0.03], risk_free_annual=0.02))


class DrawdownSeriesTest(TestCase):
    def test_tracks_decline_from_the_running_peak(self):
        dd = metrics.drawdown_series([100, 120, 90, 108, 60])
        self.assertAlmostEqual(dd[0], 0.0)
        self.assertAlmostEqual(dd[1], 0.0)
        self.assertAlmostEqual(dd[2], -25.0)
        self.assertAlmostEqual(dd[3], -10.0)
        self.assertAlmostEqual(dd[4], -50.0)

    def test_empty_series_has_no_drawdown(self):
        self.assertEqual(metrics.drawdown_series([]), [])


class MonthlyReturnsTest(TestCase):
    def test_returns_one_pct_change_per_month_boundary(self):
        dated = [
            (date(2026, 1, 31), 100),
            (date(2026, 2, 28), 110),
            (date(2026, 3, 31), 99),
        ]
        monthly = metrics.monthly_returns(dated)
        self.assertEqual(len(monthly), 2)
        self.assertEqual(monthly[0]['year'], 2026)
        self.assertEqual(monthly[0]['month'], 2)
        self.assertAlmostEqual(monthly[0]['pct'], 10.0)
        self.assertEqual(monthly[1]['month'], 3)
        self.assertAlmostEqual(monthly[1]['pct'], -10.0)

    def test_uses_the_last_value_seen_in_each_month(self):
        dated = [
            (date(2026, 1, 15), 90),
            (date(2026, 1, 31), 100),
            (date(2026, 2, 28), 110),
        ]
        monthly = metrics.monthly_returns(dated)
        self.assertEqual(len(monthly), 1)
        self.assertAlmostEqual(monthly[0]['pct'], 10.0)


class BestWorstMonthTest(TestCase):
    def test_finds_the_extremes(self):
        monthly = [
            {'year': 2026, 'month': 1, 'pct': 5.0},
            {'year': 2026, 'month': 2, 'pct': -8.0},
            {'year': 2026, 'month': 3, 'pct': 2.0},
        ]
        best, worst = metrics.best_worst_month(monthly)
        self.assertEqual(best['month'], 1)
        self.assertEqual(worst['month'], 2)

    def test_no_months_yields_none(self):
        self.assertEqual(metrics.best_worst_month([]), (None, None))


class GrowthSeriesTest(TestCase):
    def test_indexes_both_lines_to_100_from_the_first_portfolio_day(self):
        port = [(date(2026, 1, 5), 200), (date(2026, 1, 6), 220), (date(2026, 1, 7), 180)]
        bench = [(date(2026, 1, 2), 40), (date(2026, 1, 5), 50), (date(2026, 1, 7), 55)]
        self.assertEqual(metrics.growth_series(port, bench), [
            {'date': '2026-01-05', 'portfolio': 100.0, 'benchmark': 100.0},
            {'date': '2026-01-06', 'portfolio': 110.0, 'benchmark': 100.0},
            {'date': '2026-01-07', 'portfolio': 90.0, 'benchmark': 110.0},
        ])

    def test_the_index_is_blank_until_it_has_a_close(self):
        port = [(date(2026, 1, 5), 100), (date(2026, 1, 6), 110)]
        bench = [(date(2026, 1, 6), 10)]
        series = metrics.growth_series(port, bench)
        self.assertEqual([row['benchmark'] for row in series], [None, 100.0])

    def test_no_index_gives_the_portfolio_line_alone(self):
        series = metrics.growth_series([(date(2026, 1, 5), 100), (date(2026, 1, 6), 105)], [])
        self.assertEqual([row['benchmark'] for row in series], [None, None])
        self.assertEqual(series[1]['portfolio'], 105.0)

    def test_too_little_history_is_empty(self):
        self.assertEqual(metrics.growth_series([(date(2026, 1, 5), 100)], []), [])

    def test_the_performance_summary_carries_it(self):
        port = synthetic_series(8)
        summary = metrics.performance_summary(port, benchmark_series(8))
        self.assertEqual(len(summary['growth']), len(port))
        self.assertEqual(summary['growth'][0]['portfolio'], 100.0)


class PositiveMonthsPctTest(TestCase):
    def test_computes_the_share_that_were_positive(self):
        monthly = [{'pct': 5.0}, {'pct': -1.0}, {'pct': 0.0}, {'pct': 3.0}]
        self.assertAlmostEqual(metrics.positive_months_pct(monthly), 50.0)

    def test_no_months_yields_none(self):
        self.assertIsNone(metrics.positive_months_pct([]))


class AnnualizeTest(TestCase):
    def test_matches_the_compound_annual_growth_formula(self):
        # 33.1% total over 3 years -> 10% a year
        expected = (1.10 ** 3 - 1) * 100
        self.assertAlmostEqual(metrics.annualize(expected, 3), 10.0)

    def test_no_total_return_reports_no_data(self):
        self.assertIsNone(metrics.annualize(None, 3))


class CalendarYearReturnsTest(TestCase):
    def test_each_year_runs_from_the_previous_year_end_on_both_sides(self):
        port = [
            (date(2025, 1, 2), 100), (date(2025, 12, 31), 110),
            (date(2026, 1, 2), 111), (date(2026, 3, 2), 121),
        ]
        bench = [
            (date(2025, 1, 2), 50), (date(2025, 12, 31), 52),
            (date(2026, 1, 2), 52), (date(2026, 3, 2), 54),
        ]
        years = metrics.calendar_year_returns(port, bench)

        self.assertEqual([y['year'] for y in years], [2025, 2026])
        self.assertAlmostEqual(years[0]['portfolio_pct'], (110 / 100 - 1) * 100)
        self.assertAlmostEqual(years[0]['benchmark_pct'], (52 / 50 - 1) * 100)
        self.assertAlmostEqual(years[1]['portfolio_pct'], (121 / 110 - 1) * 100)
        self.assertAlmostEqual(years[1]['benchmark_pct'], (54 / 52 - 1) * 100)
        self.assertTrue(years[1]['partial'])

    def test_the_first_year_is_compared_only_from_the_day_the_account_opened(self):
        port = [(date(2025, 2, 13), 100), (date(2025, 12, 31), 103)]
        bench = [(date(2025, 1, 2), 40), (date(2025, 2, 13), 50), (date(2025, 12, 31), 51)]
        years = metrics.calendar_year_returns(port, bench)

        self.assertAlmostEqual(years[0]['benchmark_pct'], (51 / 50 - 1) * 100)
        self.assertTrue(years[0]['partial'])

    def test_years_before_the_account_existed_are_left_out(self):
        port = [(date(2025, 2, 13), 100), (date(2025, 12, 31), 103)]
        bench = [(date(2023, 1, 3), 30), (date(2023, 12, 29), 35), (date(2025, 2, 13), 50), (date(2025, 12, 31), 51)]
        self.assertEqual([y['year'] for y in metrics.calendar_year_returns(port, bench)], [2025])

    def test_a_year_with_one_point_reports_no_data_for_that_year(self):
        port = [(date(2025, 6, 1), 100)]
        years = metrics.calendar_year_returns(port, [])
        self.assertIsNone(years[0]['portfolio_pct'])
        self.assertIsNone(years[0]['benchmark_pct'])


class PerformanceSummaryTest(TestCase):
    def _row(self, summary, label):
        return next(row for row in summary['periods'] if row['label'] == label)

    def test_includes_alpha_as_the_difference_between_portfolio_and_benchmark(self):
        port = [(date(2026, 1, i), 100 + i) for i in range(1, 32)]
        bench = [(date(2026, 1, i), 50 + i * 0.4) for i in range(1, 32)]

        summary = metrics.performance_summary(port, bench)

        labels = [row['label'] for row in summary['periods']]
        self.assertIn('1 month', labels)
        self.assertIn('Year to date', labels)
        self.assertIn('Since inception', labels)

        one_month = next(row for row in summary['periods'] if row['label'] == '1 month')
        self.assertAlmostEqual(
            one_month['alpha_pct'], one_month['portfolio_pct'] - one_month['benchmark_pct']
        )
        self.assertEqual(len(summary['calendar_years']), 1)

    def test_a_missing_side_reports_no_alpha_rather_than_a_wrong_number(self):
        port = [(date(2026, 1, i), 100 + i) for i in range(1, 32)]
        summary = metrics.performance_summary(port, [])
        one_month = next(row for row in summary['periods'] if row['label'] == '1 month')
        self.assertIsNotNone(one_month['portfolio_pct'])
        self.assertIsNone(one_month['benchmark_pct'])
        self.assertIsNone(one_month['alpha_pct'])

    def test_eight_days_of_history_leaves_every_trailing_period_empty(self):
        summary = metrics.performance_summary(synthetic_series(8), benchmark_series(8))

        self.assertEqual(summary['history_days'], 8)
        for label, missing in [
            ('1 month', 22), ('3 months', 83), ('1 year', 357),
            ('3 years (ann.)', 1087), ('5 years (ann.)', 1817),
        ]:
            row = self._row(summary, label)
            self.assertIsNone(row['portfolio_pct'], label)
            self.assertIsNone(row['benchmark_pct'], label)
            self.assertIsNone(row['alpha_pct'], label)
            self.assertEqual(row['needs_days'], missing, label)

    def test_eight_days_of_history_still_reports_since_inception_unannualised(self):
        port = synthetic_series(8)
        summary = metrics.performance_summary(port, benchmark_series(8))

        inception = self._row(summary, 'Since inception')
        self.assertAlmostEqual(
            inception['portfolio_pct'], (float(port[-1][1]) / float(port[0][1]) - 1) * 100
        )
        self.assertFalse(inception['annualised'])
        self.assertEqual(inception['needs_days'], 0)

    def test_year_to_date_is_empty_when_tracking_began_after_new_year(self):
        summary = metrics.performance_summary(synthetic_series(8), benchmark_series(8))
        ytd = self._row(summary, 'Year to date')
        self.assertIsNone(ytd['portfolio_pct'])
        self.assertIsNone(ytd['needs_days'])

    def test_year_to_date_runs_from_the_previous_year_end_like_the_calendar_year(self):
        port = [(date(2025, 6, 2), 90), (date(2025, 12, 31), 100), (date(2026, 1, 2), 104), (date(2026, 3, 2), 110)]
        bench = [(date(2025, 6, 2), 45), (date(2025, 12, 31), 50), (date(2026, 1, 2), 51), (date(2026, 3, 2), 52)]
        summary = metrics.performance_summary(port, bench)
        ytd = self._row(summary, 'Year to date')
        self.assertAlmostEqual(ytd['portfolio_pct'], 10.0)
        self.assertAlmostEqual(ytd['benchmark_pct'], 4.0)
        self.assertAlmostEqual(summary['calendar_years'][-1]['portfolio_pct'], ytd['portfolio_pct'])

    def test_a_period_appears_exactly_when_history_reaches_it(self):
        short = metrics.performance_summary(synthetic_series(29), benchmark_series(29))
        exact = metrics.performance_summary(synthetic_series(30), benchmark_series(30))

        self.assertIsNone(self._row(short, '1 month')['portfolio_pct'])
        self.assertEqual(self._row(short, '1 month')['needs_days'], 1)
        self.assertIsNotNone(self._row(exact, '1 month')['portfolio_pct'])
        self.assertEqual(self._row(exact, '1 month')['needs_days'], 0)

    def test_four_hundred_days_fills_one_year_but_not_the_annualised_periods(self):
        summary = metrics.performance_summary(synthetic_series(400), benchmark_series(400))

        one_year = self._row(summary, '1 year')
        self.assertIsNotNone(one_year['portfolio_pct'])
        self.assertIsNotNone(one_year['alpha_pct'])
        self.assertFalse(one_year['annualised'])
        self.assertIsNone(self._row(summary, '3 years (ann.)')['portfolio_pct'])
        self.assertEqual(self._row(summary, '3 years (ann.)')['needs_days'], 695)
        self.assertIsNone(self._row(summary, '5 years (ann.)')['portfolio_pct'])

    def test_three_years_of_history_annualises_the_three_year_row(self):
        port = synthetic_series(1095)
        summary = metrics.performance_summary(port, benchmark_series(1095))

        three_years = self._row(summary, '3 years (ann.)')
        total = (float(port[-1][1]) / float(port[0][1]) - 1) * 100
        self.assertTrue(three_years['annualised'])
        self.assertAlmostEqual(three_years['portfolio_pct'], metrics.annualize(total, 3))

    def test_a_longer_benchmark_is_compared_only_over_the_portfolios_own_window(self):
        port = synthetic_series(40)
        base = date(2024, 1, 1)
        bench = [(base + timedelta(days=i), 1000 + i) for i in range(800)]

        summary = metrics.performance_summary(port, bench)

        def bench_at(day):
            return 1000 + (day - base).days

        start, end = port[0][0], port[-1][0]
        inception = self._row(summary, 'Since inception')
        self.assertAlmostEqual(inception['benchmark_pct'], (bench_at(end) / bench_at(start) - 1) * 100)
        one_month = self._row(summary, '1 month')
        month_start = end - timedelta(days=30)
        self.assertAlmostEqual(one_month['benchmark_pct'], (bench_at(end) / bench_at(month_start) - 1) * 100)
        self.assertAlmostEqual(
            inception['alpha_pct'], inception['portfolio_pct'] - inception['benchmark_pct']
        )

    def test_a_benchmark_that_starts_after_the_portfolio_gives_no_alpha(self):
        port = synthetic_series(40)
        late_bench = benchmark_series(10, start=SERIES_START + timedelta(days=30))

        summary = metrics.performance_summary(port, late_bench)

        inception = self._row(summary, 'Since inception')
        self.assertIsNotNone(inception['portfolio_pct'])
        self.assertIsNone(inception['benchmark_pct'])
        self.assertIsNone(inception['alpha_pct'])

    def test_no_history_leaves_everything_empty(self):
        summary = metrics.performance_summary([], [])
        self.assertEqual(summary['history_days'], 0)
        self.assertTrue(all(row['portfolio_pct'] is None for row in summary['periods']))
        self.assertEqual(self._row(summary, 'Since inception')['needs_days'], 1)


class RiskSummaryTest(TestCase):
    def test_insufficient_history_reports_no_data_rather_than_zeros(self):
        summary = metrics.risk_summary([(date(2026, 1, 1), 100)], risk_free_annual=0.02)
        self.assertFalse(summary['has_data'])
        self.assertIsNone(summary['volatility'])
        self.assertEqual(summary['drawdown_series'], [])
        self.assertIsNone(summary['data_quality'])

    def test_enough_history_produces_real_numbers(self):
        summary = metrics.risk_summary(synthetic_series(40), risk_free_annual=0.02)

        self.assertTrue(summary['has_data'])
        self.assertIsNotNone(summary['volatility'])
        self.assertEqual(len(summary['drawdown_series']), 41)
        self.assertEqual(summary['drawdown_series'][0]['date'], '2025-03-03')
        self.assertEqual(summary['risk_free_annual'], 0.02)

    def test_eight_days_withholds_every_annualised_statistic(self):
        summary = metrics.risk_summary(synthetic_series(8), risk_free_annual=0.02)

        self.assertTrue(summary['has_data'])
        self.assertEqual(summary['history_days'], 8)
        for key in ('expected_return', 'volatility', 'sharpe', 'sortino'):
            self.assertIsNone(summary[key], key)
        self.assertEqual(summary['needs_days']['volatility'], 22)
        self.assertEqual(summary['needs_days']['sharpe'], 357)
        self.assertIsNotNone(summary['max_drawdown'])
        self.assertEqual(len(summary['drawdown_series']), 9)

    def test_eight_days_withholds_the_monthly_statistics(self):
        summary = metrics.risk_summary(synthetic_series(8), risk_free_annual=0.02)

        self.assertIsNone(summary['best_month'])
        self.assertIsNone(summary['worst_month'])
        self.assertIsNone(summary['positive_months_pct'])
        self.assertEqual(summary['needs_days']['monthly_stats'], 81)

    def test_eight_days_keeps_the_projection_inputs_but_marks_them_unreliable(self):
        summary = metrics.risk_summary(synthetic_series(8), risk_free_annual=0.02)

        self.assertFalse(summary['inputs_reliable'])
        self.assertIsNotNone(summary['projection_inputs']['expected_return'])
        self.assertIsNotNone(summary['projection_inputs']['volatility'])

    def test_volatility_appears_exactly_at_thirty_days_but_sharpe_does_not(self):
        short = metrics.risk_summary(synthetic_series(29), risk_free_annual=0.02)
        exact = metrics.risk_summary(synthetic_series(30), risk_free_annual=0.02)

        self.assertIsNone(short['volatility'])
        self.assertIsNotNone(exact['volatility'])
        self.assertEqual(exact['needs_days']['volatility'], 0)
        self.assertIsNone(exact['sharpe'])

    def test_a_full_year_fills_every_statistic_and_trusts_the_projection(self):
        summary = metrics.risk_summary(synthetic_series(365), risk_free_annual=0.02)

        for key in ('expected_return', 'volatility', 'sharpe', 'sortino'):
            self.assertIsNotNone(summary[key], key)
        self.assertTrue(all(missing == 0 for key, missing in summary['needs_days'].items() if key != 'monthly_stats'))
        self.assertTrue(summary['inputs_reliable'])
        self.assertEqual(summary['projection_inputs']['expected_return'], summary['expected_return'])

    def test_four_hundred_days_has_monthly_statistics(self):
        summary = metrics.risk_summary(synthetic_series(400), risk_free_annual=0.02)

        self.assertIsNotNone(summary['best_month'])
        self.assertIsNotNone(summary['worst_month'])
        self.assertIsNotNone(summary['positive_months_pct'])
        self.assertEqual(summary['needs_days']['monthly_stats'], 0)

    def test_two_complete_months_are_enough_for_the_monthly_statistics(self):
        dated = [(date(2026, 1, 31), 100), (date(2026, 2, 27), 110), (date(2026, 3, 31), 99)]
        summary = metrics.risk_summary(dated, risk_free_annual=0.02)

        self.assertAlmostEqual(summary['best_month']['pct'], 10.0)
        self.assertAlmostEqual(summary['worst_month']['pct'], -10.0)
        self.assertAlmostEqual(summary['positive_months_pct'], 50.0)

    def test_a_partial_latest_month_does_not_count_as_a_complete_one(self):
        dated = [(date(2026, 1, 31), 100), (date(2026, 2, 27), 110), (date(2026, 3, 20), 99)]
        summary = metrics.risk_summary(dated, risk_free_annual=0.02)

        self.assertEqual(len(summary['monthly_returns']), 2)
        self.assertIsNone(summary['best_month'])
        self.assertIsNone(summary['positive_months_pct'])
        self.assertEqual(summary['needs_days']['monthly_stats'], 11)

    def test_no_data_branch_carries_the_new_keys(self):
        summary = metrics.risk_summary([], risk_free_annual=0.02)

        self.assertFalse(summary['has_data'])
        self.assertEqual(summary['history_days'], 0)
        self.assertFalse(summary['inputs_reliable'])
        self.assertEqual(summary['projection_inputs'], {'expected_return': None, 'volatility': None})
        self.assertIsNone(summary['needs_days']['monthly_stats'])
        self.assertEqual(summary['needs_days']['volatility'], 30)

    def test_data_quality_is_low_below_twenty_points(self):
        # 5 points: has_data (>=2) but far short of a statistically stable
        # annualized volatility/Sharpe estimate (~20 trading days minimum).
        dated = [(date(2026, 1, i), v) for i, v in enumerate([100, 102, 101, 105, 103], start=1)]
        summary = metrics.risk_summary(dated, risk_free_annual=0.02)
        self.assertEqual(summary['data_quality'], 'low')
        self.assertEqual(summary['sample_size'], 5)

    def test_data_quality_is_medium_between_twenty_and_252_points(self):
        dated = [(date(2026, 1, 1) + timedelta(days=i), 100 + i) for i in range(30)]
        summary = metrics.risk_summary(dated, risk_free_annual=0.02)
        self.assertEqual(summary['data_quality'], 'medium')

    def test_data_quality_is_high_at_252_points_or_more(self):
        dated = [(date(2026, 1, 1) + timedelta(days=i), 100 + i) for i in range(260)]
        summary = metrics.risk_summary(dated, risk_free_annual=0.02)
        self.assertEqual(summary['data_quality'], 'high')


class BetaTest(TestCase):
    def test_matches_the_covariance_over_variance_formula(self):
        port = [0.01, -0.02, 0.015, -0.005, 0.03]
        bench = [0.008, -0.015, 0.012, -0.003, 0.025]
        pm, bm = statistics.mean(port), statistics.mean(bench)
        cov = sum((p - pm) * (b - bm) for p, b in zip(port, bench)) / (len(port) - 1)
        expected = cov / statistics.variance(bench)
        self.assertAlmostEqual(metrics.beta(port, bench), expected)

    def test_zero_benchmark_variance_has_no_beta(self):
        self.assertIsNone(metrics.beta([0.01, 0.02], [0.0, 0.0]))


class TrackingErrorTest(TestCase):
    def test_matches_the_stdev_of_active_returns(self):
        port = [0.01, -0.02, 0.015, -0.005, 0.03]
        bench = [0.008, -0.015, 0.012, -0.003, 0.025]
        active = [p - b for p, b in zip(port, bench)]
        expected = statistics.stdev(active) * math.sqrt(TRADING_DAYS) * 100
        self.assertAlmostEqual(metrics.tracking_error(port, bench), expected)


class InformationRatioTest(TestCase):
    def test_matches_the_alpha_over_tracking_error_formula(self):
        self.assertAlmostEqual(metrics.information_ratio(12.0, 8.0, 5.0), 0.8)

    def test_zero_or_missing_tracking_error_has_no_information_ratio(self):
        self.assertIsNone(metrics.information_ratio(12.0, 8.0, 0))
        self.assertIsNone(metrics.information_ratio(12.0, 8.0, None))


class JensenAlphaTest(TestCase):
    def test_matches_the_capm_formula(self):
        expected = 12.0 - (2.0 + 1.2 * (8.0 - 2.0))
        self.assertAlmostEqual(metrics.jensen_alpha(12.0, 8.0, 1.2, 0.02), expected)

    def test_no_beta_has_no_alpha(self):
        self.assertIsNone(metrics.jensen_alpha(12.0, 8.0, None, 0.02))


class BenchmarkSummaryTest(TestCase):
    def test_insufficient_overlap_reports_no_data(self):
        port = [(date(2026, 1, 1), 100)]
        bench = [(date(2026, 1, 1), 50)]
        summary = metrics.benchmark_summary(port, bench, 0.02)
        self.assertFalse(summary['has_data'])
        self.assertIsNone(summary['beta'])

    def test_aligns_on_common_dates_only_and_withholds_short_history(self):
        port = [(date(2026, 1, i), v) for i, v in enumerate([100, 102, 101, 105, 103], start=1)]
        bench = [(date(2026, 1, i), v) for i, v in enumerate([50, 50.5, 50.2, 51, 50.8], start=1)]
        port.append((date(2026, 1, 6), 106))

        summary = metrics.benchmark_summary(port, bench, 0.02)

        self.assertTrue(summary['has_data'])
        self.assertIsNone(summary['beta'])
        self.assertIsNone(summary['tracking_error'])
        self.assertIsNone(summary['information_ratio'])
        self.assertIsNone(summary['jensen_alpha'])
        self.assertEqual(summary['data_quality'], 'low')
        self.assertEqual(summary['history_days'], 4)

    def test_thresholds_release_each_statistic_in_turn(self):
        thirty = metrics.benchmark_summary(synthetic_series(30), benchmark_series(30), 0.02)
        ninety = metrics.benchmark_summary(synthetic_series(90), benchmark_series(90), 0.02)

        self.assertIsNotNone(thirty['tracking_error'])
        self.assertIsNone(thirty['beta'])
        self.assertEqual(thirty['needs_days']['beta'], 60)
        self.assertIsNotNone(ninety['beta'])
        self.assertIsNone(ninety['information_ratio'])
        self.assertIsNone(ninety['jensen_alpha'])
        self.assertIsNone(ninety['expected_return'])

    def test_four_hundred_days_has_every_statistic(self):
        summary = metrics.benchmark_summary(synthetic_series(400), benchmark_series(400), 0.02)

        for key in ('expected_return', 'beta', 'tracking_error', 'information_ratio', 'jensen_alpha'):
            self.assertIsNotNone(summary[key], key)
        self.assertEqual(summary['history_days'], 400)
        self.assertEqual(summary['needs_days'], {
            'tracking_error': 0, 'beta': 0, 'information_ratio': 0, 'jensen_alpha': 0,
        })

    def test_a_longer_benchmark_does_not_lend_the_portfolio_history(self):
        long_bench = benchmark_series(900, start=SERIES_START - timedelta(days=500))

        summary = metrics.benchmark_summary(synthetic_series(40), long_bench, 0.02)

        self.assertEqual(summary['history_days'], 40)
        self.assertEqual(summary['sample_size'], 41)
        self.assertIsNone(summary['jensen_alpha'])
        self.assertIsNotNone(summary['tracking_error'])

    def test_no_overlap_reports_no_history(self):
        summary = metrics.benchmark_summary([], [], 0.02)
        self.assertEqual(summary['history_days'], 0)
        self.assertEqual(summary['needs_days']['beta'], 90)


class BenchmarkEurClosesTest(TestCase):
    @patch('analytics.benchmarks.market.chart')
    def test_a_eur_benchmark_needs_no_conversion(self, mock_chart):
        mock_chart.return_value = [
            {'date': '2026-01-01', 'close': 50.0},
            {'date': '2026-01-02', 'close': 51.0},
        ]
        closes = benchmarks.eur_closes('world', user=USER)
        self.assertEqual(closes, [(date(2026, 1, 1), 50.0), (date(2026, 1, 2), 51.0)])
        mock_chart.assert_called_once_with(50629, 'Etf', 1440, benchmarks.CHART_COUNT, user=USER)

    @patch('analytics.benchmarks.market.chart')
    def test_a_usd_benchmark_is_converted_using_that_days_eurusd_rate(self, mock_chart):
        def side_effect(uic, asset_type, horizon, count, user):
            if uic == benchmarks.EURUSD_UIC:
                return [{'date': '2026-01-01', 'close': 1.1}, {'date': '2026-01-02', 'close': 1.2}]
            return [{'date': '2026-01-01', 'close': 110.0}, {'date': '2026-01-02', 'close': 120.0}]
        mock_chart.side_effect = side_effect

        closes = dict(benchmarks.eur_closes('sp500', user=USER))

        self.assertAlmostEqual(closes[date(2026, 1, 1)], 100.0)  # 110 USD / 1.1
        self.assertAlmostEqual(closes[date(2026, 1, 2)], 100.0)  # 120 USD / 1.2

    @patch('analytics.benchmarks.market.chart')
    def test_a_date_missing_from_the_fx_series_is_skipped(self, mock_chart):
        def side_effect(uic, asset_type, horizon, count, user):
            if uic == benchmarks.EURUSD_UIC:
                return [{'date': '2026-01-01', 'close': 1.1}]
            return [{'date': '2026-01-01', 'close': 110.0}, {'date': '2026-01-02', 'close': 120.0}]
        mock_chart.side_effect = side_effect

        closes = benchmarks.eur_closes('sp500', user=USER)

        self.assertEqual(len(closes), 1)

    @patch('analytics.benchmarks.market.chart')
    def test_a_provider_failure_becomes_benchmark_unavailable(self, mock_chart):
        mock_chart.side_effect = ProviderNotConnected('Saxo is not connected.')
        with self.assertRaises(benchmarks.BenchmarkUnavailable):
            benchmarks.eur_closes('world', user=USER)

    @patch('analytics.benchmarks.market.chart')
    def test_an_empty_chart_becomes_benchmark_unavailable(self, mock_chart):
        mock_chart.return_value = []
        with self.assertRaises(benchmarks.BenchmarkUnavailable):
            benchmarks.eur_closes('world', user=USER)

    @patch('analytics.benchmarks.market.chart')
    def test_a_zero_fx_rate_is_skipped_not_divided_by(self, mock_chart):
        def side_effect(uic, asset_type, horizon, count, user):
            if uic == benchmarks.EURUSD_UIC:
                return [{'date': '2026-01-01', 'close': 0.0}]  # bad rate
            return [{'date': '2026-01-01', 'close': 110.0}]
        mock_chart.side_effect = side_effect

        # No ZeroDivisionError; the one bad day drops out, leaving nothing.
        with self.assertRaises(benchmarks.BenchmarkUnavailable):
            benchmarks.eur_closes('sp500', user=USER)


class HistoryMixin:
    def setUp(self):
        self.user = the_owner()
        token = RefreshToken.for_user(self.user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        history = patch('analytics.views.account_performance.growth_series')
        self.growth_series = history.start()
        self.addCleanup(history.stop)
        self.seed([])

    def seed(self, growth, warning=None):
        self.growth_series.return_value = GrowthSeries(growth, warning)

    def seed_days(self, values, start=date(2026, 1, 1)):
        self.seed([(start + timedelta(days=offset), value) for offset, value in enumerate(values)])


@override_settings(CACHES=LOCMEM)
class PerformanceViewTest(HistoryMixin, APITestCase):
    def _seed_month(self, n=35):
        self.seed_days([1 + day / 100 for day in range(1, n + 1)])

    def test_requires_authentication(self):
        self.client.credentials()
        response = self.client.get('/api/analytics/performance/')
        self.assertEqual(response.status_code, 401)

    @patch('analytics.benchmarks.eur_closes')
    def test_returns_periods_and_calendar_years(self, mock_eur_closes):
        self._seed_month()
        mock_eur_closes.return_value = [
            (date(2026, 1, 1) + timedelta(days=i), 50 + i * 0.1) for i in range(35)
        ]
        response = self.client.get('/api/analytics/performance/')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(any(row['label'] == '1 month' for row in response.data['periods']))
        self.assertEqual(len(response.data['calendar_years']), 1)
        self.assertEqual(response.data['benchmark']['key'], 'world')
        self.assertIsNone(response.data['history_warning'])

    def test_no_saxo_connection_still_returns_portfolio_only_periods(self):
        self._seed_month()
        response = self.client.get('/api/analytics/performance/')
        self.assertEqual(response.status_code, 200)
        one_month = next(row for row in response.data['periods'] if row['label'] == '1 month')
        self.assertIsNotNone(one_month['portfolio_pct'])
        self.assertIsNone(one_month['benchmark_pct'])

    def test_accepts_a_benchmark_query_param(self):
        self._seed_month()
        response = self.client.get('/api/analytics/performance/?benchmark=sp500')
        self.assertEqual(response.data['benchmark']['key'], 'sp500')

    def test_a_week_of_history_reports_what_is_missing_instead_of_zeros(self):
        self.seed_days([1.0, 1.01, 1.02, 1.03, 1.04], start=date(2026, 1, 5))

        response = self.client.get('/api/analytics/performance/')

        self.assertEqual(response.data['history_days'], 4)
        by_label = {row['label']: row for row in response.data['periods']}
        self.assertIsNone(by_label['1 year']['portfolio_pct'])
        self.assertEqual(by_label['1 year']['needs_days'], 361)
        self.assertIsNotNone(by_label['Since inception']['portfolio_pct'])

    def test_since_inception_is_the_time_weighted_return(self):
        self.seed_days([1.0, 1.2, 1.35])
        response = self.client.get('/api/analytics/performance/')
        by_label = {row['label']: row for row in response.data['periods']}
        self.assertAlmostEqual(by_label['Since inception']['portfolio_pct'], 35.0)

    def test_a_history_warning_reaches_the_page(self):
        self.seed([], warning='Saxo is not connected: Token expired.')
        response = self.client.get('/api/analytics/performance/')
        self.assertEqual(response.data['history_warning'], 'Saxo is not connected: Token expired.')


@override_settings(RISK_FREE_RATE_ANNUAL=0.02, CACHES=LOCMEM)
class RiskMetricsViewTest(HistoryMixin, APITestCase):
    def _seed_week(self):
        self.seed_days([1.0, 1.02, 1.01, 1.05, 1.03])

    def test_requires_authentication(self):
        self.client.credentials()
        response = self.client.get('/api/analytics/risk/')
        self.assertEqual(response.status_code, 401)

    def test_reports_no_data_below_two_days(self):
        self.seed_days([1.0])
        response = self.client.get('/api/analytics/risk/')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['has_data'])

    def test_computes_risk_from_the_account_history(self):
        self._seed_week()
        response = self.client.get('/api/analytics/risk/')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['has_data'])
        self.assertEqual(response.data['history_days'], 4)
        self.assertIsNone(response.data['volatility'])
        self.assertIsNotNone(response.data['projection_inputs']['volatility'])
        self.assertFalse(response.data['inputs_reliable'])
        self.assertEqual(len(response.data['drawdown_series']), 5)

    def test_the_drawdown_is_measured_on_the_time_weighted_history(self):
        self.seed_days([1.0, 1.1, 0.99, 1.0])
        response = self.client.get('/api/analytics/risk/')
        self.assertAlmostEqual(response.data['max_drawdown'], -10.0)

    def test_no_history_says_why(self):
        self.seed([], warning='Saxo did not answer the account history request.')
        response = self.client.get('/api/analytics/risk/')
        self.assertFalse(response.data['has_data'])
        self.assertEqual(response.data['history_warning'], 'Saxo did not answer the account history request.')

    def test_advertises_the_available_benchmarks(self):
        self._seed_week()
        response = self.client.get('/api/analytics/risk/')
        self.assertEqual(
            {b['key'] for b in response.data['available_benchmarks']},
            {'world', 'sp500', 'nasdaq100'},
        )

    @patch('analytics.benchmarks.eur_closes')
    def test_defaults_to_world_index(self, mock_eur_closes):
        self._seed_week()
        mock_eur_closes.return_value = [
            (date(2026, 1, i), v) for i, v in enumerate([50, 50.5, 50.2, 51, 50.8], start=1)
        ]
        response = self.client.get('/api/analytics/risk/')
        self.assertEqual(response.data['benchmark']['key'], 'world')
        mock_eur_closes.assert_called_once_with('world', user=self.user)

    @patch('analytics.benchmarks.eur_closes')
    def test_accepts_a_benchmark_query_param(self, mock_eur_closes):
        self._seed_week()
        mock_eur_closes.return_value = [
            (date(2026, 1, i), v) for i, v in enumerate([50, 50.5, 50.2, 51, 50.8], start=1)
        ]
        response = self.client.get('/api/analytics/risk/?benchmark=sp500')
        self.assertEqual(response.data['benchmark']['key'], 'sp500')
        mock_eur_closes.assert_called_once_with('sp500', user=self.user)

    @patch('analytics.benchmarks.eur_closes')
    def test_an_unknown_benchmark_falls_back_to_world(self, mock_eur_closes):
        self._seed_week()
        mock_eur_closes.return_value = []
        response = self.client.get('/api/analytics/risk/?benchmark=bogus')
        self.assertEqual(response.data['benchmark']['key'], 'world')

    @patch('analytics.benchmarks.eur_closes')
    def test_benchmark_unusable_when_saxo_not_connected(self, mock_eur_closes):
        self._seed_week()
        mock_eur_closes.side_effect = benchmarks.BenchmarkUnavailable('Saxo is not connected.')

        response = self.client.get('/api/analytics/risk/')

        self.assertTrue(response.data['has_data'])
        self.assertFalse(response.data['benchmark']['has_data'])
        self.assertIsNotNone(response.data['benchmark']['reason'])

    @patch('analytics.benchmarks.eur_closes')
    def test_benchmark_is_not_fetched_without_enough_portfolio_history(self, mock_eur_closes):
        self.seed_days([1.0])
        response = self.client.get('/api/analytics/risk/')
        self.assertFalse(response.data['has_data'])
        self.assertFalse(response.data['benchmark']['has_data'])
        mock_eur_closes.assert_not_called()

    @patch('analytics.benchmarks.market.chart')
    def test_a_zero_fx_rate_is_a_reason_not_a_500(self, mock_chart):
        self._seed_week()

        def side_effect(uic, asset_type, horizon, count, user):
            if uic == benchmarks.EURUSD_UIC:
                return [{'date': f'2026-01-0{d}', 'close': 0.0} for d in range(1, 6)]
            return [{'date': f'2026-01-0{d}', 'close': 100.0 + d} for d in range(1, 6)]
        mock_chart.side_effect = side_effect

        response = self.client.get('/api/analytics/risk/?benchmark=sp500')

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data['benchmark']['beta'])
        self.assertIsNotNone(response.data['benchmark']['reason'])


class RiskReportTest(TestCase):
    def _dv(self):
        return [(date(2026, 1, d), 100 + d) for d in range(1, 12)]

    @patch('analytics.report.benchmarks.eur_closes')
    def test_an_unavailable_benchmark_is_a_reason_not_an_exception(self, mock_eur_closes):
        mock_eur_closes.side_effect = benchmarks.BenchmarkUnavailable('not connected')
        out = report.risk_report(self._dv(), 'sp500', user=USER)
        self.assertTrue(out['has_data'])
        self.assertEqual(out['benchmark']['reason'], 'not connected')
        self.assertIsNone(out['benchmark']['beta'])

    @patch('analytics.report.benchmarks.eur_closes')
    def test_no_portfolio_history_does_not_fetch_a_benchmark(self, mock_eur_closes):
        out = report.risk_report([], 'world', user=USER)
        self.assertFalse(out['has_data'])
        self.assertIsNone(out['benchmark']['reason'])
        mock_eur_closes.assert_not_called()

    @patch('analytics.report.benchmarks.eur_closes')
    def test_the_benchmark_block_carries_history_and_needs(self, mock_eur_closes):
        mock_eur_closes.return_value = benchmark_series(400)

        out = report.risk_report(synthetic_series(8), 'world', user=USER)

        self.assertEqual(out['history_days'], 8)
        self.assertEqual(out['benchmark']['history_days'], 8)
        self.assertEqual(out['benchmark']['needs_days']['jensen_alpha'], 357)
        self.assertIsNone(out['benchmark']['beta'])

    def test_an_unknown_key_resolves_to_world(self):
        self.assertEqual(report.resolve_benchmark_key('bogus'), 'world')
        self.assertEqual(report.resolve_benchmark_key('sp500'), 'sp500')


class PerformanceReportTest(TestCase):
    def _dv(self):
        return [(date(2026, 1, 1) + timedelta(days=i), 100 + i) for i in range(35)]

    @patch('analytics.report.benchmarks.eur_closes')
    def test_benchmark_is_best_effort(self, mock_eur_closes):
        mock_eur_closes.side_effect = benchmarks.BenchmarkUnavailable('x')
        out = report.performance_report(self._dv(), 'world', user=USER)
        self.assertIn('periods', out)
        self.assertEqual(out['benchmark']['key'], 'world')
        one_month = next(r for r in out['periods'] if r['label'] == '1 month')
        self.assertIsNone(one_month['benchmark_pct'])


SERIES_START = date(2025, 3, 3)


def synthetic_series(days, start=SERIES_START):
    return [
        (start + timedelta(days=i), 100 + i * 0.2 + (3 if i % 3 == 0 else 0))
        for i in range(days + 1)
    ]


def benchmark_series(days, start=SERIES_START):
    return [
        (start + timedelta(days=i), 50 + i * 0.1 + (1 if i % 4 == 0 else 0))
        for i in range(days + 1)
    ]


class HistoryTest(TestCase):
    def test_history_days_is_the_calendar_span_of_the_series(self):
        self.assertEqual(history.history_days(synthetic_series(8)), 8)

    def test_fewer_than_two_points_is_zero_days(self):
        self.assertEqual(history.history_days([]), 0)
        self.assertEqual(history.history_days([(SERIES_START, 100)]), 0)

    def test_a_figure_appears_exactly_at_its_threshold(self):
        self.assertIsNone(history.gate(1.5, 29, 'volatility'))
        self.assertEqual(history.gate(1.5, 30, 'volatility'), 1.5)

    def test_gating_passes_none_through(self):
        self.assertIsNone(history.gate(None, 400, 'sharpe'))

    def test_days_missing_is_never_negative(self):
        self.assertEqual(history.days_missing(8, 30), 22)
        self.assertEqual(history.days_missing(400, 30), 0)

    def test_needs_days_names_every_requested_metric(self):
        self.assertEqual(
            history.needs_days(8, history.RISK_METRICS),
            {'expected_return': 357, 'volatility': 22, 'sharpe': 357, 'sortino': 357},
        )

    def test_projection_inputs_are_reliable_from_a_year(self):
        self.assertFalse(history.inputs_reliable(364))
        self.assertTrue(history.inputs_reliable(365))

    def test_a_month_is_complete_once_its_last_trading_day_has_passed(self):
        self.assertTrue(history.latest_month_is_complete(date(2026, 3, 31)))
        self.assertTrue(history.latest_month_is_complete(date(2026, 1, 30)))
        self.assertFalse(history.latest_month_is_complete(date(2026, 3, 20)))
