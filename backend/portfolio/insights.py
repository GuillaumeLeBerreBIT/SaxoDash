"""Portfolio intelligence for the Dashboard command centre.

Composes one payload from data already in the app: `Position`, the daily
`core.NetWorthSnapshot` series, and a best-effort call into
`research.earnings`. No new model, no sync. Every change figure is
end-of-day - Saxo SIM has no quote feed.
"""
import logging
from datetime import date, timedelta
from decimal import Decimal

from core.models import NetWorthSnapshot
from portfolio.models import Position
from portfolio.services import get_portfolio_value

logger = logging.getLogger(__name__)

STALE_DAYS = 2
SINGLE_NAME_PCT = 30
TOP3_PCT = 60
EARNINGS_SOON_DAYS = 7
EARNINGS_HORIZON_DAYS = 14
SPARK_POINTS = 30
MOVERS = 3
CONTRIBUTORS = 8


def _window_earnings(week_offset):
    """Indirection so tests patch one seam. Function-level import of
    `research.earnings` breaks the portfolio <-> research module cycle."""
    from research import earnings as research_earnings
    return research_earnings.window_earnings('mine', week_offset)


def _delta(anchor, end):
    abs_ = end - anchor
    pct = round(float(abs_ / anchor * 100), 2) if anchor else None
    return {'abs': abs_, 'pct': pct}


def _day(pairs):
    if len(pairs) < 2:
        return None
    return _delta(pairs[-2][1], pairs[-1][1])


def _trailing(pairs, days):
    if len(pairs) < 2:
        return None
    cutoff = pairs[-1][0] - timedelta(days=days)
    window = [v for d, v in pairs if d >= cutoff]
    if len(window) < 2:
        return None
    return _delta(window[0], window[-1])


def _ytd(pairs):
    if not pairs:
        return None
    year = pairs[-1][0].year
    window = [v for d, v in pairs if d.year == year]
    if len(window) < 2:
        return None
    return _delta(window[0], window[-1])


def _all_time(pairs):
    if len(pairs) < 2:
        return None
    return _delta(pairs[0][1], pairs[-1][1])


def _concentration(positions, total):
    if not positions or not total:
        return {'top1': None, 'top3_pct': None, 'hhi': None, 'positions': len(positions)}
    ranked = sorted(positions, key=lambda p: p.value, reverse=True)
    weights = [float(p.value / total) for p in ranked]
    return {
        'top1': {'ticker': ranked[0].ticker, 'pct': round(weights[0] * 100, 1)},
        'top3_pct': round(sum(weights[:3]) * 100, 1),
        'hhi': round(sum(w * w for w in weights), 4),
        'positions': len(positions),
    }


def _exposure(positions, total, key, label):
    if not total:
        return []
    buckets = {}
    for p in positions:
        name = (getattr(p, key) or '').strip() or 'Unknown'
        buckets[name] = buckets.get(name, Decimal('0')) + p.value
    rows = [
        {label: name, 'pct': round(float(value / total * 100), 1), 'value': value}
        for name, value in buckets.items()
    ]
    rows.sort(key=lambda r: r['value'], reverse=True)
    return rows


def _mover_row(p):
    return {'ticker': p.ticker, 'name': p.name, 'pnl_pct': float(p.pnl_pct),
            'pnl': p.pnl, 'value': p.value}


def _movers(positions):
    if not positions:
        return {'best': [], 'worst': []}
    ranked = sorted(positions, key=lambda p: p.pnl_pct, reverse=True)
    best = ranked[:MOVERS]
    best_tickers = {p.ticker for p in best}
    worst = [p for p in reversed(ranked) if p.ticker not in best_tickers][:MOVERS]
    return {'best': [_mover_row(p) for p in best], 'worst': [_mover_row(p) for p in worst]}


def _contributors(positions, total_cost, total_pnl):
    rows = []
    for p in positions:
        contribution_pp = float(p.pnl / total_cost * 100) if total_cost else 0.0
        share = float(p.pnl / total_pnl * 100) if total_pnl else 0.0
        rows.append({
            'ticker': p.ticker, 'pnl': p.pnl,
            'contribution_pp': round(contribution_pp, 2),
            'share_of_gain_pct': round(share, 1),
        })
    rows.sort(key=lambda r: abs(r['contribution_pp']), reverse=True)
    return rows[:CONTRIBUTORS]


