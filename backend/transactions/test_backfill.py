from datetime import date
from decimal import Decimal
from importlib import import_module

from django.apps import apps
from django.test import TestCase

from portfolio.models import Position
from transactions.models import Transaction

backfill = import_module(
    'transactions.migrations.0005_backfill_currency_and_fx_rate'
).backfill_from_positions


def make_position(ticker, currency, fx_rate):
    return Position.objects.create(
        ticker=ticker, name=ticker, qty=Decimal('1'), avg_cost=Decimal('1'),
        current_price=Decimal('1'), sector='Uncategorized', type='STOCK',
        color='#000000', currency=currency, fx_rate=fx_rate,
    )


def make_transaction(ticker, type='BUY', **extra):
    return Transaction.objects.create(
        date=date(2026, 8, 26), type=type, instrument=ticker, ticker=ticker,
        qty=Decimal('2'), price=Decimal('100.00'), account='Saxo', **extra,
    )


class TransactionCurrencyColumnsTest(TestCase):
    def test_new_rows_default_to_unknown_currency_and_rate(self):
        tx = make_transaction('NVDA')
        self.assertIsNone(tx.currency)
        self.assertIsNone(tx.fx_rate)


class BackfillFromPositionsTest(TestCase):
    def test_a_matched_buy_takes_the_positions_currency_and_rate(self):
        make_position('NVDA', 'USD', Decimal('0.86008950'))
        tx = make_transaction('NVDA')

        backfill(apps, None)

        tx.refresh_from_db()
        self.assertEqual(tx.currency, 'USD')
        self.assertEqual(tx.fx_rate, Decimal('0.86008950'))

    def test_a_matched_sell_is_backfilled_too(self):
        make_position('NVDA', 'USD', Decimal('0.86008950'))
        tx = make_transaction('NVDA', type='SELL')

        backfill(apps, None)

        tx.refresh_from_db()
        self.assertEqual(tx.currency, 'USD')

    def test_an_unmatched_row_stays_null_and_is_never_guessed_as_eur(self):
        make_position('NVDA', 'USD', Decimal('0.86008950'))
        tx = make_transaction('META')

        backfill(apps, None)

        tx.refresh_from_db()
        self.assertIsNone(tx.currency)
        self.assertIsNone(tx.fx_rate)

    def test_non_trade_rows_are_left_alone(self):
        make_position('NVDA', 'USD', Decimal('0.86008950'))
        tx = make_transaction('NVDA', type='DIVIDEND')

        backfill(apps, None)

        tx.refresh_from_db()
        self.assertIsNone(tx.currency)

    def test_a_row_that_already_has_a_currency_is_not_overwritten(self):
        make_position('NVDA', 'USD', Decimal('0.86008950'))
        tx = make_transaction('NVDA', currency='GBP', fx_rate=Decimal('1.15000000'))

        backfill(apps, None)

        tx.refresh_from_db()
        self.assertEqual(tx.currency, 'GBP')
        self.assertEqual(tx.fx_rate, Decimal('1.15000000'))

    def test_running_it_twice_changes_nothing_more(self):
        make_position('NVDA', 'USD', Decimal('0.86008950'))
        tx = make_transaction('NVDA')

        backfill(apps, None)
        backfill(apps, None)

        tx.refresh_from_db()
        self.assertEqual(tx.currency, 'USD')
