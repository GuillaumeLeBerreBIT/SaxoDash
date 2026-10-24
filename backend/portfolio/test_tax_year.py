from datetime import date
from decimal import Decimal

from django.test import SimpleTestCase, TestCase

from portfolio import tax_year
from portfolio.models import Position
from transactions.models import Transaction


def position(ticker='AAA', qty=10, avg_cost=90, current_price=120, fx_rate='0.9'):
    return Position(
        ticker=ticker, qty=Decimal(qty), avg_cost=Decimal(avg_cost),
        current_price=Decimal(current_price), fx_rate=Decimal(fx_rate), currency='USD',
    )


def closed(symbol, closed_on, pnl, qty=5, opened_on='2026-02-01', **extra):
    row = {
        'InstrumentSymbol': f'{symbol}:xnas',
        'AssetType': 'Stock',
        'Uic': 7,
        'TradeDateOpen': opened_on,
        'TradeDateClose': closed_on,
        'AmountClose': -qty,
        'ClosePrice': 10.0,
    }
    if pnl is not None:
        row['PnLAccountCurrency'] = pnl
    row.update(extra)
    return row


def lots(*entries):
    return {'AAA': [(day, Decimal(str(qty)), Decimal(str(price))) for day, qty, price in entries]}


def closes(prices):
    return lambda uic, asset_type: (prices.get((uic, asset_type)), None)


AAA = (None, None)


class UnrealisedTests(SimpleTestCase):
    def test_pre_2026_position_uses_dec_31_close(self):
        rows = tax_year.unrealised([position()], closes({AAA: 100.0}), lots((date(2025, 6, 1), 10, 90)))
        self.assertEqual(rows[0]['basis'], 100.0)
        self.assertEqual(rows[0]['basis_source'], 'dec_31_2025')

    def test_basis_day_itself_counts_as_pre_2026(self):
        rows = tax_year.unrealised([position()], closes({AAA: 100.0}), lots((tax_year.BASIS_DAY, 10, 90)))
        self.assertEqual(rows[0]['basis_source'], 'dec_31_2025')

    def test_2026_position_uses_avg_cost(self):
        rows = tax_year.unrealised([position()], closes({AAA: 100.0}), lots((date(2026, 2, 1), 10, 90)))
        self.assertEqual(rows[0]['basis'], 90.0)
        self.assertEqual(rows[0]['basis_source'], 'avg_cost')

    def test_no_recorded_purchase_is_unknown_not_avg_cost(self):
        rows = tax_year.unrealised([position()], closes({}), {})
        self.assertEqual(rows[0]['basis_source'], 'unknown')
        self.assertIsNone(rows[0]['basis'])
        self.assertIsNone(rows[0]['unrealised_eur'])

    def test_unrealised_is_converted_with_fx_rate(self):
        rows = tax_year.unrealised([position()], closes({AAA: 100.0}), lots((date(2025, 6, 1), 10, 90)))
        self.assertEqual(rows[0]['unrealised_eur'], Decimal('180.00'))

    def test_missing_basis_close_is_null(self):
        rows = tax_year.unrealised([position()], closes({}), lots((date(2025, 6, 1), 10, 90)))
        self.assertIsNone(rows[0]['unrealised_eur'])
        self.assertIsNone(rows[0]['basis'])

    def test_lots_on_both_sides_are_based_separately(self):
        held = lots((date(2025, 6, 1), 6, 80), (date(2026, 2, 1), 4, 110))
        rows = tax_year.unrealised([position()], closes({AAA: 100.0}), held)
        self.assertEqual(rows[0]['basis_source'], 'dec_31_2025_and_cost')
        self.assertEqual(rows[0]['basis'], 104.0)
        self.assertEqual(rows[0]['unrealised_eur'], Decimal('144.00'))

    def test_mixed_lots_with_a_sale_since_cannot_be_split(self):
        held = lots((date(2025, 6, 1), 6, 80), (date(2026, 2, 1), 6, 110))
        rows = tax_year.unrealised([position()], closes({AAA: 100.0}), held)
        self.assertEqual(rows[0]['basis_source'], 'unsplit')
        self.assertIsNone(rows[0]['basis'])
        self.assertIsNone(rows[0]['unrealised_eur'])

    def test_mixed_lots_without_a_dec_31_close_are_null(self):
        held = lots((date(2025, 6, 1), 6, 80), (date(2026, 2, 1), 4, 110))
        rows = tax_year.unrealised([position()], closes({}), held)
        self.assertIsNone(rows[0]['unrealised_eur'])


