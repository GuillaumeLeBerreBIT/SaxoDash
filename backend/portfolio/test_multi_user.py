from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from cryptography.fernet import Fernet
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import BankAccount
from core.models import NetWorthSnapshot
from core.tasks import snapshot_net_worth
from saxo import mapping, tasks
from saxo.models import SaxoCredential
from transactions.models import Transaction
from users.testing import make_user

from .models import SAXO_SOURCE, PortfolioValuation, Position

TEST_KEY = Fernet.generate_key().decode()
LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}

BALANCE = {
    'CashBalance': 500.25, 'CollateralAvailable': 480.00,
    'Currency': 'EUR', 'NonMarginPositionsValue': 1500.00, 'TotalValue': 2000.25,
}


def bearer(user):
    return f'Bearer {RefreshToken.for_user(user).access_token}'


def hold(user, ticker='NVDA', qty='10', price='100', avg='80'):
    return Position.objects.create(
        user=user, ticker=ticker, name=f'{ticker} Inc', qty=Decimal(qty),
        avg_cost=Decimal(avg), current_price=Decimal(price), sector='Technology',
        type='STOCK', color='#111111', currency='EUR',
    )


def bank(user, balance='1000', external_id=None, name='KBC'):
    return BankAccount.objects.create(
        user=user, bank=name, type='Current', iban_masked='BE** 0000',
        balance=Decimal(balance), available=Decimal(balance), external_id=external_id,
    )


def trade(user, ticker='NVDA', saxo_trade_id=None):
    return Transaction.objects.create(
        user=user, date=timezone.localdate(), type='BUY', instrument=f'{ticker} Inc',
        ticker=ticker, qty=Decimal('1'), price=Decimal('100'), saxo_trade_id=saxo_trade_id,
    )


@override_settings(CACHES=LOCMEM)
class PerUserPortfolioTest(APITestCase):
    def setUp(self):
        cache.clear()
        self.alice = make_user('alice', owner=True)
        self.bob = make_user('bob')

    def as_user(self, user):
        self.client.credentials(HTTP_AUTHORIZATION=bearer(user))

    def test_two_users_hold_same_ticker(self):
        hold(self.alice, qty='10')
        hold(self.bob, qty='3')

        self.as_user(self.alice)
        alices = self.client.get('/api/portfolio/positions/').data
        self.as_user(self.bob)
        bobs = self.client.get('/api/portfolio/positions/').data

        self.assertEqual([(row['ticker'], Decimal(row['qty'])) for row in alices], [('NVDA', Decimal('10'))])
        self.assertEqual([(row['ticker'], Decimal(row['qty'])) for row in bobs], [('NVDA', Decimal('3'))])

    def test_summary_and_net_worth_are_per_user(self):
        hold(self.alice, qty='10', price='100')
        bank(self.alice, balance='5000')
        NetWorthSnapshot.objects.create(
            user=self.alice, date=timezone.localdate() - timedelta(days=3),
            portfolio_value=Decimal('900'), bank_total=Decimal('5000'), net_worth=Decimal('5900'),
        )
        PortfolioValuation.objects.create(
            user=self.alice, source=SAXO_SOURCE, currency='EUR', cash_balance=Decimal('1'),
            positions_value=Decimal('999'), total_value=Decimal('1000'),
        )

        self.as_user(self.bob)
        summary = self.client.get('/api/portfolio/summary/').data
        net_worth = self.client.get('/api/accounts/net-worth/').data
        history = self.client.get('/api/core/net-worth-history/').data

        self.assertEqual(summary['total_value'], Decimal('0'))
        self.assertEqual(summary['allocation'], [])
        self.assertEqual(net_worth['net_worth'], Decimal('0'))
        self.assertEqual([row['net_worth'] for row in history], ['0.00'])

        self.as_user(self.alice)
        self.assertEqual(self.client.get('/api/portfolio/summary/').data['total_value'], Decimal('999'))
        self.assertEqual(self.client.get('/api/accounts/net-worth/').data['net_worth'], Decimal('5999'))
        self.assertEqual(len(self.client.get('/api/core/net-worth-history/').data), 2)

    def test_transactions_are_per_user(self):
        mine = trade(self.alice, ticker='NVDA', saxo_trade_id='T-1')
        trade(self.bob, ticker='AAPL', saxo_trade_id='T-1')

        self.as_user(self.bob)
        listed = self.client.get('/api/transactions/').data['results']

        self.assertEqual([row['ticker'] for row in listed], ['AAPL'])
        self.assertEqual(self.client.get(f'/api/transactions/{mine.pk}/').status_code, 404)
        self.assertEqual(self.client.patch(f'/api/transactions/{mine.pk}/', {'qty': '9'}).status_code, 404)
        self.assertEqual(self.client.delete(f'/api/transactions/{mine.pk}/').status_code, 404)
        self.assertTrue(Transaction.objects.filter(pk=mine.pk, qty=Decimal('1')).exists())

    def test_bank_accounts_are_per_user(self):
        mine = bank(self.alice, external_id='saxo:cash', name='Saxo')
        bank(self.bob, external_id='saxo:cash', name='Saxo')
        bank(self.bob, name='ING')

        self.as_user(self.bob)
        listed = self.client.get('/api/accounts/').data

        self.assertCountEqual([row['bank'] for row in listed], ['Saxo', 'ING'])
        self.assertNotIn(mine.pk, [row['id'] for row in listed])
        self.assertEqual(self.client.get(f'/api/accounts/{mine.pk}/').status_code, 404)
        self.assertEqual(self.client.patch(f'/api/accounts/{mine.pk}/', {'balance': '1'}).status_code, 404)
        self.assertEqual(self.client.delete(f'/api/accounts/{mine.pk}/').status_code, 404)
        self.assertTrue(BankAccount.objects.filter(pk=mine.pk, balance=Decimal('1000')).exists())


