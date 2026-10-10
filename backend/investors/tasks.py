from celery import shared_task

from saxo.tasks import SyncReport, synced

from . import edgar, importer
from .models import Investor

SYNC_TASK = 'sync_investors'


def _detail(skipped):
    if not skipped:
        return ''
    return f'skipped {len(skipped)} unreadable filing(s): {", ".join(skipped)}'


@synced(reports_health=False, task=SYNC_TASK, needs_credential=False)
def _sync_all():
    since = importer.history_start()
    imported = 0
    skipped = []
    failures = []
    for investor in Investor.objects.all():
        try:
            result = importer.sync_investor(investor, since, resolve=False)
        except edgar.EdgarError as exc:
            failures.append(f'{investor.slug}: {exc}')
            continue
        imported += result.imported
        skipped += result.skipped
    importer.resolve_securities()
    if failures:
        raise edgar.EdgarError('; '.join(failures))
    return SyncReport(rows=imported, detail=_detail(skipped))


@shared_task
def sync_investors():
    return _sync_all()


@shared_task
def backfill_investor(investor_id):
    investor = Investor.objects.filter(pk=investor_id).first()
    if investor is None:
        return
    importer.backfill(investor)
