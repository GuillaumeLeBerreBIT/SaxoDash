from django.test import SimpleTestCase

from . import reaction

CLOSES = [
    ('2026-10-15', 100.0),
    ('2026-10-16', 110.0),
    ('2026-10-19', 99.0),
    ('2026-10-20', 121.0),
]


class MoveTest(SimpleTestCase):
    def test_before_open_compares_the_day_with_the_session_before(self):
        self.assertEqual(reaction.move('2026-10-16', 'bmo', CLOSES), (10.0, '1d'))

    def test_during_hours_is_judged_like_before_open(self):
        self.assertEqual(reaction.move('2026-10-16', 'dmh', CLOSES), (10.0, '1d'))

    def test_after_close_compares_the_next_session_with_the_day(self):
        self.assertEqual(reaction.move('2026-10-19', 'amc', CLOSES), (22.22, '1d'))

    def test_after_close_on_a_friday_reaches_over_the_weekend(self):
        self.assertEqual(reaction.move('2026-10-16', 'amc', CLOSES), (-10.0, '1d'))

    def test_no_session_spans_the_session_before_to_the_session_after(self):
        self.assertEqual(reaction.move('2026-10-16', None, CLOSES), (-1.0, '2d'))

    def test_after_close_with_no_next_session_yet_is_unknown(self):
        self.assertEqual(reaction.move('2026-10-20', 'amc', CLOSES), (None, None))

    def test_before_open_on_a_day_missing_from_the_closes_is_unknown(self):
        self.assertEqual(reaction.move('2026-10-17', 'bmo', CLOSES), (None, None))

    def test_no_earlier_session_is_unknown(self):
        self.assertEqual(reaction.move('2026-10-15', 'bmo', CLOSES), (None, None))

    def test_a_zero_base_close_is_unknown(self):
        closes = [('2026-10-15', 0.0), ('2026-10-16', 5.0)]
        self.assertEqual(reaction.move('2026-10-16', 'bmo', closes), (None, None))

    def test_empty_closes_are_unknown(self):
        self.assertEqual(reaction.move('2026-10-16', 'bmo', []), (None, None))

    def test_bmo_today_uses_the_forming_bar(self):
        closes = [('2026-10-19', 100.0), ('2026-10-20', 103.0)]
        self.assertEqual(reaction.move('2026-10-20', 'bmo', closes), (3.0, '1d'))
