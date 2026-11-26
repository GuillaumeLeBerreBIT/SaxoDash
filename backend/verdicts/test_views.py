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
    fields = {
        'checks': CHECKS, 'current_pe': 30.0, 'cheap_below': 20.0, 'expensive_above': 28.0,
        'last_close': 100.0, 'pct_vs_ma200': 4.5, 'as_of': date(2026, 11, 10), **extra,
    }
    return StockVerdict.objects.create(
        ticker=ticker, name=f'{ticker} Corp', quality=quality, valuation=valuation, **fields,
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
        self.assertEqual(bob['action'], 'buy')

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

    def test_the_detail_dates_each_input(self):
        verdict('AAA', close_date=date(2026, 11, 20), fundamental_period=date(2026, 9, 30), published_on=date(2026, 10, 30))
        self.client.force_authenticate(self.bob)
        detail = self.client.get('/api/verdicts/AAA/').json()['verdict']
        self.assertEqual(
            (detail['as_of'], detail['close_date'], detail['fundamental_period'], detail['published_on']),
            ('2026-11-10', '2026-11-20', '2026-09-30', '2026-10-30'),
        )

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

    def test_detail_carries_the_pe_percentiles_and_no_historical_band(self):
        verdict('AAA', pe_p25=20.0, pe_p75=30.0)
        self.client.force_authenticate(self.bob)
        detail = self.client.get('/api/verdicts/aaa/').json()['verdict']
        self.assertNotIn('eps_line', detail)
        self.assertEqual((detail['pe_p25'], detail['pe_p75']), (20.0, 30.0))

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


def listed(ticker, sector='Information Technology', dividend_yield=None, **fields):
    made = verdict(ticker, **fields)
    ScreenerRow.everything.filter(ticker=ticker).update(sector=sector, dividend_yield=dividend_yield)
    return made


class BrowseTests(APITestCase):
    def setUp(self):
        self.alice = make_user('alice')
        self.client.force_authenticate(self.alice)

    def browse(self, query=''):
        return self.client.get(f'/api/verdicts/browse/{query}')

    def tickers(self, query=''):
        return [stock['ticker'] for stock in self.browse(query).json()['stocks']]

    def test_puts_strong_quality_first_then_most_checks_passed_whatever_the_price(self):
        some_fail = [*CHECKS[:5], {**CHECKS[5], 'status': 'fail'}]
        listed('MIX', quality='mixed', valuation='cheap', last_close=10.0)
        listed('FIV', valuation='cheap', last_close=10.0, checks=some_fail)
        listed('SIX', valuation='expensive', last_close=40.0)
        self.assertEqual(self.tickers(), ['SIX', 'FIV', 'MIX'])

    def test_each_stock_carries_what_a_card_needs(self):
        listed('OPA', valuation='cheap', last_close=15.0, high_1y=30.0, spark=[30.0, 20.0, 15.0], dividend_yield=3.5)
        stock = self.browse().json()['stocks'][0]
        self.assertEqual(stock['action'], 'buy')
        self.assertEqual(stock['sector'], 'Information Technology')
        self.assertEqual(stock['below_high_pct'], 50.0)
        self.assertNotIn('discount_pct', stock)
        self.assertEqual(stock['spark'], [30.0, 20.0, 15.0])
        self.assertEqual((stock['checks_passed'], stock['checks_answered'], stock['failed_checks']), (6, 6, []))
        self.assertEqual(stock['passed_checks'], [check['label'] for check in CHECKS])
        self.assertIsNone(stock['revenue_growth_5y'])
        self.assertFalse(stock['held'])

    def test_browse_evidence_only_uses_answered_checks_from_the_verdict(self):
        growth = {'key': 'revenue_growth', 'label': 'Revenue growth', 'status': 'pass', 'value': 8.24}
        listed('AAA', checks=[growth, {'label': 'Debt', 'status': 'fail'}, {'label': 'Cash', 'status': 'unknown'}])
        listed('BBB', checks=[{**growth, 'status': 'unknown'}])
        first, second = self.browse().json()['stocks']
        self.assertEqual((first['revenue_growth_5y'], first['passed_checks'], first['failed_checks']), (8.24, ['Revenue growth'], ['Debt']))
        self.assertIsNone(second['revenue_growth_5y'])
        self.assertEqual(second['checks_answered'], 0)

    def test_browse_judges_the_close_by_the_research_rule_lines_included(self):
        for ticker, close in [('LOW', 19.99), ('LEFT', 20), ('MID', 24), ('RIGHT', 28), ('SUB', 28.001), ('HIGH', 28.01)]:
            listed(ticker, valuation='cheap', last_close=close)
        listed('MISSING', valuation='cheap', last_close=None)
        listed('HALF', valuation='cheap', expensive_above=None)
        listed('INVERTED', valuation='cheap', expensive_above=10)
        listed('FLAT', valuation='cheap', expensive_above=20)
        groups = {
            'cheap': ['LEFT', 'LOW'], 'fair': ['MID'], 'expensive': ['HIGH', 'RIGHT', 'SUB'],
            'not_judged': ['FLAT', 'HALF', 'INVERTED', 'MISSING'],
        }
        for grade, tickers in groups.items():
            with self.subTest(grade=grade):
                body = self.browse(f'?valuation={grade}').json()
                self.assertEqual([stock['ticker'] for stock in body['stocks']], tickers)
                self.assertTrue(all(stock['valuation'] == grade for stock in body['stocks']))
                self.assertEqual(body['facets']['valuation'], {key: len(group) for key, group in groups.items()})

    def test_filters_by_valuation_quality_sector_yield_and_fall(self):
        listed('AAA', valuation='cheap', last_close=15.0, high_1y=30.0)
        listed('BBB', valuation='cheap', quality='weak', last_close=15.0)
        listed('CCC', valuation='fair', sector='Health Care', dividend_yield=4.0)
        listed('DDD', valuation='cheap', sector='Health Care', last_close=19.0, high_1y=20.0)
        self.assertEqual(self.tickers('?valuation=cheap&quality=strong'), ['AAA', 'DDD'])
        self.assertEqual(self.tickers('?sector=Health%20Care'), ['CCC', 'DDD'])
        self.assertEqual(self.tickers('?min_yield=3'), ['CCC'])
        self.assertEqual(self.tickers('?min_fall=25'), ['AAA'])

    def test_facet_counts_ignore_their_own_filter_but_keep_the_others(self):
        listed('AAA', last_close=15)
        listed('BBB', last_close=24)
        listed('CCC', last_close=15, sector='Health Care')
        facets = self.browse('?valuation=cheap&sector=Information%20Technology').json()['facets']
        self.assertEqual(facets['valuation'], {'cheap': 1, 'fair': 1})
        self.assertEqual(facets['sector'], {'Information Technology': 1, 'Health Care': 1})
        self.assertEqual(facets['quality'], {'strong': 1})

    def test_can_filter_on_incomplete_quality(self):
        listed('AAA')
        listed('BBB', quality='incomplete')
        self.assertEqual(self.tickers('?quality=incomplete'), ['BBB'])

    def test_can_leave_out_held_stocks_and_tickers_already_shown(self):
        listed('AAA', valuation='cheap')
        listed('BBB', valuation='cheap')
        listed('CCC', valuation='cheap')
        hold(self.alice, 'AAA', '100')
        self.assertEqual(self.tickers('?not_held=1&exclude=bbb'), ['CCC'])
        held = {stock['ticker']: stock['held'] for stock in self.browse().json()['stocks']}
        self.assertTrue(held['AAA'])

    def test_sorts_by_fall_from_the_high_and_has_no_value_sort(self):
        listed('AAA', valuation='cheap', last_close=18.0, high_1y=100.0)
        listed('BBB', valuation='cheap', last_close=10.0, high_1y=12.0)
        self.assertEqual(self.tickers('?sort=fall'), ['AAA', 'BBB'])
        self.assertEqual(self.browse('?sort=discount').status_code, 400)

    def test_pages_with_limit_and_offset_and_reports_the_total(self):
        for index in range(5):
            listed(f'T{index}', valuation='cheap', last_close=10.0 + index)
        body = self.browse('?limit=2&offset=2').json()
        self.assertEqual(body['total'], 5)
        self.assertEqual([stock['ticker'] for stock in body['stocks']], ['T2', 'T3'])

    def test_can_be_limited_to_a_list_of_tickers(self):
        listed('AAA', valuation='cheap')
        listed('BBB', valuation='fair')
        listed('CCC', valuation='cheap')
        self.assertEqual(self.tickers('?tickers=bbb,ccc'), ['BBB', 'CCC'])

    def test_searches_by_ticker_start_or_name(self):
        listed('NVDA', valuation='cheap')
        listed('AVGO', valuation='cheap')
        self.assertEqual(self.tickers('?q=nv'), ['NVDA'])
        self.assertEqual(self.tickers('?q=avgo%20corp'), ['AVGO'])

    def test_leaves_out_stocks_outside_the_index_universe(self):
        listed('AAA', valuation='cheap')
        listed('NBIS', valuation='cheap', universe=False)
        self.assertEqual(self.tickers(), ['AAA'])

    def test_checks_sort_and_pullback_membership(self):
        listed('AAA', quality='mixed', checks=CHECKS)
        listed('BBB', quality='strong', checks=CHECKS[:4], high_1y=200)
        self.assertEqual(self.tickers('?sort=checks'), ['AAA', 'BBB'])
        self.assertEqual(self.tickers('?screen=pullbacks'), ['BBB'])
        self.assertEqual(self.browse('?screen=typo').status_code, 400)

    def test_searches_beyond_the_shelf_preview(self):
        for i in range(25):
            ticker = f'T{i:02d}'
            listed(ticker)
            ScreenerRow.objects.filter(ticker=ticker).update(status=ScreenerRow.OK, rsi14=75 + i)
        body = self.browse('?screen=overbought&q=T00').json()
        self.assertEqual(body['total'], 1)
        self.assertEqual(body['stocks'][0]['reasons'][0]['value'], 75)

    def test_saved_screen_only_includes_my_matching_instruments_once(self):
        listed('AAA', uic=11)
        listed('BBB', uic=22)
        other = Watchlist.objects.create(user=make_user('other'), name='Other')
        WatchlistItem.objects.create(watchlist=other, symbol='BBB', uic=22)
        self.assertEqual(self.tickers('?screen=saved'), [])
        for name in ['Ideas', 'Read']:
            mine = Watchlist.objects.create(user=self.alice, name=name)
            WatchlistItem.objects.create(watchlist=mine, symbol='AAA', uic=11)
        self.assertEqual(self.tickers('?screen=saved'), ['AAA'])

    def test_refuses_unknown_values(self):
        self.assertEqual(self.browse('?valuation=bargain').status_code, 400)
        self.assertEqual(self.browse('?sort=random').status_code, 400)
        self.assertEqual(self.browse('?limit=500').status_code, 400)
        self.assertEqual(self.browse('?min_fall=abc').status_code, 400)

    def test_requires_login(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.browse().status_code, 401)
