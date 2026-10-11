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

        keys = quarters.held_keys_by_quarter(investor, {})

        self.assertEqual(quarters.quarters_held(keys, Q2), {AAPL: 4, ALLY: 2})
        self.assertEqual(quarters.quarters_held(keys, Q4), {AAPL: 2})

    def test_held_keys_respect_amendments(self):
        investor = make_investor()
        store_quarter(investor, Q2, [('037833100', 'APPLE INC', 1, 1)])
        store_quarter(
            investor, Q2, [('02005N100', 'ALLY', 1, 1)],
            amendment_type=Filing.RESTATEMENT, filed_on=Q2 + timedelta(days=90),
        )

        self.assertEqual(quarters.held_keys_by_quarter(investor, {}), {Q2: {ALLY}})

    def test_tenure_runs_through_a_change_of_identifier(self):
        investor = make_investor()
        store_quarter(investor, Q1, [('30231G102', 'EXXON MOBIL CORP', 1, 1)])
        store_quarter(investor, Q2, [('30233Q108', 'EXXONMOBIL HOLDINGS CORP', 1, 1)])
        tickers = {'30231G102': 'XOM', '30233Q108': 'XOM'}

        keys = quarters.held_keys_by_quarter(investor, tickers)

        self.assertEqual(quarters.quarters_held(keys, Q2), {('XOM', ''): 2})


class CarriedOverTest(TestCase):
    OLD, NEW, OTHER = '30231G102', '30233Q108', '037833100'
    TICKERS = {OLD: 'XOM', NEW: 'XOM', OTHER: 'AAPL'}

    def snap(self, *keys):
        return {key: {'cusip': key[0], 'put_call': key[1], 'shares': 10, 'value': 100} for key in keys}

    def carried(self, before, after, tickers=None):
        return set(quarters.carried_over(before, after, self.TICKERS if tickers is None else tickers))

    def test_a_first_quarter_has_nothing_to_carry(self):
        self.assertIsNone(quarters.carried_over(None, self.snap((self.NEW, '')), self.TICKERS))

    def test_a_position_that_changed_identifier_is_compared_under_its_new_one(self):
        before = self.snap((self.OLD, ''), (self.OTHER, ''))
        after = self.snap((self.NEW, ''), (self.OTHER, ''))

        self.assertEqual(self.carried(before, after), {(self.NEW, ''), (self.OTHER, '')})

    def test_the_row_itself_is_carried_untouched(self):
        before = self.snap((self.OLD, ''))

        carried = quarters.carried_over(before, self.snap((self.NEW, '')), self.TICKERS)

        self.assertIs(carried[(self.NEW, '')], before[(self.OLD, '')])

    def test_identifiers_without_a_shared_ticker_stay_apart(self):
        before, after = self.snap((self.OLD, '')), self.snap((self.NEW, ''))

        self.assertEqual(self.carried(before, after, {self.OLD: 'XOM'}), {(self.OLD, '')})
        self.assertEqual(self.carried(before, after, {}), {(self.OLD, '')})

    def test_an_identifier_still_held_is_not_renamed(self):
        before = self.snap((self.OLD, ''))
        after = self.snap((self.OLD, ''), (self.NEW, ''))

        self.assertEqual(self.carried(before, after), {(self.OLD, '')})

    def test_an_option_never_becomes_the_stock(self):
        before, after = self.snap((self.OLD, 'CALL')), self.snap((self.NEW, ''))

        self.assertEqual(self.carried(before, after), {(self.OLD, 'CALL')})

    def test_two_candidates_for_one_departure_rename_nothing(self):
        third = '999999999'
        before = self.snap((self.OLD, ''))
        after = self.snap((self.NEW, ''), (third, ''))

        self.assertEqual(self.carried(before, after, {**self.TICKERS, third: 'XOM'}), {(self.OLD, '')})
