from datetime import date, timedelta
from unittest.mock import patch

from django.test import SimpleTestCase, TestCase
from django.utils import timezone

from research.providers import ProviderError, ProviderNotConnected

from . import copying, price_feed
from .factories import make_investor, store_quarter
from .models import PriceHistory, Security

Q1, Q2 = date(2026, 3, 31), date(2026, 6, 30)
NOW = timezone.now()


def bars(*closes, start=date(2026, 1, 5)):
    return [{'date': (start + timedelta(days=index)).isoformat(), 'close': close} for index, close in enumerate(closes)]


def rows(*closes):
    return [[bar['date'], bar['close']] for bar in bars(*closes)]


class SplitAdjustmentTest(SimpleTestCase):
    def closes(self, *values):
        return [close for _, close in price_feed.adjusted_for_splits(rows(*values))]

    def test_ordinary_moves_are_left_alone(self):
        self.assertEqual(self.closes(100, 104, 71, 95), [100, 104, 71, 95])

    def test_a_ten_for_one_split_rescales_everything_before_it(self):
        self.assertEqual(self.closes(1000, 1200, 121, 130), [100.0, 120.0, 121, 130])

    def test_a_two_for_one_split_with_a_move_on_the_day(self):
        self.assertEqual(self.closes(200, 97), [100.0, 97])

    def test_a_reverse_split_scales_earlier_prices_up(self):
        self.assertEqual(self.closes(2, 2.1, 41), [40.0, 42.0, 41])

    def test_two_splits_compound(self):
        self.assertEqual(self.closes(4000, 2000, 1000, 100), [100.0, 100.0, 100.0, 100])

    def test_a_crash_that_is_not_a_whole_ratio_is_a_crash(self):
        self.assertEqual(self.closes(100, 40), [100, 40])

    def test_an_empty_series_stays_empty(self):
        self.assertEqual(price_feed.adjusted_for_splits([]), [])


@patch('investors.price_feed.market.chart')
@patch('investors.price_feed.scan.resolve')
class RefreshTest(TestCase):
    def setUp(self):
        self.investor = make_investor()
        Security.objects.create(cusip='037833100', ticker='AAPL')
        Security.objects.create(cusip='67066G104', ticker='NVDA')
        store_quarter(self.investor, Q1, [('037833100', 'APPLE INC', 10, 600), ('999999999', 'ACME', 1, 5)])
        store_quarter(self.investor, Q2, [('67066G104', 'NVIDIA CORP', 10, 600)])
        self.pauses = []

    def refresh(self, now=NOW):
        return price_feed.refresh(pause=self.pauses.append, now=now)

    def found(self, uic, asset_type='Stock'):
        return {'uic': uic, 'asset_type': asset_type, 'symbol': 'X'}

    def test_fetches_the_benchmark_and_every_ticker_a_clone_ever_held(self, resolve, chart):
        resolve.side_effect = lambda ticker: self.found({'AAPL': 1, 'NVDA': 2}[ticker])
        chart.return_value = bars(10, 11)

        self.assertEqual(self.refresh(), 3)

        self.assertEqual(
            {row.ticker: (row.uic, row.asset_type, row.status) for row in PriceHistory.objects.all()},
            {
                copying.BENCHMARK_TICKER: (price_feed.BENCHMARK_UIC, 'Etf', PriceHistory.OK),
                'AAPL': (1, 'Stock', PriceHistory.OK), 'NVDA': (2, 'Stock', PriceHistory.OK),
            },
        )
        self.assertEqual(PriceHistory.objects.get(ticker='AAPL').closes, rows(10, 11))
        self.assertEqual([call.args[0] for call in resolve.call_args_list], ['AAPL', 'NVDA'])
        chart.assert_any_call(1, 'Stock', price_feed.DAILY, price_feed.BARS)
        self.assertEqual(self.pauses, [price_feed.PAUSE_SECONDS] * 3)

    def test_stored_closes_are_split_adjusted(self, resolve, chart):
        resolve.return_value = self.found(1)
        chart.return_value = bars(1000, 100)

        self.refresh()

        self.assertEqual(PriceHistory.objects.get(ticker='AAPL').closes, rows(100.0, 100))

    def test_a_ticker_saxo_does_not_list_is_marked_and_never_charted(self, resolve, chart):
        resolve.side_effect = lambda ticker: None if ticker == 'AAPL' else self.found(2)
        chart.return_value = bars(10, 11)

        self.assertEqual(self.refresh(), 2)

        apple = PriceHistory.objects.get(ticker='AAPL')
        self.assertEqual((apple.status, apple.closes, apple.checked_at), (PriceHistory.UNMATCHED, [], NOW))

    def test_one_failing_ticker_does_not_stop_the_rest(self, resolve, chart):
        resolve.side_effect = lambda ticker: self.found({'AAPL': 1, 'NVDA': 2}[ticker])
        chart.side_effect = lambda uic, *_: (_ for _ in ()).throw(ProviderError('boom')) if uic == 1 else bars(10, 11)

        self.assertEqual(self.refresh(), 2)

        apple = PriceHistory.objects.get(ticker='AAPL')
        self.assertEqual((apple.status, apple.error), (PriceHistory.FAILED, 'boom'))

    def test_an_empty_chart_is_a_failure_that_keeps_earlier_closes(self, resolve, chart):
        PriceHistory.objects.create(ticker='NVDA', uic=2, closes=rows(5, 6), status=PriceHistory.OK)
        resolve.return_value = self.found(1)
        chart.side_effect = lambda uic, *_: [] if uic == 2 else bars(10, 11)

        self.refresh()

        nvidia = PriceHistory.objects.get(ticker='NVDA')
        self.assertEqual((nvidia.status, nvidia.closes), (PriceHistory.FAILED, rows(5, 6)))

    def test_losing_the_saxo_connection_stops_the_run(self, resolve, chart):
        chart.side_effect = ProviderNotConnected('expired')

        with self.assertRaises(ProviderNotConnected):
            self.refresh()

        self.assertIsNone(PriceHistory.objects.get(ticker=copying.BENCHMARK_TICKER).checked_at)

    def test_a_fresh_series_is_not_fetched_again_the_same_day(self, resolve, chart):
        resolve.return_value = self.found(1)
        chart.return_value = bars(10, 11)
        self.refresh()
        chart.reset_mock()

        self.assertEqual(self.refresh(NOW + timedelta(hours=2)), 0)

        chart.assert_not_called()

    def test_the_next_night_refreshes_current_holdings_and_the_benchmark_only(self, resolve, chart):
        resolve.side_effect = lambda ticker: self.found({'AAPL': 1, 'NVDA': 2}[ticker])
        chart.return_value = bars(10, 11)
        self.refresh()
        chart.reset_mock()

        self.assertEqual(self.refresh(NOW + timedelta(hours=24)), 2)

        self.assertEqual(sorted(call.args[0] for call in chart.call_args_list), [2, price_feed.BENCHMARK_UIC])

    def test_an_unlisted_ticker_is_retried_after_a_week(self, resolve, chart):
        resolve.side_effect = lambda ticker: None if ticker == 'NVDA' else self.found(1)
        chart.return_value = bars(10, 11)
        self.refresh()
        resolve.reset_mock()

        self.refresh(NOW + timedelta(days=1))
        self.assertNotIn('NVDA', [call.args[0] for call in resolve.call_args_list])

        self.refresh(NOW + timedelta(days=8))
        self.assertIn('NVDA', [call.args[0] for call in resolve.call_args_list])
