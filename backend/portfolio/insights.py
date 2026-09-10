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
