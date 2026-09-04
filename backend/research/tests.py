from datetime import timedelta
from unittest.mock import patch

from cryptography.fernet import Fernet
from django.contrib.auth.models import User
from django.core.cache import cache
from django.db import transaction
from django.db.utils import IntegrityError
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from saxo import client
from saxo.models import SaxoCredential

from . import market
from .models import Watchlist, WatchlistItem

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

        with self.assertLogs('research.views', level='WARNING'):
            response = self.client.get('/api/research/chart/?uic=211&asset_type=Stock')

        self.assertEqual(response.status_code, 502)

    @patch('research.market.client.get_chart')
    def test_a_failed_chart_call_is_not_cached(self, mock_get_chart):
        self._connect_saxo()
        mock_get_chart.side_effect = client.SaxoAPIError('boom')

        url = '/api/research/chart/?uic=211&asset_type=Stock'
        with self.assertLogs('research.views', level='WARNING'):
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
