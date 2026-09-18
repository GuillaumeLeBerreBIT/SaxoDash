from unittest.mock import Mock, patch

from django.test import TestCase, override_settings

from .tests import TEST_PRIVATE_KEY_PEM  # the throwaway test keypair defined in the existing client tests
from . import client


@override_settings(
    ENABLE_BANKING_APPLICATION_ID='11111111-1111-1111-1111-111111111111',
    ENABLE_BANKING_PRIVATE_KEY=TEST_PRIVATE_KEY_PEM,
)
class BuildAuthorizeUrlAccessTest(TestCase):
    @patch('enablebanking.client.requests.post')
    def test_requests_balances_and_transactions_access(self, mock_post):
        mock_post.return_value = Mock(ok=True, json=lambda: {'url': 'https://example.com'})
        client.build_authorize_url('kbc', 'state123', 'http://localhost:8000/cb')

        access = mock_post.call_args.kwargs['json']['access']
        self.assertTrue(access['balances'])
        self.assertTrue(access['transactions'])
        self.assertNotIn('accounts', access)

    @patch('enablebanking.client.requests.post')
    def test_iban_adds_a_scoped_accounts_request(self, mock_post):
        mock_post.return_value = Mock(ok=True, json=lambda: {'url': 'https://example.com'})
        client.build_authorize_url('kbc', 'state123', 'http://localhost:8000/cb', iban='BE0012345678')

        access = mock_post.call_args.kwargs['json']['access']
        self.assertEqual(access['accounts'], [{'iban': 'BE0012345678'}])


@override_settings(
    ENABLE_BANKING_APPLICATION_ID='11111111-1111-1111-1111-111111111111',
    ENABLE_BANKING_PRIVATE_KEY=TEST_PRIVATE_KEY_PEM,
)
class GetTransactionsTest(TestCase):
    @patch('enablebanking.client.requests.get')
    def test_sends_date_from_and_strategy(self, mock_get):
        mock_get.return_value = Mock(ok=True, json=lambda: {'transactions': [], 'continuation_key': None})
        client.get_transactions('sess-1', 'acc-1', date_from='2026-01-01', strategy='longest')

        self.assertEqual(mock_get.call_args.kwargs['params'], {'date_from': '2026-01-01', 'strategy': 'longest'})
        self.assertIn('/accounts/acc-1/transactions', mock_get.call_args.args[0])
        self.assertEqual(mock_get.call_args.kwargs['headers']['X-Session-Id'], 'sess-1')

    @patch('enablebanking.client.requests.get')
    def test_propagates_api_errors(self, mock_get):
        mock_get.return_value = Mock(ok=False, status_code=500, text='server error')
        with self.assertRaises(client.EnableBankingAPIError):
            client.get_transactions('sess-1', 'acc-1')


@override_settings(
    ENABLE_BANKING_APPLICATION_ID='11111111-1111-1111-1111-111111111111',
    ENABLE_BANKING_PRIVATE_KEY=TEST_PRIVATE_KEY_PEM,
)
class IterTransactionsTest(TestCase):
    @patch('enablebanking.client.requests.get')
    def test_follows_continuation_key_across_pages(self, mock_get):
        mock_get.side_effect = [
            Mock(ok=True, json=lambda: {'transactions': [{'entry_reference': '1'}], 'continuation_key': 'ck-1'}),
            Mock(ok=True, json=lambda: {'transactions': [{'entry_reference': '2'}], 'continuation_key': None}),
        ]
        results = list(client.iter_transactions('sess-1', 'acc-1', strategy='longest'))

        self.assertEqual([r['entry_reference'] for r in results], ['1', '2'])
        self.assertEqual(mock_get.call_count, 2)
        second_call_params = mock_get.call_args_list[1].kwargs['params']
        self.assertEqual(second_call_params, {'continuation_key': 'ck-1'})

    @patch('enablebanking.client.requests.get')
    def test_single_page_stops_immediately(self, mock_get):
        mock_get.return_value = Mock(ok=True, json=lambda: {'transactions': [{'entry_reference': '1'}], 'continuation_key': None})
        results = list(client.iter_transactions('sess-1', 'acc-1'))
        self.assertEqual(len(results), 1)
        self.assertEqual(mock_get.call_count, 1)
