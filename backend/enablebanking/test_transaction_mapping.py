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

    def test_pos_card_payment_falls_back_to_merchant_name_in_description(self):
        # KBC's Bancontact POS payments (bank_transaction_code CCRD/POSD)
        # leave creditor null - the debtor is the cardholder, never the
        # merchant - so the merchant only exists as leading free text before
        # the postcode/date/card-number tail. Verified live 2026-09-20.
        raw = {
            'entry_reference': 'e-3',
            'transaction_amount': {'currency': 'EUR', 'amount': '96.00'},
            'credit_debit_indicator': 'DBIT',
            'status': 'BOOK',
            'booking_date': '2026-09-21',
            'creditor': None,
            'debtor': {'name': 'LE BERRE GUILLAUME'},
            'remittance_information': [
                'Cherry Picker BE8000 BRUGGE Betaling met KBC-Debetkaart via Bancontact '
                '19-09-2026 om 15.32 uur 5127 88XX XXXX 9803 LE BERRE GUILLAUME',
            ],
        }
        fields = to_bank_transaction_fields('kbc', 'acc-1', raw)
        self.assertEqual(fields['counterparty_name'], 'Cherry Picker')

    def test_pos_card_payment_fallback_stops_before_a_leading_store_number(self):
        raw = {
            'entry_reference': 'e-4',
            'transaction_amount': {'currency': 'EUR', 'amount': '12.34'},
            'credit_debit_indicator': 'DBIT',
            'status': 'BOOK',
            'booking_date': '2026-09-19',
            'creditor': None,
            'debtor': {'name': 'LE BERRE GUILLAUME'},
            'remittance_information': [
                'KRUIDVAT 8924 OOSTKAMP BE8020 OOSTKAMP Betaling met KBC-Debetkaart via '
                'Bancontact 19-09-2026 om 12.49 uur 5127 88XX XXXX 9803 LE BERRE GUILLAUME',
            ],
        }
        fields = to_bank_transaction_fields('kbc', 'acc-1', raw)
        self.assertEqual(fields['counterparty_name'], 'KRUIDVAT')

    def test_fallback_keeps_full_text_when_no_token_has_a_digit(self):
        raw = {
            'entry_reference': 'e-5',
            'transaction_amount': {'currency': 'EUR', 'amount': '7.50'},
            'credit_debit_indicator': 'DBIT',
            'status': 'BOOK',
            'booking_date': '2026-08-31',
            'creditor': None,
            'debtor': None,
            'remittance_information': ['Bijdrage KBC-Basisrekening'],
        }
        fields = to_bank_transaction_fields('kbc', 'acc-1', raw)
        self.assertEqual(fields['counterparty_name'], 'Bijdrage KBC-Basisrekening')

    def test_structured_creditor_name_is_never_overridden_by_the_fallback(self):
        fields = to_bank_transaction_fields('kbc', 'acc-1', DEBIT_RAW)
        self.assertEqual(fields['counterparty_name'], 'COLRUYT ANTWERPEN')

    def test_fallback_is_blank_when_there_is_no_remittance_information_either(self):
        raw = {**DEBIT_RAW, 'creditor': None, 'remittance_information': []}
        fields = to_bank_transaction_fields('kbc', 'acc-1', raw)
        self.assertEqual(fields['counterparty_name'], '')

    def test_fallback_keeps_a_merchant_name_that_starts_with_a_digit(self):
        # "2TheLoo" is a real cafe chain - a naive "stop at any digit" rule
        # would truncate it to '' immediately. Only a mostly-digit token
        # (postcode, date, card number) should end the merchant name.
        raw = {
            'entry_reference': 'e-6',
            'transaction_amount': {'currency': 'EUR', 'amount': '4.20'},
            'credit_debit_indicator': 'DBIT',
            'status': 'BOOK',
            'booking_date': '2026-09-01',
            'creditor': None,
            'debtor': {'name': 'LE BERRE GUILLAUME'},
            'remittance_information': [
                '2THELOO NMBS Gent St P BE9000 Gent Betaling met KBC-Debetkaart via '
                'Debit Mastercard 01-09-2026 om 17.35 uur 5127 88XX XXXX 9803 LE BERRE GUILLAUME',
            ],
        }
        fields = to_bank_transaction_fields('kbc', 'acc-1', raw)
        self.assertEqual(fields['counterparty_name'], '2THELOO NMBS Gent St P')
