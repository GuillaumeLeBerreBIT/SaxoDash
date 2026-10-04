from unittest import mock

from django.core.cache import cache
from django.test import TestCase, override_settings

from research import scan_progress, tasks
from saxo.credentials import SaxoNotConnected
from saxo.models import SyncRun

LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}


def latest_run():
    return SyncRun.objects.filter(task='scan_universe').first()


@override_settings(CACHES=LOCMEM)
@mock.patch('saxo.tasks.active_credential', return_value=object())
@mock.patch('research.tasks.scan.scan_universe', return_value=500)
class ScanTaskLockTest(TestCase):
    def setUp(self):
        cache.clear()

    def test_a_scheduled_scan_holds_the_lock_while_it_runs_and_releases_it(self, body, _credential):
        body.side_effect = lambda: self.assertIsNotNone(scan_progress.current()) or 500
        self.assertEqual(tasks.scan_universe(), 500)
        self.assertIsNone(scan_progress.current())
        self.assertEqual((latest_run().outcome, latest_run().rows), ('ok', 500))

    def test_a_scheduled_scan_skips_while_another_is_running(self, body, _credential):
        scan_progress.report(10, 518, '2026-10-04T07:23:45+00:00')
        self.assertIsNone(tasks.scan_universe())
        body.assert_not_called()
        self.assertEqual((latest_run().outcome, latest_run().detail), ('skipped', 'A scan was already running.'))
        self.assertEqual(scan_progress.current(), {'done': 10, 'total': 518, 'started_at': '2026-10-04T07:23:45+00:00'})

    def test_a_scan_queued_by_the_page_runs_under_the_lock_the_page_took(self, body, _credential):
        scan_progress.claim()
        self.assertEqual(tasks.scan_universe(claimed=True), 500)
        body.assert_called_once_with()
        self.assertIsNone(scan_progress.current())

    def test_a_scan_skipped_for_saxo_releases_the_lock(self, body, credential):
        credential.side_effect = SaxoNotConnected('Saxo needs re-authentication.')
        self.assertIsNone(tasks.scan_universe())
        body.assert_not_called()
        self.assertIsNone(scan_progress.current())
        self.assertEqual((latest_run().outcome, latest_run().detail), ('skipped', 'Saxo needs re-authentication.'))
