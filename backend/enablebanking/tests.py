from datetime import timedelta
from unittest.mock import Mock, patch

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from django.test import TestCase, override_settings
from django.utils import timezone
from decimal import Decimal

from .models import EnableBankingCredential, BankSyncRun
from . import client, credentials, mapping

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
