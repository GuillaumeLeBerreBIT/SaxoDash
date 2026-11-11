from datetime import date, timedelta

from django.test import TestCase
from rest_framework.test import APIClient

from investors import price_feed
from investors.models import PriceHistory
from portfolio.models import Position
from research.models import ScreenerRow
from users.testing import make_user

from . import track_record
from .models import VerdictCall

OPENED = date(2026, 1, 5)
ENTRY = date(2026, 1, 6)
LATE = date(2027, 6, 1)


def at(offset):
    return ENTRY + timedelta(days=offset)


def store(ticker, *points):
    PriceHistory.objects.create(
        ticker=ticker,
        status=PriceHistory.OK,
        closes=[[day.isoformat(), close] for day, close in points],
    )


def call(ticker='AAA', opened_on=OPENED, ended_on=None):
    return VerdictCall.objects.create(
        ticker=ticker, opened_on=opened_on, entry_close=100.0,
        quality='Strong', valuation='Cheap', ended_on=ended_on,
    )


class ReportTest(TestCase):
    def setUp(self):
        store('SPY', (ENTRY, 100.0), (at(91), 105.0), (at(182), 110.0))
        store('AAA', (ENTRY, 100.0), (at(91), 120.0), (at(182), 130.0))

    def test_a_call_is_scored_like_a_journal_buy_from_the_next_session(self):
        call()

        result = track_record.report(today=LATE)

        self.assertEqual(result['benchmark'], 'S&P 500')
        self.assertEqual(result['first_call_on'], '2026-01-05')
        row = result['calls'][0]
        self.assertEqual(
            (row['ticker'], row['opened_on'], row['ended_on'], row['entry_close']),
            ('AAA', '2026-01-05', None, 100.0),
        )
        self.assertEqual(
            row['checkpoints']['3m'],
            {'day': at(91).isoformat(), 'return_pct': 20.0, 'benchmark_pct': 5.0, 'excess_pct': 15.0},
        )
        self.assertEqual(row['checkpoints']['6m']['excess_pct'], 20.0)
        self.assertEqual(result['summary']['overall']['3m'], {'mean_excess_pct': 15.0, 'n': 1})

    def test_an_ended_call_is_still_measured_to_its_checkpoints(self):
        call(ended_on=date(2026, 2, 1))

        row = track_record.report(today=LATE)['calls'][0]

        self.assertEqual(row['ended_on'], '2026-02-01')
        self.assertEqual(row['checkpoints']['3m']['excess_pct'], 15.0)

    def test_unelapsed_or_unpriced_windows_are_null(self):
        PriceHistory.objects.filter(ticker__in=['AAA', 'SPY']).delete()
        store('SPY', (ENTRY, 100.0), (at(30), 101.0))
        store('AAA', (ENTRY, 100.0), (at(30), 110.0))
        call()
        call('NOPRICE')

        result = track_record.report(today=at(60))

        by_ticker = {row['ticker']: row for row in result['calls']}
        for row in by_ticker.values():
            self.assertEqual(row['checkpoints'], {'3m': None, '6m': None, '12m': None})
        self.assertIsNone(by_ticker['NOPRICE']['latest'])
        self.assertIsNotNone(by_ticker['AAA']['latest'])
        self.assertEqual(result['summary']['overall']['3m'], {'mean_excess_pct': None, 'n': 0})

    def test_latest_day_is_an_iso_string(self):
        call()

        latest = track_record.report(today=at(120))['calls'][0]['latest']

        self.assertEqual(latest['day'], at(91).isoformat())

    def test_no_calls_gives_an_empty_report_not_zeros(self):
        result = track_record.report(today=LATE)

        self.assertEqual(result['calls'], [])
        self.assertIsNone(result['first_call_on'])
        self.assertEqual(result['benchmark'], 'S&P 500')
        self.assertEqual(result['summary']['overall']['3m'], {'mean_excess_pct': None, 'n': 0})


class WantedTickersTest(TestCase):
    def test_wanted_tickers_are_open_calls_now_and_every_call_ever(self):
        call('OPEN')
        call('GONE', ended_on=date(2026, 2, 1))

        current, ever = track_record.wanted_tickers()

        self.assertEqual(current, {'OPEN'})
        self.assertEqual(ever, {'OPEN', 'GONE'})

    def test_the_price_feed_has_the_source_registered(self):
        self.assertIn(track_record.wanted_tickers, price_feed._ticker_sources)


class VisibleCallsTest(TestCase):
    def setUp(self):
        store('SPY', (ENTRY, 100.0), (at(91), 105.0))
        store('AAA', (ENTRY, 100.0), (at(91), 120.0))
        store('NBIS', (ENTRY, 100.0), (at(91), 130.0))
        ScreenerRow.everything.create(ticker='AAA', name='AAA', indexes='sp500')
        ScreenerRow.everything.create(ticker='NBIS', name='NBIS', indexes='', in_universe=False)
        call('AAA')
        call('NBIS')
        self.alice = make_user('alice')
        self.bob = make_user('bob')
        Position.objects.create(
            user=self.alice, ticker='NBIS:xnas', name='NBIS', qty=1, avg_cost=1, current_price=1,
            sector='Tech', type='STOCK', color='#000000', asset_type='Stock', currency='USD',
        )

    def tickers(self, user):
        return [row['ticker'] for row in track_record.report(today=LATE, user=user)['calls']]

    def test_the_holder_sees_the_extra_and_the_universe_call(self):
        self.assertEqual(self.tickers(self.alice), ['AAA', 'NBIS'])

    def test_another_user_sees_only_universe_calls(self):
        self.assertEqual(self.tickers(self.bob), ['AAA'])

    def test_the_summary_covers_only_the_visible_calls(self):
        report = track_record.report(today=LATE, user=self.bob)
        self.assertEqual(report['summary']['overall']['3m'], {'mean_excess_pct': 15.0, 'n': 1})
        self.assertEqual(report['first_call_on'], '2026-01-05')

    def test_the_view_applies_the_restriction(self):
        client = APIClient()
        client.force_authenticate(self.bob)
        body = client.get('/api/verdicts/track-record/').json()
        self.assertEqual([row['ticker'] for row in body['calls']], ['AAA'])
