from datetime import date

from django.contrib.auth.models import User
from django.urls import reverse
from rest_framework.test import APITestCase

from .factories import make_investor, store_quarter
from .models import Security

Q1 = date(2026, 3, 31)
Q2 = date(2026, 6, 30)


class InvestorChangesApiTest(APITestCase):
    def setUp(self):
        self.client.force_authenticate(User.objects.create_user('me', password='x'))
        self.investor = make_investor()
        store_quarter(self.investor, Q1, [
            ('037833100', 'APPLE INC', 100, 600), ('02005N100', 'ALLY FINL INC', 5, 400),
            ('084670702', 'BERKSHIRE HATHAWAY INC', 10, 100),
        ])
        store_quarter(self.investor, Q2, [
            ('037833100', 'APPLE INC', 110, 700), ('67066G104', 'NVIDIA CORP', 1, 200),
            ('67066G104', 'NVIDIA CORP', 1, 50, 'CALL'), ('084670702', 'BERKSHIRE HATHAWAY INC', 10, 50),
        ])
        Security.objects.create(cusip='037833100', ticker='AAPL')
        Security.objects.create(cusip='67066G104', ticker='NVDA')

    def url(self, slug='berkshire-hathaway'):
        return reverse('investor-changes', args=[slug])

    def test_groups_new_added_trimmed_and_sold_out_with_value_changes(self):
        data = self.client.get(self.url()).data

        self.assertEqual((data['quarter'], data['previous_quarter']), ('2026-06-30', '2026-03-31'))
        self.assertEqual([(i['ticker'], i['put_call'], i['value_change']) for i in data['new']],
                         [('NVDA', '', 200), ('NVDA', 'CALL', 50)])
        self.assertEqual(data['added'], [{
            'cusip': '037833100', 'put_call': '', 'ticker': 'AAPL', 'issuer': 'APPLE INC',
            'shares': 110, 'previous_shares': 100, 'shares_change_pct': 10.0,
            'value': 700, 'previous_value': 600, 'value_change': 100,
            'weight': 70.0, 'previous_weight': 54.55,
        }])
        self.assertEqual(data['trimmed'], [])

    def test_a_sold_out_position_comes_from_the_previous_quarter(self):
        sold = self.client.get(self.url()).data['sold_out']

        self.assertEqual(sold, [{
            'cusip': '02005N100', 'put_call': '', 'ticker': None, 'issuer': 'ALLY FINL INC',
            'shares': None, 'previous_shares': 5, 'shares_change_pct': -100.0,
            'value': None, 'previous_value': 400, 'value_change': -400,
            'weight': None, 'previous_weight': 36.36,
        }])

    def test_a_kept_position_with_unchanged_shares_is_in_no_group(self):
        data = self.client.get(self.url()).data
        listed = {i['cusip'] for group in ('new', 'added', 'trimmed', 'sold_out') for i in data[group]}
        self.assertNotIn('084670702', listed)

    def test_a_first_stored_quarter_has_nothing_to_compare(self):
        data = self.client.get(self.url(), {'quarter': '2026-03-31'}).data

        self.assertEqual((data['quarter'], data['previous_quarter']), ('2026-03-31', None))
        self.assertEqual([data[g] for g in ('new', 'added', 'trimmed', 'sold_out')], [[], [], [], []])

    def test_an_empty_investor_answers_empty(self):
        make_investor(name='Bill Ackman', firm='Pershing Square', cik=1336528, slug='pershing-square')

        data = self.client.get(self.url('pershing-square')).data

        self.assertEqual((data['quarter'], data['previous_quarter'], data['new']), (None, None, []))

    def test_a_quarter_not_stored_is_404(self):
        self.assertEqual(self.client.get(self.url(), {'quarter': '2025-12-31'}).status_code, 404)

    def test_a_malformed_quarter_is_400(self):
        self.assertEqual(self.client.get(self.url(), {'quarter': 'Q2'}).status_code, 400)

    def test_an_unknown_investor_is_404(self):
        self.assertEqual(self.client.get(self.url('nobody')).status_code, 404)
