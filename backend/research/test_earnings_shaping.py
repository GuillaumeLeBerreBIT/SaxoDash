from django.test import TestCase

from . import earnings

RAW_EARNINGS_ROW = {
    'symbol': 'AAPL', 'date': '2026-10-28', 'hour': 'amc',
    'quarter': 4, 'year': 2026,
    'epsEstimate': 2.0, 'epsActual': 2.2,
    'revenueEstimate': 115_000_000_000, 'revenueActual': 119_600_000_000,
}


class EarningsShapingTest(TestCase):
    def test_renames_finnhub_fields_to_snake_case(self):
        event = earnings._shape(RAW_EARNINGS_ROW)
        self.assertEqual(event, {
            'symbol': 'AAPL', 'date': '2026-10-28', 'session': 'amc',
            'quarter': 4, 'year': 2026,
            'eps_estimate': 2.0, 'eps_actual': 2.2,
            'revenue_estimate': 115_000_000_000, 'revenue_actual': 119_600_000_000,
            'eps_surprise_pct': 10.0, 'revenue_surprise_pct': 4.0,
        })

    def test_revenue_surprise_is_none_without_an_actual(self):
        row = {k: v for k, v in RAW_EARNINGS_ROW.items() if k != 'revenueActual'}
        self.assertIsNone(earnings._shape(row)['revenue_surprise_pct'])

    def test_empty_hour_becomes_none(self):
        self.assertIsNone(earnings._shape({**RAW_EARNINGS_ROW, 'hour': ''})['session'])
        self.assertIsNone(earnings._shape({k: v for k, v in RAW_EARNINGS_ROW.items() if k != 'hour'})['session'])

    def test_surprise_is_none_without_both_values(self):
        self.assertIsNone(earnings._shape({**RAW_EARNINGS_ROW, 'epsActual': None})['eps_surprise_pct'])

    def test_surprise_is_none_when_estimate_is_zero(self):
        self.assertIsNone(earnings._surprise(0, 1.2))

    def test_surprise_handles_a_negative_estimate(self):
        # A miss against a -0.10 estimate that came in at -0.20 is -100%, not +100%.
        self.assertEqual(earnings._surprise(-0.10, -0.20), -100.0)


class SessionShapingTest(TestCase):
    def test_known_sessions_pass_through_lowercased_and_trimmed(self):
        for raw, expected in (('bmo', 'bmo'), (' AMC ', 'amc'), ('dmh', 'dmh')):
            with self.subTest(raw=raw):
                self.assertEqual(earnings._shape({**RAW_EARNINGS_ROW, 'hour': raw})['session'], expected)

    def test_unknown_or_blank_sessions_are_none_never_amc(self):
        for raw in ('', None, '--', 'xyz', 'after hours'):
            with self.subTest(raw=raw):
                self.assertIsNone(earnings._shape({**RAW_EARNINGS_ROW, 'hour': raw})['session'])


class RevenueShapingTest(TestCase):
    def test_negative_revenue_actual_is_none_and_so_is_its_surprise(self):
        event = earnings._shape({**RAW_EARNINGS_ROW, 'revenueActual': -4_200_000})
        self.assertIsNone(event['revenue_actual'])
        self.assertIsNone(event['revenue_surprise_pct'])

    def test_zero_revenue_actual_is_kept(self):
        event = earnings._shape({**RAW_EARNINGS_ROW, 'revenueActual': 0})
        self.assertEqual(event['revenue_actual'], 0)
        self.assertEqual(event['revenue_surprise_pct'], -100.0)

    def test_negative_revenue_does_not_touch_the_eps_figures(self):
        event = earnings._shape({**RAW_EARNINGS_ROW, 'revenueActual': -1})
        self.assertEqual((event['eps_actual'], event['eps_surprise_pct']), (2.2, 10.0))


class SurpriseBaseTest(TestCase):
    def test_estimate_below_one_cent_has_no_surprise(self):
        self.assertIsNone(earnings._surprise(0.004, 0.20))
        self.assertIsNone(earnings._surprise(-0.009, 0.05))

    def test_estimate_at_the_threshold_still_scores(self):
        self.assertEqual(earnings._surprise(0.01, 0.02), 100.0)

    def test_shape_carries_the_null_through(self):
        event = earnings._shape({**RAW_EARNINGS_ROW, 'epsEstimate': 0.003, 'epsActual': 0.30})
        self.assertIsNone(event['eps_surprise_pct'])


def _event(**overrides):
    base = {
        'symbol': 'AAPL', 'date': '2026-10-28', 'session': 'amc', 'quarter': 4, 'year': 2026,
        'eps_estimate': 2.0, 'eps_actual': None, 'revenue_estimate': None, 'revenue_actual': None,
        'eps_surprise_pct': None, 'revenue_surprise_pct': None,
    }
    return {**base, **overrides}


