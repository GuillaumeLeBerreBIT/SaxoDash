import tempfile
from datetime import date, datetime
from pathlib import Path
from unittest import mock

from django.core.cache import cache
from django.test import TestCase, override_settings

from research import scan, scan_progress
from research.finnhub import FinnhubAPIError, FinnhubNotConfigured
from research.models import ScreenerRow
from research.providers import ProviderError, ProviderNotConnected

BARS = [
    {'date': f'2025-{i:04d}', 'open': 100.0, 'high': 101.0, 'low': 99.0, 'close': 100.0 + i * 0.1, 'volume': 1_000_000}
    for i in range(260)
]
LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}
FINANCIALS = {'metric': {'peNormalizedAnnual': 20.0, 'roeTTM': 25.0}}


def instrument(symbol, uic, exchange='NASDAQ', currency='USD'):
    return {'symbol': symbol, 'uic': uic, 'asset_type': 'Stock', 'exchange': exchange, 'currency': currency, 'description': symbol}


def no_pause(_seconds):
    return None


class ResolveTest(TestCase):
    @mock.patch('research.scan.market.search')
    def test_prefers_the_us_primary_listing(self, search):
        search.return_value = [instrument('NVDA', 1, 'XETR', 'EUR'), instrument('NVDA', 2, 'NASDAQ')]
        self.assertEqual(scan.resolve('NVDA')['uic'], 2)
        search.assert_called_once_with('NVDA', 'Stock')

    @mock.patch('research.scan.market.search')
    def test_ignores_a_different_symbol(self, search):
        search.return_value = [instrument('NVDX', 3)]
        self.assertIsNone(scan.resolve('NVDA'))


