from datetime import date

from django.db import IntegrityError, transaction
from django.test import TestCase

from .factories import make_investor
from .models import STYLES, Filing, Holding, Investor, PositionMove, Security


def make_filing(investor, accession='0001-26-000001'):
    return Filing.objects.create(
        investor=investor, quarter_end=date(2026, 6, 30), filed_on=date(2026, 8, 14),
        accession=accession, form='13F-HR', total_value=100, positions=1,
    )


class InvestorModelTest(TestCase):
    def setUp(self):
        self.investor = Investor.objects.create(
            name='Warren Buffett', firm='Berkshire Hathaway', cik=1067983, slug='berkshire-hathaway',
        )

    def test_a_stock_and_its_call_option_are_two_holdings(self):
        filing = make_filing(self.investor)
        Holding.objects.create(filing=filing, cusip='037833100', issuer='APPLE INC', shares=10, value=100)
        Holding.objects.create(
            filing=filing, cusip='037833100', issuer='APPLE INC', shares=5, value=50, put_call='CALL',
        )
        self.assertEqual(filing.holdings.count(), 2)

    def test_one_cusip_is_stored_once_per_filing_and_side(self):
        filing = make_filing(self.investor)
        Holding.objects.create(filing=filing, cusip='037833100', issuer='APPLE INC', shares=10, value=100)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Holding.objects.create(filing=filing, cusip='037833100', issuer='APPLE INC', shares=1, value=1)

    def test_an_accession_is_stored_once(self):
        make_filing(self.investor)
        with self.assertRaises(IntegrityError), transaction.atomic():
            make_filing(self.investor)

    def test_deleting_an_investor_keeps_the_shared_security_cache(self):
        filing = make_filing(self.investor)
        Holding.objects.create(filing=filing, cusip='037833100', issuer='APPLE INC', shares=10, value=100)
        Security.objects.create(cusip='037833100', ticker='AAPL')

        self.investor.delete()

        self.assertFalse(Holding.objects.exists())
        self.assertTrue(Security.objects.filter(cusip='037833100').exists())

    def test_an_unresolved_security_has_no_ticker_and_no_attempts(self):
        security = Security.objects.create(cusip='02005N100')
        self.assertIsNone(security.ticker)
        self.assertEqual(security.attempts, 0)


class InvestorHubFieldsTest(TestCase):
    def test_a_new_investor_has_no_styles_and_is_not_followed(self):
        investor = make_investor()
        self.assertEqual((investor.styles, investor.followed), ([], False))

    def test_the_style_vocabulary_is_fixed(self):
        self.assertEqual(
            STYLES, ('Value', 'Growth', 'Activist', 'Macro', 'Tech', 'Concentrated', 'Contrarian', 'Quant'),
        )


class PositionMoveTest(TestCase):
    def move(self, investor, **over):
        fields = {
            'investor': investor, 'quarter_end': date(2026, 6, 30), 'cusip': '037833100', 'put_call': '',
            'issuer': 'APPLE INC', 'kind': 'new', 'shares': 10, 'value': 100, 'weight_pct': 100.0,
        }
        fields.update(over)
        return PositionMove.objects.create(**fields)

    def test_one_row_per_investor_quarter_and_holding_side(self):
        investor = make_investor()
        self.move(investor)
        self.move(investor, put_call='CALL')
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.move(investor)

    def test_comparison_fields_are_optional(self):
        move = self.move(make_investor(), kind=None)
        self.assertEqual(
            (move.kind, move.previous_shares, move.previous_value, move.previous_weight_pct, move.change_pct),
            (None, None, None, None, None),
        )

    def test_deleting_an_investor_deletes_its_moves(self):
        investor = make_investor()
        self.move(investor)
        investor.delete()
        self.assertEqual(PositionMove.objects.count(), 0)
