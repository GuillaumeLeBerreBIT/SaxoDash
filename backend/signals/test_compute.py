from datetime import date, timedelta

from django.test import TestCase

from research.models import DailyBars, ScreenerRow
from saxo.models import SyncRun
from signals import compute, tasks
from signals.models import SignalScore, StockSignals

START = date(2022, 1, 3)


def bars(count=300, price=100.0):
    return [
        [(START + timedelta(days=i)).isoformat(), price, price, price, price, 1000]
        for i in range(count)
    ]


def stock(ticker, stored=None, **fields):
    row = ScreenerRow.everything.create(ticker=ticker, name=ticker, indexes='SP500', uic=fields.pop('uic', 1), **fields)
    if stored is not None:
        DailyBars.objects.create(row=row, bars=stored)
    return row


class EventsOfTest(TestCase):
    DATES = ['a', 'b', 'c', 'd', 'e']

    def test_an_event_keeps_every_date(self):
        self.assertEqual(compute.events_of('event', [True, True, False, True, False], self.DATES), ['a', 'b', 'd'])

    def test_a_state_keeps_the_first_date_of_each_run(self):
        self.assertEqual(compute.events_of('state', [True, True, False, True, True], self.DATES), ['a', 'd'])

    def test_a_rank_behaves_as_a_state(self):
        self.assertEqual(compute.events_of('rank', [False, True, True, False, True], self.DATES), ['b', 'e'])


class RunTest(TestCase):
    def test_with_no_stored_bars_nothing_is_written(self):
        stock('AAPL')
        result = compute.run()
        self.assertEqual((result.written, result.failed), (0, []))
        self.assertEqual((SignalScore.objects.count(), StockSignals.objects.count()), (0, 0))

    def test_writes_a_score_per_signal_and_horizon_and_a_row_per_stock(self):
        stock('AAPL', bars(), uic=211)
        stock('NBIS', bars(), uic=900, in_universe=False)
        result = compute.run()
        self.assertEqual(result.written, 2)
        self.assertEqual(SignalScore.objects.count(), 17 * 3)
        self.assertEqual(set(SignalScore.objects.values_list('grade', flat=True)), {'too_few'})
        apple = StockSignals.objects.get(ticker='AAPL')
        self.assertEqual((apple.uic, apple.as_of), (211, START + timedelta(days=299)))
        self.assertEqual(len(apple.events), 17)
        self.assertEqual(apple.context, {'below_high_pct': 0.0, 'momentum_pct': 0.0, 'momentum_rank_pct': None})
        self.assertTrue(StockSignals.objects.filter(ticker='NBIS').exists())

    def test_active_lists_what_is_true_on_the_last_bar(self):
        stored = bars(30)
        stored[-1] = [stored[-1][0], 100.0, 103.5, 100.0, 103.0, 3000]
        stock('AAPL', stored)
        compute.run()
        found = StockSignals.objects.get(ticker='AAPL')
        self.assertIn('volume_thrust', found.active)
        self.assertNotIn('hammer', found.active)
        self.assertEqual(found.events['volume_thrust'], [stored[-1][0]])

    def test_a_state_is_stored_as_the_day_it_began(self):
        stored = bars(260)
        stored[100] = [stored[100][0], 100.0, 130.0, 100.0, 100.0, 1000]
        stock('AAPL', stored)
        compute.run()
        found = StockSignals.objects.get(ticker='AAPL')
        self.assertIn('deep_pullback', found.active)
        self.assertEqual(found.events['deep_pullback'], [stored[251][0]])

    def test_unreadable_bars_are_named_and_the_rest_are_written(self):
        stock('AAA', bars())
        stock('BBB', [['2022-01-03', 1, 2]])
        stock('CCC', [['not a date', 1, 2, 0.5, 1.5, 10]])
        with self.assertLogs('signals.compute', level='ERROR'):
            result = compute.run()
        self.assertEqual((result.written, sorted(result.failed)), (1, ['BBB', 'CCC']))
        self.assertEqual(list(StockSignals.objects.values_list('ticker', flat=True)), ['AAA'])

    def test_a_ticker_that_left_the_table_loses_its_signals(self):
        stock('AAA', bars())
        StockSignals.objects.create(ticker='GONE')
        compute.run()
        self.assertEqual(list(StockSignals.objects.values_list('ticker', flat=True)), ['AAA'])

    def test_a_second_run_replaces_the_first(self):
        stock('AAA', bars())
        compute.run()
        compute.run()
        self.assertEqual((SignalScore.objects.count(), StockSignals.objects.count()), (51, 1))

    def test_a_score_for_a_retired_signal_is_removed(self):
        stock('AAA', bars())
        SignalScore.objects.create(key='old_idea', horizon=60, grade='no_edge')
        compute.run()
        self.assertFalse(SignalScore.objects.filter(key='old_idea').exists())


class TaskTest(TestCase):
    def test_records_a_run_without_a_credential(self):
        stock('AAA', bars())
        tasks.compute_signals()
        run = SyncRun.objects.get(task='compute_signals')
        self.assertEqual((run.outcome, run.rows, run.user_id, run.detail), ('ok', 1, None, ''))

    def test_the_run_names_the_tickers_that_failed(self):
        stock('AAA', bars())
        stock('BBB', [['2022-01-03', 1, 2]])
        with self.assertLogs('signals.compute', level='ERROR'):
            tasks.compute_signals()
        run = SyncRun.objects.get(task='compute_signals')
        self.assertEqual((run.rows, run.detail), (1, '1 failed: BBB'))
