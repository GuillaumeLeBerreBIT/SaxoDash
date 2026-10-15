from datetime import date, timedelta

from django.test import TestCase

from investors.models import PriceHistory

from . import performance
from .models import CopyPerformance, Holding, Member, Report, Trade

START = date(2025, 1, 2)


def closes(start_price, step):
    return [[(START + timedelta(days=offset)).isoformat(), start_price + step * offset] for offset in range(400)]


class CopyTest(TestCase):
    def setUp(self):
        PriceHistory.objects.create(ticker='SPY', status=PriceHistory.OK, closes=closes(500, 0.5))
        PriceHistory.objects.create(ticker='NVDA', status=PriceHistory.OK, closes=closes(100, 1))
        self.member = Member.objects.create(slug='nancy-pelosi', first_name='Nancy', last_name='Pelosi', state_district='CA11')
        report = Report.objects.create(
            doc_id='1', member=self.member, year=2025, filed_on=START + timedelta(days=10), status=Report.PARSED,
        )
        Trade.objects.create(
            report=report, owner='SP', asset='NVIDIA Corporation (NVDA)', asset_type='ST', ticker='NVDA',
            kind=Trade.PURCHASE, traded_on=START + timedelta(days=2), amount_low=15001, amount_high=50000, priceable=True,
        )
        Report.objects.create(doc_id='8000001', member=self.member, year=2025, filed_on=START, status=Report.PAPER)
        Report.objects.create(doc_id='2', member=self.member, year=2025, filed_on=START, status=Report.FAILED)

    def test_rebuild_stores_copy_performance_holdings_and_basis(self):
        self.assertTrue(performance.rebuild(self.member))
        stored = CopyPerformance.objects.get(member=self.member)
        self.assertGreater(stored.clone_return_pct, 0)
        self.assertEqual(list(Holding.objects.filter(member=self.member).values_list('ticker', 'weight_pct')), [('NVDA', 100.0)])
        self.member.refresh_from_db()
        self.assertEqual(self.member.basis, {
            'trades': 1, 'unseen_sales': 0, 'unpriced': 0, 'paper_reports': 1, 'failed_reports': 1, 'unparsed_rows': 0,
            'since': '2021-01-01', 'priced_from': START.isoformat(),
        })

    def test_without_a_benchmark_series_priced_from_is_none(self):
        PriceHistory.objects.filter(ticker='SPY').delete()
        performance.rebuild(self.member)
        self.member.refresh_from_db()
        self.assertIsNone(self.member.basis['priced_from'])

    def test_only_parsed_reports_contribute(self):
        Report.objects.filter(doc_id='1').update(status=Report.FAILED)
        self.assertEqual(performance.rows_for(self.member), [])

    def test_wanted_tickers_cover_holdings_and_every_priceable_trade(self):
        performance.rebuild(self.member)
        current, ever = performance.wanted_tickers()
        self.assertEqual((current, ever), ({'NVDA'}, {'NVDA'}))

    def test_payload_reports_unavailable_before_a_rebuild(self):
        self.assertFalse(performance.payload(self.member)['available'])
