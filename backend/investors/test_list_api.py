from datetime import date

from django.contrib.auth.models import User
from django.urls import reverse
from rest_framework.test import APITestCase

from .factories import make_investor, store_quarter
from .models import Investor, Security

Q1 = date(2026, 3, 31)
Q2 = date(2026, 6, 30)


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
