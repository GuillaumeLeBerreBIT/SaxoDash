from django.core.cache import cache
from django.test import TestCase, override_settings

from research import scan_progress

LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}


@override_settings(CACHES=LOCMEM)
class ScanProgressTest(TestCase):
    def setUp(self):
        cache.clear()

    def test_nothing_is_running_by_default(self):
        self.assertIsNone(scan_progress.current())

    def test_a_claim_reads_as_queued_with_no_total_yet(self):
        self.assertTrue(scan_progress.claim())
        self.assertEqual(scan_progress.current(), {'done': 0, 'total': None})

    def test_only_one_claim_wins(self):
        self.assertTrue(scan_progress.claim())
        self.assertFalse(scan_progress.claim())

    def test_a_running_scan_cannot_be_claimed(self):
        scan_progress.report(3, 10)
        self.assertFalse(scan_progress.claim())
        self.assertEqual(scan_progress.current(), {'done': 3, 'total': 10})

    def test_clear_ends_the_run(self):
        scan_progress.report(3, 10)
        scan_progress.clear()
        self.assertIsNone(scan_progress.current())
