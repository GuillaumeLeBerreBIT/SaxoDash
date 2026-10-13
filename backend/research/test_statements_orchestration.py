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
        self.assertEqual(result['quarterly'][0]['label'], 'Q1 FY25')

    @patch('research.finnhub.get_earnings_history', return_value=[])
    @patch('research.finnhub.get_recommendation_trends', return_value=[])
    @patch('research.finnhub.get_basic_financials', return_value={'metric': {}})
    @patch('research.finnhub.get_profile', return_value={'name': 'Apple Inc'})
    @patch('research.finnhub.get_financials_reported', side_effect=by_frequency)
    def test_fundamentals_and_statements_share_one_annual_fetch(self, mock_reported, *others):
        finnhub.fundamentals('AAPL')
        statements.statements('AAPL')

        annual_calls = [call for call in mock_reported.call_args_list if call.args[1:] in ((), ('annual',))]
        self.assertEqual(len(annual_calls), 1)

    @patch('research.finnhub.get_financials_reported', side_effect=by_frequency)
    def test_a_second_call_for_the_same_symbol_does_not_refetch(self, mock_reported):
        statements.statements('AAPL')
        statements.statements('AAPL')

        self.assertEqual(mock_reported.call_count, 2)

    @patch('research.finnhub.get_financials_reported', return_value={'data': []})
    def test_no_annual_report_raises_no_statements_and_is_not_cached(self, mock_reported):
        with self.assertRaises(statements.NoStatements):
            statements.statements('ZZZZ')
        with self.assertRaises(statements.NoStatements):
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
        self.assertTrue(result['partial'])

    @patch('research.finnhub.get_financials_reported', side_effect=by_frequency)
    def test_a_full_answer_is_not_partial(self, mock_reported):
        self.assertFalse(statements.statements('AAPL')['partial'])

    @patch('research.finnhub.get_financials_reported')
    def test_an_unreadable_quarterly_payload_degrades_to_annual_only(self, mock_reported):
        mock_reported.side_effect = lambda symbol, freq='annual': ANNUAL if freq == 'annual' else {'data': 'not a list'}

        result = statements.statements('AAPL')

        self.assertTrue(result['available'])
        self.assertEqual(len(result['annual']), 1)
        self.assertEqual(result['quarterly'], [])
        self.assertTrue(result['partial'])

    @patch('research.finnhub.get_financials_reported', return_value={'data': []})
    def test_the_reason_for_no_statements_names_the_cause(self, mock_reported):
        with self.assertRaises(statements.NoStatements) as caught:
            statements.statements('ZZZZ')

        self.assertIn('No annual reports are available for ZZZZ', caught.exception.reason)
        self.assertIn('10-K', caught.exception.reason)

    @patch('research.finnhub.get_financials_reported', return_value={'data': 'not a list'})
    def test_an_unreadable_payload_becomes_finnhub_unexpected(self, mock_reported):
        with self.assertRaises(finnhub.FinnhubUnexpected):
            statements.statements('AAPL')


@override_settings(CACHES=LOCMEM, FINNHUB_API_KEY='test-key')
class StatementsCacheTtlTest(TestCase):
    def setUp(self):
        cache.clear()

    def timeout_stored_for(self, answer):
        with patch('research.finnhub.get_financials_reported', side_effect=answer):
            with patch('research.statements.cache', wraps=cache) as spy:
                statements.statements('AAPL')
        return spy.set.call_args.args[2]

    def test_a_failed_quarterly_call_is_cached_only_briefly(self):
        def answer(symbol, freq='annual'):
            if freq == 'quarterly':
                raise finnhub.FinnhubAPIError('quarterly failed')
            return ANNUAL

        self.assertEqual(self.timeout_stored_for(answer), statements.PARTIAL_TTL)
        self.assertEqual(statements.PARTIAL_TTL, 600)

    def test_an_unreadable_quarterly_payload_is_cached_only_briefly(self):
        def answer(symbol, freq='annual'):
            return ANNUAL if freq == 'annual' else {'data': 'not a list'}

        self.assertEqual(self.timeout_stored_for(answer), statements.PARTIAL_TTL)

    def test_a_complete_answer_is_cached_for_the_full_ttl(self):
        self.assertEqual(self.timeout_stored_for(by_frequency), statements.STATEMENTS_TTL)

    def test_a_successful_empty_quarterly_answer_keeps_the_full_ttl(self):
        def answer(symbol, freq='annual'):
            return ANNUAL if freq == 'annual' else {'data': []}

        self.assertEqual(self.timeout_stored_for(answer), statements.STATEMENTS_TTL)
