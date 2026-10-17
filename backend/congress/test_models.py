from datetime import date

from django.db import IntegrityError
from django.test import TestCase

from .models import Holding, Member, Report, Trade


class ModelsTest(TestCase):
    def setUp(self):
        self.member = Member.objects.create(
            slug='nancy-pelosi', first_name='Nancy', last_name='Pelosi', state_district='CA11',
        )

    def test_report_doc_id_is_unique(self):
        Report.objects.create(doc_id='20026590', member=self.member, year=2025, filed_on=date(2025, 1, 17))
        with self.assertRaises(IntegrityError):
            Report.objects.create(doc_id='20026590', member=self.member, year=2025, filed_on=date(2025, 1, 17))

    def test_a_new_report_is_pending_and_a_trade_defaults_to_self_and_unpriced(self):
        report = Report.objects.create(doc_id='20026590', member=self.member, year=2025, filed_on=date(2025, 1, 17))
        trade = Trade.objects.create(
            report=report, asset='Apple Inc.', kind=Trade.PURCHASE, traded_on=date(2025, 1, 14), amount_low=1001,
        )
        self.assertEqual(report.status, Report.PENDING)
        self.assertEqual(trade.owner, 'self')
        self.assertFalse(trade.priceable)
        self.assertIsNone(trade.amount_high)

    def test_one_holding_per_member_and_ticker(self):
        Holding.objects.create(member=self.member, ticker='NVDA', value=10.0, weight_pct=100.0)
        with self.assertRaises(IntegrityError):
            Holding.objects.create(member=self.member, ticker='NVDA', value=5.0, weight_pct=50.0)
