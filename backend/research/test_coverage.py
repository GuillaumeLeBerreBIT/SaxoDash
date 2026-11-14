from unittest import mock

from django.test import TestCase

from portfolio.models import Position
from research import coverage
from research.models import ScreenerRow, Watchlist, WatchlistItem
from research.providers import ProviderError, ProviderNotConnected
from users.testing import the_owner

USER = mock.sentinel.user


def hold(ticker, *, uic=11, currency='USD', asset_type='Stock', owner=None, sector='Tech'):
    return Position.objects.create(
        user=owner or the_owner(), ticker=ticker, name=f'{ticker} Inc', qty=1, avg_cost=1, current_price=1,
        sector=sector, type='STOCK', color='#fff', uic=uic, asset_type=asset_type, currency=currency,
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
        self.assertEqual(coverage.sync_extras(user=USER), {'added': 1, 'removed': 0, 'skipped': 0})
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
        self.assertEqual(coverage.sync_extras(user=USER), {'added': 0, 'removed': 0, 'skipped': 0})
        resolve.assert_not_called()
        self.assertEqual(ScreenerRow.everything.count(), 1)

    def test_removes_an_extra_nobody_holds_or_watches_any_more(self, resolve):
        ScreenerRow.everything.create(ticker='OLD', name='Old', indexes='', in_universe=False)
        ScreenerRow.everything.create(ticker='KEEP', name='Keep', indexes='', in_universe=False)
        hold('KEEP')
        self.assertEqual(coverage.sync_extras(user=USER), {'added': 0, 'removed': 1, 'skipped': 0})
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
        self.assertEqual(result, {'added': 0, 'removed': 0, 'skipped': 0})
        self.assertTrue(ScreenerRow.everything.filter(ticker='OLD').exists())

    def test_watched_stocks_beyond_the_cap_are_left_out_and_counted(self, resolve):
        resolve.side_effect = lambda ticker, user: {'uic': int(ticker[1:])}
        for index in range(1, 5):
            watch(f'W{index}', index)
        with mock.patch.object(coverage, 'MAX_WATCHED_EXTRAS', 3):
            result = coverage.sync_extras(user=USER)
        self.assertEqual((result['added'], result['skipped']), (3, 1))
        self.assertEqual(ScreenerRow.everything.filter(in_universe=False).count(), 3)
        self.assertEqual(resolve.call_count, 3)

    def test_the_cap_keeps_known_extras_before_admitting_new_ones(self, resolve):
        resolve.side_effect = lambda ticker, user: {'uic': int(ticker[1:])}
        watch('W1', 1)
        watch('W2', 2)
        ScreenerRow.everything.create(ticker='W2', name='W2', indexes='', uic=2, in_universe=False)
        with mock.patch.object(coverage, 'MAX_WATCHED_EXTRAS', 1):
            result = coverage.sync_extras(user=USER)
        self.assertEqual(
            list(ScreenerRow.everything.filter(in_universe=False).values_list('ticker', flat=True)), ['W2'],
        )
        self.assertEqual((result['removed'], result['skipped']), (0, 1))

    def test_a_held_stock_is_admitted_whatever_the_cap(self, resolve):
        hold('NBIS')
        with mock.patch.object(coverage, 'MAX_WATCHED_EXTRAS', 0):
            coverage.sync_extras(user=USER)
        self.assertTrue(ScreenerRow.everything.filter(ticker='NBIS').exists())

    def test_a_known_extra_is_not_resolved_again(self, resolve):
        ScreenerRow.everything.create(ticker='NBIS', name='Nebius', indexes='', in_universe=False, uic=11)
        watch('NBIS:xnas', 11)
        coverage.sync_extras(user=USER)
        resolve.assert_not_called()
        self.assertEqual(ScreenerRow.everything.filter(ticker='NBIS').count(), 1)

    def test_a_held_extra_takes_its_sector_from_the_position(self, resolve):
        hold('JPM', uic=5, sector='Banking')
        coverage.sync_extras(user=USER)
        self.assertEqual(ScreenerRow.everything.get(ticker='JPM').sector, 'Banking')

    def test_an_uncategorized_position_leaves_the_sector_empty(self, resolve):
        hold('NBIS', sector='Uncategorized')
        coverage.sync_extras(user=USER)
        self.assertEqual(ScreenerRow.everything.get(ticker='NBIS').sector, '')

    def test_a_watched_only_extra_keeps_an_empty_sector(self, resolve):
        watch('NBIS:xnas', 11)
        resolve.return_value = {'uic': 11}
        coverage.sync_extras(user=USER)
        self.assertEqual(ScreenerRow.everything.get(ticker='NBIS').sector, '')

    def test_an_existing_extra_with_no_sector_gets_the_holders(self, resolve):
        ScreenerRow.everything.create(ticker='JPM', name='JPM', indexes='', in_universe=False, uic=5)
        hold('JPM', uic=5, sector='Banking')
        coverage.sync_extras(user=USER)
        self.assertEqual(ScreenerRow.everything.get(ticker='JPM').sector, 'Banking')

    def test_an_existing_extra_keeps_the_sector_it_has(self, resolve):
        ScreenerRow.everything.create(
            ticker='JPM', name='JPM', indexes='', in_universe=False, uic=5, sector='Financial Services',
        )
        hold('JPM', uic=5, sector='Banking')
        coverage.sync_extras(user=USER)
        self.assertEqual(ScreenerRow.everything.get(ticker='JPM').sector, 'Financial Services')
