from datetime import timedelta

from django.db.models import Max

from portfolio.models import Position
from research.models import WatchlistItem

from . import changes, importer, quarters, sectors
from .models import Security

STALE_AFTER = timedelta(days=183)
TOP_HOLDINGS = 3
TOP_TEN = 10


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


def _values(snap):
    return {key: row['value'] for key, row in snap.items()}


def _top10(rows):
    return round(sum(row['weight'] for row in rows[:TOP_TEN]), 2)


class QuarterNotFound(Exception):
    pass


def _header(investor, today):
    return {
        'name': investor.name,
        'firm': investor.firm,
        'slug': investor.slug,
        'blurb': investor.blurb,
        'curated': investor.curated,
        'last_filing_at': investor.last_filing_at.isoformat() if investor.last_filing_at else None,
        'stale': is_stale(investor, today),
        'import': importer.progress(investor),
    }


def _yours():
    owned = {ticker.upper() for ticker in Position.objects.values_list('ticker', flat=True)}
    watched = {symbol.upper() for symbol in WatchlistItem.objects.values_list('symbol', flat=True)}
    return owned, watched


def _resolve_quarter(ends, quarter_end):
    quarter_end = quarter_end or ends[0]
    if quarter_end not in ends:
        raise QuarterNotFound(quarter_end)
    position = ends.index(quarter_end)
    previous = ends[position + 1] if position + 1 < len(ends) else None
    return quarter_end, previous


def _comparison(investor, quarter_end, previous):
    snap = quarters.snapshot(investor, quarter_end)
    previous_snap = quarters.snapshot(investor, previous) if previous else None
    previous_shares = _shares(previous_snap) if previous_snap is not None else None
    per_key, sold_out = changes.compare(_shares(snap), previous_shares)
    return snap, previous_snap, per_key, sold_out


def _movement(snap, previous_snap, per_key, sold_out):
    if previous_snap is None:
        return {'new_count': None, 'exited_count': None, 'turnover': None}
    new_keys = [key for key, change in per_key.items() if change[0] == changes.NEW]
    return {
        'new_count': len(new_keys),
        'exited_count': len(sold_out),
        'turnover': changes.turnover(_values(snap), _values(previous_snap), new_keys, sold_out),
    }


def _filed_on(investor, quarter_end):
    latest = investor.filings.filter(quarter_end=quarter_end).aggregate(latest=Max('filed_on'))['latest']
    return latest.isoformat() if latest else None


def holds_ticker(investor, ticker):
    ends = quarters.quarter_ends(investor)
    if not ends:
        return False
    cusips = {row['cusip'] for row in quarters.snapshot(investor, ends[0]).values()}
    return Security.objects.filter(cusip__in=cusips, ticker__iexact=ticker).exists()


def card(investor, today):
    ends = quarters.quarter_ends(investor)
    base = {
        **_header(investor, today),
        'latest_quarter': None,
        'total_value': None,
        'positions': None,
        'top10_weight': None,
        'top_holdings': [],
        'new_count': None,
        'exited_count': None,
    }
    if not ends:
        return base

    quarter_end, previous = _resolve_quarter(ends, None)
    snap, previous_snap, per_key, sold_out = _comparison(investor, quarter_end, previous)
    rows = weighted(snap, tickers_for(row['cusip'] for row in snap.values()))
    movement = _movement(snap, previous_snap, per_key, sold_out)
    base.update({
        'latest_quarter': quarter_end.isoformat(),
        'total_value': sum(row['value'] for row in rows),
        'positions': len(rows),
        'top10_weight': _top10(rows),
        'top_holdings': [
            {'cusip': row['cusip'], 'ticker': row['ticker'], 'issuer': row['issuer'], 'weight': row['weight']}
            for row in rows[:TOP_HOLDINGS]
        ],
        'new_count': movement['new_count'],
        'exited_count': movement['exited_count'],
    })
    return base


def detail(investor, quarter_end, today):
    ends = quarters.quarter_ends(investor)
    base = {
        **_header(investor, today),
        'quarters': [end.isoformat() for end in ends],
        'quarter': None,
        'previous_quarter': None,
        'filed_on': None,
        'total_value': None,
        'positions': None,
        'top10_weight': None,
        'new_count': None,
        'exited_count': None,
        'turnover': None,
        'holdings': [],
    }
    if not ends:
        return base
    quarter_end, previous = _resolve_quarter(ends, quarter_end)
    snap, previous_snap, per_key, sold_out = _comparison(investor, quarter_end, previous)
    rows = weighted(snap, tickers_for(row['cusip'] for row in snap.values()))
    held = quarters.quarters_held(quarters.held_keys_by_quarter(investor), quarter_end)
    owned, watched = _yours()

    holdings = []
    for row in rows:
        key = (row['cusip'], row['put_call'])
        change = per_key[key]
        ticker = row['ticker']
        holdings.append({
            'cusip': row['cusip'],
            'ticker': ticker,
            'issuer': row['issuer'],
            'class': row['title_of_class'],
            'put_call': row['put_call'],
            'amount_type': row['amount_type'],
            'shares': row['shares'],
            'value': row['value'],
            'weight': row['weight'],
            'change': change[0] if change else None,
            'shares_change_pct': change[1] if change else None,
            'quarters_held': held.get(key, 1),
            'sector': sectors.sector_for(ticker),
            'owned': bool(ticker) and ticker.upper() in owned,
            'watched': bool(ticker) and ticker.upper() in watched,
        })

    base.update({
        'quarter': quarter_end.isoformat(),
        'previous_quarter': previous.isoformat() if previous else None,
        'filed_on': _filed_on(investor, quarter_end),
        'total_value': sum(row['value'] for row in rows),
        'positions': len(rows),
        'top10_weight': _top10(rows),
        **_movement(snap, previous_snap, per_key, sold_out),
        'holdings': holdings,
    })
    return base
