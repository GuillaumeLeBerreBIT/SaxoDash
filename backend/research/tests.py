from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import Mock, patch

from cryptography.fernet import Fernet
from django.conf import settings
from django.contrib.auth.models import User
from django.core.cache import cache
from django.db import transaction
from django.db.utils import IntegrityError
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken

from portfolio.models import Position
from saxo import client
from saxo.models import SaxoCredential

from . import earnings, finnhub, market, tasks
from .models import Watchlist, WatchlistItem
from .providers import ProviderUnavailable

TEST_KEY = Fernet.generate_key().decode()

# Redis is the real cache; these tests must not need it running, and must not
# leak entries into a developer's running instance.
LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}

SAMPLE_CANDLE = {
    'Time': '2026-08-31T00:00:00.000000Z',
    'Open': 410.5,
    'High': 419.0,
    'Low': 408.25,
    'Close': 417.8,
    'Volume': 41_233_000,
}

SAMPLE_INSTRUMENT = {
    'Identifier': 211,
    'AssetType': 'Stock',
    'Symbol': 'NVDA:xnas',
    'Description': 'NVIDIA Corporation',
    'ExchangeId': 'NASDAQ',
    'CurrencyCode': 'USD',
}

SAMPLE_INFOPRICE = {
    'Uic': 211,
    'AssetType': 'Stock',
    'Quote': {'Bid': 417.5, 'Ask': 417.9, 'Mid': 417.7},
    'PriceInfo': {'PercentChange': 1.42},
    'PriceInfoDetails': {'LastTraded': 417.8},
}

RAW_EARNINGS_ROW = {
    'symbol': 'AAPL', 'date': '2026-10-28', 'hour': 'amc',
    'quarter': 4, 'year': 2026,
    'epsEstimate': 2.0, 'epsActual': 2.2,
    'revenueEstimate': 115_000_000_000, 'revenueActual': 119_600_000_000,
}


class WatchlistModelTest(TestCase):
    def test_items_are_reachable_from_the_list(self):
        watchlist = Watchlist.objects.create(name='Tech')
        WatchlistItem.objects.create(watchlist=watchlist, symbol='NVDA', uic=211)

        self.assertEqual(watchlist.items.count(), 1)
        self.assertEqual(watchlist.items.first().symbol, 'NVDA')

    def test_the_same_instrument_cannot_be_added_twice(self):
        watchlist = Watchlist.objects.create(name='Tech')
        WatchlistItem.objects.create(watchlist=watchlist, symbol='NVDA', uic=211)

        with self.assertRaises(IntegrityError), transaction.atomic():
            WatchlistItem.objects.create(watchlist=watchlist, symbol='NVDA', uic=211)

    def test_one_symbol_on_two_exchanges_is_two_rows(self):
        watchlist = Watchlist.objects.create(name='Tech')
        WatchlistItem.objects.create(watchlist=watchlist, symbol='NVDA', uic=211, exchange='NASDAQ')
        WatchlistItem.objects.create(watchlist=watchlist, symbol='NVDA', uic=9876, exchange='XETR')

        self.assertEqual(watchlist.items.count(), 2)

    def test_the_same_symbol_may_sit_in_two_lists(self):
        first = Watchlist.objects.create(name='Tech')
        second = Watchlist.objects.create(name='Watching')
        WatchlistItem.objects.create(watchlist=first, symbol='NVDA', uic=211)
        WatchlistItem.objects.create(watchlist=second, symbol='NVDA', uic=211)

        self.assertEqual(WatchlistItem.objects.count(), 2)

    def test_deleting_a_list_deletes_its_items(self):
        watchlist = Watchlist.objects.create(name='Tech')
        WatchlistItem.objects.create(watchlist=watchlist, symbol='NVDA', uic=211)

        watchlist.delete()
        self.assertEqual(WatchlistItem.objects.count(), 0)


@override_settings(CELERY_TASK_ALWAYS_EAGER=True, CELERY_TASK_EAGER_PROPAGATES=True)
class SyncWatchlistsTaskTest(TestCase):
    """Mirrors open, uic-identified positions into a default watchlist.

    Reads Position directly instead of being handed rows by saxo.tasks -
    research owns watchlist semantics end to end, so a WatchlistItem shape
    change can no longer break the position sync.
    """

    def _position(self, ticker, uic):
        return Position.objects.create(
            ticker=ticker, name=ticker, qty=1, avg_cost=Decimal('1'),
            current_price=Decimal('1'), sector='Uncategorized', type='STOCK',
            color='#000000', uic=uic,
        )

    def test_adds_a_synced_position_to_the_open_positions_watchlist(self):
        self._position('NVDA', 211)
        tasks.sync_watchlists()

        watchlist = Watchlist.objects.get(name='Open positions')
        item = watchlist.items.get()
        self.assertEqual(item.uic, 211)
        self.assertEqual(item.symbol, 'NVDA')

    def test_removes_an_item_once_its_position_closes(self):
        position = self._position('NVDA', 211)
        tasks.sync_watchlists()
        position.delete()

        tasks.sync_watchlists()

        watchlist = Watchlist.objects.get(name='Open positions')
        self.assertEqual(watchlist.items.count(), 0)

    def test_leaves_other_watchlists_untouched(self):
        other = Watchlist.objects.create(name='My picks')
        WatchlistItem.objects.create(watchlist=other, symbol='AAPL', uic=999, asset_type='Stock')
        self._position('NVDA', 211)

        tasks.sync_watchlists()

        self.assertTrue(WatchlistItem.objects.filter(watchlist=other, uic=999).exists())

    def test_positions_without_a_uic_are_not_watchlisted(self):
        self._position('NVDA', None)
        tasks.sync_watchlists()

        self.assertEqual(WatchlistItem.objects.count(), 0)

    def test_recreates_the_watchlist_if_the_user_deleted_it(self):
        self._position('NVDA', 211)
        tasks.sync_watchlists()
        Watchlist.objects.get(name='Open positions').delete()

        tasks.sync_watchlists()

        self.assertTrue(Watchlist.objects.filter(name='Open positions').exists())


