import json
from pathlib import Path

from django.conf import settings
from django.test import SimpleTestCase

from research import technicals

FIXTURE = Path(settings.BASE_DIR).parent / 'frontend' / 'src' / 'lib' / 'fixtures' / 'indicator-parity.json'


def bars_from(closes, volume=1_000_000):
    return [
        {'date': f'd{i}', 'open': c, 'high': c + 1, 'low': c - 1, 'close': c, 'volume': volume}
        for i, c in enumerate(closes)
    ]


class ParityTest(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.fixture = json.loads(FIXTURE.read_text())
        cls.closes = [bar['close'] for bar in cls.fixture['bars']]

    def assertSeriesEqual(self, actual, expected):
        self.assertEqual(len(actual), len(expected))
        for a, e in zip(actual, expected):
            if e is None:
                self.assertIsNone(a)
            else:
                self.assertAlmostEqual(a, e, places=9)

    def test_sma_matches_indicators_js(self):
        self.assertSeriesEqual(technicals.sma(self.closes, 50), self.fixture['expected']['sma50'])
        self.assertSeriesEqual(technicals.sma(self.closes, 200), self.fixture['expected']['sma200'])

    def test_rsi_matches_indicators_js(self):
        self.assertSeriesEqual(technicals.rsi(self.closes, 14), self.fixture['expected']['rsi14'])

    def test_relative_volume_matches_indicators_js(self):
        self.assertSeriesEqual(technicals.relative_volume(self.fixture['bars'], 20), self.fixture['expected']['rvol'])


class TechnicalFieldsTest(SimpleTestCase):
    def test_changes_are_percent_over_trading_sessions(self):
        fields = technicals.technical_fields(bars_from([100.0] * 252 + [110.0]))
        self.assertAlmostEqual(fields['change_1d'], 10.0)
        self.assertAlmostEqual(fields['change_1y'], 10.0)
        self.assertEqual(fields['last_close'], 110.0)

    def test_pct_vs_ma200_is_negative_below_the_average(self):
        fields = technicals.technical_fields(bars_from([100.0] * 199 + [90.0]))
        self.assertAlmostEqual(fields['ma200'], (100.0 * 199 + 90.0) / 200)
        self.assertLess(fields['pct_vs_ma200'], 0)

    def test_pct_from_52w_high_uses_the_highest_high(self):
        closes = [100.0] * 260
        closes[-10] = 150.0
        fields = technicals.technical_fields(bars_from(closes))
        self.assertAlmostEqual(fields['pct_from_52w_high'], (100.0 / 151.0 - 1) * 100)

    def test_short_history_leaves_long_lookbacks_null(self):
        fields = technicals.technical_fields(bars_from([100.0 + i for i in range(120)]))
        self.assertIsNone(fields['ma200'])
        self.assertIsNone(fields['pct_vs_ma200'])
        self.assertIsNone(fields['change_1y'])
        self.assertIsNone(fields['pct_from_52w_high'])
        self.assertIsNotNone(fields['ma50'])
        self.assertIsNotNone(fields['change_3m'])

    def test_sparkline_is_the_last_63_closes(self):
        fields = technicals.technical_fields(bars_from([float(i) for i in range(100)]))
        self.assertEqual(fields['sparkline'], [float(i) for i in range(37, 100)])

    def test_no_bars_gives_every_field_null(self):
        fields = technicals.technical_fields([])
        self.assertEqual(fields['sparkline'], [])
        self.assertTrue(all(value is None for key, value in fields.items() if key != 'sparkline'))
