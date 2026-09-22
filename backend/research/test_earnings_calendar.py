from datetime import date, timedelta
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase, override_settings

from portfolio.models import Position

from . import earnings, finnhub
from .models import Watchlist, WatchlistItem
from .providers import ProviderUnavailable

# Redis is the real cache; these tests must not need it running, and must not
# leak entries into a developer's running instance.
LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}


@override_settings(CACHES=LOCMEM, FINNHUB_API_KEY='test-key')
class WindowEarningsTest(TestCase):
    def setUp(self):
        cache.clear()

    def _row(self, symbol, date_, actual=None):
        return {
            'symbol': symbol, 'date': date_, 'hour': 'amc', 'quarter': 1, 'year': 2026,
            'epsEstimate': 1.0, 'epsActual': actual,
            'revenueEstimate': 1_000, 'revenueActual': None,
        }

    def _monday(self, week_offset=0):
        today = date.today()
        return today - timedelta(days=today.weekday()) + timedelta(weeks=week_offset)

    @patch('research.earnings.finnhub.get_earnings_calendar')
    def test_one_whole_market_call_for_the_week_no_symbol(self, mock_cal):
        mon = self._monday()
        mock_cal.return_value = {'earningsCalendar': [self._row('AAPL', mon.isoformat())]}

        result = earnings.window_earnings('all', 0)

        self.assertEqual(mock_cal.call_count, 1)
        (symbol, date_from, date_to), _ = mock_cal.call_args
        self.assertIsNone(symbol)
        self.assertEqual(date_from, mon.isoformat())
        self.assertEqual(date_to, (mon + timedelta(days=6)).isoformat())
        self.assertTrue(result['ok'])
        self.assertEqual(result['window'], {
            'from': mon.isoformat(), 'to': (mon + timedelta(days=6)).isoformat(), 'week': 0,
        })

    @patch('research.earnings.finnhub.get_earnings_calendar')
    def test_week_offset_shifts_the_window_by_seven_days(self, mock_cal):
        mock_cal.return_value = {'earningsCalendar': []}
        earnings.window_earnings('all', 2)
        (_, date_from, _), _ = mock_cal.call_args
        self.assertEqual(date_from, self._monday(2).isoformat())

    @patch('research.earnings.finnhub.get_earnings_calendar')
    def test_rows_are_tagged_held_and_watched(self, mock_cal):
        Position.objects.create(
            ticker='AAPL', name='Apple', qty=1, avg_cost=1, current_price=1,
            sector='Tech', type='STOCK', color='#fff',
        )
        wl = Watchlist.objects.create(name='Tech')
        WatchlistItem.objects.create(watchlist=wl, symbol='MSFT', uic=2)
        mon = self._monday().isoformat()
        mock_cal.return_value = {'earningsCalendar': [
            self._row('AAPL', mon), self._row('MSFT', mon), self._row('TSLA', mon),
        ]}

        by_symbol = {e['symbol']: e for e in earnings.window_earnings('all', 0)['events']}

        self.assertEqual((by_symbol['AAPL']['held'], by_symbol['AAPL']['watched'], by_symbol['AAPL']['mine']), (True, False, True))
        self.assertEqual((by_symbol['MSFT']['held'], by_symbol['MSFT']['watched'], by_symbol['MSFT']['mine']), (False, True, True))
        self.assertEqual((by_symbol['TSLA']['held'], by_symbol['TSLA']['watched'], by_symbol['TSLA']['mine']), (False, False, False))

    @patch('research.earnings.finnhub.get_earnings_calendar')
    def test_mine_scope_keeps_only_tagged_rows(self, mock_cal):
        Position.objects.create(
            ticker='AAPL', name='Apple', qty=1, avg_cost=1, current_price=1,
            sector='Tech', type='STOCK', color='#fff',
        )
        mon = self._monday().isoformat()
        mock_cal.return_value = {'earningsCalendar': [self._row('AAPL', mon), self._row('TSLA', mon)]}

        result = earnings.window_earnings('mine', 0)

        self.assertEqual([e['symbol'] for e in result['events']], ['AAPL'])

    @patch('research.earnings.finnhub.get_earnings_calendar')
    def test_all_scope_drops_rows_with_no_consensus_estimate_unless_held(self, mock_cal):
        Position.objects.create(
            ticker='AAPL', name='Apple', qty=1, avg_cost=1, current_price=1,
            sector='Tech', type='STOCK', color='#fff',
        )
        mon = self._monday().isoformat()
        mock_cal.return_value = {'earningsCalendar': [
            self._row('COVR', mon),
            {**self._row('OTCX', mon), 'epsEstimate': None},
            {**self._row('AAPL', mon), 'epsEstimate': None},
        ]}

        symbols = [e['symbol'] for e in earnings.window_earnings('all', 0)['events']]

        self.assertIn('COVR', symbols)
        self.assertIn('AAPL', symbols)  # no estimate, but held
        self.assertNotIn('OTCX', symbols)

    @patch('research.earnings.finnhub.get_earnings_calendar')
    def test_the_week_is_fetched_once_then_served_from_cache(self, mock_cal):
        mock_cal.return_value = {'earningsCalendar': [self._row('AAPL', self._monday().isoformat())]}

        earnings.window_earnings('all', 0)
        earnings.window_earnings('mine', 0)

        self.assertEqual(mock_cal.call_count, 1)

    @patch('research.earnings.finnhub.get_earnings_calendar')
    def test_the_response_carries_week_stats_for_the_shown_rows(self, mock_cal):
        mon = self._monday().isoformat()
        mock_cal.return_value = {'earningsCalendar': [
            {**self._row('BEAT', mon, actual=1.2)},   # est 1.0 -> +20%
            {**self._row('MISS', mon, actual=0.8)},   # est 1.0 -> -20%
            self._row('SOON', mon),                   # not reported
        ]}

        stats = earnings.window_earnings('all', 0)['stats']

        self.assertEqual((stats['total'], stats['reported']), (3, 2))
        self.assertEqual((stats['beat'], stats['missed']), (1, 1))
        self.assertEqual(stats['by_day'], [{'date': mon, 'beat': 1, 'missed': 1, 'inline': 0}])

    @patch('research.earnings.finnhub.get_earnings_calendar')
    def test_dateless_rows_are_dropped(self, mock_cal):
        mon = self._monday().isoformat()
        mock_cal.return_value = {'earningsCalendar': [self._row('AAPL', mon), self._row('AAPL', None)]}

        result = earnings.window_earnings('all', 0)

        self.assertEqual([e['date'] for e in result['events']], [mon])

    @patch('research.earnings.finnhub.get_earnings_calendar')
    def test_a_provider_failure_degrades_to_ok_false_and_no_events(self, mock_cal):
        mock_cal.side_effect = finnhub.FinnhubAPIError('/calendar/earnings failed: 500')

        result = earnings.window_earnings('all', 0)

        self.assertFalse(result['ok'])
        self.assertEqual(result['events'], [])
        self.assertIn('from', result['window'])

    @patch('research.earnings.finnhub.get_earnings_calendar', return_value={'earningsCalendar': []})
    def test_the_current_week_caches_briefly_and_settled_weeks_do_not(self, _mock_cal):
        with patch('research.earnings.cache.get_or_set', wraps=cache.get_or_set) as spy:
            earnings.window_earnings('all', 0)
            self.assertEqual(spy.call_args.args[2], earnings.CURRENT_WEEK_TTL)
            earnings.window_earnings('all', 3)
            self.assertEqual(spy.call_args.args[2], finnhub.EARNINGS_CAL_TTL)


