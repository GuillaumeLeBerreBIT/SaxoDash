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
