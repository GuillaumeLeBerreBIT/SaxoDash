from datetime import date, timedelta

from django.test import SimpleTestCase

from .price_summary import summarise, zone


class ZoneTest(SimpleTestCase):
    def test_stretched_on_distance_from_ma50(self):
        self.assertEqual(zone(last_close=115, ma20=110, ma50=100, ma200=90, rsi14=60), 'stretched')

    def test_stretched_on_rsi(self):
        self.assertEqual(zone(last_close=105, ma20=103, ma50=100, ma200=90, rsi14=75), 'stretched')

    def test_stretched_on_valuation(self):
        self.assertEqual(
            zone(last_close=105, ma20=103, ma50=100, ma200=90, rsi14=55, pfcf=30, pfcf_median=19),
            'stretched',
        )

    def test_trend(self):
        self.assertEqual(zone(last_close=105, ma20=103, ma50=100, ma200=90, rsi14=55), 'trend')

    def test_pullback(self):
        self.assertEqual(zone(last_close=95, ma20=97, ma50=100, ma200=90, rsi14=45), 'pullback')

    def test_below_200(self):
        self.assertEqual(zone(last_close=85, ma20=88, ma50=95, ma200=90, rsi14=35), 'below_200')

    def test_unclassified(self):
        self.assertEqual(zone(last_close=105, ma20=110, ma50=100, ma200=90, rsi14=45), 'unclassified')

    def test_missing_input_is_none(self):
        self.assertIsNone(zone(last_close=95, ma20=97, ma50=100, ma200=None, rsi14=45))
        self.assertIsNone(zone(last_close=None, ma20=97, ma50=100, ma200=90, rsi14=45))


def candles(count, start=100.0, step=1.0):
    first = date(2020, 1, 1)
    return [
        {
            'date': (first + timedelta(days=i)).isoformat(),
            'open': start + i * step, 'high': start + i * step + 1, 'low': start + i * step - 1,
            'close': start + i * step, 'volume': 1.0,
        }
        for i in range(count)
    ]


class SummariseTest(SimpleTestCase):
    def test_a_long_rise_is_a_trend_with_its_figures(self):
        bars = candles(300)
        result = summarise(bars)
        summary = result['summary']
        self.assertEqual(summary['last_close'], 399.0)
        self.assertEqual(summary['ma200'], sum(b['close'] for b in bars[-200:]) / 200)
        self.assertEqual(summary['high_52w'], 400.0)
        self.assertEqual(summary['change_1m_pct'], round((399 / 378 - 1) * 100, 2))
        self.assertEqual(result['zone'], 'stretched')

    def test_too_few_bars_leave_figures_and_zone_empty(self):
        result = summarise(candles(10))
        self.assertIsNone(result['summary']['ma200'])
        self.assertIsNone(result['summary']['change_1y_pct'])
        self.assertIsNone(result['zone'])

    def test_no_bars_is_all_none(self):
        result = summarise([])
        self.assertIsNone(result['summary']['last_close'])
        self.assertIsNone(result['zone'])
