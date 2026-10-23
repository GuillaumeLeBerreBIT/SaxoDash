from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from investors.models import PriceHistory
from research.models import ScreenerRow
from saxo.models import SyncRun

from .tools.system import get_data_health


class DataHealthTest(TestCase):
    def test_reports_connection_and_each_task(self):
        SyncRun.objects.create(task='sync_positions', outcome='ok')
        out = get_data_health()
        data = out['data']
        self.assertEqual(
            set(data),
            {'saxo_connected', 'saxo_usable', 'unusable_reason', 'tasks', 'discover_scanned_at', 'prices_refreshed_at'},
        )
        self.assertFalse(data['saxo_connected'])
        self.assertFalse(data['saxo_usable'])
        self.assertEqual(data['unusable_reason'], 'Saxo is not connected.')
        self.assertEqual(data['tasks']['sync_positions']['outcome'], 'ok')
        self.assertIsNotNone(data['tasks']['sync_positions']['finished_at'])
        self.assertIsNone(data['discover_scanned_at'])
        self.assertIsNone(data['prices_refreshed_at'])
        self.assertIn('Saxo is not connected.', out['warnings'])

    def test_reports_scan_and_price_times(self):
        scanned = timezone.now() - timedelta(hours=3)
        ScreenerRow.objects.create(ticker='AAA', name='A', indexes='SP500', technicals_at=scanned)
        out = get_data_health()
        self.assertEqual(out['data']['discover_scanned_at'], scanned.isoformat())


class BuildServerTest(TestCase):
    def test_registers_get_data_health_with_its_description(self):
        import anyio

        from .server import build_server

        listed = anyio.run(build_server().list_tools)
        tool = next(t for t in listed if t.name == 'get_data_health')
        self.assertIn('Saxo connection', tool.description)
