from datetime import date

from django.test import SimpleTestCase

from research import valuation

from .eps_line import steps

TODAY = date(2026, 11, 16)


def quarter(year, month, value):
    return (date(year, month, 28 if month == 2 else 30 if month in (4, 6, 9, 11) else 31), value)


def series(values, start_year=2024):
    months = [3, 6, 9, 12]
    return [quarter(start_year + index // 4, months[index % 4], value) for index, value in enumerate(values)]


class EpsLineTest(SimpleTestCase):
    def test_each_step_starts_at_a_quarter_end_with_the_last_four_quarters_summed(self):
        line = steps(series([1.0, 1.0, 1.0, 1.0, 2.0, 3.0]), TODAY)
        self.assertEqual(line, [
            {'from': '2024-12-31', 'eps_ttm': 4.0},
            {'from': '2025-03-31', 'eps_ttm': 5.0},
            {'from': '2025-06-30', 'eps_ttm': 7.0},
        ])

    def test_the_last_step_matches_the_verdicts_own_trailing_earnings(self):
        quarters = series([1.11, 1.27, 0.93, 1.42, 1.58, 1.61, 1.7])
        ordered = sorted(quarters)
        self.assertEqual(steps(quarters, TODAY)[-1]['eps_ttm'], round(valuation._latest_eps_ttm(ordered, TODAY), 2))

    def test_no_step_before_four_quarters(self):
        self.assertEqual(steps(series([1.0, 1.0, 1.0]), TODAY), [])

    def test_a_loss_ends_the_line_until_earnings_turn_positive(self):
        line = steps(series([1.0, 1.0, 1.0, 1.0, -5.0, 1.0, 1.0, 1.0, 1.0]), TODAY)
        self.assertEqual([step['eps_ttm'] for step in line], [4.0, None, 4.0])
        self.assertEqual(line[1]['from'], '2025-03-31')
        self.assertEqual(line[2]['from'], '2026-03-31')

    def test_quarters_ending_after_today_are_not_used(self):
        line = steps(series([1.0, 1.0, 1.0, 1.0, 2.0]), date(2025, 3, 30))
        self.assertEqual(line, [{'from': '2024-12-31', 'eps_ttm': 4.0}])

    def test_keeps_ten_years_and_the_step_in_force_when_they_start(self):
        line = steps(series([1.0] * 4 + [1.0 + i / 10 for i in range(60)], start_year=2008), TODAY)
        self.assertLess(line[0]['from'], '2016-11-16')
        self.assertGreaterEqual(line[1]['from'], '2016-11-16')

    def test_unordered_input_is_sorted(self):
        quarters = series([1.0, 1.0, 1.0, 1.0, 2.0])
        self.assertEqual(steps(list(reversed(quarters)), TODAY), steps(quarters, TODAY))
