import inspect
from dataclasses import replace
from datetime import date, timedelta

from types import SimpleNamespace

from django.test import TestCase
from django.utils import timezone

from investors.models import PriceHistory
from research.listings import Listing
from research.providers import ProviderNotConnected

from . import journal
from .models import Recommendation

INSTRUMENT = Listing(ticker='NEWCO', symbol='NEWCO', name='NewCo', uic=77, asset_type='Stock', currency='USD', exchange='X')
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


def charts(bars=CANDLES, error=None):
    def chart(*args):
        if error is not None:
            raise error
        return bars

    return SimpleNamespace(chart=chart)


def logged(instrument=INSTRUMENT, saxo=None, **over):
    values = fields(**over)
    values.pop('ticker')
    return journal.log(listing=instrument, saxo=saxo or charts(), **values)


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

    def test_refuses_a_non_us_dollar_listing(self):
        euro = replace(INSTRUMENT, currency='EUR')
        with self.assertRaisesMessage(journal.Refused, 'Only US-dollar listings can be scored against the S&P 500.'):
            logged(instrument=euro)
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
        with self.assertRaises(journal.Refused):
            logged(instrument=Listing.unresolved('NEWCO'))

    def test_refuses_when_there_is_no_entry_price(self):
        with self.assertRaises(journal.Refused) as caught:
            logged(saxo=charts(error=ProviderNotConnected('x')))
        self.assertIn('not connected', str(caught.exception))
        self.assertEqual(Recommendation.objects.count(), 0)

    def test_bad_input_is_refused_before_any_price_is_asked(self):
        for over in ({'action': 'yolo'}, {'horizon': '5y'}, {'conviction': 'max'}, {'bear_case': ['a']}):
            with self.assertRaises(journal.Refused):
                logged(saxo=charts(error=AssertionError('asked for a price')), **over)

    def test_a_chart_without_closes_is_refused(self):
        with self.assertRaisesMessage(journal.Refused, 'the chart has no closes'):
            logged(saxo=charts(bars=[]))

    def test_log_takes_no_price_from_its_caller(self):
        self.assertNotIn('entry_price', inspect.signature(journal.log).parameters)

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



class LifecycleTests(TestCase):
    def test_decide_records_a_decision(self):
        row = logged()
        journal.decide(row.id, 'declined')
        row.refresh_from_db()
        self.assertEqual(row.decision, 'declined')

    def test_decide_refuses_an_unknown_choice_or_id(self):
        row = logged()
        with self.assertRaisesMessage(journal.Refused, "Unknown decision 'maybe'"):
            journal.decide(row.id, 'maybe')
        with self.assertRaisesMessage(journal.Refused, 'No recommendation 999.'):
            journal.decide(999, 'accepted')
        with self.assertRaisesMessage(journal.Refused, 'No recommendation abc.'):
            journal.decide('abc', 'accepted')

    def test_close_sets_the_reason_once(self):
        row = logged()
        journal.close(row.id, 'sold')
        first = Recommendation.objects.get().closed_at
        with self.assertRaisesMessage(journal.Refused, f'Recommendation {row.id} is already closed.'):
            journal.close(row.id, 'invalidated')
        row.refresh_from_db()
        self.assertEqual((row.close_reason, row.closed_at), ('sold', first))

    def test_a_closed_recommendation_can_still_be_decided(self):
        row = logged()
        journal.close(row.id, 'sold')
        self.assertEqual(journal.decide(row.id, 'accepted').decision, 'accepted')

    def test_review_filters_by_status(self):
        open_row, closed_row = logged(), logged()
        journal.close(closed_row.id, 'sold')
        self.assertEqual([r.id for r, _ in journal.review('open')['recommendations']], [open_row.id])
        self.assertEqual([r.id for r, _ in journal.review('closed')['recommendations']], [closed_row.id])
        self.assertEqual(len(journal.review('all')['recommendations']), 2)
        with self.assertRaises(journal.Refused):
            journal.review('someday')

    def test_review_says_when_the_benchmark_is_missing(self):
        logged()
        result = journal.review('open', today=date(2026, 10, 24))
        self.assertTrue(result['benchmark_missing'])
        self.assertIn('overall', result['summary'])

    def test_review_scores_against_the_benchmark(self):
        row = logged()
        recorded = row.recorded_at.date()
        for ticker, close in (('NEWCO', 100.0), ('SPY', 100.0)):
            PriceHistory.objects.create(ticker=ticker, status=PriceHistory.OK, closes=[[(recorded + timedelta(days=1)).isoformat(), close]])
        result = journal.review('open', today=recorded + timedelta(days=2))
        self.assertFalse(result['benchmark_missing'])
        _, score = result['recommendations'][0]
        self.assertEqual(score['entry_day'], recorded + timedelta(days=1))


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