@mock.patch('research.scan.finnhub.get_basic_financials', return_value=FINANCIALS)
@mock.patch('research.scan.market.chart', return_value=BARS)
@mock.patch('research.scan.market.search')
@override_settings(CACHES=LOCMEM)
class ScanUniverseTest(TestCase):
    def setUp(self):
        cache.clear()
        calendar = mock.patch('research.scan.finnhub.get_earnings_calendar', return_value={'earningsCalendar': []})
        self.calendar = calendar.start()
        self.addCleanup(calendar.stop)
        ScreenerRow.objects.create(ticker='AAPL', name='Apple', indexes='SP500|NDX')
        ScreenerRow.objects.create(ticker='BRK.B', name='Berkshire', indexes='SP500')
        self.universe = self.write_universe('AAPL', 'BRK.B')

    def write_universe(self, *tickers):
        directory = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: [path.unlink() for path in directory.iterdir()] and directory.rmdir())
        path = directory / 'universe.csv'
        lines = ['ticker,name,sector,indexes'] + [f'{ticker},{ticker} Inc,Tech,SP500' for ticker in tickers]
        path.write_text('\n'.join(lines) + '\n')
        return path

    def test_fills_earnings_dates_once_after_the_symbols(self, search, chart, financials):
        self.search_for(search, {'AAPL': 211, 'BRK.B': 212})
        self.run_scan()
        self.calendar.assert_called_once()

    def test_a_failed_calendar_call_does_not_fail_the_scan(self, search, chart, financials):
        self.calendar.side_effect = FinnhubNotConfigured()
        self.search_for(search, {'AAPL': 211, 'BRK.B': 212})
        with self.assertLogs('research.scan', level='WARNING'):
            self.assertEqual(self.run_scan(), 2)

    def run_scan(self, **kwargs):
        kwargs.setdefault('pause', no_pause)
        return scan.scan_universe(universe=self.universe, **kwargs)

    def search_for(self, search, known):
        search.side_effect = lambda ticker, _types: [instrument(ticker, known[ticker])] if ticker in known else []

    def test_resolves_and_fills_technicals_and_fundamentals(self, search, chart, financials):
        self.search_for(search, {'AAPL': 211, 'BRK.B': 212})
        self.assertEqual(self.run_scan(), 2)
        apple = ScreenerRow.objects.get(ticker='AAPL')
        self.assertEqual((apple.uic, apple.asset_type, apple.status), (211, 'Stock', ScreenerRow.OK))
        self.assertIsNotNone(apple.rsi14)
        self.assertEqual(apple.pe, 20.0)
        self.assertIsNone(apple.net_margin)
        self.assertIsNotNone(apple.technicals_at)
        self.assertIsNotNone(apple.fundamentals_at)
        chart.assert_any_call(211, 'Stock', scan.DAILY_HORIZON, scan.CHART_BARS)

    def test_stores_revenue_growth_and_payout_from_the_same_metrics_call(self, search, chart, financials):
        financials.return_value = {'metric': {'peNormalizedAnnual': 20.0, 'revenueGrowth5Y': 12.5, 'payoutRatioTTM': 40.0}}
        self.search_for(search, {'AAPL': 211, 'BRK.B': 212})
        self.run_scan()
        aapl = ScreenerRow.objects.get(ticker='AAPL')
        self.assertEqual((aapl.revenue_growth_5y, aapl.payout_ratio), (12.5, 40.0))
        self.assertEqual(financials.call_count, 2)

    def test_unmatched_ticker_is_marked_and_skipped(self, search, chart, financials):
        self.search_for(search, {'AAPL': 211})
        self.assertEqual(self.run_scan(), 1)
        berkshire = ScreenerRow.objects.get(ticker='BRK.B')
        self.assertEqual(berkshire.status, ScreenerRow.UNMATCHED)
        self.assertIsNone(berkshire.rsi14)

    def test_resolved_uic_is_reused_without_searching(self, search, chart, financials):
        ScreenerRow.objects.filter(ticker='AAPL').update(uic=211)
        self.universe = self.write_universe('AAPL')
        self.run_scan()
        search.assert_not_called()

    def test_one_failing_symbol_does_not_stop_the_run(self, search, chart, financials):
        self.search_for(search, {'AAPL': 211, 'BRK.B': 212})

        def chart_for(uic, *_):
            if uic == 211:
                raise RuntimeError('boom')
            return BARS

        chart.side_effect = chart_for
        with self.assertLogs('research.scan', level='WARNING'):
            self.assertEqual(self.run_scan(), 1)
        apple = ScreenerRow.objects.get(ticker='AAPL')
        self.assertEqual(apple.status, ScreenerRow.FAILED)
        self.assertIn('boom', apple.error)
        self.assertEqual(ScreenerRow.objects.get(ticker='BRK.B').status, ScreenerRow.OK)

    def test_finnhub_error_keeps_previous_fundamentals(self, search, chart, financials):
        self.search_for(search, {'AAPL': 211, 'BRK.B': 212})
        ScreenerRow.objects.filter(ticker='AAPL').update(pe=15.0)
        financials.side_effect = FinnhubAPIError('upstream 500')
        self.run_scan()
        apple = ScreenerRow.objects.get(ticker='AAPL')
        self.assertEqual(apple.status, ScreenerRow.OK)
        self.assertEqual(apple.pe, 15.0)
        self.assertIsNone(apple.fundamentals_at)

    def test_finnhub_not_configured_stops_asking_for_the_rest_of_the_run(self, search, chart, financials):
        self.search_for(search, {'AAPL': 211, 'BRK.B': 212})
        financials.side_effect = FinnhubNotConfigured()
        self.assertEqual(self.run_scan(), 2)
        self.assertEqual(financials.call_count, 1)

    def test_a_search_error_fails_only_that_symbol(self, search, chart, financials):
        def search_for(ticker, _types):
            if ticker == 'AAPL':
                raise ProviderError('Saxo could not serve this request.')
            return [instrument(ticker, 212)]

        search.side_effect = search_for
        with self.assertLogs('research.scan', level='WARNING'):
            self.assertEqual(self.run_scan(), 1)
        self.assertEqual(ScreenerRow.objects.get(ticker='AAPL').status, ScreenerRow.FAILED)

    def test_losing_the_saxo_connection_mid_run_stops_the_run(self, search, chart, financials):
        self.search_for(search, {'AAPL': 211, 'BRK.B': 212})
        chart.side_effect = ProviderNotConnected('Saxo is not connected.')
        with self.assertRaises(ProviderNotConnected):
            self.run_scan()
        self.assertFalse(ScreenerRow.objects.filter(status=ScreenerRow.FAILED).exists())

    def test_pauses_between_symbols(self, search, chart, financials):
        self.search_for(search, {'AAPL': 211, 'BRK.B': 212})
        pauses = []
        self.run_scan(pause=pauses.append)
        self.assertEqual(pauses, [scan.PAUSE_SECONDS, scan.PAUSE_SECONDS])

    def test_reports_progress_after_each_symbol_and_clears_it_at_the_end(self, search, chart, financials):
        self.search_for(search, {'AAPL': 211, 'BRK.B': 212})
        seen = []
        self.run_scan(pause=lambda _seconds: seen.append(scan_progress.current()))
        self.assertEqual([(p['done'], p['total']) for p in seen], [(1, 2), (2, 2)])
        self.assertIsNone(scan_progress.current())

    def test_every_progress_report_carries_when_the_run_started(self, search, chart, financials):
        self.search_for(search, {'AAPL': 211, 'BRK.B': 212})
        seen = []
        self.run_scan(pause=lambda _seconds: seen.append(scan_progress.current()))
        started = {p['started_at'] for p in seen}
        self.assertEqual(len(started), 1)
        self.assertIsNotNone(datetime.fromisoformat(started.pop()))

    def test_a_run_that_stops_early_clears_its_progress(self, search, chart, financials):
        self.search_for(search, {'AAPL': 211, 'BRK.B': 212})
        chart.side_effect = ProviderNotConnected('Saxo is not connected.')
        with self.assertRaises(ProviderNotConnected):
            self.run_scan()
        self.assertIsNone(scan_progress.current())

    def test_loads_tickers_missing_from_the_table_before_scanning(self, search, chart, financials):
        self.search_for(search, {'AAPL': 211, 'BRK.B': 212, 'MSFT': 213})
        self.universe = self.write_universe('AAPL', 'BRK.B', 'MSFT')
        self.assertEqual(self.run_scan(), 3)
        self.assertEqual(ScreenerRow.objects.get(ticker='MSFT').status, ScreenerRow.OK)

    def test_an_unexpected_fundamentals_error_keeps_the_row_ok_and_the_run_going(self, search, chart, financials):
        self.search_for(search, {'AAPL': 211, 'BRK.B': 212})
        ScreenerRow.objects.filter(ticker='AAPL').update(pe=15.0)
        financials.side_effect = [AttributeError('malformed'), FINANCIALS]
        with self.assertLogs('research.scan', level='WARNING'):
            self.assertEqual(self.run_scan(), 2)
        apple = ScreenerRow.objects.get(ticker='AAPL')
        self.assertEqual((apple.status, apple.pe), (ScreenerRow.OK, 15.0))
        self.assertIn('malformed', apple.error)
        self.assertIsNone(apple.fundamentals_at)
        self.assertEqual(ScreenerRow.objects.get(ticker='BRK.B').pe, 20.0)

    def test_a_non_numeric_metric_leaves_no_half_new_fundamentals(self, search, chart, financials):
        self.search_for(search, {'AAPL': 211, 'BRK.B': 212})
        ScreenerRow.objects.filter(ticker='AAPL').update(pe=15.0, roe=9.0)
        with mock.patch('research.scan.finnhub.to_screener_fundamentals', side_effect=[ValueError('nan'), {'pe': 20.0}]):
            with self.assertLogs('research.scan', level='WARNING'):
                self.run_scan()
        apple = ScreenerRow.objects.get(ticker='AAPL')
        self.assertEqual((apple.pe, apple.roe), (15.0, 9.0))

    def test_a_failing_save_fails_only_that_row(self, search, chart, financials):
        self.search_for(search, {'AAPL': 211, 'BRK.B': 212})
        real_save = ScreenerRow.save
        calls = {'count': 0}

        def flaky_save(row, *args, **kwargs):
            if row.ticker == 'AAPL' and row.status == ScreenerRow.OK and calls['count'] == 0:
                calls['count'] += 1
                raise RuntimeError('disk full')
            return real_save(row, *args, **kwargs)

        with mock.patch.object(ScreenerRow, 'save', flaky_save):
            with self.assertLogs('research.scan', level='WARNING'):
                self.assertEqual(self.run_scan(), 1)
        self.assertEqual(ScreenerRow.objects.get(ticker='AAPL').status, ScreenerRow.FAILED)
        self.assertEqual(ScreenerRow.objects.get(ticker='BRK.B').status, ScreenerRow.OK)


