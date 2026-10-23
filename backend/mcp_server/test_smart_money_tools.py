import json
from datetime import date

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase

from investors.models import FilingAlert, Investor

from .tools.smart_money import (
    get_congress_member,
    get_filing_alerts,
    get_fund_signals,
    get_fund_stocks,
    get_investor,
    get_ticker_ownership,
    list_congress_members,
    list_investors,
)

LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}


@override_settings(CACHES=LOCMEM)
class SmartMoneyToolsTest(APITestCase):
    def setUp(self):
        cache.clear()
        get_user_model().objects.create_user('u', password='p')
        self.investor = Investor.objects.create(cik=1, name='Fund One', slug='fund-one', followed=True)

    def test_alerts_are_not_marked_read(self):
        FilingAlert.objects.create(investor=self.investor, quarter_end=date(2026, 6, 30), filed_on=date(2026, 8, 14))
        result = get_filing_alerts()
        self.assertEqual(result['data']['unread'], 1)
        self.assertEqual(FilingAlert.objects.filter(read_at__isnull=True).count(), 1)

    def test_unknown_ticker_ownership_is_null(self):
        data = get_ticker_ownership('zzzz')['data']
        self.assertEqual(data['ticker'], 'ZZZZ')
        self.assertIsNone(data['investors'])
        self.assertIsNone(data['congress'])

    def test_investor_combines_detail_changes_and_copy(self):
        data = get_investor('fund-one')['data']
        self.assertEqual(data['slug'], 'fund-one')
        self.assertIn('changes', data)
        self.assertIn('copy', data)

    def test_unknown_investor_is_a_warning(self):
        result = get_investor('nobody')
        self.assertIsNone(result['data'])
        self.assertTrue(result['warnings'])

    def test_list_investors_and_signals_answer(self):
        self.assertEqual(len(list_investors()['data']['investors']), 1)
        self.assertIsNotNone(get_fund_signals()['data'])

    def test_fund_stocks_rejects_unknown_view(self):
        result = get_fund_stocks('banana')
        self.assertIsNone(result['data'])
        self.assertTrue(result['warnings'])

    def test_fund_stocks_default_view(self):
        self.assertEqual(get_fund_stocks()['data']['view'], 'bought')

    def test_congress_lists_and_unknown_member(self):
        self.assertIn('members', list_congress_members()['data'])
        result = get_congress_member('nobody')
        self.assertIsNone(result['data'])
        self.assertTrue(result['warnings'])

    def test_no_presentation_fields(self):
        text = json.dumps([list_investors(), get_investor('fund-one')], default=str)
        for key in ('"photo"', '"website"', '"logo"', '"color"'):
            self.assertNotIn(key, text)
