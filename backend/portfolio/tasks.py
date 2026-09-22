from celery import shared_task

from .sectors import backfill_sectors


@shared_task
def backfill_position_sectors():
    """Backfills any Position still at the default sector from Finnhub.

    Runs on its own, low-frequency schedule (see the periodic task registered
    in admin) - deliberately not part of sync_positions, which runs every
    30 minutes and has no reason to recheck a classification that moves on
    the order of years. Safe to run repeatedly; see sectors.backfill_sectors.
    """
    return backfill_sectors()
