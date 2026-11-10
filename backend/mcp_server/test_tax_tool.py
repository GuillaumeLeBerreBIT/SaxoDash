from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase
from django.utils import timezone

from portfolio.models import Position
from portfolio.tax_year import ADVISER_NOTE
from saxo.credentials import SaxoNotConnected
from transactions.models import Transaction

from .tools import tax as tools
from users.testing import the_owner

LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}

CLOSED = [{
    'InstrumentSymbol': 'ZZZ:xnas', 'AssetType': 'Stock', 'TradeDateOpen': '2026-02-01',
    'TradeDateClose': '2026-03-04', 'AmountClose': -5.0, 'ClosePrice': 10.0, 'PnLAccountCurrency': 12000.0,
}]
OLD_LOT = {
    'InstrumentSymbol': 'OLD:xnas', 'AssetType': 'Stock', 'TradeDateOpen': '2023-05-01',
    'TradeDateClose': '2026-03-04', 'AmountClose': -5.0, 'ClosePrice': 180.0,
    'TotalBookedOnClosingLegAccountCurrency': 810.0, 'PnLAccountCurrency': 720.0,
}
TRADES = [{'InstrumentSymbol': 'OLD:xnas', 'AssetType': 'Stock', 'Uic': 7}]
CANDLES = [
    {'date': '2025-12-30', 'close': 99.0},
    {'date': '2025-12-31', 'close': 100.0},
    {'date': '2026-01-02', 'close': 110.0},
]


def make_position(ticker='AAA', uic=1):
    return Position.objects.create(
        user=the_owner(),
        ticker=ticker, name=ticker, qty=Decimal('10'), avg_cost=Decimal('90'),
        current_price=Decimal('120'), sector='Tech', type='STOCK', color='#000000',
        uic=uic, asset_type='Stock', currency='USD', fx_rate=Decimal('0.9'),
    )


def run(closed=CLOSED, candles=CANDLES, credential=True, trades=TRADES, **kwargs):
    state = patch('portfolio.closed_positions.active_credential', return_value=SimpleNamespace(access_token='t')) if credential \
        else patch('portfolio.closed_positions.active_credential', side_effect=SaxoNotConnected('Saxo is not connected.'))
    with state, \
            patch('saxo.client.get_client_key', return_value='K'), \
            patch('saxo.client.get_closed_positions_report', return_value=closed) as report, \
            patch('saxo.client.get_trades_report', return_value=trades) as traded, \
            patch('research.market.chart', return_value=candles):
        result = tools.get_tax_year(**kwargs)
    run.report, run.traded = report, traded
    return result


