from datetime import timedelta
from unittest.mock import Mock, patch

import requests
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from django.test import TestCase, override_settings
from django.utils import timezone
from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import BankAccount

from .models import EnableBankingCredential, BankSyncRun
from . import checks as eb_checks
from . import client, credentials, mapping, tasks

SAMPLE_ACCOUNT = {'uid': 'acc-1', 'account_id': {'iban': 'BE68539007547034'}, 'product': 'Current account'}
SAMPLE_BALANCES = {
    'balances': [
        {'balance_amount': {'currency': 'EUR', 'amount': '1234.56'}, 'balance_type': 'CLBD'},
        {'balance_amount': {'currency': 'EUR', 'amount': '1200.00'}, 'balance_type': 'ITAV'},
    ]
}

# A throwaway 2048-bit keypair generated once for tests - never a real
# Enable Banking private key. Real RS256 signing needs a real RSA key, not
# an arbitrary string, so this is the smallest fixture that exercises it.
_TEST_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
TEST_PRIVATE_KEY_PEM = _TEST_KEY.private_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PrivateFormat.TraditionalOpenSSL,
    encryption_algorithm=serialization.NoEncryption(),
).decode()


class EnableBankingCredentialModelTest(TestCase):
    def test_defaults(self):
        cred = EnableBankingCredential.objects.create(
            bank='kbc', session_id='s1', valid_until=timezone.now(),
        )
        self.assertEqual(cred.linked_accounts, [])
        self.assertFalse(cred.needs_reauth)

    def test_bank_is_unique(self):
        EnableBankingCredential.objects.create(
            bank='kbc', session_id='s1', valid_until=timezone.now(),
        )
        with self.assertRaises(Exception):
            EnableBankingCredential.objects.create(
                bank='kbc', session_id='s2', valid_until=timezone.now(),
            )


class BankSyncRunModelTest(TestCase):
    def test_defaults(self):
        run = BankSyncRun.objects.create(bank='argenta', outcome='ok')
        self.assertEqual(run.rows, 0)
        self.assertEqual(run.detail, '')


class ConnectionStateTest(TestCase):
    def test_not_connected_when_no_row_exists(self):
        state = credentials.connection_state('kbc')
        self.assertFalse(state.connected)
        self.assertFalse(state.needs_reauth)
        self.assertEqual(state.reason, 'KBC is not connected.')

    def test_needs_reauth_when_flagged(self):
        EnableBankingCredential.objects.create(
            bank='kbc', session_id='s', valid_until=timezone.now() + timedelta(days=90),
            needs_reauth=True,
        )
        state = credentials.connection_state('kbc')
        self.assertTrue(state.connected)
        self.assertTrue(state.needs_reauth)
        self.assertFalse(state.usable)

    def test_needs_reauth_when_consent_expired(self):
        EnableBankingCredential.objects.create(
            bank='argenta', session_id='s', valid_until=timezone.now() - timedelta(days=1),
        )
        state = credentials.connection_state('argenta')
        self.assertTrue(state.needs_reauth)
        self.assertEqual(state.reason, 'Argenta consent has expired.')

    def test_usable_when_connected_and_fresh(self):
        EnableBankingCredential.objects.create(
            bank='kbc', session_id='s', valid_until=timezone.now() + timedelta(days=90),
        )
        state = credentials.connection_state('kbc')
        self.assertTrue(state.usable)
        self.assertIsNone(state.reason)

    def test_active_credential_raises_when_not_usable(self):
        with self.assertRaises(credentials.EnableBankingNotConnected):
            credentials.active_credential('kbc')

    def test_active_credential_returns_the_row_when_usable(self):
        cred = EnableBankingCredential.objects.create(
            bank='kbc', session_id='s', valid_until=timezone.now() + timedelta(days=90),
        )
        self.assertEqual(credentials.active_credential('kbc'), cred)

    def test_last_successful_sync_is_scoped_to_its_own_bank(self):
        BankSyncRun.objects.create(bank='kbc', outcome='ok', rows=2)
        BankSyncRun.objects.create(bank='argenta', outcome='failed')
        self.assertEqual(credentials.last_successful_sync('kbc').rows, 2)
        self.assertIsNone(credentials.last_successful_sync('argenta'))


