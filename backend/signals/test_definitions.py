import json
from pathlib import Path

from django.test import SimpleTestCase

from signals import definitions
from signals.series import from_bars

REFERENCE = Path(__file__).parent / 'testdata' / 'reference_flags.json'


def flat(count, price=100.0, volume=1000):
    return [[f'd{i:04d}', price, price, price, price, volume] for i in range(count)]


def candle(bars, i, open_, high, low, close, volume=1000):
    bars[i] = [bars[i][0], open_, high, low, close, volume]


def closes_to_bars(closes, volume=1000):
    return [[f'd{i:04d}', close, close, close, close, volume] for i, close in enumerate(closes)]


def detect(bars):
    return definitions.detect(from_bars(bars))


def falling_three(bars, start):
    candle(bars, start, 100, 100, 99, 99)
    candle(bars, start + 1, 99, 99, 98, 98)
    candle(bars, start + 2, 98, 98, 97, 97)


class CatalogueTest(SimpleTestCase):
    def test_keys_and_codes_are_unique(self):
        keys = [signal.key for signal in definitions.SIGNALS]
        codes = [signal.code for signal in definitions.SIGNALS]
        self.assertEqual(len(keys), 17)
        self.assertEqual(len(set(keys)), 17)
        self.assertEqual(len(set(codes)), 17)

    def test_every_non_rank_signal_has_a_detector(self):
        expected = {signal.key for signal in definitions.SIGNALS if signal.kind != definitions.RANK}
        self.assertEqual(set(detect(flat(5))), expected)

    def test_no_description_tells_the_reader_to_trade(self):
        for signal in definitions.SIGNALS:
            words = f'{signal.label} {signal.description}'.lower().split()
            self.assertNotIn('buy', words)
            self.assertNotIn('sell', words)


class EdgeCaseTest(SimpleTestCase):
    def test_an_empty_series_gives_empty_flags(self):
        self.assertTrue(all(flags == [] for flags in detect([]).values()))

    def test_a_short_flat_series_is_all_false(self):
        for key, flags in detect(flat(100)).items():
            self.assertFalse(any(flags), key)

    def test_zero_volume_never_raises(self):
        bars = flat(40, volume=0)
        candle(bars, 30, 105, 106, 104, 105.5, 0)
        flags = detect(bars)
        self.assertFalse(flags['news_gap_up'][30])


class VolumeSignalTest(SimpleTestCase):
    def test_gap_up_on_double_volume_that_holds(self):
        bars = flat(30)
        candle(bars, 25, 105, 106, 104.5, 105.5, 3000)
        flags = detect(bars)
        self.assertTrue(flags['news_gap_up'][25])
        self.assertFalse(flags['news_gap_up'][24])
        self.assertFalse(flags['news_gap_down'][25])

    def test_gap_up_needs_the_volume(self):
        bars = flat(30)
        candle(bars, 25, 105, 106, 104.5, 105.5, 1500)
        self.assertFalse(detect(bars)['news_gap_up'][25])

    def test_gap_up_that_fades_does_not_count(self):
        bars = flat(30)
        candle(bars, 25, 105, 106, 101, 102, 3000)
        self.assertFalse(detect(bars)['news_gap_up'][25])

    def test_gap_down_on_double_volume(self):
        bars = flat(30)
        candle(bars, 25, 95, 95.5, 93, 94, 3000)
        self.assertTrue(detect(bars)['news_gap_down'][25])

    def test_volume_thrust_is_a_strong_close_without_needing_a_gap(self):
        bars = flat(30)
        candle(bars, 25, 100, 103.5, 100, 103, 3000)
        flags = detect(bars)
        self.assertTrue(flags['volume_thrust'][25])
        self.assertFalse(flags['news_gap_up'][25])

    def test_volume_is_compared_with_the_twenty_sessions_before(self):
        bars = flat(30)
        candle(bars, 10, 100, 103.5, 100, 103, 3000)
        self.assertFalse(detect(bars)['volume_thrust'][10])


class TrendSignalTest(SimpleTestCase):
    def test_new_high_is_a_close_above_the_prior_years_highs(self):
        bars = flat(260)
        candle(bars, 259, 100, 102, 100, 102)
        flags = detect(bars)
        self.assertTrue(flags['new_high'][259])
        self.assertFalse(flags['new_high'][258])

    def test_new_high_needs_a_full_year_before_it(self):
        bars = flat(252)
        candle(bars, 251, 100, 102, 100, 102)
        self.assertFalse(detect(bars)['new_high'][251])

    def test_deep_pullback_is_more_than_a_fifth_below_the_years_high(self):
        bars = flat(260)
        candle(bars, 259, 80, 80, 79, 79)
        self.assertTrue(detect(bars)['deep_pullback'][259])
        candle(bars, 259, 82, 82, 81, 81)
        self.assertFalse(detect(bars)['deep_pullback'][259])

    def test_above_the_200_day_average(self):
        bars = flat(205)
        candle(bars, 204, 100, 101, 100, 101)
        flags = detect(bars)
        self.assertTrue(flags['above_ma200'][204])
        self.assertFalse(any(flags['above_ma200'][:204]))

    def test_golden_cross_is_marked_for_five_sessions_and_no_death_cross_with_it(self):
        closes = [200 - i * 0.2 for i in range(230)]
        closes += [closes[-1] + 1.5 * step for step in range(1, 71)]
        flags = detect(closes_to_bars(closes))
        marked = [i for i, flag in enumerate(flags['golden_cross']) if flag]
        self.assertEqual(len(marked), 5)
        self.assertEqual(marked, list(range(marked[0], marked[0] + 5)))
        self.assertFalse(any(flags['death_cross'][marked[0]:]))

    def test_death_cross_is_the_reverse(self):
        closes = [100 + i * 0.2 for i in range(230)]
        closes += [closes[-1] - 1.5 * step for step in range(1, 71)]
        flags = detect(closes_to_bars(closes))
        self.assertEqual(sum(flags['death_cross']), 5)
        self.assertFalse(any(flags['golden_cross'][205:]))


