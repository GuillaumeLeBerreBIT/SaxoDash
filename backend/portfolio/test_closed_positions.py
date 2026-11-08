from datetime import date
from types import SimpleNamespace
from unittest.mock import patch

from django.core.cache import cache
from django.test import SimpleTestCase, override_settings

from saxo.client import SaxoPermanentError
from saxo.credentials import SaxoNotConnected

from . import closed_positions

LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}
NEW_LOT = {'InstrumentSymbol': 'ZZZ:xnas', 'AssetType': 'Stock', 'TradeDateOpen': '2026-02-01'}
OLD_LOT = {'InstrumentSymbol': 'OLD:xnas', 'AssetType': 'Stock', 'TradeDateOpen': '2023-05-01'}
TODAY = date(2026, 10, 24)
ALICE = SimpleNamespace(pk=1)
BOB = SimpleNamespace(pk=2)


def connected():
    return patch('portfolio.closed_positions.active_credential', return_value=SimpleNamespace(access_token='t'))


@override_settings(CACHES=LOCMEM)
class ClosedPositionsTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def read(self, rows, trades=(), year=2026, user=ALICE):
        with connected(), \
                patch('saxo.client.get_client_key', return_value='K'), \
                patch('saxo.client.get_closed_positions_report', return_value=rows) as report, \
                patch('saxo.client.get_trades_report', return_value=list(trades)) as traded:
            result = closed_positions.for_year(year, today=TODAY, user=user)
        return result, report, traded

    def test_the_report_covers_the_year_up_to_today(self):
        (rows, reason), report, traded = self.read([NEW_LOT])
        self.assertEqual(report.call_args.args, ('t', 'K', '2026-01-01', '2026-10-24'))
        self.assertEqual((rows, reason), ([NEW_LOT], None))
        traded.assert_not_called()

    def test_a_pre_2026_lot_gets_its_uic_from_the_trades_report(self):
        trades = [{'InstrumentSymbol': 'OLD:xnas', 'AssetType': 'Stock', 'Uic': 7}]
        (rows, _), _, traded = self.read([OLD_LOT, NEW_LOT], trades)
        traded.assert_called_once_with('t', 'K', '2023-05-01', '2026-10-24')
        self.assertEqual([row['Uic'] for row in rows], [7, None])

    def test_a_second_ask_is_answered_from_the_cache(self):
        self.read([NEW_LOT])
        (rows, _), report, _ = self.read([])
        report.assert_not_called()
        self.assertEqual(rows, [NEW_LOT])

    def test_one_users_cached_report_is_not_anothers(self):
        self.read([NEW_LOT], user=ALICE)
        (rows, _), report, _ = self.read([], user=BOB)
        report.assert_called_once()
        self.assertEqual(rows, [])

    def test_not_connected_is_a_reason_and_not_cached(self):
        with patch('portfolio.closed_positions.active_credential', side_effect=SaxoNotConnected('Token expired.')):
            rows, reason = closed_positions.for_year(2026, today=TODAY, user=ALICE)
        self.assertIsNone(rows)
        self.assertEqual(reason, 'Realised gains unavailable, Saxo is not connected: Token expired.')
        (rows, _), _, _ = self.read([NEW_LOT])
        self.assertEqual(rows, [NEW_LOT])

    def test_a_saxo_error_is_a_reason(self):
        with connected(), patch('saxo.client.get_client_key', side_effect=SaxoPermanentError('no key')):
            self.assertEqual(
                closed_positions.for_year(2026, today=TODAY, user=ALICE),
                (None, 'Realised gains unavailable, Saxo did not answer.'),
            )
