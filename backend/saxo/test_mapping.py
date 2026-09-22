from datetime import date as date_cls
from decimal import Decimal
from django.test import TestCase
from . import mapping

SAMPLE_POSITION = {
    'PositionId': '5027270864',
    'PositionBase': {
        'Amount': 15,
        'OpenPrice': 412.30,
        'AssetType': 'Stock',
        'ExecutionTimeOpen': '2026-08-26T18:30:31.645781Z',
    },
    'PositionView': {
        'CurrentPrice': 875.40,
    },
    'DisplayAndFormat': {
        'Symbol': 'NVDA:xnas',
        'Description': 'NVIDIA Corporation',
        'Currency': 'EUR',
    },
}

# What the SIM account actually returns, captured live 2026-09-17.
SAMPLE_CLOSED_POSITION = {
    'ClosedPositionUniqueId': '5027270864-5027484376',
    'ClosedPosition': {
        'Amount': 10.0,
        'AssetType': 'Stock',
        'BuyOrSell': 'Buy',
        'ClosingPrice': 678.43,
        'ExecutionTimeClose': '2026-09-16T19:06:38.216089Z',
        'ExecutionTimeOpen': '2026-08-26T18:30:31.645781Z',
    },
    'DisplayAndFormat': {
        'Currency': 'USD',
        'Description': 'Meta Platforms Inc.',
        'Symbol': 'META:xnas',
    },
}

# What the SIM account actually returns, captured live 2026-09-03: no
# market-data entitlement, so no price at all - but Saxo still marks the book
# server-side, so ProfitLossOnTrade is real and recovers the price.
UNENTITLED_POSITION = {
    'PositionId': '5027270852',
    'PositionBase': {
        'Amount': 20.0,
        'OpenPrice': 494.36,
        'AssetType': 'Stock',
        'Uic': 261,
        'ExecutionTimeOpen': '2026-08-26T18:30:31.645781Z',
    },
    'PositionView': {
        'CurrentPrice': 0.0,
        'CurrentPriceType': 'None',
        'MarketValue': 0.0,
        'ProfitLossOnTrade': 314.60,
        'ConversionRateCurrent': 0.8600895,
    },
    'DisplayAndFormat': {
        'Symbol': 'MSFT:xnas',
        'Description': 'Microsoft Corp.',
        'Currency': 'USD',
    },
}


class ToPositionFieldsTest(TestCase):
    def test_maps_core_fields(self):
        fields = mapping.to_position_fields(SAMPLE_POSITION)
        self.assertEqual(fields['ticker'], 'NVDA')
        self.assertEqual(fields['name'], 'NVIDIA Corporation')
        self.assertEqual(fields['qty'], 15)
        self.assertEqual(fields['avg_cost'], Decimal('412.30'))
        self.assertEqual(fields['current_price'], Decimal('875.40'))
        self.assertEqual(fields['type'], 'STOCK')

    def test_sector_and_color_are_always_present(self):
        fields = mapping.to_position_fields(SAMPLE_POSITION)
        self.assertEqual(fields['sector'], 'Uncategorized')
        self.assertTrue(fields['color'].startswith('#'))
        self.assertEqual(len(fields['color']), 7)

    def test_color_is_deterministic_per_ticker(self):
        a = mapping.to_position_fields(SAMPLE_POSITION)
        b = mapping.to_position_fields(SAMPLE_POSITION)
        self.assertEqual(a['color'], b['color'])

    def test_carries_saxos_own_identity_for_the_instrument(self):
        # `type` is the app's own STOCK/ETF label; the Research page needs the
        # Uic and the AssetType spelled the way Saxo spells them.
        withuic = {
            **SAMPLE_POSITION,
            'PositionBase': {**SAMPLE_POSITION['PositionBase'], 'Uic': 211},
        }
        fields = mapping.to_position_fields(withuic)

        self.assertEqual(fields['uic'], 211)
        self.assertEqual(fields['asset_type'], 'Stock')

    def test_uic_is_none_when_saxo_omits_it(self):
        self.assertIsNone(mapping.to_position_fields(SAMPLE_POSITION)['uic'])


