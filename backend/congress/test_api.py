from datetime import date, timedelta

from django.contrib.auth.models import User
from django.urls import reverse
from rest_framework.test import APITestCase

from .models import Holding, Member, Report, Trade

TODAY = date.today()


def trade(report, ticker, kind=Trade.PURCHASE, option='', priceable=True):
    return Trade.objects.create(
        report=report, owner='SP', asset=f'{ticker} Inc. ({ticker})', asset_type='OP' if option else 'ST', ticker=ticker,
        kind=kind, option=option, traded_on=report.filed_on - timedelta(days=5), amount_low=15001, amount_high=50000,
        priceable=priceable,
    )


class CongressApiTest(APITestCase):
    def setUp(self):
        self.client.force_authenticate(User.objects.create_user('me', password='x'))
        self.pelosi = Member.objects.create(slug='nancy-pelosi', first_name='Nancy', last_name='Pelosi',
                                            state_district='CA11', party='Democrat', basis={'trades': 2})
        self.crenshaw = Member.objects.create(slug='dan-crenshaw', first_name='Dan', last_name='Crenshaw',
                                              state_district='TX02', party='Republican')
        recent = Report.objects.create(doc_id='1', member=self.pelosi, year=TODAY.year, filed_on=TODAY - timedelta(days=10),
                                       status=Report.PARSED)
        old = Report.objects.create(doc_id='2', member=self.crenshaw, year=TODAY.year, filed_on=TODAY - timedelta(days=200),
                                    status=Report.PARSED)
        recent_sale = Report.objects.create(doc_id='3', member=self.crenshaw, year=TODAY.year,
                                            filed_on=TODAY - timedelta(days=20), status=Report.PARSED)
        trade(recent, 'NVDA', option=Trade.CALL)
        trade(recent, 'AAPL')
        trade(old, 'NVDA')
        trade(recent_sale, 'NVDA', kind=Trade.PARTIAL_SALE)
        Holding.objects.create(member=self.pelosi, ticker='NVDA', value=100.0, weight_pct=60.0)
        Holding.objects.create(member=self.pelosi, ticker='AAPL', value=66.7, weight_pct=40.0)

    def test_directory_lists_members_and_the_most_bought_tickers(self):
        body = self.client.get(reverse('congress-members')).json()
        self.assertEqual([card['slug'] for card in body['members']], ['dan-crenshaw', 'nancy-pelosi'])
        pelosi = body['members'][1]
        self.assertEqual((pelosi['party'], pelosi['trades'], pelosi['excess_cagr_pct']), ('Democrat', 2, None))
        self.assertEqual(body['most_bought'][0], {'ticker': 'AAPL', 'buyers': 1, 'sellers': 0})

    def test_member_profile(self):
        body = self.client.get(reverse('congress-member', args=['nancy-pelosi'])).json()
        self.assertEqual([held['ticker'] for held in body['holdings']], ['NVDA', 'AAPL'])
        self.assertEqual(len(body['trades']), 2)
        self.assertEqual(body['trades'][0]['amount_low'], 15001)
        self.assertEqual(body['basis'], {'trades': 2})
        self.assertFalse(body['copy']['available'])

    def test_unknown_member_is_404(self):
        self.assertEqual(self.client.get(reverse('congress-member', args=['nobody'])).status_code, 404)

    def test_ownership_summary_counts_holders_and_recent_buyers_and_sellers(self):
        body = self.client.get(reverse('congress-ownership'), {'tickers': 'NVDA,ASML'}).json()
        self.assertEqual(body['window_days'], 90)
        self.assertEqual(body['stocks']['NVDA'], {'holders': 1, 'buyers': 1, 'sellers': 1})
        self.assertIsNone(body['stocks']['ASML'])

    def test_ownership_summary_refuses_bad_tickers(self):
        self.assertEqual(self.client.get(reverse('congress-ownership'), {'tickers': ''}).status_code, 400)

    def test_ownership_detail_lists_members_and_their_trades(self):
        body = self.client.get(reverse('congress-ownership-detail', args=['nvda'])).json()
        self.assertEqual(body['ticker'], 'NVDA')
        self.assertEqual([member['slug'] for member in body['members']], ['nancy-pelosi', 'dan-crenshaw'])
        self.assertEqual(body['members'][0]['holds_weight_pct'], 60.0)
        self.assertEqual(len(body['members'][1]['trades']), 2)

    def test_ownership_detail_of_an_unknown_ticker_is_null(self):
        body = self.client.get(reverse('congress-ownership-detail', args=['ZZZZ'])).json()
        self.assertIsNone(body['stock'])
        self.assertEqual(body['members'], [])
