from datetime import timedelta
from unittest.mock import Mock, patch
from urllib.parse import parse_qs, urlparse
from cryptography.fernet import Fernet
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from backend import settings
from .models import SaxoCredential
from datetime import date as date_cls
from decimal import Decimal
from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken


from . import mapping
from . import client
from . import checks

TEST_KEY = Fernet.generate_key().decode()

SAMPLE_POSITION = {
    'PositionId': '5027270864',
    'PositionBase': {
        'Amount': 15,
        'OpenPrice': 412.30,
        'AssetType': 'Stock',
        'ExecutionTimeOpen': '2026-08-26T18:30:31.645781Z',
    },
    'PositionView': {
        'CurrentPrice': 875.40,
    },
    'DisplayAndFormat': {
        'Symbol': 'NVDA:xnas',
        'Description': 'NVIDIA Corporation',
    },
}

@override_settings(SAXO_TOKEN_ENCRYPTION_KEY=TEST_KEY)
class SaxoCredentialModelTest(TestCase):
    def test_round_trips_tokens_through_the_orm(self):
        cred = SaxoCredential.objects.create(
            access_token='plain-access-token',
            refresh_token='plain-refresh-token',
            expires_at=timezone.now() + timedelta(minutes=20),
        )
        cred.refresh_from_db()
        self.assertEqual(cred.access_token, 'plain-access-token')
        self.assertEqual(cred.refresh_token, 'plain-refresh-token')

    def test_tokens_are_encrypted_at_rest(self):
        SaxoCredential.objects.create(
            access_token='plain-access-token',
            refresh_token='plain-refresh-token',
            expires_at=timezone.now() + timedelta(minutes=20),
        )
        with connection.cursor() as cursor:
            cursor.execute('SELECT access_token FROM saxo_saxocredential LIMIT 1')
            raw_value = cursor.fetchone()[0]
        self.assertNotEqual(raw_value, 'plain-access-token')

    def test_defaults(self):
        cred = SaxoCredential.objects.create(
            access_token='a', refresh_token='b',
            expires_at=timezone.now() + timedelta(minutes=20),
        )
        self.assertEqual(cred.environment, 'sim')
        self.assertFalse(cred.needs_reauth)
        self.assertIsNone(cred.last_synced_at)
      
        
class SaxoClientTest(TestCase):
    def test_build_authorize_url_includes_client_id_and_state(self):
        url = client.build_authorize_url('xyz-state')
        self.assertIn('sim.logonvalidation.net/authorize', url)
        self.assertIn('state=xyz-state', url)
        self.assertIn(f'client_id={settings.SAXO_KEY}', url) if settings.SAXO_KEY else None

    @override_settings(
        SAXO_KEY='key/with+chars',
        SAXO_REDIRECT_URI='http://localhost:8000/api/saxo/callback/',
    )
    def test_build_authorize_url_percent_encodes_params(self):
        url = client.build_authorize_url('a b&c')
        query = parse_qs(urlparse(url).query)

        self.assertNotIn('redirect_uri=http://', url)
        self.assertEqual(query['redirect_uri'], ['http://localhost:8000/api/saxo/callback/'])
        self.assertEqual(query['client_id'], ['key/with+chars'])
        self.assertEqual(query['state'], ['a b&c'])

    @patch('saxo.client.requests.post')
    def test_exchange_code_for_token_returns_json_on_success(self, mock_post):
        mock_post.return_value = Mock(ok=True, json=lambda: {'access_token': 'a', 'refresh_token': 'r', 'expires_in': 1200})
        result = client.exchange_code_for_token('some-code')
        self.assertEqual(result['access_token'], 'a')

    @patch('saxo.client.requests.post')
    def test_exchange_code_for_token_raises_on_failure(self, mock_post):
        mock_post.return_value = Mock(ok=False, status_code=400, text='bad request')
        with self.assertRaises(client.SaxoAuthError):
            client.exchange_code_for_token('bad-code')

    @patch('saxo.client.requests.post')
    def test_refresh_access_token_raises_on_failure(self, mock_post):
        mock_post.return_value = Mock(ok=False, status_code=401, text='expired')
        with self.assertRaises(client.SaxoAuthError):
            client.refresh_access_token('stale-refresh-token')

    @patch('saxo.client.requests.get')
    def test_get_positions_returns_data_list(self, mock_get):
        mock_get.return_value = Mock(ok=True, json=lambda: {'Data': [{'PositionId': '1'}]})
        result = client.get_positions('token')
        self.assertEqual(result, [{'PositionId': '1'}])

    @patch('saxo.client.requests.get')
    def test_get_positions_raises_on_api_error(self, mock_get):
        mock_get.return_value = Mock(ok=False, status_code=500, text='server error')
        with self.assertRaises(client.SaxoAPIError):
            client.get_positions('token')
            
    @patch('saxo.client.requests.get')
    def test_get_closed_positions_returns_bare_list(self, mock_get):
        mock_get.return_value = Mock(ok=True, json=lambda: [{'ClosedPositionUniqueId': 1}])
        result = client.get_closed_positions('token')
        self.assertEqual(result, [{'ClosedPositionUniqueId': 1}])

    @patch('saxo.client.requests.get')
    def test_get_closed_positions_raises_on_api_error(self, mock_get):
        mock_get.return_value = Mock(ok=False, status_code=500, text='server error')
        with self.assertRaises(client.SaxoAPIError):
            client.get_closed_positions('token')

