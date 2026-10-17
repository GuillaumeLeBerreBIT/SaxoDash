from datetime import date
from pathlib import Path

from django.test import SimpleTestCase

from .parse import parse_report, pdf_text, read_report

TESTDATA = Path(__file__).with_name('testdata')


def report(doc_id):
    return parse_report(pdf_text((TESTDATA / f'{doc_id}.pdf').read_bytes()))


class PelosiOptionsReportTest(SimpleTestCase):
    def setUp(self):
        self.parsed = report('20026590')
        self.rows = self.parsed.rows

    def test_every_row_is_read(self):
        self.assertEqual(len(self.rows), 9)
        self.assertEqual(self.parsed.unparsed_rows, 0)
        self.assertFalse(self.parsed.amended)

    def test_a_call_purchase(self):
        googl = self.rows[0]
        self.assertEqual(
            (googl.owner, googl.ticker, googl.asset_type, googl.kind, googl.option, googl.exercise),
            ('SP', 'GOOGL', 'OP', 'purchase', 'call', False),
        )
        self.assertEqual((googl.traded_on, googl.notified_on), (date(2025, 1, 14), date(2025, 1, 14)))
        self.assertEqual((googl.amount_low, googl.amount_high), (250001, 500000))
        self.assertTrue(googl.priceable)

    def test_a_partial_sale_with_a_wide_range(self):
        apple = self.rows[2]
        self.assertEqual((apple.ticker, apple.asset_type, apple.kind), ('AAPL', 'ST', 'partial_sale'))
        self.assertEqual((apple.amount_low, apple.amount_high), (5000001, 25000000))

    def test_an_exercise_is_a_stock_purchase_flagged_as_exercise(self):
        nvda = self.rows[4]
        self.assertEqual((nvda.ticker, nvda.asset_type, nvda.kind, nvda.exercise), ('NVDA', 'ST', 'purchase', True))

    def test_a_description_split_by_a_page_break_still_reaches_its_row(self):
        nvda_calls = self.rows[5]
        self.assertEqual((nvda_calls.ticker, nvda_calls.option), ('NVDA', 'call'))

    def test_a_wrapped_description_does_not_leak_into_the_next_asset(self):
        panw = self.rows[6]
        self.assertEqual(panw.asset, 'Palo Alto Networks, Inc. (PANW)')
        self.assertTrue(panw.exercise)


class PelosiFundReportTest(SimpleTestCase):
    def test_a_mutual_fund_without_a_ticker_is_stored_but_not_priceable(self):
        rows = report('20030630').rows
        self.assertEqual(len(rows), 2)
        fund = rows[1]
        self.assertEqual((fund.asset, fund.asset_type, fund.ticker, fund.kind), (
            'Matthews International Mutual Fund', 'OT', None, 'sale',
        ))
        self.assertFalse(fund.priceable)


class PelosiLlcReportTest(SimpleTestCase):
    def test_a_spouse_llc_purchase(self):
        rows = report('20035553').rows
        self.assertEqual(len(rows), 1)
        self.assertEqual((rows[0].owner, rows[0].asset, rows[0].asset_type, rows[0].ticker), (
            'SP', 'REOF XXX, LLC', 'AB', None,
        ))
        self.assertEqual((rows[0].amount_low, rows[0].amount_high), (500001, 1000000))