class WorstRecentOutcomePerBankTest(TestCase):
    """Mirrors saxo.credentials.worst_recent_outcome/latest_run_per_task -
    same reasoning, scoped per bank via BankSyncRun.kind instead of task
    name. See docs/superpowers/plans/2026-09-23-phase-a-data-trust-reliability.md."""

    def test_none_when_nothing_has_run(self):
        self.assertIsNone(credentials.worst_recent_outcome('kbc'))

    def test_ok_when_the_latest_run_per_kind_succeeded(self):
        BankSyncRun.objects.create(bank='kbc', kind='balances', outcome='ok')
        BankSyncRun.objects.create(bank='kbc', kind='transactions', outcome='ok')
        self.assertEqual(credentials.worst_recent_outcome('kbc'), 'ok')

    def test_failed_beats_ok_even_if_it_ran_earlier(self):
        BankSyncRun.objects.create(bank='kbc', kind='transactions', outcome='ok')
        BankSyncRun.objects.create(bank='kbc', kind='balances', outcome='failed')
        self.assertEqual(credentials.worst_recent_outcome('kbc'), 'failed')

    def test_scoped_to_one_bank(self):
        BankSyncRun.objects.create(bank='kbc', kind='balances', outcome='ok')
        BankSyncRun.objects.create(bank='argenta', kind='balances', outcome='failed')
        self.assertEqual(credentials.worst_recent_outcome('kbc'), 'ok')
        self.assertEqual(credentials.worst_recent_outcome('argenta'), 'failed')


@override_settings(
    ENABLE_BANKING_APPLICATION_ID='11111111-1111-1111-1111-111111111111',
    ENABLE_BANKING_PRIVATE_KEY=TEST_PRIVATE_KEY_PEM,
)
class EnableBankingClientTest(TestCase):
    @patch('enablebanking.client.requests.post')
    def test_build_authorize_url_returns_the_redirect_url(self, mock_post):
        mock_post.return_value = Mock(
            ok=True, json=lambda: {'url': 'https://auth.enablebanking.com/ais/start?sessionid=abc'},
        )
        url = client.build_authorize_url('kbc', 'state123', 'http://localhost:8000/cb')
        self.assertEqual(url, 'https://auth.enablebanking.com/ais/start?sessionid=abc')

        sent_body = mock_post.call_args.kwargs['json']
        self.assertEqual(sent_body['aspsp'], client.ASPSPS['kbc'])
        self.assertEqual(sent_body['state'], 'state123')
        self.assertEqual(sent_body['psu_type'], 'personal')

    @patch('enablebanking.client.requests.post')
    def test_build_authorize_url_signs_a_valid_jwt(self, mock_post):
        mock_post.return_value = Mock(ok=True, json=lambda: {'url': 'https://example.com'})
        client.build_authorize_url('argenta', 'state123', 'http://localhost:8000/cb')

        auth_header = mock_post.call_args.kwargs['headers']['Authorization']
        self.assertTrue(auth_header.startswith('Bearer '))

    @patch('enablebanking.client.requests.post')
    def test_build_authorize_url_raises_on_failure(self, mock_post):
        mock_post.return_value = Mock(ok=False, status_code=400, text='bad request')
        with self.assertRaises(client.EnableBankingAPIError):
            client.build_authorize_url('kbc', 'state123', 'http://localhost:8000/cb')

    @patch('enablebanking.client.requests.post')
    def test_exchange_code_for_session_returns_session_and_accounts(self, mock_post):
        mock_post.return_value = Mock(ok=True, json=lambda: {
            'session_id': 'sess-1',
            'accounts': [{'uid': 'acc-1', 'account_id': {'iban': 'BE00'}}],
        })
        result = client.exchange_code_for_session('the-code')
        self.assertEqual(result['session_id'], 'sess-1')
        self.assertEqual(mock_post.call_args.kwargs['json'], {'code': 'the-code'})

    @patch('enablebanking.client.requests.get')
    def test_get_balances_returns_the_balances_list(self, mock_get):
        mock_get.return_value = Mock(ok=True, json=lambda: {'balances': [{'balance_type': 'CLBD'}]})
        result = client.get_balances('sess-1', 'acc-1')
        self.assertEqual(result['balances'][0]['balance_type'], 'CLBD')
        self.assertIn('/accounts/acc-1/balances', mock_get.call_args.args[0])
        self.assertEqual(mock_get.call_args.kwargs['headers']['X-Session-Id'], 'sess-1')

    @patch('enablebanking.client.requests.get')
    def test_get_propagates_api_errors(self, mock_get):
        mock_get.return_value = Mock(ok=False, status_code=500, text='server error')
        with self.assertRaises(client.EnableBankingAPIError):
            client.get_balances('sess-1', 'acc-1')