def _upcoming_earnings(held_upper, today):
    horizon = (today + timedelta(days=EARNINGS_HORIZON_DAYS)).isoformat()
    try:
        events = []
        for offset in (0, 1):
            events.extend(_window_earnings(offset).get('events', []))
    except Exception as exc:  # feed down, shape change - degrade, don't 500
        logger.warning('upcoming earnings unavailable: %s', exc)
        return None

    rows = []
    seen = set()
    for e in events:
        symbol = (e.get('symbol') or '').upper()
        day = e.get('date') or ''
        key = (symbol, day)
        if not e.get('held') or symbol not in held_upper or key in seen:
            continue
        if e.get('eps_actual') is not None:
            continue
        if not (today.isoformat() <= day <= horizon):
            continue
        seen.add(key)
        rows.append({
            'ticker': symbol,
            'date': day,
            'days_until': (date.fromisoformat(day) - today).days,
            'session': e.get('session'),
            'eps_estimate': e.get('eps_estimate'),
        })
    rows.sort(key=lambda r: r['date'])
    return rows


def _attention(positions, pairs, today, concentration, upcoming):
    items = []
    c = concentration
    if c['top1'] and c['top1']['pct'] >= SINGLE_NAME_PCT:
        items.append({'kind': 'single_name', 'severity': 'warn',
                      'text': f"{c['top1']['ticker']} alone is {c['top1']['pct']:.0f}% "
                              f"of the portfolio."})
    if c['top3_pct'] is not None and c['top3_pct'] >= TOP3_PCT:
        items.append({'kind': 'concentration', 'severity': 'warn',
                      'text': f"Top 3 holdings are {c['top3_pct']:.0f}% of the portfolio."})
    if pairs:
        age = (today - pairs[-1][0]).days
        if age > STALE_DAYS:
            items.append({'kind': 'stale_value', 'severity': 'warn',
                          'text': f"Portfolio value is {age} days old "
                                  f"(last {pairs[-1][0].strftime('%b %d')})."})
    unpriced = [p for p in positions if p.price_source != 'live']
    if unpriced:
        n = len(unpriced)
        items.append({'kind': 'price_basis', 'severity': 'info',
                      'text': f"{n} holding{'' if n == 1 else 's'} priced off Saxo P/L, "
                              f"not a live quote."})
    if upcoming:
        soon = upcoming[0]
        if soon['days_until'] <= EARNINGS_SOON_DAYS:
            d = soon['days_until']
            when = 'today' if d == 0 else 'tomorrow' if d == 1 else f'in {d} days'
            items.append({'kind': 'earnings_soon', 'severity': 'info', 'ticker': soon['ticker'],
                          'text': f"{soon['ticker']} reports {when}."})
    if len(pairs) < 2:
        items.append({'kind': 'no_history', 'severity': 'info',
                      'text': 'Not enough history yet for change metrics.'})
    return items


def build_insights():
    positions = list(Position.objects.all())
    pairs = list(
        NetWorthSnapshot.objects.order_by('date').values_list('date', 'portfolio_value')
    )
    latest = NetWorthSnapshot.objects.order_by('date').last()
    today = date.today()

    total = sum((p.value for p in positions), Decimal('0'))
    total_cost = sum((p.cost for p in positions), Decimal('0'))
    total_pnl = total - total_cost

    portfolio_value = get_portfolio_value().rounded().amount
    bank = latest.bank_total if latest else Decimal('0')

    concentration = _concentration(positions, total)
    held_upper = {p.ticker.upper() for p in positions if p.ticker}
    upcoming = _upcoming_earnings(held_upper, today)

    return {
        'as_of': pairs[-1][0].isoformat() if pairs else None,
        'stale': bool(pairs) and (today - pairs[-1][0]).days > STALE_DAYS,
        'value': {
            'net_worth': portfolio_value + bank,
            'portfolio': portfolio_value,
            'bank': bank,
        },
        'change': {
            'day': _day(pairs),
            'week': _trailing(pairs, 7),
            'month': _trailing(pairs, 30),
            'ytd': _ytd(pairs),
            'all_time': _all_time(pairs),
        },
        'spark': [{'date': d.isoformat(), 'value': float(v)} for d, v in pairs[-SPARK_POINTS:]],
        'concentration': concentration,
        'sector_exposure': _exposure(positions, total, 'sector', 'name'),
        'currency_exposure': _exposure(positions, total, 'currency', 'currency'),
        'movers': _movers(positions),
        'contributors': _contributors(positions, total_cost, total_pnl),
        'attention': _attention(positions, pairs, today, concentration, upcoming),
        'upcoming_earnings': upcoming,
    }
