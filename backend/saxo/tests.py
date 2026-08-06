from datetime import timedelta

from cryptography.fernet import Fernet
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone

from .models import SaxoCredential

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