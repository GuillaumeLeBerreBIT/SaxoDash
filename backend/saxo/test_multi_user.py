from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from cryptography.fernet import Fernet
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from portfolio.models import Position
from users.testing import make_user

from . import client, tasks
from .models import SaxoCredential, SyncRun
from .views import _connect_ticket_signer

TEST_KEY = Fernet.generate_key().decode()
LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}

SAMPLE_POSITION = {
    'PositionId': '5027270864',
    'PositionBase': {
        'Amount': 15,
        'OpenPrice': 412.30,
        'AssetType': 'Stock',
        'ExecutionTimeOpen': '2026-08-26T18:30:31.645781Z',
    },
    'PositionView': {'CurrentPrice': 875.40},
    'DisplayAndFormat': {'Symbol': 'NVDA:xnas', 'Description': 'NVIDIA Corporation', 'Currency': 'EUR'},
}

SAMPLE_CANDLE = {
    'Time': '2026-08-31T00:00:00.000000Z',
    'Open': 410.5, 'High': 419.0, 'Low': 408.25, 'Close': 417.8, 'Volume': 41_233_000,
}


def connect(user, token, **fields):
    return SaxoCredential.objects.create(
        user=user,
        access_token=token,
        refresh_token=f'{token}-refresh',
        expires_at=fields.pop('expires_at', timezone.now() + timedelta(hours=1)),
        **fields,
    )


def bearer(user):
    return f'Bearer {RefreshToken.for_user(user).access_token}'


@override_settings(SAXO_TOKEN_ENCRYPTION_KEY=TEST_KEY, CACHES=LOCMEM)
class CallbackTest(APITestCase):
    def setUp(self):
        cache.clear()
        self.alice = make_user('alice')
        self.bob = make_user('bob')

    def _connect_as(self, user, token):
        ticket = _connect_ticket_signer.sign(str(user.pk))
        with patch('saxo.views.client.build_authorize_url', return_value='https://saxo.example/authorize'):
            self.client.get(f'/api/saxo/connect/?ticket={ticket}')
        state = self.client.session['saxo_oauth_state']
        exchanged = {'access_token': token, 'refresh_token': f'{token}-r', 'expires_in': 1200}
        with patch('saxo.views.client.exchange_code_for_token', return_value=exchanged):
            return self.client.get(f'/api/saxo/callback/?code=abc&state={state}')

    def test_callback_attaches_credential_to_ticket_user(self):
        response = self._connect_as(self.bob, 'bob-token')

        self.assertIn('saxo=connected', response.url)
        credential = SaxoCredential.objects.get()
        self.assertEqual(credential.user, self.bob)
        self.assertEqual(credential.access_token, 'bob-token')

    def test_callback_replaces_only_own_credential(self):
        alices = connect(self.alice, 'alice-token')

        self._connect_as(self.bob, 'bob-token')

        alices.refresh_from_db()
        self.assertEqual(alices.access_token, 'alice-token')
        self.assertEqual(SaxoCredential.objects.get(user=self.bob).access_token, 'bob-token')

    def test_a_callback_without_a_connecting_user_is_refused(self):
        session = self.client.session
        session['saxo_oauth_state'] = 'matching-state'
        session.save()

        with patch('saxo.views.client.exchange_code_for_token') as exchange:
            response = self.client.get('/api/saxo/callback/?code=abc&state=matching-state')

        self.assertIn('saxo=error', response.url)
        exchange.assert_not_called()
        self.assertFalse(SaxoCredential.objects.exists())

    def test_status_is_per_user(self):
        connect(self.alice, 'alice-token')

        self.client.credentials(HTTP_AUTHORIZATION=bearer(self.alice))
        self.assertTrue(self.client.get('/api/saxo/status/').data['connected'])
        self.client.credentials(HTTP_AUTHORIZATION=bearer(self.bob))
        self.assertFalse(self.client.get('/api/saxo/status/').data['connected'])