class RealisedTests(SimpleTestCase):
    def test_realised_rows_from_the_closed_positions_report(self):
        payload = [
            closed('AAA', '2026-03-04', 123.456),
            closed('BBB', '2025-12-30', 999.0),
            closed('CCC', '2026-07-01', -20.0),
        ]
        rows, reason = tax_year.realised(payload, 2026, closes({}))
        self.assertIsNone(reason)
        self.assertEqual(
            rows,
            [
                {'ticker': 'AAA', 'closed_on': date(2026, 3, 4), 'qty': Decimal('5'), 'basis_source': 'saxo', 'realised_eur': Decimal('123.46')},
                {'ticker': 'CCC', 'closed_on': date(2026, 7, 1), 'qty': Decimal('5'), 'basis_source': 'saxo', 'realised_eur': Decimal('-20.00')},
            ],
        )

    def test_pre_2026_lot_is_rebased_on_the_dec_31_close(self):
        payload = [closed('AAA', '2026-03-04', 160 * 5 * 0.9, opened_on='2023-05-01',
                          ClosePrice=180.0, TotalBookedOnClosingLegAccountCurrency=180 * 5 * 0.9)]
        rows, reason = tax_year.realised(payload, 2026, closes({(7, 'Stock'): 140.0}))
        self.assertIsNone(reason)
        self.assertEqual(rows[0]['realised_eur'], Decimal('180.00'))
        self.assertEqual(rows[0]['basis_source'], 'dec_31_2025')

    def test_pre_2026_short_is_rebased_the_other_way(self):
        payload = [closed('AAA', '2026-03-04', 0.0, opened_on='2025-05-01', CloseType='Buy',
                          ClosePrice=120.0, TotalBookedOnClosingLegAccountCurrency=-600.0)]
        rows, _ = tax_year.realised(payload, 2026, closes({(7, 'Stock'): 140.0}))
        self.assertEqual(rows[0]['realised_eur'], Decimal('100.00'))

    def test_the_basis_day_itself_counts_as_pre_2026(self):
        payload = [closed('AAA', '2026-03-04', 5.0, opened_on='2025-12-31', TotalBookedOnClosingLegAccountCurrency=50.0)]
        rows, _ = tax_year.realised(payload, 2026, closes({(7, 'Stock'): 8.0}))
        self.assertEqual(rows[0]['basis_source'], 'dec_31_2025')

    def test_pre_2026_lot_without_a_dec_31_close_is_unknown(self):
        payload = [closed('AAA', '2026-03-04', 5.0, opened_on='2025-05-01', TotalBookedOnClosingLegAccountCurrency=50.0)]
        rows, reason = tax_year.realised(payload, 2026, closes({(7, 'Stock'): None}))
        self.assertIsNone(rows)
        self.assertIn('AAA', reason)
        self.assertIn('31 December 2025', reason)

    def test_a_missing_dec_31_close_says_why(self):
        payload = [closed('AAA', '2026-03-04', 5.0, opened_on='2025-05-01', TotalBookedOnClosingLegAccountCurrency=50.0)]
        _, reason = tax_year.realised(payload, 2026, lambda uic, asset_type: (None, 'Saxo is not connected'))
        self.assertIn('(Saxo is not connected)', reason)

    def test_pre_2026_lot_without_its_closing_proceeds_is_unknown(self):
        payload = [closed('AAA', '2026-03-04', 5.0, opened_on='2025-05-01')]
        rows, reason = tax_year.realised(payload, 2026, closes({(7, 'Stock'): 140.0}))
        self.assertIsNone(rows)
        self.assertIn('AAA', reason)

    def test_pre_2026_lot_without_a_uic_is_unknown(self):
        payload = [closed('AAA', '2026-03-04', 5.0, opened_on='2025-05-01', Uic=None, TotalBookedOnClosingLegAccountCurrency=50.0)]
        rows, reason = tax_year.realised(payload, 2026, lambda uic, asset_type: (None, 'no Saxo identity') if uic is None else (9.0, None))
        self.assertIsNone(rows)
        self.assertIn('no Saxo identity', reason)

    def test_missing_account_currency_pnl_is_none_not_zero(self):
        rows, reason = tax_year.realised([closed('AAA', '2026-03-04', None)], 2026, closes({}))
        self.assertIsNone(rows)
        self.assertIn('account-currency P/L', reason)

    def test_missing_close_date_is_none_and_says_so(self):
        payload = [closed('AAA', '2026-03-04', 5.0)]
        del payload[0]['TradeDateClose']
        rows, reason = tax_year.realised(payload, 2026, closes({}))
        self.assertIsNone(rows)
        self.assertIn('close date', reason)

    def test_missing_open_date_is_none_and_says_so(self):
        payload = [closed('AAA', '2026-03-04', 5.0)]
        del payload[0]['TradeDateOpen']
        rows, reason = tax_year.realised(payload, 2026, closes({}))
        self.assertIsNone(rows)
        self.assertIn('opening date', reason)

    def test_missing_field_on_an_other_year_row_is_ignored(self):
        self.assertEqual(tax_year.realised([closed('AAA', '2025-03-04', None)], 2026, closes({})), ([], None))


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


