from datetime import timedelta

from django.db.models import Min
from django.utils import timezone

from saxo.models import SyncRun

from .models import ScreenerRow
from .scan import SCAN_TASK

STALE_AFTER = timedelta(hours=36)


def health(now=None):
    now = now or timezone.now()
    runs = SyncRun.objects.filter(task=SCAN_TASK)
    latest = runs.first()
    last_ok = runs.filter(outcome='ok').first()
    if last_ok is None:
        state = 'never'
    elif latest.outcome == 'failed':
        state = 'failed'
    elif now - last_ok.ran_at > STALE_AFTER:
        state = 'stale'
    else:
        state = 'ok'
    return {'state': state, 'last_run_at': latest.ran_at if latest else None}


def as_of():
    if health()['state'] == 'never':
        return None
    return ScreenerRow.objects.filter(status=ScreenerRow.OK).aggregate(oldest=Min('technicals_at'))['oldest']
