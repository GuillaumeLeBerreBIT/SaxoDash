from datetime import date

from django.test import TestCase

from accounts.models import BankAccount

from .models import BankTransaction, ManualIbanLabel
from .transfers import mark_transfers


class MarkTransfersTest(TestCase):
    def setUp(self):
        self.kbc = BankAccount.objects.create(
            bank='KBC', type='Current account', iban_masked='BE12 •••• •••• 0001',
            balance=100, available=100, external_id='enablebanking:kbc:acc-1',
        )
        self.argenta = BankAccount.objects.create(
            bank='Argenta', type='Current account', iban_masked='BE12 •••• •••• 0002',
            balance=100, available=100, external_id='enablebanking:argenta:acc-2',
        )
        self.savings = BankAccount.objects.create(
            bank='Argenta', type='Savings account', iban_masked='BE12 •••• •••• 0003',
            balance=100, available=100, external_id='enablebanking:argenta:acc-3',
        )

    def test_matches_opposite_leg_within_batch_and_tags_transfer(self):
        outflow = BankTransaction(
            bank='kbc', bank_account=self.kbc, external_id='o1', amount=-500,
            currency='EUR', booking_date=date(2026, 1, 5), category='OTHER',
        )
        inflow = BankTransaction(
            bank='argenta', bank_account=self.argenta, external_id='i1', amount=500,
            currency='EUR', booking_date=date(2026, 1, 6), category='REFUND_CREDIT',
        )
        mark_transfers([outflow, inflow])
        self.assertEqual(outflow.category, 'TRANSFER')
        self.assertEqual(inflow.category, 'TRANSFER')

    def test_matches_against_already_persisted_transactions(self):
        BankTransaction.objects.create(
            bank='argenta', bank_account=self.argenta, external_id='saved-inflow', amount=200,
            currency='EUR', booking_date=date(2026, 1, 10), category='REFUND_CREDIT',
        )
        outflow = BankTransaction(
            bank='kbc', bank_account=self.kbc, external_id='o2', amount=-200,
            currency='EUR', booking_date=date(2026, 1, 11), category='OTHER',
        )
        mark_transfers([outflow])
        self.assertEqual(outflow.category, 'TRANSFER')

    def test_destination_savings_account_tags_savings_not_transfer(self):
        outflow = BankTransaction(
            bank='argenta', bank_account=self.argenta, external_id='o3', amount=-300,
            currency='EUR', booking_date=date(2026, 1, 12), category='OTHER',
        )
        inflow = BankTransaction(
            bank='argenta', bank_account=self.savings, external_id='i3', amount=300,
            currency='EUR', booking_date=date(2026, 1, 12), category='REFUND_CREDIT',
        )
        mark_transfers([outflow, inflow])
        self.assertEqual(outflow.category, 'SAVINGS')
        self.assertEqual(inflow.category, 'SAVINGS')

    def test_withdrawal_from_savings_account_tags_savings_both_legs(self):
        outflow = BankTransaction(
            bank='argenta', bank_account=self.savings, external_id='o7', amount=-400,
            currency='EUR', booking_date=date(2026, 1, 20), category='OTHER',
        )
        inflow = BankTransaction(
            bank='kbc', bank_account=self.kbc, external_id='i7', amount=400,
            currency='EUR', booking_date=date(2026, 1, 20), category='REFUND_CREDIT',
        )
        mark_transfers([outflow, inflow])
        self.assertEqual(outflow.category, 'SAVINGS')
        self.assertEqual(inflow.category, 'SAVINGS')

    def test_no_match_leaves_category_untouched(self):
        tx = BankTransaction(
            bank='kbc', bank_account=self.kbc, external_id='o4', amount=-45,
            currency='EUR', booking_date=date(2026, 1, 13), category='GROCERIES',
        )
        mark_transfers([tx])
        self.assertEqual(tx.category, 'GROCERIES')

    def test_manual_iban_label_match_uses_its_category(self):
        ManualIbanLabel.objects.create(iban='BE99000000000000', label='External Savings', category='SAVINGS')
        tx = BankTransaction(
            bank='kbc', bank_account=self.kbc, external_id='o5', amount=-100,
            currency='EUR', booking_date=date(2026, 1, 14), category='OTHER',
            counterparty_iban='BE99000000000000',
        )
        mark_transfers([tx])
        self.assertEqual(tx.category, 'SAVINGS')

    def test_same_account_outflow_and_inflow_do_not_match_each_other(self):
        outflow = BankTransaction(
            bank='kbc', bank_account=self.kbc, external_id='o6', amount=-80,
            currency='EUR', booking_date=date(2026, 1, 15), category='OTHER',
        )
        inflow = BankTransaction(
            bank='kbc', bank_account=self.kbc, external_id='i6', amount=80,
            currency='EUR', booking_date=date(2026, 1, 15), category='REFUND_CREDIT',
        )
        mark_transfers([outflow, inflow])
        self.assertEqual(outflow.category, 'OTHER')
