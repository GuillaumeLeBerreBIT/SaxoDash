from django.test import SimpleTestCase

from .amounts import parse_range, size


class AmountsTest(SimpleTestCase):
    def test_a_closed_range(self):
        self.assertEqual(parse_range('$1,001 - $15,000'), (1001, 15000))

    def test_a_range_split_over_lines(self):
        self.assertEqual(parse_range('$5,000,001 -\n$25,000,000'), (5000001, 25000000))

    def test_an_open_range_has_no_upper_bound(self):
        self.assertEqual(parse_range('Over $50,000,000'), (50000000, None))
        self.assertEqual(parse_range('Spouse/DC Over $1,000,000'), (1000000, None))

    def test_unreadable_text_is_refused(self):
        with self.assertRaises(ValueError):
            parse_range('None disclosed')

    def test_size_is_the_midpoint_or_the_lower_bound_of_an_open_range(self):
        self.assertEqual(size(1001, 15000), 8000.5)
        self.assertEqual(size(50000000, None), 50000000)
