import logging

from portfolio.models import Position

from . import listings
from .models import ScreenerRow, WatchlistItem
from .providers import ProviderError, ProviderNotConnected

logger = logging.getLogger(__name__)

UNCATEGORIZED = 'Uncategorized'
MAX_WATCHED_EXTRAS = 150


def _sector_of(position):
    return '' if position.sector == UNCATEGORIZED else position.sector


def _held():
    held = {}
    for position in Position.objects.filter(asset_type='Stock', currency='USD').order_by('id'):
        ticker = listings.bare(position.ticker)
        if ticker in held and held[ticker][2]:
            continue
        held[ticker] = (position.name, position.uic, _sector_of(position))
    return held


def _watched(user, skip, extras):
    from . import scan

    watched = {}
    skipped = set()
    lookups_failed = False
    items = sorted(
        WatchlistItem.objects.filter(asset_type='Stock').order_by('id'),
        key=lambda item: listings.bare(item.symbol) not in extras,
    )
    for item in items:
        ticker = listings.bare(item.symbol)
        if ticker in skip or ticker in watched or ticker in skipped:
            continue
        if len(watched) >= MAX_WATCHED_EXTRAS:
            skipped.add(ticker)
            continue
        if ticker in extras:
            watched[ticker] = (item.description or ticker, item.uic, '')
            continue
        try:
            found = scan.resolve(ticker, user=user)
        except (ProviderError, ProviderNotConnected):
            logger.warning('Could not confirm the watched listing for %s', ticker, exc_info=True)
            lookups_failed = True
            continue
        if found is not None and found['uic'] == item.uic:
            watched[ticker] = (item.description or ticker, item.uic, '')
    return watched, lookups_failed, len(skipped)


def sync_extras(*, user):
    universe = set(ScreenerRow.objects.values_list('ticker', flat=True))
    extras = {row.ticker for row in ScreenerRow.everything.filter(in_universe=False)}
    held = {ticker: value for ticker, value in _held().items() if ticker not in universe}
    watched, lookups_failed, skipped = _watched(user, universe | set(held), extras)
    wanted = {**held, **watched}

    added = 0
    for ticker, (name, uic, sector) in wanted.items():
        if ticker in extras:
            continue
        ScreenerRow.everything.create(
            ticker=ticker, name=name, indexes='', uic=uic, asset_type='Stock', in_universe=False,
            sector=sector,
        )
        added += 1

    for ticker, (_, _, sector) in held.items():
        if sector and ticker in extras:
            ScreenerRow.everything.filter(ticker=ticker, in_universe=False, sector='').update(sector=sector)

    stale = set() if lookups_failed else extras - set(wanted)
    ScreenerRow.everything.filter(in_universe=False, ticker__in=stale).delete()
    if skipped:
        logger.warning('%s watched stocks left out of the scan: over the cap of %s', skipped, MAX_WATCHED_EXTRAS)
    return {'added': added, 'removed': len(stale), 'skipped': skipped}
