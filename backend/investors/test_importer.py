from datetime import date
from unittest.mock import patch

from django.test import TestCase

from . import edgar, figi, importer, parse
from .factories import make_investor, store_quarter
from .models import Filing, Holding, Investor, Security

NS = 'http://www.sec.gov/edgar/document/thirteenf/informationtable'


def table(*rows):
    body = ''.join(
        f'<infoTable><nameOfIssuer>{issuer}</nameOfIssuer><titleOfClass>COM</titleOfClass>'
        f'<cusip>{cusip}</cusip><value>{value}</value><shrsOrPrnAmt><sshPrnamt>{shares}</sshPrnamt>'
        f'<sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt><investmentDiscretion>SOLE</investmentDiscretion>'
        f'</infoTable>'
        for cusip, issuer, shares, value in rows
    )
    return f'<informationTable xmlns="{NS}">{body}</informationTable>'.encode()


def primary(amendment_type=''):
    info = f'<amendmentInfo><amendmentType>{amendment_type}</amendmentType></amendmentInfo>' if amendment_type else ''
    return f'<edgarSubmission><formData><coverPage>{info}</coverPage></formData></edgarSubmission>'.encode()


def listing(accession, quarter_end, filed_on, form='13F-HR'):
    return {'accession': accession, 'form': form, 'quarter_end': quarter_end, 'filed_on': filed_on}


Q2 = date(2026, 6, 30)
Q1 = date(2026, 3, 31)
NEWEST = listing('A-2', Q2, date(2026, 8, 14))
OLDER = listing('A-1', Q1, date(2026, 5, 15))
APPLE = ('037833100', 'APPLE INC', 10, 1000)
ALLY = ('02005N100', 'ALLY FINL INC', 5, 500)


