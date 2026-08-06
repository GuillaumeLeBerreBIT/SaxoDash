from datetime import timedelta
from unittest.mock import Mock, patch
from cryptography.fernet import Fernet
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from backend import settings
from .models import SaxoCredential
from . import client

TEST_KEY = Fernet.generate_key().decode()


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