class PageBreakInsideARowTest(SimpleTestCase):
    def test_a_row_cut_by_the_page_header_keeps_both_amount_bounds(self):
        text = pdf_text((TESTDATA / '20030541.pdf').read_bytes())
        parsed = parse_report(text)
        self.assertEqual(len(parsed.rows), text.count('[GS]'))
        self.assertEqual(parsed.unparsed_rows, 0)
        split = [row for row in parsed.rows if row.asset.startswith('New York NY City Transitional Fin') and 'Feb 1, 2032' in row.asset]
        self.assertEqual(len(split), 1)
        self.assertEqual((split[0].owner, split[0].kind, split[0].amount_low, split[0].amount_high), (
            'JT', 'partial_sale', 15001, 50000,
        ))
        self.assertTrue(all(row.asset_type == 'GS' and row.ticker is None for row in parsed.rows))

    def test_the_column_header_repeated_on_the_last_page_stays_out_of_the_last_asset(self):
        rows = parse_report(pdf_text((TESTDATA / '20030541.pdf').read_bytes())).rows
        self.assertEqual(rows[-1].asset, 'Wise CNTY VA Indl Dev Auth Solid Waste 3.80% Due Nov 1, 2040')
        self.assertFalse([row.asset for row in rows if 'Notification' in row.asset or '$200?' in row.asset])


class PelosiReportFromTheOlderGeneratorTest(SimpleTestCase):
    def setUp(self):
        self.parsed = read_report((TESTDATA / '20018011.pdf').read_bytes())

    def test_every_row_is_read(self):
        self.assertEqual(self.parsed.unparsed_rows, 0)
        self.assertEqual([row.ticker for row in self.parsed.rows], ['AB', 'AAPL', 'TSLA', 'DIS'])

    def test_a_ticker_the_font_lowercases_is_read_in_capitals(self):
        apple = self.parsed.rows[1]
        self.assertEqual(apple.asset, 'Apple Inc. (AAPL)')
        self.assertEqual((apple.owner, apple.asset_type, apple.kind, apple.option), ('SP', 'OP', 'purchase', 'call'))
        self.assertEqual((apple.amount_low, apple.amount_high), (250001, 500000))
        self.assertEqual(apple.traded_on, date(2020, 12, 22))

    def test_an_asset_name_wrapped_around_the_amount_is_joined(self):
        alliance = self.parsed.rows[0]
        self.assertEqual(alliance.asset, 'AllianceBernstein Holding l.P. units (AB)')
        self.assertEqual((alliance.amount_low, alliance.amount_high), (500001, 1000000))


class OlderGeneratorMultiPageReportTest(SimpleTestCase):
    def setUp(self):
        self.rows = read_report((TESTDATA / '20017909.pdf').read_bytes()).rows

    def test_every_row_is_read(self):
        self.assertEqual(len(self.rows), 21)

    def test_a_ticker_on_the_line_after_its_type_code_is_still_found(self):
        self.assertIn('MSFT', [row.ticker for row in self.rows])
        self.assertIn('CGNX', [row.ticker for row in self.rows])

    def test_a_lowercased_type_code_is_read(self):
        bond = next(row for row in self.rows if row.asset.startswith('Virginia College'))
        self.assertEqual((bond.asset_type, bond.ticker, bond.priceable), ('GS', None, False))

    def test_the_repeated_column_header_stays_out_of_the_assets(self):
        self.assertFalse([row.asset for row in self.rows if '$200?' in row.asset])


class OlderGeneratorPartialSalesTest(SimpleTestCase):
    def test_capitalised_partial_sales_and_a_lowercase_page_header_are_read(self):
        parsed = read_report((TESTDATA / '20018606.pdf').read_bytes())
        self.assertEqual(parsed.unparsed_rows, 0)
        kinds = [row.kind for row in parsed.rows]
        self.assertIn('partial_sale', kinds)
        self.assertEqual(parsed.rows[kinds.index('partial_sale')].ticker, 'GS')
        self.assertFalse([row.asset for row in parsed.rows if 'owner' in row.asset.lower()])


class ReadReportTest(SimpleTestCase):
    def test_a_report_the_plain_text_reads_does_not_need_the_layout(self):
        self.assertEqual(len(read_report((TESTDATA / '20026590.pdf').read_bytes()).rows), 9)


class AmendedReportTest(SimpleTestCase):
    def test_an_amended_status_line_marks_the_report(self):
        text = pdf_text((TESTDATA / '20035553.pdf').read_bytes()).replace(': New', ': Amended')
        self.assertTrue(parse_report(text).amended)


