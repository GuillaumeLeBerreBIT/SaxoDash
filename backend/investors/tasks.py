from celery import shared_task

from saxo.tasks import SyncReport, synced

from . import copying, edgar, importer, price_feed
from .models import Investor

SYNC_TASK = 'sync_investors'
COPY_TASK = 'refresh_copy_performance'


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


@synced(reports_health=False, task=COPY_TASK)
def _refresh_copies(credential):
    fetched = 0
    try:
        fetched = price_feed.refresh()
    finally:
        measured = copying.rebuild_all()
    return SyncReport(rows=measured, detail=f'{fetched} price series fetched')


@shared_task
def refresh_copy_performance():
    return _refresh_copies()