class WatchlistAPITest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='alex', password='pw')
        token = RefreshToken.for_user(self.user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_every_route_requires_authentication(self):
        watchlist = Watchlist.objects.create(name='Tech')
        item = WatchlistItem.objects.create(watchlist=watchlist, symbol='NVDA', uic=211)
        self.client.credentials()

        routes = [
            ('get', '/api/research/watchlists/'),
            ('post', '/api/research/watchlists/'),
            ('get', f'/api/research/watchlists/{watchlist.pk}/'),
            ('post', f'/api/research/watchlists/{watchlist.pk}/items/'),
            ('delete', f'/api/research/watchlists/{watchlist.pk}/items/{item.pk}/'),
        ]
        for method, url in routes:
            with self.subTest(url=url):
                response = getattr(self.client, method)(url)
                self.assertEqual(response.status_code, 401)

    def test_creates_and_lists_watchlists_unpaginated(self):
        self.client.post('/api/research/watchlists/', {'name': 'Tech'}, format='json')

        response = self.client.get('/api/research/watchlists/')
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.data, list)
        self.assertEqual(response.data[0]['name'], 'Tech')
        self.assertEqual(response.data[0]['items'], [])

    def test_renames_a_watchlist(self):
        watchlist = Watchlist.objects.create(name='Tech')

        response = self.client.patch(
            f'/api/research/watchlists/{watchlist.pk}/', {'name': 'Semis'}, format='json'
        )

        self.assertEqual(response.status_code, 200)
        watchlist.refresh_from_db()
        self.assertEqual(watchlist.name, 'Semis')

    def test_deletes_a_watchlist_and_its_items(self):
        watchlist = Watchlist.objects.create(name='Tech')
        WatchlistItem.objects.create(watchlist=watchlist, symbol='NVDA', uic=211)

        response = self.client.delete(f'/api/research/watchlists/{watchlist.pk}/')

        self.assertEqual(response.status_code, 204)
        self.assertEqual(WatchlistItem.objects.count(), 0)

    def test_adds_an_item_with_its_resolved_metadata(self):
        watchlist = Watchlist.objects.create(name='Tech')

        response = self.client.post(
            f'/api/research/watchlists/{watchlist.pk}/items/',
            {
                'symbol': 'NVDA',
                'uic': 211,
                'asset_type': 'Stock',
                'description': 'NVIDIA Corporation',
                'exchange': 'NASDAQ',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        item = watchlist.items.get()
        self.assertEqual(item.uic, 211)
        self.assertEqual(item.exchange, 'NASDAQ')

    def test_adding_a_duplicate_instrument_is_a_400(self):
        watchlist = Watchlist.objects.create(name='Tech')
        WatchlistItem.objects.create(watchlist=watchlist, symbol='NVDA', uic=211)

        response = self.client.post(
            f'/api/research/watchlists/{watchlist.pk}/items/',
            {'symbol': 'NVDA', 'uic': 211},
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(watchlist.items.count(), 1)

    def test_an_item_without_a_uic_is_rejected_rather_than_stored_unpriceable(self):
        watchlist = Watchlist.objects.create(name='Tech')

        response = self.client.post(
            f'/api/research/watchlists/{watchlist.pk}/items/',
            {'symbol': 'NVDA'},
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('uic', response.json())
        self.assertEqual(watchlist.items.count(), 0)

    def test_removes_an_item(self):
        watchlist = Watchlist.objects.create(name='Tech')
        item = WatchlistItem.objects.create(watchlist=watchlist, symbol='NVDA', uic=211)

        response = self.client.delete(
            f'/api/research/watchlists/{watchlist.pk}/items/{item.pk}/'
        )

        self.assertEqual(response.status_code, 204)
        self.assertEqual(watchlist.items.count(), 0)

    def test_cannot_remove_an_item_through_the_wrong_list(self):
        watchlist = Watchlist.objects.create(name='Tech')
        other = Watchlist.objects.create(name='Watching')
        item = WatchlistItem.objects.create(watchlist=watchlist, symbol='NVDA', uic=211)

        response = self.client.delete(f'/api/research/watchlists/{other.pk}/items/{item.pk}/')

        self.assertEqual(response.status_code, 404)
        self.assertEqual(WatchlistItem.objects.count(), 1)


class ShapingTest(TestCase):
    def test_candle_keeps_only_the_date_and_the_five_numbers(self):
        candle = market.to_candle(SAMPLE_CANDLE)

        self.assertEqual(
            candle,
            {
                'date': '2026-08-31',
                'open': 410.5,
                'high': 419.0,
                'low': 408.25,
                'close': 417.8,
                'volume': 41_233_000.0,
            },
        )

    def test_candle_falls_back_to_the_bid_series(self):
        candle = market.to_candle({
            'Time': '2026-08-31T00:00:00Z',
            'OpenBid': 1.1, 'HighBid': 1.3, 'LowBid': 1.0, 'CloseBid': 1.2,
        })

        self.assertEqual(candle['close'], 1.2)
        self.assertEqual(candle['volume'], 0)

    def test_candle_with_a_missing_price_is_dropped_rather_than_nulled(self):
        # `sma` adds with `+=`, so a null close would read as a zero and pull a
        # flat average onto the chart with nothing raised.
        self.assertIsNone(market.to_candle({**SAMPLE_CANDLE, 'Close': None}))
        self.assertIsNone(market.to_candle({k: v for k, v in SAMPLE_CANDLE.items() if k != 'Low'}))

    def test_candle_without_a_time_is_dropped(self):
        self.assertIsNone(market.to_candle({k: v for k, v in SAMPLE_CANDLE.items() if k != 'Time'}))

    def test_instrument_drops_the_exchange_suffix_from_the_symbol(self):
        self.assertEqual(market.to_instrument(SAMPLE_INSTRUMENT), {
            'symbol': 'NVDA',
            'uic': 211,
            'asset_type': 'Stock',
            'description': 'NVIDIA Corporation',
            'exchange': 'NASDAQ',
            'currency': 'USD',
        })

    def test_quote_prefers_the_last_traded_price(self):
        quote = market.to_quote(SAMPLE_INFOPRICE)

        self.assertEqual(quote['price'], 417.8)
        self.assertEqual(quote['change_pct'], 1.42)

    def test_quote_falls_back_to_mid_then_bid(self):
        no_trade = {**SAMPLE_INFOPRICE, 'PriceInfoDetails': {}}
        self.assertEqual(market.to_quote(no_trade)['price'], 417.7)

        bid_only = {'Uic': 211, 'Quote': {'Bid': 417.5}}
        self.assertEqual(market.to_quote(bid_only)['price'], 417.5)

    def test_quote_survives_a_row_with_no_prices_at_all(self):
        self.assertIsNone(market.to_quote({'Uic': 211})['price'])


@override_settings(SAXO_TOKEN_ENCRYPTION_KEY=TEST_KEY, CACHES=LOCMEM)
class MarketDataViewTest(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(username='alex', password='pw')
        token = RefreshToken.for_user(self.user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def _connect_saxo(self):
        return SaxoCredential.objects.create(
            access_token='access',
            refresh_token='refresh',
            expires_at=timezone.now() + timedelta(minutes=20),
        )

    def test_chart_requires_authentication(self):
        self.client.credentials()
        response = self.client.get('/api/research/chart/?uic=211&asset_type=Stock')
        self.assertEqual(response.status_code, 401)

    @patch('research.market.client.get_chart')
    def test_chart_returns_shaped_candles(self, mock_get_chart):
        self._connect_saxo()
        mock_get_chart.return_value = [SAMPLE_CANDLE]

        response = self.client.get('/api/research/chart/?uic=211&asset_type=Stock&count=66')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]['close'], 417.8)
        self.assertEqual(response.data[0]['date'], '2026-08-31')

    @patch('research.market.client.get_chart')
    def test_chart_sorts_oldest_first(self, mock_get_chart):
        self._connect_saxo()
        mock_get_chart.return_value = [
            {**SAMPLE_CANDLE, 'Time': '2026-08-31T00:00:00Z'},
            {**SAMPLE_CANDLE, 'Time': '2026-08-28T00:00:00Z'},
        ]

        response = self.client.get('/api/research/chart/?uic=211&asset_type=Stock')

        self.assertEqual([c['date'] for c in response.data], ['2026-08-28', '2026-08-31'])

    @patch('research.market.client.get_chart')
    def test_chart_is_served_from_cache_on_the_second_request(self, mock_get_chart):
        self._connect_saxo()
        mock_get_chart.return_value = [SAMPLE_CANDLE]

        url = '/api/research/chart/?uic=211&asset_type=Stock&count=66'
        self.client.get(url)
        self.client.get(url)

        self.assertEqual(mock_get_chart.call_count, 1)

    @patch('research.market.client.get_chart')
    def test_a_different_symbol_is_a_different_cache_entry(self, mock_get_chart):
        self._connect_saxo()
        mock_get_chart.return_value = [SAMPLE_CANDLE]

        self.client.get('/api/research/chart/?uic=211&asset_type=Stock')
        self.client.get('/api/research/chart/?uic=212&asset_type=Stock')

        self.assertEqual(mock_get_chart.call_count, 2)

    def test_the_status_endpoint_and_a_market_call_agree_inside_the_grace_window(self):
        # The header used to render "Saxo connected" while the panel below it
        # rendered "Saxo is not connected", for the 15 minutes between token
        # expiry and the reauth grace running out.
        SaxoCredential.objects.create(
            access_token='access',
            refresh_token='refresh',
            expires_at=timezone.now() - timedelta(minutes=1),
        )

        chart = self.client.get('/api/research/chart/?uic=211&asset_type=Stock')
        status_response = self.client.get('/api/saxo/status/')

        self.assertEqual(chart.status_code, 409)
        self.assertFalse(status_response.data['usable'])
        self.assertFalse(status_response.data['needs_reauth'])
        self.assertEqual(status_response.data['unusable_reason'], chart.data['detail'])

    def test_chart_rejects_a_missing_uic(self):
        self._connect_saxo()
        response = self.client.get('/api/research/chart/?asset_type=Stock')
        self.assertEqual(response.status_code, 400)

    def test_intraday_horizons_are_refused_rather_than_silently_flattened(self):
        # `to_candle` identifies a bar by its date; an intraday horizon would
        # collapse a session onto one key and draw the chart backwards.
        self._connect_saxo()
        for horizon in (1, 5, 60, 720):
            response = self.client.get(
                f'/api/research/chart/?uic=211&asset_type=Stock&horizon={horizon}'
            )
            self.assertEqual(response.status_code, 400, horizon)

    def test_chart_rejects_an_unknown_horizon(self):
        self._connect_saxo()
        response = self.client.get('/api/research/chart/?uic=211&asset_type=Stock&horizon=7')
        self.assertEqual(response.status_code, 400)

    def test_chart_is_409_when_saxo_is_not_connected(self):
        response = self.client.get('/api/research/chart/?uic=211&asset_type=Stock')

        self.assertEqual(response.status_code, 409)
        self.assertIn('detail', response.data)

    def test_chart_is_409_when_the_credential_needs_reauth(self):
        credential = self._connect_saxo()
        credential.needs_reauth = True
        credential.save(update_fields=['needs_reauth'])

        response = self.client.get('/api/research/chart/?uic=211&asset_type=Stock')
        self.assertEqual(response.status_code, 409)

    @patch('research.market.client.get_chart')
    def test_chart_is_502_when_saxo_fails(self, mock_get_chart):
        self._connect_saxo()
        mock_get_chart.side_effect = client.SaxoAPIError('boom')

        with self.assertLogs('research.providers', level='WARNING'):
            response = self.client.get('/api/research/chart/?uic=211&asset_type=Stock')

        self.assertEqual(response.status_code, 502)

    @patch('research.market.client.get_chart')
    def test_a_failed_chart_call_is_not_cached(self, mock_get_chart):
        self._connect_saxo()
        mock_get_chart.side_effect = client.SaxoAPIError('boom')

        url = '/api/research/chart/?uic=211&asset_type=Stock'
        with self.assertLogs('research.providers', level='WARNING'):
            self.client.get(url)
            self.client.get(url)

        self.assertEqual(mock_get_chart.call_count, 2)

    @patch('research.market.client.search_instruments')
    def test_search_returns_shaped_instruments(self, mock_search):
        self._connect_saxo()
        mock_search.return_value = [SAMPLE_INSTRUMENT]

        response = self.client.get('/api/research/instruments/?q=nvda')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]['symbol'], 'NVDA')
        self.assertEqual(response.data[0]['uic'], 211)

    @patch('research.market.client.search_instruments')
    def test_search_does_not_call_saxo_for_one_character(self, mock_search):
        self._connect_saxo()

        response = self.client.get('/api/research/instruments/?q=n')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])
        mock_search.assert_not_called()

    @patch('research.market.client.get_infoprices')
    def test_quotes_batches_every_uic_into_one_call(self, mock_infoprices):
        self._connect_saxo()
        mock_infoprices.return_value = [SAMPLE_INFOPRICE]

        response = self.client.get('/api/research/quotes/?uics=211,212,213&asset_type=Stock')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(mock_infoprices.call_count, 1)
        self.assertEqual(mock_infoprices.call_args.args[1], [211, 212, 213])

    @patch('research.market.client.get_infoprices')
    def test_quotes_without_uics_does_not_call_saxo(self, mock_infoprices):
        self._connect_saxo()

        response = self.client.get('/api/research/quotes/?uics=&asset_type=Stock')

        self.assertEqual(response.data, [])
        mock_infoprices.assert_not_called()

    def test_quotes_rejects_a_non_numeric_uic(self):
        self._connect_saxo()
        response = self.client.get('/api/research/quotes/?uics=abc&asset_type=Stock')
        self.assertEqual(response.status_code, 400)

    @patch('research.market.client.get_instrument_details')
    def test_details_returns_the_shaped_instrument(self, mock_details):
        self._connect_saxo()
        mock_details.return_value = {
            **SAMPLE_INSTRUMENT,
            'Uic': 211,
            'Exchange': {'ExchangeId': 'NASDAQ', 'Name': 'Nasdaq'},
            'Isin': 'US67066G1040',
        }

        response = self.client.get('/api/research/instruments/211/Stock/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['isin'], 'US67066G1040')
        self.assertEqual(response.data['exchange_name'], 'Nasdaq')


class FinnhubClientTest(TestCase):
    @override_settings(FINNHUB_API_KEY='')
    def test_raises_when_the_api_key_is_not_set(self):
        with self.assertRaises(finnhub.FinnhubNotConfigured):
            finnhub._get('/stock/profile2', symbol='AAPL')

    @override_settings(FINNHUB_API_KEY='test-key')
    @patch('research.finnhub.requests.get')
    def test_raises_on_a_non_200_response(self, mock_get):
        mock_get.return_value = Mock(ok=False, status_code=500, text='boom')

        with self.assertRaises(finnhub.FinnhubAPIError):
            finnhub._get('/stock/profile2', symbol='AAPL')

    @override_settings(FINNHUB_API_KEY='test-key')
    @patch('research.finnhub.requests.get')
    def test_returns_parsed_json_and_sends_the_token(self, mock_get):
        mock_get.return_value = Mock(ok=True, json=lambda: {'name': 'Apple Inc'})

        result = finnhub._get('/stock/profile2', symbol='AAPL')

        self.assertEqual(result, {'name': 'Apple Inc'})
        called_url = mock_get.call_args.args[0]
        called_params = mock_get.call_args.kwargs['params']
        self.assertEqual(called_url, 'https://finnhub.io/api/v1/stock/profile2')
        self.assertEqual(called_params, {'symbol': 'AAPL', 'token': 'test-key'})

    @override_settings(FINNHUB_API_KEY='test-key')
    @patch('research.finnhub.requests.get')
    def test_raises_on_a_non_json_response_body(self, mock_get):
        mock_get.return_value = Mock(ok=True, json=lambda: (_ for _ in ()).throw(ValueError('bad json')))

        with self.assertRaises(finnhub.FinnhubAPIError):
            finnhub._get('/stock/profile2', symbol='AAPL')

    @override_settings(FINNHUB_API_KEY='test-key')
    @patch('research.finnhub.requests.get')
    def test_get_profile_calls_the_profile_endpoint(self, mock_get):
        mock_get.return_value = Mock(ok=True, json=lambda: {'name': 'Apple Inc'})

        result = finnhub.get_profile('AAPL')

        self.assertEqual(result['name'], 'Apple Inc')
        self.assertEqual(mock_get.call_args.args[0], 'https://finnhub.io/api/v1/stock/profile2')
        self.assertEqual(mock_get.call_args.kwargs['params']['symbol'], 'AAPL')

    @override_settings(FINNHUB_API_KEY='test-key')
    @patch('research.finnhub.requests.get')
    def test_get_basic_financials_asks_for_every_metric(self, mock_get):
        mock_get.return_value = Mock(ok=True, json=lambda: {'metric': {}})

        finnhub.get_basic_financials('AAPL')

        self.assertEqual(mock_get.call_args.args[0], 'https://finnhub.io/api/v1/stock/metric')
        self.assertEqual(
            mock_get.call_args.kwargs['params'], {'symbol': 'AAPL', 'metric': 'all', 'token': 'test-key'}
        )

    @override_settings(FINNHUB_API_KEY='test-key')
    @patch('research.finnhub.requests.get')
    def test_get_recommendation_trends_calls_the_recommendation_endpoint(self, mock_get):
        mock_get.return_value = Mock(ok=True, json=lambda: [])

        finnhub.get_recommendation_trends('AAPL')

        self.assertEqual(mock_get.call_args.args[0], 'https://finnhub.io/api/v1/stock/recommendation')

    @override_settings(FINNHUB_API_KEY='test-key')
    @patch('research.finnhub.requests.get')
    def test_get_earnings_history_calls_the_earnings_endpoint(self, mock_get):
        mock_get.return_value = Mock(ok=True, json=lambda: [])

        finnhub.get_earnings_history('AAPL')

        self.assertEqual(mock_get.call_args.args[0], 'https://finnhub.io/api/v1/stock/earnings')


SAMPLE_PROFILE = {
    'name': 'Apple Inc',
    'exchange': 'NASDAQ',
    'finnhubIndustry': 'Technology',
    'logo': 'https://example.com/aapl.png',
    'marketCapitalization': 3_100_000.0,
    'shareOutstanding': 15_200.0,
}

SAMPLE_FINANCIALS = {
    'metric': {
        'peNormalizedAnnual': 32.1,
        'psTTM': 8.4,
        'pbAnnual': 48.2,
        'epsGrowth5Y': 12.5,
        'dividendYieldIndicatedAnnual': 0.44,
        'epsInclExtraItemsTTM': 6.13,
        '52WeekHigh': 260.1,
        '52WeekLow': 164.08,
        'roeTTM': 147.2,
        'netProfitMarginTTM': 26.3,
        'grossMarginTTM': 46.2,
        'beta': 1.24,
        'forwardPE': 28.5,
        'evEbitdaTTM': 22.3,
        'evRevenueTTM': 9.1,
        'currentRatioAnnual': 0.98,
        'roaTTM': 30.2,
        'roiTTM': 65.4,
        'dividendGrowthRate5Y': 5.1,
        'monthToDatePriceReturnDaily': 2.4,
        'yearToDatePriceReturnDaily': 18.7,
        '52WeekPriceReturnDaily': 31.2,
        'revenueGrowthTTMYoy': 14.2,
        'epsGrowthTTMYoy': 32.6,
        'revenueGrowth3Y': 1.8,
        'revenueGrowth5Y': 8.7,
        'epsGrowth3Y': 6.9,
        'operatingMarginTTM': 33.2,
        'operatingMargin5Y': 30.7,
        'grossMargin5Y': 44.5,
        'netProfitMargin5Y': 25.5,
        'totalDebt/totalEquityQuarterly': 0.78,
        'longTermDebt/equityQuarterly': 0.66,
        'netInterestCoverageTTM': 622.5,
        'quickRatioQuarterly': 0.93,
    }
}

SAMPLE_RECOMMENDATION = [
    {'buy': 20, 'hold': 8, 'period': '2026-09-01', 'sell': 1, 'strongBuy': 12, 'strongSell': 0},
    {'buy': 18, 'hold': 9, 'period': '2026-08-01', 'sell': 2, 'strongBuy': 11, 'strongSell': 0},
]

SAMPLE_EARNINGS = [
    {'period': '2026-06-30', 'actual': 1.65, 'estimate': 1.58, 'surprisePercent': 4.43},
    {'period': '2026-03-31', 'actual': 1.52, 'estimate': 1.5, 'surprisePercent': 1.33},
]


class FundamentalsShapingTest(TestCase):
    def test_shapes_the_combined_payload(self):
        result = finnhub.to_fundamentals(SAMPLE_PROFILE, SAMPLE_FINANCIALS, SAMPLE_RECOMMENDATION, SAMPLE_EARNINGS)

        self.assertEqual(result['name'], 'Apple Inc')
        self.assertEqual(result['market_cap'], 3_100_000.0)
        self.assertEqual(result['pe_ratio'], 32.1)
        self.assertEqual(result['week52_high'], 260.1)
        self.assertEqual(result['recommendation'], {
            'strong_buy': 12, 'buy': 20, 'hold': 8, 'sell': 1, 'strong_sell': 0, 'period': '2026-09-01',
        })

    def test_eps_history_is_oldest_first(self):
        result = finnhub.to_fundamentals(SAMPLE_PROFILE, SAMPLE_FINANCIALS, SAMPLE_RECOMMENDATION, SAMPLE_EARNINGS)

        self.assertEqual([row['period'] for row in result['eps_history']], ['2026-03-31', '2026-06-30'])

    def test_peg_ratio_is_computed_from_pe_and_five_year_eps_growth(self):
        result = finnhub.to_fundamentals(SAMPLE_PROFILE, SAMPLE_FINANCIALS, SAMPLE_RECOMMENDATION, SAMPLE_EARNINGS)

        self.assertAlmostEqual(result['peg_ratio'], 32.1 / 12.5, places=2)

    def test_a_metric_the_free_tier_does_not_return_is_none_not_zero(self):
        thin_financials = {'metric': {'peNormalizedAnnual': 32.1}}

        result = finnhub.to_fundamentals(SAMPLE_PROFILE, thin_financials, [], [])

        self.assertIsNone(result['dividend_yield'])
        self.assertIsNone(result['peg_ratio'])
        self.assertIsNone(result['recommendation'])
        self.assertEqual(result['eps_history'], [])
        self.assertIsNone(result['beta'])

    def test_shapes_the_extended_ratio_and_price_return_fields(self):
        result = finnhub.to_fundamentals(SAMPLE_PROFILE, SAMPLE_FINANCIALS, SAMPLE_RECOMMENDATION, SAMPLE_EARNINGS)

        self.assertEqual(result['beta'], 1.24)
        self.assertEqual(result['forward_pe'], 28.5)
        self.assertEqual(result['ev_ebitda'], 22.3)
        self.assertEqual(result['ev_revenue'], 9.1)
        self.assertEqual(result['current_ratio'], 0.98)
        self.assertEqual(result['roa'], 30.2)
        self.assertEqual(result['roi'], 65.4)
        self.assertEqual(result['dividend_growth_5y'], 5.1)
        self.assertEqual(result['price_return_1m'], 2.4)
        self.assertEqual(result['price_return_ytd'], 18.7)
        self.assertEqual(result['price_return_1y'], 31.2)

    def test_shapes_the_growth_and_leverage_fields(self):
        result = finnhub.to_fundamentals(
            SAMPLE_PROFILE, SAMPLE_FINANCIALS, SAMPLE_RECOMMENDATION, SAMPLE_EARNINGS
        )
        self.assertEqual(result['revenue_growth_ttm_yoy'], 14.2)
        self.assertEqual(result['eps_growth_ttm_yoy'], 32.6)
        self.assertEqual(result['revenue_growth_3y'], 1.8)
        self.assertEqual(result['revenue_growth_5y'], 8.7)
        self.assertEqual(result['eps_growth_3y'], 6.9)
        self.assertEqual(result['operating_margin_ttm'], 33.2)
        self.assertEqual(result['operating_margin_5y'], 30.7)
        self.assertEqual(result['gross_margin_5y'], 44.5)
        self.assertEqual(result['net_margin_5y'], 25.5)
        self.assertEqual(result['debt_to_equity'], 0.78)
        self.assertEqual(result['long_term_debt_to_equity'], 0.66)
        self.assertEqual(result['interest_coverage'], 622.5)
        self.assertEqual(result['quick_ratio'], 0.93)

    def test_growth_and_leverage_fields_absent_from_the_free_tier_are_none(self):
        result = finnhub.to_fundamentals(
            SAMPLE_PROFILE, {'metric': {'peNormalizedAnnual': 32.1}},
            SAMPLE_RECOMMENDATION, SAMPLE_EARNINGS,
        )
        self.assertIsNone(result['revenue_growth_ttm_yoy'])
        self.assertIsNone(result['debt_to_equity'])
        self.assertIsNone(result['interest_coverage'])

    def test_cache_key_carries_the_shape_version(self):
        self.assertEqual(finnhub._cache_key('AAPL'), 'research:fundamentals:v2:AAPL')


class EarningsShapingTest(TestCase):
    def test_renames_finnhub_fields_to_snake_case(self):
        event = earnings._shape(RAW_EARNINGS_ROW)
        self.assertEqual(event, {
            'symbol': 'AAPL', 'date': '2026-10-28', 'session': 'amc',
            'quarter': 4, 'year': 2026,
            'eps_estimate': 2.0, 'eps_actual': 2.2,
            'revenue_estimate': 115_000_000_000, 'revenue_actual': 119_600_000_000,
            'eps_surprise_pct': 10.0, 'revenue_surprise_pct': 4.0,
        })

    def test_revenue_surprise_is_none_without_an_actual(self):
        row = {k: v for k, v in RAW_EARNINGS_ROW.items() if k != 'revenueActual'}
        self.assertIsNone(earnings._shape(row)['revenue_surprise_pct'])

    def test_empty_hour_becomes_none(self):
        self.assertIsNone(earnings._shape({**RAW_EARNINGS_ROW, 'hour': ''})['session'])
        self.assertIsNone(earnings._shape({k: v for k, v in RAW_EARNINGS_ROW.items() if k != 'hour'})['session'])

    def test_surprise_is_none_without_both_values(self):
        self.assertIsNone(earnings._shape({**RAW_EARNINGS_ROW, 'epsActual': None})['eps_surprise_pct'])

    def test_surprise_is_none_when_estimate_is_zero(self):
        self.assertIsNone(earnings._surprise(0, 1.2))

    def test_surprise_handles_a_negative_estimate(self):
        # A miss against a -0.10 estimate that came in at -0.20 is -100%, not +100%.
        self.assertEqual(earnings._surprise(-0.10, -0.20), -100.0)


class WeekStatsTest(TestCase):
    def _ev(self, date_, surprise, mine=False):
        return {'date': date_, 'eps_surprise_pct': surprise, 'mine': mine}

    def test_counts_beats_misses_and_in_line_reports(self):
        stats = earnings._week_stats([
            self._ev('2026-10-26', 4.0),
            self._ev('2026-10-26', -2.0),
            self._ev('2026-10-27', 0.0),
            self._ev('2026-10-28', None),  # not yet reported
        ])
        self.assertEqual(stats['total'], 4)
        self.assertEqual(stats['reported'], 3)
        self.assertEqual((stats['beat'], stats['missed'], stats['inline']), (1, 1, 1))
        self.assertEqual(stats['avg_surprise'], round((4.0 - 2.0 + 0.0) / 3, 2))

    def test_by_day_carries_the_split_per_date_oldest_first(self):
        stats = earnings._week_stats([
            self._ev('2026-10-27', 5.0),
            self._ev('2026-10-26', 5.0),
            self._ev('2026-10-26', 5.0),
            self._ev('2026-10-26', -5.0),
            self._ev('2026-10-26', 0.0),
        ])
        self.assertEqual(stats['by_day'], [
            {'date': '2026-10-26', 'beat': 2, 'missed': 1, 'inline': 1},
            {'date': '2026-10-27', 'beat': 1, 'missed': 0, 'inline': 0},
        ])

    def test_empty_week_has_no_average_and_no_days(self):
        stats = earnings._week_stats([])
        self.assertIsNone(stats['avg_surprise'])
        self.assertEqual(stats['by_day'], [])
        self.assertEqual((stats['reported'], stats['mine']), (0, 0))

    def test_counts_tagged_rows(self):
        stats = earnings._week_stats([
            self._ev('2026-10-26', None, mine=True),
            self._ev('2026-10-26', None),
        ])
        self.assertEqual(stats['mine'], 1)


class ScoreTest(TestCase):
    def _h(self, *surprises):
        return [{'eps_surprise_pct': s} for s in surprises]

    def test_beat_rate_and_average_over_reported_quarters(self):
        score = earnings._score(self._h(3.0, -1.0, 5.0, 2.0))
        self.assertEqual((score['beats'], score['quarters']), (3, 4))
        self.assertEqual(score['beat_rate'], 0.75)
        self.assertEqual(score['avg_surprise'], round((3.0 - 1.0 + 5.0 + 2.0) / 4, 2))

    def test_streak_counts_consecutive_beats_from_the_latest_quarter(self):
        # oldest-first: a miss then three beats -> streak of 3.
        self.assertEqual(earnings._score(self._h(-2.0, 1.0, 1.0, 1.0))['streak'], 3)
        self.assertEqual(earnings._score(self._h(1.0, 1.0, -0.5))['streak'], 0)

    def test_ignores_quarters_with_no_surprise_figure(self):
        score = earnings._score(self._h(None, 4.0, None))
        self.assertEqual((score['beats'], score['quarters']), (1, 1))

    def test_streak_skips_gaps_rather_than_breaking_on_them(self):
        # a missing figure between beats is not a miss - the streak continues.
        self.assertEqual(earnings._score(self._h(2.0, None, 1.0))['streak'], 2)

    def test_empty_history_scores_zero(self):
        self.assertEqual(
            earnings._score([]),
            {'beats': 0, 'quarters': 0, 'beat_rate': None, 'avg_surprise': None, 'streak': 0},
        )


class EarningsCalendarClientTest(TestCase):
    @override_settings(FINNHUB_API_KEY='test-key')
    @patch('research.finnhub.requests.get')
    def test_calls_the_calendar_endpoint_with_the_symbol_and_window(self, mock_get):
        mock_get.return_value = Mock(ok=True, status_code=200)
        mock_get.return_value.json.return_value = {'earningsCalendar': []}

        finnhub.get_earnings_calendar('AAPL', '2026-06-01', '2026-12-31')

        (url,), kwargs = mock_get.call_args
        self.assertEqual(url, 'https://finnhub.io/api/v1/calendar/earnings')
        self.assertEqual(kwargs['params']['symbol'], 'AAPL')
        self.assertEqual(kwargs['params']['from'], '2026-06-01')
        self.assertEqual(kwargs['params']['to'], '2026-12-31')

    @override_settings(FINNHUB_API_KEY='test-key')
    @patch('research.finnhub.requests.get')
    def test_a_falsy_symbol_omits_the_symbol_param_for_the_whole_market(self, mock_get):
        mock_get.return_value = Mock(ok=True, status_code=200)
        mock_get.return_value.json.return_value = {'earningsCalendar': []}

        finnhub.get_earnings_calendar(None, '2026-06-01', '2026-06-07')

        _, kwargs = mock_get.call_args
        self.assertNotIn('symbol', kwargs['params'])


@override_settings(CACHES=LOCMEM, FINNHUB_API_KEY='test-key')
class FundamentalsNoDataTest(TestCase):
    def setUp(self):
        cache.clear()

    @patch('research.finnhub.get_earnings_history')
    @patch('research.finnhub.get_recommendation_trends')
    @patch('research.finnhub.get_basic_financials')
    @patch('research.finnhub.get_profile')
    def test_a_profile_with_no_name_raises_finnhub_no_data(
        self, mock_profile, mock_financials, mock_recs, mock_earnings
    ):
        mock_profile.return_value = {}

        with self.assertRaises(finnhub.FinnhubNoData):
            finnhub.fundamentals('ZZZZZZ')

        mock_financials.assert_not_called()
        mock_recs.assert_not_called()
        mock_earnings.assert_not_called()

    @patch('research.finnhub.get_profile')
    def test_a_no_data_result_is_not_cached(self, mock_profile):
        mock_profile.return_value = {}

        with self.assertRaises(finnhub.FinnhubNoData):
            finnhub.fundamentals('ZZZZZZ')

        self.assertIsNone(cache.get(finnhub._cache_key('ZZZZZZ')))


@override_settings(CACHES=LOCMEM)
class FundamentalsCacheTest(TestCase):
    def setUp(self):
        cache.clear()

    @patch('research.finnhub.get_earnings_history')
    @patch('research.finnhub.get_recommendation_trends')
    @patch('research.finnhub.get_basic_financials')
    @patch('research.finnhub.get_profile')
    def test_a_second_call_for_the_same_symbol_does_not_refetch(
        self, mock_profile, mock_financials, mock_recs, mock_earnings
    ):
        mock_profile.return_value = SAMPLE_PROFILE
        mock_financials.return_value = SAMPLE_FINANCIALS
        mock_recs.return_value = SAMPLE_RECOMMENDATION
        mock_earnings.return_value = SAMPLE_EARNINGS

        finnhub.fundamentals('AAPL')
        finnhub.fundamentals('AAPL')

        self.assertEqual(mock_profile.call_count, 1)


@override_settings(SAXO_TOKEN_ENCRYPTION_KEY=TEST_KEY, CACHES=LOCMEM, FINNHUB_API_KEY='test-key')
class FundamentalsViewTest(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(username='alex', password='pw')
        token = RefreshToken.for_user(self.user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_requires_authentication(self):
        self.client.credentials()
        response = self.client.get('/api/research/fundamentals/AAPL/')
        self.assertEqual(response.status_code, 401)

    @patch('research.finnhub.get_earnings_history')
    @patch('research.finnhub.get_recommendation_trends')
    @patch('research.finnhub.get_basic_financials')
    @patch('research.finnhub.get_profile')
    def test_returns_available_true_with_shaped_data(
        self, mock_profile, mock_financials, mock_recs, mock_earnings
    ):
        mock_profile.return_value = SAMPLE_PROFILE
        mock_financials.return_value = SAMPLE_FINANCIALS
        mock_recs.return_value = SAMPLE_RECOMMENDATION
        mock_earnings.return_value = SAMPLE_EARNINGS

        response = self.client.get('/api/research/fundamentals/AAPL/')

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['available'])
        self.assertEqual(response.data['name'], 'Apple Inc')

    @override_settings(FINNHUB_API_KEY='')
    def test_returns_available_false_when_not_configured(self):
        response = self.client.get('/api/research/fundamentals/AAPL/')

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['available'])
        self.assertIn('reason', response.data)

    @patch('research.finnhub.get_profile')
    def test_returns_available_false_on_a_finnhub_error(self, mock_profile):
        mock_profile.side_effect = finnhub.FinnhubAPIError('boom')

        response = self.client.get('/api/research/fundamentals/AAPL/')

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['available'])

    @patch('research.finnhub.get_earnings_history')
    @patch('research.finnhub.get_recommendation_trends')
    @patch('research.finnhub.get_basic_financials')
    @patch('research.finnhub.get_profile')
    def test_returns_available_false_on_malformed_finnhub_response(
        self, mock_profile, mock_financials, mock_recs, mock_earnings
    ):
        """Test that a malformed Finnhub payload (unexpected shape) still returns 200."""
        mock_profile.return_value = SAMPLE_PROFILE
        mock_financials.return_value = SAMPLE_FINANCIALS
        # Return a dict instead of a list - this will cause TypeError when
        # to_fundamentals tries to do recommendations[0]
        mock_recs.return_value = {'error': 'unexpected'}
        mock_earnings.return_value = SAMPLE_EARNINGS

        with self.assertLogs('research.providers', level='ERROR'):
            response = self.client.get('/api/research/fundamentals/AAPL/')

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['available'])
        self.assertEqual(response.data['reason'], 'Fundamentals data is unavailable.')

    @patch('research.finnhub.get_profile')
    def test_returns_available_false_for_a_symbol_finnhub_does_not_recognize(self, mock_profile):
        mock_profile.return_value = {}

        response = self.client.get('/api/research/fundamentals/ZZZZZZ/')

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['available'])
        self.assertIn('reason', response.data)

    def test_rejects_a_malformed_symbol(self):
        response = self.client.get('/api/research/fundamentals/AAPL%20US/')
        self.assertEqual(response.status_code, 400)