@override_settings(CACHES=LOCMEM, FINNHUB_API_KEY='test-key')
class SymbolEarningsTest(TestCase):
    def setUp(self):
        cache.clear()

    @patch('research.earnings.finnhub.get_earnings_calendar')
    @patch('research.earnings.finnhub.get_earnings_history')
    def test_history_comes_from_stock_earnings_and_next_from_the_calendar(self, mock_hist, mock_cal):
        mock_hist.return_value = [
            {'period': '2026-06-30', 'actual': 1.6, 'estimate': 1.5, 'surprisePercent': 6.7},
            {'period': '2026-03-31', 'actual': 1.4, 'estimate': 1.45, 'surprisePercent': -3.4},
        ]
        future = (date.today() + timedelta(days=30)).isoformat()
        mock_cal.return_value = {'earningsCalendar': [
            {'symbol': 'AAPL', 'date': future, 'hour': 'amc', 'quarter': 1, 'year': 2027,
             'epsEstimate': 2.0, 'epsActual': None, 'revenueEstimate': 9, 'revenueActual': None},
        ]}

        result = earnings.symbol_earnings('AAPL')

        self.assertTrue(result['available'])
        self.assertEqual([e['date'] for e in result['history']], ['2026-03-31', '2026-06-30'])
        self.assertEqual(result['history'][0]['eps_surprise_pct'], -3.4)
        self.assertEqual(result['history'][1]['eps_actual'], 1.6)
        self.assertEqual(result['next']['date'], future)
        # scoring travels with the payload so the tab renders a verdict directly
        self.assertEqual(result['score']['quarters'], 2)
        self.assertEqual(result['score']['beats'], 1)
        self.assertEqual(result['score']['streak'], 1)  # latest quarter beat

    @patch('research.earnings.finnhub.get_earnings_calendar', return_value={'earningsCalendar': []})
    @patch('research.earnings.finnhub.get_earnings_history', return_value=[])
    def test_next_is_none_when_nothing_is_scheduled(self, mock_hist, mock_cal):
        self.assertIsNone(earnings.symbol_earnings('AAPL')['next'])

    @patch('research.earnings.finnhub.get_earnings_history')
    def test_a_provider_failure_propagates(self, mock_hist):
        mock_hist.side_effect = finnhub.FinnhubAPIError('/stock/earnings failed: 500')
        with self.assertRaises(ProviderUnavailable):
            earnings.symbol_earnings('AAPL')

    @patch('research.earnings.finnhub.get_earnings_calendar', return_value={'earningsCalendar': []})
    @patch('research.earnings.finnhub.get_earnings_history', return_value=[])
    def test_a_legacy_list_cache_entry_cannot_500_the_response(self, mock_hist, mock_cal):
        # An earlier build cached a bare list under the unversioned key; the
        # versioned key sidesteps it rather than `{**a_list}` blowing up.
        cache.set(f'research:earnings-sym:AAPL:{date.today().isoformat()}', [{'date': 'x'}], 60)

        result = earnings.symbol_earnings('AAPL')

        self.assertTrue(result['available'])
        self.assertEqual(result['history'], [])
        self.assertIsNone(result['next'])
        self.assertEqual(result['score']['quarters'], 0)
