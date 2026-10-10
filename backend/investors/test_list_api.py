from datetime import date
from unittest.mock import patch

from django.contrib.auth.models import User
from django.urls import reverse
from rest_framework.test import APITestCase

from .factories import make_investor, store_quarter
from .models import Investor, Security

Q1 = date(2026, 3, 31)
Q2 = date(2026, 6, 30)


class FixedToday(date):
    @classmethod
    def today(cls):
        return date(2026, 10, 5)


@patch('investors.views.date', FixedToday)
class InvestorListApiTest(APITestCase):
    def setUp(self):
        self.client.force_authenticate(User.objects.create_user('me', password='x'))
        self.url = reverse('investor-list')

    def card(self, slug):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        return next(card for card in response.data if card['slug'] == slug)

    def test_requires_authentication(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(self.url).status_code, 401)

    def test_a_card_summarises_the_latest_quarter(self):
        investor = make_investor(last_filing_at=date(2026, 8, 14))
        store_quarter(investor, Q1, [('037833100', 'APPLE INC', 10, 600), ('02005N100', 'ALLY', 5, 400)])
        store_quarter(investor, Q2, [
            ('037833100', 'APPLE INC', 10, 500), ('67066G104', 'NVIDIA CORP', 1, 300),
            ('594918104', 'MICROSOFT CORP', 1, 150), ('88160R101', 'TESLA INC', 1, 50),
        ])
        Security.objects.create(cusip='037833100', ticker='AAPL')

        card = self.card('berkshire-hathaway')

        self.assertEqual(card['latest_quarter'], '2026-06-30')
        self.assertEqual((card['total_value'], card['positions']), (1000, 4))
        self.assertEqual(card['top_holdings'], [
            {'cusip': '037833100', 'ticker': 'AAPL', 'issuer': 'APPLE INC', 'weight': 50.0},
            {'cusip': '67066G104', 'ticker': None, 'issuer': 'NVIDIA CORP', 'weight': 30.0},
            {'cusip': '594918104', 'ticker': None, 'issuer': 'MICROSOFT CORP', 'weight': 15.0},
        ])
        self.assertEqual((card['new_count'], card['exited_count']), (3, 1))
        self.assertEqual(card['last_filing_at'], '2026-08-14')
        self.assertFalse(card['stale'])
        self.assertIsNone(card['import'])
        self.assertTrue(card['curated'])

    def test_a_first_quarter_has_no_change_counts(self):
        store_quarter(make_investor(), Q2, [('037833100', 'APPLE INC', 10, 500)])

        card = self.card('berkshire-hathaway')

        self.assertEqual((card['new_count'], card['exited_count']), (None, None))

    def test_an_investor_with_nothing_imported_yet_is_listed_empty(self):
        make_investor()

        card = self.card('berkshire-hathaway')

        self.assertEqual(
            (card['latest_quarter'], card['total_value'], card['positions'], card['top_holdings']),
            (None, None, None, []),
        )
        self.assertFalse(card['stale'])

    def test_no_filing_for_over_two_quarters_is_stale_but_keeps_its_last_portfolio(self):
        investor = make_investor(
            name='Michael Burry', firm='Scion Asset Management', cik=1649339, slug='scion-asset-management',
            last_filing_at=date(2025, 11, 14),
        )
        store_quarter(investor, date(2025, 9, 30), [('037833100', 'APPLE INC', 10, 500)])

        card = self.card('scion-asset-management')

        self.assertTrue(card['stale'])
        self.assertEqual(card['positions'], 1)

    def test_a_running_backfill_reports_its_progress(self):
        investor = make_investor(quarters_expected=20)
        store_quarter(investor, Q2, [('037833100', 'APPLE INC', 10, 500), ('02005N100', 'ALLY', 5, 400)])
        Security.objects.create(cusip='037833100', ticker='AAPL')
        Security.objects.create(cusip='02005N100')

        card = self.card('berkshire-hathaway')

        self.assertEqual(card['import'], {
            'quarters_imported': 1, 'quarters_expected': 20, 'cusips_resolved': 1, 'cusips_seen': 2,
        })

    def test_lists_every_investor_by_name(self):
        make_investor()
        make_investor(name='Bill Ackman', firm='Pershing Square', cik=1336528, slug='pershing-square')

        names = [card['name'] for card in self.client.get(self.url).data]

        self.assertEqual(names, ['Bill Ackman', 'Warren Buffett'])

    def test_a_card_carries_the_top_ten_share(self):
        investor = make_investor(last_filing_at=date(2026, 8, 14))
        store_quarter(investor, Q2, [('037833100', 'APPLE INC', 10, 600), ('02005N100', 'ALLY', 5, 400)])

        self.assertEqual(self.card('berkshire-hathaway')['top10_weight'], 100.0)

    def test_an_empty_investor_has_no_top_ten_share(self):
        make_investor()
        self.assertIsNone(self.card('berkshire-hathaway')['top10_weight'])

    def test_holds_lists_only_investors_whose_latest_quarter_has_the_ticker(self):
        berkshire = make_investor()
        pershing = make_investor(name='Bill Ackman', firm='Pershing Square', cik=1336528, slug='pershing-square')
        store_quarter(berkshire, Q2, [('037833100', 'APPLE INC', 10, 500)])
        store_quarter(pershing, Q1, [('037833100', 'APPLE INC', 10, 500)])
        store_quarter(pershing, Q2, [('02005N100', 'ALLY', 5, 400)])
        Security.objects.create(cusip='037833100', ticker='AAPL')

        slugs = [card['slug'] for card in self.client.get(self.url, {'holds': 'aapl'}).data]

        self.assertEqual(slugs, ['berkshire-hathaway'])

    def test_a_card_carries_styles_and_followed(self):
        make_investor(styles=['Value', 'Concentrated'], followed=True)
        card = self.card('berkshire-hathaway')
        self.assertEqual((card['styles'], card['followed']), (['Value', 'Concentrated'], True))

    def test_cards_cost_the_same_number_of_queries_for_one_or_many_investors(self):
        for index in range(6):
            investor = make_investor(name=f'M{index}', firm=f'F{index}', cik=index + 1, slug=f'f{index}')
            store_quarter(investor, Q1, [('037833100', 'APPLE INC', 10, 600)])
            store_quarter(investor, Q2, [('037833100', 'APPLE INC', 12, 700)])
        with self.assertNumQueries(4):
            self.client.get(self.url)

    def test_an_investor_still_importing_has_an_empty_card(self):
        make_investor(quarters_expected=0)
        card = self.card('berkshire-hathaway')
        self.assertEqual((card['latest_quarter'], card['total_value'], card['new_count']), (None, None, None))
        self.assertEqual(card['import']['quarters_expected'], 0)

    def test_holds_matches_only_the_latest_quarter(self):
        seller = make_investor()
        store_quarter(seller, Q1, [('037833100', 'APPLE INC', 10, 600)])
        store_quarter(seller, Q2, [('67066G104', 'NVIDIA CORP', 1, 300)])
        holder = make_investor(name='Bill Ackman', firm='Pershing Square', cik=1336528, slug='pershing-square')
        store_quarter(holder, Q2, [('037833100', 'APPLE INC', 10, 600)])
        Security.objects.create(cusip='037833100', ticker='AAPL')

        response = self.client.get(self.url, {'holds': 'aapl'})

        self.assertEqual([card['slug'] for card in response.data], ['pershing-square'])

    def test_holds_ignores_an_investor_whose_only_position_is_an_option(self):
        options_only = make_investor()
        store_quarter(options_only, Q2, [('037833100', 'APPLE INC', 10, 600, 'PUT')])
        holder = make_investor(name='Bill Ackman', firm='Pershing Square', cik=1336528, slug='pershing-square')
        store_quarter(holder, Q2, [('037833100', 'APPLE INC', 10, 600)])
        Security.objects.create(cusip='037833100', ticker='AAPL')

        response = self.client.get(self.url, {'holds': 'AAPL'})

        self.assertEqual([card['slug'] for card in response.data], ['pershing-square'])
