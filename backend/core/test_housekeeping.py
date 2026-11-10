from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.sessions.backends.db import SessionStore
from django.contrib.sessions.models import Session
from django.test import TestCase
from django.utils import timezone
from django_celery_beat.models import PeriodicTask
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

from core import housekeeping
from core.scheduling import sync_periodic_tasks
from core.tasks import prune_expired_records
from enablebanking.models import BankSyncRun
from saxo.models import SyncRun


def aged(model, days, **fields):
    row = model.objects.create(**fields)
    model.objects.filter(pk=row.pk).update(ran_at=timezone.now() - timedelta(days=days))
    return row


class ExpiredTokensTest(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user('alice')

    def test_an_expired_refresh_token_is_removed_with_its_blacklist_entry(self):
        RefreshToken.for_user(self.user).blacklist()
        OutstandingToken.objects.update(expires_at=timezone.now() - timedelta(days=1))

        counts = housekeeping.prune()

        self.assertEqual(counts['tokens'], 1)
        self.assertFalse(OutstandingToken.objects.exists())
        self.assertFalse(BlacklistedToken.objects.exists())

    def test_a_live_refresh_token_stays_blacklisted(self):
        RefreshToken.for_user(self.user).blacklist()

        counts = housekeeping.prune()

        self.assertEqual(counts['tokens'], 0)
        self.assertEqual(BlacklistedToken.objects.count(), 1)


class ExpiredSessionsTest(TestCase):
    def _session(self):
        store = SessionStore()
        store['saxo_oauth_state'] = 'nonce'
        store.save()
        return store.session_key

    def test_only_expired_sessions_are_removed(self):
        expired = self._session()
        live = self._session()
        Session.objects.filter(pk=expired).update(expire_date=timezone.now() - timedelta(minutes=1))

        counts = housekeeping.prune()

        self.assertEqual(counts['sessions'], 1)
        self.assertEqual(list(Session.objects.values_list('pk', flat=True)), [live])


class SyncRunHistoryTest(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user('alice')
        self.other = get_user_model().objects.create_user('bob')

    def test_old_runs_go_and_recent_ones_stay(self):
        aged(SyncRun, 200, user=self.user, task='sync_positions', outcome='ok')
        recent = aged(SyncRun, 10, user=self.user, task='sync_positions', outcome='ok')

        counts = housekeeping.prune()

        self.assertEqual(counts['sync_runs'], 1)
        self.assertEqual(list(SyncRun.objects.all()), [recent])

    def test_the_newest_run_of_a_task_survives_however_old(self):
        aged(SyncRun, 400, user=self.user, task='sync_positions', outcome='ok')
        newest = aged(SyncRun, 300, user=self.user, task='sync_positions', outcome='failed')

        housekeeping.prune()

        self.assertIn(newest, SyncRun.objects.all())

    def test_the_last_success_survives_behind_newer_failures(self):
        aged(SyncRun, 400, user=self.user, task='sync_positions', outcome='ok')
        last_ok = aged(SyncRun, 300, user=self.user, task='sync_positions', outcome='ok')
        aged(SyncRun, 250, user=self.user, task='sync_positions', outcome='failed')
        newest = aged(SyncRun, 200, user=self.user, task='sync_positions', outcome='failed')

        housekeeping.prune()

        self.assertCountEqual(SyncRun.objects.all(), [last_ok, newest])

    def test_each_user_and_each_task_keeps_its_own_newest_run(self):
        mine = aged(SyncRun, 300, user=self.user, task='sync_positions', outcome='ok')
        theirs = aged(SyncRun, 320, user=self.other, task='sync_positions', outcome='ok')
        balance = aged(SyncRun, 340, user=self.user, task='sync_account_balance', outcome='ok')
        shared = aged(SyncRun, 360, user=None, task='scan_universe', outcome='ok')
        aged(SyncRun, 380, user=None, task='scan_universe', outcome='ok')

        housekeeping.prune()

        self.assertCountEqual(SyncRun.objects.all(), [mine, theirs, balance, shared])

    def test_bank_runs_follow_the_same_rule_per_bank_and_kind(self):
        aged(BankSyncRun, 400, bank='kbc', kind='balances', outcome='ok')
        kbc = aged(BankSyncRun, 300, bank='kbc', kind='balances', outcome='ok')
        argenta = aged(BankSyncRun, 350, bank='argenta', kind='balances', outcome='ok')
        transactions = aged(BankSyncRun, 350, bank='kbc', kind='transactions', outcome='ok')

        counts = housekeeping.prune()

        self.assertEqual(counts['bank_sync_runs'], 1)
        self.assertCountEqual(BankSyncRun.objects.all(), [kbc, argenta, transactions])


class PruneTaskTest(TestCase):
    def test_the_task_reports_what_it_removed(self):
        self.assertEqual(
            prune_expired_records(),
            {'tokens': 0, 'sessions': 0, 'sync_runs': 0, 'bank_sync_runs': 0},
        )

    def test_it_is_scheduled_nightly(self):
        sync_periodic_tasks()
        task = PeriodicTask.objects.get(name='Prune expired records')
        self.assertEqual(task.task, 'core.tasks.prune_expired_records')
        self.assertEqual((task.crontab.minute, task.crontab.hour), ('0', '3'))
