from unittest.mock import patch

from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase

from research.daily import NOT_CONNECTED
from research.listings import Listing
from research.views import ChartView, InstrumentSearchView

from . import throttled
from .tools.research import QUOTE_LIMIT, get_quotes
from .views import ViewResult
from users.testing import the_owner

LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}
LISTING = Listing(ticker='NVDA', symbol='NVDA', name='N', uic=4, asset_type='Stock', currency='USD', exchange=None)


@override_settings(CACHES=LOCMEM)
class ThrottledTest(APITestCase):
    def setUp(self):
        cache.clear()
        the_owner()

    def test_lookups_go_through_the_page_search_view(self):
        with patch('mcp_server.throttled.call_view', return_value=ViewResult(429, {})) as view:
            listing = throttled.look_up('NVDA')
        self.assertFalse(listing.resolved)
        self.assertIs(view.call_args.args[0], InstrumentSearchView)

    def test_a_throttled_chart_is_a_busy_reason(self):
        with patch('mcp_server.throttled.call_view', return_value=ViewResult(429, {})) as view:
            self.assertEqual(throttled.available(LISTING), (None, 'Busy — try again in a minute.'))
        self.assertIs(view.call_args.args[0], ChartView)

    def test_a_disconnected_chart_says_so(self):
        with patch('mcp_server.throttled.call_view', return_value=ViewResult(409, {})):
            self.assertEqual(throttled.available(LISTING), (None, NOT_CONNECTED))

    def test_the_search_view_scope_really_throttles(self):
        with patch('research.market.search', return_value=[]), \
                patch('rest_framework.throttling.ScopedRateThrottle.allow_request', return_value=False), \
                patch('rest_framework.throttling.ScopedRateThrottle.wait', return_value=60):
            self.assertFalse(throttled.look_up('MSFT').resolved)

    def test_quotes_are_capped(self):
        symbols = [f'S{i}' for i in range(QUOTE_LIMIT + 5)]
        with patch('mcp_server.tools.research.look_up', side_effect=Listing.unresolved) as look_up:
            result = get_quotes(symbols)
        self.assertEqual(look_up.call_count, QUOTE_LIMIT)
        self.assertIn(f'Quotes are limited to {QUOTE_LIMIT} symbols; the rest were left out.', result['warnings'])