class EnableBankingAPIErrorClassificationTest(TestCase):
    """Only network failures, timeouts, 429, and 5xx should be retried by
    Celery - a 4xx means the request itself is wrong (or the session needs
    re-auth) and retrying immediately cannot help. See
    docs/superpowers/plans/2026-09-23-phase-a-data-trust-reliability.md."""

    @patch('enablebanking.client.requests.get')
    def test_a_500_response_is_transient(self, mock_get):
        mock_get.return_value = Mock(ok=False, status_code=500, text='Internal error')
        with self.assertRaises(client.EnableBankingTransientError):
            client.get_balances('sess-1', 'acc-1')

    @patch('enablebanking.client.requests.get')
    def test_a_429_response_is_transient(self, mock_get):
        mock_get.return_value = Mock(ok=False, status_code=429, text='Rate limited')
        with self.assertRaises(client.EnableBankingTransientError):
            client.get_balances('sess-1', 'acc-1')

    @patch('enablebanking.client.requests.get')
    def test_a_400_response_is_permanent(self, mock_get):
        mock_get.return_value = Mock(ok=False, status_code=400, text='Bad request')
        with self.assertRaises(client.EnableBankingPermanentError):
            client.get_balances('sess-1', 'acc-1')

    @patch('enablebanking.client.requests.get', side_effect=requests.ConnectionError('refused'))
    def test_a_network_error_is_transient(self, mock_get):
        with self.assertRaises(client.EnableBankingTransientError):
            client.get_balances('sess-1', 'acc-1')

    def test_both_are_still_enablebanking_api_errors(self):
        self.assertTrue(issubclass(client.EnableBankingTransientError, client.EnableBankingAPIError))
        self.assertTrue(issubclass(client.EnableBankingPermanentError, client.EnableBankingAPIError))


class ToAccountFieldsTest(TestCase):
    def test_maps_core_fields(self):
        fields = mapping.to_account_fields('kbc', SAMPLE_ACCOUNT, SAMPLE_BALANCES)
        self.assertEqual(fields['bank'], 'KBC')
        self.assertEqual(fields['type'], 'Current account')
        self.assertEqual(fields['currency'], 'EUR')

    def test_masks_the_iban(self):
        fields = mapping.to_account_fields('kbc', SAMPLE_ACCOUNT, SAMPLE_BALANCES)
        self.assertEqual(fields['iban_masked'], 'BE68 •••• •••• 7034')

    def test_prefers_booked_balance_over_available(self):
        fields = mapping.to_account_fields('kbc', SAMPLE_ACCOUNT, SAMPLE_BALANCES)
        self.assertEqual(fields['balance'], Decimal('1234.56'))
        self.assertEqual(fields['available'], Decimal('1200.00'))

    def test_falls_back_to_whatever_balance_type_exists(self):
        balances = {'balances': [{'balance_amount': {'currency': 'EUR', 'amount': '50.00'}, 'balance_type': 'XPCD'}]}
        fields = mapping.to_account_fields('argenta', SAMPLE_ACCOUNT, balances)
        self.assertEqual(fields['balance'], Decimal('50.00'))
        self.assertEqual(fields['available'], Decimal('50.00'))
        self.assertEqual(fields['bank'], 'Argenta')

    def test_zero_when_no_balances_sent(self):
        fields = mapping.to_account_fields('kbc', SAMPLE_ACCOUNT, {'balances': []})
        self.assertEqual(fields['balance'], Decimal('0'))


LINKED_ACCOUNT = {'uid': 'acc-1', 'account_id': {'iban': 'BE68539007547034'}, 'product': 'Current account'}
BALANCES = {'balances': [{'balance_amount': {'currency': 'EUR', 'amount': '100.00'}, 'balance_type': 'CLBD'}]}


