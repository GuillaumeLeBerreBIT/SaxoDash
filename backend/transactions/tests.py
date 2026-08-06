from django.test import TestCase
from datetime import datetime, date
from django.test import TestCase
from transactions.models import Transaction
from decimal import Decimal
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.test import APITestCase
from django.contrib.auth.models import User
from transactions.services import get_monthly_cash_flow
from django.db.utils import IntegrityError
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
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')

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


class MonthlyCashFlowServiceTest(TestCase):
    def setUp(self):
        Transaction.objects.create(
            date=date(2026, 6, 1), type='DEPOSIT', instrument='Cash Deposit',
            ticker='-', qty=Decimal('1'), price=Decimal('1000.00'), account='Saxo',
        )
        Transaction.objects.create(
            date=date(2026, 6, 15), type='DIVIDEND', instrument='NVIDIA Corporation',
            ticker='NVDA', qty=Decimal('1'), price=Decimal('50.00'), account='Saxo',
        )
        Transaction.objects.create(
            date=date(2026, 6, 20), type='FEE', instrument='Brokerage Fee',
            ticker='-', qty=Decimal('1'), price=Decimal('10.00'), account='Saxo',
        )
        Transaction.objects.create(
            date=date(2026, 6, 10), type='BUY', instrument='NVIDIA Corporation',
            ticker='NVDA', qty=Decimal('2'), price=Decimal('700.00'), account='Saxo',
        )
        Transaction.objects.create(
            date=date(2026, 7, 5), type='DEPOSIT', instrument='Cash Deposit',
            ticker='-', qty=Decimal('1'), price=Decimal('300.00'), account='Saxo',
        )

    def test_groups_by_month_and_sums_inflow_outflow(self):
        result = get_monthly_cash_flow()
        by_month = {row['month']: row for row in result}

        self.assertEqual(by_month['2026-06']['inflow'], Decimal('1050.00'))
        self.assertEqual(by_month['2026-06']['outflow'], Decimal('10.00'))
        self.assertEqual(by_month['2026-07']['inflow'], Decimal('300.00'))
        self.assertEqual(by_month['2026-07']['outflow'], Decimal('0'))

    def test_ordered_by_month_ascending(self):
        result = get_monthly_cash_flow()
        months = [row['month'] for row in result]
        self.assertEqual(months, sorted(months))


class CashFlowAPITest(APITestCase):
    def setUp(self):
        user = User.objects.create_user(username='alex', password='pw')
        refresh = RefreshToken.for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
        Transaction.objects.create(
            date=date(2026, 6, 1), type='DEPOSIT', instrument='Cash Deposit',
            ticker='-', qty=Decimal('1'), price=Decimal('500.00'), account='Saxo',
        )

    def test_requires_auth(self):
        self.client.credentials()
        response = self.client.get('/api/transactions/cash-flow/')
        self.assertEqual(response.status_code, 401)

    def test_returns_monthly_rows(self):
        response = self.client.get('/api/transactions/cash-flow/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [
            {'month': '2026-06', 'inflow': '500.00', 'outflow': '0.00'},
        ])

class TransactionSaxoTradeIdTest(TestCase):
    def test_multiple_transactions_without_saxo_trade_id_are_allowed(self):
        Transaction.objects.create(
            date=date(2026, 1, 1), type='DEPOSIT', instrument='Cash Deposit',
            ticker='-', qty=Decimal('1'), price=Decimal('100.00'), account='Saxo',
        )
        Transaction.objects.create(
            date=date(2026, 1, 2), type='DEPOSIT', instrument='Cash Deposit',
            ticker='-', qty=Decimal('1'), price=Decimal('200.00'), account='Saxo',
        )
        self.assertEqual(Transaction.objects.filter(saxo_trade_id__isnull=True).count(), 2)

    def test_saxo_trade_id_is_unique_when_set(self):
        Transaction.objects.create(
            date=date(2026, 1, 1), type='SELL', instrument='NVIDIA', ticker='NVDA',
            qty=Decimal('5'), price=Decimal('850.00'), account='Saxo',
            saxo_trade_id='abc123',
        )
        with self.assertRaises(IntegrityError):
            Transaction.objects.create(
                date=date(2026, 1, 2), type='SELL', instrument='NVIDIA', ticker='NVDA',
                qty=Decimal('5'), price=Decimal('860.00'), account='Saxo',
                saxo_trade_id='abc123',
            )