@override_settings(CACHES=LOCMEM)
class EarningsDatesTest(TestCase):
    today = date(2026, 10, 4)

    def setUp(self):
        for ticker in ('AAPL', 'KO', 'MSFT'):
            ScreenerRow.objects.create(ticker=ticker, name=ticker, indexes='SP500')

    def dates(self):
        return dict(ScreenerRow.objects.values_list('ticker', 'next_earnings_date'))

    @mock.patch('research.scan.finnhub.get_earnings_calendar')
    def test_each_stock_gets_its_earliest_upcoming_date_in_the_window(self, calendar):
        calendar.return_value = {'earningsCalendar': [
            {'symbol': 'AAPL', 'date': '2026-10-30'},
            {'symbol': 'AAPL', 'date': '2026-10-09'},
            {'symbol': 'KO', 'date': '2026-10-03'},
            {'symbol': 'ZZZZ', 'date': '2026-10-05'},
        ]}
        scan.refresh_earnings_dates(self.today)
        calendar.assert_called_once_with(None, '2026-10-04', '2026-10-18')
        self.assertEqual(self.dates(), {'AAPL': date(2026, 10, 9), 'KO': None, 'MSFT': None})

    @mock.patch('research.scan.finnhub.get_earnings_calendar')
    def test_a_stock_no_longer_in_the_calendar_loses_its_old_date(self, calendar):
        ScreenerRow.objects.filter(ticker='MSFT').update(next_earnings_date=date(2026, 10, 1))
        calendar.return_value = {'earningsCalendar': []}
        scan.refresh_earnings_dates(self.today)
        self.assertIsNone(self.dates()['MSFT'])

    @mock.patch('research.scan.finnhub.get_earnings_calendar', side_effect=FinnhubAPIError('429'))
    def test_a_failed_calendar_call_keeps_the_dates_it_had(self, calendar):
        ScreenerRow.objects.filter(ticker='AAPL').update(next_earnings_date=date(2026, 10, 9))
        with self.assertLogs('research.scan', level='WARNING'):
            scan.refresh_earnings_dates(self.today)
        self.assertEqual(self.dates()['AAPL'], date(2026, 10, 9))

    @mock.patch('research.scan.finnhub.get_earnings_calendar', return_value={'earningsCalendar': [{'symbol': 'AAPL', 'date': 'soon'}]})
    def test_a_malformed_calendar_keeps_the_dates_it_had(self, calendar):
        ScreenerRow.objects.filter(ticker='AAPL').update(next_earnings_date=date(2026, 10, 9))
        with self.assertLogs('research.scan', level='WARNING'):
            scan.refresh_earnings_dates(self.today)
        self.assertEqual(self.dates()['AAPL'], date(2026, 10, 9))
