from datetime import timedelta

from django.contrib.sessions.models import Session
from django.utils import timezone
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken

from enablebanking.models import BankSyncRun
from saxo.models import SyncRun

RUN_HISTORY = timedelta(days=90)


def prune(now=None):
    now = now or timezone.now()
    return {
        'tokens': _deleted(OutstandingToken.objects.filter(expires_at__lte=now), OutstandingToken),
        'sessions': _deleted(Session.objects.filter(expire_date__lt=now), Session),
        'sync_runs': _prune_runs(SyncRun, ('user', 'task'), now),
        'bank_sync_runs': _prune_runs(BankSyncRun, ('bank', 'kind'), now),
    }


def _prune_runs(model, group, now):
    newest = _newest_per_group(model.objects.all(), group)
    newest_ok = _newest_per_group(model.objects.filter(outcome='ok'), group)
    stale = model.objects.filter(ran_at__lt=now - RUN_HISTORY).exclude(pk__in=newest | newest_ok)
    return _deleted(stale, model)


def _newest_per_group(runs, group):
    return set(runs.order_by(*group, '-ran_at', '-id').distinct(*group).values_list('pk', flat=True))


def _deleted(queryset, model):
    _, per_model = queryset.delete()
    return per_model.get(model._meta.label, 0)
