from datetime import date
from decimal import Decimal

from django.test import TestCase

from accounts.models import BankAccount

from .models import BankTransaction
from .services import spending_summary, spending_trend


class SpendingSummaryTest(TestCase):
    def setUp(self):
        self.account = BankAccount.objects.create(
            bank='KBC', type='Current account', iban_masked='BE12 •••• •••• 0001',
            balance=100, available=100, external_id='enablebanking:kbc:acc-1',
        )

    def _tx(self, amount, category, booking_date, external_id, category_override=None):
        BankTransaction.objects.create(
            bank='kbc', bank_account=self.account, external_id=external_id,
            amount=amount, currency='EUR', booking_date=booking_date,
            category=category, category_override=category_override,
        )

    def test_sums_outflows_by_category(self):
        self._tx(Decimal('-40'), 'GROCERIES', date(2026, 1, 5), 't1')
        self._tx(Decimal('-10'), 'GROCERIES', date(2026, 1, 10), 't2')
        self._tx(Decimal('-15'), 'DINING', date(2026, 1, 12), 't3')

        summary = spending_summary()

        by_category = {row['category']: row['amount'] for row in summary['categories']}
        self.assertEqual(by_category['GROCERIES'], Decimal('50'))
        self.assertEqual(by_category['DINING'], Decimal('15'))
        self.assertEqual(summary['total'], Decimal('65'))

    def test_inflows_are_excluded(self):
        self._tx(Decimal('500'), 'REFUND_CREDIT', date(2026, 1, 1), 't1')
        summary = spending_summary()
        self.assertEqual(summary['categories'], [])
        self.assertEqual(summary['total'], Decimal('0'))

    def test_transfers_are_reported_separately_and_excluded_from_total(self):
        self._tx(Decimal('-500'), 'TRANSFER', date(2026, 1, 1), 't1')
        self._tx(Decimal('-40'), 'GROCERIES', date(2026, 1, 2), 't2')

        summary = spending_summary()

        self.assertEqual(summary['transfers'], Decimal('500'))
        self.assertEqual(summary['total'], Decimal('40'))
        self.assertNotIn('TRANSFER', [row['category'] for row in summary['categories']])

    def test_respects_category_override(self):
        self._tx(Decimal('-40'), 'GROCERIES', date(2026, 1, 5), 't1', category_override='DINING')
        summary = spending_summary()
        by_category = {row['category']: row['amount'] for row in summary['categories']}
        self.assertEqual(by_category, {'DINING': Decimal('40')})

    def test_date_range_filters(self):
        self._tx(Decimal('-40'), 'GROCERIES', date(2026, 1, 5), 't1')
        self._tx(Decimal('-40'), 'GROCERIES', date(2026, 2, 5), 't2')

        summary = spending_summary(date_from='2026-02-01', date_to='2026-02-28')

        self.assertEqual(summary['total'], Decimal('40'))

    def test_matched_refund_nets_against_its_category(self):
        self._tx(Decimal('-50'), 'GROCERIES', date(2026, 1, 5), 't1')
        self._tx(Decimal('20'), 'GROCERIES', date(2026, 1, 10), 't2')

        summary = spending_summary()

        by_category = {row['category']: row['amount'] for row in summary['categories']}
        self.assertEqual(by_category['GROCERIES'], Decimal('30'))

    def test_fully_refunded_category_is_dropped_not_shown_negative(self):
        self._tx(Decimal('-50'), 'GROCERIES', date(2026, 1, 5), 't1')
        self._tx(Decimal('60'), 'GROCERIES', date(2026, 1, 10), 't2')

        summary = spending_summary()

        self.assertEqual(summary['categories'], [])
        self.assertEqual(summary['total'], Decimal('0'))

    def test_transaction_count_excludes_transfers_and_credits(self):
        self._tx(Decimal('-40'), 'GROCERIES', date(2026, 1, 5), 't1')
        self._tx(Decimal('-10'), 'DINING', date(2026, 1, 6), 't2')
        self._tx(Decimal('-500'), 'TRANSFER', date(2026, 1, 7), 't3')
        self._tx(Decimal('20'), 'GROCERIES', date(2026, 1, 8), 't4')

        summary = spending_summary()

        self.assertEqual(summary['transaction_count'], 2)

    def test_previous_period_is_computed_for_an_explicit_date_range(self):
        self._tx(Decimal('-40'), 'GROCERIES', date(2026, 2, 5), 't1')
        self._tx(Decimal('-100'), 'GROCERIES', date(2026, 1, 5), 't2')

        summary = spending_summary(date_from='2026-02-01', date_to='2026-02-28')

        self.assertEqual(summary['previous_period']['total'], Decimal('100'))
        self.assertEqual(summary['previous_period']['date_from'], '2026-01-04')
        self.assertEqual(summary['previous_period']['date_to'], '2026-01-31')

    def test_previous_period_is_none_when_unscoped(self):
        summary = spending_summary()
        self.assertIsNone(summary['previous_period'])


