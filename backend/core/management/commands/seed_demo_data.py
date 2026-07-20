from decimal import Decimal
from datetime import date

from django.core.management.base import BaseCommand
from django.db import transaction

from portfolio.models import Position
from transactions.models import Transaction
from accounts.models import BankAccount


POSITIONS = [
    dict(ticker='NVDA', name='NVIDIA Corporation', qty=Decimal('15'),
         avg_cost=Decimal('412.30'), current_price=Decimal('875.40'),
         sector='Technology', type='STOCK', color='#76b900'),
    dict(ticker='AAPL', name='Apple Inc.', qty=Decimal('25'),
         avg_cost=Decimal('165.20'), current_price=Decimal('192.50'),
         sector='Technology', type='STOCK', color='#a3a3a3'),
    dict(ticker='MSFT', name='Microsoft Corporation', qty=Decimal('10'),
         avg_cost=Decimal('390.00'), current_price=Decimal('421.80'),
         sector='Technology', type='STOCK', color='#00a4ef'),
    dict(ticker='JPM', name='JPMorgan Chase & Co.', qty=Decimal('20'),
         avg_cost=Decimal('195.00'), current_price=Decimal('215.60'),
         sector='Financials', type='STOCK', color='#5b21b6'),
    dict(ticker='NOVO-B', name='Novo Nordisk A/S', qty=Decimal('30'),
         avg_cost=Decimal('110.00'), current_price=Decimal('98.40'),
         sector='Healthcare', type='STOCK', color='#dc2626'),
    dict(ticker='VWCE', name='Vanguard FTSE All-World UCITS ETF', qty=Decimal('50'),
         avg_cost=Decimal('115.00'), current_price=Decimal('124.30'),
         sector='Diversified', type='ETF', color='#0891b2'),
]

TRANSACTIONS = [
    dict(date=date(2026, 1, 5), type='DEPOSIT', instrument='Cash Deposit',
         ticker='-', qty=Decimal('1'), price=Decimal('10000.00'), account='Saxo'),
    dict(date=date(2026, 1, 10), type='BUY', instrument='NVIDIA Corporation',
         ticker='NVDA', qty=Decimal('10'), price=Decimal('700.00'), account='Saxo'),
    dict(date=date(2026, 1, 10), type='FEE', instrument='Brokerage Fee',
         ticker='-', qty=Decimal('1'), price=Decimal('5.00'), account='Saxo'),
    dict(date=date(2026, 2, 3), type='BUY', instrument='Apple Inc.',
         ticker='AAPL', qty=Decimal('25'), price=Decimal('165.20'), account='Saxo'),
    dict(date=date(2026, 2, 15), type='BUY', instrument='Microsoft Corporation',
         ticker='MSFT', qty=Decimal('12'), price=Decimal('390.00'), account='Saxo'),
    dict(date=date(2026, 3, 1), type='DIVIDEND', instrument='NVIDIA Corporation',
         ticker='NVDA', qty=Decimal('1'), price=Decimal('16.00'), account='Saxo'),
    dict(date=date(2026, 3, 10), type='BUY', instrument='NVIDIA Corporation',
         ticker='NVDA', qty=Decimal('5'), price=Decimal('850.00'), account='Saxo'),
    dict(date=date(2026, 4, 2), type='BUY', instrument='JPMorgan Chase & Co.',
         ticker='JPM', qty=Decimal('20'), price=Decimal('195.00'), account='Saxo'),
    dict(date=date(2026, 4, 20), type='BUY', instrument='Novo Nordisk A/S',
         ticker='NOVO-B', qty=Decimal('30'), price=Decimal('110.00'), account='Saxo'),
    dict(date=date(2026, 5, 5), type='BUY', instrument='Vanguard FTSE All-World UCITS ETF',
         ticker='VWCE', qty=Decimal('50'), price=Decimal('115.00'), account='Saxo'),
    dict(date=date(2026, 5, 18), type='DIVIDEND', instrument='Apple Inc.',
         ticker='AAPL', qty=Decimal('1'), price=Decimal('18.75'), account='Saxo'),
    dict(date=date(2026, 6, 1), type='SELL', instrument='Microsoft Corporation',
         ticker='MSFT', qty=Decimal('2'), price=Decimal('410.00'), account='Saxo'),
    dict(date=date(2026, 6, 15), type='FEE', instrument='Custody Fee',
         ticker='-', qty=Decimal('1'), price=Decimal('12.50'), account='Saxo'),
]

BANK_ACCOUNTS = [
    dict(bank='BNP Paribas Fortis', type='Checking', iban_masked='BE68 •••• •••• 1234',
         balance=Decimal('4230.50'), available=Decimal('4230.50'),
         gradient='from-emerald-500 to-emerald-700', accent='#059669'),
    dict(bank='KBC', type='Savings', iban_masked='BE71 •••• •••• 5678',
         balance=Decimal('12500.00'), available=Decimal('12500.00'),
         gradient='from-blue-500 to-blue-700', accent='#1d4ed8'),
    dict(bank='ING', type='Checking', iban_masked='BE45 •••• •••• 9012',
         balance=Decimal('2180.75'), available=Decimal('2180.75'),
         gradient='from-orange-500 to-orange-700', accent='#ea580c'),
    dict(bank='Saxo', type='Cash', iban_masked='-',
         balance=Decimal('850.00'), available=Decimal('850.00'),
         gradient='from-slate-600 to-slate-800', accent='#334155'),
]


class Command(BaseCommand):
    help = 'Seed the database with demo data (idempotent: clears then re-seeds)'

    @transaction.atomic
    def handle(self, *args, **options):
        Position.objects.all().delete()
        Transaction.objects.all().delete()
        BankAccount.objects.all().delete()

        Position.objects.bulk_create([Position(**p) for p in POSITIONS])
        Transaction.objects.bulk_create([Transaction(**t) for t in TRANSACTIONS])
        BankAccount.objects.bulk_create([BankAccount(**b) for b in BANK_ACCOUNTS])

        self.stdout.write(self.style.SUCCESS(
            f'Seeded {len(POSITIONS)} positions, {len(TRANSACTIONS)} transactions, '
            f'{len(BANK_ACCOUNTS)} bank accounts.'
        ))