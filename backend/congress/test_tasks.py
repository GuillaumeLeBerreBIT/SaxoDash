from datetime import date, datetime, timezone as tz
from unittest import mock

from django.core.management import call_command
from django.test import TestCase

from saxo.models import SyncRun

from . import tasks
from .house import ParseResult
from .models import Member, Report


class SyncHouseTest(TestCase):
    def setUp(self):
        self.member = Member.objects.create(slug='nancy-pelosi', first_name='Nancy', last_name='Pelosi', state_district='CA11')

    def test_syncs_the_index_parses_and_rebuilds_every_member(self):
        now = datetime(2026, 10, 15, 14, 0, tzinfo=tz.utc)
        with mock.patch.object(tasks.timezone, 'now', return_value=now), \
                mock.patch.object(tasks.house, 'sync_index', return_value=2) as sync_index, \
                mock.patch.object(tasks.house, 'parse_pending', return_value=ParseResult(1, 0, {self.member.pk})), \
                mock.patch.object(tasks.performance, 'rebuild_all') as rebuild_all:
            tasks.sync_house()
        self.assertEqual([call.args[0] for call in sync_index.call_args_list], [2026])
        rebuild_all.assert_called_once_with()
        run = SyncRun.objects.get(task='sync_house')
        self.assertEqual((run.outcome, run.rows), ('ok', 1))
        self.assertEqual(run.detail, '2 new reports, 0 failed to parse')

    def test_a_ticker_priced_after_the_parse_enters_holdings_on_the_next_run(self):
        from datetime import timedelta
        from investors.models import PriceHistory
        from .models import Holding, Trade
        start = date(2025, 1, 2)
        rows = lambda base, step: [[(start + timedelta(days=n)).isoformat(), base + step * n] for n in range(400)]
        report = Report.objects.create(
            doc_id='1', member=self.member, year=2025, filed_on=start + timedelta(days=10), status=Report.PARSED,
        )
        Trade.objects.create(
            report=report, owner='SP', asset='NVIDIA Corporation (NVDA)', asset_type='ST', ticker='NVDA',
            kind=Trade.PURCHASE, traded_on=start + timedelta(days=2), amount_low=15001, amount_high=50000, priceable=True,
        )
        PriceHistory.objects.create(ticker='SPY', status=PriceHistory.OK, closes=rows(500, 0.5))
        with mock.patch.object(tasks.house, 'sync_index', return_value=0), \
                mock.patch.object(tasks.house, 'parse_pending', return_value=ParseResult()):
            tasks.sync_house()
            self.assertFalse(Holding.objects.filter(member=self.member).exists())
            PriceHistory.objects.create(ticker='NVDA', status=PriceHistory.OK, closes=rows(100, 1))
            tasks.sync_house()
        self.assertEqual(list(Holding.objects.filter(member=self.member).values_list('ticker', flat=True)), ['NVDA'])

    def test_in_january_the_previous_year_is_checked_too(self):
        now = datetime(2027, 1, 5, 14, 0, tzinfo=tz.utc)
        with mock.patch.object(tasks.timezone, 'now', return_value=now), \
                mock.patch.object(tasks.house, 'sync_index', return_value=0) as sync_index, \
                mock.patch.object(tasks.house, 'parse_pending', return_value=ParseResult()):
            tasks.sync_house()
        self.assertEqual(sorted(call.args[0] for call in sync_index.call_args_list), [2026, 2027])

    def test_a_failed_index_download_is_recorded(self):
        with mock.patch.object(tasks.house, 'sync_index', side_effect=tasks.house.HouseError('down')):
            with self.assertRaises(tasks.house.HouseError):
                tasks.sync_house()
        self.assertEqual(SyncRun.objects.get(task='sync_house').outcome, 'failed')


    def test_an_unreachable_clerk_fails_the_run_after_rebuilding_what_was_parsed(self):
        with mock.patch.object(tasks.house, 'sync_index', return_value=0), \
                mock.patch.object(tasks.house, 'parse_pending', return_value=ParseResult(1, 0, {self.member.pk}, waiting=5)), \
                mock.patch.object(tasks.performance, 'rebuild_all') as rebuild_all:
            with self.assertRaises(tasks.house.HouseError):
                tasks.sync_house()
        rebuild_all.assert_called_once_with()
        run = SyncRun.objects.get(task='sync_house')
        self.assertEqual((run.outcome, run.detail), ('failed', 'Clerk unreachable, 5 reports waiting'))


class ReparseCommandTest(TestCase):
    def test_failed_reports_are_reset_and_parsed_again(self):
        member = Member.objects.create(slug='x', first_name='X', last_name='Y', state_district='CA01')
        report = Report.objects.create(doc_id='20000001', member=member, year=2026, filed_on=date(2026, 1, 2),
                                       status=Report.FAILED, attempts=2,
                                       retry_after=datetime(2026, 1, 9, tzinfo=tz.utc))
        with mock.patch('congress.management.commands.reparse_reports.house.parse_pending', return_value=ParseResult()), \
                mock.patch('congress.management.commands.reparse_reports.performance.rebuild'):
            call_command('reparse_reports', '--failed')
        report.refresh_from_db()
        self.assertEqual((report.status, report.attempts, report.retry_after), (Report.PENDING, 0, None))
