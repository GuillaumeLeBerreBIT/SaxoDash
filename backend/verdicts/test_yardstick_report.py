from django.test import SimpleTestCase

from verdicts import yardstick_report
from verdicts.test_yardsticks import cycling, quarter_ends, series, sessions


def universe(count=700):
    days = sessions(count)
    eps = [(day, 1.0) for day in quarter_ends(2008, 2016)]
    by_ticker = {f'S{n:02d}': series(days, cycling(days)) for n in range(60)}
    eps_by_ticker = {ticker: eps for ticker in by_ticker}
    eps_by_ticker['S00'] = []
    by_ticker['S01'] = series(days, [100.0] * 400 + [25.0] * (count - 400))
    return by_ticker, eps_by_ticker


class ReportTest(SimpleTestCase):
    def test_one_row_per_flag_and_horizon_with_spreads_and_data_counts(self):
        run = yardstick_report.grade_run('All stocks', *universe())
        text = yardstick_report.render(run)
        self.assertEqual(len(run.scores), 4 * 3)
        for label in ('P/E range: cheap', 'P/E range: expensive', 'Growth line: cheap', 'Growth line: expensive'):
            for horizon in (60, 120, 250):
                self.assertIn(f'| {label} | {horizon} |', text)
        self.assertIn('| P/E range | 250 |', text)
        self.assertIn('| Growth line | 60 |', text)
        self.assertIn('60 stocks; 1 never flagged', text)
        self.assertEqual(run.split_suspects, ['S01'])

    def test_a_since_date_drops_earlier_cases_and_excluded_stocks_are_left_out(self):
        by_ticker, eps = universe()
        full = yardstick_report.grade_run('All', by_ticker, eps)
        later = yardstick_report.grade_run('Later', by_ticker, eps, since='2012-01-01', exclude={'S01'})
        cases = {(found.key, found.horizon): found.cases for found in full.scores}
        for found in later.scores:
            self.assertLessEqual(found.cases, cases[(found.key, found.horizon)])
            if found.from_date:
                self.assertGreaterEqual(found.from_date, '2012-01-01')
        self.assertEqual(later.stocks, 59)

    def test_a_since_window_splits_its_own_cases_into_two_halves(self):
        by_ticker, eps = universe(1400)
        later = yardstick_report.grade_run('Later', by_ticker, eps, since='2013-01-01')
        counted = [found for found in later.scores if found.cases]
        self.assertTrue(counted)
        for found in counted:
                self.assertIsNotNone(found.first_half, found.key)
                self.assertIsNotNone(found.second_half, found.key)
