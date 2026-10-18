from datetime import date
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase, override_settings

from core.money import CurrencyMismatch, Money
from portfolio.models import Position

from . import calendar_enrichment
from .models import ScreenerRow, Watchlist, WatchlistItem
from .providers import ProviderNotConnected

TODAY = date(2026, 10, 21)
CLOSES = [
    {'date': '2026-10-15', 'close': 100.0},
    {'date': '2026-10-16', 'close': 110.0},
    {'date': '2026-10-19', 'close': 99.0},
    {'date': '2026-10-20', 'close': 121.0},
]


def event(symbol, day='2026-10-16', session='bmo', held=False, watched=False):
    return {
        'symbol': symbol, 'date': day, 'session': session, 'quarter': 3, 'year': 2026,
        'eps_estimate': 1.0, 'eps_actual': None, 'revenue_estimate': 1e9, 'revenue_actual': None,
        'eps_surprise_pct': None, 'revenue_surprise_pct': None,
        'held': held, 'watched': watched, 'mine': held or watched,
    }


def bars(closes):
    return [{'date': c['date'], 'open': c['close'], 'high': c['close'], 'low': c['close'], 'close': c['close'], 'volume': 1} for c in closes]


@patch('research.calendar_enrichment.get_portfolio_value', return_value=Money(Decimal('1000'), 'EUR'))
@patch('research.calendar_enrichment.market.chart', return_value=[])
@override_settings(REPORTING_CURRENCY='EUR')
class EnrichTest(TestCase):
    def setUp(self):
        ScreenerRow.objects.create(
            ticker='AAPL', name='Apple Inc', sector='Technology', indexes='SP500',
            market_cap=3_500_000.0, recent_closes=CLOSES,
        )

    def hold(self, ticker, value, uic=None):
        return Position.objects.create(
            ticker=ticker, name=ticker, qty=1, avg_cost=1, current_price=value,
            sector='Tech', type='STOCK', color='#fff', uic=uic, asset_type='Stock' if uic else None,
        )

    def test_company_details_come_from_the_screener_row(self, chart, total):
        (out,) = calendar_enrichment.enrich([event('AAPL')], TODAY)
        self.assertEqual((out['name'], out['market_cap'], out['sector']), ('Apple Inc', 3_500_000.0, 'Technology'))
        self.assertEqual(out['also'], [])

    def test_unknown_symbol_gets_nulls(self, chart, total):
        (out,) = calendar_enrichment.enrich([event('ZZZZ')], TODAY)
        for field in ('name', 'market_cap', 'sector', 'value', 'weight_pct', 'move_pct', 'move_basis', 'pnl_impact'):
            self.assertIsNone(out[field], field)

    def test_blank_sector_is_null(self, chart, total):
        ScreenerRow.objects.filter(ticker='AAPL').update(sector='')
        (out,) = calendar_enrichment.enrich([event('AAPL')], TODAY)
        self.assertIsNone(out['sector'])

    def test_universe_move_comes_from_recent_closes(self, chart, total):
        (out,) = calendar_enrichment.enrich([event('AAPL')], TODAY)
        self.assertEqual((out['move_pct'], out['move_basis']), (10.0, '1d'))
        chart.assert_not_called()

    def test_a_future_report_has_no_move_and_no_chart_call(self, chart, total):
        self.hold('AAPL', 10, uic=211)
        (out,) = calendar_enrichment.enrich([event('AAPL', day='2026-10-23', held=True)], TODAY)
        self.assertIsNone(out['move_pct'])
        chart.assert_not_called()

    def test_holding_gets_value_weight_and_pnl_impact(self, chart, total):
        self.hold('AAPL', 100)
        (out,) = calendar_enrichment.enrich([event('AAPL', held=True)], TODAY)
        self.assertEqual(out['value'], 100.0)
        self.assertEqual(out['weight_pct'], 10.0)
        self.assertEqual(out['pnl_impact'], 10.0)

    def test_watchlist_name_gets_no_money_fields(self, chart, total):
        wl = Watchlist.objects.create(name='W')
        WatchlistItem.objects.create(watchlist=wl, symbol='AAPL', uic=211)
        (out,) = calendar_enrichment.enrich([event('AAPL', watched=True)], TODAY)
        self.assertIsNone(out['value'])
        self.assertIsNone(out['weight_pct'])
        self.assertIsNone(out['pnl_impact'])

    def test_my_names_are_moved_from_the_saxo_chart(self, chart, total):
        self.hold('MSFT', 50, uic=300)
        chart.return_value = bars([{'date': '2026-10-15', 'close': 200.0}, {'date': '2026-10-16', 'close': 210.0}])
        (out,) = calendar_enrichment.enrich([event('MSFT', held=True)], TODAY)
        self.assertEqual((out['move_pct'], out['move_basis']), (5.0, '1d'))
        chart.assert_called_once_with(300, 'Stock', calendar_enrichment.DAILY_HORIZON, calendar_enrichment.MINE_CHART_BARS)

    def test_a_watchlist_name_is_charted_by_its_uic(self, chart, total):
        wl = Watchlist.objects.create(name='W')
        WatchlistItem.objects.create(watchlist=wl, symbol='MSFT', uic=300, asset_type='Stock')
        calendar_enrichment.enrich([event('MSFT', watched=True)], TODAY)
        chart.assert_called_once_with(300, 'Stock', calendar_enrichment.DAILY_HORIZON, calendar_enrichment.MINE_CHART_BARS)

    def test_one_chart_call_per_symbol(self, chart, total):
        self.hold('MSFT', 50, uic=300)
        calendar_enrichment.enrich([event('MSFT', held=True), event('MSFT', day='2026-10-19', held=True)], TODAY)
        self.assertEqual(chart.call_count, 1)

    def test_chart_failure_falls_back_to_recent_closes(self, chart, total):
        self.hold('AAPL', 100, uic=211)
        chart.side_effect = ProviderNotConnected('no token')
        (out,) = calendar_enrichment.enrich([event('AAPL', held=True)], TODAY)
        self.assertEqual(out['move_pct'], 10.0)

    def test_universe_name_older_than_recent_closes_has_no_move(self, chart, total):
        (out,) = calendar_enrichment.enrich([event('AAPL', day='2026-09-01')], TODAY)
        self.assertIsNone(out['move_pct'])

    def test_weight_is_null_when_the_total_cannot_be_summed(self, chart, total):
        self.hold('AAPL', 100)
        total.side_effect = CurrencyMismatch('x')
        with self.assertLogs('research.calendar_enrichment', level='WARNING'):
            (out,) = calendar_enrichment.enrich([event('AAPL', held=True)], TODAY)
        self.assertIsNone(out['weight_pct'])
        self.assertEqual(out['value'], 100.0)

    def test_weight_is_null_for_an_empty_book(self, chart, total):
        self.hold('AAPL', 100)
        total.return_value = Money(Decimal('0'), 'EUR')
        (out,) = calendar_enrichment.enrich([event('AAPL', held=True)], TODAY)
        self.assertIsNone(out['weight_pct'])
        self.assertEqual(out['value'], 100.0)

    def test_pnl_impact_is_value_times_move(self, chart, total):
        self.assertEqual(calendar_enrichment.pnl_impact(250.0, -4.0), -10.0)
        self.assertIsNone(calendar_enrichment.pnl_impact(None, 4.0))
        self.assertIsNone(calendar_enrichment.pnl_impact(250.0, None))

    def test_a_total_in_another_currency_gives_no_weight(self, chart, total):
        self.hold('AAPL', 100)
        total.return_value = Money(Decimal('1000'), 'USD')
        (out,) = calendar_enrichment.enrich([event('AAPL', held=True)], TODAY)
        self.assertIsNone(out['weight_pct'])
