from datetime import timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from research.models import ScreenerRow
from saxo.models import SyncRun


class DiscoverViewTest(APITestCase):
    def setUp(self):
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
        self.assertEqual(len(shelves), 7)
        self.assertEqual(shelves['overbought']['total'], 25)
        self.assertEqual(len(shelves['overbought']['items']), 20)
        self.assertEqual(shelves['overbought']['items'][0]['ticker'], 'T24')
        self.assertEqual(shelves['overbought']['metric'], 'rsi14')
        self.assertEqual(shelves['overbought']['empty'], 'Nothing overbought today')
        self.assertEqual((shelves['oversold']['total'], shelves['oversold']['items']), (0, []))
        self.assertEqual(response.data['health']['state'], 'ok')
        self.assertIsNotNone(response.data['as_of'])

    def test_health_is_never_before_any_successful_run(self):
        self.run_at('skipped', 1)
        response = self.client.get(reverse('research-discover'))
        self.assertEqual(response.data['health']['state'], 'never')
        self.assertIsNone(response.data['as_of'])

    def test_health_is_scanning_while_a_first_scan_writes_rows(self):
        self.stock('AAA', rsi14=80.0)
        self.stock('BBB', rsi14=80.0)
        ScreenerRow.objects.create(ticker='CCC', name='CCC', indexes='SP500')
        response = self.client.get(reverse('research-discover'))
        self.assertEqual(response.data['health']['state'], 'scanning')
        self.assertEqual((response.data['health']['scanned'], response.data['health']['total']), (2, 3))
        self.assertIsNone(response.data['as_of'])

    def test_health_is_never_when_a_first_scan_stopped_writing_rows(self):
        self.stock('AAA', rsi14=80.0)
        ScreenerRow.objects.update(technicals_at=timezone.now() - timedelta(hours=1))
        self.assertEqual(self.client.get(reverse('research-discover')).data['health']['state'], 'never')

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

    def test_unknown_shelf_is_404(self):
        self.assertEqual(self.client.get(reverse('research-discover-shelf', args=['nope'])).status_code, 404)
