from datetime import date
from decimal import Decimal
from unittest.mock import patch

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
        patcher = patch('enablebanking.services._today', return_value=date(2026, 10, 4))
        patcher.start()
        self.addCleanup(patcher.stop)

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

    def test_a_whole_month_is_compared_with_the_whole_previous_month(self):
        self._tx(Decimal('-40'), 'GROCERIES', date(2026, 2, 5), 't1')
        self._tx(Decimal('-100'), 'GROCERIES', date(2026, 1, 3), 't2')
        self._tx(Decimal('-100'), 'GROCERIES', date(2026, 1, 30), 't3')

        summary = spending_summary(date_from='2026-02-01', date_to='2026-02-28')

        self.assertEqual(summary['previous_period']['total'], Decimal('200'))
        self.assertEqual(summary['previous_period']['date_from'], '2026-01-01')
        self.assertEqual(summary['previous_period']['date_to'], '2026-01-31')
        self.assertEqual(summary['comparison_label'], 'previous month')

    def test_a_month_to_date_is_compared_with_the_same_days_of_the_previous_month(self):
        self._tx(Decimal('-40'), 'GROCERIES', date(2026, 9, 3), 't1')
        self._tx(Decimal('-60'), 'GROCERIES', date(2026, 8, 2), 't2')
        self._tx(Decimal('-900'), 'GROCERIES', date(2026, 8, 20), 't3')

        summary = spending_summary(date_from='2026-09-01', date_to='2026-09-04')

        self.assertEqual(summary['previous_period']['date_from'], '2026-08-01')
        self.assertEqual(summary['previous_period']['date_to'], '2026-08-04')
        self.assertEqual(summary['previous_period']['total'], Decimal('60'))
        self.assertEqual(summary['comparison_label'], 'same days last month')

    def test_the_same_day_is_clamped_to_a_shorter_previous_month(self):
        summary = spending_summary(date_from='2026-03-01', date_to='2026-03-30')

        self.assertEqual(summary['previous_period']['date_from'], '2026-02-01')
        self.assertEqual(summary['previous_period']['date_to'], '2026-02-28')

    def test_a_multi_month_span_is_compared_with_the_same_span_earlier(self):
        self._tx(Decimal('-30'), 'GROCERIES', date(2026, 5, 10), 't1')
        self._tx(Decimal('-70'), 'GROCERIES', date(2026, 6, 10), 't2')
        self._tx(Decimal('-500'), 'GROCERIES', date(2026, 6, 25), 't3')

        summary = spending_summary(date_from='2026-07-01', date_to='2026-09-15')

        self.assertEqual(summary['previous_period']['date_from'], '2026-04-01')
        self.assertEqual(summary['previous_period']['date_to'], '2026-06-15')
        self.assertEqual(summary['previous_period']['total'], Decimal('100'))
        self.assertEqual(summary['comparison_label'], 'same days 3 months earlier')

    def test_a_range_not_starting_on_the_first_falls_back_to_the_preceding_equal_window(self):
        summary = spending_summary(date_from='2026-01-10', date_to='2026-01-19')

        self.assertEqual(summary['previous_period']['date_from'], '2025-12-31')
        self.assertEqual(summary['previous_period']['date_to'], '2026-01-09')
        self.assertEqual(summary['comparison_label'], 'previous 10 days')

    def test_a_previous_window_crossing_a_year_boundary(self):
        summary = spending_summary(date_from='2026-01-01', date_to='2026-01-31')

        self.assertEqual(summary['previous_period']['date_from'], '2025-12-01')
        self.assertEqual(summary['previous_period']['date_to'], '2025-12-31')

    def test_previous_period_and_label_are_none_when_unscoped(self):
        summary = spending_summary()
        self.assertIsNone(summary['previous_period'])
        self.assertIsNone(summary['comparison_label'])

    def test_a_missing_date_to_means_today_and_excludes_future_dated_rows(self):
        self._tx(Decimal('-40'), 'GROCERIES', date(2026, 10, 3), 't1')
        self._tx(Decimal('-15'), 'DINING', date(2026, 10, 4), 't2')
        self._tx(Decimal('-900'), 'GROCERIES', date(2026, 10, 5), 't3')

        summary = spending_summary(date_from='2026-10-01')

        self.assertEqual(summary['total'], Decimal('55'))
        self.assertEqual(summary['transaction_count'], 2)

    def test_no_dates_at_all_still_excludes_future_dated_rows(self):
        self._tx(Decimal('-40'), 'GROCERIES', date(2026, 10, 3), 't1')
        self._tx(Decimal('-900'), 'GROCERIES', date(2026, 10, 5), 't2')

        self.assertEqual(spending_summary()['total'], Decimal('40'))

    def test_a_date_to_in_the_future_is_capped_at_today(self):
        self._tx(Decimal('-40'), 'GROCERIES', date(2026, 10, 3), 't1')
        self._tx(Decimal('-900'), 'GROCERIES', date(2026, 10, 20), 't2')

        summary = spending_summary(date_from='2026-10-01', date_to='2026-10-31')

        self.assertEqual(summary['total'], Decimal('40'))
        self.assertEqual(summary['comparison_label'], 'same days last month')
        self.assertEqual(summary['previous_period']['date_to'], '2026-09-04')

    def test_a_past_date_to_is_respected(self):
        self._tx(Decimal('-40'), 'GROCERIES', date(2026, 9, 10), 't1')
        self._tx(Decimal('-60'), 'GROCERIES', date(2026, 9, 25), 't2')

        summary = spending_summary(date_from='2026-09-01', date_to='2026-09-15')

        self.assertEqual(summary['total'], Decimal('40'))

    def test_a_date_from_only_call_gets_a_month_to_date_comparison(self):
        self._tx(Decimal('-70'), 'GROCERIES', date(2026, 9, 2), 't1')
        self._tx(Decimal('-900'), 'GROCERIES', date(2026, 9, 20), 't2')

        summary = spending_summary(date_from='2026-10-01')

        self.assertEqual(summary['previous_period']['date_from'], '2026-09-01')
        self.assertEqual(summary['previous_period']['date_to'], '2026-09-04')
        self.assertEqual(summary['previous_period']['total'], Decimal('70'))

    def test_a_date_from_after_today_is_empty_and_has_no_comparison(self):
        self._tx(Decimal('-40'), 'GROCERIES', date(2026, 10, 3), 't1')

        summary = spending_summary(date_from='2026-11-01')

        self.assertEqual(summary['total'], Decimal('0'))
        self.assertIsNone(summary['previous_period'])
        self.assertIsNone(summary['comparison_label'])


