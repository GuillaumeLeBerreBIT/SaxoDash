from django.test import TestCase
from decimal import Decimal
from datetime import date, timedelta
from django.db.utils import IntegrityError
from django.utils import timezone
from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from django.core.management import call_command

from .models import NetWorthSnapshot
from .money import CurrencyMismatch, Money
from .services import ensure_todays_snapshot
from portfolio.models import Position
from portfolio.services import get_positions_total_value
from accounts.models import BankAccount
from accounts.services import get_total_bank_balance

class NetWorthSnapshotModelTest(TestCase):
    def test_create_snapshot(self):
        snap = NetWorthSnapshot.objects.create(
            date=date(2026, 7, 25),
            portfolio_value=Decimal('10000.00'),
            bank_total=Decimal('5000.00'),
            net_worth=Decimal('15000.00'),
        )
        self.assertEqual(NetWorthSnapshot.objects.count(), 1)
        self.assertEqual(snap.net_worth, Decimal('15000.00'))

    def test_date_is_unique(self):
        NetWorthSnapshot.objects.create(
            date=date(2026, 7, 25),
            portfolio_value=Decimal('1'), bank_total=Decimal('1'), net_worth=Decimal('2'),
        )
        with self.assertRaises(IntegrityError):
            NetWorthSnapshot.objects.create(
                date=date(2026, 7, 25),
                portfolio_value=Decimal('2'),
                bank_total=Decimal('2'),
                net_worth=Decimal('4'),
            )


class EnsureTodaysSnapshotTest(TestCase):
    def setUp(self):
        Position.objects.create(
            ticker='NVDA', name='NVIDIA', qty=10,
            avg_cost=Decimal('100.00'), current_price=Decimal('150.00'),
            sector='Technology', type='STOCK', color='#76b900',
        )
        BankAccount.objects.create(
            bank='KBC', type='Checking', iban_masked='BE68 1234',
            balance=Decimal('2500.00'), available=Decimal('2500.00'),
        )

    def test_creates_snapshot_with_current_totals(self):
        snap = ensure_todays_snapshot()
        self.assertEqual(snap.date, timezone.localdate())
        self.assertEqual(snap.portfolio_value, Decimal('1500.00'))
        self.assertEqual(snap.bank_total, Decimal('2500.00'))
        self.assertEqual(snap.net_worth, Decimal('4000.00'))

    def test_is_idempotent_for_same_day(self):
        ensure_todays_snapshot()
        ensure_todays_snapshot()
        self.assertEqual(NetWorthSnapshot.objects.count(), 1)


class NetWorthHistoryAPITest(APITestCase):
    def setUp(self):
        user = User.objects.create_user(username='alex', password='pw')
        refresh = RefreshToken.for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')

        today = timezone.localdate()
        for days_ago in [400, 200, 60, 10, 0]:
            NetWorthSnapshot.objects.create(
                date=today - timedelta(days=days_ago),
                portfolio_value=Decimal('1000.00'),
                bank_total=Decimal('500.00'),
                net_worth=Decimal('1500.00'),
            )

    def test_requires_auth(self):
        self.client.credentials()
        response = self.client.get('/api/core/net-worth-history/')
        self.assertEqual(response.status_code, 401)

    def test_all_range_returns_every_snapshot(self):
        response = self.client.get('/api/core/net-worth-history/?range=ALL')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 5)

    def test_1m_range_filters_to_last_30_days(self):
        response = self.client.get('/api/core/net-worth-history/?range=1M')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 2)  # days_ago 10 and 0

    def test_missing_range_defaults_to_all(self):
        response = self.client.get('/api/core/net-worth-history/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 5)

    def test_results_ordered_by_date_ascending(self):
        response = self.client.get('/api/core/net-worth-history/?range=ALL')
        dates = [row['date'] for row in response.data]
        self.assertEqual(dates, sorted(dates))


class SeedDemoDataSnapshotsTest(TestCase):
    def test_seed_creates_a_year_of_snapshots(self):
        call_command('seed_demo_data')

        self.assertEqual(NetWorthSnapshot.objects.count(), 365)

        today = timezone.localdate()
        latest = NetWorthSnapshot.objects.get(date=today)
        self.assertEqual(latest.portfolio_value, get_positions_total_value())
        self.assertEqual(latest.bank_total, get_total_bank_balance())

    def test_seed_is_idempotent(self):
        call_command('seed_demo_data')
        call_command('seed_demo_data')
        self.assertEqual(NetWorthSnapshot.objects.count(), 365)


class MoneyTest(TestCase):
    def test_adds_amounts_in_the_same_currency(self):
        total = Money(Decimal('10.00'), 'EUR') + Money(Decimal('5.50'), 'EUR')
        self.assertEqual(total, Money(Decimal('15.50'), 'EUR'))

    def test_refuses_to_add_across_currencies(self):
        with self.assertRaises(CurrencyMismatch):
            Money(Decimal('10.00'), 'EUR') + Money(Decimal('5.00'), 'USD')

    def test_total_of_nothing_is_still_denominated(self):
        self.assertEqual(Money.total([], 'EUR'), Money(Decimal('0'), 'EUR'))

    def test_converts_at_a_rate(self):
        converted = Money(Decimal('100'), 'USD').converted('EUR', Decimal('0.86'))
        self.assertEqual(converted, Money(Decimal('86.00'), 'EUR'))
