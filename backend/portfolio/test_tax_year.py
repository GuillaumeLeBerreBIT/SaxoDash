from datetime import date
from decimal import Decimal

from django.test import SimpleTestCase

from portfolio import tax_year
from portfolio.models import Position


def position(ticker='AAA', qty=10, avg_cost=90, current_price=120, fx_rate='0.9'):
    return Position(
        ticker=ticker, qty=Decimal(qty), avg_cost=Decimal(avg_cost),
        current_price=Decimal(current_price), fx_rate=Decimal(fx_rate), currency='USD',
    )


def closed(symbol, closed_at, pnl, amount=5, **extra):
    base = {
        'BuyOrSell': 'Buy',
        'Amount': amount,
        'ExecutionTimeClose': closed_at,
        'ClosingPrice': 10.0,
    }
    if pnl is not None:
        base['ProfitLossOnTradeInBaseCurrency'] = pnl
    base.update(extra)
    return {
        'ClosedPositionUniqueId': f'{symbol}-{closed_at}',
        'ClosedPosition': base,
        'DisplayAndFormat': {'Symbol': f'{symbol}:xnas', 'Currency': 'USD'},
    }


class UnrealisedTests(SimpleTestCase):
    def test_pre_2026_position_uses_dec_31_close(self):
        rows = tax_year.unrealised([position()], {'AAA': 100.0}, {'AAA': date(2025, 6, 1)})
        self.assertEqual(rows[0]['basis'], 100.0)
        self.assertEqual(rows[0]['basis_source'], 'dec_31_2025')

    def test_basis_day_itself_counts_as_pre_2026(self):
        rows = tax_year.unrealised([position()], {'AAA': 100.0}, {'AAA': tax_year.BASIS_DAY})
        self.assertEqual(rows[0]['basis_source'], 'dec_31_2025')

    def test_2026_position_uses_avg_cost(self):
        rows = tax_year.unrealised([position()], {'AAA': 100.0}, {'AAA': date(2026, 2, 1)})
        self.assertEqual(rows[0]['basis'], 90.0)
        self.assertEqual(rows[0]['basis_source'], 'avg_cost')

    def test_unknown_opening_date_uses_avg_cost(self):
        rows = tax_year.unrealised([position()], {}, {'AAA': None})
        self.assertEqual(rows[0]['basis_source'], 'avg_cost')

    def test_unrealised_is_converted_with_fx_rate(self):
        rows = tax_year.unrealised([position()], {'AAA': 100.0}, {'AAA': date(2025, 6, 1)})
        self.assertEqual(rows[0]['unrealised_eur'], Decimal('180.00'))

    def test_missing_basis_close_is_null(self):
        rows = tax_year.unrealised([position()], {'AAA': None}, {'AAA': date(2025, 6, 1)})
        self.assertIsNone(rows[0]['unrealised_eur'])
        self.assertIsNone(rows[0]['basis'])


class RealisedTests(SimpleTestCase):
    def test_realised_rows_from_saxo_payload(self):
        payload = [
            closed('AAA', '2026-03-04T10:00:00.000000Z', 123.456, amount=-5),
            closed('BBB', '2025-12-30T10:00:00.000000Z', 999.0),
            closed('CCC', '2026-07-01T09:00:00.000000Z', -20.0),
        ]
        rows = tax_year.realised(payload, 2026)
        self.assertEqual(
            rows,
            [
                {'ticker': 'AAA', 'closed_on': date(2026, 3, 4), 'qty': Decimal('5'), 'realised_eur': Decimal('123.46')},
                {'ticker': 'CCC', 'closed_on': date(2026, 7, 1), 'qty': Decimal('5'), 'realised_eur': Decimal('-20.00')},
            ],
        )

    def test_missing_account_currency_pnl_is_none_not_zero(self):
        payload = [closed('AAA', '2026-03-04T10:00:00.000000Z', None)]
        self.assertIsNone(tax_year.realised(payload, 2026))

    def test_missing_field_on_an_other_year_row_is_ignored(self):
        payload = [closed('AAA', '2025-03-04T10:00:00.000000Z', None)]
        self.assertEqual(tax_year.realised(payload, 2026), [])


def gains(*amounts):
    return [{'realised_eur': Decimal(str(a))} for a in amounts]


class SummaryTests(SimpleTestCase):
    def test_exemption_with_capped_carry_over(self):
        result = tax_year.summary(gains(0), [], Decimal('8000'))
        self.assertEqual(result['exemption_eur'], Decimal('15000'))

    def test_tax_only_above_exemption(self):
        result = tax_year.summary(gains(12000), [], Decimal('0'))
        self.assertEqual(result['taxable_eur'], Decimal('2000.00'))
        self.assertEqual(result['estimated_tax_eur'], Decimal('200.00'))
        self.assertEqual(result['exemption_left_eur'], Decimal('0.00'))

    def test_below_exemption_pays_nothing(self):
        result = tax_year.summary(gains(4000), [], Decimal('0'))
        self.assertEqual(result['taxable_eur'], Decimal('0.00'))
        self.assertEqual(result['estimated_tax_eur'], Decimal('0.00'))
        self.assertEqual(result['exemption_left_eur'], Decimal('6000.00'))

    def test_losses_offset_gains_same_year(self):
        result = tax_year.summary(gains(15000, -4000), [], Decimal('0'))
        self.assertEqual(result['realised_net_eur'], Decimal('11000.00'))
        self.assertEqual(result['estimated_tax_eur'], Decimal('100.00'))

    def test_unknown_realised_leaves_tax_none(self):
        result = tax_year.summary(None, [], Decimal('0'))
        self.assertIsNone(result['realised_net_eur'])
        self.assertIsNone(result['taxable_eur'])
        self.assertIsNone(result['estimated_tax_eur'])
        self.assertEqual(result['exemption_eur'], Decimal('10000'))
        self.assertEqual(result['exemption_left_eur'], Decimal('10000'))

    def test_unrealised_gains_and_losses_skip_nulls(self):
        rows = [
            {'unrealised_eur': Decimal('50.00')},
            {'unrealised_eur': Decimal('-20.00')},
            {'unrealised_eur': None},
            {'unrealised_eur': Decimal('10.00')},
        ]
        result = tax_year.summary(gains(0), rows, Decimal('0'))
        self.assertEqual(result['unrealised_gains_eur'], Decimal('60.00'))
        self.assertEqual(result['unrealised_losses_eur'], Decimal('-20.00'))
