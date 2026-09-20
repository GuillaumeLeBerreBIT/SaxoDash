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

    def test_matches_carrefour_branch_abbreviation(self):
        # KBC statements abbreviate Carrefour franchises as "CRF EXP/HYP/MKT
        # <city>" rather than spelling out "CARREFOUR".
        self.assertEqual(categorize('CRF EXP OOSTEND', '', Decimal('-8')), 'GROCERIES')
        self.assertEqual(categorize('CRF MKT ZEDELGE', '', Decimal('-8')), 'GROCERIES')

    def test_matches_total_fuel_station_without_energies_suffix(self):
        self.assertEqual(categorize('TOTAL', '', Decimal('-60')), 'TRANSPORT')

    def test_matches_parking_operator(self):
        self.assertEqual(categorize('PARKING STATION', '', Decimal('-4')), 'TRANSPORT')

    def test_matches_mobile_viking_telecom(self):
        self.assertEqual(categorize('Mobile Vikings', '', Decimal('-15')), 'UTILITIES')

    def test_matches_dentist_and_english_pharmacy_spelling(self):
        self.assertEqual(categorize('TANDARTS FILIP WILLE', '', Decimal('-40')), 'HEALTH')
        self.assertEqual(categorize('LOLIS PHARMACY OMONOIA', '', Decimal('-12')), 'HEALTH')

    def test_matches_gamma_diy_store_and_common_clothing_retailers(self):
        self.assertEqual(categorize('GAMMA OOSTKAMP 890', '', Decimal('-30')), 'SHOPPING')
        self.assertEqual(categorize('ZARA', '', Decimal('-50')), 'SHOPPING')
        self.assertEqual(categorize('JACK & JONES BRUGGE', '', Decimal('-50')), 'SHOPPING')
        self.assertEqual(categorize('ABERCROMBIE', '', Decimal('-50')), 'SHOPPING')
