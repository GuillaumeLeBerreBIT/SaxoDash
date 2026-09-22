from cryptography.fernet import Fernet
from django.test import TestCase, override_settings
from . import checks, client

TEST_KEY = Fernet.generate_key().decode()


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
