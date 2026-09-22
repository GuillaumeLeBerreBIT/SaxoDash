from decimal import Decimal
from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from accounts.models import BankAccount

from .models import BankTransaction, ManualIbanLabel


class RecategorizeBankTransactionsCommandTest(TestCase):
    """Rule changes (new INCOME/TRANSFER keywords, a new ManualIbanLabel row)
    only apply to transactions fetched by a future sync - this command
    re-applies them to what's already stored, since the historical rows
    that prompted the rule change in the first place are exactly the ones
    that need fixing."""

    def setUp(self):
        self.account = BankAccount.objects.create(
            bank='KBC', type='Current account', iban_masked='BE12 •••• •••• 0001',
            balance=100, available=100, external_id='enablebanking:kbc:acc-1',
        )

    def _tx(self, name, amount, external_id, iban=None, category='OTHER', override=None):
        return BankTransaction.objects.create(
            bank='kbc', bank_account=self.account, external_id=external_id,
            amount=Decimal(amount), currency='EUR', booking_date='2026-07-01',
            counterparty_name=name, counterparty_iban=iban,
            category=category, category_override=override,
        )

    def test_recategorizes_a_now_recognized_income_source(self):
        tx = self._tx('TRANSPORT & LOGISTICS COMPETENCE CE', '4104.12', 't1', category='REFUND_CREDIT')

        call_command('recategorize_bank_transactions', '--apply', stdout=StringIO())

        tx.refresh_from_db()
        self.assertEqual(tx.category, 'INCOME')

    def test_applies_a_manual_iban_label_added_after_the_row_was_synced(self):
        ManualIbanLabel.objects.create(iban='BE12345678901234', label='Household', category='TRANSFER')
        tx = self._tx('SOME PERSON', '-50', 't2', iban='BE12345678901234', category='OTHER')

        call_command('recategorize_bank_transactions', '--apply', stdout=StringIO())

        tx.refresh_from_db()
        self.assertEqual(tx.category, 'TRANSFER')

    def test_applies_a_manual_name_label_to_a_row_with_no_iban(self):
        ManualIbanLabel.objects.create(counterparty_name='Guillaume Le Berre', label='My other account', category='TRANSFER')
        tx = self._tx('GUILLAUME LE BERRE', '300', 't5', category='REFUND_CREDIT')  # no iban=

        call_command('recategorize_bank_transactions', '--apply', stdout=StringIO())

        tx.refresh_from_db()
        self.assertEqual(tx.category, 'TRANSFER')

    def test_never_touches_a_manual_override(self):
        tx = self._tx(
            'TRANSPORT & LOGISTICS COMPETENCE CE', '4104.12', 't3',
            category='REFUND_CREDIT', override='SHOPPING',
        )

        call_command('recategorize_bank_transactions', '--apply', stdout=StringIO())

        tx.refresh_from_db()
        self.assertEqual(tx.category, 'REFUND_CREDIT')  # untouched
        self.assertEqual(tx.effective_category, 'SHOPPING')  # override still wins

    def test_dry_run_reports_without_writing(self):
        tx = self._tx('TRANSPORT & LOGISTICS COMPETENCE CE', '4104.12', 't4', category='REFUND_CREDIT')
        out = StringIO()

        call_command('recategorize_bank_transactions', stdout=out)

        tx.refresh_from_db()
        self.assertEqual(tx.category, 'REFUND_CREDIT')  # unchanged
        self.assertIn('1 transaction', out.getvalue())
        self.assertIn('dry run', out.getvalue().lower())