class ToPositionFieldsTest(TestCase):
    def test_maps_core_fields(self):
        fields = mapping.to_position_fields(SAMPLE_POSITION)
        self.assertEqual(fields['ticker'], 'NVDA')
        self.assertEqual(fields['name'], 'NVIDIA Corporation')
        self.assertEqual(fields['qty'], 15)
        self.assertEqual(fields['avg_cost'], Decimal('412.30'))
        self.assertEqual(fields['current_price'], Decimal('875.40'))
        self.assertEqual(fields['type'], 'STOCK')

    def test_sector_and_color_are_always_present(self):
        fields = mapping.to_position_fields(SAMPLE_POSITION)
        self.assertEqual(fields['sector'], 'Uncategorized')
        self.assertTrue(fields['color'].startswith('#'))
        self.assertEqual(len(fields['color']), 7)

    def test_color_is_deterministic_per_ticker(self):
        a = mapping.to_position_fields(SAMPLE_POSITION)
        b = mapping.to_position_fields(SAMPLE_POSITION)
        self.assertEqual(a['color'], b['color'])


class ToTransactionFieldsTest(TestCase):
    def test_maps_open_position_to_buy_row(self):
        fields = mapping.to_transaction_fields(SAMPLE_POSITION)
        self.assertEqual(fields['saxo_trade_id'], '5027270864')
        self.assertEqual(fields['date'], date_cls(2026, 8, 26))
        self.assertEqual(fields['type'], 'BUY')
        self.assertEqual(fields['instrument'], 'NVIDIA Corporation')
        self.assertEqual(fields['ticker'], 'NVDA')
        self.assertEqual(fields['qty'], Decimal('15'))
        self.assertEqual(fields['price'], Decimal('412.30'))
        self.assertEqual(fields['account'], 'Saxo')

    def test_negative_amount_maps_to_sell(self):
        short = {**SAMPLE_POSITION, 'PositionBase': {**SAMPLE_POSITION['PositionBase'], 'Amount': -4}}
        fields = mapping.to_transaction_fields(short)
        self.assertEqual(fields['type'], 'SELL')
        self.assertEqual(fields['qty'], Decimal('4'))
        
class SaxoConnectViewTest(APITestCase):
    def test_redirects_to_saxo_authorize_url_and_sets_session_state(self):
        response = self.client.get('/api/saxo/connect/')
        self.assertEqual(response.status_code, 302)
        self.assertIn('sim.logonvalidation.net/authorize', response.url)
        self.assertIn('saxo_oauth_state', self.client.session)


