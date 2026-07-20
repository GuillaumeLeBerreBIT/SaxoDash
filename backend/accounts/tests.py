from django.test import TestCase
from decimal import Decimal
from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import BankAccount
from accounts.services import get_total_bank_balance
from portfolio.models import Position


class BankAccountModelTest(TestCase):
    def test_create_bank_account(self):
        account = BankAccount.objects.create(
            bank='KBC', type='Checking', iban_masked='BE68 •••• •••• 1234',
            balance=Decimal('2500.00'), available=Decimal('2500.00'),
            gradient='from-blue-500 to-blue-700', accent='#1e40af',
        )
        self.assertEqual(BankAccount.objects.count(), 1)
        self.assertEqual(account.bank, 'KBC')


class BankAccountServiceTest(TestCase):
    def setUp(self):
        BankAccount.objects.create(
            bank='KBC', type='Checking', iban_masked='BE68 1234',
            balance=Decimal('2500.00'), available=Decimal('2500.00'),
        )
        BankAccount.objects.create(
            bank='ING', type='Savings', iban_masked='BE68 5678',
            balance=Decimal('1000.00'), available=Decimal('1000.00'),
        )

    def test_total_bank_balance(self):
        self.assertEqual(get_total_bank_balance(), Decimal('3500.00'))


class AccountsAPITest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='alex', password='pw')
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')

        Position.objects.create(
            ticker='NVDA', name='NVIDIA', qty=10,
            avg_cost=Decimal('100.00'), current_price=Decimal('150.00'),
            sector='Technology', type='STOCK', color='#76b900',
        )
        BankAccount.objects.create(
            bank='KBC', type='Checking', iban_masked='BE68 1234',
            balance=Decimal('2500.00'), available=Decimal('2500.00'),
        )
        BankAccount.objects.create(
            bank='Saxo', type='Cash', iban_masked='-',
            balance=Decimal('500.00'), available=Decimal('500.00'),
        )

    def test_requires_auth(self):
        self.client.credentials()
        response = self.client.get('/api/accounts/')
        self.assertEqual(response.status_code, 401)

    def test_list_accounts(self):
        response = self.client.get('/api/accounts/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 2)  # unpaginated, plain list

    def test_net_worth(self):
        response = self.client.get('/api/accounts/net-worth/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['portfolio_value'], Decimal('1500.00'))
        self.assertEqual(response.data['bank_total'], Decimal('3000.00'))
        self.assertEqual(response.data['net_worth'], Decimal('4500.00'))