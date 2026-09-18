from decimal import Decimal

from django.test import TestCase

from .mapping import to_bank_transaction_fields

DEBIT_RAW = {
    'entry_reference': 'e-1',
    'transaction_amount': {'currency': 'EUR', 'amount': '42.10'},
    'credit_debit_indicator': 'DBIT',
    'status': 'BOOK',
    'booking_date': '2026-01-05',
    'creditor': {'name': 'COLRUYT ANTWERPEN'},
    'creditor_account': {'iban': 'BE00111122223333'},
    'remittance_information': ['Card payment'],
}

CREDIT_RAW = {
    'entry_reference': 'e-2',
    'transaction_amount': {'currency': 'EUR', 'amount': '500.00'},
    'credit_debit_indicator': 'CRDT',
    'status': 'BOOK',
    'booking_date': '2026-01-06',
    'debtor': {'name': 'ACME CORP'},
    'debtor_account': {'iban': 'BE99999988887777'},
    'remittance_information': ['RF12345', 'Salary'],
}


class ToBankTransactionFieldsTest(TestCase):
    def test_debit_is_negative_and_uses_creditor_as_counterparty(self):
        fields = to_bank_transaction_fields('kbc', 'acc-1', DEBIT_RAW)
        self.assertEqual(fields['amount'], Decimal('-42.10'))
        self.assertEqual(fields['counterparty_name'], 'COLRUYT ANTWERPEN')
        self.assertEqual(fields['counterparty_iban'], 'BE00111122223333')

    def test_credit_is_positive_and_uses_debtor_as_counterparty(self):
        fields = to_bank_transaction_fields('kbc', 'acc-1', CREDIT_RAW)
        self.assertEqual(fields['amount'], Decimal('500.00'))
        self.assertEqual(fields['counterparty_name'], 'ACME CORP')

    def test_external_id_includes_bank_account_and_entry_reference(self):
        fields = to_bank_transaction_fields('kbc', 'acc-1', DEBIT_RAW)
        self.assertEqual(fields['external_id'], 'enablebanking:kbc:acc-1:e-1')

    def test_remittance_information_is_joined(self):
        fields = to_bank_transaction_fields('kbc', 'acc-1', CREDIT_RAW)
        self.assertEqual(fields['description'], 'RF12345 Salary')

    def test_missing_counterparty_account_gives_none_iban(self):
        raw = {**DEBIT_RAW, 'creditor_account': None}
        fields = to_bank_transaction_fields('kbc', 'acc-1', raw)
        self.assertIsNone(fields['counterparty_iban'])
