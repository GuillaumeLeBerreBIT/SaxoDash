import json
import os
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch

from django.conf import settings
from django.db.utils import OperationalError
from django.test import SimpleTestCase, TestCase, override_settings

BACKEND = Path(settings.BASE_DIR)
PRODUCTION_ENV = {
    'DEBUG': 'False',
    'SECRET_KEY': 'production-test-key',
    'ALLOWED_HOSTS': 'saxodash.uniroo.dev',
}


def _settings_in_subprocess(env, *names):
    script = (
        'import json, django; django.setup(); from django.conf import settings; '
        f'print(json.dumps({{n: getattr(settings, n) for n in {list(names)!r}}}, default=str))'
    )
    return subprocess.run(
        [sys.executable, '-c', script],
        cwd=BACKEND, capture_output=True, text=True,
        env={**os.environ, 'DJANGO_SETTINGS_MODULE': 'backend.settings', **env},
    )


class HealthzTest(TestCase):
    def test_answers_ok_when_the_database_and_cache_answer(self):
        response = self.client.get('/healthz')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'status': 'ok'})

    def test_answers_503_when_the_cache_is_down(self):
        with patch('core.health.cache.set', side_effect=ConnectionError('redis down')):
            response = self.client.get('/healthz')

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {'status': 'unavailable'})

    def test_answers_503_when_the_database_is_down(self):
        with patch('core.health.connection.cursor', side_effect=OperationalError('gone')):
            response = self.client.get('/healthz')

        self.assertEqual(response.status_code, 503)


@override_settings(SECURE_SSL_REDIRECT=True)
class BehindTheEdgeProxyTest(TestCase):
    def test_a_request_the_proxy_marks_as_https_is_not_redirected(self):
        response = self.client.get('/api/core/net-worth-history/', HTTP_X_FORWARDED_PROTO='https')

        self.assertNotIn(response.status_code, (301, 302))

    def test_a_plain_http_request_is_still_redirected(self):
        response = self.client.get('/api/core/net-worth-history/')

        self.assertEqual(response.status_code, 301)

    def test_the_health_check_answers_over_plain_http(self):
        response = self.client.get('/healthz')

        self.assertEqual(response.status_code, 200)


class ProductionSettingsTest(SimpleTestCase):
    def test_production_settings_trust_the_proxy_and_serve_static_files(self):
        result = _settings_in_subprocess(
            PRODUCTION_ENV, 'SECURE_SSL_REDIRECT', 'SECURE_PROXY_SSL_HEADER', 'STATIC_ROOT', 'MIDDLEWARE',
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        values = json.loads(result.stdout)
        self.assertTrue(values['SECURE_SSL_REDIRECT'])
        self.assertEqual(values['SECURE_PROXY_SSL_HEADER'], ['HTTP_X_FORWARDED_PROTO', 'https'])
        self.assertTrue(values['STATIC_ROOT'].endswith('staticfiles'))
        self.assertIn('whitenoise.middleware.WhiteNoiseMiddleware', values['MIDDLEWARE'])

    def test_refuses_to_start_without_allowed_hosts(self):
        result = _settings_in_subprocess({**PRODUCTION_ENV, 'ALLOWED_HOSTS': ''}, 'DEBUG')

        self.assertNotEqual(result.returncode, 0)
        self.assertIn('ALLOWED_HOSTS', result.stderr)

    def test_refuses_to_start_with_the_development_secret_key(self):
        env = {k: v for k, v in PRODUCTION_ENV.items() if k != 'SECRET_KEY'}
        result = _settings_in_subprocess({**env, 'SECRET_KEY': settings.DEV_SECRET_KEY}, 'DEBUG')

        self.assertNotEqual(result.returncode, 0)
        self.assertIn('SECRET_KEY', result.stderr)


class AdminExposureTest(SimpleTestCase):
    def _admin_routed(self, **env):
        script = (
            'import django; django.setup(); from django.urls import resolve, Resolver404\n'
            'try:\n'
            '    resolve("/admin/")\n'
            '    print("routed")\n'
            'except Resolver404:\n'
            '    print("absent")\n'
        )
        result = subprocess.run(
            [sys.executable, '-c', script],
            cwd=BACKEND, capture_output=True, text=True,
            env={**os.environ, 'DJANGO_SETTINGS_MODULE': 'backend.settings', **env},
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout.strip() == 'routed'

    def test_admin_absent_when_disabled(self):
        self.assertFalse(self._admin_routed(ADMIN_ENABLED='False'))

    def test_admin_present_when_enabled(self):
        self.assertTrue(self._admin_routed(ADMIN_ENABLED='True'))

    def test_admin_follows_debug_by_default(self):
        env = {k: v for k, v in os.environ.items() if k != 'ADMIN_ENABLED'}
        with patch.dict(os.environ, env, clear=True):
            self.assertFalse(self._admin_routed(**PRODUCTION_ENV))
            self.assertTrue(self._admin_routed(DEBUG='True'))
