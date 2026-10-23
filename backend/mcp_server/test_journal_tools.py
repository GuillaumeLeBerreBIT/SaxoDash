import inspect
from unittest.mock import patch

from rest_framework.test import APITestCase

from advisor.models import Recommendation
from mcp_server.views import ViewResult

from .tools import journal as tools

INSTRUMENT = {'symbol': 'NEWCO', 'name': 'NewCo', 'uic': 77, 'asset_type': 'Stock', 'currency': 'USD', 'exchange': 'X'}
CANDLES = [{'date': '2026-10-21', 'open': 1, 'high': 2, 'low': 1, 'close': 42.25, 'volume': 1}]


def log(**over):
    args = {
        'ticker': 'NEWCO',
        'action': 'buy_new',
        'thesis': 'Compounder.',
        'bear_case': ['a', 'b', 'c'],
        'invalidation': {'price': 30, 'conditions': []},
        'horizon': '12m',
        'conviction': 'high',
        'target': {'price': 60, 'condition': 'fair value'},
    }
    args.update(over)
    with patch('mcp_server.tools.research.resolve', return_value=INSTRUMENT), \
            patch('mcp_server.views.call_view', return_value=ViewResult(200, CANDLES)):
        return tools.log_recommendation(**args)


class JournalToolTests(APITestCase):
    def test_entry_price_comes_from_saxo_not_the_caller(self):
        self.assertNotIn('entry_price', inspect.signature(tools.log_recommendation).parameters)
        result = log()
        self.assertEqual(result['data']['entry_price'], 42.25)
        self.assertEqual(Recommendation.objects.get().entry_price, 42.25)

    def test_refusal_is_a_warning(self):
        result = log(action='buy_new', target=None)
        self.assertIsNone(result['data'])
        self.assertTrue(result['warnings'])

    def test_unknown_choice_is_refused(self):
        for over in ({'action': 'moon'}, {'horizon': '1y'}, {'conviction': 'huge'}):
            result = log(**over)
            self.assertIsNone(result['data'])
            self.assertTrue(result['warnings'])
        self.assertEqual(Recommendation.objects.count(), 0)

    def test_set_decision_records_a_decline(self):
        row_id = log()['data']['id']
        result = tools.set_decision(row_id, 'declined')
        self.assertEqual(result['data']['decision'], 'declined')
        self.assertEqual(Recommendation.objects.get().decision, 'declined')

    def test_set_decision_rejects_unknown_value_and_id(self):
        row_id = log()['data']['id']
        self.assertIsNone(tools.set_decision(row_id, 'maybe')['data'])
        self.assertEqual(tools.set_decision(999, 'accepted')['warnings'], ['No recommendation 999.'])

    def test_close_sets_reason_and_time(self):
        row_id = log()['data']['id']
        result = tools.close_recommendation(row_id, 'sold')
        self.assertEqual(result['data']['close_reason'], 'sold')
        self.assertIsNotNone(Recommendation.objects.get().closed_at)
        self.assertIsNone(tools.close_recommendation(row_id, 'bored')['data'])
        self.assertEqual(tools.close_recommendation(999, 'sold')['warnings'], ['No recommendation 999.'])

    def test_list_filters_by_status_and_caps(self):
        first = log()['data']['id']
        log()
        tools.close_recommendation(first, 'sold')
        self.assertEqual(len(tools.list_recommendations()['data']['items']), 1)
        self.assertEqual(len(tools.list_recommendations('closed')['data']['items']), 1)
        everything = tools.list_recommendations('all', limit=1)['data']
        self.assertEqual((len(everything['items']), everything['truncated']), (1, 1))
        self.assertIsNone(tools.list_recommendations('weird')['data'])

    def test_non_integer_id_is_a_warning(self):
        self.assertEqual(tools.set_decision('abc', 'accepted')['warnings'], ['No recommendation abc.'])
        self.assertEqual(tools.close_recommendation('abc', 'sold')['warnings'], ['No recommendation abc.'])

    def test_closing_twice_keeps_the_first_close(self):
        row_id = log()['data']['id']
        tools.close_recommendation(row_id, 'sold')
        first = Recommendation.objects.get()
        result = tools.close_recommendation(row_id, 'invalidated')
        self.assertEqual(result['warnings'], [f'Recommendation {row_id} is already closed.'])
        after = Recommendation.objects.get()
        self.assertEqual((after.close_reason, after.closed_at), ('sold', first.closed_at))

    def test_decision_can_be_recorded_on_a_closed_row(self):
        row_id = log()['data']['id']
        tools.close_recommendation(row_id, 'sold')
        self.assertEqual(tools.set_decision(row_id, 'accepted')['data']['decision'], 'accepted')
