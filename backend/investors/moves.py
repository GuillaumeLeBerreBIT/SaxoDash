from django.db import transaction

from . import changes, quarters
from .models import Investor, PositionMove

BATCH = 500


def _weight(value, total):
    return round(value / total * 100, 2) if total else 0.0


def _shares(snap):
    return {key: row['shares'] for key, row in snap.items()}


def _total(snap):
    return sum(row['value'] for row in snap.values())


def _first_quarter(investor, quarter_end, snap):
    total = _total(snap)
    for (cusip, put_call), row in snap.items():
        yield PositionMove(
            investor=investor, quarter_end=quarter_end, cusip=cusip, put_call=put_call, issuer=row['issuer'],
            kind=None, shares=row['shares'], value=row['value'], weight_pct=_weight(row['value'], total),
        )


def _compared_quarter(investor, quarter_end, snap, previous_snap):
    total, previous_total = _total(snap), _total(previous_snap)
    per_key, sold_out = changes.compare(_shares(snap), _shares(previous_snap))
    for key, row in snap.items():
        kind, pct = per_key[key]
        before = previous_snap.get(key)
        yield PositionMove(
            investor=investor, quarter_end=quarter_end, cusip=key[0], put_call=key[1], issuer=row['issuer'],
            kind=kind, shares=row['shares'], previous_shares=before['shares'] if before else None,
            value=row['value'], previous_value=before['value'] if before else None,
            weight_pct=_weight(row['value'], total),
            previous_weight_pct=_weight(before['value'], previous_total) if before else None,
            change_pct=pct,
        )
    for key in sold_out:
        before = previous_snap[key]
        yield PositionMove(
            investor=investor, quarter_end=quarter_end, cusip=key[0], put_call=key[1], issuer=before['issuer'],
            kind=changes.SOLD_OUT, shares=0, previous_shares=before['shares'],
            value=0, previous_value=before['value'], weight_pct=0.0,
            previous_weight_pct=_weight(before['value'], previous_total), change_pct=-100.0,
        )


@transaction.atomic
def rebuild(investor):
    rows = []
    previous_snap = None
    for quarter_end in sorted(quarters.quarter_ends(investor)):
        snap = quarters.snapshot(investor, quarter_end)
        if previous_snap is None:
            rows.extend(_first_quarter(investor, quarter_end, snap))
        else:
            rows.extend(_compared_quarter(investor, quarter_end, snap, previous_snap))
        previous_snap = snap
    PositionMove.objects.filter(investor=investor).delete()
    PositionMove.objects.bulk_create(rows, batch_size=BATCH)
    return len(rows)


def rebuild_all():
    return sum(rebuild(investor) for investor in Investor.objects.all())
