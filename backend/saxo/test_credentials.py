from datetime import timedelta
from decimal import Decimal
from cryptography.fernet import Fernet
from django.test import TestCase, override_settings
from django.utils import timezone
from . import credentials
from .models import SaxoCredential

TEST_KEY = Fernet.generate_key().decode()


@override_settings(SAXO_TOKEN_ENCRYPTION_KEY=TEST_KEY)
class ActiveCredentialTest(TestCase):
    def _create(self, **overrides):
        return SaxoCredential.objects.create(**{
            'access_token': 'access',
            'refresh_token': 'refresh',
            'expires_at': timezone.now() + timedelta(minutes=20),
            **overrides,
        })

    def test_returns_the_credential_when_it_is_usable(self):
        self._create()
        self.assertEqual(credentials.active_credential().access_token, 'access')

    def test_raises_when_saxo_was_never_connected(self):
        with self.assertRaises(credentials.SaxoNotConnected):
            credentials.active_credential()

    def test_raises_when_the_credential_needs_reauth(self):
        self._create(needs_reauth=True)
        with self.assertRaises(credentials.SaxoNotConnected):
            credentials.active_credential()

    def test_raises_when_the_access_token_has_expired(self):
        self._create(expires_at=timezone.now() - timedelta(minutes=1))
        with self.assertRaises(credentials.SaxoNotConnected):
            credentials.active_credential()

    def test_inside_the_grace_window_a_call_is_refused_but_reauth_is_not_asked(self):
        self._create(expires_at=timezone.now() - timedelta(minutes=1))
        state = credentials.connection_state()

        self.assertTrue(state.connected)
        self.assertFalse(state.usable)
        self.assertFalse(state.needs_reauth)

    def test_a_null_numeric_field_skips_one_row_instead_of_failing_the_run(self):
        # decimal raises InvalidOperation, an ArithmeticError - not a
        # ValueError - so an unguarded null used to fail the whole sync.
        from saxo import mapping
        self.assertEqual(mapping._decimal(None), Decimal('0'))
        self.assertEqual(mapping._decimal(None, default=1), Decimal('1'))

    def test_past_the_grace_window_the_user_has_to_act(self):
        self._create(expires_at=timezone.now() - credentials.REAUTH_GRACE - timedelta(minutes=1))
        state = credentials.connection_state()

        self.assertFalse(state.usable)
        self.assertTrue(state.needs_reauth)
