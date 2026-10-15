import io
import zipfile
from datetime import date, datetime, timezone as tz
from pathlib import Path
from unittest import mock

from django.test import TestCase

from . import house
from .members import Directory
from .models import HouseIndexState, Member, Report, Trade

TESTDATA = Path(__file__).with_name('testdata')
NOW = datetime(2026, 10, 15, 14, 0, tzinfo=tz.utc)

INDEX_XML = b'''<?xml version="1.0" encoding="utf-8"?>
<FinancialDisclosure>
  <Member><Prefix>Hon.</Prefix><Last>Pelosi</Last><First>Nancy</First><Suffix /><FilingType>P</FilingType>
    <StateDst>CA11</StateDst><Year>2025</Year><FilingDate>1/17/2025</FilingDate><DocID>20026590</DocID></Member>
  <Member><Prefix>Hon.</Prefix><Last>Pelosi</Last><First>Nancy</First><Suffix /><FilingType>O</FilingType>
    <StateDst>CA11</StateDst><Year>2025</Year><FilingDate>5/15/2025</FilingDate><DocID>10070000</DocID></Member>
  <Member><Prefix>Hon.</Prefix><Last>Pelosi</Last><First>Nancy</First><Suffix /><FilingType>P</FilingType>
    <StateDst>CA11</StateDst><Year>2025</Year><FilingDate>2/3/2025</FilingDate><DocID>8221321</DocID></Member>
</FinancialDisclosure>'''


def zipped(xml):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w') as archive:
        archive.writestr('2025FD.xml', xml)
        archive.writestr('2025FD.txt', '')
    return buffer.getvalue()


def response(status=200, content=b'', headers=None):
    answer = mock.Mock(status_code=status, content=content, headers=headers or {})
    return answer


def DIRECTORY():
    return Directory([{
        'id': {'bioguide': 'P000197'}, 'name': {'first': 'Nancy', 'last': 'Pelosi'},
        'terms': [{'type': 'rep', 'state': 'CA', 'district': 11, 'party': 'Democrat', 'start': '2025-01-03', 'end': '2027-01-03'}],
    }])


class EntriesTest(TestCase):
    def test_keeps_only_periodic_transaction_reports(self):
        found = house.entries(INDEX_XML)
        self.assertEqual([entry.doc_id for entry in found], ['20026590', '8221321'])
        self.assertEqual(found[0].filed_on, date(2025, 1, 17))
        self.assertEqual(found[0].state_district, 'CA11')


BAD_ROWS_XML = b'''<?xml version="1.0" encoding="utf-8"?>
<FinancialDisclosure>
  <Member><Last>A</Last><First>B</First><FilingType>P</FilingType><StateDst>CA11</StateDst><Year>2025</Year><FilingDate>1/17/2025</FilingDate></Member>
  <Member><Last>A</Last><First>B</First><FilingType>P</FilingType><StateDst>CA11</StateDst><Year>2025</Year><FilingDate>nope</FilingDate><DocID>20000001</DocID></Member>
  <Member><Last>A</Last><First>B</First><FilingType>P</FilingType><StateDst>CA11</StateDst><FilingDate>1/17/2025</FilingDate><DocID>20000002</DocID></Member>
  <Member><Last>Pelosi</Last><First>Nancy</First><FilingType>P</FilingType><StateDst>CA11</StateDst><Year>2025</Year><FilingDate>1/17/2025</FilingDate><DocID>20026590</DocID></Member>
  <Member><Last>Pelosi</Last><First>Nancy</First><FilingType>P</FilingType><StateDst>CA11</StateDst><Year>2025</Year><FilingDate>1/17/2025</FilingDate><DocID>20026590</DocID></Member>
</FinancialDisclosure>'''


class MalformedIndexTest(TestCase):
    def test_bad_rows_are_skipped_and_logged(self):
        with self.assertLogs('congress.house', level='WARNING') as logs:
            found = house.entries(BAD_ROWS_XML)
        self.assertEqual([entry.doc_id for entry in found], ['20026590', '20026590'])
        self.assertEqual(len(logs.records), 3)

    def test_a_duplicate_doc_id_in_one_index_is_created_once(self):
        with mock.patch.object(house, '_get', return_value=response(content=zipped(BAD_ROWS_XML))):
            created = house.sync_index(2025, NOW, directory=DIRECTORY)
        self.assertEqual(created, 1)


