from unittest.mock import patch

from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

from . import edgar
from .factories import make_investor
from .models import Investor

LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}
PERSHING = {'cik': 1336528, 'name': 'Pershing Square Capital Management, L.P.', 'last_13f': '2026-08-14'}


@override_settings(CACHES=LOCMEM)
class TrackingApiTest(APITestCase):
    def setUp(self):
        cache.clear()
        self.client.force_authenticate(User.objects.create_user('me', password='x'))
        self.list_url = reverse('investor-list')
        self.search_url = reverse('investor-search')

    @patch('investors.tracking.edgar.search_filers')
    def test_search_marks_filers_already_tracked(self, search_filers):
        make_investor()
        search_filers.return_value = [
            {'cik': 1067983, 'name': 'BERKSHIRE HATHAWAY INC', 'last_13f': '2026-08-14'}, PERSHING,
        ]

        response = self.client.get(self.search_url, {'q': 'capital'})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [(row['cik'], row['tracked'], row['slug']) for row in response.data],
            [(1067983, True, 'berkshire-hathaway'), (1336528, False, None)],
        )
        search_filers.assert_called_once_with('capital')

    @patch('investors.tracking.edgar.search_filers')
    def test_a_query_under_three_characters_does_not_reach_edgar(self, search_filers):
        response = self.client.get(self.search_url, {'q': ' ab '})

        self.assertEqual((response.status_code, response.data), (200, []))
        search_filers.assert_not_called()

    @patch('investors.tracking.edgar.search_filers', side_effect=edgar.EdgarError('503'))
    def test_edgar_being_down_is_a_502_with_a_message(self, search_filers):
        response = self.client.get(self.search_url, {'q': 'pershing'})

        self.assertEqual(response.status_code, 502)
        self.assertIn('EDGAR', response.data['detail'])

    @patch('investors.tracking.tasks.backfill_investor.delay')
    @patch('investors.tracking.edgar.filer', return_value=PERSHING)
    def test_adding_creates_the_investor_and_queues_its_backfill(self, filer, delay):
        response = self.client.post(self.list_url, {'cik': 1336528}, format='json')

        self.assertEqual(response.status_code, 201)
        investor = Investor.objects.get(cik=1336528)
        self.assertEqual(
            (investor.name, investor.firm, investor.slug, investor.curated),
            (PERSHING['name'], PERSHING['name'], 'pershing-square-capital-management-lp', False),
        )
        self.assertEqual(response.data['slug'], investor.slug)
        self.assertEqual(response.data['import']['quarters_expected'], 0)
        delay.assert_called_once_with(investor.pk)

    @patch('investors.tracking.tasks.backfill_investor.delay', side_effect=ConnectionError('broker down'))
    @patch('investors.tracking.edgar.filer', return_value=PERSHING)
    def test_an_import_that_cannot_be_queued_is_a_503_and_leaves_no_investor(self, filer, delay):
        response = self.client.post(self.list_url, {'cik': 1336528}, format='json')

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data['detail'], 'Could not start the import. Is the worker running?')
        self.assertFalse(Investor.objects.filter(cik=1336528).exists())

    @patch('investors.tracking.tasks.backfill_investor.delay')
    @patch('investors.tracking.edgar.filer')
    def test_a_name_that_slugs_to_a_route_gets_a_safe_slug(self, filer, delay):
        filer.return_value = {'cik': 42, 'name': 'Hub', 'last_13f': '2026-08-14'}

        self.client.post(self.list_url, {'cik': 42}, format='json')

        self.assertEqual(Investor.objects.get(cik=42).slug, 'hub-42')
        self.assertEqual(self.client.get(reverse('investor-hub')).status_code, 200)

    @patch('investors.tracking.tasks.backfill_investor.delay')
    @patch('investors.tracking.edgar.filer')
    def test_a_slug_already_taken_gets_the_cik_appended(self, filer, delay):
        make_investor()
        filer.return_value = {'cik': 7, 'name': 'Berkshire Hathaway', 'last_13f': '2026-08-14'}

        self.client.post(self.list_url, {'cik': 7}, format='json')

        self.assertEqual(Investor.objects.get(cik=7).slug, 'berkshire-hathaway-7')

    @patch('investors.tracking.edgar.filer')
    def test_adding_a_tracked_cik_is_409_and_does_not_reach_edgar(self, filer):
        make_investor()

        response = self.client.post(self.list_url, {'cik': 1067983}, format='json')

        self.assertEqual(response.status_code, 409)
        self.assertIn('already tracked', response.data['detail'])
        filer.assert_not_called()

    @patch('investors.tracking.edgar.filer', return_value={'cik': 5, 'name': 'Acme Inc', 'last_13f': None})
    def test_a_company_that_never_filed_a_13f_is_refused(self, filer):
        response = self.client.post(self.list_url, {'cik': 5}, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('never filed a 13F', response.data['detail'])
        self.assertFalse(Investor.objects.filter(cik=5).exists())

    def test_a_cik_must_be_a_positive_integer(self):
        for bad in ('1336528', True, -1, None):
            self.assertEqual(self.client.post(self.list_url, {'cik': bad}, format='json').status_code, 400)

    @patch('investors.tracking.edgar.filer', side_effect=edgar.EdgarError('503'))
    def test_edgar_failing_on_add_is_a_502(self, filer):
        self.assertEqual(self.client.post(self.list_url, {'cik': 9}, format='json').status_code, 502)

    def test_an_added_investor_can_be_removed(self):
        make_investor(curated=False)

        response = self.client.delete(reverse('investor-detail', args=['berkshire-hathaway']))

        self.assertEqual(response.status_code, 204)
        self.assertFalse(Investor.objects.exists())

    def test_a_curated_investor_cannot_be_removed(self):
        make_investor()

        response = self.client.delete(reverse('investor-detail', args=['berkshire-hathaway']))

        self.assertEqual(response.status_code, 409)
        self.assertIn('unfollow', response.data['detail'])
        self.assertTrue(Investor.objects.exists())
