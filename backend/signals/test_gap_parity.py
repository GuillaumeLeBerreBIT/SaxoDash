import json
from pathlib import Path

from django.conf import settings
from django.test import SimpleTestCase

from signals import definitions, series

FIXTURE = Path(settings.BASE_DIR).parent / 'frontend' / 'src' / 'lib' / 'fixtures' / 'gap-parity.json'


class GapParityTest(SimpleTestCase):
    def test_detect_flags_the_fixture_gaps(self):
        fixture = json.loads(FIXTURE.read_text())
        rows = [(b['date'], b['open'], b['high'], b['low'], b['close'], b['volume']) for b in fixture['bars']]

        flags = definitions.detect(series.from_bars(rows))

        self.assertEqual([i for i, on in enumerate(flags['news_gap_up']) if on], fixture['expected']['gap_up'])
        self.assertEqual([i for i, on in enumerate(flags['news_gap_down']) if on], fixture['expected']['gap_down'])
