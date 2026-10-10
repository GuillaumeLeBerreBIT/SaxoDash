from datetime import date
from unittest.mock import patch

from django.contrib.auth.models import User
from django.urls import reverse
from rest_framework.test import APITestCase

from portfolio.models import Position
from research.models import Watchlist, WatchlistItem

from .factories import make_investor, store_quarter
from .models import Security

Q1 = date(2026, 3, 31)
Q2 = date(2026, 6, 30)


class InvestorDetailApiTest(APITestCase):
    def setUp(self):
        self.client.force_authenticate(User.objects.create_user('me', password='x'))
        self.investor = make_investor(last_filing_at=date(2026, 8, 14))
        store_quarter(self.investor, Q1, [
            ('037833100', 'APPLE INC', 100, 600), ('02005N100', 'ALLY FINL INC', 5, 400),
            ('084670702', 'BERKSHIRE HATHAWAY INC', 10, 100),
        ])
        store_quarter(self.investor, Q2, [
            ('037833100', 'APPLE INC', 110, 700), ('67066G104', 'NVIDIA CORP', 1, 200),
            ('67066G104', 'NVIDIA CORP', 1, 50, 'CALL'), ('084670702', 'BERKSHIRE HATHAWAY INC', 10, 50),
        ])
        Security.objects.create(cusip='037833100', ticker='AAPL')
        Security.objects.create(cusip='67066G104', ticker='NVDA')
        Security.objects.create(cusip='084670702', ticker='BRK.B')

    def url(self, slug='berkshire-hathaway'):
        return reverse('investor-detail', args=[slug])

    def holdings(self, **params):
        response = self.client.get(self.url(), params)
        self.assertEqual(response.status_code, 200)
        return {(h['cusip'], h['put_call']): h for h in response.data['holdings']}

    def test_defaults_to_the_latest_quarter_with_header_facts(self):
        data = self.client.get(self.url()).data

        self.assertEqual((data['quarter'], data['previous_quarter']), ('2026-06-30', '2026-03-31'))
        self.assertEqual(data['quarters'], ['2026-06-30', '2026-03-31'])
        self.assertEqual((data['total_value'], data['positions']), (1000, 4))
        self.assertEqual(data['top10_weight'], 100.0)
        self.assertEqual(data['name'], 'Warren Buffett')
        self.assertEqual(
            [h['cusip'] for h in data['holdings']], ['037833100', '67066G104', '084670702', '67066G104'],
        )

    def test_a_holding_carries_its_ticker_weight_change_and_tenure(self):
        apple = self.holdings()[('037833100', '')]

        self.assertEqual(apple, {
            'cusip': '037833100', 'ticker': 'AAPL', 'issuer': 'APPLE INC', 'class': '',
            'put_call': '', 'amount_type': 'SH', 'shares': 110, 'value': 700, 'weight': 70.0,
            'change': 'added', 'shares_change_pct': 10.0, 'quarters_held': 2,
            'sector': 'Information Technology', 'owned': False, 'watched': False,
        })

    def test_an_option_is_its_own_row_and_new(self):
        call = self.holdings()[('67066G104', 'CALL')]
        self.assertEqual((call['change'], call['quarters_held'], call['value']), ('new', 1, 50))

    def test_a_share_class_ticker_finds_its_sector(self):
        self.assertEqual(self.holdings()[('084670702', '')]['sector'], 'Financials')

    def test_a_ticker_outside_the_universe_or_unresolved_has_no_sector(self):
        Security.objects.filter(cusip='67066G104').update(ticker=None)
        nvda = self.holdings()[('67066G104', '')]
        self.assertEqual((nvda['ticker'], nvda['sector']), (None, None))

    def test_flags_what_you_own_and_watch(self):
        Position.objects.create(
            ticker='AAPL', name='Apple', qty=1, avg_cost=1, current_price=1,
            sector='Tech', type='STOCK', color='#000000',
        )
        WatchlistItem.objects.create(watchlist=Watchlist.objects.create(name='Tech'), symbol='nvda', uic=1)

        rows = self.holdings()

        self.assertTrue(rows[('037833100', '')]['owned'])
        self.assertTrue(rows[('67066G104', '')]['watched'])
        self.assertFalse(rows[('67066G104', '')]['owned'])

    def test_an_older_quarter_can_be_asked_for_and_is_a_first_quarter(self):
        data = self.client.get(self.url(), {'quarter': '2026-03-31'}).data

        self.assertEqual((data['quarter'], data['previous_quarter']), ('2026-03-31', None))
        self.assertTrue(all(h['change'] is None and h['shares_change_pct'] is None for h in data['holdings']))

    def test_a_quarter_not_stored_is_404(self):
        self.assertEqual(self.client.get(self.url(), {'quarter': '2025-12-31'}).status_code, 404)

    def test_a_malformed_quarter_is_400(self):
        self.assertEqual(self.client.get(self.url(), {'quarter': 'Q2-2026'}).status_code, 400)

    def test_an_unknown_investor_is_404(self):
        self.assertEqual(self.client.get(self.url('nobody')).status_code, 404)

    def test_an_investor_with_nothing_imported_answers_empty(self):
        make_investor(name='Bill Ackman', firm='Pershing Square', cik=1336528, slug='pershing-square')

        data = self.client.get(self.url('pershing-square')).data

        self.assertEqual((data['quarter'], data['quarters'], data['holdings']), (None, [], []))
        self.assertEqual((data['total_value'], data['positions'], data['top10_weight']), (None, None, None))

    def test_the_stats_strip_facts_compare_against_the_previous_quarter(self):
        data = self.client.get(self.url()).data

        self.assertEqual((data['new_count'], data['exited_count']), (2, 1))
        self.assertEqual(data['turnover'], 30.95)
        self.assertEqual(data['filed_on'], '2026-08-14')

    def test_a_first_quarter_has_no_comparison_facts(self):
        data = self.client.get(self.url(), {'quarter': '2026-03-31'}).data

        self.assertEqual((data['new_count'], data['exited_count'], data['turnover']), (None, None, None))
        self.assertEqual(data['filed_on'], '2026-05-15')

    def test_an_empty_investor_has_no_stats_strip_facts(self):
        make_investor(name='Bill Ackman', firm='Pershing Square', cik=1336528, slug='pershing-square')

        data = self.client.get(self.url('pershing-square')).data

        self.assertEqual(
            (data['filed_on'], data['new_count'], data['exited_count'], data['turnover']),
            (None, None, None, None),
        )

    def detail(self, **params):
        response = self.client.get(self.url(), params)
        self.assertEqual(response.status_code, 200)
        return response.data

    def test_the_story_moves_are_ordered_new_added_trimmed_sold_out(self):
        moves = self.detail()['moves']
        self.assertEqual(
            [(move['kind'], move['ticker'] or move['issuer'], move['put_call']) for move in moves],
            [('new', 'NVDA', ''), ('new', 'NVDA', 'CALL'), ('added', 'AAPL', ''), ('sold_out', 'ALLY FINL INC', '')],
        )
        added = moves[2]
        self.assertEqual((added['weight'], added['previous_weight'], added['shares_change_pct']), (70.0, 54.55, 10.0))
        self.assertEqual((moves[3]['weight'], moves[3]['previous_weight']), (0.0, 36.36))

    def test_unchanged_positions_are_not_moves(self):
        self.assertNotIn('BERKSHIRE HATHAWAY INC', [move['issuer'] for move in self.detail()['moves']])

    def test_the_first_stored_quarter_has_no_moves(self):
        self.assertEqual(self.detail(quarter='2026-03-31')['moves'], [])

    def test_concentration_is_the_top_five_weight(self):
        self.assertEqual(self.detail()['top5_weight'], 100.0)

    def test_sectors_sum_weights_and_group_the_unknown_as_other(self):
        with patch('investors.summaries.sectors.sector_for', side_effect=lambda t: {'AAPL': 'Technology'}.get(t)):
            sectors = self.detail()['sectors']
        self.assertEqual(sectors, [{'sector': 'Technology', 'weight': 70.0}, {'sector': 'Other', 'weight': 30.0}])

    def test_following_is_a_patch_that_answers_the_card(self):
        response = self.client.patch(self.url(), {'followed': True}, format='json')

        self.assertEqual((response.status_code, response.data['followed'], response.data['slug']), (200, True, 'berkshire-hathaway'))
        self.investor.refresh_from_db()
        self.assertTrue(self.investor.followed)

    def test_following_needs_a_boolean(self):
        self.assertEqual(self.client.patch(self.url(), {'followed': 'yes'}, format='json').status_code, 400)
