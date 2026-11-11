from datetime import date

from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase

from users.testing import the_owner
from verdicts.models import StockVerdict
from verdicts.views import TrackRecordView

from .tools import REGISTRY
from .tools.verdicts import get_verdict, get_verdict_track_record
from .views import call_view

LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}


@override_settings(CACHES=LOCMEM)
class VerdictToolsTest(APITestCase):
    def setUp(self):
        cache.clear()
        the_owner()

    def test_known_symbol_returns_the_pages_verdict(self):
        StockVerdict.objects.create(
            ticker='NVDA', name='NVIDIA', quality='Strong', valuation='Fair', as_of=date(2026, 11, 10)
        )
        result = get_verdict('nvda:xnas')
        self.assertEqual(result['data']['verdict']['ticker'], 'NVDA')
        self.assertEqual(result['data']['verdict']['quality'], 'Strong')
        self.assertEqual(result['warnings'], [])

    def test_uncovered_symbol_is_null_with_a_warning(self):
        result = get_verdict('ZZZZ')
        self.assertEqual(result['data'], {'verdict': None})
        self.assertEqual(result['warnings'], ['No verdict: not in the nightly scan.'])

    def test_track_record_answers_what_the_page_shows(self):
        expected = call_view(TrackRecordView).data
        data = get_verdict_track_record()['data']
        self.assertEqual(set(data), set(expected))
        self.assertEqual(data['calls'], expected['calls'])

    def test_both_tools_are_registered(self):
        names = {fn.__name__ for fn in REGISTRY}
        self.assertLessEqual({'get_verdict', 'get_verdict_track_record'}, names)
