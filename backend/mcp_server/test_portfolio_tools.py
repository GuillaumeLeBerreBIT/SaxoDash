import json
from datetime import date
from decimal import Decimal
from unittest.mock import Mock, patch

from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase

from portfolio.models import PortfolioValuation, Position
from portfolio.views import PortfolioSummaryView
from transactions.models import Transaction

from .tools.portfolio import get_portfolio, get_transactions
from .views import ViewResult, call_view
from users.testing import the_owner

LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}


def make_position(ticker, **overrides):
    fields = dict(
        ticker=ticker, name=ticker, qty=Decimal('10'), avg_cost=Decimal('100'),
        current_price=Decimal('120'), sector='Tech', type='STOCK', color='#112233',
    )
    fields.update(overrides)
    return Position.objects.create(user=the_owner(), **fields)


@override_settings(CACHES=LOCMEM)
class PortfolioToolsTest(APITestCase):
    def setUp(self):
        cache.clear()
        the_owner()

    def test_portfolio_matches_the_summary_view(self):
        make_position('AAA')
        make_position('BBB', current_price=Decimal('90'))
        summary = call_view(PortfolioSummaryView).data
        data = get_portfolio()['data']
        self.assertEqual(data['total_value_eur'], summary['total_value'])
        self.assertEqual(data['total_pnl_eur'], summary['total_pnl'])
        self.assertEqual(len(data['positions']), 2)

    def test_money_is_a_json_number(self):
        make_position('AAA')
        result = get_portfolio()
        self.assertIsInstance(result['data']['total_value_eur'], float)
        self.assertIsInstance(result['data']['positions'][0]['value_eur'], float)
        json.dumps(result)

    def test_transactions_carry_the_saxo_warning(self):
        state = Mock(usable=False, reason='Saxo needs re-authentication.')
        with patch('mcp_server.envelope.connection_state', return_value=state), \
                patch('mcp_server.envelope.worst_recent_outcome', return_value='ok'):
            result = get_transactions()
        self.assertEqual(result['warnings'][0], 'Saxo needs re-authentication.')

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
            user=the_owner(),
            currency='EUR', cash_balance=Decimal('250.00'),
            positions_value=Decimal('0'), total_value=Decimal('250.00'),
        )
        self.assertEqual(get_portfolio()['data']['cash_eur'], Decimal('250.00'))
        PortfolioValuation.objects.update(currency='USD')
        self.assertIsNone(get_portfolio()['data']['cash_eur'])

    def test_insights_keep_only_whitelisted_keys(self):
        make_position('AAA')
        insights = get_portfolio()['data']['insights']
        self.assertEqual(
            set(insights),
            {'concentration', 'sector_exposure', 'currency_exposure', 'movers',
             'contributors', 'upcoming_earnings', 'value', 'attention'},
        )
        self.assertEqual(set(insights['value']), {'portfolio'})
        self.assertEqual(insights['concentration']['top1']['ticker'], 'AAA')
        kinds = {item['kind'] for item in insights['attention']}
        self.assertIn('single_name', kinds)
        self.assertFalse(kinds & {'stale_value', 'no_history'})
        self.assertNotIn('color', json.dumps(insights, default=str))

    def test_insights_never_read_banking_or_net_worth(self):
        make_position('AAA')
        banking = AssertionError('banking read')
        snapshots = Mock(objects=Mock(order_by=Mock(side_effect=banking)))
        with patch('portfolio.insights.current_net_worth', side_effect=banking), \
                patch('portfolio.insights.get_bank_only_balance', side_effect=banking), \
                patch('portfolio.insights.get_broker_cash_balance', side_effect=banking), \
                patch('portfolio.insights.NetWorthSnapshot', snapshots):
            data = get_portfolio()['data']
        self.assertEqual(data['insights']['concentration']['top1']['ticker'], 'AAA')
        self.assertEqual(len(data['positions']), 1)

    def test_delay_note_only_with_positions(self):
        self.assertNotIn('Prices are 15-minute delayed.', get_portfolio()['warnings'])
        make_position('AAA')
        self.assertIn('Prices are 15-minute delayed.', get_portfolio()['warnings'])

    def test_negative_limit_returns_nothing(self):
        make_position('AAA')
        Transaction.objects.create(
            user=the_owner(),
            date=date(2026, 1, 1), type='BUY', instrument='X', ticker='X',
            qty=Decimal('1'), price=Decimal('1'), saxo_trade_id='t',
        )
        data = get_transactions(limit=-5)['data']
        self.assertEqual(data['items'], [])

    def test_truncated_uses_the_true_count(self):
        page = {'count': 2500, 'results': [{'id': i} for i in range(1000)]}
        with patch('mcp_server.views.call_view', return_value=ViewResult(200, page)):
            data = get_transactions(limit=50)['data']
        self.assertEqual(len(data['items']), 50)
        self.assertEqual(data['truncated'], 2450)

    def test_truncated_counts_every_transaction_not_only_the_fetched_page(self):
        page = {'count': 2500, 'results': [{'id': i} for i in range(1000)]}
        with patch('mcp_server.views.call_view', return_value=ViewResult(200, page)):
            data = get_transactions(limit=1000)['data']
        self.assertEqual(len(data['items']), 1000)
        self.assertEqual(data['truncated'], 1500)

    def test_transactions_are_capped(self):
        for i in range(60):
            Transaction.objects.create(
                user=the_owner(),
                date=date(2026, 1, 1), type='BUY', instrument='X', ticker='X',
                qty=Decimal('1'), price=Decimal('1'), saxo_trade_id=f't{i}',
            )
        data = get_transactions(limit=50)['data']
        self.assertEqual(len(data['items']), 50)
        self.assertEqual(data['truncated'], 10)


@override_settings(CACHES=LOCMEM)
class SerializedMoneyTest(APITestCase):
    def setUp(self):
        cache.clear()
        the_owner()

    def test_position_prices_are_numbers(self):
        make_position('AAA')
        row = get_portfolio()['data']['positions'][0]
        for key in ('qty', 'avg_cost', 'current_price'):
            self.assertIsInstance(row[key], float, key)

    def test_transaction_quantities_and_prices_are_numbers(self):
        Transaction.objects.create(user=the_owner(), date=date(2026, 1, 2), type='BUY', instrument='A', ticker='A', qty=Decimal('3'), price=Decimal('12.50'))
        item = get_transactions()['data']['items'][0]
        self.assertEqual((item['qty'], item['price']), (3.0, 12.5))