class SpendingTrendTest(TestCase):
    def setUp(self):
        self.account = BankAccount.objects.create(
            bank='KBC', type='Current account', iban_masked='BE12 •••• •••• 0001',
            balance=100, available=100, external_id='enablebanking:kbc:acc-1',
        )

    def _tx(self, amount, category, booking_date, external_id):
        BankTransaction.objects.create(
            bank='kbc', bank_account=self.account, external_id=external_id,
            amount=amount, currency='EUR', booking_date=booking_date, category=category,
        )

    def test_groups_by_month(self):
        self._tx(Decimal('-40'), 'GROCERIES', date(2026, 1, 5), 't1')
        self._tx(Decimal('-10'), 'DINING', date(2026, 1, 20), 't2')
        self._tx(Decimal('-30'), 'GROCERIES', date(2026, 2, 3), 't3')

        trend = spending_trend(months=6)

        by_month = {row['month']: row['total'] for row in trend}
        self.assertEqual(by_month['2026-01'], Decimal('50'))
        self.assertEqual(by_month['2026-02'], Decimal('30'))

    def test_excludes_transfers(self):
        self._tx(Decimal('-500'), 'TRANSFER', date(2026, 1, 5), 't1')
        trend = spending_trend(months=6)
        self.assertEqual(trend, [])

    def test_respects_category_override_for_exclusion(self):
        BankTransaction.objects.create(
            bank='kbc', bank_account=self.account, external_id='t1', amount=Decimal('-40'),
            currency='EUR', booking_date=date(2026, 1, 5), category='GROCERIES',
            category_override='TRANSFER',
        )
        trend = spending_trend(months=6)
        self.assertEqual(trend, [])

    def test_limits_to_requested_number_of_months(self):
        for i, m in enumerate(range(1, 9)):
            self._tx(Decimal('-10'), 'GROCERIES', date(2026, m, 1), f't{i}')

        trend = spending_trend(months=3)

        self.assertEqual(len(trend), 3)
        self.assertEqual([row['month'] for row in trend], ['2026-06', '2026-07', '2026-08'])

    def test_matched_refund_reduces_the_months_total(self):
        self._tx(Decimal('-50'), 'GROCERIES', date(2026, 1, 5), 't1')
        self._tx(Decimal('20'), 'GROCERIES', date(2026, 1, 10), 't2')

        trend = spending_trend(months=6)

        by_month = {row['month']: row['total'] for row in trend}
        self.assertEqual(by_month['2026-01'], Decimal('30'))

    def test_fully_refunded_month_is_dropped(self):
        self._tx(Decimal('-50'), 'GROCERIES', date(2026, 1, 5), 't1')
        self._tx(Decimal('50'), 'GROCERIES', date(2026, 1, 10), 't2')

        trend = spending_trend(months=6)

        self.assertEqual([row['month'] for row in trend], [])
