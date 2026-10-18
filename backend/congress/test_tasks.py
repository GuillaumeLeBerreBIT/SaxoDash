import io
from datetime import date, datetime, timezone as tz
from unittest import mock

from django.core.management import CommandError, call_command
from django.test import TestCase, override_settings

from saxo.models import SyncRun

from . import run_lock, tasks
from .house import ParseResult
from .models import Member, Report, Trade


LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}


@override_settings(CACHES=LOCMEM)
class SyncHouseTest(TestCase):
    def setUp(self):
        self.member = Member.objects.create(slug='nancy-pelosi', first_name='Nancy', last_name='Pelosi', state_district='CA11')

    def test_syncs_the_index_parses_and_rebuilds_every_member(self):
        now = datetime(2026, 10, 15, 14, 0, tzinfo=tz.utc)
        with mock.patch.object(tasks.timezone, 'now', return_value=now), \
                mock.patch.object(tasks.house, 'sync_index', return_value=2) as sync_index, \
                mock.patch.object(tasks.house, 'parse_pending', return_value=ParseResult(1, 0, {self.member.pk})) as parse, \
                mock.patch.object(tasks.performance, 'rebuild_all') as rebuild_all:
            tasks.sync_house()
        self.assertEqual([call.args[0] for call in sync_index.call_args_list], [2026])
        self.assertIsInstance(parse.call_args.kwargs['pause'].__self__, run_lock.Held)
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


    def test_a_run_already_holding_the_lock_skips_the_sync(self):
        with run_lock.exclusive('backfill'), \
                mock.patch.object(tasks.house, 'sync_index') as sync_index:
            self.assertIsNone(tasks.sync_house())
        sync_index.assert_not_called()
        run = SyncRun.objects.get(task='sync_house')
        self.assertEqual((run.outcome, run.detail), ('skipped', 'A House backfill was already running.'))

    def test_the_lock_is_released_after_a_failed_sync(self):
        with mock.patch.object(tasks.house, 'sync_index', side_effect=tasks.house.HouseError('down')):
            with self.assertRaises(tasks.house.HouseError):
                tasks.sync_house()
        with run_lock.exclusive('backfill'):
            pass


@override_settings(CACHES=LOCMEM)
class BackfillCommandTest(TestCase):
    def test_refuses_to_start_while_the_daily_sync_runs(self):
        with run_lock.exclusive('daily sync'), \
                mock.patch('congress.management.commands.backfill_house.house.sync_index') as sync_index:
            with self.assertRaisesMessage(CommandError, 'A House daily sync is already running'):
                call_command('backfill_house', '--since', '2026')
        sync_index.assert_not_called()

    def test_holds_the_lock_while_it_runs(self):
        def sync_index(year, now):
            with self.assertRaises(run_lock.Busy):
                with run_lock.exclusive('daily sync'):
                    pass
            return 0

        with mock.patch('congress.management.commands.backfill_house.house.sync_index', side_effect=sync_index), \
                mock.patch('congress.management.commands.backfill_house.house.parse_pending', return_value=ParseResult()), \
                mock.patch('congress.management.commands.backfill_house.performance.rebuild_all', return_value=0):
            call_command('backfill_house', '--since', '2026', stdout=io.StringIO())
        with run_lock.exclusive('daily sync'):
            pass


@override_settings(CACHES=LOCMEM)
class ReparseCommandTest(TestCase):
    def test_refuses_to_start_while_another_run_holds_the_lock(self):
        with run_lock.exclusive('backfill'):
            with self.assertRaisesMessage(CommandError, 'A House backfill is already running'):
                call_command('reparse_reports', '--failed')

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

    def test_unread_resets_every_parsed_report_that_left_a_row_unread(self):
        member = Member.objects.create(slug='x', first_name='X', last_name='Y', state_district='CA01')
        unread = Report.objects.create(doc_id='20000001', member=member, year=2021, filed_on=date(2021, 1, 2),
                                       status=Report.PARSED, unparsed_rows=1)
        empty = Report.objects.create(doc_id='20000002', member=member, year=2021, filed_on=date(2021, 1, 3),
                                      status=Report.PARSED)
        read = Report.objects.create(doc_id='20000003', member=member, year=2021, filed_on=date(2021, 1, 4),
                                     status=Report.PARSED, unparsed_rows=1)
        Trade.objects.create(report=read, asset='Apple Inc. (AAPL)', kind='purchase',
                             traded_on=date(2021, 1, 1), amount_low=1001)
        with mock.patch('congress.management.commands.reparse_reports.house.parse_pending', return_value=ParseResult()), \
                mock.patch('congress.management.commands.reparse_reports.performance.rebuild'):
            call_command('reparse_reports', '--unread', stdout=io.StringIO())
        statuses = dict(Report.objects.values_list('doc_id', 'status'))
        self.assertEqual(statuses, {
            unread.doc_id: Report.PENDING, empty.doc_id: Report.PARSED, read.doc_id: Report.PENDING,
        })
