import json
from unittest.mock import patch

import anyio
from django.core.cache import cache
from django.test import TransactionTestCase, override_settings
from mcp.shared.memory import create_connected_server_and_client_session

from analytics.views import PerformanceView, RiskMetricsView
from congress.views import MemberListView
from investors.views import InvestorAlertsView, InvestorHubView, InvestorListView, InvestorStocksView
from research.listings import Listing
from research.views import DiscoverView

from .envelope import json_safe
from .server import build_server
from .shaping import capped, without
from .tools import market, portfolio, smart_money
from .views import call_view
from users.testing import the_owner


LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}


def session_calls(*calls):
    async def run():
        async with create_connected_server_and_client_session(build_server()._mcp_server) as client:
            listed = await client.list_tools()
            results = [await client.call_tool(name, arguments) for name, arguments in calls]
            return [tool.name for tool in listed.tools], [json.loads(r.content[0].text) for r in results]

    return anyio.run(run)


def foreign(symbol):
    return Listing(ticker=symbol, symbol=symbol, name=symbol, uic=1, asset_type='Stock', currency='EUR', exchange=None)


@override_settings(CACHES=LOCMEM)
class ProtocolTest(TransactionTestCase):
    def setUp(self):
        cache.clear()
        the_owner()

    def test_a_client_lists_and_calls_tools_over_the_protocol(self):
        with patch('mcp_server.tools.compare.look_up', side_effect=foreign):
            names, (health, compared) = session_calls(
                ('get_data_health', {}),
                ('compare_companies', {'symbols': ['ASML', 'SAP']}),
            )
        self.assertIn('compare_companies', names)
        self.assertIn('saxo_usable', health['data'])
        self.assertEqual([c['symbol'] for c in compared['data']['companies']], ['ASML', 'SAP'])
        self.assertEqual({c['status'] for c in compared['data']['companies']}, {'foreign'})


def view_data(view, **params):
    return json_safe(without(call_view(view, **params).data))


@override_settings(CACHES=LOCMEM)
class ParityTest(TransactionTestCase):
    def setUp(self):
        cache.clear()
        the_owner()

    def test_page_backed_tools_answer_what_their_page_shows(self):
        cases = [
            (smart_money.get_fund_signals(), view_data(InvestorHubView)),
            (smart_money.get_filing_alerts(), view_data(InvestorAlertsView)),
            (market.get_discover_shelves(), view_data(DiscoverView)),
            (smart_money.list_investors(), {'investors': capped(view_data(InvestorListView), smart_money.DIRECTORY_LIMIT)}),
            (
                portfolio.get_performance(),
                {'performance': view_data(PerformanceView), 'risk': view_data(RiskMetricsView)},
            ),
        ]
        stocks = view_data(InvestorStocksView, query={'view': 'bought'})
        cases.append((smart_money.get_fund_stocks(), {**stocks, 'rows': capped(stocks['rows'], smart_money.STOCK_ROWS_LIMIT)}))
        members = view_data(MemberListView)
        cases.append((smart_money.list_congress_members(), {**members, 'members': capped(members['members'], smart_money.DIRECTORY_LIMIT)}))
        for result, expected in cases:
            self.assertEqual(result['data'], expected)