def make_position(ticker='AAA', uic=1):
    return Position.objects.create(
        ticker=ticker, name=ticker, qty=Decimal('10'), avg_cost=Decimal('90'),
        current_price=Decimal('120'), sector='Tech', type='STOCK', color='#000000',
        uic=uic, asset_type='Stock', currency='USD', fx_rate=Decimal('0.9'),
    )


def bought(ticker, day, qty, price, trade):
    Transaction.objects.create(date=day, type='BUY', instrument=ticker, ticker=ticker, qty=qty, price=price, saxo_trade_id=trade)


class ReportTests(TestCase):
    def lookup(self, prices):
        self.asked = []

        def close_on(uic, asset_type):
            self.asked.append((uic, asset_type))
            if (uic, asset_type) in prices:
                return prices[(uic, asset_type)], None
            return None, 'no close on or before 31 December 2025'

        return close_on

    def test_a_year_before_2026_is_refused(self):
        with self.assertRaises(tax_year.NotATaxYear) as refused:
            tax_year.report(2025, 0, closed_rows=[], close_on=self.lookup({}))
        self.assertEqual(str(refused.exception), 'Belgian capital-gains tax starts in 2026; there is no tax year before it.')

    def test_positions_and_lots_are_read_and_closes_keyed_by_instrument(self):
        make_position(uic=1)
        bought('AAA', date(2025, 5, 1), 10, 90, 'a')
        result = tax_year.report(2026, 0, closed_rows=[], close_on=self.lookup({(1, 'Stock'): 100.0}))
        self.assertEqual(result['unrealised'][0]['unrealised_eur'], Decimal('180.00'))
        self.assertEqual(self.asked, [(1, 'Stock')])

    def test_a_close_is_looked_up_once_per_instrument(self):
        make_position(uic=7)
        bought('AAA', date(2025, 5, 1), 10, 90, 'a')
        rows = [closed('AAA', '2026-03-04', 5.0, opened_on='2025-05-01', TotalBookedOnClosingLegAccountCurrency=50.0)]
        tax_year.report(2026, 0, closed_rows=rows, close_on=self.lookup({(7, 'Stock'): 9.0}))
        self.assertEqual(self.asked, [(7, 'Stock')])

    def test_a_position_bought_in_2026_needs_no_close(self):
        make_position()
        bought('AAA', date(2026, 2, 1), 10, 90, 'a')
        result = tax_year.report(2026, 0, closed_rows=[], close_on=self.lookup({}))
        self.assertEqual(result['unrealised'][0]['basis_source'], 'avg_cost')
        self.assertEqual(self.asked, [])

    def test_no_recorded_purchase_is_unknown_and_named(self):
        make_position()
        result = tax_year.report(2026, 0, closed_rows=[], close_on=self.lookup({}))
        self.assertIsNone(result['unrealised'][0]['unrealised_eur'])
        self.assertIn('AAA: no recorded purchase, so its opening date (before or after 2026) is unknown.', result['warnings'])

    def test_a_missing_close_is_named(self):
        make_position()
        bought('AAA', date(2025, 5, 1), 10, 90, 'a')
        result = tax_year.report(2026, 0, closed_rows=[], close_on=self.lookup({}))
        self.assertIn('AAA: no 31 December 2025 close (no close on or before 31 December 2025).', result['warnings'])

    def test_unsplittable_lots_are_named(self):
        make_position()
        bought('AAA', date(2025, 5, 1), 6, 80, 'a')
        bought('AAA', date(2026, 2, 1), 6, 110, 'b')
        result = tax_year.report(2026, 0, closed_rows=[], close_on=self.lookup({(1, 'Stock'): 100.0}))
        self.assertTrue(any('AAA' in w and 'both sides' in w for w in result['warnings']))

    def test_unreachable_realised_keeps_unrealised_and_the_reason(self):
        make_position()
        bought('AAA', date(2026, 2, 1), 10, 90, 'a')
        result = tax_year.report(2026, 0, closed_rows=None, closed_reason='Saxo is not connected.', close_on=self.lookup({}))
        self.assertIsNone(result['realised'])
        self.assertIsNone(result['summary']['estimated_tax_eur'])
        self.assertEqual(len(result['unrealised']), 1)
        self.assertIn('Saxo is not connected.', result['warnings'])

    def test_standing_notes_are_always_there(self):
        warnings = tax_year.report(2026, 0, closed_rows=[], close_on=self.lookup({}))['warnings']
        for note in (tax_year.COVERAGE_NOTE, tax_year.FX_NOTE, tax_year.ADVISER_NOTE):
            self.assertIn(note, warnings)
