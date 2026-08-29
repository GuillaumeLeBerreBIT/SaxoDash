from celery import shared_task

from .services import ensure_todays_snapshot


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
    return ensure_todays_snapshot().pk
