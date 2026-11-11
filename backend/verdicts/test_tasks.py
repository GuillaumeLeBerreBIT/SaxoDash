from django.test import TestCase

from saxo.models import SyncRun

from . import tasks
from .test_compute import make_row


class ComputeVerdictsTaskTest(TestCase):
    def test_records_an_ok_run_without_a_saxo_credential(self):
        make_row('AAPL')

        tasks.compute_verdicts()

        run = SyncRun.objects.get(task='compute_verdicts')
        self.assertEqual((run.outcome, run.rows, run.user_id), ('ok', 1, None))
