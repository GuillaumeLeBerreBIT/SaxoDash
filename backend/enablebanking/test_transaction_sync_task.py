from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from accounts.models import BankAccount

from .models import BankSyncRun, BankTransaction, EnableBankingCredential
from .tasks import sync_enablebanking_transactions

LINKED_ACCOUNT = {'uid': 'acc-1', 'account_id': {'iban': 'BE00'}, 'product': 'Current account'}

RAW_TX = {
    'entry_reference': 'e-1',
    'transaction_amount': {'currency': 'EUR', 'amount': '10.00'},
    'credit_debit_indicator': 'DBIT',
    'status': 'BOOK',
    'booking_date': '2026-01-05',
    'creditor': {'name': 'COLRUYT'},
    'remittance_information': [],
}

RAW_PENDING = {**RAW_TX, 'entry_reference': 'e-2', 'status': 'PDNG'}


class SyncEnablebankingTransactionsTaskTest(TestCase):
    def setUp(self):
        self.account = BankAccount.objects.create(
            bank='KBC', type='Current account', iban_masked='BE12 •••• •••• 0001',
            balance=100, available=100, external_id='enablebanking:kbc:acc-1',
        )
        self.credential = EnableBankingCredential.objects.create(
            bank='kbc', session_id='s', valid_until=timezone.now() + timedelta(days=90),
            linked_accounts=[LINKED_ACCOUNT],
        )

    def test_skips_a_bank_with_no_credential(self):
        EnableBankingCredential.objects.filter(bank='kbc').delete()
        sync_enablebanking_transactions()
        run = BankSyncRun.objects.get(bank='kbc', kind='transactions')
        self.assertEqual(run.outcome, 'skipped')

    @patch('enablebanking.tasks.client.iter_transactions')
    def test_first_sync_uses_longest_strategy_and_creates_rows(self, mock_iter):
        mock_iter.return_value = iter([RAW_TX])
        sync_enablebanking_transactions()

        self.assertEqual(mock_iter.call_args.kwargs.get('strategy'), 'longest')
        tx = BankTransaction.objects.get(external_id='enablebanking:kbc:acc-1:e-1')
        self.assertEqual(tx.category, 'GROCERIES')
        run = BankSyncRun.objects.get(bank='kbc', kind='transactions')
        self.assertEqual(run.outcome, 'ok')
        self.assertEqual(run.rows, 1)

    @patch('enablebanking.tasks.client.iter_transactions')
    def test_pending_transactions_are_skipped(self, mock_iter):
        mock_iter.return_value = iter([RAW_PENDING])
        sync_enablebanking_transactions()
        self.assertEqual(BankTransaction.objects.count(), 0)

    @patch('enablebanking.tasks.client.iter_transactions')
    def test_second_sync_uses_incremental_date_from(self, mock_iter):
        mock_iter.return_value = iter([RAW_TX])
        sync_enablebanking_transactions()

        mock_iter.reset_mock()
        mock_iter.return_value = iter([])
        sync_enablebanking_transactions()

        self.assertEqual(mock_iter.call_args.kwargs.get('date_from'), '2026-01-05')
        self.assertIsNone(mock_iter.call_args.kwargs.get('strategy'))

    @patch('enablebanking.tasks.client.iter_transactions')
    def test_rerun_upserts_rather_than_duplicating(self, mock_iter):
        mock_iter.return_value = iter([RAW_TX])
        sync_enablebanking_transactions()
        mock_iter.return_value = iter([RAW_TX])
        sync_enablebanking_transactions()
        self.assertEqual(BankTransaction.objects.filter(external_id='enablebanking:kbc:acc-1:e-1').count(), 1)

    @patch('enablebanking.tasks.client.iter_transactions')
    def test_category_override_survives_resync(self, mock_iter):
        mock_iter.return_value = iter([RAW_TX])
        sync_enablebanking_transactions()
        tx = BankTransaction.objects.get(external_id='enablebanking:kbc:acc-1:e-1')
        tx.category_override = 'DINING'
        tx.save()

        mock_iter.return_value = iter([RAW_TX])
        sync_enablebanking_transactions()

        tx.refresh_from_db()
        self.assertEqual(tx.category_override, 'DINING')

    @patch('enablebanking.tasks.client.iter_transactions')
    def test_cross_bank_transfer_pair_synced_in_the_same_run_matches_both_ways(self, mock_iter):
        """Regression test: both legs of a same-run transfer must end up
        TRANSFER, regardless of which bank credentials.BANKS processes first -
        catches the bug where per-account mark_transfers calls could never
        see the other bank's leg in the same batch."""
        argenta_account = BankAccount.objects.create(
            bank='Argenta', type='Current account', iban_masked='BE12 •••• •••• 0002',
            balance=100, available=100, external_id='enablebanking:argenta:acc-2',
        )
        EnableBankingCredential.objects.create(
            bank='argenta', session_id='s', valid_until=timezone.now() + timedelta(days=90),
            linked_accounts=[{'uid': 'acc-2', 'account_id': {'iban': 'BE00'}, 'product': 'Current account'}],
        )

        kbc_outflow = {
            'entry_reference': 'kbc-out', 'transaction_amount': {'currency': 'EUR', 'amount': '500.00'},
            'credit_debit_indicator': 'DBIT', 'status': 'BOOK', 'booking_date': '2026-01-05',
            'creditor': {'name': 'OWN TRANSFER'}, 'remittance_information': [],
        }
        argenta_inflow = {
            'entry_reference': 'argenta-in', 'transaction_amount': {'currency': 'EUR', 'amount': '500.00'},
            'credit_debit_indicator': 'CRDT', 'status': 'BOOK', 'booking_date': '2026-01-05',
            'debtor': {'name': 'OWN TRANSFER'}, 'remittance_information': [],
        }

        def fake_iter(session_id, account_uid, **kwargs):
            return iter([kbc_outflow]) if account_uid == 'acc-1' else iter([argenta_inflow])

        mock_iter.side_effect = fake_iter
        sync_enablebanking_transactions()

        self.assertEqual(BankTransaction.objects.get(external_id='enablebanking:kbc:acc-1:kbc-out').category, 'TRANSFER')
        self.assertEqual(BankTransaction.objects.get(external_id='enablebanking:argenta:acc-2:argenta-in').category, 'TRANSFER')
