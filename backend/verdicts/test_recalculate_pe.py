import tempfile
from datetime import date, timedelta
from io import StringIO
from pathlib import Path
from unittest import mock

from django.core.management import call_command
from django.test import TestCase

from research.models import DailyBars, ScreenerRow
from verdicts.models import StockVerdict
from verdicts.test_compute import STRONG_HISTORY, make_row

LAST_SESSION = date(2025, 4, 20)
OLD_RULE = {'current': 10.0, 'p25': 11.0, 'p75': 14.0, 'eps_ttm': 5.0, 'weeks': 120}


def quarter_ends(first_year, last):
    ends = [date(year, month, 30 if month in (6, 9) else 31)
            for year in range(first_year, last.year + 1) for month in (3, 6, 9, 12)]
    return [end for end in ends if end <= last]


def daily_bars(days):
    first = LAST_SESSION - timedelta(days=days - 1)
    return [[(first + timedelta(days=i)).isoformat(), 50.0, 50.0, 50.0, 50.0, 1000] for i in range(days)]


def eps_entries():
    ends = quarter_ends(2020, date(2025, 3, 31))
    return [[end.isoformat(), 2.0 if end == ends[-1] else 1.0] for end in ends]


def stored_row(ticker='AAPL', **overrides):
    row = make_row(ticker, pe_history=OLD_RULE, fundamentals_history={
        **STRONG_HISTORY, 'quarterly_eps': eps_entries(),
    }, **overrides)
    DailyBars.objects.create(row=row, bars=daily_bars(900))
    return row


def recalculate(*args):
    with mock.patch('research.market.chart', side_effect=AssertionError('Saxo called')), \
            mock.patch('research.finnhub._get', side_effect=AssertionError('Finnhub called')), \
            mock.patch('research.report_dates._get', side_effect=AssertionError('SEC called')):
        call_command('recalculate_pe', *args, stdout=StringIO())


class RecalculatePeTest(TestCase):
    def test_an_unpublished_quarter_is_left_out_of_the_stored_pe_and_the_verdict(self):
        row = stored_row()

        recalculate()

        row.refresh_from_db()
        self.assertEqual((row.pe_history['eps_ttm'], row.pe_history['current']), (4.0, 12.5))
        verdict = StockVerdict.objects.get(ticker='AAPL')
        self.assertEqual((verdict.current_pe, verdict.cheap_below, verdict.valuation), (12.5, 50.0, 'cheap'))

    def test_a_stored_release_date_counts_the_quarter_from_that_day(self):
        row = stored_row()
        row.fundamentals_history = {**row.fundamentals_history, 'eps_released': {'2025-03-31': '2025-04-15'}}
        row.save()

        recalculate()

        row.refresh_from_db()
        self.assertEqual(row.pe_history['eps_ttm'], 5.0)

    def test_a_row_without_stored_bars_keeps_its_pe(self):
        make_row('MSFT', pe_history=OLD_RULE)

        recalculate()

        self.assertEqual(ScreenerRow.everything.get(ticker='MSFT').pe_history, OLD_RULE)

    def test_the_yardstick_report_is_written_when_asked(self):
        stored_row()
        with tempfile.TemporaryDirectory() as folder:
            out = Path(folder) / 'report.md'
            recalculate('--report', str(out))
            self.assertIn('P/E range: cheap', out.read_text())
