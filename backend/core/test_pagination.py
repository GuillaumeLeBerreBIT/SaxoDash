from datetime import date
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from core.pagination import StandardPagination
from transactions.models import Transaction


class PageSizeQueryParamTest(APITestCase):
    def setUp(self):
        user = User.objects.create_user(username='alex', password='pw')
        token = RefreshToken.for_user(user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        Transaction.objects.bulk_create([
            Transaction(
                date=date(2026, 1, 1), type='BUY', instrument=f'Inst {n}',
                ticker=f'T{n}', qty=Decimal('1'), price=Decimal('1.00'),
                account='Saxo',
            )
            for n in range(25)
        ])

    def results(self, query=''):
        response = self.client.get(f'/api/transactions/{query}')
        self.assertEqual(response.status_code, 200)
        return response.data['results']

    def test_defaults_to_twenty_rows(self):
        self.assertEqual(len(self.results()), 20)

    def test_page_size_is_honoured(self):
        self.assertEqual(len(self.results('?page_size=5')), 5)

    def test_page_size_above_the_default_is_honoured(self):
        self.assertEqual(len(self.results('?page_size=25')), 25)

    def test_page_size_is_capped_at_max_page_size(self):
        with patch.object(StandardPagination, 'max_page_size', 7):
            self.assertEqual(len(self.results('?page_size=500')), 7)

    def test_an_invalid_page_size_falls_back_to_the_default(self):
        self.assertEqual(len(self.results('?page_size=abc')), 20)

    def test_the_cap_covers_the_transactions_page_request(self):
        self.assertGreaterEqual(StandardPagination.max_page_size, 1000)
