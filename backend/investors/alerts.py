from collections import Counter

from . import changes, summaries
from .models import FilingAlert, FilingAlertRead, InvestorFollow

LIMIT = 20
TOP_MOVES = 3
COUNTED = (changes.NEW, changes.ADDED, changes.TRIMMED, changes.SOLD_OUT)


def record(investor, newest_before, entries):
    if newest_before is None or not InvestorFollow.objects.filter(investor=investor).exists():
        return
    first_filed = {}
    for entry in entries:
        quarter_end = entry['quarter_end']
        if quarter_end > newest_before:
            first_filed[quarter_end] = min(entry['filed_on'], first_filed.get(quarter_end, entry['filed_on']))
    for quarter_end, filed_on in first_filed.items():
        FilingAlert.objects.get_or_create(investor=investor, quarter_end=quarter_end, defaults={'filed_on': filed_on})


def _inbox(user):
    return FilingAlert.objects.filter(investor__follows__user=user)


def _item(alert, read):
    moves = summaries.story_moves(alert.investor, alert.quarter_end)
    kinds = Counter(move['kind'] for move in moves)
    return {
        'id': alert.pk,
        'investor': {'slug': alert.investor.slug, 'name': alert.investor.name, 'firm': alert.investor.firm},
        'quarter': alert.quarter_end.isoformat(),
        'filed_on': alert.filed_on.isoformat(),
        'read': read,
        'counts': {kind: kinds[kind] for kind in COUNTED},
        'moves': moves[:TOP_MOVES],
    }


def payload(user):
    listed = list(_inbox(user).select_related('investor').order_by('-filed_on', '-quarter_end', '-pk')[:LIMIT])
    read_ids = set(
        FilingAlertRead.objects.filter(user=user, alert__in=listed).values_list('alert_id', flat=True)
    )
    return {
        'unread': _inbox(user).exclude(reads__user=user).count(),
        'alerts': [_item(alert, alert.pk in read_ids) for alert in listed],
    }


def mark_read(user):
    unread = _inbox(user).exclude(reads__user=user)
    FilingAlertRead.objects.bulk_create(
        [FilingAlertRead(user=user, alert=alert) for alert in unread], ignore_conflicts=True,
    )
