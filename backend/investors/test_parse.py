from datetime import date
from pathlib import Path

from django.test import SimpleTestCase

from . import parse

TESTDATA = Path(__file__).resolve().parent / 'testdata'
DOLLARS_ERA = date(2026, 8, 14)


def fixture(name):
    return (TESTDATA / name).read_bytes()


def by_key(rows):
    return {(row['cusip'], row['put_call']): row for row in rows}


class ParseInformationTableTest(SimpleTestCase):
    def test_reads_every_berkshire_row(self):
        rows = parse.parse_information_table(fixture('berkshire-2026q2.xml'), DOLLARS_ERA)
        self.assertEqual(len(rows), 89)

    def test_aggregates_berkshire_per_cusip_and_keeps_the_filed_total(self):
        rows = parse.aggregate(parse.parse_information_table(fixture('berkshire-2026q2.xml'), DOLLARS_ERA))

        self.assertEqual(len(rows), 29)
        self.assertEqual(sum(row['value'] for row in rows), 299253556246)
        apple = by_key(rows)[('037833100', '')]
        self.assertEqual((apple['shares'], apple['value']), (227917808, 65950296923))
        self.assertEqual(apple['issuer'], 'APPLE INC')

    def test_a_row_carries_exactly_the_holding_fields(self):
        row = parse.parse_information_table(fixture('thousands-2022q3.xml'), DOLLARS_ERA)[0]
        self.assertEqual(
            row,
            {
                'cusip': '037833100', 'issuer': 'APPLE INC', 'title_of_class': 'COM',
                'shares': 10000, 'amount_type': 'SH', 'value': 1234, 'put_call': '', 'discretion': 'SOLE',
            },
        )

    def test_a_filing_made_before_2023_is_in_thousands(self):
        row = parse.parse_information_table(fixture('thousands-2022q3.xml'), date(2022, 11, 14))[0]
        self.assertEqual(row['value'], 1234000)

    def test_a_q4_2022_report_filed_in_2023_is_already_dollars(self):
        row = parse.parse_information_table(fixture('thousands-2022q3.xml'), date(2023, 2, 14))[0]
        self.assertEqual(row['value'], 1234)

    def test_a_prefixed_namespace_parses_and_the_cusip_is_uppercased(self):
        row = parse.parse_information_table(fixture('prefixed-namespace.xml'), DOLLARS_ERA)[0]
        self.assertEqual((row['cusip'], row['shares'], row['value']), ('02005N100', 27000000, 1240650000))

    def test_a_call_stays_apart_from_the_stock_and_managers_are_summed(self):
        rows = by_key(parse.aggregate(parse.parse_information_table(fixture('options.xml'), DOLLARS_ERA)))

        self.assertEqual(set(rows), {('67066G104', ''), ('67066G104', 'CALL')})
        self.assertEqual((rows[('67066G104', '')]['shares'], rows[('67066G104', '')]['value']), (15, 1500))
        self.assertEqual(rows[('67066G104', 'CALL')]['value'], 300)

    def test_malformed_xml_is_unreadable(self):
        with self.assertRaises(parse.FilingUnreadable):
            parse.parse_information_table(b'<informationTable><infoTable>', DOLLARS_ERA)

    def test_a_row_without_a_cusip_is_unreadable(self):
        xml = b'<informationTable><infoTable><nameOfIssuer>X</nameOfIssuer><value>1</value></infoTable></informationTable>'
        with self.assertRaises(parse.FilingUnreadable):
            parse.parse_information_table(xml, DOLLARS_ERA)

    def test_a_non_numeric_value_is_unreadable(self):
        xml = fixture('thousands-2022q3.xml').replace(b'<value>1234</value>', b'<value>n/a</value>')
        with self.assertRaises(parse.FilingUnreadable):
            parse.parse_information_table(xml, DOLLARS_ERA)


PRIMARY = (
    '<edgarSubmission xmlns="http://www.sec.gov/edgar/thirteenffiler">'
    '<formData><coverPage>{}</coverPage></formData></edgarSubmission>'
)


class ParseAmendmentTypeTest(SimpleTestCase):
    def test_an_original_filing_has_no_amendment_type(self):
        self.assertEqual(parse.parse_amendment_type(PRIMARY.format('')), '')

    def test_reads_a_restatement(self):
        info = '<amendmentInfo><amendmentType>RESTATEMENT</amendmentType></amendmentInfo>'
        self.assertEqual(parse.parse_amendment_type(PRIMARY.format(info)), 'RESTATEMENT')

    def test_reads_new_holdings_case_insensitively(self):
        info = '<amendmentInfo><amendmentType>New Holdings</amendmentType></amendmentInfo>'
        self.assertEqual(parse.parse_amendment_type(PRIMARY.format(info)), 'NEW HOLDINGS')

    def test_an_unknown_type_reads_as_original(self):
        info = '<amendmentInfo><amendmentType>OTHER</amendmentType></amendmentInfo>'
        self.assertEqual(parse.parse_amendment_type(PRIMARY.format(info)), '')

    def test_malformed_primary_document_is_unreadable(self):
        with self.assertRaises(parse.FilingUnreadable):
            parse.parse_amendment_type('<edgarSubmission>')
