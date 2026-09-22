from decimal import Decimal

from django.test import TestCase

from accounts.models import BankAccount

from .models import BankTransaction, ManualIbanLabel
from .recategorize import recategorize, recategorize_for_label


class RecategorizeTest(TestCase):
    """Pure computation (no persistence) - the caller decides whether to
    write `changed` back. Used by both the management command (dry-run
    reporting) and the labeled-accounts API (apply immediately on save)."""

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

    def test_returns_only_the_rows_whose_category_actually_changed(self):
        ManualIbanLabel.objects.create(counterparty_name='Guillaume Le Berre', label='Mine', category='TRANSFER')
        self._tx('GUILLAUME LE BERRE', '300', 't1', category='REFUND_CREDIT')
        self._tx('COLRUYT ANTWERPEN', '-40', 't2', category='GROCERIES')  # already correct, no-op

        changed = recategorize()

        self.assertEqual(len(changed), 1)
        self.assertEqual(changed[0].category, 'TRANSFER')

    def test_does_not_persist_by_itself(self):
        ManualIbanLabel.objects.create(counterparty_name='Guillaume Le Berre', label='Mine', category='TRANSFER')
        tx = self._tx('GUILLAUME LE BERRE', '300', 't3', category='REFUND_CREDIT')

        recategorize()

        tx.refresh_from_db()
        self.assertEqual(tx.category, 'REFUND_CREDIT')  # unwritten until the caller persists

    def test_never_considers_a_manual_override(self):
        tx = self._tx(
            'TRANSPORT & LOGISTICS COMPETENCE CE', '4104.12', 't4',
            category='REFUND_CREDIT', override='SHOPPING',
        )

        changed = recategorize()

        self.assertEqual(changed, [])
        tx.refresh_from_db()
        self.assertEqual(tx.category, 'REFUND_CREDIT')

    def test_accepts_a_narrower_queryset(self):
        # The labeled-accounts API only wants to touch rows matching the
        # label just saved, not the whole table, on every keystroke-adjacent
        # save.
        ManualIbanLabel.objects.create(counterparty_name='Guillaume Le Berre', label='Mine', category='TRANSFER')
        self._tx('GUILLAUME LE BERRE', '300', 't5', category='REFUND_CREDIT')
        other = self._tx('TRANSPORT & LOGISTICS COMPETENCE CE', '4104.12', 't6', category='REFUND_CREDIT')

        changed = recategorize(BankTransaction.objects.filter(counterparty_name='GUILLAUME LE BERRE'))

        self.assertEqual(len(changed), 1)
        other.refresh_from_db()
        self.assertEqual(other.category, 'REFUND_CREDIT')  # untouched - outside the narrower queryset

    def test_recategorize_for_label_applies_and_persists_immediately(self):
        # The point of the API (vs. the management command): a label saved
        # through the UI takes effect right away, not at the next sync or a
        # manually-run command.
        label = ManualIbanLabel.objects.create(
            counterparty_name='Guillaume Le Berre', label='Mine', category='TRANSFER',
        )
        tx = self._tx('GUILLAUME LE BERRE', '300', 't8', category='REFUND_CREDIT')

        changed = recategorize_for_label(label)

        self.assertEqual(len(changed), 1)
        tx.refresh_from_db()
        self.assertEqual(tx.category, 'TRANSFER')  # already persisted

    def test_recategorize_for_label_by_iban_only_touches_matching_rows(self):
        label = ManualIbanLabel.objects.create(iban='BE99000000000000', label='Household', category='TRANSFER')
        matching = self._tx('SOME PERSON', '-50', 't9', iban='BE99000000000000', category='OTHER')
        other = self._tx('SOME PERSON', '-50', 't10', iban='BE11111111111111', category='OTHER')

        recategorize_for_label(label)

        matching.refresh_from_db()
        other.refresh_from_db()
        self.assertEqual(matching.category, 'TRANSFER')
        self.assertEqual(other.category, 'OTHER')

    def test_a_custom_queryset_still_respects_a_manual_override(self):
        # The override guarantee must hold regardless of which queryset a
        # caller passes in, not just the default one.
        ManualIbanLabel.objects.create(counterparty_name='Guillaume Le Berre', label='Mine', category='TRANSFER')
        tx = self._tx(
            'GUILLAUME LE BERRE', '300', 't7', category='REFUND_CREDIT', override='SHOPPING',
        )

        changed = recategorize(BankTransaction.objects.filter(counterparty_name='GUILLAUME LE BERRE'))

        self.assertEqual(changed, [])
        tx.refresh_from_db()
        self.assertEqual(tx.category, 'REFUND_CREDIT')
