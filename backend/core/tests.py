from django.test import TestCase
from decimal import Decimal
from datetime import date
from django.db.utils import IntegrityError

from .models import NetWorthSnapshot

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