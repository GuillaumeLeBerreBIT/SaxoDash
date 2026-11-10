import logging

from celery import shared_task

from . import housekeeping
from .backup import backup_database
from .services import ensure_todays_snapshot, users_with_holdings

logger = logging.getLogger(__name__)


@shared_task
def snapshot_net_worth():
    """Record today's net worth on a schedule rather than on page load.

    `ensure_todays_snapshot` is also called by NetWorthHistoryView, but a view
    only runs when somebody opens the app - so any day nobody visited left a
    permanent hole in the history (2026-08-28 is one such hole). Scheduling it
    makes the series depend on the app running, not on being looked at.

    Idempotent: `ensure_todays_snapshot` returns the existing row if today's
    snapshot already exists, so overlapping with the view call is harmless.
    """
    written = []
    errors = []
    for user in users_with_holdings():
        try:
            written.append(ensure_todays_snapshot(user).pk)
        except Exception as exc:
            logger.warning('Could not record today\'s snapshot for %s', user, exc_info=True)
            errors.append(exc)
    if errors:
        raise errors[0]
    return written


@shared_task
def backup_database_task():
    """Thin wrapper so a backup failure shows up as a failed Celery task -
    visible the same way any other scheduled job's failure is - rather than
    only in a log file nobody is tailing."""
    return str(backup_database())


@shared_task
def prune_expired_records():
    return housekeeping.prune()
