from celery import shared_task

from saxo.tasks import SyncReport, synced

from . import compute

COMPUTE_TASK = 'compute_verdicts'


def _detail(failed):
    if not failed:
        return ''
    return f'{len(failed)} failed: {", ".join(failed)}'


@synced(reports_health=False, task=COMPUTE_TASK, credential=None)
def _compute_all():
    result = compute.run()
    return SyncReport(rows=result.written, detail=_detail(result.failed))


@shared_task
def compute_verdicts():
    return _compute_all()
