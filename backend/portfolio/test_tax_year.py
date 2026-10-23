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


def closed(symbol, closed_at, pnl, amount=5, opened_at='2026-02-01T10:00:00.000000Z', **extra):
    base = {
        'BuyOrSell': 'Buy',
        'Amount': amount,
        'ExecutionTimeOpen': opened_at,
        'ExecutionTimeClose': closed_at,
        'ClosingPrice': 10.0,
        'Uic': 7,
        'AssetType': 'Stock',
    }
    if pnl is not None:
        base['ProfitLossOnTradeInBaseCurrency'] = pnl
    base.update(extra)
    return {
        'ClosedPositionUniqueId': f'{symbol}-{closed_at}',
        'ClosedPosition': base,
        'DisplayAndFormat': {'Symbol': f'{symbol}:xnas', 'Currency': 'USD'},
    }


def lots(*entries):
    return {'AAA': [(day, Decimal(str(qty)), Decimal(str(price))) for day, qty, price in entries]}


class UnrealisedTests(SimpleTestCase):
    def test_pre_2026_position_uses_dec_31_close(self):
        rows = tax_year.unrealised([position()], {'AAA': 100.0}, lots((date(2025, 6, 1), 10, 90)))
        self.assertEqual(rows[0]['basis'], 100.0)
        self.assertEqual(rows[0]['basis_source'], 'dec_31_2025')

    def test_basis_day_itself_counts_as_pre_2026(self):
        rows = tax_year.unrealised([position()], {'AAA': 100.0}, lots((tax_year.BASIS_DAY, 10, 90)))
        self.assertEqual(rows[0]['basis_source'], 'dec_31_2025')

    def test_2026_position_uses_avg_cost(self):
        rows = tax_year.unrealised([position()], {'AAA': 100.0}, lots((date(2026, 2, 1), 10, 90)))
        self.assertEqual(rows[0]['basis'], 90.0)
        self.assertEqual(rows[0]['basis_source'], 'avg_cost')

    def test_unknown_opening_date_uses_avg_cost(self):
        rows = tax_year.unrealised([position()], {}, {})
        self.assertEqual(rows[0]['basis_source'], 'avg_cost')

    def test_unrealised_is_converted_with_fx_rate(self):
        rows = tax_year.unrealised([position()], {'AAA': 100.0}, lots((date(2025, 6, 1), 10, 90)))
        self.assertEqual(rows[0]['unrealised_eur'], Decimal('180.00'))

    def test_missing_basis_close_is_null(self):
        rows = tax_year.unrealised([position()], {'AAA': None}, lots((date(2025, 6, 1), 10, 90)))
        self.assertIsNone(rows[0]['unrealised_eur'])
        self.assertIsNone(rows[0]['basis'])

    def test_lots_on_both_sides_are_based_separately(self):
        held = lots((date(2025, 6, 1), 6, 80), (date(2026, 2, 1), 4, 110))
        rows = tax_year.unrealised([position()], {'AAA': 100.0}, held)
        self.assertEqual(rows[0]['basis_source'], 'dec_31_2025_and_cost')
        self.assertEqual(rows[0]['basis'], 104.0)
        self.assertEqual(rows[0]['unrealised_eur'], Decimal('144.00'))

    def test_mixed_lots_with_a_sale_since_cannot_be_split(self):
        held = lots((date(2025, 6, 1), 6, 80), (date(2026, 2, 1), 6, 110))
        rows = tax_year.unrealised([position()], {'AAA': 100.0}, held)
        self.assertEqual(rows[0]['basis_source'], 'unsplit')
        self.assertIsNone(rows[0]['basis'])
        self.assertIsNone(rows[0]['unrealised_eur'])

    def test_mixed_lots_without_a_dec_31_close_are_null(self):
        held = lots((date(2025, 6, 1), 6, 80), (date(2026, 2, 1), 4, 110))
        rows = tax_year.unrealised([position()], {'AAA': None}, held)
        self.assertIsNone(rows[0]['unrealised_eur'])


