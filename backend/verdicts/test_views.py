from datetime import date
from decimal import Decimal

from rest_framework.test import APITestCase

from portfolio.models import Position
from research.models import ScreenerRow, Watchlist, WatchlistItem
from users.testing import make_user

from .actions import WEIGHT_CAP_PCT
from .models import StockVerdict

CHECKS = [
    {'key': f'check_{index}', 'label': f'Check {index}', 'status': 'pass', 'value': 1.0, 'threshold': 0.5}
    for index in range(6)
]


def verdict(ticker='AAA', quality='strong', valuation='expensive', universe=True, **extra):
    ScreenerRow.everything.create(ticker=ticker, name=ticker, indexes='sp500', in_universe=universe)
    return StockVerdict.objects.create(
        ticker=ticker, name=f'{ticker} Corp', quality=quality, valuation=valuation,
        checks=CHECKS, current_pe=30.0, cheap_below=20.0, expensive_above=28.0,
        last_close=100.0, pct_vs_ma200=4.5, as_of=date(2026, 11, 10), **extra,
    )


def hold(user, ticker, value, asset_type='Stock', currency='USD'):
    return Position.objects.create(
        user=user, ticker=ticker, name=ticker, qty=Decimal('1'), avg_cost=Decimal(value),
        current_price=Decimal(value), sector='Tech', type='STOCK', color='#000000',
        asset_type=asset_type, currency=currency,
    )


