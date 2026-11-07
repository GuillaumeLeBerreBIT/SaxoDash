from datetime import date
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase, override_settings
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from core.money import Money
from portfolio.models import Position
from users.testing import make_user

from . import calendar_enrichment, tasks
from .models import PriceLine, SymbolNote, TextAnnotation, TrendLine, Watchlist, WatchlistItem


def hold(user, ticker, uic=None):
    return Position.objects.create(
        user=user, ticker=ticker, name=ticker, qty=1, avg_cost=Decimal('1'),
        current_price=Decimal('1'), sector='Tech', type='STOCK', color='#000000', uic=uic,
    )


class TwoUsersAPITestCase(APITestCase):
    def setUp(self):
        self.alice = make_user('alice', owner=True)
        self.bob = make_user('bob')

    def sign_in(self, user):
        token = RefreshToken.for_user(user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')


class SymbolNotePerUserTest(TwoUsersAPITestCase):
    def test_two_users_note_same_symbol(self):
        self.sign_in(self.alice)
        self.client.patch('/api/research/notes/AAPL/', {'bull_case': 'alice thesis'}, format='json')
        self.sign_in(self.bob)
        self.assertEqual(self.client.get('/api/research/notes/AAPL/').data['bull_case'], '')
        self.client.patch('/api/research/notes/AAPL/', {'bull_case': 'bob thesis'}, format='json')

        self.assertEqual(SymbolNote.objects.filter(symbol='AAPL').count(), 2)
        self.assertEqual(SymbolNote.objects.get(user=self.alice, symbol='AAPL').bull_case, 'alice thesis')
        self.assertEqual(SymbolNote.objects.get(user=self.bob, symbol='AAPL').bull_case, 'bob thesis')

    def test_review_marks_only_the_requesting_users_note(self):
        self.sign_in(self.bob)
        self.client.post('/api/research/notes/AAPL/review/')

        self.assertIsNotNone(SymbolNote.objects.get(user=self.bob, symbol='AAPL').reviewed_at)
        self.assertFalse(SymbolNote.objects.filter(user=self.alice).exists())


class WatchlistsPerUserTest(TwoUsersAPITestCase):
    def setUp(self):
        super().setUp()
        self.list = Watchlist.objects.create(user=self.alice, name='Alice picks')
        self.item = WatchlistItem.objects.create(watchlist=self.list, symbol='NVDA', uic=211)

    def test_watchlists_are_per_user(self):
        self.sign_in(self.bob)

        self.assertEqual(self.client.get('/api/research/watchlists/').data, [])
        self.assertEqual(self.client.get(f'/api/research/watchlists/{self.list.pk}/').status_code, 404)
        self.assertEqual(
            self.client.post(
                f'/api/research/watchlists/{self.list.pk}/items/', {'symbol': 'AAPL', 'uic': 5}, format='json'
            ).status_code,
            404,
        )
        self.assertEqual(
            self.client.delete(f'/api/research/watchlists/{self.list.pk}/items/{self.item.pk}/').status_code, 404
        )
        self.assertEqual(self.client.delete(f'/api/research/watchlists/{self.list.pk}/').status_code, 404)
        self.assertTrue(WatchlistItem.objects.filter(pk=self.item.pk).exists())

    def test_created_watchlist_belongs_to_the_requesting_user(self):
        self.sign_in(self.bob)
        response = self.client.post('/api/research/watchlists/', {'name': 'Bob picks'}, format='json')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(Watchlist.objects.get(pk=response.data['id']).user, self.bob)
        self.assertEqual([w['name'] for w in self.client.get('/api/research/watchlists/').data], ['Bob picks'])


class LinesPerUserTest(TwoUsersAPITestCase):
    CASES = [
        (PriceLine, 'price-lines', {'price': '100.00'}, {'price': '100.00'}, {'price': '120.00'}),
        (
            TrendLine, 'trend-lines',
            {'start_bar_date': '2026-01-01', 'start_price': '1.00', 'end_bar_date': '2026-02-01', 'end_price': '2.00'},
            {'start_bar_date': date(2026, 1, 1), 'start_price': Decimal('1'), 'end_bar_date': date(2026, 2, 1), 'end_price': Decimal('2')},
            {'label': 'changed'},
        ),
        (
            TextAnnotation, 'text-annotations',
            {'bar_date': '2026-01-01', 'price': '1.00', 'text': 'note'},
            {'bar_date': date(2026, 1, 1), 'price': Decimal('1'), 'text': 'note'},
            {'text': 'changed'},
        ),
    ]

    def test_lines_are_per_user(self):
        for model, path, _payload, fields, patch_body in self.CASES:
            with self.subTest(path):
                alices = model.objects.create(user=self.alice, uic=211, asset_type='Stock', **fields)
                self.sign_in(self.bob)

                self.assertEqual(self.client.get(f'/api/research/{path}/211/Stock/').data, [])
                self.assertEqual(self.client.patch(f'/api/research/{path}/{alices.pk}/', patch_body, format='json').status_code, 404)
                self.assertEqual(self.client.delete(f'/api/research/{path}/{alices.pk}/').status_code, 404)
                self.assertTrue(model.objects.filter(pk=alices.pk).exists())

    def test_created_lines_belong_to_the_requesting_user(self):
        self.sign_in(self.bob)
        for model, path, payload, _fields, _patch in self.CASES:
            with self.subTest(path):
                response = self.client.post(f'/api/research/{path}/211/Stock/', payload, format='json')

                self.assertEqual(response.status_code, 201)
                self.assertEqual(model.objects.get(pk=response.data['id']).user, self.bob)
                self.assertEqual(len(self.client.get(f'/api/research/{path}/211/Stock/').data), 1)


@override_settings(CELERY_TASK_ALWAYS_EAGER=True, CELERY_TASK_EAGER_PROPAGATES=True)
class SyncWatchlistsPerUserTest(TestCase):
    def test_sync_watchlists_per_user(self):
        alice = make_user('alice', owner=True)
        bob = make_user('bob')
        hold(alice, 'NVDA', 211)
        hold(bob, 'AAPL', 5)
        hold(bob, 'MSFT', 6)

        tasks.sync_watchlists()

        alices = Watchlist.objects.get(user=alice, name='Open positions')
        bobs = Watchlist.objects.get(user=bob, name='Open positions')
        self.assertEqual({i.symbol for i in alices.items.all()}, {'NVDA'})
        self.assertEqual({i.symbol for i in bobs.items.all()}, {'AAPL', 'MSFT'})

    def test_a_user_with_no_positions_left_is_emptied(self):
        alice = make_user('alice', owner=True)
        position = hold(alice, 'NVDA', 211)
        tasks.sync_watchlists()
        position.delete()

        tasks.sync_watchlists()

        self.assertEqual(WatchlistItem.objects.count(), 0)


@patch('research.calendar_enrichment.get_portfolio_value', return_value=Money(Decimal('1000'), 'EUR'))
@override_settings(REPORTING_CURRENCY='EUR')
class EarningsTaggingPerUserTest(TestCase):
    def event(self, symbol):
        return {
            'symbol': symbol, 'date': '2026-10-16', 'session': 'bmo', 'quarter': 3, 'year': 2026,
            'eps_estimate': 1.0, 'eps_actual': None, 'revenue_estimate': 1e9, 'revenue_actual': None,
            'eps_surprise_pct': None, 'revenue_surprise_pct': None,
        }

    def test_earnings_calendar_tags_requesting_users_holdings(self, _value):
        alice = make_user('alice', owner=True)
        bob = make_user('bob')
        hold(alice, 'AAPL', 1)
        watchlist = Watchlist.objects.create(user=bob, name='Bob picks')
        WatchlistItem.objects.create(watchlist=watchlist, symbol='MSFT', uic=2)
        events = [self.event('AAPL'), self.event('MSFT')]

        for_alice = {e['symbol']: e for e in calendar_enrichment.enrich(events, date(2026, 10, 21), moves=False, user=alice)}
        for_bob = {e['symbol']: e for e in calendar_enrichment.enrich(events, date(2026, 10, 21), moves=False, user=bob)}

        self.assertEqual((for_alice['AAPL']['held'], for_alice['MSFT']['mine']), (True, False))
        self.assertEqual((for_bob['AAPL']['mine'], for_bob['MSFT']['watched']), (False, True))
        self.assertIsNone(for_bob['AAPL']['value'])
