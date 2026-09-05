from .models import Watchlist, WatchlistItem

OPEN_POSITIONS_WATCHLIST = 'Open positions'


def sync_open_positions_watchlist(positions):
    """Mirror currently-open, uic-identified positions into a default watchlist.

    Not protected against deletion - the next sync just recreates it, which is
    simpler than special-casing one row in Watchlist.
    """
    watchlist, _ = Watchlist.objects.get_or_create(name=OPEN_POSITIONS_WATCHLIST)

    seen_uics = []
    for position in positions:
        if position.uic is None:
            continue
        WatchlistItem.objects.get_or_create(
            watchlist=watchlist, uic=position.uic,
            defaults={
                'symbol': position.ticker,
                'asset_type': position.asset_type or 'Stock',
                'description': position.name,
            },
        )
        seen_uics.append(position.uic)

    watchlist.items.exclude(uic__in=seen_uics).delete()
