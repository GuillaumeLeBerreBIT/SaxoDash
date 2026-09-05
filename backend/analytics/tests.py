import math
import statistics
from datetime import date
from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from core.models import NetWorthSnapshot

from . import benchmarks, metrics

TRADING_DAYS = 252


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


class PositiveMonthsPctTest(TestCase):
    def test_computes_the_share_that_were_positive(self):
        monthly = [{'pct': 5.0}, {'pct': -1.0}, {'pct': 0.0}, {'pct': 3.0}]
        self.assertAlmostEqual(metrics.positive_months_pct(monthly), 50.0)

    def test_no_months_yields_none(self):
        self.assertIsNone(metrics.positive_months_pct([]))


class RiskSummaryTest(TestCase):
    def test_insufficient_history_reports_no_data_rather_than_zeros(self):
        summary = metrics.risk_summary([(date(2026, 1, 1), 100)], risk_free_annual=0.02)
        self.assertFalse(summary['has_data'])
        self.assertIsNone(summary['volatility'])
        self.assertEqual(summary['drawdown_series'], [])

    def test_enough_history_produces_real_numbers(self):
        dated = [(date(2026, 1, i), v) for i, v in enumerate([100, 102, 101, 105, 103], start=1)]
        summary = metrics.risk_summary(dated, risk_free_annual=0.02)

        self.assertTrue(summary['has_data'])
        self.assertIsNotNone(summary['volatility'])
        self.assertIsNotNone(summary['expected_return'])
        self.assertEqual(len(summary['drawdown_series']), 5)
        self.assertEqual(summary['drawdown_series'][0]['date'], '2026-01-01')
        self.assertEqual(summary['risk_free_annual'], 0.02)


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

    def test_aligns_on_common_dates_only(self):
        port = [(date(2026, 1, i), v) for i, v in enumerate([100, 102, 101, 105, 103], start=1)]
        bench = [(date(2026, 1, i), v) for i, v in enumerate([50, 50.5, 50.2, 51, 50.8], start=1)]
        port.append((date(2026, 1, 6), 106))  # portfolio-only date, no matching benchmark row

        summary = metrics.benchmark_summary(port, bench, 0.02)

        self.assertTrue(summary['has_data'])
        self.assertIsNotNone(summary['beta'])
        self.assertIsNotNone(summary['tracking_error'])
        self.assertIsNotNone(summary['information_ratio'])
        self.assertIsNotNone(summary['jensen_alpha'])


class BenchmarkEurClosesTest(TestCase):
    @patch('analytics.benchmarks.market.chart')
    def test_a_eur_benchmark_needs_no_conversion(self, mock_chart):
        mock_chart.return_value = [
            {'date': '2026-01-01', 'close': 50.0},
            {'date': '2026-01-02', 'close': 51.0},
        ]
        closes = benchmarks.eur_closes('world')
        self.assertEqual(closes, [(date(2026, 1, 1), 50.0), (date(2026, 1, 2), 51.0)])
        mock_chart.assert_called_once_with(50629, 'Etf', 1440, benchmarks.CHART_COUNT)

    @patch('analytics.benchmarks.market.chart')
    def test_a_usd_benchmark_is_converted_using_that_days_eurusd_rate(self, mock_chart):
        def side_effect(uic, asset_type, horizon, count):
            if uic == benchmarks.EURUSD_UIC:
                return [{'date': '2026-01-01', 'close': 1.1}, {'date': '2026-01-02', 'close': 1.2}]
            return [{'date': '2026-01-01', 'close': 110.0}, {'date': '2026-01-02', 'close': 120.0}]
        mock_chart.side_effect = side_effect

        closes = dict(benchmarks.eur_closes('sp500'))

        self.assertAlmostEqual(closes[date(2026, 1, 1)], 100.0)  # 110 USD / 1.1
        self.assertAlmostEqual(closes[date(2026, 1, 2)], 100.0)  # 120 USD / 1.2

    @patch('analytics.benchmarks.market.chart')
    def test_a_date_missing_from_the_fx_series_is_skipped(self, mock_chart):
        def side_effect(uic, asset_type, horizon, count):
            if uic == benchmarks.EURUSD_UIC:
                return [{'date': '2026-01-01', 'close': 1.1}]
            return [{'date': '2026-01-01', 'close': 110.0}, {'date': '2026-01-02', 'close': 120.0}]
        mock_chart.side_effect = side_effect

        closes = benchmarks.eur_closes('sp500')

        self.assertEqual(len(closes), 1)


