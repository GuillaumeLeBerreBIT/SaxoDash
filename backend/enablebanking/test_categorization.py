from decimal import Decimal

from django.test import TestCase

from .categorization import categorize


class CategorizeTest(TestCase):
    def test_matches_groceries_merchant(self):
        self.assertEqual(categorize('COLRUYT ANTWERPEN', '', Decimal('-42.10')), 'GROCERIES')

    def test_matches_subscriptions_merchant(self):
        self.assertEqual(categorize('NETFLIX.COM', 'Netflix monthly', Decimal('-12.99')), 'SUBSCRIPTIONS')

    def test_matches_on_description_when_name_is_generic(self):
        self.assertEqual(categorize('PAYMENT', 'SPOTIFY AB', Decimal('-10.99')), 'SUBSCRIPTIONS')

    def test_matching_is_case_insensitive(self):
        self.assertEqual(categorize('colruyt group', '', Decimal('-5')), 'GROCERIES')

    def test_unmatched_debit_falls_back_to_other(self):
        self.assertEqual(categorize('SOME RANDOM SHOP', '', Decimal('-5')), 'OTHER')

    def test_unmatched_credit_falls_back_to_refund_credit(self):
        self.assertEqual(categorize('UNKNOWN SENDER', '', Decimal('50')), 'REFUND_CREDIT')

    def test_refund_from_known_merchant_matches_its_spending_category(self):
        self.assertEqual(categorize('COLRUYT ANTWERPEN', 'Refund', Decimal('12.34')), 'GROCERIES')
