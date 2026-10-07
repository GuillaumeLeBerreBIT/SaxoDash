from datetime import date, timedelta

from django.test import TestCase

from . import quarters
from .factories import make_investor, store_quarter
from .models import Filing

Q1 = date(2026, 3, 31)
Q2 = date(2026, 6, 30)
Q4 = date(2025, 12, 31)
Q3 = date(2025, 9, 30)
AAPL = ('037833100', '')
ALLY = ('02005N100', '')


class SnapshotTest(TestCase):
    def setUp(self):
        self.investor = make_investor()

    def test_lists_stored_quarters_newest_first_once_each(self):
        store_quarter(self.investor, Q1, [('037833100', 'APPLE INC', 10, 100)])
        store_quarter(self.investor, Q2, [('037833100', 'APPLE INC', 10, 100)])
        store_quarter(self.investor, Q2, [('02005N100', 'ALLY', 1, 1)], amendment_type=Filing.NEW_HOLDINGS)

        self.assertEqual(quarters.quarter_ends(self.investor), [Q2, Q1])

    def test_a_restatement_replaces_the_original(self):
        store_quarter(self.investor, Q2, [('037833100', 'APPLE INC', 10, 100), ('02005N100', 'ALLY', 5, 50)])
        store_quarter(
            self.investor, Q2, [('037833100', 'APPLE INC', 12, 120)],
            amendment_type=Filing.RESTATEMENT, filed_on=Q2 + timedelta(days=60),
        )

        snap = quarters.snapshot(self.investor, Q2)

        self.assertEqual(set(snap), {AAPL})
        self.assertEqual((snap[AAPL]['shares'], snap[AAPL]['value']), (12, 120))

    def test_new_holdings_add_to_the_quarter(self):
        store_quarter(self.investor, Q2, [('037833100', 'APPLE INC', 10, 100)])
        store_quarter(
            self.investor, Q2, [('02005N100', 'ALLY', 5, 50)],
            amendment_type=Filing.NEW_HOLDINGS, filed_on=Q2 + timedelta(days=200),
        )

        self.assertEqual(set(quarters.snapshot(self.investor, Q2)), {AAPL, ALLY})

    def test_new_holdings_add_to_the_same_cusip(self):
        store_quarter(self.investor, Q2, [('037833100', 'APPLE INC', 10, 100)])
        store_quarter(
            self.investor, Q2, [('037833100', 'APPLE INC', 4, 40)],
            amendment_type=Filing.NEW_HOLDINGS, filed_on=Q2 + timedelta(days=200),
        )

        snap = quarters.snapshot(self.investor, Q2)

        self.assertEqual((snap[AAPL]['shares'], snap[AAPL]['value']), (14, 140))

    def test_a_restatement_after_new_holdings_starts_over(self):
        store_quarter(self.investor, Q2, [('037833100', 'APPLE INC', 10, 100)])
        store_quarter(
            self.investor, Q2, [('02005N100', 'ALLY', 5, 50)],
            amendment_type=Filing.NEW_HOLDINGS, filed_on=Q2 + timedelta(days=60),
        )
        store_quarter(
            self.investor, Q2, [('037833100', 'APPLE INC', 11, 110)],
            amendment_type=Filing.RESTATEMENT, filed_on=Q2 + timedelta(days=90),
        )

        self.assertEqual(set(quarters.snapshot(self.investor, Q2)), {AAPL})

    def test_an_amendment_with_no_type_replaces(self):
        store_quarter(self.investor, Q2, [('037833100', 'APPLE INC', 10, 100)])
        store_quarter(
            self.investor, Q2, [('02005N100', 'ALLY', 5, 50)],
            form='13F-HR/A', filed_on=Q2 + timedelta(days=60),
        )

        self.assertEqual(set(quarters.snapshot(self.investor, Q2)), {ALLY})

    def test_a_quarter_with_nothing_stored_is_empty(self):
        self.assertEqual(quarters.snapshot(self.investor, Q2), {})


class QuartersHeldTest(TestCase):
    def test_counts_consecutive_quarters_back_from_the_one_asked(self):
        investor = make_investor()
        store_quarter(investor, Q3, [('037833100', 'APPLE INC', 1, 1), ('02005N100', 'ALLY', 1, 1)])
        store_quarter(investor, Q4, [('037833100', 'APPLE INC', 1, 1)])
        store_quarter(investor, Q1, [('037833100', 'APPLE INC', 1, 1), ('02005N100', 'ALLY', 1, 1)])
        store_quarter(investor, Q2, [('037833100', 'APPLE INC', 1, 1), ('02005N100', 'ALLY', 1, 1)])

        keys = quarters.held_keys_by_quarter(investor)

        self.assertEqual(quarters.quarters_held(keys, Q2), {AAPL: 4, ALLY: 2})
        self.assertEqual(quarters.quarters_held(keys, Q4), {AAPL: 2})

    def test_held_keys_respect_amendments(self):
        investor = make_investor()
        store_quarter(investor, Q2, [('037833100', 'APPLE INC', 1, 1)])
        store_quarter(
            investor, Q2, [('02005N100', 'ALLY', 1, 1)],
            amendment_type=Filing.RESTATEMENT, filed_on=Q2 + timedelta(days=90),
        )

        self.assertEqual(quarters.held_keys_by_quarter(investor), {Q2: {ALLY}})