class UnentitledPositionPricingTest(TestCase):
    """The account has no market-data entitlement, which is the normal case here.

    Falling back to OpenPrice made value == cost and P/L == 0 for every row,
    every day - a wrong answer that looks like a plausible right one.
    """

    def test_does_not_report_the_open_price_as_the_market_price(self):
        fields = mapping.to_position_fields(UNENTITLED_POSITION)
        self.assertNotEqual(fields['current_price'], Decimal('494.36'))

    def test_derives_the_mark_from_profit_loss_on_trade(self):
        # 494.36 + 314.60/20, and the chart close that day was 510.12.
        fields = mapping.to_position_fields(UNENTITLED_POSITION)
        self.assertEqual(fields['current_price'], Decimal('510.09'))
        self.assertEqual(fields['price_source'], 'derived')

    def test_keeps_a_live_price_when_saxo_gives_one(self):
        fields = mapping.to_position_fields(SAMPLE_POSITION)
        self.assertEqual(fields['current_price'], Decimal('875.40'))
        self.assertEqual(fields['price_source'], 'live')

    def test_falls_back_to_cost_only_when_nothing_else_answers(self):
        blind = {
            **UNENTITLED_POSITION,
            'PositionView': {'CurrentPrice': 0.0, 'CurrentPriceType': 'None'},
        }
        fields = mapping.to_position_fields(blind)
        self.assertEqual(fields['current_price'], Decimal('494.36'))
        self.assertEqual(fields['price_source'], 'cost')

    def test_falls_back_to_cost_when_saxo_reports_the_position_as_a_total_loss(self):
        # Saxo SIM (no market-data entitlement) reports ProfitLossOnTrade as
        # exactly -(OpenPrice * Amount) - "this position is unpriced", not "it
        # really lost 100% of its value" - so the derived-price formula lands
        # on exactly 0.00. Verified live against a real SIM account 2026-09-20.
        # A price of 0 is never a legitimate mark for a long position; it must
        # fall through to 'cost' instead of being reported as 'derived'.
        totally_unpriced = {
            **UNENTITLED_POSITION,
            'PositionView': {
                **UNENTITLED_POSITION['PositionView'], 'ProfitLossOnTrade': -9887.20,
            },
        }
        fields = mapping.to_position_fields(totally_unpriced)
        self.assertEqual(fields['current_price'], Decimal('494.36'))
        self.assertEqual(fields['price_source'], 'cost')

    def test_falls_back_to_cost_when_the_derived_price_would_be_negative(self):
        # A derived price can also come out negative for a large enough loss
        # against a small open price - equally not a legitimate mark.
        negative_derived = {
            **UNENTITLED_POSITION,
            'PositionView': {
                **UNENTITLED_POSITION['PositionView'], 'ProfitLossOnTrade': -20000.0,
            },
        }
        fields = mapping.to_position_fields(negative_derived)
        self.assertEqual(fields['current_price'], Decimal('494.36'))
        self.assertEqual(fields['price_source'], 'cost')

    def test_records_the_instrument_currency_and_its_rate(self):
        fields = mapping.to_position_fields(UNENTITLED_POSITION)
        self.assertEqual(fields['currency'], 'USD')
        self.assertEqual(fields['fx_rate'], Decimal('0.8600895'))

    def test_derived_mark_is_correct_for_a_short(self):
        # Amount and ProfitLossOnTrade are both signed, so one formula covers both.
        short = {
            **UNENTITLED_POSITION,
            'PositionBase': {**UNENTITLED_POSITION['PositionBase'], 'Amount': -20.0},
            'PositionView': {
                **UNENTITLED_POSITION['PositionView'], 'ProfitLossOnTrade': -314.60,
            },
        }
        self.assertEqual(mapping.to_position_fields(short)['current_price'],
                         Decimal('510.09'))

    def test_fractional_quantities_survive(self):
        fractional = {
            **UNENTITLED_POSITION,
            'PositionBase': {**UNENTITLED_POSITION['PositionBase'], 'Amount': 2.5},
        }
        self.assertEqual(mapping.to_position_fields(fractional)['qty'], Decimal('2.5'))


class ToTransactionFieldsTest(TestCase):
    def test_maps_open_position_to_buy_row(self):
        fields = mapping.to_transaction_fields(SAMPLE_POSITION)
        self.assertEqual(fields['saxo_trade_id'], '5027270864')
        self.assertEqual(fields['date'], date_cls(2026, 8, 26))
        self.assertEqual(fields['type'], 'BUY')
        self.assertEqual(fields['instrument'], 'NVIDIA Corporation')
        self.assertEqual(fields['ticker'], 'NVDA')
        self.assertEqual(fields['qty'], Decimal('15'))
        self.assertEqual(fields['price'], Decimal('412.30'))
        self.assertEqual(fields['account'], 'Saxo')

    def test_negative_amount_maps_to_sell(self):
        short = {**SAMPLE_POSITION, 'PositionBase': {**SAMPLE_POSITION['PositionBase'], 'Amount': -4}}
        fields = mapping.to_transaction_fields(short)
        self.assertEqual(fields['type'], 'SELL')
        self.assertEqual(fields['qty'], Decimal('4'))


class ToClosedTransactionFieldsTest(TestCase):
    def test_maps_closed_long_to_sell_row(self):
        fields = mapping.to_closed_transaction_fields(SAMPLE_CLOSED_POSITION)
        self.assertEqual(fields['saxo_trade_id'], '5027270864-5027484376')
        self.assertEqual(fields['date'], date_cls(2026, 9, 16))
        self.assertEqual(fields['type'], 'SELL')
        self.assertEqual(fields['instrument'], 'Meta Platforms Inc.')
        self.assertEqual(fields['ticker'], 'META')
        self.assertEqual(fields['qty'], Decimal('10'))
        self.assertEqual(fields['price'], Decimal('678.43'))
        self.assertEqual(fields['account'], 'Saxo')

    def test_closed_short_maps_to_buy_row(self):
        # BuyOrSell records the *opening* side - covering a short is a buy.
        covered_short = {
            **SAMPLE_CLOSED_POSITION,
            'ClosedPosition': {**SAMPLE_CLOSED_POSITION['ClosedPosition'], 'BuyOrSell': 'Sell'},
        }
        fields = mapping.to_closed_transaction_fields(covered_short)
        self.assertEqual(fields['type'], 'BUY')
