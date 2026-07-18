from django.test import TestCase
from datetime import datetime, date
from django.test import TestCase
from transactions.models import Transaction
from decimal import Decimal
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase
from django.contrib.auth.models import User

class TransactioModelTest(TestCase):
    def test_create_transaction(self):
        tx = Transaction.objects.create(
            date=date(2026, 4, 22), type='BUY', instrument='NVIDIA Corporation',
            ticker='NVDA', qty=Decimal('5'), price=Decimal('870.20'), account='Saxo',
        )
        
        self.assertEqual(Transaction.objects.count(), 1)
        self.assertEqual(tx.type, 'BUY')

    def test_default_ordering_is_newest_first(self):
        older = Transaction.objects.create(
            date=date(2026, 3, 1), type='BUY', instrument='A', ticker='A',
            qty=Decimal('1'), price=Decimal('1'), account='Saxo',
        )
        newer = Transaction.objects.create(
            date=date(2026, 4, 1), type='BUY', instrument='B', ticker='B',
            qty=Decimal('1'), price=Decimal('1'), account='Saxo',
        )
        self.assertEqual(list(Transaction.objects.all()), [newer, older])
        
class TransactionAPITest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='alex', password='pw')
        self.token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token.key}')

        Transaction.objects.create(
            date=date(2026, 1, 10), type='BUY', instrument='NVIDIA', ticker='NVDA',
            qty=Decimal('5'), price=Decimal('100.00'), account='Saxo',
        )
        Transaction.objects.create(
            date=date(2026, 3, 5), type='DIVIDEND', instrument='NVIDIA', ticker='NVDA',
            qty=Decimal('1'), price=Decimal('12.50'), account='Saxo',
        )

    def test_requires_auth(self):
        self.client.credentials()
        response = self.client.get('/api/transactions/')
        self.assertEqual(response.status_code, 401)

    def test_list_paginated_shape(self):
        response = self.client.get('/api/transactions/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('results', response.data)
        self.assertEqual(response.data['count'], 2)

    def test_computed_total_field(self):
        response = self.client.get('/api/transactions/')
        buy = next(t for t in response.data['results'] if t['type'] == 'BUY')
        self.assertEqual(buy['total'], Decimal('500.00'))  # 5 * 100.00

    def test_filter_by_type(self):
        response = self.client.get('/api/transactions/?type=DIVIDEND')
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['type'], 'DIVIDEND')

    def test_filter_by_date_range(self):
        response = self.client.get('/api/transactions/?date_from=2026-02-01&date_to=2026-12-31')
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['type'], 'DIVIDEND')
