from celery import shared_task

from portfolio.models import Position

from .watchlists import sync_open_positions_watchlist


@shared_task
def sync_watchlists():
    """Mirrors currently-open positions into the 'Open positions' watchlist.

    Runs on its own schedule rather than being called from saxo.tasks -
    research owns watchlist semantics end to end, so a WatchlistItem shape
    change can no longer break sync_positions. Trade-off: the watchlist can
    lag a position change by up to this task's own interval, where a shared
    transaction used to guarantee they moved together. Needs its own
    periodic-task registration in admin, same as sync_account_balance did.
    """
    sync_open_positions_watchlist(Position.objects.exclude(uic__isnull=True))
