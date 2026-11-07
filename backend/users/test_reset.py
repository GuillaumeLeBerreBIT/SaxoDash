from smtplib import SMTPException
from unittest import mock

from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.test import override_settings
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework_simplejwt.tokens import RefreshToken

from users.test_accounts import AccountTestCase
from users.testing import make_user

REQUEST_URL = '/api/auth/password-reset/'
CONFIRM_URL = '/api/auth/password-reset/confirm/'
ANSWER = 'If an account exists for that address, a link is on its way.'
INVALID = 'This reset link is invalid or has expired.'
NEW_PASSWORD = 'a-Brand-New-4471'


def reset_credentials(user):
    return {
        'uid': urlsafe_base64_encode(force_bytes(user.pk)),
        'token': default_token_generator.make_token(user),
    }


class ResetRequestTests(AccountTestCase):
    def test_reset_known_email_sends_one_mail(self):
        user = make_user('alice', email='alice@example.com')

        response = self.client.post(REQUEST_URL, {'email': 'alice@example.com'}, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {'detail': ANSWER})
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['alice@example.com'])
        credentials = reset_credentials(user)
        self.assertIn('/reset-password?uid=', mail.outbox[0].body)
        self.assertIn(f"uid={credentials['uid']}&token={credentials['token']}", mail.outbox[0].body)

    def test_reset_matches_email_case_insensitively(self):
        make_user('alice', email='alice@example.com')

        self.client.post(REQUEST_URL, {'email': 'Alice@Example.COM'}, format='json')

        self.assertEqual(len(mail.outbox), 1)

    def test_reset_unknown_email_same_answer_no_mail(self):
        make_user('alice', email='alice@example.com')
        known = self.client.post(REQUEST_URL, {'email': 'alice@example.com'}, format='json')
        mail.outbox.clear()

        unknown = self.client.post(REQUEST_URL, {'email': 'nobody@example.com'}, format='json')

        self.assertEqual(unknown.status_code, known.status_code)
        self.assertEqual(unknown.data, known.data)
        self.assertEqual(mail.outbox, [])

    def test_reset_skips_inactive_and_passwordless_users(self):
        inactive = make_user('gone', email='gone@example.com')
        inactive.is_active = False
        inactive.save(update_fields=['is_active'])
        passwordless = make_user('sso', email='sso@example.com')
        passwordless.set_unusable_password()
        passwordless.save(update_fields=['password'])

        for email in ('gone@example.com', 'sso@example.com'):
            self.client.post(REQUEST_URL, {'email': email}, format='json')

        self.assertEqual(mail.outbox, [])

    def test_reset_without_an_email_is_not_a_server_error(self):
        for body in ({}, {'email': ''}, {'email': ['a@example.com']}):
            response = self.client.post(REQUEST_URL, body, format='json')
            self.assertEqual(response.status_code, 200)
        self.assertEqual(mail.outbox, [])

    def test_reset_smtp_failure_still_200(self):
        make_user('alice', email='alice@example.com')

        with mock.patch('users.reset.send_mail', side_effect=SMTPException('down')):
            with self.assertLogs('users.reset', 'ERROR'):
                response = self.client.post(
                    REQUEST_URL, {'email': 'alice@example.com'}, format='json'
                )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {'detail': ANSWER})

    def test_reset_throttled(self):
        for _ in range(5):
            ok = self.client.post(REQUEST_URL, {'email': 'x@example.com'}, format='json')
            self.assertEqual(ok.status_code, 200)

        sixth = self.client.post(REQUEST_URL, {'email': 'x@example.com'}, format='json')

        self.assertEqual(sixth.status_code, 429)


class ResetConfirmTests(AccountTestCase):
    def confirm(self, user, **overrides):
        payload = {**reset_credentials(user), 'new_password': NEW_PASSWORD, **overrides}
        return self.client.post(CONFIRM_URL, payload, format='json')

    def test_confirm_sets_password_and_ends_other_sessions(self):
        user = make_user('alice')
        old_refresh = RefreshToken.for_user(user)

        response = self.confirm(user)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            self.client.post(
                '/api/token/refresh/', {'refresh': str(old_refresh)}, format='json'
            ).status_code,
            401,
        )
        self.assertEqual(
            self.client.post(
                '/api/token/refresh/', {'refresh': response.data['refresh']}, format='json'
            ).status_code,
            200,
        )
        login = self.client.post(
            '/api/token/', {'username': 'alice', 'password': NEW_PASSWORD}, format='json'
        )
        self.assertEqual(login.status_code, 200)

    def test_confirm_token_single_use(self):
        user = make_user('alice')
        credentials = reset_credentials(user)
        payload = {**credentials, 'new_password': NEW_PASSWORD}

        first = self.client.post(CONFIRM_URL, payload, format='json')
        second = self.client.post(
            CONFIRM_URL, {**payload, 'new_password': 'another-Fresh-8820'}, format='json'
        )

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 400)
        self.assertEqual(second.data, {'detail': INVALID})

    def test_confirm_expired_token(self):
        user = make_user('alice')
        credentials = reset_credentials(user)

        with override_settings(PASSWORD_RESET_TIMEOUT=-1):
            response = self.client.post(
                CONFIRM_URL, {**credentials, 'new_password': NEW_PASSWORD}, format='json'
            )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data, {'detail': INVALID})

    def test_confirm_garbage_uid_or_token_is_invalid(self):
        user = make_user('alice')
        for overrides in ({'uid': 'zz'}, {'uid': '!!'}, {'token': 'nope'}, {'uid': 123}):
            response = self.confirm(user, **overrides)
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.data, {'detail': INVALID})

    def test_confirm_weak_password_is_a_field_error_and_keeps_token_usable(self):
        user = make_user('alice')
        credentials = reset_credentials(user)

        weak = self.client.post(
            CONFIRM_URL, {**credentials, 'new_password': '123'}, format='json'
        )
        strong = self.client.post(
            CONFIRM_URL, {**credentials, 'new_password': NEW_PASSWORD}, format='json'
        )

        self.assertEqual(weak.status_code, 400)
        self.assertIn('new_password', weak.data)
        self.assertEqual(strong.status_code, 200)

    def test_confirm_inactive_user_is_invalid(self):
        user = make_user('alice')
        credentials = reset_credentials(user)
        user.is_active = False
        user.save(update_fields=['is_active'])

        response = self.client.post(
            CONFIRM_URL, {**credentials, 'new_password': NEW_PASSWORD}, format='json'
        )

        self.assertEqual(response.status_code, 400)
