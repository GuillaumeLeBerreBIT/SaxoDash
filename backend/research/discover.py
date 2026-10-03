from datetime import timedelta

from django.db.models import Min
from django.utils import timezone

from saxo.models import SyncRun

from . import scan_progress
from .models import ScreenerRow
from .scan import SCAN_TASK

STALE_AFTER = timedelta(hours=36)


def _issue(run):
    if run is None or run.outcome == 'ok':
        return None
    return run.detail or None


def health(now=None):
    now = now or timezone.now()
    runs = SyncRun.objects.filter(task=SCAN_TASK)
    latest = runs.first()
    last_ok = runs.filter(outcome='ok').first()
    progress = scan_progress.current()
    if last_ok is None:
        state = 'scanning' if progress else 'never'
    elif latest.outcome == 'failed':
        state = 'failed'
    elif now - last_ok.ran_at > STALE_AFTER:
        state = 'stale'
    else:
        state = 'ok'
    return {
        'state': state,
        'last_run_at': latest.ran_at if latest else None,
        'last_ok_at': last_ok.ran_at if last_ok else None,
        'issue': _issue(latest),
        'progress': progress,
    }


def as_of():
    if health()['state'] in ('never', 'scanning'):
        return None
    return ScreenerRow.objects.filter(status=ScreenerRow.OK).aggregate(oldest=Min('technicals_at'))['oldest']
