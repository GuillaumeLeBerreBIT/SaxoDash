import inspect
from unittest.mock import patch

import anyio
from django.test import SimpleTestCase
from mcp.server.fastmcp.exceptions import ToolError

from research.listings import Listing

from .server import build_server
from .tools import REGISTRY


def schemas():
    async def listed():
        return await build_server().list_tools()

    return {tool.name: tool.inputSchema['properties'] for tool in anyio.run(listed)}


def kinds(prop):
    if 'type' in prop:
        return {prop['type']}
    return {option.get('type') for option in prop.get('anyOf', [])}


def call(name, arguments):
    async def run():
        return await build_server().call_tool(name, arguments)

    return anyio.run(run)


class ToolSchemaTest(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.tools = schemas()

    def test_every_tool_parameter_is_annotated(self):
        untyped = [
            f'{fn.__name__}.{name}'
            for fn in REGISTRY
            for name, param in inspect.signature(fn).parameters.items()
            if param.annotation is inspect.Parameter.empty
        ]
        self.assertEqual(untyped, [])

    def test_symbol_lists_are_arrays(self):
        self.assertEqual(self.tools['compare_companies']['symbols']['type'], 'array')
        self.assertEqual(self.tools['get_quotes']['symbols']['type'], 'array')

    def test_journal_structures_are_typed(self):
        props = self.tools['log_recommendation']
        self.assertEqual(props['bear_case']['type'], 'array')
        self.assertEqual(props['invalidation']['type'], 'object')
        self.assertIn('object', kinds(props['target']))
        self.assertIn('object', kinds(props['buy_range']))
        self.assertEqual(props['review']['type'], 'boolean')

    def test_limits_are_integers(self):
        self.assertEqual(self.tools['get_news']['limit']['type'], 'integer')
        self.assertEqual(self.tools['get_transactions']['limit']['type'], 'integer')
        self.assertEqual(self.tools['get_price_history']['bars']['type'], 'integer')

    def test_screen_filters_are_an_object(self):
        self.assertIn('object', kinds(self.tools['screen_universe']['filters']))

    def test_a_json_list_reaches_compare_as_a_list(self):
        called = []

        def entry(listing):
            called.append(listing.ticker)
            return {'symbol': listing.ticker}, []

        with patch('mcp_server.tools.compare._compare_one', side_effect=entry), \
                patch('mcp_server.tools.compare.look_up', side_effect=Listing.unresolved), \
                patch('mcp_server.tools.saxo_warnings', return_value=[]):
            call('compare_companies', {'symbols': ['AMD', 'MU']})
        self.assertEqual(called, ['AMD', 'MU'])

    def test_a_comma_string_is_refused_not_split_into_letters(self):
        with patch('mcp_server.tools.compare._compare_one') as compare_one:
            with self.assertRaises(ToolError):
                call('compare_companies', {'symbols': 'AMD,MU'})
        compare_one.assert_not_called()
