from datetime import timedelta
from unittest.mock import Mock, patch
from urllib.parse import parse_qs, urlparse
from cryptography.fernet import Fernet
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from backend import settings
from .models import SaxoCredential, SyncRun
from datetime import date as date_cls
from decimal import Decimal
from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken


from . import mapping
from . import client
from . import checks
from . import credentials

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
        'Currency': 'EUR',
    },
}

# What the SIM account actually returns, captured live 2026-09-03: no
# market-data entitlement, so no price at all - but Saxo still marks the book
# server-side, so ProfitLossOnTrade is real and recovers the price.
UNENTITLED_POSITION = {
    'PositionId': '5027270852',
    'PositionBase': {
        'Amount': 20.0,
        'OpenPrice': 494.36,
        'AssetType': 'Stock',
        'Uic': 261,
        'ExecutionTimeOpen': '2026-08-26T18:30:31.645781Z',
    },
    'PositionView': {
        'CurrentPrice': 0.0,
        'CurrentPriceType': 'None',
        'MarketValue': 0.0,
        'ProfitLossOnTrade': 314.60,
        'ConversionRateCurrent': 0.8600895,
    },
    'DisplayAndFormat': {
        'Symbol': 'MSFT:xnas',
        'Description': 'Microsoft Corp.',
        'Currency': 'USD',
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

    def test_carries_saxos_own_identity_for_the_instrument(self):
        # `type` is the app's own STOCK/ETF label; the Research page needs the
        # Uic and the AssetType spelled the way Saxo spells them.
        withuic = {
            **SAMPLE_POSITION,
            'PositionBase': {**SAMPLE_POSITION['PositionBase'], 'Uic': 211},
        }
        fields = mapping.to_position_fields(withuic)

        self.assertEqual(fields['uic'], 211)
        self.assertEqual(fields['asset_type'], 'Stock')

    def test_uic_is_none_when_saxo_omits_it(self):
        self.assertIsNone(mapping.to_position_fields(SAMPLE_POSITION)['uic'])


class UnentitledPositionPricingTest(TestCase):
    """The account has no market-data entitlement, which is the normal case here.

    Falling back to OpenPrice made value == cost and P/L == 0 for every row,
    every day - a wrong answer that looks like a plausible right one.
    """

    def test_does_not_report_the_open_price_as_the_market_price(self):
        fields = mapping.to_position_fields(UNENTITLED_POSITION)
        self.assertNotEqual(fields['current_price'], Decimal('494.36'))

    def test_derives_the_mark_from_profit_loss_on_trade(self):
        # 494.36 + 314.60/20, and the chart close that day was 510.12.
        fields = mapping.to_position_fields(UNENTITLED_POSITION)
        self.assertEqual(fields['current_price'], Decimal('510.09'))
        self.assertEqual(fields['price_source'], 'derived')

    def test_keeps_a_live_price_when_saxo_gives_one(self):
        fields = mapping.to_position_fields(SAMPLE_POSITION)
        self.assertEqual(fields['current_price'], Decimal('875.40'))
        self.assertEqual(fields['price_source'], 'live')

    def test_falls_back_to_cost_only_when_nothing_else_answers(self):
        blind = {
            **UNENTITLED_POSITION,
            'PositionView': {'CurrentPrice': 0.0, 'CurrentPriceType': 'None'},
        }
        fields = mapping.to_position_fields(blind)
        self.assertEqual(fields['current_price'], Decimal('494.36'))
        self.assertEqual(fields['price_source'], 'cost')

    def test_records_the_instrument_currency_and_its_rate(self):
        fields = mapping.to_position_fields(UNENTITLED_POSITION)
        self.assertEqual(fields['currency'], 'USD')
        self.assertEqual(fields['fx_rate'], Decimal('0.8600895'))

    def test_derived_mark_is_correct_for_a_short(self):
        # Amount and ProfitLossOnTrade are both signed, so one formula covers both.
        short = {
            **UNENTITLED_POSITION,
            'PositionBase': {**UNENTITLED_POSITION['PositionBase'], 'Amount': -20.0},
            'PositionView': {
                **UNENTITLED_POSITION['PositionView'], 'ProfitLossOnTrade': -314.60,
            },
        }
        self.assertEqual(mapping.to_position_fields(short)['current_price'],
                         Decimal('510.09'))

    def test_fractional_quantities_survive(self):
        fractional = {
            **UNENTITLED_POSITION,
            'PositionBase': {**UNENTITLED_POSITION['PositionBase'], 'Amount': 2.5},
        }
        self.assertEqual(mapping.to_position_fields(fractional)['qty'], Decimal('2.5'))


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

from portfolio.models import SAXO_SOURCE, PortfolioValuation, Position
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

        run = SyncRun.objects.get(task='sync_positions')
        self.assertEqual(run.outcome, 'ok')
        self.assertEqual(run.rows, 1)

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

    @patch('saxo.tasks.client.get_positions')
    def test_all_rows_failing_to_map_does_not_wipe_the_portfolio(self, mock_get_positions):
        # exclude(ticker__in=[]) matches every row, so an unguarded prune here
        # deletes the whole book on a payload we simply failed to read.
        Position.objects.create(
            ticker='NVDA', name='NVIDIA', qty=1, avg_cost=Decimal('1'),
            current_price=Decimal('1'), sector='Uncategorized', type='STOCK',
            color='#000000',
        )
        mock_get_positions.return_value = [{'unexpected': 'shape'}]
        with self.assertRaises(tasks.SyncRefused):
            tasks.sync_positions()

        self.assertTrue(Position.objects.filter(ticker='NVDA').exists())
        self.assertEqual(SyncRun.objects.get(task='sync_positions').outcome, 'failed')

    @patch('saxo.tasks.client.get_positions')
    def test_an_empty_saxo_response_still_prunes(self, mock_get_positions):
        # Holding nothing is a real answer, and differs from failing to read.
        Position.objects.create(
            ticker='NVDA', name='NVIDIA', qty=1, avg_cost=Decimal('1'),
            current_price=Decimal('1'), sector='Uncategorized', type='STOCK',
            color='#000000',
        )
        mock_get_positions.return_value = []
        tasks.sync_positions()

        self.assertEqual(Position.objects.count(), 0)

    @patch('saxo.tasks.client.get_positions')
    def test_records_the_price_provenance(self, mock_get_positions):
        mock_get_positions.return_value = [UNENTITLED_POSITION]
        tasks.sync_positions()

        position = Position.objects.get(ticker='MSFT')
        self.assertEqual(position.price_source, 'derived')
        self.assertEqual(position.currency, 'USD')
        self.assertIsNotNone(position.priced_at)


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
    def test_updates_the_synced_account_in_place(self, mock_get_balance):
        BankAccount.objects.create(
            bank='Saxo', type='Cash', iban_masked='-',
            balance=Decimal('850.00'), available=Decimal('850.00'),
            external_id=mapping.SAXO_CASH_ACCOUNT_ID,
        )
        mock_get_balance.return_value = {
            'CashBalance': 994104.45, 'CollateralAvailable': 992000.10,
            'Currency': 'EUR', 'NonMarginPositionsValue': 31571.91,
            'TotalValue': 1025676.36,
        }
        tasks.sync_account_balance()

        self.assertEqual(BankAccount.objects.count(), 1)
        account = BankAccount.objects.get(external_id=mapping.SAXO_CASH_ACCOUNT_ID)
        self.assertEqual(account.balance, Decimal('994104.45'))
        self.assertEqual(account.available, Decimal('992000.10'))

    @patch('saxo.tasks.client.get_account_balance')
    def test_records_saxos_own_valuation(self, mock_get_balance):
        mock_get_balance.return_value = {
            'CashBalance': 968435.55, 'CollateralAvailable': 968435.55,
            'Currency': 'EUR', 'NonMarginPositionsValue': 31571.91,
            'TotalValue': 1000007.46,
        }
        tasks.sync_account_balance()

        valuation = PortfolioValuation.objects.get(source=SAXO_SOURCE)
        self.assertEqual(valuation.currency, 'EUR')
        self.assertEqual(valuation.positions_value, Decimal('31571.91'))
        self.assertEqual(valuation.total_value, Decimal('1000007.46'))
        # The identity that makes this figure trustworthy.
        self.assertEqual(valuation.total_value - valuation.cash_balance,
                         valuation.positions_value)

    @patch('saxo.tasks.client.get_account_balance')
    def test_a_balance_without_a_valuation_writes_none(self, mock_get_balance):
        mock_get_balance.return_value = {
            'CashBalance': 100.00, 'CollateralAvailable': 100.00,
        }
        tasks.sync_account_balance()

        self.assertEqual(BankAccount.objects.count(), 1)
        self.assertFalse(PortfolioValuation.objects.exists())

    @patch('saxo.tasks.client.get_account_balance')
    def test_creates_the_row_when_absent(self, mock_get_balance):
        mock_get_balance.return_value = {
            'CashBalance': 100.00, 'CollateralAvailable': 100.00,
            'Currency': 'EUR', 'NonMarginPositionsValue': 0.00,
            'TotalValue': 100.00,
        }
        tasks.sync_account_balance()

        account = BankAccount.objects.get(external_id=mapping.SAXO_CASH_ACCOUNT_ID)
        self.assertEqual(account.balance, Decimal('100.00'))
        self.assertEqual(account.bank, 'Saxo')

    @patch('saxo.tasks.client.get_account_balance')
    def test_second_account_at_the_same_bank_does_not_break_the_sync(self, mock_get_balance):
        # update_or_create(bank='Saxo') raised MultipleObjectsReturned here.
        BankAccount.objects.create(
            bank='Saxo', type='Cash', iban_masked='-',
            balance=Decimal('850.00'), available=Decimal('850.00'),
            external_id=mapping.SAXO_CASH_ACCOUNT_ID,
        )
        BankAccount.objects.create(
            bank='Saxo', type='Savings', iban_masked='-',
            balance=Decimal('25.00'), available=Decimal('25.00'),
        )
        mock_get_balance.return_value = {
            'CashBalance': 300.00, 'CollateralAvailable': 300.00,
            'Currency': 'EUR', 'NonMarginPositionsValue': 0.00,
            'TotalValue': 300.00,
        }
        tasks.sync_account_balance()

        self.assertEqual(BankAccount.objects.filter(bank='Saxo').count(), 2)
        self.assertEqual(
            BankAccount.objects.get(external_id=mapping.SAXO_CASH_ACCOUNT_ID).balance,
            Decimal('300.00'),
        )
        # the hand-entered account is untouched
        self.assertEqual(
            BankAccount.objects.get(type='Savings').balance, Decimal('25.00')
        )


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


class SaxoMarketDataClientTest(TestCase):
    @patch('saxo.client.requests.get')
    def test_get_chart_returns_the_data_list(self, mock_get):
        mock_get.return_value = Mock(ok=True, json=lambda: {'Data': [{'Close': 1.0}]})

        result = client.get_chart('token', 211, 'Stock', 1440, count=66)

        self.assertEqual(result, [{'Close': 1.0}])
        params = mock_get.call_args.kwargs['params']
        self.assertEqual(params['Uic'], 211)
        self.assertEqual(params['AssetType'], 'Stock')
        self.assertEqual(params['Horizon'], 1440)
        self.assertEqual(params['Count'], 66)

    @patch('saxo.client.requests.get')
    def test_get_chart_does_not_ask_for_a_mode_without_a_time(self, mock_get):
        # Mode picks a side of a given Time, so Saxo rejects it on its own:
        # 400 InvalidModelState, "Time is not provided." Sending neither
        # returns the most recent Count samples, which is what the chart wants.
        # Confirmed against SIM 2026-09-02.
        mock_get.return_value = Mock(ok=True, json=lambda: {'Data': []})

        client.get_chart('token', 211, 'Stock', 1440, count=66)

        params = mock_get.call_args.kwargs['params']
        self.assertNotIn('Mode', params)
        self.assertNotIn('Time', params)

    @patch('saxo.client.requests.get')
    def test_get_chart_clamps_count_to_saxos_ceiling(self, mock_get):
        mock_get.return_value = Mock(ok=True, json=lambda: {'Data': []})

        client.get_chart('token', 211, 'Stock', 1440, count=99_999)

        self.assertEqual(mock_get.call_args.kwargs['params']['Count'], client.CHART_MAX_COUNT)

    @patch('saxo.client.requests.get')
    def test_get_chart_raises_on_api_error(self, mock_get):
        mock_get.return_value = Mock(ok=False, status_code=404, text='no such uic')

        with self.assertRaises(client.SaxoAPIError):
            client.get_chart('token', 211, 'Stock', 1440)

    @patch('saxo.client.requests.get')
    def test_search_instruments_passes_keywords_and_asset_types(self, mock_get):
        mock_get.return_value = Mock(ok=True, json=lambda: {'Data': [{'Symbol': 'NVDA:xnas'}]})

        result = client.search_instruments('token', 'nvda')

        self.assertEqual(result, [{'Symbol': 'NVDA:xnas'}])
        params = mock_get.call_args.kwargs['params']
        self.assertEqual(params['Keywords'], 'nvda')
        self.assertEqual(params['AssetTypes'], 'Stock,Etf')

    @patch('saxo.client.requests.get')
    def test_get_instrument_details_puts_uic_and_type_in_the_path(self, mock_get):
        mock_get.return_value = Mock(ok=True, json=lambda: {'Uic': 211})

        client.get_instrument_details('token', 211, 'Stock')

        self.assertIn('/ref/v1/instruments/details/211/Stock', mock_get.call_args.args[0])

    @patch('saxo.client.requests.get')
    def test_get_infoprices_joins_the_uics_into_one_request(self, mock_get):
        mock_get.return_value = Mock(ok=True, json=lambda: {'Data': [{'Uic': 211}]})

        result = client.get_infoprices('token', [211, 212], 'Stock')

        self.assertEqual(result, [{'Uic': 211}])
        self.assertEqual(mock_get.call_args.kwargs['params']['Uics'], '211,212')

    @patch('saxo.client.requests.get')
    def test_get_infoprices_raises_on_api_error(self, mock_get):
        mock_get.return_value = Mock(ok=False, status_code=429, text='too many requests')

        with self.assertRaises(client.SaxoAPIError):
            client.get_infoprices('token', [211], 'Stock')


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

    def test_past_the_grace_window_the_user_has_to_act(self):
        self._create(expires_at=timezone.now() - credentials.REAUTH_GRACE - timedelta(minutes=1))
        state = credentials.connection_state()

        self.assertFalse(state.usable)
        self.assertTrue(state.needs_reauth)


@override_settings(CELERY_TASK_ALWAYS_EAGER=True, CELERY_TASK_EAGER_PROPAGATES=True)
class SyncRunTest(TestCase):
    """D4: a sync that could not run used to be logged as a success."""

    @patch('saxo.tasks.client.get_positions')
    def test_a_skipped_sync_is_recorded_as_skipped(self, mock_get_positions):
        # No credential at all.
        tasks.sync_positions()

        run = SyncRun.objects.get(task='sync_positions')
        self.assertEqual(run.outcome, 'skipped')
        self.assertIn('not connected', run.detail)
        mock_get_positions.assert_not_called()

    @patch('saxo.tasks.client.get_positions')
    def test_an_expired_token_is_recorded_with_its_reason(self, mock_get_positions):
        SaxoCredential.objects.create(
            access_token='a', refresh_token='b',
            expires_at=timezone.now() - timedelta(minutes=1),
        )
        tasks.sync_positions()

        run = SyncRun.objects.get(task='sync_positions')
        self.assertEqual(run.outcome, 'skipped')
        self.assertIn('expired', run.detail)

    @patch('saxo.tasks.client.get_positions')
    def test_a_failing_sync_is_recorded_and_still_raises(self, mock_get_positions):
        SaxoCredential.objects.create(
            access_token='a', refresh_token='b',
            expires_at=timezone.now() + timedelta(hours=1),
        )
        mock_get_positions.side_effect = client.SaxoAPIError('gateway said no')

        with self.assertRaises(client.SaxoAPIError):
            tasks.sync_positions()

        self.assertEqual(SyncRun.objects.first().outcome, 'failed')


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
