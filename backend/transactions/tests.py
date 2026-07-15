from django.test import TestCase
from datetime import datetime, date
from django.test import TestCase
from transactions.models import Transaction
from decimal import Decimal

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