@patch('investors.importer.figi.resolve', return_value=iter([]))
@patch('investors.importer.edgar.filing_documents')
@patch('investors.importer.edgar.filings')
class SyncInvestorTest(TestCase):
    def setUp(self):
        self.investor = make_investor()

    def test_imports_each_filing_with_aggregated_holdings_newest_quarter_first(self, filings, documents, resolve):
        filings.return_value = [NEWEST, OLDER]
        documents.side_effect = [(primary(), table(APPLE, APPLE)), (primary(), table(ALLY))]

        result = importer.sync_investor(self.investor, date(2021, 10, 5))

        self.assertEqual(result.imported, 2)
        self.assertEqual([c.args[1] for c in documents.call_args_list], ['A-2', 'A-1'])
        filing = Filing.objects.get(accession='A-2')
        self.assertEqual((filing.quarter_end, filing.total_value, filing.positions), (Q2, 2000, 1))
        self.assertEqual(filing.holdings.get().shares, 20)

    def test_skips_accessions_already_stored(self, filings, documents, resolve):
        filings.return_value = [NEWEST]
        documents.return_value = (primary(), table(APPLE))
        importer.sync_investor(self.investor, date(2021, 10, 5))

        documents.reset_mock()
        result = importer.sync_investor(self.investor, date(2021, 10, 5))

        documents.assert_not_called()
        self.assertEqual(result.imported, 0)
        self.assertEqual(Filing.objects.count(), 1)

    def test_records_both_amendment_types_from_the_primary_document(self, filings, documents, resolve):
        filings.return_value = [
            listing('A-3', Q2, date(2026, 9, 1), form='13F-HR/A'),
            listing('A-4', Q2, date(2026, 9, 2), form='13F-HR/A'),
        ]
        documents.side_effect = [
            (primary('RESTATEMENT'), table(APPLE)),
            (primary('NEW HOLDINGS'), table(ALLY)),
        ]

        importer.sync_investor(self.investor, date(2021, 10, 5))

        self.assertEqual(Filing.objects.get(accession='A-3').amendment_type, Filing.RESTATEMENT)
        self.assertEqual(Filing.objects.get(accession='A-4').amendment_type, Filing.NEW_HOLDINGS)

    def test_an_original_filing_ignores_any_amendment_markup(self, filings, documents, resolve):
        filings.return_value = [NEWEST]
        documents.return_value = (primary('RESTATEMENT'), table(APPLE))

        importer.sync_investor(self.investor, date(2021, 10, 5))

        self.assertEqual(Filing.objects.get().amendment_type, '')

    def test_an_unreadable_filing_is_skipped_and_the_rest_import(self, filings, documents, resolve):
        filings.return_value = [NEWEST, OLDER]
        documents.side_effect = [(primary(), b'<informationTable><infoTable>'), (primary(), table(ALLY))]

        result = importer.sync_investor(self.investor, date(2021, 10, 5))

        self.assertEqual(result.skipped, ['A-2'])
        self.assertEqual(list(Filing.objects.values_list('accession', flat=True)), ['A-1'])

    def test_a_document_with_no_rows_is_skipped_and_never_stored(self, filings, documents, resolve):
        filings.return_value = [NEWEST]
        documents.side_effect = [(primary(), table())]

        result = importer.sync_investor(self.investor, date(2021, 10, 5))

        self.assertEqual((result.imported, result.skipped), (0, ['A-2']))
        self.assertFalse(Filing.objects.exists())

    def test_a_filing_stored_meanwhile_by_another_run_is_not_counted(self, filings, documents, resolve):
        filings.return_value = [NEWEST]

        def stored_by_a_concurrent_run(cik, accession):
            Filing.objects.create(
                investor=self.investor, quarter_end=Q2, filed_on=date(2026, 8, 14),
                accession=accession, form='13F-HR', total_value=0, positions=0,
            )
            return primary(), table(APPLE)

        documents.side_effect = stored_by_a_concurrent_run

        result = importer.sync_investor(self.investor, date(2021, 10, 5))

        self.assertEqual((result.imported, result.skipped), (0, []))
        self.assertEqual(Filing.objects.count(), 1)
        self.assertFalse(Holding.objects.exists())

    def test_resolution_can_be_deferred_to_the_caller(self, filings, documents, resolve):
        filings.return_value = []
        with patch('investors.importer.resolve_securities') as resolve_securities:
            importer.sync_investor(self.investor, date(2021, 10, 5), resolve=False)
            resolve_securities.assert_not_called()
            importer.sync_investor(self.investor, date(2021, 10, 5))
            resolve_securities.assert_called_once_with()

    def test_a_filing_with_no_table_is_skipped(self, filings, documents, resolve):
        filings.return_value = [NEWEST]
        documents.side_effect = edgar.FilingIncomplete('no table')

        result = importer.sync_investor(self.investor, date(2021, 10, 5))

        self.assertEqual(result.skipped, ['A-2'])

    def test_an_edgar_failure_keeps_filings_already_stored(self, filings, documents, resolve):
        filings.return_value = [NEWEST, OLDER]
        documents.side_effect = [(primary(), table(APPLE)), edgar.EdgarError('503')]

        with self.assertRaises(edgar.EdgarError):
            importer.sync_investor(self.investor, date(2021, 10, 5))

        self.assertEqual(list(Filing.objects.values_list('accession', flat=True)), ['A-2'])
        self.assertEqual(Holding.objects.count(), 1)

    def test_records_when_it_checked_and_the_latest_filing(self, filings, documents, resolve):
        filings.return_value = [NEWEST, OLDER]
        documents.side_effect = [(primary(), table(APPLE)), (primary(), table(ALLY))]

        importer.sync_investor(self.investor, date(2021, 10, 5))

        self.investor.refresh_from_db()
        self.assertEqual(self.investor.last_filing_at, date(2026, 8, 14))
        self.assertIsNotNone(self.investor.last_checked_at)

    def test_every_new_cusip_enters_the_security_cache_unresolved(self, filings, documents, resolve):
        filings.return_value = [NEWEST]
        documents.return_value = (primary(), table(APPLE, ALLY))

        importer.sync_investor(self.investor, date(2021, 10, 5))

        self.assertEqual(set(Security.objects.values_list('cusip', flat=True)), {'037833100', '02005N100'})

    def test_progress_counts_against_the_quarters_listed_while_importing(self, filings, documents, resolve):
        filings.return_value = [NEWEST, OLDER]
        seen = []

        def fetch(cik, accession):
            seen.append(importer.progress(Investor.objects.get(pk=self.investor.pk)))
            return primary(), table(APPLE)

        documents.side_effect = fetch

        importer.sync_investor(self.investor, date(2021, 10, 5), track_progress=True)

        self.assertEqual(seen[0]['quarters_expected'], 2)
        self.assertEqual(seen[0]['quarters_imported'], 0)
        self.assertEqual(seen[1]['quarters_imported'], 1)
        self.investor.refresh_from_db()
        self.assertIsNone(self.investor.quarters_expected)
        self.assertIsNone(importer.progress(self.investor))

    def test_progress_clears_even_when_the_import_fails(self, filings, documents, resolve):
        filings.return_value = [NEWEST]
        documents.side_effect = edgar.EdgarError('503')

        with self.assertRaises(edgar.EdgarError):
            importer.sync_investor(self.investor, date(2021, 10, 5), track_progress=True)

        self.investor.refresh_from_db()
        self.assertIsNone(self.investor.quarters_expected)


