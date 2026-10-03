from celery import shared_task

from portfolio.models import Position
from saxo.models import SyncRun
from saxo.tasks import synced

from . import scan, scan_progress
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


ALREADY_RUNNING = 'A scan was already running.'


@synced(reports_health=False, task=scan.SCAN_TASK)
def _scan_with_credential(credential):
    return scan.scan_universe()


@shared_task
def scan_universe(claimed=False):
    if not claimed and not scan_progress.claim():
        SyncRun.objects.create(task=scan.SCAN_TASK, outcome='skipped', detail=ALREADY_RUNNING)
        return None
    try:
        return _scan_with_credential()
    finally:
        scan_progress.clear()