class SyncEnableBankingBalancesTaskTest(TestCase):
    def test_skips_a_bank_with_no_credential(self):
        tasks.sync_enablebanking_balances()
        run = BankSyncRun.objects.get(bank='kbc')
        self.assertEqual(run.outcome, 'skipped')
        self.assertEqual(BankAccount.objects.count(), 0)

    @patch('enablebanking.tasks.client.get_balances')
    def test_syncs_a_connected_banks_linked_accounts(self, mock_get_balances):
        mock_get_balances.return_value = BALANCES
        EnableBankingCredential.objects.create(
            bank='kbc', session_id='s', valid_until=timezone.now() + timedelta(days=90),
            linked_accounts=[LINKED_ACCOUNT],
        )
        tasks.sync_enablebanking_balances()

        account = BankAccount.objects.get(external_id='enablebanking:kbc:acc-1')
        self.assertEqual(account.bank, 'KBC')
        self.assertEqual(account.balance, Decimal('100.00'))
        run = BankSyncRun.objects.get(bank='kbc')
        self.assertEqual(run.outcome, 'ok')
        self.assertEqual(run.rows, 1)

    @patch('enablebanking.tasks.client.get_balances')
    def test_upserts_on_repeated_sync(self, mock_get_balances):
        mock_get_balances.return_value = BALANCES
        EnableBankingCredential.objects.create(
            bank='kbc', session_id='s', valid_until=timezone.now() + timedelta(days=90),
            linked_accounts=[LINKED_ACCOUNT],
        )
        tasks.sync_enablebanking_balances()
        tasks.sync_enablebanking_balances()
        self.assertEqual(BankAccount.objects.filter(external_id='enablebanking:kbc:acc-1').count(), 1)

    def test_flags_needs_reauth_when_consent_has_expired(self):
        EnableBankingCredential.objects.create(
            bank='argenta', session_id='s', valid_until=timezone.now() - timedelta(days=1),
            linked_accounts=[LINKED_ACCOUNT],
        )
        tasks.sync_enablebanking_balances()

        cred = EnableBankingCredential.objects.get(bank='argenta')
        self.assertTrue(cred.needs_reauth)
        run = BankSyncRun.objects.get(bank='argenta')
        self.assertEqual(run.outcome, 'skipped')

    @patch('enablebanking.tasks.client.get_balances')
    def test_one_banks_api_error_does_not_abort_the_other(self, mock_get_balances):
        mock_get_balances.side_effect = tasks.client.EnableBankingAPIError('boom')
        EnableBankingCredential.objects.create(
            bank='kbc', session_id='s', valid_until=timezone.now() + timedelta(days=90),
            linked_accounts=[LINKED_ACCOUNT],
        )
        EnableBankingCredential.objects.create(
            bank='argenta', session_id='s', valid_until=timezone.now() + timedelta(days=90),
            linked_accounts=[],
        )
        tasks.sync_enablebanking_balances()

        # KBC's only linked account failed - a real outage for KBC, not
        # 'nothing new since last sync' (see the two tests below).
        self.assertEqual(BankSyncRun.objects.get(bank='kbc').outcome, 'failed')
        self.assertEqual(BankSyncRun.objects.get(bank='kbc').rows, 0)
        self.assertEqual(BankSyncRun.objects.get(bank='argenta').outcome, 'ok')

    @patch('enablebanking.tasks.client.get_balances')
    def test_a_transient_total_outage_is_recorded_then_retried(self, mock_get_balances):
        mock_get_balances.side_effect = client.EnableBankingTransientError('503')
        EnableBankingCredential.objects.create(
            bank='kbc', session_id='s', valid_until=timezone.now() + timedelta(days=90),
            linked_accounts=[LINKED_ACCOUNT],
        )
        with self.assertRaises(client.EnableBankingTransientError):
            tasks.sync_enablebanking_balances()
        self.assertEqual(BankSyncRun.objects.get(bank='kbc').outcome, 'failed')

    @patch('enablebanking.tasks.client.get_balances')
    def test_a_permanent_total_outage_is_recorded_but_not_retried(self, mock_get_balances):
        mock_get_balances.side_effect = client.EnableBankingPermanentError('401')
        EnableBankingCredential.objects.create(
            bank='kbc', session_id='s', valid_until=timezone.now() + timedelta(days=90),
            linked_accounts=[LINKED_ACCOUNT],
        )
        tasks.sync_enablebanking_balances()
        self.assertEqual(BankSyncRun.objects.get(bank='kbc').outcome, 'failed')

    @patch('enablebanking.tasks.client.get_balances')
    def test_a_partial_transient_failure_is_not_retried(self, mock_get_balances):
        mock_get_balances.side_effect = [
            client.EnableBankingTransientError('503'), {'balances': []},
        ]
        EnableBankingCredential.objects.create(
            bank='kbc', session_id='s', valid_until=timezone.now() + timedelta(days=90),
            linked_accounts=[LINKED_ACCOUNT, {**LINKED_ACCOUNT, 'uid': 'acc-2'}],
        )
        with patch('enablebanking.tasks.mapping.to_account_fields', return_value={
            'bank': 'KBC', 'type': 'Checking', 'iban_masked': '-',
            'balance': Decimal('1'), 'available': Decimal('1'),
        }):
            tasks.sync_enablebanking_balances()
        self.assertEqual(BankSyncRun.objects.get(bank='kbc').outcome, 'ok')

    @patch('enablebanking.tasks.client.get_balances')
    def test_every_account_failing_is_recorded_as_failed_not_ok(self, mock_get_balances):
        # A total outage must not look like an ordinary quiet sync
        # (outcome='ok', rows=0) - that gap is exactly how the real
        # multi-day Saxo re-auth lapse went unnoticed.
        mock_get_balances.side_effect = tasks.client.EnableBankingAPIError('down')
        EnableBankingCredential.objects.create(
            bank='kbc', session_id='s', valid_until=timezone.now() + timedelta(days=90),
            linked_accounts=[LINKED_ACCOUNT, {**LINKED_ACCOUNT, 'uid': 'acc-2'}],
        )
        tasks.sync_enablebanking_balances()

        run = BankSyncRun.objects.get(bank='kbc')
        self.assertEqual(run.outcome, 'failed')
        self.assertEqual(run.rows, 0)
        self.assertIn('down', run.detail)

    @patch('enablebanking.tasks.mapping.to_account_fields')
    @patch('enablebanking.tasks.client.get_balances')
    def test_one_of_two_accounts_failing_is_still_ok_with_a_note(
        self, mock_get_balances, mock_to_fields
    ):
        mock_get_balances.side_effect = [tasks.client.EnableBankingAPIError('down'), BALANCES]
        mock_to_fields.return_value = {
            'bank': 'KBC', 'type': 'Current account', 'iban_masked': '-',
            'balance': Decimal('100.00'), 'available': Decimal('100.00'), 'currency': 'EUR',
        }
        EnableBankingCredential.objects.create(
            bank='kbc', session_id='s', valid_until=timezone.now() + timedelta(days=90),
            linked_accounts=[LINKED_ACCOUNT, {**LINKED_ACCOUNT, 'uid': 'acc-2'}],
        )
        tasks.sync_enablebanking_balances()

        run = BankSyncRun.objects.get(bank='kbc')
        self.assertEqual(run.outcome, 'ok')
        self.assertEqual(run.rows, 1)
        self.assertIn('1 account(s) failed', run.detail)


