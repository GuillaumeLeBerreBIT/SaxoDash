from unittest import mock

from django.test import TestCase

from portfolio.models import Position
from research import coverage
from research.models import ScreenerRow, Watchlist, WatchlistItem
from research.providers import ProviderError, ProviderNotConnected
from users.testing import the_owner

USER = mock.sentinel.user


def hold(ticker, *, uic=11, currency='USD', asset_type='Stock', owner=None):
    return Position.objects.create(
        user=owner or the_owner(), ticker=ticker, name=f'{ticker} Inc', qty=1, avg_cost=1, current_price=1,
        sector='Tech', type='STOCK', color='#fff', uic=uic, asset_type=asset_type, currency=currency,
    )


def watch(symbol, uic, *, asset_type='Stock', owner=None):
    watchlist = Watchlist.objects.create(user=owner or the_owner(), name='W')
    return WatchlistItem.objects.create(
        watchlist=watchlist, symbol=symbol, uic=uic, asset_type=asset_type, description=f'{symbol} desc',
    )


@mock.patch('research.scan.resolve')
class SyncExtrasTest(TestCase):
    def test_adds_a_held_usd_stock_outside_the_universe(self, resolve):
        hold('NBIS', uic=11)
        self.assertEqual(coverage.sync_extras(user=USER), {'added': 1, 'removed': 0})
        row = ScreenerRow.everything.get(ticker='NBIS')
        self.assertFalse(row.in_universe)
        self.assertEqual((row.uic, row.asset_type, row.indexes, row.name), (11, 'Stock', '', 'NBIS Inc'))
        self.assertFalse(ScreenerRow.objects.filter(ticker='NBIS').exists())

    def test_adds_a_watched_stock_only_when_saxo_confirms_the_same_usd_listing(self, resolve):
        watch('NBIS:xnas', 11)
        resolve.return_value = {'uic': 11}
        coverage.sync_extras(user=USER)
        resolve.assert_called_once_with('NBIS', user=USER)
        self.assertEqual(ScreenerRow.everything.get(ticker='NBIS').uic, 11)

    def test_a_watched_listing_with_another_uic_gets_no_row(self, resolve):
        watch('NBIS:xetr', 5)
        resolve.return_value = {'uic': 99}
        self.assertEqual(coverage.sync_extras(user=USER)['added'], 0)
        self.assertFalse(ScreenerRow.everything.filter(ticker='NBIS').exists())

    def test_an_unresolvable_watched_stock_gets_no_row(self, resolve):
        watch('NBIS:xnas', 11)
        resolve.return_value = None
        coverage.sync_extras(user=USER)
        self.assertFalse(ScreenerRow.everything.filter(ticker='NBIS').exists())

    def test_skips_etfs_non_usd_positions_and_universe_tickers(self, resolve):
        ScreenerRow.objects.create(ticker='AAPL', name='Apple', indexes='SP500')
        hold('AAPL', uic=1)
        hold('QQQ', uic=2, asset_type='Etf')
        hold('SAP', uic=3, currency='EUR')
        watch('QQQ:xnas', 2, asset_type='Etf')
        watch('AAPL:xnas', 1)
        self.assertEqual(coverage.sync_extras(user=USER), {'added': 0, 'removed': 0})
        resolve.assert_not_called()
        self.assertEqual(ScreenerRow.everything.count(), 1)

    def test_removes_an_extra_nobody_holds_or_watches_any_more(self, resolve):
        ScreenerRow.everything.create(ticker='OLD', name='Old', indexes='', in_universe=False)
        ScreenerRow.everything.create(ticker='KEEP', name='Keep', indexes='', in_universe=False)
        hold('KEEP')
        self.assertEqual(coverage.sync_extras(user=USER), {'added': 0, 'removed': 1})
        self.assertFalse(ScreenerRow.everything.filter(ticker='OLD').exists())
        self.assertTrue(ScreenerRow.everything.filter(ticker='KEEP').exists())

    def test_counts_every_users_positions_and_watchlists(self, resolve):
        from django.contrib.auth import get_user_model

        other = get_user_model().objects.create_user(username='other', password='x' * 12)
        hold('AAA', uic=1, owner=other)
        watch('BBB:xnas', 2, owner=other)
        resolve.return_value = {'uic': 2}
        coverage.sync_extras(user=USER)
        self.assertEqual(
            set(ScreenerRow.everything.filter(in_universe=False).values_list('ticker', flat=True)), {'AAA', 'BBB'},
        )

    def test_a_failed_lookup_does_not_stop_the_other_additions(self, resolve):
        hold('HELD', uic=1)
        watch('BAD:xnas', 2)
        watch('GOOD:xnas', 3)
        resolve.side_effect = lambda ticker, user: (
            {'uic': 3} if ticker == 'GOOD' else (_ for _ in ()).throw(ProviderError('down'))
        )
        with self.assertLogs('research.coverage', level='WARNING'):
            result = coverage.sync_extras(user=USER)
        self.assertEqual(result['added'], 2)
        self.assertEqual(
            set(ScreenerRow.everything.filter(in_universe=False).values_list('ticker', flat=True)), {'HELD', 'GOOD'},
        )

    def test_nothing_is_removed_when_a_lookup_failed(self, resolve):
        ScreenerRow.everything.create(ticker='OLD', name='Old', indexes='', in_universe=False)
        watch('BAD:xnas', 2)
        resolve.side_effect = ProviderNotConnected()
        with self.assertLogs('research.coverage', level='WARNING'):
            result = coverage.sync_extras(user=USER)
        self.assertEqual(result, {'added': 0, 'removed': 0})
        self.assertTrue(ScreenerRow.everything.filter(ticker='OLD').exists())

    def test_a_known_extra_is_not_resolved_again(self, resolve):
        ScreenerRow.everything.create(ticker='NBIS', name='Nebius', indexes='', in_universe=False, uic=11)
        watch('NBIS:xnas', 11)
        coverage.sync_extras(user=USER)
        resolve.assert_not_called()
        self.assertEqual(ScreenerRow.everything.filter(ticker='NBIS').count(), 1)