class VerdictApiTests(APITestCase):
    def setUp(self):
        self.alice = make_user('alice')
        self.bob = make_user('bob')

    def test_summary_gives_null_for_an_unknown_ticker(self):
        verdict('AAA')
        self.client.force_authenticate(self.bob)
        body = self.client.get('/api/verdicts/?tickers=aaa,NOPE').json()
        self.assertEqual(set(body['verdicts']), {'AAA', 'NOPE'})
        self.assertIsNone(body['verdicts']['NOPE'])
        self.assertEqual(
            set(body['verdicts']['AAA']), {'action', 'reason', 'uic', 'quality', 'valuation', 'as_of'},
        )
        self.assertEqual(body['verdicts']['AAA']['as_of'], '2026-11-10')

    def test_summary_refuses_a_bad_ticker_list(self):
        self.client.force_authenticate(self.bob)
        self.assertEqual(self.client.get('/api/verdicts/').status_code, 400)
        many = ','.join(f'T{index}' for index in range(201))
        self.assertEqual(self.client.get(f'/api/verdicts/?tickers={many}').status_code, 400)

    def test_summary_runs_a_fixed_number_of_queries(self):
        for index in range(20):
            verdict(f'T{index}')
        self.client.force_authenticate(self.bob)
        tickers = ','.join(f'T{index}' for index in range(20))
        with self.assertNumQueries(5):
            self.client.get(f'/api/verdicts/?tickers={tickers}')

    def test_action_follows_the_requesting_users_weight(self):
        verdict('AAA', quality='strong', valuation='expensive')
        hold(self.alice, 'AAA', '300')
        hold(self.alice, 'BBB', '700')
        hold(self.bob, 'BBB', '700')
        self.client.force_authenticate(self.alice)
        alice = self.client.get('/api/verdicts/?tickers=AAA').json()['verdicts']['AAA']
        self.client.force_authenticate(self.bob)
        bob = self.client.get('/api/verdicts/?tickers=AAA').json()['verdicts']['AAA']
        self.assertEqual(alice['action'], 'trim')
        self.assertEqual(bob['action'], 'wait')

    def test_a_holding_in_an_unpriced_book_is_still_held_with_no_weight(self):
        verdict('AAA', quality='strong', valuation='cheap')
        hold(self.alice, 'AAA', '0')
        self.client.force_authenticate(self.alice)
        detail = self.client.get('/api/verdicts/AAA/').json()['verdict']
        self.assertEqual(detail['action'], 'add')
        self.assertTrue(detail['held'])
        self.assertIsNone(detail['weight_pct'])

    def test_two_lots_of_one_ticker_are_one_weight(self):
        verdict('AAA')
        hold(self.alice, 'AAA', '100')
        hold(self.alice, 'AAA:xnas', '100')
        hold(self.alice, 'BBB', '800')
        self.client.force_authenticate(self.alice)
        detail = self.client.get('/api/verdicts/AAA/').json()['verdict']
        self.assertEqual(detail['weight_pct'], 20.0)
        self.assertTrue(detail['held'])

    def test_only_us_dollar_stocks_count_as_holding_the_company(self):
        verdict('AAA')
        hold(self.alice, 'AAA', '300', currency='EUR')
        hold(self.alice, 'BBB', '700')
        self.client.force_authenticate(self.alice)
        detail = self.client.get('/api/verdicts/AAA/').json()['verdict']
        self.assertFalse(detail['held'])
        self.assertIsNone(detail['weight_pct'])

    def test_a_user_without_positions_holds_nothing(self):
        verdict('AAA')
        self.client.force_authenticate(self.bob)
        detail = self.client.get('/api/verdicts/AAA/').json()['verdict']
        self.assertFalse(detail['held'])
        self.assertEqual(detail['weight_cap_pct'], WEIGHT_CAP_PCT)

    def test_summary_and_detail_expose_the_uic_the_verdict_was_computed_for(self):
        verdict('AAA', uic=1249)
        verdict('BBB')
        self.client.force_authenticate(self.bob)
        summary = self.client.get('/api/verdicts/?tickers=AAA,BBB').json()['verdicts']
        self.assertEqual(summary['AAA']['uic'], 1249)
        self.assertIsNone(summary['BBB']['uic'])
        self.assertEqual(self.client.get('/api/verdicts/aaa/').json()['verdict']['uic'], 1249)

    def test_detail_lists_six_checks_and_both_levels(self):
        verdict('AAA')
        self.client.force_authenticate(self.bob)
        detail = self.client.get('/api/verdicts/aaa/').json()['verdict']
        self.assertEqual(len(detail['checks']), 6)
        self.assertEqual(detail['name'], 'AAA Corp')
        self.assertEqual(detail['cheap_below'], 20.0)
        self.assertEqual(detail['expensive_above'], 28.0)
        self.assertEqual(detail['current_pe'], 30.0)
        self.assertEqual(detail['last_close'], 100.0)
        self.assertEqual(detail['pct_vs_ma200'], 4.5)

    def test_detail_reads_a_saxo_symbol_as_its_bare_ticker(self):
        verdict('NVDA')
        self.client.force_authenticate(self.bob)
        detail = self.client.get('/api/verdicts/nvda:xnas/').json()['verdict']
        self.assertEqual(detail['ticker'], 'NVDA')

    def test_unknown_ticker_detail_is_a_null_verdict(self):
        self.client.force_authenticate(self.bob)
        response = self.client.get('/api/verdicts/NOPE/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'verdict': None})

    def test_endpoints_require_login(self):
        for url in ('/api/verdicts/?tickers=AAA', '/api/verdicts/AAA/', '/api/verdicts/track-record/'):
            self.assertEqual(self.client.get(url).status_code, 401, url)

    def test_track_record_route_is_not_read_as_a_ticker(self):
        self.client.force_authenticate(self.bob)
        body = self.client.get('/api/verdicts/track-record/').json()
        self.assertEqual(body['calls'], [])
        self.assertIn('summary', body)
        self.assertNotIn('verdict', body)


class NonUniverseVisibilityTests(APITestCase):
    def setUp(self):
        self.alice = make_user('alice')
        self.bob = make_user('bob')
        verdict('NBIS', universe=False)
        verdict('AAA')

    def summary(self, user, tickers='NBIS,AAA'):
        self.client.force_authenticate(user)
        return self.client.get(f'/api/verdicts/?tickers={tickers}').json()['verdicts']

    def detail(self, user, ticker='NBIS'):
        self.client.force_authenticate(user)
        return self.client.get(f'/api/verdicts/{ticker}/').json()

    def test_the_holder_of_an_extra_gets_its_verdict(self):
        hold(self.alice, 'NBIS:xnas', '100')
        self.assertIsNotNone(self.summary(self.alice)['NBIS'])
        self.assertEqual(self.detail(self.alice)['verdict']['ticker'], 'NBIS')

    def test_another_user_gets_null_as_for_an_unknown_ticker(self):
        hold(self.alice, 'NBIS', '100')
        self.assertIsNone(self.summary(self.bob)['NBIS'])
        self.assertEqual(self.detail(self.bob), {'verdict': None})

    def test_a_universe_ticker_is_visible_to_everyone(self):
        hold(self.alice, 'NBIS', '100')
        self.assertIsNotNone(self.summary(self.alice)['AAA'])
        self.assertIsNotNone(self.summary(self.bob)['AAA'])

    def test_a_user_who_only_watches_the_extra_sees_it(self):
        watchlist = Watchlist.objects.create(user=self.bob, name='W')
        WatchlistItem.objects.create(watchlist=watchlist, symbol='nbis:xnas', uic=7)
        self.assertIsNotNone(self.summary(self.bob)['NBIS'])
        self.assertEqual(self.detail(self.bob)['verdict']['ticker'], 'NBIS')

    def test_another_users_watchlist_does_not_open_it(self):
        watchlist = Watchlist.objects.create(user=self.alice, name='W')
        WatchlistItem.objects.create(watchlist=watchlist, symbol='NBIS', uic=7)
        self.assertIsNone(self.summary(self.bob)['NBIS'])
