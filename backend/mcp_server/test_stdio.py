import json
import os
import sys
import unittest
from pathlib import Path

import anyio
from django.test import TransactionTestCase
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

BACKEND = Path(__file__).resolve().parent.parent


@unittest.skipUnless(os.environ.get('MCP_E2E') == '1', 'spawns a process')
class StdioServerTest(TransactionTestCase):
    def test_lists_and_calls_get_data_health(self):
        async def run():
            params = StdioServerParameters(
                command=sys.executable,
                args=['manage.py', 'mcp_serve'],
                cwd=str(BACKEND),
                env={**os.environ, 'MCP_USER': ''},
            )
            async with stdio_client(params) as (read, write):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    listed = await session.list_tools()
                    self.assertIn('get_data_health', [tool.name for tool in listed.tools])
                    result = await session.call_tool('get_data_health', {})
                    return json.loads(result.content[0].text)

        payload = anyio.run(run)
        self.assertIn('data', payload)
        self.assertIn('warnings', payload)