@override_settings(CACHES=LOCMEM)
class SnapshotPerUserTest(TestCase):
    def setUp(self):
        self.alice = make_user('alice', owner=True)
        self.bob = make_user('bob')
        self.carol = make_user('carol')

    def test_snapshot_net_worth_writes_one_row_per_user(self):
        hold(self.alice, qty='10', price='100')
        bank(self.bob, balance='250')

        snapshot_net_worth()

        today = timezone.localdate()
        rows = {row.user_id: row for row in NetWorthSnapshot.objects.filter(date=today)}
        self.assertEqual(set(rows), {self.alice.pk, self.bob.pk})
        self.assertEqual(rows[self.alice.pk].net_worth, Decimal('1000.00'))
        self.assertEqual(rows[self.bob.pk].net_worth, Decimal('250.00'))

    def test_an_inactive_user_gets_no_snapshot(self):
        hold(self.carol, qty='1', price='100')
        self.carol.is_active = False
        self.carol.save(update_fields=['is_active'])

        snapshot_net_worth()

        self.assertFalse(NetWorthSnapshot.objects.filter(user=self.carol).exists())


@override_settings(SAXO_TOKEN_ENCRYPTION_KEY=TEST_KEY, CACHES=LOCMEM)
class SaxoSyncPerUserTest(TestCase):
    def setUp(self):
        cache.clear()
        self.alice = make_user('alice', owner=True)
        self.bob = make_user('bob')

    def connect(self, user, token):
        return SaxoCredential.objects.create(
            user=user, access_token=token, refresh_token=f'{token}-r',
            expires_at=timezone.now() + timedelta(hours=1),
        )

    def test_saxo_sync_writes_cash_account_for_credential_user(self):
        self.connect(self.bob, 'bob-token')
        bank(self.alice, balance='42', external_id=mapping.SAXO_CASH_ACCOUNT_ID, name='Saxo')

        with patch('saxo.tasks.client.get_account_balance', return_value=BALANCE):
            tasks.sync_account_balance()

        bobs = BankAccount.objects.get(user=self.bob, external_id=mapping.SAXO_CASH_ACCOUNT_ID)
        alices = BankAccount.objects.get(user=self.alice, external_id=mapping.SAXO_CASH_ACCOUNT_ID)
        self.assertEqual(bobs.balance, Decimal('500.25'))
        self.assertEqual(alices.balance, Decimal('42'))
        self.assertEqual(PortfolioValuation.objects.get(source=SAXO_SOURCE).user, self.bob)
