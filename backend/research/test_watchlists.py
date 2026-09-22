from decimal import Decimal
from django.contrib.auth.models import User
from django.db import transaction
from django.db.utils import IntegrityError
from django.test import TestCase, override_settings
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from portfolio.models import Position

from . import tasks
from .models import Watchlist, WatchlistItem


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
