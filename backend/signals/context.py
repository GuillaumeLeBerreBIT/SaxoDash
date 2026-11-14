import math
from bisect import bisect_left

from . import definitions
from .evaluate import MIN_RANKED_STOCKS

YEAR = 252


def _below_high(series):
    high = max(series.highs[-YEAR:])
    if not high:
        return None
    distance = series.closes[-1] / high - 1
    return 0.0 if distance >= 0 else min(round(distance * 100, 1), -0.1)


def latest_momentum(series):
    return definitions.momentum(series)[-1] if len(series) else None


def standing(series):
    if len(series) < YEAR:
        return {'below_high_pct': None, 'momentum_pct': None}
    latest = latest_momentum(series)
    return {
        'below_high_pct': _below_high(series),
        'momentum_pct': round(latest * 100, 1) if latest is not None else None,
    }


def ranked(momentum_by_ticker, universe):
    field = sorted(value for ticker, value in momentum_by_ticker.items() if ticker in universe and value is not None)
    if len(field) < MIN_RANKED_STOCKS:
        return dict.fromkeys(momentum_by_ticker)
    return {
        ticker: None if value is None else math.floor(100 * bisect_left(field, value) / len(field))
        for ticker, value in momentum_by_ticker.items()
    }
