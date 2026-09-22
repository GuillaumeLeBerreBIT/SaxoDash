from datetime import timedelta
from unittest.mock import patch
from django.contrib.auth.models import User
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken
from .models import SaxoCredential, SyncRun
from . import client


class SaxoConnectViewTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='alex', password='pw')
        self.token = str(RefreshToken.for_user(self.user).access_token)

    def _ticket(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token}')
        ticket = self.client.post('/api/saxo/connect-ticket/').data['ticket']
        self.client.credentials()  # the ticket, not the JWT, authorises connect
        return ticket

    def test_ticket_endpoint_requires_authentication(self):
        self.assertEqual(self.client.post('/api/saxo/connect-ticket/').status_code, 401)

    def test_connect_without_a_ticket_is_forbidden(self):
        self.assertEqual(self.client.get('/api/saxo/connect/').status_code, 403)

    def test_connect_with_a_tampered_ticket_is_forbidden(self):
        response = self.client.get('/api/saxo/connect/?ticket=not.a.real.ticket')
        self.assertEqual(response.status_code, 403)

    def test_stale_ticket_is_forbidden(self):
        ticket = self._ticket()
        with patch('saxo.views.CONNECT_TICKET_MAX_AGE', -1):
            response = self.client.get(f'/api/saxo/connect/?ticket={ticket}')
        self.assertEqual(response.status_code, 403)

    def test_valid_ticket_redirects_to_saxo_authorize_url_and_sets_session_state(self):
        response = self.client.get(f'/api/saxo/connect/?ticket={self._ticket()}')
        self.assertEqual(response.status_code, 302)
        self.assertIn('sim.logonvalidation.net/authorize', response.url)
        self.assertIn('saxo_oauth_state', self.client.session)
        # The ticket rides in the URL; don't leak it to Saxo via Referer.
        self.assertEqual(response['Referrer-Policy'], 'no-referrer')

    def test_a_ticket_is_replayable_within_its_short_window(self):
        # Documented, bounded: a replayed ticket can only *start* a flow the user
        # must still complete at Saxo, and the callback is guarded by `state`.
        ticket = self._ticket()
        first = self.client.get(f'/api/saxo/connect/?ticket={ticket}')
        second = self.client.get(f'/api/saxo/connect/?ticket={ticket}')
        self.assertEqual(first.status_code, 302)
        self.assertEqual(second.status_code, 302)


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


class SaxoStatusFreshnessTest(APITestCase):
    """D6: freshness used to live on the credential, which re-auth deletes."""

    def setUp(self):
        user = User.objects.create_user(username='alex', password='pw')
        refresh = RefreshToken.for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
        self.cred = SaxoCredential.objects.create(
            access_token='a', refresh_token='b',
            expires_at=timezone.now() + timedelta(hours=1),
        )

    def test_a_task_that_always_fails_is_not_masked_by_another_that_works(self):
        SyncRun.objects.create(task='sync_positions', outcome='failed', detail='boom')
        SyncRun.objects.create(task='sync_account_balance', outcome='ok', rows=1)

        response = self.client.get('/api/saxo/status/')

        self.assertEqual(response.data['last_sync_outcome'], 'failed')
        self.assertEqual(response.data['failing_syncs'], ['sync_positions'])

    def test_reports_ok_only_when_every_task_last_succeeded(self):
        SyncRun.objects.create(task='sync_positions', outcome='failed')
        SyncRun.objects.create(task='sync_positions', outcome='ok', rows=5)
        SyncRun.objects.create(task='sync_account_balance', outcome='ok', rows=1)

        response = self.client.get('/api/saxo/status/')

        self.assertEqual(response.data['last_sync_outcome'], 'ok')
        self.assertEqual(response.data['failing_syncs'], [])

    def test_reports_the_last_successful_sync_not_the_last_attempt(self):
        SyncRun.objects.create(task='sync_positions', outcome='ok', rows=5)
        SyncRun.objects.create(task='sync_positions', outcome='skipped', detail='expired')

        response = self.client.get('/api/saxo/status/')

        self.assertIsNotNone(response.data['last_synced_at'])
        self.assertEqual(response.data['last_sync_outcome'], 'skipped')

    def test_freshness_survives_reauthentication(self):
        SyncRun.objects.create(task='sync_positions', outcome='ok', rows=5)

        # What SaxoCallbackView does on a reconnect.
        SaxoCredential.objects.all().delete()
        SaxoCredential.objects.create(
            access_token='new', refresh_token='new',
            expires_at=timezone.now() + timedelta(hours=1),
        )

        response = self.client.get('/api/saxo/status/')
        self.assertIsNotNone(response.data['last_synced_at'])

    def test_a_token_just_past_expiry_does_not_demand_reauthentication(self):
        # The refresh cycle catches this up within the minute.
        self.cred.expires_at = timezone.now() - timedelta(minutes=1)
        self.cred.save()

        response = self.client.get('/api/saxo/status/')
        self.assertFalse(response.data['needs_reauth'])

    def test_a_long_expired_token_does_demand_reauthentication(self):
        self.cred.expires_at = timezone.now() - timedelta(hours=2)
        self.cred.save()

        response = self.client.get('/api/saxo/status/')
        self.assertTrue(response.data['needs_reauth'])
