from datetime import date
from unittest.mock import patch

from django.test import SimpleTestCase

from saxo import client

from . import daily
from .listings import Listing
from .providers import ProviderError, ProviderNotConnected

LISTING = Listing(ticker='NVDA', symbol='NVDA', name='N', uic=4, asset_type='Stock', currency='USD', exchange=None)
BARS = [
    {'date': '2025-12-30', 'close': 10.0},
    {'date': '2025-12-31', 'close': 11.0},
    {'date': '2026-01-02', 'close': None},
    {'date': '2026-01-05', 'close': 12.0},
]


class DailyTest(SimpleTestCase):
    def test_candles_always_ask_for_the_widest_range(self):
        with patch('research.market.chart', return_value=BARS) as chart:
            self.assertEqual(daily.candles(LISTING), BARS)
        chart.assert_called_once_with(4, 'Stock', daily.HORIZON, client.CHART_MAX_COUNT)

    def test_latest_close_skips_null_closes(self):
        self.assertEqual(daily.latest_close(BARS), 12.0)
        self.assertIsNone(daily.latest_close([]))

    def test_close_on_or_before_a_day(self):
        self.assertEqual(daily.close_on_or_before(BARS, date(2026, 1, 3)), 11.0)
        self.assertEqual(daily.close_on_or_before(BARS, date(2025, 12, 31)), 11.0)
        self.assertIsNone(daily.close_on_or_before(BARS, date(2025, 1, 1)))

    def test_reason_uses_the_tool_wording(self):
        self.assertEqual(daily.reason(ProviderNotConnected('x')), 'Saxo is not connected — reconnect in the app.')
        self.assertEqual(daily.reason(ProviderError('x')), 'Upstream error (502).')

    def test_available_turns_a_provider_failure_into_a_reason(self):
        with patch('research.market.chart', side_effect=ProviderNotConnected('x')):
            self.assertEqual(daily.available(LISTING), (None, daily.NOT_CONNECTED))
        with patch('research.market.chart', return_value=BARS):
            self.assertEqual(daily.available(LISTING), (BARS, None))

    def test_an_unresolved_listing_has_no_bars_and_no_reason(self):
        with patch('research.market.chart', side_effect=AssertionError):
            self.assertEqual(daily.available(Listing.unresolved('NVDA')), (None, None))
