from django.core.exceptions import ValidationError
from django.test import TestCase

from accounts.models import BankAccount

from .models import BankSyncRun, BankTransaction, ManualIbanLabel, Subscription


class BankTransactionModelTest(TestCase):
    def setUp(self):
        self.account = BankAccount.objects.create(
            bank='KBC', type='Current account', iban_masked='BE12 •••• •••• 7392',
            balance=100, available=100, external_id='enablebanking:kbc:acc-1',
        )

    def test_effective_category_falls_back_to_category(self):
        tx = BankTransaction.objects.create(
            bank='kbc', bank_account=self.account, external_id='e1',
            amount=-10, currency='EUR', booking_date='2026-01-01',
            counterparty_name='COLRUYT', category='GROCERIES',
        )
        self.assertEqual(tx.effective_category, 'GROCERIES')

    def test_effective_category_prefers_override(self):
        tx = BankTransaction.objects.create(
            bank='kbc', bank_account=self.account, external_id='e2',
            amount=-10, currency='EUR', booking_date='2026-01-01',
            counterparty_name='COLRUYT', category='GROCERIES', category_override='DINING',
        )
        self.assertEqual(tx.effective_category, 'DINING')

    def test_external_id_is_unique(self):
        BankTransaction.objects.create(
            bank='kbc', bank_account=self.account, external_id='dup',
            amount=-10, currency='EUR', booking_date='2026-01-01',
        )
        with self.assertRaises(Exception):
            BankTransaction.objects.create(
                bank='kbc', bank_account=self.account, external_id='dup',
                amount=-20, currency='EUR', booking_date='2026-01-02',
            )


class SubscriptionModelTest(TestCase):
    def test_defaults(self):
        sub = Subscription.objects.create(
            merchant_key='NETFLIX', display_name='NETFLIX.COM', category='SUBSCRIPTIONS',
            expected_amount=12.99, cadence='monthly', last_charged='2026-01-01',
        )
        self.assertFalse(sub.dismissed)

    def test_merchant_key_is_unique(self):
        Subscription.objects.create(
            merchant_key='NETFLIX', display_name='NETFLIX.COM', category='SUBSCRIPTIONS',
            expected_amount=12.99, cadence='monthly', last_charged='2026-01-01',
        )
        with self.assertRaises(Exception):
            Subscription.objects.create(
                merchant_key='NETFLIX', display_name='NETFLIX.COM', category='SUBSCRIPTIONS',
                expected_amount=9.99, cadence='monthly', last_charged='2026-02-01',
            )


class ManualIbanLabelModelTest(TestCase):
    def test_defaults(self):
        label = ManualIbanLabel.objects.create(iban='BE00', label='Argenta Savings')
        self.assertEqual(label.category, 'SAVINGS')

    def test_can_be_created_by_counterparty_name_alone_with_no_iban(self):
        # The residual case ManualIbanLabel can't match by IBAN at all - a
        # Bancontact/instant-payment row Enable Banking never structured a
        # counterparty_iban for.
        label = ManualIbanLabel.objects.create(counterparty_name='Guillaume Le Berre', label='My other account')
        self.assertIsNone(label.iban)
        self.assertEqual(label.counterparty_name, 'GUILLAUME LE BERRE')  # normalized on save

    def test_requires_at_least_one_of_iban_or_counterparty_name(self):
        label = ManualIbanLabel(label='Nothing to match on')
        with self.assertRaises(ValidationError):
            label.full_clean()

    def test_two_rows_with_no_iban_do_not_collide(self):
        # NULL != NULL for uniqueness - two counterparty_name-only rows must
        # not be treated as duplicates of each other just because both leave
        # iban blank.
        ManualIbanLabel.objects.create(counterparty_name='Alex', label='Alex')
        ManualIbanLabel.objects.create(counterparty_name='Sam', label='Sam')
        self.assertEqual(ManualIbanLabel.objects.count(), 2)


class BankSyncRunKindTest(TestCase):
    def test_kind_defaults_to_balances(self):
        run = BankSyncRun.objects.create(bank='kbc', outcome='ok')
        self.assertEqual(run.kind, 'balances')

    def test_kind_can_be_transactions(self):
        run = BankSyncRun.objects.create(bank='kbc', kind='transactions', outcome='ok')
        self.assertEqual(run.kind, 'transactions')