class SpendingTrendTest(TestCase):
    def setUp(self):
        self.account = BankAccount.objects.create(
            bank='KBC', type='Current account', iban_masked='BE12 •••• •••• 0001',
            balance=100, available=100, external_id='enablebanking:kbc:acc-1',
        )
        patcher = patch('enablebanking.services._today', return_value=date(2026, 10, 4))
        patcher.start()
        self.addCleanup(patcher.stop)

    def _tx(self, amount, category, booking_date, external_id, category_override=None):
        BankTransaction.objects.create(
            bank='kbc', bank_account=self.account, external_id=external_id,
            amount=amount, currency='EUR', booking_date=booking_date,
            category=category, category_override=category_override,
        )

    def _by_month(self, trend):
        return {row['month']: row['total'] for row in trend}

    def test_groups_by_month(self):
        self._tx(Decimal('-40'), 'GROCERIES', date(2026, 8, 5), 't1')
        self._tx(Decimal('-10'), 'DINING', date(2026, 8, 20), 't2')
        self._tx(Decimal('-30'), 'GROCERIES', date(2026, 9, 3), 't3')

        by_month = self._by_month(spending_trend(months=6))

        self.assertEqual(by_month['2026-08'], Decimal('50'))
        self.assertEqual(by_month['2026-09'], Decimal('30'))

    def test_series_is_continuous_with_zero_months_included(self):
        self._tx(Decimal('-40'), 'GROCERIES', date(2026, 8, 5), 't1')
        self._tx(Decimal('-25'), 'GROCERIES', date(2026, 10, 2), 't2')

        trend = spending_trend(months=6)

        self.assertEqual(
            [row['month'] for row in trend],
            ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'],
        )
        self.assertEqual(
            [row['total'] for row in trend],
            [Decimal('0'), Decimal('0'), Decimal('0'), Decimal('40'), Decimal('0'), Decimal('25')],
        )

    def test_empty_database_still_returns_the_requested_months(self):
        trend = spending_trend(months=6)

        self.assertEqual(len(trend), 6)
        self.assertTrue(all(row['total'] == Decimal('0') for row in trend))

    def test_only_the_current_month_is_partial(self):
        trend = spending_trend(months=6)

        self.assertEqual([row['partial'] for row in trend], [False] * 5 + [True])

    def test_limits_to_requested_number_of_months(self):
        trend = spending_trend(months=3)

        self.assertEqual([row['month'] for row in trend], ['2026-08', '2026-09', '2026-10'])

    def test_a_zero_or_negative_month_count_still_returns_the_current_month(self):
        self.assertEqual([row['month'] for row in spending_trend(months=0)], ['2026-10'])

    def test_series_crosses_a_year_boundary(self):
        with patch('enablebanking.services._today', return_value=date(2026, 2, 10)):
            trend = spending_trend(months=4)

        self.assertEqual([row['month'] for row in trend], ['2025-11', '2025-12', '2026-01', '2026-02'])

    def test_excludes_transfers(self):
        self._tx(Decimal('-500'), 'TRANSFER', date(2026, 9, 5), 't1')

        trend = spending_trend(months=6)

        self.assertEqual(self._by_month(trend)['2026-09'], Decimal('0'))

    def test_respects_category_override_for_exclusion(self):
        self._tx(Decimal('-40'), 'GROCERIES', date(2026, 9, 5), 't1', category_override='TRANSFER')

        self.assertEqual(self._by_month(spending_trend(months=6))['2026-09'], Decimal('0'))

    def test_matched_refund_reduces_the_months_total(self):
        self._tx(Decimal('-50'), 'GROCERIES', date(2026, 9, 5), 't1')
        self._tx(Decimal('20'), 'GROCERIES', date(2026, 9, 10), 't2')

        self.assertEqual(self._by_month(spending_trend(months=6))['2026-09'], Decimal('30'))

    def test_fully_refunded_category_contributes_zero_and_the_month_is_kept(self):
        self._tx(Decimal('-50'), 'GROCERIES', date(2026, 9, 5), 't1')
        self._tx(Decimal('50'), 'GROCERIES', date(2026, 9, 10), 't2')

        trend = spending_trend(months=6)

        self.assertIn('2026-09', [row['month'] for row in trend])
        self.assertEqual(self._by_month(trend)['2026-09'], Decimal('0'))

    def test_an_unmatched_credit_larger_than_the_months_spend_does_not_erase_it(self):
        self._tx(Decimal('-100'), 'GROCERIES', date(2026, 9, 5), 't1')
        self._tx(Decimal('-50'), 'DINING', date(2026, 9, 6), 't2')
        self._tx(Decimal('2671.12'), 'REFUND_CREDIT', date(2026, 9, 29), 't3')

        self.assertEqual(self._by_month(spending_trend(months=6))['2026-09'], Decimal('150'))

    def test_a_month_with_only_a_credit_shows_zero_spend_not_a_missing_month(self):
        self._tx(Decimal('2671.12'), 'REFUND_CREDIT', date(2026, 9, 29), 't1')

        trend = spending_trend(months=6)

        self.assertEqual(self._by_month(trend)['2026-09'], Decimal('0'))

    def test_trend_and_summary_agree_for_the_same_month(self):
        self._tx(Decimal('-100'), 'GROCERIES', date(2026, 9, 5), 't1')
        self._tx(Decimal('-50'), 'DINING', date(2026, 9, 6), 't2')
        self._tx(Decimal('30'), 'GROCERIES', date(2026, 9, 7), 't3')
        self._tx(Decimal('2671.12'), 'REFUND_CREDIT', date(2026, 9, 29), 't4')
        self._tx(Decimal('-500'), 'TRANSFER', date(2026, 9, 8), 't5')
        self._tx(Decimal('-20'), 'DINING', date(2026, 9, 9), 't6', category_override='SAVINGS')

        summary = spending_summary(date_from='2026-09-01', date_to='2026-09-30')
        trend = self._by_month(spending_trend(months=6))

        self.assertEqual(summary['total'], Decimal('120'))
        self.assertEqual(trend['2026-09'], summary['total'])

    def test_future_dated_rows_are_not_counted_in_the_current_month(self):
        self._tx(Decimal('-25'), 'GROCERIES', date(2026, 10, 2), 't1')
        self._tx(Decimal('-900'), 'GROCERIES', date(2026, 10, 5), 't2')

        self.assertEqual(self._by_month(spending_trend(months=6))['2026-10'], Decimal('25'))