class RealisedTests(SimpleTestCase):
    def test_realised_rows_from_saxo_payload(self):
        payload = [
            closed('AAA', '2026-03-04T10:00:00.000000Z', 123.456, amount=-5),
            closed('BBB', '2025-12-30T10:00:00.000000Z', 999.0),
            closed('CCC', '2026-07-01T09:00:00.000000Z', -20.0),
        ]
        rows, reason = tax_year.realised(payload, 2026, {})
        self.assertIsNone(reason)
        self.assertEqual(
            rows,
            [
                {'ticker': 'AAA', 'closed_on': date(2026, 3, 4), 'qty': Decimal('5'), 'basis_source': 'saxo', 'realised_eur': Decimal('123.46')},
                {'ticker': 'CCC', 'closed_on': date(2026, 7, 1), 'qty': Decimal('5'), 'basis_source': 'saxo', 'realised_eur': Decimal('-20.00')},
            ],
        )

    def test_pre_2026_lot_is_rebased_on_the_dec_31_close(self):
        payload = [closed('AAA', '2026-03-04T10:00:00Z', 160 * 5 * 0.9, opened_at='2023-05-01T14:00:00Z',
                          ClosingPrice=180.0, ConversionRateClose=0.9)]
        rows, reason = tax_year.realised(payload, 2026, {(7, 'Stock'): 140.0})
        self.assertIsNone(reason)
        self.assertEqual(rows[0]['realised_eur'], Decimal('180.00'))
        self.assertEqual(rows[0]['basis_source'], 'dec_31_2025')

    def test_pre_2026_short_is_rebased_the_other_way(self):
        payload = [closed('AAA', '2026-03-04T10:00:00Z', 0.0, opened_at='2025-05-01T14:00:00Z',
                          BuyOrSell='Sell', ClosingPrice=120.0, ConversionRateClose=1.0)]
        rows, _ = tax_year.realised(payload, 2026, {(7, 'Stock'): 140.0})
        self.assertEqual(rows[0]['realised_eur'], Decimal('100.00'))

    def test_pre_2026_lot_without_a_dec_31_close_is_unknown(self):
        payload = [closed('AAA', '2026-03-04T10:00:00Z', 5.0, opened_at='2025-05-01T14:00:00Z', ConversionRateClose=0.9)]
        rows, reason = tax_year.realised(payload, 2026, {(7, 'Stock'): None})
        self.assertIsNone(rows)
        self.assertIn('AAA', reason)
        self.assertIn('31 December 2025', reason)

    def test_pre_2026_lot_without_a_conversion_rate_is_unknown(self):
        payload = [closed('AAA', '2026-03-04T10:00:00Z', 5.0, opened_at='2025-05-01T14:00:00Z')]
        rows, reason = tax_year.realised(payload, 2026, {(7, 'Stock'): 140.0})
        self.assertIsNone(rows)
        self.assertIn('AAA', reason)

    def test_basis_instruments_are_the_pre_2026_lots_closed_this_year(self):
        payload = [
            closed('AAA', '2026-03-04T10:00:00Z', 5.0, opened_at='2025-05-01T14:00:00Z'),
            closed('BBB', '2026-03-04T10:00:00Z', 5.0, Uic=8),
            closed('CCC', '2025-03-04T10:00:00Z', 5.0, opened_at='2024-05-01T14:00:00Z', Uic=9),
        ]
        self.assertEqual(tax_year.basis_instruments(payload, 2026), {(7, 'Stock'): 'AAA'})

    def test_days_are_brussels_days_not_utc(self):
        payload = [closed('AAA', '2025-12-31T23:30:00Z', 42.0, opened_at='2025-12-31T23:15:00Z')]
        rows, reason = tax_year.realised(payload, 2026, {})
        self.assertIsNone(reason)
        self.assertEqual(rows[0]['closed_on'], date(2026, 1, 1))
        self.assertEqual(rows[0]['basis_source'], 'saxo')
        self.assertEqual(tax_year.realised(payload, 2025, {}), ([], None))

    def test_missing_account_currency_pnl_is_none_not_zero(self):
        payload = [closed('AAA', '2026-03-04T10:00:00.000000Z', None)]
        rows, reason = tax_year.realised(payload, 2026, {})
        self.assertIsNone(rows)
        self.assertIn('account-currency P/L', reason)

    def test_missing_close_time_is_none_and_says_so(self):
        payload = [closed('AAA', '2026-03-04T10:00:00.000000Z', 5.0)]
        del payload[0]['ClosedPosition']['ExecutionTimeClose']
        rows, reason = tax_year.realised(payload, 2026, {})
        self.assertIsNone(rows)
        self.assertIn('close time', reason)

    def test_missing_field_on_an_other_year_row_is_ignored(self):
        payload = [closed('AAA', '2025-03-04T10:00:00.000000Z', None)]
        self.assertEqual(tax_year.realised(payload, 2026, {}), ([], None))


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
        self.assertIsNone(result['exemption_left_eur'])

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

    def test_all_unknown_unrealised_totals_are_none(self):
        rows = [{'unrealised_eur': None}, {'unrealised_eur': None}]
        result = tax_year.summary(gains(0), rows, Decimal('0'))
        self.assertIsNone(result['unrealised_gains_eur'])
        self.assertIsNone(result['unrealised_losses_eur'])

    def test_no_positions_means_zero_unrealised(self):
        result = tax_year.summary(gains(0), [], Decimal('0'))
        self.assertEqual(result['unrealised_gains_eur'], Decimal('0.00'))
        self.assertEqual(result['unrealised_losses_eur'], Decimal('0.00'))