class SaxoCallbackViewTest(APITestCase):
    def test_rejects_mismatched_state(self):
        session = self.client.session
        session['saxo_oauth_state'] = 'expected-state'
        session.save()

        response = self.client.get('/api/saxo/callback/?code=abc&state=wrong-state')
        self.assertEqual(response.status_code, 302)
        self.assertIn('saxo=error', response.url)

    @patch('saxo.views.client.exchange_code_for_token')
    def test_saves_credential_on_success(self, mock_exchange):
        mock_exchange.return_value = {
            'access_token': 'new-access', 'refresh_token': 'new-refresh', 'expires_in': 1200,
        }
        session = self.client.session
        session['saxo_oauth_state'] = 'matching-state'
        session.save()

        response = self.client.get('/api/saxo/callback/?code=abc&state=matching-state')
        self.assertEqual(response.status_code, 302)
        self.assertIn('saxo=connected', response.url)
        self.assertEqual(SaxoCredential.objects.count(), 1)
        self.assertEqual(SaxoCredential.objects.first().access_token, 'new-access')

    @override_settings(SAXO_ENVIRONMENT='live')
    @patch('saxo.views.client.exchange_code_for_token')
    def test_records_the_environment_the_token_was_issued_for(self, mock_exchange):
        mock_exchange.return_value = {
            'access_token': 'a', 'refresh_token': 'r', 'expires_in': 1200,
        }
        session = self.client.session
        session['saxo_oauth_state'] = 'matching-state'
        session.save()

        self.client.get('/api/saxo/callback/?code=abc&state=matching-state')
        self.assertEqual(SaxoCredential.objects.first().environment, 'live')

    @patch('saxo.views.client.exchange_code_for_token')
    def test_redirects_with_error_when_exchange_fails(self, mock_exchange):
        mock_exchange.side_effect = client.SaxoAuthError('boom')
        session = self.client.session
        session['saxo_oauth_state'] = 'matching-state'
        session.save()

        with self.assertLogs('saxo.views', level='ERROR'):
            response = self.client.get('/api/saxo/callback/?code=abc&state=matching-state')

        self.assertEqual(response.status_code, 302)
        self.assertIn('saxo=error', response.url)
        self.assertEqual(SaxoCredential.objects.count(), 0)

    @patch('saxo.views.client.exchange_code_for_token')
    def test_keeps_existing_credential_when_exchange_fails(self, mock_exchange):
        SaxoCredential.objects.create(
            access_token='old', refresh_token='old-r',
            expires_at=timezone.now() + timedelta(minutes=20),
        )
        mock_exchange.side_effect = client.SaxoAuthError('boom')
        session = self.client.session
        session['saxo_oauth_state'] = 'matching-state'
        session.save()

        with self.assertLogs('saxo.views', level='ERROR'):
            self.client.get('/api/saxo/callback/?code=abc&state=matching-state')

        self.assertEqual(SaxoCredential.objects.first().access_token, 'old')


class SaxoStatusViewTest(APITestCase):
    def setUp(self):
        user = User.objects.create_user(username='alex', password='pw')
        refresh = RefreshToken.for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')

    def test_reports_not_connected_when_no_credential(self):
        response = self.client.get('/api/saxo/status/')
        self.assertEqual(response.data, {'connected': False})

    def test_reports_connected_details_when_credential_exists(self):
        SaxoCredential.objects.create(
            access_token='a', refresh_token='b',
            expires_at=timezone.now() + timedelta(minutes=20),
        )
        response = self.client.get('/api/saxo/status/')
        self.assertTrue(response.data['connected'])
        self.assertEqual(response.data['environment'], 'sim')
        self.assertFalse(response.data['needs_reauth'])

    def test_needs_reauth_when_token_expired_well_past_refresh_window(self):
        SaxoCredential.objects.create(
            access_token='a', refresh_token='b',
            expires_at=timezone.now() - timedelta(hours=1),
        )
        response = self.client.get('/api/saxo/status/')
        self.assertTrue(response.data['needs_reauth'])

    def test_no_reauth_flap_during_normal_refresh_window(self):
        SaxoCredential.objects.create(
            access_token='a', refresh_token='b',
            expires_at=timezone.now() - timedelta(minutes=2),
        )
        response = self.client.get('/api/saxo/status/')
        self.assertFalse(response.data['needs_reauth'])

from portfolio.models import Position
from transactions.models import Transaction
from accounts.models import BankAccount
from . import tasks


@override_settings(CELERY_TASK_ALWAYS_EAGER=True, CELERY_TASK_EAGER_PROPAGATES=True)
class RefreshSaxoTokenTaskTest(TestCase):
    def test_does_nothing_when_token_not_near_expiry(self):
        SaxoCredential.objects.create(
            access_token='a', refresh_token='b',
            expires_at=timezone.now() + timedelta(hours=1),
        )
        with patch('saxo.tasks.client.refresh_access_token') as mock_refresh:
            tasks.refresh_saxo_token()
            mock_refresh.assert_not_called()

    @patch('saxo.tasks.client.refresh_access_token')
    def test_refreshes_when_near_expiry(self, mock_refresh):
        mock_refresh.return_value = {
            'access_token': 'new-a', 'refresh_token': 'new-b', 'expires_in': 1200,
        }
        cred = SaxoCredential.objects.create(
            access_token='old-a', refresh_token='old-b',
            expires_at=timezone.now() + timedelta(minutes=2),
        )
        tasks.refresh_saxo_token()
        cred.refresh_from_db()
        self.assertEqual(cred.access_token, 'new-a')
        self.assertFalse(cred.needs_reauth)

    @patch('saxo.tasks.client.refresh_access_token')
    def test_marks_needs_reauth_on_failure(self, mock_refresh):
        mock_refresh.side_effect = client.SaxoAuthError('expired')
        cred = SaxoCredential.objects.create(
            access_token='old-a', refresh_token='old-b',
            expires_at=timezone.now() + timedelta(minutes=2),
        )
        tasks.refresh_saxo_token()
        cred.refresh_from_db()
        self.assertTrue(cred.needs_reauth)


