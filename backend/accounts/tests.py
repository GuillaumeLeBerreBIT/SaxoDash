from django.test import TestCase
from decimal import Decimal
from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import BankAccount
from accounts.services import get_bank_only_balance, get_total_bank_balance
from core.money import Money
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
        self.assertEqual(get_total_bank_balance().amount, Decimal('3500.00'))


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

class SaxoExternalIdBackfillTest(TestCase):
    """Covers the 0004 data migration, which deletes rows."""

    def test_folds_case_mismatched_duplicates_onto_one_row(self):
        from importlib import import_module

        migration = import_module('accounts.migrations.0004_backfill_saxo_external_id')

        BankAccount.objects.create(
            bank='saxo', type='Cash', iban_masked='-',
            balance=Decimal('100.00'), available=Decimal('100.00'),
        )
        BankAccount.objects.create(
            bank='Saxo', type='Cash', iban_masked='-',
            balance=Decimal('994104.45'), available=Decimal('992000.10'),
        )
        BankAccount.objects.create(
            bank='KBC', type='Savings', iban_masked='BE71 5678',
            balance=Decimal('1000.00'), available=Decimal('1000.00'),
        )

        apps_stub = type('Apps', (), {'get_model': staticmethod(lambda *a: BankAccount)})
        migration.claim_saxo_account(apps_stub, None)

        saxo = BankAccount.objects.get(external_id=migration.SAXO_CASH_ACCOUNT_ID)
        self.assertEqual(saxo.bank, 'Saxo')
        self.assertEqual(saxo.balance, Decimal('994104.45'))
        self.assertEqual(BankAccount.objects.filter(bank__iexact='saxo').count(), 1)
        self.assertEqual(BankAccount.objects.count(), 2)

    def test_is_a_no_op_without_a_saxo_account(self):
        from importlib import import_module

        migration = import_module('accounts.migrations.0004_backfill_saxo_external_id')

        BankAccount.objects.create(
            bank='KBC', type='Savings', iban_masked='BE71 5678',
            balance=Decimal('1000.00'), available=Decimal('1000.00'),
        )
        apps_stub = type('Apps', (), {'get_model': staticmethod(lambda *a: BankAccount)})
        migration.claim_saxo_account(apps_stub, None)

        self.assertEqual(BankAccount.objects.count(), 1)
        self.assertIsNone(BankAccount.objects.get().external_id)


class BankOnlyBalanceTest(TestCase):
    def test_excludes_the_saxo_cash_mirror(self):
        BankAccount.objects.create(
            bank='KBC', type='Checking', iban_masked='BE68 1234',
            balance=Decimal('833.00'), available=Decimal('833.00'), external_id='enablebanking:kbc:acc-1',
        )
        BankAccount.objects.create(
            bank='Saxo', type='Cash', iban_masked='-',
            balance=Decimal('971000.00'), available=Decimal('971000.00'), external_id='saxo:cash',
        )

        self.assertEqual(get_bank_only_balance(), Money(Decimal('833.00'), 'EUR'))

    def test_keeps_hand_entered_accounts_without_an_external_id(self):
        BankAccount.objects.create(
            bank='ING', type='Checking', iban_masked='BE45 9012',
            balance=Decimal('100.00'), available=Decimal('100.00'),
        )

        self.assertEqual(get_bank_only_balance(), Money(Decimal('100.00'), 'EUR'))

    def test_is_zero_with_no_accounts(self):
        self.assertEqual(get_bank_only_balance(), Money(Decimal('0'), 'EUR'))
