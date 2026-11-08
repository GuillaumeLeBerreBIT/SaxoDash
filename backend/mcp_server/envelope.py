from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from django.utils import timezone

from saxo.credentials import connection_state, worst_recent_outcome


@dataclass(frozen=True)
class Reply:
    data: Any
    warnings: list[str] = field(default_factory=list)
    as_of: datetime | None = None


class Unavailable(Exception):
    def __init__(self, *warnings):
        super().__init__(*warnings)
        self.warnings = [warning for warning in warnings if warning]


def json_safe(value):
    if isinstance(value, dict):
        return {key: json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(item) for item in value]
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def answer(data, *, sources, warnings=(), as_of=None):
    return {
        'data': data,
        'as_of': (as_of or timezone.now()).isoformat(),
        'sources': list(sources),
        'warnings': list(warnings),
    }


def saxo_warnings(user):
    warnings = []
    state = connection_state(user)
    if not state.usable:
        warnings.append(state.reason)
    if worst_recent_outcome(user) == 'failed':
        warnings.append('A Saxo sync task is failing, so positions may be stale.')
    return warnings