HEADER = 'Name: Hon. Test\n$200?\n'
FOOTER = '* For the complete list of asset type abbreviations\n'


def inline(*rows):
    return HEADER + ''.join(rows) + FOOTER


OPTION_ROW = (
    'Alphabet Inc. (GOOGL) [OP] P 01/14/2025 01/14/2025 $1,001 - $15,000\n'
    'F S : New\n'
    'D          : Bought shares on the open market\n'
)


class DescriptionWithoutFinalStopTest(SimpleTestCase):
    def test_a_self_owned_row_after_it_still_parses(self):
        tesla = 'Tesla, Inc. (TSLA) [ST]\nP 01/15/2025 01/15/2025 $1,001 - $15,000\nF S : New\n'
        parsed = parse_report(inline(OPTION_ROW, tesla))
        self.assertEqual(parsed.unparsed_rows, 0)
        self.assertEqual([row.ticker for row in parsed.rows], ['GOOGL', 'TSLA'])
        self.assertEqual((parsed.rows[0].option, parsed.rows[0].exercise), ('call', False))

    def test_an_owner_prefixed_row_after_it_still_parses(self):
        tesla = 'SP Tesla, Inc. (TSLA) [ST] P 01/15/2025 01/15/2025 $1,001 - $15,000\nF S : New\n'
        parsed = parse_report(inline(OPTION_ROW, tesla))
        self.assertEqual(parsed.unparsed_rows, 0)
        self.assertEqual([(row.owner, row.ticker) for row in parsed.rows], [('self', 'GOOGL'), ('SP', 'TSLA')])

    def test_a_genuine_continuation_is_attached_to_its_row(self):
        row = (
            'Alphabet Inc. (GOOGL) [OP] P 01/14/2025 01/14/2025 $1,001 - $15,000\n'
            'F S : New\n'
            'D          : Exercised put options with an expiration date\n'
            'of 12/20/24.\n'
        )
        parsed = parse_report(inline(row))
        self.assertEqual(parsed.unparsed_rows, 0)
        self.assertTrue(parsed.rows[0].exercise)
        self.assertEqual(parsed.rows[0].option, 'put')


class RowHardeningTest(SimpleTestCase):
    def test_put_is_matched_as_a_word(self):
        row = (
            'Alphabet Inc. (GOOGL) [OP] P 01/14/2025 01/14/2025 $1,001 - $15,000\n'
            'F S : New\n'
            'D          : Purchased on a computer input.\n'
        )
        self.assertEqual(parse_report(inline(row)).rows[0].option, 'call')

    def test_an_impossible_date_costs_one_row_not_the_report(self):
        bad = 'Alphabet Inc. (GOOGL) [ST] P 02/30/2025 02/30/2025 $1,001 - $15,000\nF S : New\n'
        good = 'Tesla, Inc. (TSLA) [ST] P 01/15/2025 01/15/2025 $1,001 - $15,000\nF S : New\n'
        parsed = parse_report(inline(bad, good))
        self.assertEqual(parsed.unparsed_rows, 1)
        self.assertEqual([row.ticker for row in parsed.rows], ['TSLA'])


class AssetNameWithColonTest(SimpleTestCase):
    def test_an_asset_name_with_a_colon_is_a_trade_not_a_label(self):
        text = (
            'Periodic Transaction Report\n$200?\n'
            'SP Apple Inc. (AAPL) [ST] P 01/02/2024 01/05/2024 $1,001 - $15,000\n'
            'F      S     : New\n'
            'Vanguard Index Funds: S&P 500 ETF (VOO) [ST] P 01/03/2024 01/06/2024 $1,001 - $15,000\n'
            'F      S     : New\n'
            'D          : Bought in two fills.\n'
        )
        rows = parse_report(text).rows
        self.assertEqual([row.ticker for row in rows], ['AAPL', 'VOO'])
        self.assertEqual(rows[1].asset, 'Vanguard Index Funds: S&P 500 ETF (VOO)')