class ResolveSecuritiesTest(TestCase):
    @patch('investors.importer.figi.resolve')
    def test_stores_hits_and_counts_misses(self, resolve):
        Security.objects.create(cusip='037833100')
        Security.objects.create(cusip='999999999')
        resolve.return_value = iter([{
            '037833100': {'ticker': 'AAPL', 'name': 'APPLE INC', 'figi': 'BBG000B9XRY4', 'security_type': 'Common Stock'},
            '999999999': None,
        }])

        self.assertEqual(importer.resolve_securities(), 1)

        apple = Security.objects.get(cusip='037833100')
        self.assertEqual((apple.ticker, apple.attempts), ('AAPL', 1))
        self.assertIsNotNone(apple.resolved_at)
        missing = Security.objects.get(cusip='999999999')
        self.assertEqual((missing.ticker, missing.attempts), (None, 1))

    @patch('investors.importer.figi.resolve')
    def test_resolved_and_exhausted_cusips_are_not_looked_up_again(self, resolve):
        Security.objects.create(cusip='037833100', ticker='AAPL')
        Security.objects.create(cusip='888888888', attempts=Security.MAX_ATTEMPTS)
        Security.objects.create(cusip='777777777', attempts=Security.MAX_ATTEMPTS - 1)
        resolve.return_value = iter([])

        importer.resolve_securities()

        self.assertEqual(list(resolve.call_args.args[0]), ['777777777'])

    @patch('investors.importer.figi.resolve')
    def test_an_openfigi_failure_leaves_tickers_pending_without_failing(self, resolve):
        Security.objects.create(cusip='037833100')
        Security.objects.create(cusip='02005N100')

        def batches(cusips):
            yield {'037833100': {'ticker': 'AAPL', 'name': 'APPLE INC', 'figi': 'F', 'security_type': 'Common Stock'}}
            raise figi.FigiError('429')

        resolve.side_effect = batches

        self.assertEqual(importer.resolve_securities(), 1)
        self.assertEqual(Security.objects.get(cusip='037833100').ticker, 'AAPL')
        self.assertEqual(Security.objects.get(cusip='02005N100').attempts, 0)


class HistoryStartTest(TestCase):
    def test_reaches_five_years_back(self):
        self.assertEqual(importer.history_start(date(2026, 10, 5)), date(2021, 10, 5))

    def test_a_leap_day_does_not_crash(self):
        self.assertEqual(importer.history_start(date(2028, 2, 29)), date(2023, 3, 1))


class BackfillTest(TestCase):
    @patch('investors.importer.sync_investor')
    def test_passes_resolve_through(self, sync_investor):
        investor = make_investor()

        importer.backfill(investor, today=date(2026, 10, 5), resolve=False)

        sync_investor.assert_called_once_with(investor, date(2021, 10, 5), track_progress=True, resolve=False)

    @patch('investors.importer.sync_investor')
    def test_backfills_five_years_with_progress(self, sync_investor):
        investor = make_investor()

        importer.backfill(investor, today=date(2026, 10, 5))

        sync_investor.assert_called_once_with(investor, date(2021, 10, 5), track_progress=True, resolve=True)


class SyncRebuildsMovesTest(TestCase):
    ENTRY = {
        'accession': 'A-1', 'form': '13F-HR', 'filed_on': date(2026, 8, 14), 'quarter_end': date(2026, 6, 30),
    }

    def run_sync(self, stored_now):
        investor = make_investor()
        with patch('investors.importer.edgar.filings', return_value=[self.ENTRY]), \
                patch('investors.importer._import_filing', return_value=stored_now), \
                patch('investors.importer.moves.rebuild') as rebuild:
            importer.sync_investor(investor, date(2021, 1, 1), resolve=False)
        return investor, rebuild

    def test_a_stored_filing_rebuilds_that_investors_moves(self):
        investor, rebuild = self.run_sync(True)
        rebuild.assert_called_once_with(investor)

    def test_nothing_new_leaves_the_moves_alone(self):
        _, rebuild = self.run_sync(False)
        rebuild.assert_not_called()

    def test_an_interrupted_import_still_rebuilds_and_re_raises(self):
        investor = make_investor()
        second = {**self.ENTRY, 'accession': 'A-2'}
        with patch('investors.importer.edgar.filings', return_value=[self.ENTRY, second]), \
                patch('investors.importer._import_filing', side_effect=[True, edgar.EdgarError('timeout')]), \
                patch('investors.importer.moves.rebuild') as rebuild:
            with self.assertRaises(edgar.EdgarError):
                importer.sync_investor(investor, date(2021, 1, 1), resolve=False)
        rebuild.assert_called_once_with(investor)

    def test_moves_behind_the_stored_filings_are_rebuilt_even_when_nothing_is_new(self):
        investor = make_investor()
        store_quarter(investor, Q2, [APPLE], rebuild=False)
        with patch('investors.importer.edgar.filings', return_value=[]), \
                patch('investors.importer.moves.rebuild') as rebuild:
            importer.sync_investor(investor, date(2021, 1, 1), resolve=False)
        rebuild.assert_called_once_with(investor)

    def test_moves_that_are_current_are_left_alone(self):
        investor = make_investor()
        store_quarter(investor, Q2, [APPLE])
        with patch('investors.importer.edgar.filings', return_value=[]), \
                patch('investors.importer.moves.rebuild') as rebuild:
            importer.sync_investor(investor, date(2021, 1, 1), resolve=False)
        rebuild.assert_not_called()
