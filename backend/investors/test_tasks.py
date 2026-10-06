from unittest.mock import patch

from django.test import TestCase

from saxo.credentials import SYNC_TASKS
from saxo.models import SyncRun

from . import edgar, tasks
from .factories import make_investor
from .importer import SyncResult


@patch('investors.tasks.importer.sync_investor')
class SyncInvestorsTaskTest(TestCase):
    def setUp(self):
        self.berkshire = make_investor()
        self.pershing = make_investor(name='Bill Ackman', firm='Pershing Square', cik=1336528, slug='pershing-square')

    def test_syncs_every_investor_without_a_saxo_connection(self, sync_investor):
        sync_investor.return_value = SyncResult(imported=2)

        tasks.sync_investors()

        self.assertEqual(sync_investor.call_count, 2)
        run = SyncRun.objects.get(task=tasks.SYNC_TASK)
        self.assertEqual((run.outcome, run.rows, run.detail), ('ok', 4, ''))

    def test_skipped_filings_are_named_in_the_run(self, sync_investor):
        sync_investor.side_effect = [SyncResult(imported=1, skipped=['A-9']), SyncResult()]

        tasks.sync_investors()

        run = SyncRun.objects.get(task=tasks.SYNC_TASK)
        self.assertEqual(run.detail, 'skipped 1 unreadable filing(s): A-9')

    def test_one_investor_failing_still_syncs_the_others_and_fails_the_run(self, sync_investor):
        sync_investor.side_effect = [edgar.EdgarError('503 busy'), SyncResult(imported=1)]

        with self.assertRaises(edgar.EdgarError):
            tasks.sync_investors()

        self.assertEqual(sync_investor.call_count, 2)
        run = SyncRun.objects.get(task=tasks.SYNC_TASK)
        self.assertEqual(run.outcome, 'failed')
        self.assertIn('503 busy', run.detail)

    def test_the_run_never_counts_toward_saxo_health(self, sync_investor):
        self.assertNotIn(tasks.SYNC_TASK, SYNC_TASKS)
