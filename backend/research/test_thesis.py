from decimal import Decimal

from django.test import TestCase

from .models import SymbolNote
from .thesis import tickers_with_thesis


class TickersWithThesisTest(TestCase):
    def test_a_note_with_no_content_does_not_count(self):
        SymbolNote.objects.create(symbol='AAPL')
        self.assertEqual(tickers_with_thesis(['AAPL']), set())

    def test_any_populated_text_field_counts(self):
        SymbolNote.objects.create(symbol='AAPL', bull_case='Strong ecosystem lock-in.')
        self.assertEqual(tickers_with_thesis(['AAPL']), {'AAPL'})

    def test_a_target_price_alone_counts(self):
        SymbolNote.objects.create(symbol='AAPL', target_price=Decimal('250.00'))
        self.assertEqual(tickers_with_thesis(['AAPL']), {'AAPL'})

    def test_a_ticker_with_no_note_at_all_does_not_count(self):
        self.assertEqual(tickers_with_thesis(['AAPL']), set())

    def test_only_returns_the_requested_tickers(self):
        SymbolNote.objects.create(symbol='AAPL', bull_case='x')
        SymbolNote.objects.create(symbol='MSFT', bull_case='y')
        self.assertEqual(tickers_with_thesis(['AAPL']), {'AAPL'})

    def test_an_empty_ticker_list_is_a_no_op(self):
        self.assertEqual(tickers_with_thesis([]), set())