@override_settings(CACHES=LOCMEM)
class TaxToolTests(APITestCase):
    def setUp(self):
        cache.clear()
        the_owner()

    def test_adviser_note_and_fx_note_always_present(self):
        warnings = run(year=2026)['warnings']
        self.assertIn(ADVISER_NOTE, warnings)
        self.assertIn("FX: today's rate is used for both ends of an unrealised gain.", warnings)

    def test_source_note_always_present(self):
        warnings = run(year=2026)['warnings']
        self.assertIn("Realised gains come from Saxo's closed-positions report, in account currency with costs included.", warnings)

    def test_never_suggests_sell_and_rebuy(self):
        make_position()
        self.assertNotIn('sell and rebuy', str(run(year=2026)).lower())

    def test_pre_2026_position_uses_dec_31_close(self):
        make_position()
        Transaction.objects.create(user=the_owner(), date=date(2025, 5, 1), type='BUY', instrument='AAA', ticker='AAA', qty=10, price=90)
        row = run(year=2026)['data']['unrealised'][0]
        self.assertEqual(row['basis_source'], 'dec_31_2025')
        self.assertEqual(row['basis'], 100.0)
        self.assertEqual(row['unrealised_eur'], 180.0)

    def test_position_without_transactions_is_unknown_and_says_so(self):
        make_position()
        result = run(year=2026)
        self.assertIsNone(result['data']['unrealised'][0]['unrealised_eur'])
        self.assertTrue(any('AAA' in w and 'no recorded purchase' in w for w in result['warnings']))

    def test_a_year_before_2026_is_refused_without_asking_saxo(self):
        with patch('portfolio.closed_positions.for_year', side_effect=AssertionError('asked Saxo')):
            result = tools.get_tax_year(year=2025)
        self.assertIsNone(result['data'])
        self.assertIn('Belgian capital-gains tax starts in 2026; there is no tax year before it.', result['warnings'])

    def test_money_is_a_json_number(self):
        data = run(year=2026, carry_over_eur=8000)['data']
        self.assertIsInstance(data['summary']['exemption_eur'], float)

    def test_missing_dec_31_close_is_null_and_warned(self):
        make_position()
        Transaction.objects.create(user=the_owner(), date=date(2025, 5, 1), type='BUY', instrument='AAA', ticker='AAA', qty=10, price=90)
        result = run(year=2026, candles=[{'date': '2026-01-02', 'close': 110.0}])
        self.assertIsNone(result['data']['unrealised'][0]['unrealised_eur'])
        self.assertTrue(any('AAA' in w for w in result['warnings']))

    def test_summary_uses_saxo_realised_and_carry_over(self):
        data = run(year=2026, carry_over_eur=8000)['data']
        self.assertEqual(data['summary']['realised_net_eur'], 12000.0)
        self.assertEqual(data['summary']['exemption_eur'], 15000.0)
        self.assertEqual(data['summary']['estimated_tax_eur'], 0.0)
        self.assertEqual(data['realised'][0]['ticker'], 'ZZZ')

    def test_disconnected_saxo_gives_null_realised_but_unrealised(self):
        make_position()
        result = run(year=2026, credential=False)
        self.assertIsNone(result['data']['realised'])
        self.assertIsNone(result['data']['summary']['realised_net_eur'])
        self.assertIsNone(result['data']['summary']['estimated_tax_eur'])
        self.assertEqual(len(result['data']['unrealised']), 1)
        self.assertTrue(any('not connected' in w for w in result['warnings']))

    def test_pre_2026_closed_lot_is_rebased_on_its_dec_31_close(self):
        data = run(year=2026, closed=[OLD_LOT])['data']
        self.assertEqual(data['realised'][0]['realised_eur'], 360.0)
        self.assertEqual(data['realised'][0]['basis_source'], 'dec_31_2025')
        run.traded.assert_called_once_with('t', 'K', '2023-05-01', timezone.localdate().isoformat())

    def test_a_future_year_is_refused_without_asking_saxo(self):
        with patch('portfolio.closed_positions.for_year', side_effect=AssertionError('asked Saxo')):
            result = tools.get_tax_year(year=timezone.localdate().year + 1)
        self.assertIsNone(result['data'])
        self.assertIn('has not started yet', result['warnings'][-1])

    def test_the_report_covers_the_tax_year(self):
        run(year=2026)
        self.assertEqual(run.report.call_args.args, ('t', 'K', '2026-01-01', min(date(2026, 12, 31), timezone.localdate()).isoformat()))
        run.traded.assert_not_called()

    def test_missing_close_date_warning_names_the_close_date(self):
        closed = [{k: v for k, v in CLOSED[0].items() if k != 'TradeDateClose'}]
        result = run(year=2026, closed=closed)
        self.assertIsNone(result['data']['realised'])
        self.assertTrue(any('close date' in w for w in result['warnings']))
        self.assertFalse(any('account-currency P/L' in w for w in result['warnings']))

    def test_mixed_lots_are_split_at_dec_31(self):
        make_position()
        Transaction.objects.create(user=the_owner(), date=date(2025, 5, 1), type='BUY', instrument='AAA', ticker='AAA', qty=6, price=80, saxo_trade_id='a')
        Transaction.objects.create(user=the_owner(), date=date(2026, 2, 1), type='BUY', instrument='AAA', ticker='AAA', qty=4, price=110, saxo_trade_id='b')
        row = run(year=2026)['data']['unrealised'][0]
        self.assertEqual(row['basis_source'], 'dec_31_2025_and_cost')
        self.assertEqual(row['unrealised_eur'], 144.0)

    def test_unsplittable_lots_are_unknown_and_warned(self):
        make_position()
        Transaction.objects.create(user=the_owner(), date=date(2025, 5, 1), type='BUY', instrument='AAA', ticker='AAA', qty=6, price=80, saxo_trade_id='a')
        Transaction.objects.create(user=the_owner(), date=date(2026, 2, 1), type='BUY', instrument='AAA', ticker='AAA', qty=6, price=110, saxo_trade_id='b')
        result = run(year=2026)
        self.assertIsNone(result['data']['unrealised'][0]['unrealised_eur'])
        self.assertTrue(any('AAA' in w and 'both sides' in w for w in result['warnings']))