@override_settings(CELERY_TASK_ALWAYS_EAGER=True, CELERY_TASK_EAGER_PROPAGATES=True)
class SyncPositionsTaskTest(TestCase):
    def setUp(self):
        self.cred = SaxoCredential.objects.create(
            access_token='a', refresh_token='b',
            expires_at=timezone.now() + timedelta(hours=1),
        )

    @patch('saxo.tasks.client.get_positions')
    def test_creates_positions_from_saxo_data(self, mock_get_positions):
        mock_get_positions.return_value = [SAMPLE_POSITION]
        tasks.sync_positions()
        self.assertEqual(Position.objects.count(), 1)
        self.assertEqual(Position.objects.first().ticker, 'NVDA')
        self.cred.refresh_from_db()
        self.assertIsNotNone(self.cred.last_synced_at)

    @patch('saxo.tasks.client.get_positions')
    def test_removes_positions_no_longer_present(self, mock_get_positions):
        Position.objects.create(
            ticker='OLD', name='Old Corp', qty=1, avg_cost=Decimal('1'),
            current_price=Decimal('1'), sector='Uncategorized', type='STOCK', color='#000000',
        )
        mock_get_positions.return_value = [SAMPLE_POSITION]
        tasks.sync_positions()
        self.assertFalse(Position.objects.filter(ticker='OLD').exists())
        self.assertTrue(Position.objects.filter(ticker='NVDA').exists())

    @patch('saxo.tasks.client.get_positions')
    def test_skips_malformed_rows_without_aborting(self, mock_get_positions):
        mock_get_positions.return_value = [{'unexpected': 'shape'}, SAMPLE_POSITION]
        tasks.sync_positions()
        self.assertEqual(Position.objects.count(), 1)


@override_settings(CELERY_TASK_ALWAYS_EAGER=True, CELERY_TASK_EAGER_PROPAGATES=True)
class SyncTransactionsTaskTest(TestCase):
    def setUp(self):
        self.cred = SaxoCredential.objects.create(
            access_token='a', refresh_token='b',
            expires_at=timezone.now() + timedelta(hours=1),
        )

    @patch('saxo.tasks.client.get_positions')
    def test_creates_buy_transactions_from_open_positions(self, mock_get_positions):
        mock_get_positions.return_value = [SAMPLE_POSITION]
        tasks.sync_transactions()
        self.assertEqual(Transaction.objects.count(), 1)
        txn = Transaction.objects.first()
        self.assertEqual(txn.saxo_trade_id, '5027270864')
        self.assertEqual(txn.type, 'BUY')
        self.assertEqual(txn.ticker, 'NVDA')

    @patch('saxo.tasks.client.get_positions')
    def test_upserts_on_repeated_sync(self, mock_get_positions):
        mock_get_positions.return_value = [SAMPLE_POSITION]
        tasks.sync_transactions()
        tasks.sync_transactions()
        self.assertEqual(Transaction.objects.count(), 1)

    @patch('saxo.tasks.client.get_positions')
    def test_skips_malformed_rows_without_aborting(self, mock_get_positions):
        mock_get_positions.return_value = [{'unexpected': 'shape'}, SAMPLE_POSITION]
        tasks.sync_transactions()
        self.assertEqual(Transaction.objects.count(), 1)