class SyncIndexTest(TestCase):
    def test_creates_reports_and_marks_paper_ones(self):
        with mock.patch.object(house, '_get', return_value=response(content=zipped(INDEX_XML), headers={'ETag': '"a"', 'Last-Modified': 'Tue'})):
            created = house.sync_index(2025, NOW, directory=DIRECTORY)
        self.assertEqual(created, 2)
        self.assertEqual(Report.objects.get(doc_id='20026590').status, Report.PENDING)
        self.assertEqual(Report.objects.get(doc_id='8221321').status, Report.PAPER)
        state = HouseIndexState.objects.get(year=2025)
        self.assertEqual((state.etag, state.last_modified), ('"a"', 'Tue'))

    def test_an_unchanged_index_does_no_work(self):
        HouseIndexState.objects.create(year=2025, etag='"a"')
        with mock.patch.object(house, '_get', return_value=response(status=304)) as get:
            created = house.sync_index(2025, NOW, directory=DIRECTORY)
        self.assertEqual(created, 0)
        self.assertEqual(get.call_args.kwargs['headers'], {'If-None-Match': '"a"'})
        self.assertFalse(Report.objects.exists())

    def test_running_twice_creates_nothing_new(self):
        with mock.patch.object(house, '_get', return_value=response(content=zipped(INDEX_XML))):
            house.sync_index(2025, NOW, directory=DIRECTORY)
            self.assertEqual(house.sync_index(2025, NOW, directory=DIRECTORY), 0)


class ParsePendingTest(TestCase):
    def setUp(self):
        self.member = Member.objects.create(slug='nancy-pelosi', first_name='Nancy', last_name='Pelosi', state_district='CA11')
        self.report = Report.objects.create(doc_id='20026590', member=self.member, year=2025, filed_on=date(2025, 1, 17))
        Report.objects.create(doc_id='8221321', member=self.member, year=2025, filed_on=date(2025, 2, 3), status=Report.PAPER)

    def test_parses_a_pending_report_into_trades_and_never_downloads_paper(self):
        pdf = (TESTDATA / '20026590.pdf').read_bytes()
        with mock.patch.object(house, '_get', return_value=response(content=pdf)) as get:
            result = house.parse_pending(pause=lambda _: None)
        self.assertEqual((result.parsed, result.failed, result.member_ids), (1, 0, {self.member.pk}))
        self.assertEqual(get.call_count, 1)
        self.assertIn('/2025/20026590.pdf', get.call_args.args[0])
        self.report.refresh_from_db()
        self.assertEqual((self.report.status, self.report.attempts), (Report.PARSED, 1))
        self.assertEqual(Trade.objects.filter(report=self.report).count(), 9)

    def test_a_parse_failure_is_recorded_retried_and_then_left(self):
        with mock.patch.object(house, '_get', return_value=response(content=b'x')), \
                mock.patch.object(house, 'pdf_text', side_effect=ValueError('boom')):
            for _ in range(4):
                house.parse_pending(pause=lambda _: None)
        self.report.refresh_from_db()
        self.assertEqual((self.report.status, self.report.attempts, self.report.error), (Report.FAILED, 3, 'boom'))

    def test_a_network_error_costs_no_attempt_and_stops_the_run(self):
        Report.objects.create(doc_id='20026591', member=self.member, year=2025, filed_on=date(2025, 1, 18))
        with mock.patch.object(house, '_get', side_effect=house.HouseError('down')) as get:
            result = house.parse_pending(pause=lambda _: None)
        self.assertEqual(get.call_count, 1)
        self.assertEqual((result.parsed, result.failed), (0, 0))
        self.assertEqual(
            list(Report.objects.filter(doc_id__startswith='2002659').values_list('status', 'attempts')),
            [(Report.PENDING, 0), (Report.PENDING, 0)],
        )

    def test_reparsing_replaces_the_previous_trades(self):
        pdf = (TESTDATA / '20026590.pdf').read_bytes()
        with mock.patch.object(house, '_get', return_value=response(content=pdf)):
            house.parse_pending(pause=lambda _: None)
            Report.objects.filter(pk=self.report.pk).update(status=Report.PENDING)
            house.parse_pending(pause=lambda _: None)
        self.assertEqual(Trade.objects.filter(report=self.report).count(), 9)
