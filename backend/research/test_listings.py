from decimal import Decimal
from unittest.mock import patch, sentinel

from django.core.cache import cache
from django.test import TestCase, override_settings

from portfolio.models import Position

from . import company_data
from .listings import Listing, bare, look_up
from .providers import ProviderError
from users.testing import the_owner

USER = sentinel.user
LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}


def row(currency='USD', exchange='xnas', uic=1, symbol='NVDA'):
    return {
        'symbol': symbol, 'uic': uic, 'asset_type': 'Stock', 'description': f'{symbol} Inc',
        'exchange': exchange, 'currency': currency,
    }


def hold(ticker='GOOGL', uic=7, currency='USD', asset_type='Stock'):
    return Position.objects.create(
        user=the_owner(),
        ticker=ticker, name=f'{ticker} Inc', qty=Decimal('1'), avg_cost=Decimal('1'),
        current_price=Decimal('1'), sector='T', type='STOCK', color='#000',
        uic=uic, asset_type=asset_type, currency=currency,
    )


@override_settings(CACHES=LOCMEM)
class LookUpTest(TestCase):
    def setUp(self):
        cache.clear()

    def test_bare_strips_the_exchange_and_uppercases(self):
        self.assertEqual(bare(' nvda:xnas '), 'NVDA')

    def test_held_position_answers_without_saxo(self):
        hold()
        with patch('research.market.search', side_effect=AssertionError):
            listing = look_up('googl', user=USER)
        self.assertEqual((listing.ticker, listing.uic, listing.currency), ('GOOGL', 7, 'USD'))
        self.assertTrue(listing.resolved)

    def test_usd_row_wins_over_an_earlier_foreign_one(self):
        with patch('research.market.search', return_value=[row('EUR', 'xetr', 1), row('USD', 'xnas', 2)]):
            self.assertEqual(look_up('NVDA', user=USER).uic, 2)

    def test_first_match_when_none_is_usd(self):
        with patch('research.market.search', return_value=[row('EUR', 'xetr', 1), row('GBP', 'xlon', 2)]):
            self.assertEqual(look_up('NVDA', user=USER).uic, 1)

    def test_rows_for_other_symbols_are_ignored(self):
        with patch('research.market.search', return_value=[row(symbol='NVDL')]):
            self.assertFalse(look_up('NVDA', user=USER).resolved)

    def test_details_complete_a_missing_currency(self):
        with patch('research.market.search', return_value=[row(currency='')]), \
                patch('research.market.details', return_value={'currency': 'USD'}):
            self.assertEqual(look_up('NVDA', user=USER).currency, 'USD')

    def test_a_found_listing_is_cached(self):
        with patch('research.market.search', return_value=[row()]) as search:
            first = look_up('NVDA', user=USER)
            second = look_up('nvda', user=USER)
        self.assertEqual(first, second)
        search.assert_called_once_with('NVDA', 'Stock,Etf', user=USER)

    def test_a_miss_is_not_cached(self):
        with patch('research.market.search', return_value=[]) as search:
            look_up('ZZZZ', user=USER)
            look_up('ZZZZ', user=USER)
        self.assertEqual(search.call_count, 2)

    def test_a_provider_failure_is_unresolved(self):
        with patch('research.market.search', side_effect=ProviderError('down')):
            listing = look_up('NVDA', user=USER)
        self.assertEqual(listing.ticker, 'NVDA')
        self.assertFalse(listing.resolved)

    def test_held_lookup_picks_the_lowest_id(self):
        hold('nvda', uic=20)
        hold('NVDA', uic=10)
        self.assertEqual(look_up('NVDA', user=USER).uic, 20)

    def test_an_exchange_suffix_is_ignored(self):
        with patch('research.market.search', return_value=[row(symbol='ASMLF', uic=1), row(currency='', uic=99, symbol='ASML')]), \
                patch('research.market.details', return_value={'currency': 'EUR'}):
            listing = look_up('ASML:xams', user=USER)
        self.assertEqual((listing.uic, listing.currency), (99, 'EUR'))

    def test_as_dict_has_the_instrument_keys(self):
        hold()
        self.assertEqual(
            look_up('GOOGL', user=USER).as_dict(),
            {'symbol': 'GOOGL', 'name': 'GOOGL Inc', 'uic': 7, 'asset_type': 'Stock', 'currency': 'USD', 'exchange': None},
        )


class ListingRulesTest(TestCase):
    def listing(self, **fields):
        base = {'ticker': 'NVDA', 'symbol': 'NVDA', 'name': 'N', 'uic': 1, 'asset_type': 'Stock', 'currency': 'USD', 'exchange': None}
        return Listing(**{**base, **fields})

    def test_status_follows_the_company_data_rule(self):
        self.assertEqual(self.listing().company_status, company_data.ELIGIBLE)
        self.assertEqual(self.listing(currency='EUR').company_status, company_data.FOREIGN)
        self.assertEqual(self.listing(asset_type='Etf').company_status, company_data.FUND)
        self.assertEqual(self.listing(currency=None).company_status, company_data.UNVERIFIED)

    def test_unresolved_is_eligible_with_a_warning(self):
        unresolved = Listing.unresolved('NVDA')
        self.assertFalse(unresolved.resolved)
        self.assertEqual(unresolved.company_status, company_data.ELIGIBLE)
        self.assertIsNone(unresolved.refusal())
        self.assertEqual(
            unresolved.unverified_warning,
            'NVDA could not be matched to a Saxo listing, so it is assumed to be US-listed.',
        )

    def test_a_resolved_listing_has_no_unverified_warning(self):
        self.assertIsNone(self.listing().unverified_warning)

    def test_refusal_per_status(self):
        self.assertIsNone(self.listing().refusal())
        self.assertEqual(self.listing(currency='EUR').refusal(), company_data.refusal(company_data.FOREIGN))
        self.assertEqual(self.listing(asset_type='Etf').refusal(), company_data.refusal(company_data.FUND))
        self.assertIsNone(self.listing(asset_type='Etf').refusal(allow_fund=True))
        self.assertEqual(self.listing(currency=None).refusal(allow_fund=True), company_data.refusal(company_data.UNVERIFIED))
