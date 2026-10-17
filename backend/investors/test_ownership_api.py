from datetime import date

from django.contrib.auth.models import User
from django.urls import reverse
from rest_framework.test import APITestCase

from .factories import make_investor, store_quarter
from .models import Security

Q1 = date(2026, 3, 31)
Q2 = date(2026, 6, 30)

APPLE = ('037833100', 'APPLE INC')
NVIDIA = ('67066G104', 'NVIDIA CORP')
MICROSOFT = ('594918104', 'MICROSOFT CORP')
ALPHABET_OLD = ('38259P508', 'GOOGLE INC')
ALPHABET = ('02079K305', 'ALPHABET INC')

NO_MOVES = {
    'owners': 0, 'new': 0, 'added': 0, 'trimmed': 0, 'sold_out': 0, 'unchanged': 0,
    'shares': 0, 'shares_change': 0, 'shares_change_pct': None,
}


def held(security, shares, value, put_call=''):
    return (*security, shares, value, put_call)


class OwnershipApiTest(APITestCase):
    def setUp(self):
        self.client.force_authenticate(User.objects.create_user('me', password='x'))
        for (cusip, _), ticker in (
            (APPLE, 'AAPL'), (NVIDIA, 'NVDA'), (MICROSOFT, 'MSFT'), (ALPHABET_OLD, 'GOOGL'), (ALPHABET, 'GOOGL'),
        ):
            Security.objects.create(cusip=cusip, ticker=ticker)
        self.berkshire = make_investor(followed=True)
        self.pershing = make_investor(
            name='Bill Ackman', firm='Pershing Square', cik=1336528, slug='pershing-square',
        )
        store_quarter(self.berkshire, Q1, [held(APPLE, 10, 600)])
        store_quarter(self.berkshire, Q2, [held(APPLE, 20, 1200), held(NVIDIA, 1, 400)])
        store_quarter(self.pershing, Q1, [held(APPLE, 10, 600), held(MICROSOFT, 5, 500)])
        store_quarter(self.pershing, Q2, [held(MICROSOFT, 5, 500)])

    def summary(self, tickers):
        return self.client.get(reverse('investor-ownership'), {'tickers': tickers})

    def detail(self, ticker):
        return self.client.get(reverse('investor-ownership-detail', args=[ticker]))

    def test_ownership_needs_a_login(self):
        self.client.force_authenticate(None)

        self.assertEqual(self.summary('AAPL').status_code, 401)
        self.assertEqual(self.detail('AAPL').status_code, 401)

    def test_the_summary_names_the_quarter_it_describes(self):
        response = self.summary('AAPL')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            (response.data['quarter'], response.data['filed'], response.data['tracked']), ('2026-06-30', 2, 2),
        )

    def test_moves_are_counted_per_kind_and_a_sold_out_fund_is_not_an_owner(self):
        stocks = self.summary('aapl,NVDA, msft').data['stocks']

        self.assertEqual(
            stocks['AAPL'],
            {**NO_MOVES, 'owners': 1, 'added': 1, 'sold_out': 1, 'shares': 20, 'shares_change': 0, 'shares_change_pct': 0.0},
        )
        self.assertEqual(
            stocks['NVDA'], {**NO_MOVES, 'owners': 1, 'new': 1, 'shares': 1, 'shares_change': 1},
        )
        self.assertEqual(
            stocks['MSFT'],
            {**NO_MOVES, 'owners': 1, 'unchanged': 1, 'shares': 5, 'shares_change': 0, 'shares_change_pct': 0.0},
        )

    def test_an_unknown_ticker_is_null_and_an_unheld_one_is_zero(self):
        Security.objects.create(cusip='88160R101', ticker='TSLA')

        stocks = self.summary('TSLA,ASML').data['stocks']

        self.assertEqual(stocks, {'TSLA': NO_MOVES, 'ASML': None})

    def test_option_rows_never_count(self):
        desk = make_investor(name='Options Desk', firm='Desk Capital', cik=1111111, slug='desk-capital')
        store_quarter(desk, Q2, [held(NVIDIA, 9, 900, 'Call')])

        self.assertEqual(
            self.summary('NVDA').data['stocks']['NVDA'], {**NO_MOVES, 'owners': 1, 'new': 1, 'shares': 1, 'shares_change': 1},
        )

    def test_two_cusips_under_one_ticker_are_one_position(self):
        third = make_investor(name='Chris Hohn', firm='TCI', cik=1647251, slug='tci')
        store_quarter(third, Q1, [held(ALPHABET_OLD, 10, 1000)])
        store_quarter(third, Q2, [held(ALPHABET_OLD, 10, 1000), held(ALPHABET, 10, 1000)])

        self.assertEqual(
            self.summary('GOOGL').data['stocks']['GOOGL'],
            {**NO_MOVES, 'owners': 1, 'added': 1, 'shares': 20, 'shares_change': 10, 'shares_change_pct': 100.0},
        )

    def test_a_fund_with_one_stored_quarter_owns_without_a_move(self):
        newcomer = make_investor(name='Li Lu', firm='Himalaya', cik=1709323, slug='himalaya')
        store_quarter(newcomer, Q2, [held(NVIDIA, 3, 300)])

        self.assertEqual(
            self.summary('NVDA').data['stocks']['NVDA'],
            {**NO_MOVES, 'owners': 2, 'new': 1, 'shares': 4, 'shares_change': 1},
        )

    def test_a_net_sale_is_negative_and_measured_against_what_was_held_before(self):
        third = make_investor(name='Chris Hohn', firm='TCI', cik=1647251, slug='tci')
        store_quarter(third, Q1, [held(NVIDIA, 100, 1000)])
        store_quarter(third, Q2, [held(NVIDIA, 60, 600)])

        stock = self.summary('NVDA').data['stocks']['NVDA']

        self.assertEqual(
            (stock['shares'], stock['shares_change'], stock['shares_change_pct']), (61, -39, -39.0),
        )

    def test_a_fund_with_nothing_to_compare_adds_shares_but_no_change(self):
        newcomer = make_investor(name='Li Lu', firm='Himalaya', cik=1709323, slug='himalaya')
        store_quarter(newcomer, Q2, [held(APPLE, 7, 70)])

        stock = self.summary('AAPL').data['stocks']['AAPL']

        self.assertEqual((stock['shares'], stock['shares_change'], stock['shares_change_pct']), (27, 0, 0.0))

    def test_the_summary_refuses_no_tickers_and_too_many(self):
        self.assertEqual(self.client.get(reverse('investor-ownership')).status_code, 400)
        self.assertEqual(self.summary(' , ').status_code, 400)
        self.assertEqual(self.summary(','.join(f'T{n}' for n in range(201))).status_code, 400)

    def test_the_summary_costs_the_same_for_one_ticker_as_for_three(self):
        with self.assertNumQueries(4):
            self.summary('AAPL')
        with self.assertNumQueries(4):
            self.summary('AAPL,NVDA,MSFT')

    def test_the_detail_lists_funds_by_weight_with_sold_out_funds_last(self):
        third = make_investor(name='Chris Hohn', firm='TCI', cik=1647251, slug='tci')
        store_quarter(third, Q1, [held(MICROSOFT, 5, 500)])
        store_quarter(third, Q2, [held(NVIDIA, 30, 9500)])

        response = self.detail('nvda')

        self.assertEqual(response.status_code, 200)
        self.assertEqual((response.data['ticker'], response.data['issuer']), ('NVDA', 'NVIDIA CORP'))
        self.assertEqual(
            response.data['stock'], {**NO_MOVES, 'owners': 2, 'new': 2, 'shares': 31, 'shares_change': 31},
        )
        self.assertEqual([fund['slug'] for fund in response.data['funds']], ['tci', 'berkshire-hathaway'])
        self.assertEqual(
            response.data['funds'][1],
            {
                'slug': 'berkshire-hathaway', 'name': 'Warren Buffett', 'firm': 'Berkshire Hathaway',
                'followed': True, 'photo_url': None, 'kind': 'new', 'shares': 1, 'previous_shares': None, 'change_pct': None,
                'value': 400, 'weight': 25.0, 'previous_weight': None,
            },
        )

    def test_the_detail_reports_the_share_change_and_keeps_a_sold_out_fund(self):
        funds = self.detail('AAPL').data['funds']

        self.assertEqual([(fund['slug'], fund['kind']) for fund in funds], [
            ('berkshire-hathaway', 'added'), ('pershing-square', 'sold_out'),
        ])
        self.assertEqual((funds[0]['shares'], funds[0]['previous_shares'], funds[0]['change_pct']), (20, 10, 100.0))
        self.assertEqual((funds[1]['shares'], funds[1]['previous_shares'], funds[1]['change_pct']), (0, 10, -100.0))

    def test_the_detail_of_an_unknown_ticker_is_empty_not_missing(self):
        response = self.detail('ASML')

        self.assertEqual(response.status_code, 200)
        self.assertEqual((response.data['stock'], response.data['funds'], response.data['issuer']), (None, [], ''))


class OwnershipWithoutFilingsTest(APITestCase):
    def setUp(self):
        self.client.force_authenticate(User.objects.create_user('me', password='x'))

    def test_no_filings_means_no_quarter_and_no_stocks(self):
        Security.objects.create(cusip='037833100', ticker='AAPL')

        response = self.client.get(reverse('investor-ownership'), {'tickers': 'AAPL'})

        self.assertEqual(response.status_code, 200)
        self.assertEqual((response.data['quarter'], response.data['stocks']), (None, {'AAPL': None}))
