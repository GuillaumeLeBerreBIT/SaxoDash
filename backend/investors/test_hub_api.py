from datetime import date

from django.contrib.auth.models import User
from django.urls import reverse
from rest_framework.test import APITestCase

from .factories import make_investor, store_quarter

Q1 = date(2026, 3, 31)
Q2 = date(2026, 6, 30)


class HubApiTest(APITestCase):
    def setUp(self):
        self.client.force_authenticate(User.objects.create_user('me', password='x'))
        investor = make_investor(followed=True, last_filing_at=date(2026, 8, 14))
        store_quarter(investor, Q1, [('037833100', 'APPLE INC', 10, 600)])
        store_quarter(investor, Q2, [('037833100', 'APPLE INC', 10, 600), ('67066G104', 'NVIDIA CORP', 1, 400)])

    def test_the_hub_needs_a_login(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(reverse('investor-hub')).status_code, 401)

    def test_the_hub_is_not_mistaken_for_an_investor_slug(self):
        response = self.client.get(reverse('investor-hub'))

        self.assertEqual(response.status_code, 200)
        self.assertEqual((response.data['quarter'], response.data['filed'], response.data['tracked']), ('2026-06-30', 1, 1))
        self.assertEqual([shelf['key'] for shelf in response.data['shelves']], ['following', 'new-bets', 'just-filed'])

    def test_stocks_default_to_most_bought(self):
        response = self.client.get(reverse('investor-stocks'))

        self.assertEqual((response.status_code, response.data['view']), (200, 'bought'))
        self.assertEqual([row['issuer'] for row in response.data['rows']], ['NVIDIA CORP'])

    def test_stocks_take_a_view_and_a_quarter(self):
        response = self.client.get(reverse('investor-stocks'), {'view': 'owned', 'quarter': '2026-03-31'})

        self.assertEqual(response.data['quarter'], '2026-03-31')
        self.assertEqual([row['issuer'] for row in response.data['rows']], ['APPLE INC'])

    def test_an_unknown_view_is_400(self):
        self.assertEqual(self.client.get(reverse('investor-stocks'), {'view': 'hot'}).status_code, 400)

    def test_a_malformed_quarter_is_400(self):
        self.assertEqual(self.client.get(reverse('investor-stocks'), {'quarter': 'Q2'}).status_code, 400)
