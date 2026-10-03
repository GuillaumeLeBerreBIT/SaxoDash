from datetime import timedelta

from unittest import mock

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.urls import reverse
from django.utils import timezone
from django.test import override_settings
from rest_framework.test import APITestCase

from research import scan_progress
from research.models import ScreenerRow
from saxo.credentials import ConnectionState
from saxo.models import SyncRun

LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}


@override_settings(CACHES=LOCMEM)
class DiscoverViewTest(APITestCase):
    def setUp(self):
        cache.clear()
        user = get_user_model().objects.create_user('u', password='p')
        self.client.force_authenticate(user)

    def run_at(self, outcome, hours_ago):
        run = SyncRun.objects.create(task='scan_universe', outcome=outcome)
        SyncRun.objects.filter(pk=run.pk).update(ran_at=timezone.now() - timedelta(hours=hours_ago))

    def stock(self, ticker, **fields):
        return ScreenerRow.objects.create(
            ticker=ticker, name=ticker, indexes='SP500', uic=ScreenerRow.objects.count() + 1,
            status=ScreenerRow.OK, technicals_at=timezone.now(), **fields,
        )

    def test_requires_authentication(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(reverse('research-discover')).status_code, 401)

    def test_lists_every_shelf_with_totals_and_top_cards(self):
        self.run_at('ok', 1)
        for i in range(25):
            self.stock(f'T{i:02d}', rsi14=70.0 + i)
        response = self.client.get(reverse('research-discover'))
        self.assertEqual(response.status_code, 200)
        shelves = {s['key']: s for s in response.data['shelves']}
        self.assertEqual(len(shelves), 6)
        self.assertEqual(shelves['overbought']['total'], 25)
        self.assertEqual(len(shelves['overbought']['items']), 20)
        self.assertEqual(shelves['overbought']['items'][0]['ticker'], 'T24')
        self.assertNotIn('metric', shelves['overbought'])
        self.assertNotIn('metric_value', shelves['overbought']['items'][0])
        self.assertEqual((shelves['oversold']['total'], shelves['oversold']['items']), (0, []))
        self.assertEqual(response.data['health']['state'], 'ok')
        self.assertIsNotNone(response.data['as_of'])

    def test_each_shelf_describes_its_rule_and_order(self):
        self.run_at('ok', 1)
        self.stock('AAA', rsi14=80.0)
        response = self.client.get(reverse('research-discover'))
        self.assertEqual(response.data['groups'], [
            {'key': 'price', 'title': 'Price action'},
            {'key': 'fundamentals', 'title': 'Fundamentals'},
        ])
        shelf = next(s for s in response.data['shelves'] if s['key'] == 'overbought')
        self.assertEqual({k: shelf[k] for k in ('title', 'short', 'group', 'subtitle', 'order', 'sort', 'criteria')}, {
            'title': 'Overbought',
            'short': 'Overbought',
            'group': 'price',
            'subtitle': 'RSI 14 ≥ 70',
            'order': 'Ordered by RSI 14, highest first',
            'sort': {'field': 'rsi14', 'descending': True},
            'criteria': [{'field': 'rsi14', 'op': 'gte', 'value': 70, 'ref': None}],
        })
        self.assertEqual(shelf['empty'], 'No stocks match these criteria in the last session.')
        self.assertEqual(shelf['items'][0]['reasons'], [{'field': 'rsi14', 'label': 'RSI', 'value': 80.0, 'format': 'number'}])

    def test_health_is_never_before_any_successful_run(self):
        self.run_at('skipped', 1)
        response = self.client.get(reverse('research-discover'))
        self.assertEqual(response.data['health']['state'], 'never')
        self.assertIsNone(response.data['as_of'])

    def test_health_is_scanning_while_a_first_scan_reports_progress(self):
        scan_progress.report(144, 518)
        response = self.client.get(reverse('research-discover'))
        self.assertEqual(response.data['health']['state'], 'scanning')
        self.assertEqual(response.data['health']['progress'], {'done': 144, 'total': 518})
        self.assertIsNone(response.data['as_of'])

    def test_a_rescan_keeps_the_last_results_and_reports_its_progress(self):
        self.run_at('ok', 20)
        self.stock('AAA', rsi14=80.0)
        scan_progress.report(10, 518)
        response = self.client.get(reverse('research-discover'))
        self.assertEqual(response.data['health']['state'], 'ok')
        self.assertEqual(response.data['health']['progress'], {'done': 10, 'total': 518})
        self.assertIsNotNone(response.data['as_of'])

    def test_no_progress_when_nothing_is_scanning(self):
        self.run_at('ok', 1)
        self.assertIsNone(self.client.get(reverse('research-discover')).data['health']['progress'])

    def test_health_is_stale_after_36_hours(self):
        self.run_at('ok', 37)
        self.assertEqual(self.client.get(reverse('research-discover')).data['health']['state'], 'stale')

    def test_health_is_failed_when_latest_run_failed(self):
        self.run_at('ok', 25)
        self.run_at('failed', 1)
        self.assertEqual(self.client.get(reverse('research-discover')).data['health']['state'], 'failed')

    def test_as_of_is_the_oldest_ok_refresh(self):
        self.run_at('ok', 1)
        older = timezone.now() - timedelta(hours=30)
        self.stock('OLD', rsi14=80.0)
        ScreenerRow.objects.filter(ticker='OLD').update(technicals_at=older)
        self.stock('NEW', rsi14=80.0)
        response = self.client.get(reverse('research-discover'))
        self.assertEqual(response.data['as_of'], older)

    def test_shelf_detail_returns_every_match(self):
        for i in range(25):
            self.stock(f'T{i:02d}', rsi14=70.0 + i)
        response = self.client.get(reverse('research-discover-shelf', args=['overbought']))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['total'], 25)
        self.assertEqual(len(response.data['items']), 25)
        self.assertEqual(response.data['title'], 'Overbought')
        self.assertEqual(response.data['subtitle'], 'RSI 14 ≥ 70')

    def test_unknown_and_retired_shelves_are_404(self):
        for key in ('nope', 'quality-on-sale', 'near-high'):
            self.assertEqual(self.client.get(reverse('research-discover-shelf', args=[key])).status_code, 404, key)


