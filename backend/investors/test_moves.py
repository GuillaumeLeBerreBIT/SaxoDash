from datetime import date
from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from . import moves
from .factories import make_investor, store_quarter
from .models import Filing, PositionMove

Q1 = date(2026, 3, 31)
Q2 = date(2026, 6, 30)
AAPL, NVDA, ALLY, TSLA = '037833100', '67066G104', '02005N100', '88160R101'


def kinds(investor, quarter_end):
    rows = PositionMove.objects.filter(investor=investor, quarter_end=quarter_end)
    return {(row.cusip, row.put_call): row.kind for row in rows}


class RebuildTest(TestCase):
    def setUp(self):
        self.investor = make_investor()

    def test_the_first_stored_quarter_has_no_classification(self):
        store_quarter(self.investor, Q1, [(AAPL, 'APPLE INC', 100, 600)], rebuild=False)

        self.assertEqual(moves.rebuild(self.investor), 1)

        row = PositionMove.objects.get()
        self.assertEqual((row.kind, row.previous_shares, row.change_pct, row.weight_pct), (None, None, None, 100.0))

    def test_classifies_each_holding_against_the_previous_quarter(self):
        store_quarter(self.investor, Q1, [
            (AAPL, 'APPLE INC', 100, 600), (ALLY, 'ALLY FINL INC', 50, 300), (TSLA, 'TESLA INC', 10, 100),
        ], rebuild=False)
        store_quarter(self.investor, Q2, [
            (AAPL, 'APPLE INC', 150, 900), (TSLA, 'TESLA INC', 5, 40), (NVDA, 'NVIDIA CORP', 1, 60),
        ], rebuild=False)

        moves.rebuild(self.investor)

        self.assertEqual(kinds(self.investor, Q2), {
            (AAPL, ''): 'added', (TSLA, ''): 'trimmed', (NVDA, ''): 'new', (ALLY, ''): 'sold_out',
        })
        added = PositionMove.objects.get(quarter_end=Q2, cusip=AAPL)
        self.assertEqual(
            (added.shares, added.previous_shares, added.value, added.previous_value, added.change_pct),
            (150, 100, 900, 600, 50.0),
        )
        self.assertEqual((added.weight_pct, added.previous_weight_pct), (90.0, 60.0))
        sold = PositionMove.objects.get(quarter_end=Q2, cusip=ALLY)
        self.assertEqual(
            (sold.shares, sold.value, sold.weight_pct, sold.previous_weight_pct, sold.change_pct, sold.issuer),
            (0, 0, 0.0, 30.0, -100.0, 'ALLY FINL INC'),
        )

    def test_options_are_kept_apart_from_the_stock(self):
        store_quarter(self.investor, Q1, [(NVDA, 'NVIDIA CORP', 10, 100)], rebuild=False)
        store_quarter(self.investor, Q2, [
            (NVDA, 'NVIDIA CORP', 10, 100), (NVDA, 'NVIDIA CORP', 5, 20, 'CALL'),
        ], rebuild=False)

        moves.rebuild(self.investor)

        self.assertEqual(kinds(self.investor, Q2), {(NVDA, ''): 'unchanged', (NVDA, 'CALL'): 'new'})

    def test_a_later_restatement_changes_the_moves(self):
        store_quarter(self.investor, Q1, [(AAPL, 'APPLE INC', 100, 600)], rebuild=False)
        store_quarter(self.investor, Q2, [(AAPL, 'APPLE INC', 100, 600)], rebuild=False)
        moves.rebuild(self.investor)
        self.assertEqual(kinds(self.investor, Q2), {(AAPL, ''): 'unchanged'})

        store_quarter(
            self.investor, Q2, [(AAPL, 'APPLE INC', 40, 240), (NVDA, 'NVIDIA CORP', 1, 60)],
            filed_on=date(2026, 9, 1), amendment_type=Filing.RESTATEMENT, rebuild=False,
        )
        moves.rebuild(self.investor)

        self.assertEqual(kinds(self.investor, Q2), {(AAPL, ''): 'trimmed', (NVDA, ''): 'new'})

    def test_rebuilding_twice_leaves_the_same_rows(self):
        store_quarter(self.investor, Q1, [(AAPL, 'APPLE INC', 100, 600)], rebuild=False)
        store_quarter(self.investor, Q2, [(AAPL, 'APPLE INC', 150, 900)], rebuild=False)

        self.assertEqual(moves.rebuild(self.investor), moves.rebuild(self.investor))
        self.assertEqual(PositionMove.objects.count(), 2)

    def test_only_that_investors_rows_are_replaced(self):
        other = make_investor(name='Bill Ackman', firm='Pershing Square', cik=1336528, slug='pershing-square')
        store_quarter(other, Q1, [(AAPL, 'APPLE INC', 1, 1)], rebuild=False)
        moves.rebuild(other)
        store_quarter(self.investor, Q1, [(AAPL, 'APPLE INC', 1, 1)], rebuild=False)

        moves.rebuild(self.investor)

        self.assertEqual(PositionMove.objects.filter(investor=other).count(), 1)

    def test_an_investor_without_filings_has_no_moves(self):
        self.assertEqual(moves.rebuild(self.investor), 0)


class StoreQuarterFactoryTest(TestCase):
    def test_storing_a_quarter_rebuilds_moves_by_default(self):
        investor = make_investor()
        store_quarter(investor, Q1, [(AAPL, 'APPLE INC', 100, 600)])
        self.assertEqual(PositionMove.objects.filter(investor=investor).count(), 1)


class RebuildMovesCommandTest(TestCase):
    def test_rebuilds_every_investor_and_reports_the_row_count(self):
        investor = make_investor()
        store_quarter(investor, Q1, [(AAPL, 'APPLE INC', 100, 600)], rebuild=False)
        out = StringIO()

        call_command('rebuild_moves', stdout=out)

        self.assertEqual(PositionMove.objects.count(), 1)
        self.assertIn('1 moves', out.getvalue())
