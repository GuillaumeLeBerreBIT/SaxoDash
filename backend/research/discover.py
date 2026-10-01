from datetime import timedelta

from django.db.models import Max, Min
from django.utils import timezone

from saxo.models import SyncRun

from .models import ScreenerRow
from .scan import SCAN_TASK

STALE_AFTER = timedelta(hours=36)
SCAN_ACTIVE_WITHIN = timedelta(minutes=5)


def _first_scan_progress(now):
    latest_write = ScreenerRow.objects.aggregate(latest=Max('technicals_at'))['latest']
    if latest_write is None or now - latest_write > SCAN_ACTIVE_WITHIN:
        return None
    return {
        'state': 'scanning',
        'scanned': ScreenerRow.objects.filter(status=ScreenerRow.OK).count(),
        'total': ScreenerRow.objects.count(),
    }


def health(now=None):
    now = now or timezone.now()
    runs = SyncRun.objects.filter(task=SCAN_TASK)
    latest = runs.first()
    last_ok = runs.filter(outcome='ok').first()
    if last_ok is None:
        progress = _first_scan_progress(now)
        if progress is not None:
            return {**progress, 'last_run_at': latest.ran_at if latest else None}
        state = 'never'
    elif latest.outcome == 'failed':
        state = 'failed'
    elif now - last_ok.ran_at > STALE_AFTER:
        state = 'stale'
    else:
        state = 'ok'
    return {'state': state, 'last_run_at': latest.ran_at if latest else None}


def as_of():
    if health()['state'] in ('never', 'scanning'):
        return None
    return ScreenerRow.objects.filter(status=ScreenerRow.OK).aggregate(oldest=Min('technicals_at'))['oldest']
