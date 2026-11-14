from datetime import date, timedelta
from unittest import mock

from django.test import TestCase

from research import backfill, history
from research.models import DailyBars, ScreenerRow
from research.providers import ProviderError, ProviderNotConnected

USER = mock.sentinel.user
START = date(2000, 1, 1)


def day(index):
    return (START + timedelta(days=index)).isoformat()


def stored(first, last):
    return [[day(i), 10.0, 11.0, 9.0, 10.0 + i * 0.01, 100] for i in range(first, last)]


def candles(first, last, scale=1.0):
    return [
        {'date': day(i), 'open': 10.0, 'high': 11.0, 'low': 9.0, 'close': (10.0 + i * 0.01) * scale, 'volume': 100}
        for i in range(first, last)
    ]


def pages(scale=1.0, floor=0):
    def chart_before(uic, asset_type, horizon, oldest, *, user):
        end = (date.fromisoformat(oldest) - START).days + 1
        return candles(max(floor, end - 1200), end, scale)
    return chart_before


@mock.patch('research.backfill.market.chart_before')
class BackfillTest(TestCase):
    def daily(self, ticker, first=9000, last=10200, **fields):
        row = ScreenerRow.objects.create(ticker=ticker, name=ticker, uic=len(ticker) + ScreenerRow.everything.count(), asset_type='Stock')
        return DailyBars.objects.create(row=row, bars=stored(first, last), **fields)

    def run_backfill(self, **kwargs):
        return backfill.backfill(pause=lambda seconds: None, user=USER, **kwargs)

    def test_pages_back_to_the_target_and_marks_the_history_complete(self, chart_before):
        chart_before.side_effect = pages()
        daily = self.daily('AAPL')
        self.assertEqual(self.run_backfill(), backfill.Result(1, ()))
        daily.refresh_from_db()
        dates = [bar[0] for bar in daily.bars]
        self.assertTrue(daily.history_complete)
        self.assertGreaterEqual(len(dates), history.TARGET_BARS)
        self.assertEqual(dates, sorted(set(dates)))
        self.assertEqual(dates[-1], day(10199))
        self.assertEqual(chart_before.call_count, 4)

    def test_a_short_page_means_the_listing_starts_there(self, chart_before):
        chart_before.side_effect = pages(floor=8500)
        daily = self.daily('META')
        self.run_backfill()
        daily.refresh_from_db()
        self.assertEqual((daily.bars[0][0], daily.history_complete), (day(8500), True))
        self.assertEqual(chart_before.call_count, 1)

    def test_an_older_page_on_another_price_scale_is_not_stored(self, chart_before):
        chart_before.side_effect = pages(scale=0.5)
        daily = self.daily('NVDA')
        with self.assertLogs('research.backfill', level='WARNING'):
            self.assertEqual(self.run_backfill(), backfill.Result(0, ('NVDA',)))
        daily.refresh_from_db()
        self.assertEqual((len(daily.bars), daily.history_complete), (1200, False))

    def test_one_failed_stock_does_not_stop_the_others(self, chart_before):
        self.daily('AAA')
        self.daily('BBB')
        good = pages()
        chart_before.side_effect = lambda uic, *args, **kwargs: (_ for _ in ()).throw(ProviderError('502')) if uic == ScreenerRow.objects.get(ticker='AAA').uic else good(uic, *args, **kwargs)
        with self.assertLogs('research.backfill', level='WARNING'):
            self.assertEqual(self.run_backfill(), backfill.Result(1, ('AAA',)))

    def test_a_lost_connection_stops_the_run(self, chart_before):
        self.daily('AAA')
        chart_before.side_effect = ProviderNotConnected('gone')
        with self.assertRaises(ProviderNotConnected):
            self.run_backfill()

    def test_skips_complete_and_empty_rows_and_respects_the_limit(self, chart_before):
        chart_before.side_effect = pages()
        self.daily('AAA', history_complete=True)
        self.daily('BBB', first=0, last=0)
        self.daily('CCC')
        self.daily('DDD')
        self.assertEqual(self.run_backfill(limit=1), backfill.Result(1, ()))
        self.assertTrue(DailyBars.objects.get(row__ticker='CCC').history_complete)
        self.assertFalse(DailyBars.objects.get(row__ticker='DDD').history_complete)
