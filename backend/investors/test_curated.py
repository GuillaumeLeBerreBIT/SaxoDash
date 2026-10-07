import csv
from io import StringIO
from unittest.mock import patch

from django.core.management import CommandError, call_command
from django.test import TestCase

from .curated import CURATED_CSV, load_curated
from .factories import make_investor
from . import edgar
from .importer import SyncResult
from .models import Investor


class LoadCuratedTest(TestCase):
    def test_loads_the_shipped_list(self):
        result = load_curated()

        self.assertEqual(result, {'created': 19, 'updated': 0})
        berkshire = Investor.objects.get(cik=1067983)
        self.assertEqual(
            (berkshire.name, berkshire.firm, berkshire.slug, berkshire.curated),
            ('Warren Buffett', 'Berkshire Hathaway', 'berkshire-hathaway', True),
        )
        self.assertEqual(Investor.objects.get(cik=1549575).slug, 'dalal-street-llc')

    def test_reloading_changes_nothing(self):
        load_curated()
        self.assertEqual(load_curated(), {'created': 0, 'updated': 0})

    def test_an_edited_row_updates_in_place_and_keeps_the_slug(self):
        load_curated()
        Investor.objects.filter(cik=1067983).update(name='W. Buffett')

        self.assertEqual(load_curated(), {'created': 0, 'updated': 1})
        berkshire = Investor.objects.get(cik=1067983)
        self.assertEqual((berkshire.name, berkshire.slug), ('Warren Buffett', 'berkshire-hathaway'))

    def test_never_removes_an_investor_the_user_added(self):
        make_investor(name='Someone', firm='Some Fund', cik=1, slug='some-fund', curated=False)
        load_curated()
        self.assertTrue(Investor.objects.filter(slug='some-fund').exists())

    def test_an_investor_the_user_added_becomes_curated_when_listed(self):
        make_investor(curated=False)
        load_curated()
        self.assertTrue(Investor.objects.get(cik=1067983).curated)

    def test_the_shipped_list_has_unique_ciks(self):
        with open(CURATED_CSV, newline='') as handle:
            ciks = [row['cik'] for row in csv.DictReader(handle)]
        self.assertEqual(len(ciks), 19)
        self.assertEqual(len(set(ciks)), 19)


class CommandsTest(TestCase):
    def test_load_investors_reports_counts(self):
        out = StringIO()
        call_command('load_investors', stdout=out)
        self.assertIn('created 19, updated 0', out.getvalue())

    @patch('investors.management.commands.backfill_investors.backfill', return_value=SyncResult(imported=3))
    def test_backfill_one_investor_by_slug(self, backfill):
        make_investor()
        make_investor(name='Bill Ackman', firm='Pershing Square', cik=1336528, slug='pershing-square')
        out = StringIO()

        call_command('backfill_investors', '--slug', 'pershing-square', stdout=out)

        backfill.assert_called_once()
        self.assertEqual(backfill.call_args.args[0].slug, 'pershing-square')
        self.assertIn('pershing-square: imported 3, skipped 0', out.getvalue())

    @patch('investors.management.commands.backfill_investors.backfill', return_value=SyncResult())
    def test_backfill_everyone_by_default(self, backfill):
        make_investor()
        make_investor(name='Bill Ackman', firm='Pershing Square', cik=1336528, slug='pershing-square')

        call_command('backfill_investors', stdout=StringIO())

        self.assertEqual(backfill.call_count, 2)

    @patch('investors.management.commands.backfill_investors.resolve_securities')
    @patch('investors.management.commands.backfill_investors.backfill')
    def test_one_failing_investor_does_not_stop_the_rest(self, backfill, resolve_securities):
        make_investor()
        make_investor(name='Bill Ackman', firm='Pershing Square', cik=1336528, slug='pershing-square')
        backfill.side_effect = [edgar.EdgarError('read timed out'), SyncResult(imported=1)]
        out, err = StringIO(), StringIO()

        with self.assertRaises(CommandError) as raised:
            call_command('backfill_investors', stdout=out, stderr=err)

        self.assertEqual(backfill.call_count, 2)
        self.assertIn('berkshire-hathaway: imported 1, skipped 0', out.getvalue())
        self.assertIn('pershing-square: failed (read timed out)', err.getvalue())
        self.assertIn('pershing-square', str(raised.exception))
        self.assertNotIn('berkshire-hathaway', str(raised.exception))
        resolve_securities.assert_called_once_with()

    @patch('investors.management.commands.backfill_investors.resolve_securities')
    @patch('investors.management.commands.backfill_investors.backfill', return_value=SyncResult())
    def test_tickers_are_resolved_once_after_all_investors(self, backfill, resolve_securities):
        investor = make_investor()

        call_command('backfill_investors', stdout=StringIO())

        backfill.assert_called_once_with(investor, resolve=False)
        resolve_securities.assert_called_once_with()
