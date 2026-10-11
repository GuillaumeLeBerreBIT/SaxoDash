from collections import Counter

from django.utils import timezone

from . import changes, summaries
from .models import FilingAlert

LIMIT = 20
TOP_MOVES = 3
COUNTED = (changes.NEW, changes.ADDED, changes.TRIMMED, changes.SOLD_OUT)


def record(investor, newest_before, entries):
    if not investor.followed or newest_before is None:
        return
    first_filed = {}
    for entry in entries:
        quarter_end = entry['quarter_end']
        if quarter_end > newest_before:
            first_filed[quarter_end] = min(entry['filed_on'], first_filed.get(quarter_end, entry['filed_on']))
    for quarter_end, filed_on in first_filed.items():
        FilingAlert.objects.get_or_create(investor=investor, quarter_end=quarter_end, defaults={'filed_on': filed_on})


def _inbox():
    return FilingAlert.objects.filter(investor__followed=True)


def _item(alert):
    moves = summaries.story_moves(alert.investor, alert.quarter_end)
    kinds = Counter(move['kind'] for move in moves)
    return {
        'id': alert.pk,
        'investor': {'slug': alert.investor.slug, 'name': alert.investor.name, 'firm': alert.investor.firm},
        'quarter': alert.quarter_end.isoformat(),
        'filed_on': alert.filed_on.isoformat(),
        'read': alert.read_at is not None,
        'counts': {kind: kinds[kind] for kind in COUNTED},
        'moves': moves[:TOP_MOVES],
    }


def payload():
    listed = _inbox().select_related('investor').order_by('-filed_on', '-quarter_end', '-pk')[:LIMIT]
    return {
        'unread': _inbox().filter(read_at__isnull=True).count(),
        'alerts': [_item(alert) for alert in listed],
    }


def mark_read():
    _inbox().filter(read_at__isnull=True).update(read_at=timezone.now())