CONNECTED = ConnectionState(object(), None, False)
DISCONNECTED = ConnectionState(None, 'Saxo is not connected.', False)


@override_settings(CACHES=LOCMEM)
@mock.patch('research.views.tasks.scan_universe.delay')
@mock.patch('research.views.connection_state', return_value=CONNECTED)
class StartDiscoverScanTest(APITestCase):
    def setUp(self):
        cache.clear()
        self.client.force_authenticate(get_user_model().objects.create_user('u', password='p'))

    def start(self):
        return self.client.post(reverse('research-discover-scan'))

    def test_queues_the_first_scan_and_shows_it_as_starting(self, _state, delay):
        response = self.start()
        self.assertEqual((response.status_code, response.data), (202, {'queued': True}))
        delay.assert_called_once_with()
        self.assertEqual(scan_progress.current(), {'done': 0, 'total': None})

    def test_a_second_request_does_not_queue_another_scan(self, _state, delay):
        self.start()
        response = self.start()
        self.assertEqual((response.status_code, response.data), (200, {'queued': False}))
        delay.assert_called_once_with()

    def test_does_nothing_once_a_scan_has_succeeded(self, _state, delay):
        SyncRun.objects.create(task='scan_universe', outcome='ok')
        self.assertEqual(self.start().data, {'queued': False})
        delay.assert_not_called()

    def test_without_saxo_it_answers_409_and_claims_nothing(self, state, delay):
        state.return_value = DISCONNECTED
        response = self.start()
        self.assertEqual(response.status_code, 409)
        delay.assert_not_called()
        self.assertIsNone(scan_progress.current())

    def test_requires_authentication(self, _state, delay):
        self.client.force_authenticate(None)
        self.assertEqual(self.start().status_code, 401)
        delay.assert_not_called()
