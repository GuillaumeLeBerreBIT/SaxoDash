from datetime import date, timedelta
from unittest.mock import patch

from django.test import SimpleTestCase, TestCase
from django.utils import timezone

from research.providers import ProviderError, ProviderNotConnected

from . import copying, price_feed
from .factories import make_investor, store_quarter
from .models import PriceHistory, Security

Q1, Q2 = date(2026, 3, 31), date(2026, 6, 30)
NOW = timezone.now()


def bars(*closes, start=date(2026, 1, 5)):
    return [{'date': (start + timedelta(days=index)).isoformat(), 'close': close} for index, close in enumerate(closes)]


def rows(*closes):
    return [[bar['date'], bar['close']] for bar in bars(*closes)]


def listing(symbol, uic, exchange='NYSE', currency='USD', asset_type='Stock'):
    return {'symbol': symbol, 'uic': uic, 'exchange': exchange, 'currency': currency, 'asset_type': asset_type}


@patch('investors.price_feed.market.search')
class ResolveTest(SimpleTestCase):
    def test_takes_the_us_dollar_listing_of_the_exact_symbol(self, search):
        search.return_value = [listing('AAPL', 9, 'XETR', 'EUR'), listing('AAPLX', 8), listing('AAPL', 211, 'NASDAQ')]

        self.assertEqual(price_feed.resolve('AAPL')['uic'], 211)
        search.assert_called_once_with('AAPL', 'Stock,Etf')

    def test_an_etf_is_found_too(self, search):
        search.return_value = [listing('IVV', 37891, 'ASX', 'AUD', 'Etf'), listing('IVV', 31973, 'NYSE_ARCA', 'USD', 'Etf')]

        found = price_feed.resolve('IVV')

        self.assertEqual((found['uic'], found['asset_type']), (31973, 'Etf'))

    def test_a_share_class_matches_saxos_spelling_of_it(self, search):
        search.return_value = [listing('BRKa', 2630), listing('BRKb', 2631), listing('BRKU', 1, 'NASDAQ')]

        self.assertEqual(price_feed.resolve('BRK.B')['uic'], 2631)
        search.assert_called_once_with('BRK', 'Stock,Etf')

    def test_an_underscored_share_class_and_a_relisted_symbol_match(self, search):
        search.side_effect = [[listing('LEN', 1), listing('LEN_B', 2)], [listing('SHOP_NEW', 3, 'NASDAQ')]]

        self.assertEqual(price_feed.resolve('LEN.B')['uic'], 2)
        self.assertEqual(price_feed.resolve('SHOP')['uic'], 3)

    def test_falls_back_to_the_company_name_when_the_symbol_finds_nothing(self, search):
        search.side_effect = [[], [listing('ETN', 461)]]

        self.assertEqual(price_feed.resolve('ETN', 'EATON CORP PLC')['uic'], 461)
        self.assertEqual([call.args[0] for call in search.call_args_list], ['ETN', 'EATON'])

    def test_a_name_search_still_has_to_match_the_symbol(self, search):
        search.side_effect = [[], [listing('ETNX', 5), listing('EAT', 6)]]

        self.assertIsNone(price_feed.resolve('ETN', 'EATON CORP PLC'))

    def test_a_short_or_numeric_first_word_is_not_searched(self, search):
        search.return_value = []

        price_feed.resolve('ABC', 'AB INC')
        price_feed.resolve('XYZ', '3M CO')

        self.assertEqual([call.args[0] for call in search.call_args_list], ['ABC', 'XYZ'])

    def test_no_us_dollar_listing_is_no_match(self, search):
        search.return_value = [listing('BAM', 1, 'TSE', 'CAD')]

        self.assertIsNone(price_feed.resolve('BAM'))


