import re
from pathlib import Path

from django.conf import settings
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import get_hasher
from django.core.cache import cache
from django.test import override_settings
from rest_framework.settings import api_settings
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from users.testing import make_user

User = get_user_model()

GOOD = {
    'email': 'alice@example.com',
    'username': 'alice',
    'password': 'a-Long-Pass-9917',
    'website': '',
}
NO_MATCH = 'No account matches that login and password.'


def signup_payload(**overrides):
    return {**GOOD, **overrides}


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache', 'LOCATION': 'users-accounts'}})
class AccountTestCase(APITestCase):
    def setUp(self):
        cache.clear()

    def bearer(self, user):
        token = RefreshToken.for_user(user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')


class SignupTests(AccountTestCase):
    def test_signup_creates_user_and_logs_in(self):
        response = self.client.post('/api/auth/signup/', GOOD, format='json')

        self.assertEqual(response.status_code, 201)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)
        self.assertEqual(response.data['user']['username'], 'alice')
        self.assertFalse(response.data['user']['is_owner'])
        self.assertTrue(User.objects.filter(username='alice').exists())

    def test_signup_normalises_email(self):
        self.client.post(
            '/api/auth/signup/', signup_payload(email=' Alice@Example.com '), format='json'
        )
        self.assertEqual(User.objects.get(username='alice').email, 'alice@example.com')

        again = self.client.post(
            '/api/auth/signup/',
            signup_payload(email='ALICE@example.com', username='other'),
            format='json',
        )

        self.assertEqual(again.status_code, 400)
        self.assertIn('email', again.data)

    def test_signup_refuses_duplicate_username_case_insensitive(self):
        make_user('Alice')

        response = self.client.post(
            '/api/auth/signup/',
            signup_payload(username='alice', email='new@example.com'),
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('username', response.data)

    def test_signup_runs_password_validators(self):
        response = self.client.post(
            '/api/auth/signup/', signup_payload(password='123'), format='json'
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('password', response.data)

    def test_signup_honeypot(self):
        response = self.client.post(
            '/api/auth/signup/', signup_payload(website='x'), format='json'
        )

        self.assertEqual(response.status_code, 400)
        self.assertNotIn('website', response.data)
        self.assertFalse(User.objects.filter(username='alice').exists())

    def test_signup_refuses_username_with_a_space(self):
        response = self.client.post(
            '/api/auth/signup/', signup_payload(username='al ice'), format='json'
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('username', response.data)

    def test_signup_throttled(self):
        for i in range(5):
            ok = self.client.post(
                '/api/auth/signup/',
                signup_payload(username=f'u{i}', email=f'u{i}@example.com'),
                format='json',
            )
            self.assertEqual(ok.status_code, 201)

        sixth = self.client.post(
            '/api/auth/signup/',
            signup_payload(username='u5', email='u5@example.com'),
            format='json',
        )

        self.assertEqual(sixth.status_code, 429)

    def test_client_ip_ignores_spoofed_forwarded_for_without_proxies(self):
        statuses = []
        for i in range(6):
            response = self.client.post(
                '/api/auth/signup/',
                signup_payload(username=f'u{i}', email=f'u{i}@example.com'),
                format='json',
                REMOTE_ADDR='10.0.0.1',
                HTTP_X_FORWARDED_FOR=f'203.0.113.{i}',
            )
            statuses.append(response.status_code)

        self.assertEqual(statuses[-1], 429)

    def test_client_ip_trusts_one_proxy_hop_when_configured(self):
        with override_settings(
            REST_FRAMEWORK={**api_settings.user_settings, 'NUM_PROXIES': 1}
        ):
            statuses = [
                self.client.post(
                    '/api/auth/signup/',
                    signup_payload(username=f'u{i}', email=f'u{i}@example.com'),
                    format='json',
                    REMOTE_ADDR='10.0.0.1',
                    HTTP_X_FORWARDED_FOR=f'203.0.113.{i}',
                ).status_code
                for i in range(6)
            ]

        self.assertEqual(set(statuses), {201})


COMPOSE_FILE = Path(settings.BASE_DIR).parent / 'deploy' / 'compose.yaml'
EDGE_CADDY = '172.18.0.2'
COMPOSE_CADDY = '172.18.0.3'


def deployed_num_proxies():
    return int(re.search(r'NUM_PROXIES:\s*"(\d+)"', COMPOSE_FILE.read_text()).group(1))


class DeployedProxyChainTests(AccountTestCase):
    def reset_through_both_caddies(self, forged, visitor):
        return self.client.post(
            '/api/auth/password-reset/',
            {'email': 'nobody@example.com'},
            format='json',
            REMOTE_ADDR=COMPOSE_CADDY,
            HTTP_X_FORWARDED_FOR=f'{forged}, {visitor}, {EDGE_CADDY}',
        ).status_code

    def deployed_settings(self):
        return override_settings(
            REST_FRAMEWORK={**api_settings.user_settings, 'NUM_PROXIES': deployed_num_proxies()}
        )

    def test_each_visitor_gets_their_own_bucket(self):
        with self.deployed_settings():
            statuses = [
                self.reset_through_both_caddies('1.2.3.4', f'203.0.113.{i}') for i in range(6)
            ]

        self.assertEqual(set(statuses), {200})

    def test_a_forged_forwarded_for_does_not_escape_the_bucket(self):
        with self.deployed_settings():
            statuses = [
                self.reset_through_both_caddies(f'1.2.3.{i}', '203.0.113.7') for i in range(6)
            ]

        self.assertEqual(statuses[-1], 429)


class LoginTests(AccountTestCase):
    def test_login_with_email_and_with_username(self):
        make_user('alice', email='Alice@Example.com')

        by_name = self.client.post(
            '/api/token/', {'username': 'ALICE', 'password': 'pw-Strong-123'}, format='json'
        )
        by_email = self.client.post(
            '/api/token/',
            {'username': ' alice@example.com ', 'password': 'pw-Strong-123'},
            format='json',
        )

        self.assertEqual(by_name.status_code, 200)
        self.assertIn('access', by_name.data)
        self.assertEqual(by_email.status_code, 200)
        self.assertIn('refresh', by_email.data)

    def test_wrong_login_or_password_says_the_same_thing(self):
        make_user('alice')

        unknown = self.client.post(
            '/api/token/', {'username': 'nobody', 'password': 'x'}, format='json'
        )
        wrong = self.client.post(
            '/api/token/', {'username': 'alice', 'password': 'x'}, format='json'
        )

        for response in (unknown, wrong):
            self.assertEqual(response.status_code, 401)
            self.assertEqual(response.data['detail'], NO_MATCH)

    def test_login_with_a_json_list_body_is_not_a_server_error(self):
        response = self.client.post('/api/token/', ['a', 'b'], format='json')

        self.assertIn(response.status_code, (400, 401))

    def test_login_throttle_is_per_ip_and_login(self):
        def attempt(login, ip):
            return self.client.post(
                '/api/token/',
                {'username': login, 'password': 'bad'},
                format='json',
                REMOTE_ADDR=ip,
            ).status_code

        first = [attempt('a', '10.0.0.1') for _ in range(10)]
        self.assertEqual(set(first), {401})
        self.assertEqual(attempt('a', '10.0.0.1'), 429)
        self.assertEqual(attempt('b', '10.0.0.1'), 401)
        self.assertEqual(attempt('a', '10.0.0.2'), 401)

    @override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
    def test_one_ip_trying_many_logins_is_throttled(self):
        def attempt(i):
            return self.client.post(
                '/api/token/',
                {'username': f'guess{i}@example.com', 'password': 'bad'},
                format='json',
                REMOTE_ADDR='10.0.0.9',
            ).status_code

        first = [attempt(i) for i in range(30)]

        self.assertEqual(set(first), {401})
        self.assertEqual(attempt(30), 429)
        self.assertEqual(
            self.client.post(
                '/api/token/',
                {'username': 'guess0@example.com', 'password': 'bad'},
                format='json',
                REMOTE_ADDR='10.0.0.10',
            ).status_code,
            401,
        )

    def hashes_spent_logging_in_as(self, login):
        hasher = type(get_hasher('default'))
        with patch.object(hasher, 'encode', autospec=True, side_effect=hasher.encode) as encode:
            response = self.client.post(
                '/api/token/', {'username': login, 'password': 'wrong-Pass-1'}, format='json'
            )
        self.assertEqual(response.status_code, 401)
        return encode.call_count

    def test_an_unknown_login_costs_as_many_hashes_as_a_wrong_password(self):
        make_user('alice', email='alice@example.com')

        self.assertEqual(self.hashes_spent_logging_in_as('nobody@example.com'), 1)
        self.assertEqual(self.hashes_spent_logging_in_as('alice'), 1)


class MeTests(AccountTestCase):
    def test_me_get_and_change_username(self):
        user = make_user('alice', owner=True)
        self.bearer(user)

        got = self.client.get('/api/auth/me/')
        self.assertEqual(
            got.data,
            {'username': 'alice', 'email': 'alice@example.com', 'is_owner': True},
        )

        changed = self.client.patch('/api/auth/me/', {'username': 'alicia'}, format='json')
        self.assertEqual(changed.status_code, 200)
        self.assertEqual(changed.data['username'], 'alicia')
        user.refresh_from_db()
        self.assertEqual(user.username, 'alicia')

    def test_change_username_with_a_space_is_refused(self):
        user = make_user('alice')
        self.bearer(user)

        response = self.client.patch('/api/auth/me/', {'username': 'al ice'}, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('username', response.data)

    def test_change_username_to_taken_is_refused(self):
        make_user('bob')
        user = make_user('alice')
        self.bearer(user)

        response = self.client.patch('/api/auth/me/', {'username': 'BOB'}, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('username', response.data)

    def test_change_email_needs_current_password(self):
        user = make_user('alice')
        self.bearer(user)

        missing = self.client.patch(
            '/api/auth/me/', {'email': 'new@example.com'}, format='json'
        )
        wrong = self.client.patch(
            '/api/auth/me/',
            {'email': 'new@example.com', 'current_password': 'nope'},
            format='json',
        )
        right = self.client.patch(
            '/api/auth/me/',
            {'email': ' New@Example.com ', 'current_password': 'pw-Strong-123'},
            format='json',
        )

        self.assertEqual(missing.status_code, 400)
        self.assertEqual(wrong.status_code, 400)
        self.assertEqual(right.status_code, 200)
        self.assertEqual(right.data['email'], 'new@example.com')

    def test_change_email_to_taken_is_refused(self):
        make_user('bob', email='bob@example.com')
        user = make_user('alice')
        self.bearer(user)

        response = self.client.patch(
            '/api/auth/me/',
            {'email': 'BOB@example.com', 'current_password': 'pw-Strong-123'},
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('email', response.data)

    def test_me_requires_authentication(self):
        self.assertEqual(self.client.get('/api/auth/me/').status_code, 401)


class SessionTests(AccountTestCase):
    def refresh_status(self, refresh):
        self.client.credentials()
        return self.client.post(
            '/api/token/refresh/', {'refresh': str(refresh)}, format='json'
        ).status_code

    def test_change_password_keeps_this_session_and_ends_others(self):
        user = make_user('alice')
        this_session = RefreshToken.for_user(user)
        other_session = RefreshToken.for_user(user)
        self.bearer(user)

        response = self.client.post(
            '/api/auth/password/',
            {'current_password': 'pw-Strong-123', 'new_password': 'a-Brand-New-4471'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.refresh_status(response.data['refresh']), 200)
        self.assertEqual(self.refresh_status(other_session), 401)
        self.assertEqual(self.refresh_status(this_session), 401)
        user.refresh_from_db()
        self.assertTrue(user.check_password('a-Brand-New-4471'))

    def test_change_password_needs_the_current_one_and_a_valid_new_one(self):
        user = make_user('alice')
        self.bearer(user)

        wrong = self.client.post(
            '/api/auth/password/',
            {'current_password': 'nope', 'new_password': 'a-Brand-New-4471'},
            format='json',
        )
        weak = self.client.post(
            '/api/auth/password/',
            {'current_password': 'pw-Strong-123', 'new_password': '123'},
            format='json',
        )

        self.assertEqual(wrong.status_code, 400)
        self.assertIn('current_password', wrong.data)
        self.assertEqual(weak.status_code, 400)
        self.assertIn('new_password', weak.data)

    def test_sign_out_everywhere(self):
        user = make_user('alice')
        first = RefreshToken.for_user(user)
        second = RefreshToken.for_user(user)
        self.bearer(user)

        response = self.client.post('/api/auth/sign-out-everywhere/')

        self.assertEqual(response.status_code, 205)
        self.assertEqual(self.refresh_status(first), 401)
        self.assertEqual(self.refresh_status(second), 401)