# ScopedRateThrottle caches THROTTLE_RATES on the class at import, so
# override_settings can't reach it - patch the dict directly.
@patch.dict(
    ScopedRateThrottle.THROTTLE_RATES,
    {'research.search': '3/min', 'research.market': '3/min'},
)
@override_settings(CACHES=LOCMEM)
class ThrottleTest(APITestCase):
    def setUp(self):
        cache.clear()
        user = User.objects.create_user(username='alex', password='pw')
        token = RefreshToken.for_user(user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_search_is_throttled_past_its_scope_rate(self):
        # q=n stays under the 2-char floor, so it answers 200 without touching
        # Saxo - but the throttle still counts every request.
        codes = [
            self.client.get('/api/research/instruments/?q=n').status_code
            for _ in range(4)
        ]
        self.assertEqual(codes[:3], [200, 200, 200])
        self.assertEqual(codes[3], 429)

    def test_a_different_scope_keeps_its_own_budget(self):
        for _ in range(3):
            self.client.get('/api/research/instruments/?q=n')
        # search is now exhausted; a market-scope call has its own budget.
        response = self.client.get('/api/research/chart/?uic=211&asset_type=Stock')
        self.assertNotEqual(response.status_code, 429)


class ThrottleScopeConfigTest(TestCase):
    """A typo'd throttle_scope silently disables the limit - ScopedRateThrottle
    treats an unknown scope as unlimited and every other test still passes."""

    def test_every_proxy_view_scope_has_a_configured_rate(self):
        from research import views as research_views

        rates = settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']
        for view in (
            research_views.ChartView,
            research_views.InstrumentSearchView,
            research_views.InstrumentDetailsView,
            research_views.QuotesView,
            research_views.FundamentalsView,
            research_views.EarningsCalendarView,
            research_views.SymbolEarningsView,
        ):
            self.assertIn(view.throttle_scope, rates, view.__name__)


@override_settings(CACHES=LOCMEM, FINNHUB_API_KEY='test-key')
@override_settings(CACHES=LOCMEM, FINNHUB_API_KEY='test-key')
class WindowEarningsTest(TestCase):
    def setUp(self):
        cache.clear()

    def _row(self, symbol, date_, actual=None):
        return {
            'symbol': symbol, 'date': date_, 'hour': 'amc', 'quarter': 1, 'year': 2026,
            'epsEstimate': 1.0, 'epsActual': actual,
            'revenueEstimate': 1_000, 'revenueActual': None,
        }

    def _monday(self, week_offset=0):
        today = date.today()
        return today - timedelta(days=today.weekday()) + timedelta(weeks=week_offset)

    @patch('research.earnings.finnhub.get_earnings_calendar')
    def test_one_whole_market_call_for_the_week_no_symbol(self, mock_cal):
        mon = self._monday()
        mock_cal.return_value = {'earningsCalendar': [self._row('AAPL', mon.isoformat())]}

        result = earnings.window_earnings('all', 0)

        self.assertEqual(mock_cal.call_count, 1)
        (symbol, date_from, date_to), _ = mock_cal.call_args
        self.assertIsNone(symbol)
        self.assertEqual(date_from, mon.isoformat())
        self.assertEqual(date_to, (mon + timedelta(days=6)).isoformat())
        self.assertTrue(result['ok'])
        self.assertEqual(result['window'], {
            'from': mon.isoformat(), 'to': (mon + timedelta(days=6)).isoformat(), 'week': 0,
        })

    @patch('research.earnings.finnhub.get_earnings_calendar')
    def test_week_offset_shifts_the_window_by_seven_days(self, mock_cal):
        mock_cal.return_value = {'earningsCalendar': []}
        earnings.window_earnings('all', 2)
        (_, date_from, _), _ = mock_cal.call_args
        self.assertEqual(date_from, self._monday(2).isoformat())

    @patch('research.earnings.finnhub.get_earnings_calendar')
    def test_rows_are_tagged_held_and_watched(self, mock_cal):
        Position.objects.create(
            ticker='AAPL', name='Apple', qty=1, avg_cost=1, current_price=1,
            sector='Tech', type='STOCK', color='#fff',
        )
        wl = Watchlist.objects.create(name='Tech')
        WatchlistItem.objects.create(watchlist=wl, symbol='MSFT', uic=2)
        mon = self._monday().isoformat()
        mock_cal.return_value = {'earningsCalendar': [
            self._row('AAPL', mon), self._row('MSFT', mon), self._row('TSLA', mon),
        ]}

        by_symbol = {e['symbol']: e for e in earnings.window_earnings('all', 0)['events']}

        self.assertEqual((by_symbol['AAPL']['held'], by_symbol['AAPL']['watched'], by_symbol['AAPL']['mine']), (True, False, True))
        self.assertEqual((by_symbol['MSFT']['held'], by_symbol['MSFT']['watched'], by_symbol['MSFT']['mine']), (False, True, True))
        self.assertEqual((by_symbol['TSLA']['held'], by_symbol['TSLA']['watched'], by_symbol['TSLA']['mine']), (False, False, False))

    @patch('research.earnings.finnhub.get_earnings_calendar')
    def test_mine_scope_keeps_only_tagged_rows(self, mock_cal):
        Position.objects.create(
            ticker='AAPL', name='Apple', qty=1, avg_cost=1, current_price=1,
            sector='Tech', type='STOCK', color='#fff',
        )
        mon = self._monday().isoformat()
        mock_cal.return_value = {'earningsCalendar': [self._row('AAPL', mon), self._row('TSLA', mon)]}

        result = earnings.window_earnings('mine', 0)

        self.assertEqual([e['symbol'] for e in result['events']], ['AAPL'])

    @patch('research.earnings.finnhub.get_earnings_calendar')
    def test_all_scope_drops_rows_with_no_consensus_estimate_unless_held(self, mock_cal):
        Position.objects.create(
            ticker='AAPL', name='Apple', qty=1, avg_cost=1, current_price=1,
            sector='Tech', type='STOCK', color='#fff',
        )
        mon = self._monday().isoformat()
        mock_cal.return_value = {'earningsCalendar': [
            self._row('COVR', mon),
            {**self._row('OTCX', mon), 'epsEstimate': None},
            {**self._row('AAPL', mon), 'epsEstimate': None},
        ]}

        symbols = [e['symbol'] for e in earnings.window_earnings('all', 0)['events']]

        self.assertIn('COVR', symbols)
        self.assertIn('AAPL', symbols)  # no estimate, but held
        self.assertNotIn('OTCX', symbols)

    @patch('research.earnings.finnhub.get_earnings_calendar')
    def test_the_week_is_fetched_once_then_served_from_cache(self, mock_cal):
        mock_cal.return_value = {'earningsCalendar': [self._row('AAPL', self._monday().isoformat())]}

        earnings.window_earnings('all', 0)
        earnings.window_earnings('mine', 0)

        self.assertEqual(mock_cal.call_count, 1)

    @patch('research.earnings.finnhub.get_earnings_calendar')
    def test_the_response_carries_week_stats_for_the_shown_rows(self, mock_cal):
        mon = self._monday().isoformat()
        mock_cal.return_value = {'earningsCalendar': [
            {**self._row('BEAT', mon, actual=1.2)},   # est 1.0 -> +20%
            {**self._row('MISS', mon, actual=0.8)},   # est 1.0 -> -20%
            self._row('SOON', mon),                   # not reported
        ]}

        stats = earnings.window_earnings('all', 0)['stats']

        self.assertEqual((stats['total'], stats['reported']), (3, 2))
        self.assertEqual((stats['beat'], stats['missed']), (1, 1))
        self.assertEqual(stats['by_day'], [{'date': mon, 'beat': 1, 'missed': 1, 'inline': 0}])

    @patch('research.earnings.finnhub.get_earnings_calendar')
    def test_dateless_rows_are_dropped(self, mock_cal):
        mon = self._monday().isoformat()
        mock_cal.return_value = {'earningsCalendar': [self._row('AAPL', mon), self._row('AAPL', None)]}

        result = earnings.window_earnings('all', 0)

        self.assertEqual([e['date'] for e in result['events']], [mon])

    @patch('research.earnings.finnhub.get_earnings_calendar')
    def test_a_provider_failure_degrades_to_ok_false_and_no_events(self, mock_cal):
        mock_cal.side_effect = finnhub.FinnhubAPIError('/calendar/earnings failed: 500')

        result = earnings.window_earnings('all', 0)

        self.assertFalse(result['ok'])
        self.assertEqual(result['events'], [])
        self.assertIn('from', result['window'])

    @patch('research.earnings.finnhub.get_earnings_calendar', return_value={'earningsCalendar': []})
    def test_the_current_week_caches_briefly_and_settled_weeks_do_not(self, _mock_cal):
        with patch('research.earnings.cache.get_or_set', wraps=cache.get_or_set) as spy:
            earnings.window_earnings('all', 0)
            self.assertEqual(spy.call_args.args[2], earnings.CURRENT_WEEK_TTL)
            earnings.window_earnings('all', 3)
            self.assertEqual(spy.call_args.args[2], finnhub.EARNINGS_CAL_TTL)


@override_settings(CACHES=LOCMEM, FINNHUB_API_KEY='test-key')
class SymbolEarningsTest(TestCase):
    def setUp(self):
        cache.clear()

    @patch('research.earnings.finnhub.get_earnings_calendar')
    @patch('research.earnings.finnhub.get_earnings_history')
    def test_history_comes_from_stock_earnings_and_next_from_the_calendar(self, mock_hist, mock_cal):
        mock_hist.return_value = [
            {'period': '2026-06-30', 'actual': 1.6, 'estimate': 1.5, 'surprisePercent': 6.7},
            {'period': '2026-03-31', 'actual': 1.4, 'estimate': 1.45, 'surprisePercent': -3.4},
        ]
        future = (date.today() + timedelta(days=30)).isoformat()
        mock_cal.return_value = {'earningsCalendar': [
            {'symbol': 'AAPL', 'date': future, 'hour': 'amc', 'quarter': 1, 'year': 2027,
             'epsEstimate': 2.0, 'epsActual': None, 'revenueEstimate': 9, 'revenueActual': None},
        ]}

        result = earnings.symbol_earnings('AAPL')

        self.assertTrue(result['available'])
        self.assertEqual([e['date'] for e in result['history']], ['2026-03-31', '2026-06-30'])
        self.assertEqual(result['history'][0]['eps_surprise_pct'], -3.4)
        self.assertEqual(result['history'][1]['eps_actual'], 1.6)
        self.assertEqual(result['next']['date'], future)
        # scoring travels with the payload so the tab renders a verdict directly
        self.assertEqual(result['score']['quarters'], 2)
        self.assertEqual(result['score']['beats'], 1)
        self.assertEqual(result['score']['streak'], 1)  # latest quarter beat

    @patch('research.earnings.finnhub.get_earnings_calendar', return_value={'earningsCalendar': []})
    @patch('research.earnings.finnhub.get_earnings_history', return_value=[])
    def test_next_is_none_when_nothing_is_scheduled(self, mock_hist, mock_cal):
        self.assertIsNone(earnings.symbol_earnings('AAPL')['next'])

    @patch('research.earnings.finnhub.get_earnings_history')
    def test_a_provider_failure_propagates(self, mock_hist):
        mock_hist.side_effect = finnhub.FinnhubAPIError('/stock/earnings failed: 500')
        with self.assertRaises(ProviderUnavailable):
            earnings.symbol_earnings('AAPL')

    @patch('research.earnings.finnhub.get_earnings_calendar', return_value={'earningsCalendar': []})
    @patch('research.earnings.finnhub.get_earnings_history', return_value=[])
    def test_a_legacy_list_cache_entry_cannot_500_the_response(self, mock_hist, mock_cal):
        # An earlier build cached a bare list under the unversioned key; the
        # versioned key sidesteps it rather than `{**a_list}` blowing up.
        cache.set(f'research:earnings-sym:AAPL:{date.today().isoformat()}', [{'date': 'x'}], 60)

        result = earnings.symbol_earnings('AAPL')

        self.assertTrue(result['available'])
        self.assertEqual(result['history'], [])
        self.assertIsNone(result['next'])
        self.assertEqual(result['score']['quarters'], 0)


@override_settings(SAXO_TOKEN_ENCRYPTION_KEY=TEST_KEY, CACHES=LOCMEM, FINNHUB_API_KEY='test-key')
class EarningsCalendarViewTest(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(username='u', password='p')
        token = RefreshToken.for_user(self.user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_requires_authentication(self):
        self.client.credentials()
        self.assertEqual(self.client.get('/api/research/earnings/calendar/').status_code, 401)

    @patch('research.earnings.finnhub.get_earnings_calendar')
    def test_returns_the_week_with_tagged_rows(self, mock_cal):
        Position.objects.create(
            ticker='AAPL', name='Apple', qty=1, avg_cost=1, current_price=1,
            sector='Tech', type='STOCK', color='#fff',
        )
        today = date.today()
        monday = (today - timedelta(days=today.weekday())).isoformat()
        mock_cal.return_value = {'earningsCalendar': [{
            'symbol': 'AAPL', 'date': monday, 'hour': 'amc', 'quarter': 1, 'year': 2026,
            'epsEstimate': 1.0, 'epsActual': None, 'revenueEstimate': 9, 'revenueActual': None,
        }]}

        response = self.client.get('/api/research/earnings/calendar/')

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['ok'])
        self.assertEqual(response.data['events'][0]['symbol'], 'AAPL')
        self.assertTrue(response.data['events'][0]['held'])
        self.assertEqual(response.data['window']['week'], 0)

    @patch('research.earnings.finnhub.get_earnings_calendar')
    def test_scope_mine_filters_and_week_shifts_the_window(self, mock_cal):
        mock_cal.return_value = {'earningsCalendar': []}

        response = self.client.get('/api/research/earnings/calendar/?scope=mine&week=2')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['events'], [])
        self.assertEqual(response.data['window']['week'], 2)

    def test_rejects_an_unknown_scope(self):
        self.assertEqual(
            self.client.get('/api/research/earnings/calendar/?scope=nope').status_code, 400,
        )

    def test_rejects_a_non_integer_week(self):
        self.assertEqual(
            self.client.get('/api/research/earnings/calendar/?week=soon').status_code, 400,
        )


@override_settings(SAXO_TOKEN_ENCRYPTION_KEY=TEST_KEY, CACHES=LOCMEM, FINNHUB_API_KEY='test-key')
class SymbolEarningsViewTest(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(username='u', password='p')
        token = RefreshToken.for_user(self.user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    @patch('research.earnings.finnhub.get_earnings_calendar')
    @patch('research.earnings.finnhub.get_earnings_history')
    def test_returns_available_true_with_history_and_next(self, mock_hist, mock_cal):
        mock_hist.return_value = [{'period': '2026-06-30', 'actual': 1.6, 'estimate': 1.5, 'surprisePercent': 6.7}]
        future = (date.today() + timedelta(days=20)).isoformat()
        mock_cal.return_value = {'earningsCalendar': [{
            'symbol': 'AAPL', 'date': future, 'hour': 'amc', 'quarter': 1, 'year': 2027,
            'epsEstimate': 2.0, 'epsActual': None, 'revenueEstimate': 9, 'revenueActual': None,
        }]}

        response = self.client.get('/api/research/earnings/AAPL/')

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['available'])
        self.assertEqual(response.data['history'][0]['eps_actual'], 1.6)
        self.assertEqual(response.data['next']['date'], future)

    @override_settings(FINNHUB_API_KEY='')
    def test_returns_available_false_when_not_configured(self):
        response = self.client.get('/api/research/earnings/AAPL/')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['available'])
        self.assertIn('reason', response.data)
        self.assertEqual(response.data['reason'], 'Market data is not configured.')

    @patch('research.earnings.finnhub.get_earnings_history')
    def test_returns_available_false_on_a_finnhub_error(self, mock_hist):
        mock_hist.side_effect = finnhub.FinnhubAPIError('/stock/earnings failed: 500')
        response = self.client.get('/api/research/earnings/AAPL/')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['available'])