class OscillatorSignalTest(SimpleTestCase):
    def test_rsi_oversold_after_fourteen_falling_sessions(self):
        flags = detect(closes_to_bars([100 - i for i in range(20)]))
        self.assertTrue(flags['rsi_oversold'][14])
        self.assertFalse(flags['rsi_oversold'][13])
        self.assertFalse(any(flags['rsi_overbought']))

    def test_rsi_overbought_after_fourteen_rising_sessions(self):
        flags = detect(closes_to_bars([100 + i for i in range(20)]))
        self.assertTrue(flags['rsi_overbought'][19])
        self.assertFalse(any(flags['rsi_oversold']))

    def test_pullback_in_an_uptrend(self):
        closes = [100 + i * 0.1 for i in range(210)]
        closes += [closes[-1] - 0.05, closes[-1] - 0.1]
        flags = detect(closes_to_bars(closes))
        self.assertTrue(flags['pullback_in_uptrend'][211])
        self.assertFalse(flags['pullback_in_uptrend'][209])

    def test_two_down_days_below_the_average_are_not_a_pullback_in_an_uptrend(self):
        closes = [200 - i * 0.1 for i in range(212)]
        self.assertFalse(any(detect(closes_to_bars(closes))['pullback_in_uptrend']))

    def test_macd_crosses_up_once_after_the_turn(self):
        closes = [100 - i * 0.5 for i in range(60)]
        closes += [closes[-1] + step for step in range(1, 41)]
        marked = [i for i, flag in enumerate(detect(closes_to_bars(closes))['macd_cross_up']) if flag]
        self.assertEqual(len(marked), 1)
        self.assertGreaterEqual(marked[0], 60)


class CandleSignalTest(SimpleTestCase):
    def test_bullish_engulfing_after_three_falling_closes(self):
        bars = flat(12)
        falling_three(bars, 6)
        candle(bars, 9, 96.5, 98.6, 96.4, 98.5)
        flags = detect(bars)
        self.assertTrue(flags['bullish_engulfing'][9])
        self.assertFalse(flags['bearish_engulfing'][9])

    def test_an_up_candle_that_does_not_cover_the_last_body_is_not_engulfing(self):
        bars = flat(12)
        falling_three(bars, 6)
        candle(bars, 9, 96.5, 97.6, 96.4, 97.5)
        self.assertFalse(detect(bars)['bullish_engulfing'][9])

    def test_bearish_engulfing_after_three_rising_closes(self):
        bars = flat(12)
        candle(bars, 6, 100, 101, 100, 101)
        candle(bars, 7, 101, 102, 101, 102)
        candle(bars, 8, 102, 103, 102, 103)
        candle(bars, 9, 103.5, 103.6, 101.4, 101.5)
        self.assertTrue(detect(bars)['bearish_engulfing'][9])

    def test_hammer_after_three_falling_closes(self):
        bars = flat(12)
        falling_three(bars, 6)
        candle(bars, 9, 96.6, 96.85, 95.0, 96.8)
        self.assertTrue(detect(bars)['hammer'][9])

    def test_a_long_upper_wick_is_not_a_hammer(self):
        bars = flat(12)
        falling_three(bars, 6)
        candle(bars, 9, 96.6, 98.5, 95.0, 96.8)
        self.assertFalse(detect(bars)['hammer'][9])

    def test_squeeze_breakout_from_tight_bands(self):
        closes = [100 + 0.2 * (i % 2) for i in range(30)] + [101]
        flags = detect(closes_to_bars(closes))
        self.assertTrue(flags['squeeze_breakout'][30])
        self.assertFalse(flags['squeeze_breakout'][29])

    def test_a_breakout_from_wide_bands_is_not_a_squeeze(self):
        closes = [100 + 6 * (i % 2) for i in range(30)] + [120]
        self.assertFalse(detect(closes_to_bars(closes))['squeeze_breakout'][30])


class MomentumTest(SimpleTestCase):
    def test_momentum_is_the_year_to_a_month_ago(self):
        closes = [100.0] * 253
        closes[252 - 21] = 130.0
        values = definitions.momentum(from_bars(closes_to_bars(closes)))
        self.assertIsNone(values[251])
        self.assertAlmostEqual(values[252], 0.3)


class ReferenceParityTest(SimpleTestCase):
    def test_detectors_match_the_first_test_run(self):
        for ticker, case in json.loads(REFERENCE.read_text()).items():
            series = from_bars(case['bars'])
            flags = definitions.detect(series)
            for key, values in flags.items():
                marked = [i for i, flag in enumerate(values) if flag and i >= case['from']]
                self.assertEqual(marked, case['expected'].get(key, []), f'{ticker} {key}')
            measured = definitions.momentum(series)
            for index, value in case['expected']['momentum'].items():
                self.assertAlmostEqual(measured[int(index)], value, places=12)
