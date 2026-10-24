from datetime import timedelta

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from research.models import ScreenerRow

from .views import ViewResult
from .tools.market import EARNINGS_UNAVAILABLE, get_discover_shelves, get_earnings_calendar, screen_universe

LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}


@override_settings(CACHES=LOCMEM)
class ScreenUniverseTest(APITestCase):
    def setUp(self):
        cache.clear()
        get_user_model().objects.create_user('u', password='p')

    def row(self, ticker, **fields):
        fields.setdefault('technicals_at', timezone.now())
        return ScreenerRow.objects.create(
            ticker=ticker, name=ticker, indexes='SP500', status=ScreenerRow.OK, sparkline=[1, 2],
            recent_closes=[1], **fields,
        )

    def tickers(self, result):
        return [row['ticker'] for row in result['data']['rows']]

    def test_min_max_filters_and_null_exclusion(self):
        self.row('LOW', pe=10)
        self.row('HIGH', pe=30)
        self.row('NONE')
        result = screen_universe(filters={'max_pe': 20})
        self.assertEqual(self.tickers(result), ['LOW'])
        self.assertEqual(self.tickers(screen_universe(filters={'min_pe': 5}, sort='pe')), ['LOW', 'HIGH'])

    def test_unknown_filter_is_refused(self):
        self.row('LOW', pe=10)
        self.row('HIGH', pe=30)
        result = screen_universe(filters={'min_banana': 1})
        self.assertTrue(any('min_banana' in w for w in result['warnings']))
        self.assertEqual(len(result['data']['rows']), 2)

    def test_limit_capped_at_100(self):
        for index in range(105):
            self.row(f'T{index:03d}', market_cap=index)
        result = screen_universe(limit=500)
        self.assertEqual(len(result['data']['rows']), 100)
        self.assertEqual(result['data']['matched'], 105)

    def test_stale_scan_warning(self):
        self.row('OLD', technicals_at=timezone.now() - timedelta(hours=48))
        self.assertTrue(any('older' in w for w in screen_universe()['warnings']))

    def test_fresh_scan_has_no_warning(self):
        self.row('NEW')
        self.assertEqual(screen_universe()['warnings'], [])

    def test_rows_drop_bulky_fields(self):
        self.row('A', pe=1)
        row = screen_universe()['data']['rows'][0]
        for key in ('sparkline', 'recent_closes', 'error'):
            self.assertNotIn(key, row)

    def test_sort_descending_with_nulls_last(self):
        self.row('A', market_cap=1)
        self.row('B', market_cap=3)
        self.row('C')
        self.assertEqual(self.tickers(screen_universe(sort='-market_cap')), ['B', 'A', 'C'])
        self.assertEqual(self.tickers(screen_universe(sort='market_cap')), ['A', 'B', 'C'])

    def test_unknown_sort_warns_and_uses_default(self):
        self.row('A', market_cap=1)
        self.row('B', market_cap=3)
        result = screen_universe(sort='banana')
        self.assertTrue(any('banana' in w for w in result['warnings']))
        self.assertEqual(self.tickers(result), ['B', 'A'])

    def test_sector_filter(self):
        self.row('A', sector='Tech')
        self.row('B', sector='Energy')
        self.assertEqual(self.tickers(screen_universe(sector='tech')), ['A'])

    def test_only_scanned_rows_are_screened(self):
        ScreenerRow.objects.create(ticker='X', name='X', indexes='SP500', status=ScreenerRow.UNMATCHED)
        self.assertEqual(self.tickers(screen_universe()), [])


@override_settings(CACHES=LOCMEM)
class ShelvesAndCalendarTest(APITestCase):
    def setUp(self):
        cache.clear()
        get_user_model().objects.create_user('u', password='p')

    def test_shelves_overview_lists_every_shelf(self):
        result = get_discover_shelves()
        self.assertIn('shelves', result['data'])
        self.assertNotIn('sparkline', str(result['data']))

    def test_unknown_shelf_is_a_warning(self):
        result = get_discover_shelves('nope')
        self.assertIsNone(result['data'])
        self.assertTrue(result['warnings'])

    def test_calendar_bad_scope_is_a_warning(self):
        result = get_earnings_calendar(scope='banana')
        self.assertIsNone(result['data'])
        self.assertTrue(result['warnings'])

    def test_unavailable_calendar_is_a_warning_not_an_empty_week(self):
        body = {'events': [], 'window': {'from': '2026-10-19', 'to': '2026-10-25', 'week': 0}, 'ok': False}
        with patch('mcp_server.views.call_view', return_value=ViewResult(200, body)):
            result = get_earnings_calendar()
        self.assertIsNone(result['data'])
        self.assertEqual(result['warnings'][-1], EARNINGS_UNAVAILABLE)
