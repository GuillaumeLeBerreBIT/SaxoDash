from celery import shared_task

from saxo.tasks import synced

from . import compute

COMPUTE_TASK = 'compute_verdicts'


@synced(reports_health=False, task=COMPUTE_TASK, credential=None)
def _compute_all():
    return compute.run()


@shared_task
def compute_verdicts():
    return _compute_all()
