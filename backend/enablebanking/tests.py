from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from .models import EnableBankingCredential, BankSyncRun
from . import credentials


class EnableBankingCredentialModelTest(TestCase):
    def test_defaults(self):
        cred = EnableBankingCredential.objects.create(
            bank='kbc', session_id='s1', valid_until=timezone.now(),
        )
        self.assertEqual(cred.linked_accounts, [])
        self.assertFalse(cred.needs_reauth)

    def test_bank_is_unique(self):
        EnableBankingCredential.objects.create(
            bank='kbc', session_id='s1', valid_until=timezone.now(),
        )
        with self.assertRaises(Exception):
            EnableBankingCredential.objects.create(
                bank='kbc', session_id='s2', valid_until=timezone.now(),
            )


class BankSyncRunModelTest(TestCase):
    def test_defaults(self):
        run = BankSyncRun.objects.create(bank='argenta', outcome='ok')
        self.assertEqual(run.rows, 0)
        self.assertEqual(run.detail, '')


class ConnectionStateTest(TestCase):
    def test_not_connected_when_no_row_exists(self):
        state = credentials.connection_state('kbc')
        self.assertFalse(state.connected)
        self.assertFalse(state.needs_reauth)
        self.assertEqual(state.reason, 'KBC is not connected.')

    def test_needs_reauth_when_flagged(self):
        EnableBankingCredential.objects.create(
            bank='kbc', session_id='s', valid_until=timezone.now() + timedelta(days=90),
            needs_reauth=True,
        )
        state = credentials.connection_state('kbc')
        self.assertTrue(state.connected)
        self.assertTrue(state.needs_reauth)
        self.assertFalse(state.usable)

    def test_needs_reauth_when_consent_expired(self):
        EnableBankingCredential.objects.create(
            bank='argenta', session_id='s', valid_until=timezone.now() - timedelta(days=1),
        )
        state = credentials.connection_state('argenta')
        self.assertTrue(state.needs_reauth)
        self.assertEqual(state.reason, 'Argenta consent has expired.')

    def test_usable_when_connected_and_fresh(self):
        EnableBankingCredential.objects.create(
            bank='kbc', session_id='s', valid_until=timezone.now() + timedelta(days=90),
        )
        state = credentials.connection_state('kbc')
        self.assertTrue(state.usable)
        self.assertIsNone(state.reason)

    def test_active_credential_raises_when_not_usable(self):
        with self.assertRaises(credentials.EnableBankingNotConnected):
            credentials.active_credential('kbc')

    def test_active_credential_returns_the_row_when_usable(self):
        cred = EnableBankingCredential.objects.create(
            bank='kbc', session_id='s', valid_until=timezone.now() + timedelta(days=90),
        )
        self.assertEqual(credentials.active_credential('kbc'), cred)

    def test_last_successful_sync_is_scoped_to_its_own_bank(self):
        BankSyncRun.objects.create(bank='kbc', outcome='ok', rows=2)
        BankSyncRun.objects.create(bank='argenta', outcome='failed')
        self.assertEqual(credentials.last_successful_sync('kbc').rows, 2)
        self.assertIsNone(credentials.last_successful_sync('argenta'))