@override_settings(
    SAXO_TOKEN_ENCRYPTION_KEY=TEST_KEY, CACHES=LOCMEM,
    CELERY_TASK_ALWAYS_EAGER=True, CELERY_TASK_EAGER_PROPAGATES=True,
)
class PerUserSyncTest(TestCase):
    def setUp(self):
        cache.clear()
        self.alice = make_user('alice', owner=True)
        self.bob = make_user('bob')

    def test_sync_positions_runs_for_every_connected_user(self):
        connect(self.alice, 'alice-token')
        connect(self.bob, 'bob-token')

        with patch('saxo.tasks.client.get_positions', return_value=[SAMPLE_POSITION]) as get_positions:
            tasks.sync_positions()

        self.assertCountEqual(
            [call.args[0] for call in get_positions.call_args_list], ['alice-token', 'bob-token'],
        )
        self.assertEqual(
            set(SyncRun.objects.filter(task='sync_positions', outcome='ok').values_list('user', flat=True)),
            {self.alice.pk, self.bob.pk},
        )

    def test_one_expired_user_does_not_stop_another(self):
        connect(self.alice, 'alice-token', needs_reauth=True)
        connect(self.bob, 'bob-token')

        with patch('saxo.tasks.client.get_positions', return_value=[SAMPLE_POSITION]) as get_positions, \
                self.assertLogs('saxo.tasks', 'INFO'):
            tasks.sync_positions()

        get_positions.assert_called_once_with('bob-token')
        alices = SyncRun.objects.get(task='sync_positions', user=self.alice)
        bobs = SyncRun.objects.get(task='sync_positions', user=self.bob)
        self.assertEqual(alices.outcome, 'skipped')
        self.assertEqual(bobs.outcome, 'ok')
        self.assertEqual(bobs.rows, 1)

    def test_a_failing_user_is_recorded_and_raised_after_the_others_ran(self):
        connect(self.alice, 'alice-token')
        connect(self.bob, 'bob-token')

        def positions(token):
            if token == 'alice-token':
                raise client.SaxoPermanentError('bad payload')
            return [SAMPLE_POSITION]

        with patch('saxo.tasks.client.get_positions', side_effect=positions), \
                self.assertRaises(client.SaxoPermanentError):
            tasks.sync_positions()

        self.assertEqual(SyncRun.objects.get(task='sync_positions', user=self.alice).outcome, 'failed')
        self.assertEqual(SyncRun.objects.get(task='sync_positions', user=self.bob).outcome, 'ok')

    def test_a_failing_user_has_its_partial_writes_rolled_back(self):
        connect(self.alice, 'alice-token')
        connect(self.bob, 'bob-token')

        @tasks.synced(reports_health=False, task='write_then_fail')
        def write_then_fail(credential):
            Position.objects.create(
                user=credential.user, ticker='NVDA', name='NVIDIA', qty=Decimal('1'),
                avg_cost=Decimal('1'), current_price=Decimal('1'), sector='Technology',
                type='STOCK', color='#111111',
            )
            if credential.user == self.alice:
                raise RuntimeError('after the write')
            return 1

        with self.assertRaises(RuntimeError):
            write_then_fail()

        self.assertEqual(list(Position.objects.values_list('user', flat=True)), [self.bob.pk])

    def test_refresh_token_refreshes_each_credential(self):
        soon = timezone.now() + timedelta(minutes=2)
        alices = connect(self.alice, 'alice-old', expires_at=soon)
        bobs = connect(self.bob, 'bob-old', expires_at=soon)

        def refreshed(refresh_token):
            fresh = refresh_token.replace('-old-refresh', '-new')
            return {'access_token': fresh, 'refresh_token': f'{fresh}-r', 'expires_in': 1200}

        with patch('saxo.tasks.client.refresh_access_token', side_effect=refreshed):
            tasks.refresh_saxo_token()

        alices.refresh_from_db()
        bobs.refresh_from_db()
        self.assertEqual(alices.access_token, 'alice-new')
        self.assertEqual(bobs.access_token, 'bob-new')

    def test_owner_tasks_use_owner_credential(self):
        connect(self.alice, 'alice-token')
        connect(self.bob, 'bob-token')

        with patch('research.tasks.scan.scan_universe', return_value=3) as scan_universe:
            from research import tasks as research_tasks
            research_tasks.scan_universe()

        scan_universe.assert_called_once_with(user=self.alice)
        run = SyncRun.objects.get(task='scan_universe')
        self.assertEqual((run.outcome, run.user), ('ok', self.alice))

    def test_an_owner_task_without_an_owner_is_skipped(self):
        self.alice.profile.is_owner = False
        self.alice.profile.save()
        connect(self.bob, 'bob-token')

        with patch('research.tasks.scan.scan_universe') as scan_universe, self.assertLogs('saxo.tasks', 'INFO'):
            from research import tasks as research_tasks
            research_tasks.scan_universe()

        scan_universe.assert_not_called()
        run = SyncRun.objects.get(task='scan_universe')
        self.assertEqual((run.outcome, run.user, run.detail), ('skipped', None, tasks.NO_OWNER))


@override_settings(SAXO_TOKEN_ENCRYPTION_KEY=TEST_KEY, CACHES=LOCMEM)
class PerUserMarketDataTest(APITestCase):
    def setUp(self):
        cache.clear()
        self.alice = make_user('alice')
        self.bob = make_user('bob')

    def test_unconnected_user_gets_409_even_when_chart_is_cached(self):
        connect(self.alice, 'alice-token')
        url = '/api/research/chart/?uic=211&asset_type=Stock&horizon=1440&count=10'

        with patch('saxo.client.get_chart', return_value=[SAMPLE_CANDLE]):
            self.client.credentials(HTTP_AUTHORIZATION=bearer(self.alice))
            self.assertEqual(self.client.get(url).status_code, 200)
            self.client.credentials(HTTP_AUTHORIZATION=bearer(self.bob))
            with self.assertLogs('django.request', 'WARNING'):
                self.assertEqual(self.client.get(url).status_code, 409)
