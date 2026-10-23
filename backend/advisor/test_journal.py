from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from mcp_server.views import ViewResult

from . import journal
from .models import Recommendation

INSTRUMENT = {'symbol': 'NEWCO', 'name': 'NewCo', 'uic': 77, 'asset_type': 'Stock', 'currency': 'USD', 'exchange': 'X'}
CANDLES = [
    {'date': '2026-10-20', 'open': 1, 'high': 2, 'low': 1, 'close': 41.5, 'volume': 1},
    {'date': '2026-10-21', 'open': 1, 'high': 2, 'low': 1, 'close': 42.25, 'volume': 1},
]


def fields(**over):
    base = {
        'ticker': 'NEWCO',
        'action': 'buy_new',
        'thesis': 'Compounder with pricing power.',
        'bear_case': ['Competition', 'Debt', 'Regulation'],
        'invalidation': {'price': 30, 'conditions': ['Margin below 20%']},
        'target': {'price': 60, 'condition': 'Reaches fair value'},
        'horizon': '12m',
        'conviction': 'medium',
    }
    base.update(over)
    return base


def logged(instrument=INSTRUMENT, chart=None, **over):
    chart = ViewResult(200, CANDLES) if chart is None else chart
    with patch('mcp_server.tools.research.resolve', return_value=instrument), \
            patch('mcp_server.views.call_view', return_value=chart):
        return journal.log(**fields(**over))


class LogTests(TestCase):
    def test_entry_price_is_the_last_close_of_the_chart(self):
        row = logged()
        self.assertEqual(row.entry_price, 42.25)
        self.assertEqual(row.entry_currency, 'USD')
        self.assertEqual((row.uic, row.asset_type), (77, 'Stock'))

    def test_refuses_buy_without_target(self):
        for action in ('buy_new', 'add'):
            with self.assertRaises(journal.Refused):
                logged(action=action, target=None)
        self.assertEqual(Recommendation.objects.count(), 0)

    def test_sell_needs_no_target(self):
        self.assertEqual(logged(action='sell', target=None).action, 'sell')

    def test_refuses_fewer_than_three_risks(self):
        with self.assertRaises(journal.Refused):
            logged(bear_case=['One', 'Two'])

    def test_refuses_missing_thesis_and_invalidation(self):
        with self.assertRaises(journal.Refused):
            logged(thesis='  ')
        with self.assertRaises(journal.Refused):
            logged(invalidation=None)

    def test_refuses_unresolvable_ticker(self):
        with patch('mcp_server.tools.research.resolve', return_value=None):
            with self.assertRaises(journal.Refused):
                journal.log(**fields())

    def test_refuses_when_chart_fails(self):
        with self.assertRaises(journal.Refused) as caught:
            logged(chart=ViewResult(409, {}))
        self.assertIn('not connected', str(caught.exception))
        self.assertEqual(Recommendation.objects.count(), 0)

    def test_ticker_without_price_history_is_logged_and_wanted(self):
        logged()
        self.assertIn('NEWCO', journal.wanted_tickers()[0])

    def test_closed_recommendation_leaves_current_but_stays_ever(self):
        row = logged()
        row.closed_at = timezone.now()
        row.close_reason = 'sold'
        row.save()
        current, ever = journal.wanted_tickers()
        self.assertNotIn('NEWCO', current)
        self.assertIn('NEWCO', ever)

    def test_decline_is_recorded(self):
        row = logged()
        row.decision = 'declined'
        row.save()
        row.refresh_from_db()
        self.assertEqual(row.decision, 'declined')


class ShapeTests(TestCase):
    def refused(self, **over):
        with self.assertRaises(journal.Refused):
            logged(**over)
        self.assertEqual(Recommendation.objects.count(), 0)

    def test_bear_case_must_be_a_list(self):
        self.refused(bear_case='abc')

    def test_bear_case_items_must_be_non_blank_strings(self):
        self.refused(bear_case=['', ' ', 'x'])
        self.refused(bear_case=['a', 'b', 3])

    def test_invalidation_must_be_a_dict_with_price_or_conditions(self):
        self.refused(invalidation='x')
        self.refused(invalidation={'price': None, 'conditions': []})

    def test_invalidation_with_conditions_only_is_accepted(self):
        self.assertEqual(logged(invalidation={'conditions': ['Margin below 20%']}).action, 'buy_new')

    def test_target_must_be_a_dict(self):
        self.refused(target='60')
        self.refused(action='sell', target=[60])

    def test_ranges_must_be_numeric_dicts(self):
        self.refused(buy_range='10-20')
        self.refused(sell_range={'low': 'a', 'high': 2})
        self.refused(buy_range={'low': 1})
        self.assertEqual(logged(buy_range={'low': 1, 'high': 2.5}).buy_range, {'low': 1, 'high': 2.5})
