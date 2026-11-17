from pathlib import Path

from django.test import SimpleTestCase

FORBIDDEN = ('finnhub', 'research.market', 'from research import market', 'import requests', 'from requests')


class ReadsStoredRowsOnlyTest(SimpleTestCase):
    def test_no_module_reaches_a_provider(self):
        for path in Path(__file__).parent.glob('*.py'):
            if path.name.startswith('test_'):
                continue
            source = path.read_text()
            for needle in FORBIDDEN:
                self.assertNotIn(needle, source, f'{path.name} mentions {needle}')
