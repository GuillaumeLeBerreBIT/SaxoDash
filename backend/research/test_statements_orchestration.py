from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase, override_settings

from . import finnhub, statements
from .test_statements_shaping import filing, rows

LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}

ANNUAL = {'data': [filing(2025, 0, '2025-01-01', '2025-12-31', ic=rows(**{'us-gaap_Revenues': 1000}))]}
QUARTERLY = {'data': [filing(2025, 1, '2025-01-01', '2025-03-31', ic=rows(**{'us-gaap_Revenues': 200}))]}


def by_frequency(symbol, freq='annual'):
    return ANNUAL if freq == 'annual' else QUARTERLY


@override_settings(CACHES=LOCMEM, FINNHUB_API_KEY='test-key')
class StatementsTest(TestCase):
    def setUp(self):
        cache.clear()

    @patch('research.finnhub.get_financials_reported', side_effect=by_frequency)
    def test_returns_annual_and_quarterly_rows(self, mock_reported):
        result = statements.statements('AAPL')

        self.assertTrue(result['available'])
        self.assertEqual(result['annual'][0]['income']['revenue'], 1000)
        self.assertEqual(result['quarterly'][0]['label'], 'Q1 2025')

    @patch('research.finnhub.get_financials_reported', side_effect=by_frequency)
    def test_a_second_call_for_the_same_symbol_does_not_refetch(self, mock_reported):
        statements.statements('AAPL')
        statements.statements('AAPL')

        self.assertEqual(mock_reported.call_count, 2)

    @patch('research.finnhub.get_financials_reported', return_value={'data': []})
    def test_no_annual_report_raises_no_data_and_is_not_cached(self, mock_reported):
        with self.assertRaises(finnhub.FinnhubNoData):
            statements.statements('ZZZZ')
        with self.assertRaises(finnhub.FinnhubNoData):
            statements.statements('ZZZZ')

        self.assertEqual(mock_reported.call_count, 2)

    @patch('research.finnhub.get_financials_reported')
    def test_a_failed_quarterly_call_still_serves_the_annual_rows(self, mock_reported):
        def answer(symbol, freq='annual'):
            if freq == 'quarterly':
                raise finnhub.FinnhubAPIError('quarterly failed')
            return ANNUAL

        mock_reported.side_effect = answer

        result = statements.statements('AAPL')

        self.assertEqual(len(result['annual']), 1)
        self.assertEqual(result['quarterly'], [])

    @patch('research.finnhub.get_financials_reported', return_value={'data': 'not a list'})
    def test_an_unreadable_payload_becomes_finnhub_unexpected(self, mock_reported):
        with self.assertRaises(finnhub.FinnhubUnexpected):
            statements.statements('AAPL')
