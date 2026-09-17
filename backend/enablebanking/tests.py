from django.test import TestCase
from django.utils import timezone
from .models import EnableBankingCredential, BankSyncRun


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
