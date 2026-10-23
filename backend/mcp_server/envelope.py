from django.utils import timezone

from saxo.credentials import connection_state, worst_recent_outcome


def answer(data, *, sources, warnings=(), as_of=None):
    return {
        'data': data,
        'as_of': (as_of or timezone.now()).isoformat(),
        'sources': list(sources),
        'warnings': list(warnings),
    }


def saxo_warnings():
    warnings = []
    state = connection_state()
    if not state.usable:
        warnings.append(state.reason)
    if worst_recent_outcome() == 'failed':
        warnings.append('A Saxo sync task is failing, so positions may be stale.')
    return warnings