@override_settings(RISK_FREE_RATE_ANNUAL=0.02)
class RiskMetricsViewTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='alex', password='pw')
        token = RefreshToken.for_user(self.user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_requires_authentication(self):
        self.client.credentials()
        response = self.client.get('/api/analytics/risk/')
        self.assertEqual(response.status_code, 401)

    def test_reports_no_data_below_two_snapshots(self):
        NetWorthSnapshot.objects.create(
            date=date(2026, 1, 1), portfolio_value=100, bank_total=0, net_worth=100,
        )
        response = self.client.get('/api/analytics/risk/')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['has_data'])

    def test_computes_risk_from_portfolio_value_history(self):
        for day, value in enumerate([100, 102, 101, 105, 103], start=1):
            NetWorthSnapshot.objects.create(
                date=date(2026, 1, day), portfolio_value=value,
                bank_total=50, net_worth=value + 50,
            )
        response = self.client.get('/api/analytics/risk/')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['has_data'])
        self.assertIsNotNone(response.data['volatility'])
        self.assertEqual(len(response.data['drawdown_series']), 5)

    def _seed_snapshots(self):
        for day, value in enumerate([100, 102, 101, 105, 103], start=1):
            NetWorthSnapshot.objects.create(
                date=date(2026, 1, day), portfolio_value=value,
                bank_total=50, net_worth=value + 50,
            )

    def test_advertises_the_available_benchmarks(self):
        self._seed_snapshots()
        response = self.client.get('/api/analytics/risk/')
        self.assertEqual(
            {b['key'] for b in response.data['available_benchmarks']},
            {'world', 'sp500', 'nasdaq100'},
        )

    @patch('analytics.benchmarks.eur_closes')
    def test_defaults_to_world_index(self, mock_eur_closes):
        self._seed_snapshots()
        mock_eur_closes.return_value = [
            (date(2026, 1, i), v) for i, v in enumerate([50, 50.5, 50.2, 51, 50.8], start=1)
        ]
        response = self.client.get('/api/analytics/risk/')
        self.assertEqual(response.data['benchmark']['key'], 'world')
        mock_eur_closes.assert_called_once_with('world')

    @patch('analytics.benchmarks.eur_closes')
    def test_accepts_a_benchmark_query_param(self, mock_eur_closes):
        self._seed_snapshots()
        mock_eur_closes.return_value = [
            (date(2026, 1, i), v) for i, v in enumerate([50, 50.5, 50.2, 51, 50.8], start=1)
        ]
        response = self.client.get('/api/analytics/risk/?benchmark=sp500')
        self.assertEqual(response.data['benchmark']['key'], 'sp500')
        mock_eur_closes.assert_called_once_with('sp500')

    @patch('analytics.benchmarks.eur_closes')
    def test_an_unknown_benchmark_falls_back_to_world(self, mock_eur_closes):
        self._seed_snapshots()
        mock_eur_closes.return_value = []
        response = self.client.get('/api/analytics/risk/?benchmark=bogus')
        self.assertEqual(response.data['benchmark']['key'], 'world')

    @patch('analytics.benchmarks.eur_closes')
    def test_benchmark_unusable_when_saxo_not_connected(self, mock_eur_closes):
        from saxo.credentials import SaxoNotConnected
        self._seed_snapshots()
        mock_eur_closes.side_effect = SaxoNotConnected('Saxo is not connected.')

        response = self.client.get('/api/analytics/risk/')

        self.assertTrue(response.data['has_data'])  # portfolio-only metrics still work
        self.assertFalse(response.data['benchmark']['has_data'])
        self.assertIsNotNone(response.data['benchmark']['reason'])

    @patch('analytics.benchmarks.eur_closes')
    def test_benchmark_is_not_fetched_without_enough_portfolio_history(self, mock_eur_closes):
        NetWorthSnapshot.objects.create(date=date(2026, 1, 1), portfolio_value=100, bank_total=0, net_worth=100)
        response = self.client.get('/api/analytics/risk/')
        self.assertFalse(response.data['has_data'])
        self.assertFalse(response.data['benchmark']['has_data'])
        mock_eur_closes.assert_not_called()
