from datetime import date, datetime, timedelta, timezone as tz
from types import SimpleNamespace

from django.test import SimpleTestCase

from investors.prices import Series

from . import scoring

RECORDED = date(2026, 1, 5)
ENTRY = date(2026, 1, 6)


def series(*points):
    return Series([day for day, _ in points], [close for _, close in points])


def rec(action='buy_new', conviction='medium', decision='pending', buy_range=None, closed_on=None):
    return SimpleNamespace(
        ticker='AAA',
        action=action,
        conviction=conviction,
        decision=decision,
        buy_range=buy_range,
        recorded_at=datetime(2026, 1, 5, 12, tzinfo=tz.utc),
        closed_at=datetime.combine(closed_on, datetime.min.time(), tzinfo=tz.utc) if closed_on else None,
    )


def at(offset):
    return ENTRY + timedelta(days=offset)


TICKER = series((ENTRY, 100.0), (at(91), 120.0))
BENCH = series((ENTRY, 100.0), (at(91), 105.0))
LATE = date(2027, 6, 1)


class ScoreTests(SimpleTestCase):
    def test_buy_beats_benchmark(self):
        result = scoring.score(rec(), {'AAA': TICKER}, BENCH, LATE)
        self.assertEqual(result['entry_day'], ENTRY)
        self.assertEqual(
            result['checkpoints']['3m'],
            {'day': at(91), 'return_pct': 20.0, 'benchmark_pct': 5.0, 'excess_pct': 15.0},
        )

    def test_sell_is_scored_inverted(self):
        result = scoring.score(rec('sell'), {'AAA': TICKER}, BENCH, LATE)
        self.assertEqual(result['checkpoints']['3m']['excess_pct'], -15.0)

    def test_future_checkpoint_is_null(self):
        result = scoring.score(rec(), {'AAA': TICKER}, BENCH, at(60))
        self.assertIsNone(result['checkpoints']['3m'])
        self.assertIsNone(result['checkpoints']['6m'])
        self.assertIsNone(result['checkpoints']['12m'])

    def test_latest_is_measured_at_the_last_session(self):
        result = scoring.score(rec(), {'AAA': TICKER}, BENCH, at(120))
        self.assertEqual(result['latest']['day'], at(91))
        self.assertEqual(result['latest']['excess_pct'], 15.0)

    def test_latest_is_null_before_any_session_after_entry(self):
        result = scoring.score(rec(), {'AAA': TICKER}, BENCH, ENTRY)
        self.assertIsNone(result['latest'])

    def test_closed_recommendation_stops_at_close(self):
        closed = rec(closed_on=at(30))
        result = scoring.score(closed, {'AAA': TICKER}, BENCH, LATE)
        self.assertIsNone(result['checkpoints']['3m'])
        self.assertIsNone(result['latest'])
        later = scoring.score(rec(closed_on=at(100)), {'AAA': TICKER}, BENCH, LATE)
        self.assertEqual(later['checkpoints']['3m']['excess_pct'], 15.0)
        self.assertEqual(later['latest']['day'], at(91))

    def test_checkpoint_uses_the_session_on_or_before(self):
        ticker = series((ENTRY, 100.0), (at(90), 110.0), (at(93), 130.0))
        bench = series((ENTRY, 100.0), (at(90), 102.0), (at(93), 150.0))
        result = scoring.score(rec(), {'AAA': ticker}, bench, LATE)
        self.assertEqual(result['checkpoints']['3m']['return_pct'], 10.0)
        self.assertEqual(result['checkpoints']['3m']['benchmark_pct'], 2.0)

    def test_stale_series_does_not_score_a_checkpoint(self):
        result = scoring.score(rec(), {'AAA': TICKER}, BENCH, LATE)
        self.assertIsNone(result['checkpoints']['6m'])

    def test_watch_starts_when_buy_range_touched(self):
        ticker = series((ENTRY, 110.0), (at(10), 100.0), (at(101), 120.0))
        bench = series((ENTRY, 100.0), (at(10), 100.0), (at(101), 110.0))
        watch = rec('watch', buy_range={'low': 90, 'high': 100})
        result = scoring.score(watch, {'AAA': ticker}, bench, LATE)
        self.assertEqual(result['entry_day'], at(10))
        self.assertEqual(result['checkpoints']['3m']['return_pct'], 20.0)
        self.assertEqual(result['checkpoints']['3m']['excess_pct'], 10.0)

    def test_untouched_watch_is_unscored(self):
        watch = rec('watch', buy_range={'low': 50, 'high': 60})
        result = scoring.score(watch, {'AAA': TICKER}, BENCH, LATE)
        self.assertIsNone(result['entry_day'])
        self.assertEqual(result['checkpoints'], {'3m': None, '6m': None, '12m': None})
        self.assertIsNone(result['latest'])

    def test_harvest_is_not_scored(self):
        for action in ('harvest_loss', 'harvest_gain'):
            result = scoring.score(rec(action), {'AAA': TICKER}, BENCH, LATE)
            self.assertIsNone(result['entry_day'])
            self.assertEqual(result['checkpoints'], {'3m': None, '6m': None, '12m': None})
            self.assertIsNone(result['latest'])

    def test_missing_series_scores_null(self):
        for prices, bench in (({}, BENCH), ({'AAA': TICKER}, series())):
            result = scoring.score(rec(), prices, bench, LATE)
            self.assertIsNone(result['entry_day'])
            self.assertEqual(result['checkpoints'], {'3m': None, '6m': None, '12m': None})
            self.assertIsNone(result['latest'])


def scored(conviction, excess, decision='accepted', action='buy_new'):
    point = None if excess is None else {'excess_pct': excess}
    return {
        'conviction': conviction,
        'action': action,
        'decision': decision,
        'score': {'checkpoints': {'3m': point, '6m': None, '12m': None}},
    }


class SummaryTests(SimpleTestCase):
    def test_summary_by_conviction_includes_declined(self):
        rows = [
            scored('high', 10.0),
            scored('high', 20.0, decision='declined'),
            scored('low', -5.0, action='sell'),
            scored('low', None),
        ]
        result = scoring.summary(rows)
        self.assertEqual(result['overall']['3m'], {'mean_excess_pct': 8.33, 'n': 3})
        self.assertEqual(result['by_conviction']['high']['3m'], {'mean_excess_pct': 15.0, 'n': 2})
        self.assertEqual(result['by_conviction']['low']['3m'], {'mean_excess_pct': -5.0, 'n': 1})
        self.assertEqual(result['by_action']['sell']['3m'], {'mean_excess_pct': -5.0, 'n': 1})
        self.assertEqual(result['declined']['3m'], {'mean_excess_pct': 20.0, 'n': 1})
        self.assertEqual(result['overall']['6m'], {'mean_excess_pct': None, 'n': 0})
