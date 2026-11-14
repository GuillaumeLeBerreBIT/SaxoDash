from bisect import bisect_left

from . import definitions
from .evaluate import MIN_RANKED_STOCKS

YEAR = 252


def standing(series):
    if len(series) <= YEAR:
        return {'below_high_pct': None, 'momentum_pct': None}
    high = max(series.highs[-YEAR:])
    latest = definitions.momentum(series)[-1]
    return {
        'below_high_pct': round((series.closes[-1] / high - 1) * 100, 1) if high else None,
        'momentum_pct': round(latest * 100, 1) if latest is not None else None,
    }


def ranked(momentum_by_ticker, universe):
    field = sorted(value for ticker, value in momentum_by_ticker.items() if ticker in universe and value is not None)
    if len(field) < MIN_RANKED_STOCKS:
        return dict.fromkeys(momentum_by_ticker)
    return {
        ticker: None if value is None else round(100 * bisect_left(field, value) / len(field))
        for ticker, value in momentum_by_ticker.items()
    }
