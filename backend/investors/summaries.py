from collections import defaultdict
from datetime import timedelta

from django.db.models import Max

from portfolio.models import Position
from research.models import WatchlistItem

from . import changes, importer, quarters, sectors
from .models import PositionMove, Security

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
        'styles': investor.styles,
        'followed': investor.followed,
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


def _latest_quarters(investor_ids):
    rows = (
        PositionMove.objects.filter(investor_id__in=investor_ids)
        .values('investor_id').annotate(latest=Max('quarter_end'))
    )
    return {row['investor_id']: row['latest'] for row in rows}


def _moves_by_investor(latest):
    grouped = defaultdict(list)
    for quarter_end in set(latest.values()):
        ids = [pk for pk, quarter in latest.items() if quarter == quarter_end]
        for move in PositionMove.objects.filter(quarter_end=quarter_end, investor_id__in=ids):
            grouped[move.investor_id].append(move)
    return grouped


def _held(moves):
    held = [move for move in moves if move.kind != changes.SOLD_OUT]
    return sorted(held, key=lambda move: (-move.value, move.cusip, move.put_call))


def _card(investor, today, quarter_end, moves, held, tickers):
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
    if quarter_end is None:
        return base
    compared = any(move.kind is not None for move in moves)
    base.update({
        'latest_quarter': quarter_end.isoformat(),
        'total_value': sum(move.value for move in held),
        'positions': len(held),
        'top10_weight': round(sum(move.weight_pct for move in held[:TOP_TEN]), 2),
        'top_holdings': [
            {'cusip': move.cusip, 'ticker': tickers.get(move.cusip), 'issuer': move.issuer, 'weight': move.weight_pct}
            for move in held[:TOP_HOLDINGS]
        ],
        'new_count': sum(1 for move in held if move.kind == changes.NEW) if compared else None,
        'exited_count': len(moves) - len(held) if compared else None,
    })
    return base


def cards(investors, today):
    investors = list(investors)
    latest = _latest_quarters([investor.pk for investor in investors])
    grouped = _moves_by_investor(latest)
    held = {pk: _held(moves) for pk, moves in grouped.items()}
    tickers = tickers_for({move.cusip for rows in held.values() for move in rows[:TOP_HOLDINGS]})
    return [
        _card(investor, today, latest.get(investor.pk), grouped.get(investor.pk, []), held.get(investor.pk, []), tickers)
        for investor in investors
    ]


def card(investor, today):
    return cards([investor], today)[0]


def holder_ids(ticker):
    cusips = list(Security.objects.filter(ticker__iexact=ticker).values_list('cusip', flat=True))
    rows = list(
        PositionMove.objects.filter(cusip__in=cusips).exclude(kind=changes.SOLD_OUT)
        .values_list('investor_id', 'quarter_end')
    )
    latest = _latest_quarters({investor_id for investor_id, _ in rows})
    return {investor_id for investor_id, quarter_end in rows if latest.get(investor_id) == quarter_end}


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


CHANGE_GROUPS = (changes.NEW, changes.ADDED, changes.TRIMMED, changes.SOLD_OUT)


def _side(row, total):
    if row is None:
        return None, None, None
    return row['shares'], row['value'], _weight(row['value'], total)


def _change_item(key, now, before, totals, tickers, pct):
    shares, value, weight = _side(now, totals[0])
    previous_shares, previous_value, previous_weight = _side(before, totals[1])
    return {
        'cusip': key[0],
        'put_call': key[1],
        'ticker': tickers.get(key[0]),
        'issuer': (now or before)['issuer'],
        'shares': shares,
        'previous_shares': previous_shares,
        'shares_change_pct': pct,
        'value': value,
        'previous_value': previous_value,
        'value_change': (value or 0) - (previous_value or 0),
        'weight': weight,
        'previous_weight': previous_weight,
    }


def changes_payload(investor, quarter_end):
    groups = {group: [] for group in CHANGE_GROUPS}
    ends = quarters.quarter_ends(investor)
    if not ends:
        return {'quarter': None, 'previous_quarter': None, **groups}
    quarter_end, previous = _resolve_quarter(ends, quarter_end)
    if previous is None:
        return {'quarter': quarter_end.isoformat(), 'previous_quarter': None, **groups}

    snap, previous_snap, per_key, sold_out = _comparison(investor, quarter_end, previous)
    tickers = tickers_for({key[0] for key in [*snap, *previous_snap]})
    totals = (sum(_values(snap).values()), sum(_values(previous_snap).values()))
    for key, (kind, pct) in per_key.items():
        if kind in groups:
            groups[kind].append(_change_item(key, snap[key], previous_snap.get(key), totals, tickers, pct))
    for key in sold_out:
        groups[changes.SOLD_OUT].append(_change_item(key, None, previous_snap[key], totals, tickers, -100.0))
    for items in groups.values():
        items.sort(key=lambda item: (-abs(item['value_change']), item['cusip'], item['put_call']))
    return {'quarter': quarter_end.isoformat(), 'previous_quarter': previous.isoformat(), **groups}