class DedupeTest(TestCase):
    def test_distinct_quarters_on_the_same_date_both_survive(self):
        events = [_event(quarter=3), _event(quarter=4)]
        self.assertEqual(len(earnings._dedupe(events)), 2)

    def test_reported_copy_beats_unreported_regardless_of_order(self):
        reported = _event(eps_actual=2.2, eps_surprise_pct=10.0)
        pending = _event()
        self.assertEqual(earnings._dedupe([pending, reported]), [reported])
        self.assertEqual(earnings._dedupe([reported, pending]), [reported])

    def test_fuller_copy_wins_when_both_are_unreported(self):
        sparse = _event(session=None, eps_estimate=None)
        full = _event()
        self.assertEqual(earnings._dedupe([sparse, full]), [full])

    def test_exact_tie_keeps_the_first_in_provider_order(self):
        first = _event(year=2026)
        second = _event(year=2027)
        self.assertEqual(earnings._dedupe([first, second]), [first])
        self.assertEqual(earnings._dedupe([second, first]), [second])

    def test_survivors_keep_first_seen_order(self):
        a, b = _event(symbol='AAPL'), _event(symbol='MSFT')
        self.assertEqual(earnings._dedupe([a, b, dict(a)]), [a, b])

    def test_a_missing_quarter_is_its_own_key(self):
        events = [_event(quarter=None), _event(quarter=None, symbol='MSFT')]
        self.assertEqual(len(earnings._dedupe(events)), 2)


class WeekStatsTest(TestCase):
    def _ev(self, date_, surprise, mine=False):
        return {'date': date_, 'eps_surprise_pct': surprise, 'mine': mine}

    def test_counts_beats_misses_and_in_line_reports(self):
        stats = earnings._week_stats([
            self._ev('2026-10-26', 4.0),
            self._ev('2026-10-26', -2.0),
            self._ev('2026-10-27', 0.0),
            self._ev('2026-10-28', None),  # not yet reported
        ])
        self.assertEqual(stats['total'], 4)
        self.assertEqual(stats['reported'], 3)
        self.assertEqual((stats['beat'], stats['missed'], stats['inline']), (1, 1, 1))
        self.assertEqual(stats['avg_surprise'], round((4.0 - 2.0 + 0.0) / 3, 2))

    def test_by_day_carries_the_split_per_date_oldest_first(self):
        stats = earnings._week_stats([
            self._ev('2026-10-27', 5.0),
            self._ev('2026-10-26', 5.0),
            self._ev('2026-10-26', 5.0),
            self._ev('2026-10-26', -5.0),
            self._ev('2026-10-26', 0.0),
        ])
        self.assertEqual(stats['by_day'], [
            {'date': '2026-10-26', 'beat': 2, 'missed': 1, 'inline': 1},
            {'date': '2026-10-27', 'beat': 1, 'missed': 0, 'inline': 0},
        ])

    def test_empty_week_has_no_average_and_no_days(self):
        stats = earnings._week_stats([])
        self.assertIsNone(stats['avg_surprise'])
        self.assertEqual(stats['by_day'], [])
        self.assertEqual((stats['reported'], stats['mine']), (0, 0))

    def test_counts_tagged_rows(self):
        stats = earnings._week_stats([
            self._ev('2026-10-26', None, mine=True),
            self._ev('2026-10-26', None),
        ])
        self.assertEqual(stats['mine'], 1)


class ScoreTest(TestCase):
    def _h(self, *surprises):
        return [{'eps_surprise_pct': s} for s in surprises]

    def test_beat_rate_and_average_over_reported_quarters(self):
        score = earnings._score(self._h(3.0, -1.0, 5.0, 2.0))
        self.assertEqual((score['beats'], score['quarters']), (3, 4))
        self.assertEqual(score['beat_rate'], 0.75)
        self.assertEqual(score['avg_surprise'], round((3.0 - 1.0 + 5.0 + 2.0) / 4, 2))

    def test_streak_counts_consecutive_beats_from_the_latest_quarter(self):
        # oldest-first: a miss then three beats -> streak of 3.
        self.assertEqual(earnings._score(self._h(-2.0, 1.0, 1.0, 1.0))['streak'], 3)
        self.assertEqual(earnings._score(self._h(1.0, 1.0, -0.5))['streak'], 0)

    def test_ignores_quarters_with_no_surprise_figure(self):
        score = earnings._score(self._h(None, 4.0, None))
        self.assertEqual((score['beats'], score['quarters']), (1, 1))

    def test_streak_skips_gaps_rather_than_breaking_on_them(self):
        # a missing figure between beats is not a miss - the streak continues.
        self.assertEqual(earnings._score(self._h(2.0, None, 1.0))['streak'], 2)

    def test_empty_history_scores_zero(self):
        self.assertEqual(
            earnings._score([]),
            {'beats': 0, 'quarters': 0, 'beat_rate': None, 'avg_surprise': None, 'streak': 0},
        )
