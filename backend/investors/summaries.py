from datetime import timedelta

from . import changes, importer, quarters
from .models import Security

STALE_AFTER = timedelta(days=183)
TOP_HOLDINGS = 3


def tickers_for(cusips):
    return dict(Security.objects.filter(cusip__in=list(cusips)).values_list('cusip', 'ticker'))


def _weight(value, total):
    return round(value / total * 100, 2) if total else 0.0


def weighted(snap, tickers):
    total = sum(row['value'] for row in snap.values())
    rows = [
        {**row, 'ticker': tickers.get(row['cusip']), 'weight': _weight(row['value'], total)}
        for row in snap.values()
    ]
    return sorted(rows, key=lambda row: (-row['value'], row['cusip'], row['put_call']))


def is_stale(investor, today):
    return investor.last_filing_at is not None and today - investor.last_filing_at > STALE_AFTER


def _shares(snap):
    return {key: row['shares'] for key, row in snap.items()}


def card(investor, today):
    ends = quarters.quarter_ends(investor)
    base = {
        'name': investor.name,
        'firm': investor.firm,
        'slug': investor.slug,
        'blurb': investor.blurb,
        'curated': investor.curated,
        'last_filing_at': investor.last_filing_at.isoformat() if investor.last_filing_at else None,
        'stale': is_stale(investor, today),
        'import': importer.progress(investor),
        'latest_quarter': None,
        'total_value': None,
        'positions': None,
        'top_holdings': [],
        'new_count': None,
        'exited_count': None,
    }
    if not ends:
        return base

    snap = quarters.snapshot(investor, ends[0])
    rows = weighted(snap, tickers_for(row['cusip'] for row in snap.values()))
    base.update({
        'latest_quarter': ends[0].isoformat(),
        'total_value': sum(row['value'] for row in rows),
        'positions': len(rows),
        'top_holdings': [
            {'cusip': row['cusip'], 'ticker': row['ticker'], 'issuer': row['issuer'], 'weight': row['weight']}
            for row in rows[:TOP_HOLDINGS]
        ],
    })
    if len(ends) > 1:
        per_key, sold_out = changes.compare(_shares(snap), _shares(quarters.snapshot(investor, ends[1])))
        base['new_count'] = sum(1 for change in per_key.values() if change[0] == changes.NEW)
        base['exited_count'] = len(sold_out)
    return base