@override_settings(CELERY_TASK_ALWAYS_EAGER=True, CELERY_TASK_EAGER_PROPAGATES=True)
class ExpiredCredentialGuardTest(TestCase):
    """The sync tasks must not call Saxo with an access token that has expired.

    Doing so returns 401, which raises SaxoAPIError and burns all three
    autoretries on a request that cannot succeed. refresh_saxo_token is what
    repairs the credential, so the sync tasks skip and pick it up next tick.
    """

    def setUp(self):
        self.cred = SaxoCredential.objects.create(
            access_token='a', refresh_token='b',
            expires_at=timezone.now() - timedelta(minutes=1),
        )

    @patch('saxo.tasks.client.get_positions')
    def test_sync_positions_skips_expired_token(self, mock_get_positions):
        tasks.sync_positions()
        mock_get_positions.assert_not_called()
        self.assertEqual(Position.objects.count(), 0)

    @patch('saxo.tasks.client.get_positions')
    def test_sync_transactions_skips_expired_token(self, mock_get_positions):
        tasks.sync_transactions()
        mock_get_positions.assert_not_called()
        self.assertEqual(Transaction.objects.count(), 0)

    @patch('saxo.tasks.client.get_account_balance')
    def test_sync_account_balance_skips_expired_token(self, mock_get_balance):
        tasks.sync_account_balance()
        mock_get_balance.assert_not_called()

    @patch('saxo.tasks.client.get_positions')
    def test_unexpired_token_still_syncs(self, mock_get_positions):
        self.cred.expires_at = timezone.now() + timedelta(hours=1)
        self.cred.save(update_fields=['expires_at'])
        mock_get_positions.return_value = [SAMPLE_POSITION]
        tasks.sync_positions()
        mock_get_positions.assert_called_once()

    @patch('saxo.tasks.client.refresh_access_token')
    def test_refresh_task_still_runs_on_expired_token(self, mock_refresh):
        # The guard must NOT apply here: an expired access token is precisely
        # this task's trigger. It authenticates with the refresh token.
        mock_refresh.return_value = {
            'access_token': 'new-a', 'refresh_token': 'new-b', 'expires_in': 1200,
        }
        tasks.refresh_saxo_token()
        mock_refresh.assert_called_once()
        self.cred.refresh_from_db()
        self.assertEqual(self.cred.access_token, 'new-a')
        self.assertGreater(self.cred.expires_at, timezone.now())


@override_settings(CELERY_TASK_ALWAYS_EAGER=True, CELERY_TASK_EAGER_PROPAGATES=True)
class SyncAccountBalanceTaskTest(TestCase):
    def setUp(self):
        self.cred = SaxoCredential.objects.create(
            access_token='a', refresh_token='b',
            expires_at=timezone.now() + timedelta(hours=1),
        )

    @patch('saxo.tasks.client.get_account_balance')
    def test_updates_the_existing_saxo_account_row(self, mock_get_balance):
        # The seeded 'Saxo' row must be updated in place, not duplicated - the
        # bug this task shipped with was bank='saxo' failing to match it.
        BankAccount.objects.create(
            bank='Saxo', type='Cash', iban_masked='-',
            balance=Decimal('850.00'), available=Decimal('850.00'),
        )
        mock_get_balance.return_value = {
            'CashBalance': 994104.45, 'CollateralAvailable': 992000.10,
        }
        tasks.sync_account_balance()

        self.assertEqual(BankAccount.objects.filter(bank='Saxo').count(), 1)
        account = BankAccount.objects.get(bank='Saxo')
        self.assertEqual(account.balance, Decimal('994104.45'))
        self.assertEqual(account.available, Decimal('992000.10'))

    @patch('saxo.tasks.client.get_account_balance')
    def test_creates_the_row_when_absent(self, mock_get_balance):
        mock_get_balance.return_value = {
            'CashBalance': 100.00, 'CollateralAvailable': 100.00,
        }
        tasks.sync_account_balance()
        self.assertEqual(BankAccount.objects.get(bank='Saxo').balance, Decimal('100.00'))


class SaxoEnvironmentTest(TestCase):
    @override_settings(SAXO_ENVIRONMENT='sim')
    def test_sim_uses_sim_hosts(self):
        self.assertIn('sim.logonvalidation.net', client.build_authorize_url('s'))

    @override_settings(SAXO_ENVIRONMENT='live')
    def test_live_uses_live_hosts(self):
        self.assertIn('live.logonvalidation.net', client.build_authorize_url('s'))

    @override_settings(SAXO_ENVIRONMENT='sim')
    def test_check_passes_on_known_environment(self):
        self.assertEqual(checks.check_environment(app_configs=None), [])

    @override_settings(SAXO_ENVIRONMENT='prod')
    def test_check_errors_on_unknown_environment(self):
        errors = checks.check_environment(app_configs=None)
        self.assertEqual([e.id for e in errors], ['saxo.E003'])


class TokenEncryptionKeyCheckTest(TestCase):
    @override_settings(SAXO_TOKEN_ENCRYPTION_KEY='')
    def test_errors_when_key_is_unset(self):
        errors = checks.check_token_encryption_key(app_configs=None)
        self.assertEqual([e.id for e in errors], ['saxo.E001'])

    @override_settings(SAXO_TOKEN_ENCRYPTION_KEY='not-a-fernet-key')
    def test_errors_when_key_is_malformed(self):
        errors = checks.check_token_encryption_key(app_configs=None)
        self.assertEqual([e.id for e in errors], ['saxo.E002'])

    @override_settings(SAXO_TOKEN_ENCRYPTION_KEY=TEST_KEY)
    def test_passes_on_a_valid_key(self):
        self.assertEqual(checks.check_token_encryption_key(app_configs=None), [])
