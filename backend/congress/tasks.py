from celery import shared_task
from django.utils import timezone

from saxo.tasks import SyncReport, synced

from . import house, performance
from .models import Member

SYNC_TASK = 'sync_house'


@synced(reports_health=False, task=SYNC_TASK, needs_credential=False)
def _sync():
    now = timezone.now()
    years = {now.year} | ({now.year - 1} if now.month == 1 else set())
    created = sum(house.sync_index(year, now) for year in sorted(years))
    result = house.parse_pending()
    for member in Member.objects.filter(pk__in=result.member_ids):
        performance.rebuild(member)
    return SyncReport(rows=result.parsed, detail=f'{created} new reports, {result.failed} failed to parse')


@shared_task
def sync_house():
    return _sync()
