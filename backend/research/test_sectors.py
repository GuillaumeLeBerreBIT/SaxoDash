from django.core.cache import cache
from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

from research.models import ScreenerRow
from users.testing import the_owner

LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}


@override_settings(CACHES=LOCMEM)
class SectorsViewTest(APITestCase):
    def setUp(self):
        cache.clear()
        self.client.force_authenticate(the_owner())

    def stock(self, ticker, sector, change_1d=None, change_1m=None, market_cap=None, status=ScreenerRow.OK):
        return ScreenerRow.objects.create(
            ticker=ticker, name=ticker, indexes='SP500', uic=ScreenerRow.objects.count() + 1, sector=sector,
            change_1d=change_1d, change_1m=change_1m, market_cap=market_cap, status=status,
        )

    def sectors(self):
        return self.client.get(reverse('research-sectors')).data['sectors']

    def test_requires_authentication(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(reverse('research-sectors')).status_code, 401)

    def test_ranks_sectors_by_average_day_move(self):
        self.stock('XOM', 'Energy', change_1d=2.0)
        self.stock('CVX', 'Energy', change_1d=1.0)
        self.stock('JPM', 'Financials', change_1d=-0.5)
        self.stock('NEE', 'Utilities', change_1d=3.0)
        ranked = self.sectors()
        self.assertEqual([s['sector'] for s in ranked], ['Utilities', 'Energy', 'Financials'])
        self.assertEqual(ranked[1]['change_1d'], 1.5)
        self.assertEqual(ranked[1]['count'], 2)

    def test_average_skips_stocks_without_a_move_and_a_sector_without_any_ranks_last(self):
        self.stock('XOM', 'Energy', change_1d=2.0)
        self.stock('CVX', 'Energy', change_1d=None)
        self.stock('JPM', 'Financials')
        ranked = self.sectors()
        self.assertEqual(ranked[0]['change_1d'], 2.0)
        self.assertEqual(ranked[0]['count'], 2)
        self.assertEqual((ranked[1]['sector'], ranked[1]['change_1d']), ('Financials', None))

    def test_leaves_out_unmatched_rows_and_rows_without_a_sector(self):
        self.stock('XOM', 'Energy', change_1d=1.0)
        self.stock('GONE', 'Energy', change_1d=9.0, status=ScreenerRow.UNMATCHED)
        self.stock('NOSEC', '', change_1d=5.0)
        ranked = self.sectors()
        self.assertEqual([(s['sector'], s['count']) for s in ranked], [('Energy', 1)])

    def test_lists_stocks_largest_first(self):
        self.stock('SMALL', 'Energy', market_cap=10)
        self.stock('BIG', 'Energy', market_cap=500)
        self.stock('NOCAP', 'Energy')
        self.assertEqual([s['ticker'] for s in self.sectors()[0]['stocks']], ['BIG', 'SMALL', 'NOCAP'])

    def test_each_sector_carries_its_fund(self):
        self.stock('XOM', 'Energy')
        self.stock('MSFT', 'Information Technology')
        funds = {s['sector']: s['fund'] for s in self.sectors()}
        self.assertEqual(funds['Energy'], {'ticker': 'XLE', 'uic': 35415, 'asset_type': 'Etf'})
        self.assertEqual(funds['Information Technology'], {'ticker': 'XLK', 'uic': 35417, 'asset_type': 'Etf'})

    def test_all_eleven_sectors_have_a_fund(self):
        names = [
            'Communication Services', 'Consumer Discretionary', 'Consumer Staples', 'Energy', 'Financials',
            'Health Care', 'Industrials', 'Information Technology', 'Materials', 'Real Estate', 'Utilities',
        ]
        for number, name in enumerate(names):
            self.stock(f'S{number}', name)
        sectors = self.sectors()
        self.assertEqual(len(sectors), 11)
        self.assertTrue(all(s['fund'] and s['fund']['uic'] for s in sectors))

    def test_a_sector_outside_the_standard_eleven_has_no_fund(self):
        self.stock('ODD', 'Something Else')
        self.assertIsNone(self.sectors()[0]['fund'])
