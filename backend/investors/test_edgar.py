from datetime import date
from unittest.mock import Mock, patch

from django.test import SimpleTestCase, override_settings

from . import edgar

UA = 'SaxoDash test@example.com'


def columns(*entries):
    keys = ('accessionNumber', 'filingDate', 'reportDate', 'form')
    return {key: [entry[i] for entry in entries] for i, key in enumerate(keys)}


def ok_json(payload):
    return Mock(ok=True, status_code=200, json=lambda: payload)


@override_settings(SEC_USER_AGENT=UA)
@patch('investors.edgar.time.sleep')
@patch('investors.edgar.requests.get')
class FilingsTest(SimpleTestCase):
    def test_lists_13f_filings_newest_quarter_first_with_amendments_after_their_original(self, get, sleep):
        get.return_value = ok_json({'filings': {'recent': columns(
            ('A-3', '2026-08-14', '2026-06-30', '13F-HR'),
            ('A-4', '2026-09-01', '2026-03-31', '13F-HR/A'),
            ('A-9', '2026-08-01', '2026-06-30', '10-K'),
            ('A-2', '2026-05-15', '2026-03-31', '13F-HR'),
        ), 'files': []}})

        found = edgar.filings(1067983, date(2021, 10, 5))

        self.assertEqual([f['accession'] for f in found], ['A-3', 'A-2', 'A-4'])
        self.assertEqual(found[0], {
            'accession': 'A-3', 'form': '13F-HR',
            'filed_on': date(2026, 8, 14), 'quarter_end': date(2026, 6, 30),
        })
        self.assertEqual(get.call_args.args[0], 'https://data.sec.gov/submissions/CIK0001067983.json')
        self.assertEqual(get.call_args.kwargs['headers'], {'User-Agent': UA})

    def test_drops_quarters_before_the_window_and_notices(self, get, sleep):
        get.return_value = ok_json({'filings': {'recent': columns(
            ('A-1', '2026-08-14', '2026-06-30', '13F-HR'),
            ('A-0', '2020-08-14', '2020-06-30', '13F-HR'),
            ('A-N', '2026-08-14', '2026-06-30', '13F-NT'),
        ), 'files': []}})

        found = edgar.filings(1, date(2021, 10, 5))

        self.assertEqual([f['accession'] for f in found], ['A-1'])

    def test_follows_older_pages_that_reach_into_the_window_only(self, get, sleep):
        recent = {'filings': {
            'recent': columns(('A-5', '2026-08-14', '2026-06-30', '13F-HR')),
            'files': [
                {'name': 'CIK0000000001-submissions-001.json', 'filingFrom': '2019-01-01', 'filingTo': '2023-01-01'},
                {'name': 'CIK0000000001-submissions-002.json', 'filingFrom': '2001-01-01', 'filingTo': '2018-12-31'},
            ],
        }}
        page = columns(('A-4', '2022-08-14', '2022-06-30', '13F-HR'))
        get.side_effect = [ok_json(recent), ok_json(page)]

        found = edgar.filings(1, date(2021, 10, 5))

        self.assertEqual([f['accession'] for f in found], ['A-5', 'A-4'])
        self.assertEqual(get.call_count, 2)
        self.assertEqual(
            get.call_args.args[0], 'https://data.sec.gov/submissions/CIK0000000001-submissions-001.json',
        )

    def test_a_server_error_is_an_edgar_error(self, get, sleep):
        get.return_value = Mock(ok=False, status_code=503, text='busy')
        with self.assertRaises(edgar.EdgarError):
            edgar.filings(1, date(2021, 10, 5))


@override_settings(SEC_USER_AGENT='')
class NotConfiguredTest(SimpleTestCase):
    def test_refuses_to_call_edgar_without_a_contact(self):
        with self.assertRaises(edgar.EdgarNotConfigured):
            edgar.filings(1, date(2021, 10, 5))


@override_settings(SEC_USER_AGENT=UA)
@patch('investors.edgar.time.sleep')
@patch('investors.edgar.requests.get')
class FilingDocumentsTest(SimpleTestCase):
    def index(self, *names):
        return ok_json({'directory': {'item': [{'name': name} for name in names]}})

    def test_fetches_the_primary_document_and_the_information_table(self, get, sleep):
        get.side_effect = [
            self.index('0001-index.html', '56757.xml', 'primary_doc.xml'),
            Mock(ok=True, status_code=200, content=b'<primary/>'),
            Mock(ok=True, status_code=200, content=b'<table/>'),
        ]

        primary, table = edgar.filing_documents(1067983, '0001193125-26-352200')

        self.assertEqual((primary, table), (b'<primary/>', b'<table/>'))
        urls = [call.args[0] for call in get.call_args_list]
        base = 'https://www.sec.gov/Archives/edgar/data/1067983/000119312526352200/'
        self.assertEqual(urls, [base + 'index.json', base + 'primary_doc.xml', base + '56757.xml'])

    def test_a_filing_without_an_information_table_is_incomplete(self, get, sleep):
        get.side_effect = [self.index('primary_doc.xml', 'x-index.html')]
        with self.assertRaises(edgar.FilingIncomplete):
            edgar.filing_documents(1, '0001-26-1')

    def test_a_failed_document_download_is_an_edgar_error(self, get, sleep):
        get.side_effect = [
            self.index('primary_doc.xml', 'table.xml'),
            Mock(ok=False, status_code=500, content=b''),
        ]
        with self.assertRaises(edgar.EdgarError):
            edgar.filing_documents(1, '0001-26-1')


@override_settings(SEC_USER_AGENT=UA)
class PacingTest(SimpleTestCase):
    @patch('investors.edgar.time.sleep')
    @patch('investors.edgar.time.monotonic', side_effect=[100.0, 100.0, 100.05, 100.12])
    @patch('investors.edgar.requests.get')
    def test_waits_between_back_to_back_requests(self, get, monotonic, sleep):
        edgar._last_request = 0.0
        get.return_value = ok_json({'filings': {'recent': columns(), 'files': []}})

        edgar.filings(1, date(2021, 10, 5))
        edgar.filings(1, date(2021, 10, 5))

        sleep.assert_called_once()
        self.assertAlmostEqual(sleep.call_args.args[0], 0.07, places=2)
