from celery import shared_task
from django.utils import timezone

from saxo.models import SyncRun
from saxo.tasks import SyncReport, synced

from . import house, performance, run_lock

SYNC_TASK = 'sync_house'


@synced(reports_health=False, task=SYNC_TASK, needs_credential=False)
def _sync():
    now = timezone.now()
    years = {now.year} | ({now.year - 1} if now.month == 1 else set())
    created = sum(house.sync_index(year, now) for year in sorted(years))
    result = house.parse_pending()
    performance.rebuild_all()
    if result.waiting:
        raise house.HouseError(f'Clerk unreachable, {result.waiting} reports waiting')
    return SyncReport(rows=result.parsed, detail=f'{created} new reports, {result.failed} failed to parse')


@shared_task
def sync_house():
    try:
        with run_lock.exclusive('daily sync'):
            return _sync()
    except run_lock.Busy as busy:
        SyncRun.objects.create(task=SYNC_TASK, outcome='skipped', detail=f'A House {busy.holder} was already running.')
        return None