@patch('investors.price_feed.market.chart')
@patch('investors.price_feed.resolve')
class RefreshTest(TestCase):
    def setUp(self):
        self.investor = make_investor()
        Security.objects.create(cusip='037833100', ticker='AAPL', name='APPLE INC')
        Security.objects.create(cusip='67066G104', ticker='NVDA')
        store_quarter(self.investor, Q1, [('037833100', 'APPLE INC', 10, 600), ('999999999', 'ACME', 1, 5)])
        store_quarter(self.investor, Q2, [('67066G104', 'NVIDIA CORP', 10, 600)])
        self.pauses = []

    def refresh(self, now=NOW):
        return price_feed.refresh(pause=self.pauses.append, now=now)

    def found(self, uic, asset_type='Stock'):
        return {'uic': uic, 'asset_type': asset_type, 'symbol': 'X'}

    def test_fetches_the_benchmark_and_every_ticker_a_clone_ever_held(self, resolve, chart):
        resolve.side_effect = lambda ticker, name: self.found({'AAPL': 1, 'NVDA': 2}[ticker])
        chart.return_value = bars(10, 11)

        self.assertEqual(self.refresh(), 3)

        self.assertEqual(
            {row.ticker: (row.uic, row.asset_type, row.status) for row in PriceHistory.objects.all()},
            {
                copying.BENCHMARK_TICKER: (price_feed.BENCHMARK_UIC, 'Etf', PriceHistory.OK),
                'AAPL': (1, 'Stock', PriceHistory.OK), 'NVDA': (2, 'Stock', PriceHistory.OK),
            },
        )
        self.assertEqual(PriceHistory.objects.get(ticker='AAPL').closes, rows(10, 11))
        self.assertEqual([call.args[0] for call in resolve.call_args_list], ['AAPL', 'NVDA'])
        self.assertEqual(resolve.call_args_list[0].args[1], 'APPLE INC')
        chart.assert_any_call(1, 'Stock', price_feed.DAILY, price_feed.BARS)
        self.assertEqual(self.pauses, [price_feed.PAUSE_SECONDS] * 3)

    def test_a_ticker_saxo_does_not_list_is_marked_and_never_charted(self, resolve, chart):
        resolve.side_effect = lambda ticker, name: None if ticker == 'AAPL' else self.found(2)
        chart.return_value = bars(10, 11)

        self.assertEqual(self.refresh(), 2)

        apple = PriceHistory.objects.get(ticker='AAPL')
        self.assertEqual((apple.status, apple.closes, apple.checked_at), (PriceHistory.UNMATCHED, [], NOW))

    def test_one_failing_ticker_does_not_stop_the_rest(self, resolve, chart):
        resolve.side_effect = lambda ticker, name: self.found({'AAPL': 1, 'NVDA': 2}[ticker])
        chart.side_effect = lambda uic, *_: (_ for _ in ()).throw(ProviderError('boom')) if uic == 1 else bars(10, 11)

        self.assertEqual(self.refresh(), 2)

        apple = PriceHistory.objects.get(ticker='AAPL')
        self.assertEqual((apple.status, apple.error), (PriceHistory.FAILED, 'boom'))

    def test_an_empty_chart_is_a_failure_that_keeps_earlier_closes(self, resolve, chart):
        PriceHistory.objects.create(ticker='NVDA', uic=2, closes=rows(5, 6), status=PriceHistory.OK)
        resolve.return_value = self.found(1)
        chart.side_effect = lambda uic, *_: [] if uic == 2 else bars(10, 11)

        self.refresh()

        nvidia = PriceHistory.objects.get(ticker='NVDA')
        self.assertEqual((nvidia.status, nvidia.closes), (PriceHistory.FAILED, rows(5, 6)))

    def test_losing_the_saxo_connection_stops_the_run(self, resolve, chart):
        chart.side_effect = ProviderNotConnected('expired')

        with self.assertRaises(ProviderNotConnected):
            self.refresh()

        self.assertIsNone(PriceHistory.objects.get(ticker=copying.BENCHMARK_TICKER).checked_at)

    def test_a_fresh_series_is_not_fetched_again_the_same_day(self, resolve, chart):
        resolve.return_value = self.found(1)
        chart.return_value = bars(10, 11)
        self.refresh()
        chart.reset_mock()

        self.assertEqual(self.refresh(NOW + timedelta(hours=2)), 0)

        chart.assert_not_called()

    def test_the_next_night_refreshes_current_holdings_and_the_benchmark_only(self, resolve, chart):
        resolve.side_effect = lambda ticker, name: self.found({'AAPL': 1, 'NVDA': 2}[ticker])
        chart.return_value = bars(10, 11)
        self.refresh()
        chart.reset_mock()

        self.assertEqual(self.refresh(NOW + timedelta(hours=24)), 2)

        self.assertEqual(sorted(call.args[0] for call in chart.call_args_list), [2, price_feed.BENCHMARK_UIC])

    def test_an_unlisted_ticker_is_retried_after_a_week(self, resolve, chart):
        resolve.side_effect = lambda ticker, name: None if ticker == 'NVDA' else self.found(1)
        chart.return_value = bars(10, 11)
        self.refresh()
        resolve.reset_mock()

        self.refresh(NOW + timedelta(days=1))
        self.assertNotIn('NVDA', [call.args[0] for call in resolve.call_args_list])

        self.refresh(NOW + timedelta(days=8))
        self.assertIn('NVDA', [call.args[0] for call in resolve.call_args_list])