class EnableBankingConnectTicketViewTest(APITestCase):
    def setUp(self):
        user = User.objects.create_user(username='u', password='p')
        token = RefreshToken.for_user(user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_requires_authentication(self):
        self.client.credentials()
        response = self.client.post('/api/enablebanking/connect-ticket/')
        self.assertEqual(response.status_code, 401)

    def test_issues_a_ticket(self):
        response = self.client.post('/api/enablebanking/connect-ticket/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('ticket', response.data)


class EnableBankingConnectViewTest(APITestCase):
    def _ticket(self):
        user = User.objects.create_user(username='u2', password='p')
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(user).access_token}')
        return self.client.post('/api/enablebanking/connect-ticket/').data['ticket']

    def test_rejects_a_missing_ticket(self):
        response = self.client.get('/api/enablebanking/connect/kbc/')
        self.assertEqual(response.status_code, 403)

    def test_rejects_an_unknown_bank(self):
        ticket = self._ticket()
        response = self.client.get(f'/api/enablebanking/connect/notabank/?ticket={ticket}')
        self.assertEqual(response.status_code, 404)

    @patch('enablebanking.views.client.build_authorize_url')
    def test_redirects_to_the_authorize_url(self, mock_build_url):
        mock_build_url.return_value = 'https://auth.enablebanking.com/ais/start?x=1'
        ticket = self._ticket()
        response = self.client.get(f'/api/enablebanking/connect/kbc/?ticket={ticket}')
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, 'https://auth.enablebanking.com/ais/start?x=1')

    @patch('enablebanking.views.client.build_authorize_url')
    def test_passes_an_optional_iban_through_to_the_client(self, mock_build_url):
        mock_build_url.return_value = 'https://auth.enablebanking.com/ais/start?x=1'
        ticket = self._ticket()
        self.client.get(f'/api/enablebanking/connect/kbc/?ticket={ticket}&iban=BE0012345678')

        self.assertEqual(mock_build_url.call_args.kwargs.get('iban'), 'BE0012345678')

    @patch('enablebanking.views.client.build_authorize_url')
    def test_iban_is_optional(self, mock_build_url):
        mock_build_url.return_value = 'https://auth.enablebanking.com/ais/start?x=1'
        ticket = self._ticket()
        self.client.get(f'/api/enablebanking/connect/kbc/?ticket={ticket}')

        self.assertIsNone(mock_build_url.call_args.kwargs.get('iban'))


