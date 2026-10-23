from django.test import SimpleTestCase

from .zones import zone


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
