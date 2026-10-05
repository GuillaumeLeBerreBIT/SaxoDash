from django.test import SimpleTestCase

from . import changes

AAPL = ('037833100', '')
ALLY = ('02005N100', '')
AAPL_CALL = ('037833100', 'CALL')


class PositionChangeTest(SimpleTestCase):
    def test_absent_before_is_new(self):
        self.assertEqual(changes.position_change(100, None), (changes.NEW, None))

    def test_one_percent_more_is_added(self):
        self.assertEqual(changes.position_change(101, 100), (changes.ADDED, 1.0))

    def test_one_percent_less_is_trimmed(self):
        self.assertEqual(changes.position_change(99, 100), (changes.TRIMMED, -1.0))

    def test_under_one_percent_is_unchanged(self):
        self.assertEqual(changes.position_change(1005, 1000), (changes.UNCHANGED, 0.5))

    def test_identical_is_unchanged(self):
        self.assertEqual(changes.position_change(100, 100), (changes.UNCHANGED, 0.0))

    def test_growth_from_a_zero_share_row_is_added_without_a_percentage(self):
        self.assertEqual(changes.position_change(50, 0), (changes.ADDED, None))

    def test_the_percentage_is_rounded_to_two_places(self):
        self.assertEqual(changes.position_change(200, 300), (changes.TRIMMED, -33.33))


class CompareTest(SimpleTestCase):
    def test_a_first_quarter_has_no_change_column_and_nothing_sold(self):
        per_key, sold_out = changes.compare({AAPL: 100}, None)
        self.assertEqual(per_key, {AAPL: None})
        self.assertEqual(sold_out, [])

    def test_classifies_each_position_and_lists_sold_out_ones(self):
        per_key, sold_out = changes.compare(
            {AAPL: 120, AAPL_CALL: 5},
            {AAPL: 100, ALLY: 50},
        )
        self.assertEqual(per_key[AAPL], (changes.ADDED, 20.0))
        self.assertEqual(per_key[AAPL_CALL], (changes.NEW, None))
        self.assertEqual(sold_out, [ALLY])

    def test_an_empty_previous_quarter_makes_everything_new(self):
        per_key, sold_out = changes.compare({AAPL: 1}, {})
        self.assertEqual(per_key, {AAPL: (changes.NEW, None)})
        self.assertEqual(sold_out, [])
