import tempfile
from pathlib import Path

from django.test import TestCase

from research.models import ScreenerRow
from research.universe import UNIVERSE_CSV, load_universe

HEADER = 'ticker,name,sector,indexes\n'


def csv_file(body):
    handle = tempfile.NamedTemporaryFile('w', suffix='.csv', delete=False)
    handle.write(HEADER + body)
    handle.close()
    return Path(handle.name)


class LoadUniverseTest(TestCase):
    def test_creates_one_row_per_ticker(self):
        result = load_universe(csv_file('AAPL,Apple Inc.,Information Technology,SP500|NDX\nKO,Coca-Cola,Consumer Staples,SP500\n'))
        self.assertEqual(result, {'created': 2, 'updated': 0, 'removed': 0})
        apple = ScreenerRow.objects.get(ticker='AAPL')
        self.assertEqual(apple.indexes, 'SP500|NDX')
        self.assertIsNone(apple.uic)
        self.assertEqual(apple.status, ScreenerRow.UNMATCHED)

    def test_reload_updates_names_without_touching_resolution(self):
        load_universe(csv_file('AAPL,Apple,Information Technology,SP500\n'))
        ScreenerRow.objects.filter(ticker='AAPL').update(uic=211, status=ScreenerRow.OK, rsi14=55.0)
        result = load_universe(csv_file('AAPL,Apple Inc.,Information Technology,SP500|NDX\n'))
        apple = ScreenerRow.objects.get(ticker='AAPL')
        self.assertEqual(result['updated'], 1)
        self.assertEqual((apple.name, apple.indexes, apple.uic, apple.rsi14), ('Apple Inc.', 'SP500|NDX', 211, 55.0))

    def test_ticker_removed_from_csv_is_deleted(self):
        load_universe(csv_file('AAPL,Apple,IT,SP500\nKO,Coca-Cola,Staples,SP500\n'))
        result = load_universe(csv_file('AAPL,Apple,IT,SP500\n'))
        self.assertEqual(result['removed'], 1)
        self.assertFalse(ScreenerRow.objects.filter(ticker='KO').exists())

    def test_tickers_are_stripped_and_uppercased(self):
        load_universe(csv_file(' brk.b ,Berkshire Hathaway,Financials,SP500\n'))
        self.assertTrue(ScreenerRow.objects.filter(ticker='BRK.B').exists())

    def test_checked_in_universe_is_large_and_unique(self):
        load_universe(UNIVERSE_CSV)
        self.assertGreater(ScreenerRow.objects.count(), 480)
        self.assertTrue(ScreenerRow.objects.filter(indexes__contains='NDX').exists())
        self.assertTrue(ScreenerRow.objects.filter(ticker='AAPL', indexes='SP500|NDX').exists())