class EnableBankingCallbackViewTest(APITestCase):
    def test_missing_code_or_state_redirects_with_error(self):
        response = self.client.get('/api/enablebanking/callback/')
        self.assertEqual(response.status_code, 302)
        self.assertIn('enablebanking=error', response.url)

    @patch('enablebanking.views.client.exchange_code_for_session')
    def test_valid_callback_creates_the_credential(self, mock_exchange):
        mock_exchange.return_value = {
            'session_id': 'sess-1',
            'accounts': [{'uid': 'acc-1', 'account_id': {'iban': 'BE00'}}],
        }
        session = self.client.session
        session['enablebanking_oauth_state'] = 'state123:kbc'
        session.save()

        response = self.client.get('/api/enablebanking/callback/?code=abc&state=state123:kbc')

        self.assertEqual(response.status_code, 302)
        self.assertIn('enablebanking=connected', response.url)
        self.assertIn('bank=kbc', response.url)
        cred = EnableBankingCredential.objects.get(bank='kbc')
        self.assertEqual(cred.linked_accounts, [{'uid': 'acc-1', 'account_id': {'iban': 'BE00'}}])

    @patch('enablebanking.views.client.exchange_code_for_session')
    def test_failed_exchange_names_which_bank_failed(self, mock_exchange):
        mock_exchange.side_effect = client.EnableBankingAPIError('boom')
        session = self.client.session
        session['enablebanking_oauth_state'] = 'state123:argenta'
        session.save()

        response = self.client.get('/api/enablebanking/callback/?code=abc&state=state123:argenta')

        self.assertEqual(response.status_code, 302)
        self.assertIn('enablebanking=error', response.url)
        self.assertIn('bank=argenta', response.url)


class EnableBankingStatusViewTest(APITestCase):
    def setUp(self):
        user = User.objects.create_user(username='u3', password='p')
        token = RefreshToken.for_user(user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_reports_both_banks_independently(self):
        EnableBankingCredential.objects.create(
            bank='kbc', session_id='s', valid_until=timezone.now() + timedelta(days=90),
        )
        response = self.client.get('/api/enablebanking/status/')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['kbc']['connected'])
        self.assertFalse(response.data['argenta']['connected'])

    def test_includes_last_sync_outcome_and_failing_kinds(self):
        EnableBankingCredential.objects.create(
            bank='kbc', session_id='s', valid_until=timezone.now() + timedelta(days=90),
        )
        BankSyncRun.objects.create(bank='kbc', kind='balances', outcome='failed', detail='down')

        response = self.client.get('/api/enablebanking/status/')

        self.assertEqual(response.data['kbc']['last_sync_outcome'], 'failed')
        self.assertEqual(response.data['kbc']['failing_syncs'], ['balances'])

    def test_a_healthy_bank_reports_no_failing_syncs(self):
        EnableBankingCredential.objects.create(
            bank='kbc', session_id='s', valid_until=timezone.now() + timedelta(days=90),
        )
        BankSyncRun.objects.create(bank='kbc', kind='balances', outcome='ok')
        BankSyncRun.objects.create(bank='kbc', kind='transactions', outcome='ok')

        response = self.client.get('/api/enablebanking/status/')

        self.assertEqual(response.data['kbc']['last_sync_outcome'], 'ok')
        self.assertEqual(response.data['kbc']['failing_syncs'], [])


class EnableBankingChecksTest(TestCase):
    @override_settings(ENABLE_BANKING_APPLICATION_ID='', ENABLE_BANKING_PRIVATE_KEY='some-key')
    def test_errors_when_application_id_missing(self):
        errors = eb_checks.check_config(None)
        self.assertTrue(any(e.id == 'enablebanking.E001' for e in errors))

    @override_settings(ENABLE_BANKING_APPLICATION_ID='app-id', ENABLE_BANKING_PRIVATE_KEY='')
    def test_errors_when_private_key_missing(self):
        errors = eb_checks.check_config(None)
        self.assertTrue(any(e.id == 'enablebanking.E002' for e in errors))

    @override_settings(ENABLE_BANKING_APPLICATION_ID='app-id', ENABLE_BANKING_PRIVATE_KEY='some-key')
    def test_no_errors_when_both_are_set(self):
        self.assertEqual(eb_checks.check_config(None), [])
