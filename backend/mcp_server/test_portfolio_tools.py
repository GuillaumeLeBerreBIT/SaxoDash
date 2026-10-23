import json
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase

from portfolio.models import PortfolioValuation, Position
from portfolio.views import PortfolioSummaryView
from transactions.models import Transaction

from .tools.portfolio import get_portfolio, get_transactions
from .views import call_view

LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}


def make_position(ticker, **overrides):
    fields = dict(
        ticker=ticker, name=ticker, qty=Decimal('10'), avg_cost=Decimal('100'),
        current_price=Decimal('120'), sector='Tech', type='STOCK', color='#112233',
    )
    fields.update(overrides)
    return Position.objects.create(**fields)


@override_settings(CACHES=LOCMEM)
class PortfolioToolsTest(APITestCase):
    def setUp(self):
        cache.clear()
        get_user_model().objects.create_user('u', password='p')

    def test_portfolio_matches_the_summary_view(self):
        make_position('AAA')
        make_position('BBB', current_price=Decimal('90'))
        summary = call_view(PortfolioSummaryView).data
        data = get_portfolio()['data']
        self.assertEqual(data['total_value_eur'], summary['total_value'])
        self.assertEqual(data['total_pnl_eur'], summary['total_pnl'])
        self.assertEqual(len(data['positions']), 2)

    def test_no_positions_keeps_pnl_null(self):
        self.assertIsNone(get_portfolio()['data']['total_pnl_eur'])

    def test_presentation_fields_are_dropped(self):
        make_position('AAA')
        self.assertNotIn('color', json.dumps(get_portfolio(), default=str))

    def test_non_live_price_is_warned(self):
        make_position('GOOGL', price_source='derived')
        warnings = get_portfolio()['warnings']
        self.assertTrue(any('GOOGL' in w and 'derived' in w for w in warnings))
        self.assertIn('Prices are 15-minute delayed.', warnings)

    def test_cash_is_reported_in_reporting_currency_only(self):
        PortfolioValuation.objects.create(
            currency='EUR', cash_balance=Decimal('250.00'),
            positions_value=Decimal('0'), total_value=Decimal('250.00'),
        )
        self.assertEqual(get_portfolio()['data']['cash_eur'], Decimal('250.00'))
        PortfolioValuation.objects.update(currency='USD')
        self.assertIsNone(get_portfolio()['data']['cash_eur'])

    def test_banking_figures_are_not_exposed(self):
        insights = get_portfolio()['data']['insights']
        self.assertNotIn('spark', insights)
        self.assertNotIn('net_worth', insights['value'])
        self.assertNotIn('bank', insights['value'])

    def test_transactions_are_capped(self):
        for i in range(60):
            Transaction.objects.create(
                date=date(2026, 1, 1), type='BUY', instrument='X', ticker='X',
                qty=Decimal('1'), price=Decimal('1'), saxo_trade_id=f't{i}',
            )
        data = get_transactions(limit=50)['data']
        self.assertEqual(len(data['items']), 50)
        self.assertEqual(data['truncated'], 10)
