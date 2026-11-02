from datetime import date
from unittest.mock import patch

from django.core.cache import cache
from django.test import SimpleTestCase, override_settings

from . import report_dates

LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}

TICKERS = {'0': {'cik_str': 1652044, 'ticker': 'GOOGL', 'title': 'Alphabet Inc.'}}


def submissions(*filings):
    keys = ('form', 'items', 'acceptanceDateTime', 'reportDate')
    return {'filings': {'recent': {key: [filing[i] for filing in filings] for i, key in enumerate(keys)}}}


def answer(subs):
    def get(url):
        return TICKERS if url == report_dates.TICKERS_URL else subs
    return get


def day(text):
    return date.fromisoformat(text)


@override_settings(CACHES=LOCMEM, SEC_USER_AGENT='SaxoDash test test@example.com')
class CompanyReportsTest(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def test_reads_results_releases_and_fiscal_period_ends(self):
        subs = submissions(
            ('8-K', '2.02,9.01', '2026-10-28T20:01:33.000Z', ''),
            ('8-K', '5.02', '2026-10-01T20:00:00.000Z', ''),
            ('10-Q', '', '2026-10-29T20:00:00.000Z', '2026-09-30'),
            ('8-K', '2.02,8.01,9.01', '2026-02-04T21:01:27.000Z', ''),
            ('10-K', '', '2026-02-05T20:00:00.000Z', '2025-12-31'),
        )
        with patch.object(report_dates, '_get', side_effect=answer(subs)):
            reports = report_dates.company_reports('googl')

        self.assertEqual(reports['releases'], [
            {'date': day('2026-02-04'), 'session': 'amc'},
            {'date': day('2026-10-28'), 'session': 'amc'},
        ])
        self.assertEqual(reports['fiscal_ends'], [day('2025-12-31'), day('2026-09-30')])

    def test_an_unknown_ticker_has_no_releases(self):
        with patch.object(report_dates, '_get', side_effect=answer(submissions())):
            self.assertEqual(report_dates.company_reports('NBIS'), report_dates.NO_REPORTS)

    def test_an_unreadable_filing_list_is_unavailable(self):
        with patch.object(report_dates, '_get', side_effect=answer({'filings': {}})):
            with self.assertRaises(report_dates.SecUnavailable):
                report_dates.company_reports('GOOGL')

    @override_settings(SEC_USER_AGENT='')
    def test_without_a_user_agent_the_sec_is_not_asked(self):
        with self.assertRaises(report_dates.SecUnavailable):
            report_dates.company_reports('GOOGL')


class ReleaseSessionTest(SimpleTestCase):
    def test_reads_the_acceptance_time_in_new_york(self):
        self.assertEqual(report_dates.release_session('2026-07-22T11:00:00.000Z'), (
            report_dates.date(2026, 7, 22), 'bmo'))
        self.assertEqual(report_dates.release_session('2026-07-22T15:00:00.000Z'), (
            report_dates.date(2026, 7, 22), 'dmh'))
        self.assertEqual(report_dates.release_session('2026-07-22T20:01:36.000Z'), (
            report_dates.date(2026, 7, 22), 'amc'))

    def test_a_late_evening_release_stays_on_its_new_york_day(self):
        self.assertEqual(report_dates.release_session('2026-09-12T02:24:06.000Z'), (
            report_dates.date(2026, 9, 11), 'amc'))


def releases(*pairs):
    return [{'date': day(when), 'session': session} for when, session in pairs]


class AttachTest(SimpleTestCase):
    def test_each_quarter_takes_the_first_release_after_its_fiscal_end(self):
        history = [{'date': '2026-03-31'}, {'date': '2026-06-30'}, {'date': '2026-09-30'}]
        reports = {
            'releases': releases(('2026-04-29', 'amc'), ('2026-07-22', 'amc'), ('2026-10-28', 'amc')),
            'fiscal_ends': [day('2026-03-31'), day('2026-06-30'), day('2026-09-30')],
        }

        report_dates.attach(history, reports)

        self.assertEqual([row['reported_on'] for row in history], ['2026-04-29', '2026-07-22', '2026-10-28'])
        self.assertEqual({row['session'] for row in history}, {'amc'})

    def test_an_off_calendar_fiscal_quarter_is_anchored_on_its_real_end(self):
        history = [{'date': '2025-12-31'}, {'date': '2026-09-30'}]
        reports = {
            'releases': releases(('2025-11-19', 'amc'), ('2026-02-25', 'amc'), ('2026-08-26', 'amc')),
            'fiscal_ends': [day('2025-10-26'), day('2026-01-25'), day('2026-07-26')],
        }

        report_dates.attach(history, reports)

        self.assertEqual([row['reported_on'] for row in history], ['2025-11-19', '2026-08-26'])

    def test_a_quarter_whose_10q_is_not_filed_yet_takes_the_release_after_the_last_claimed(self):
        history = [{'date': '2026-06-30'}, {'date': '2026-09-30'}]
        reports = {
            'releases': releases(('2026-07-22', 'amc'), ('2026-10-28', 'amc')),
            'fiscal_ends': [day('2026-06-30')],
        }

        report_dates.attach(history, reports)

        self.assertEqual([row['reported_on'] for row in history], ['2026-07-22', '2026-10-28'])

    def test_a_quarter_with_no_release_in_its_window_has_no_report_date(self):
        history = [{'date': '2026-03-31'}]

        report_dates.attach(history, {'releases': releases(('2026-09-01', 'bmo')), 'fiscal_ends': []})

        self.assertIsNone(history[0]['reported_on'])
        self.assertIsNone(history[0]['session'])
