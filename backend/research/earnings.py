"""Compose the earnings responses from Finnhub's calendar endpoint.

`finnhub.py` is the thin client; this module owns symbol collection, the
per-symbol day-stamped cache fan-out, shaping, and the history/next split.
It reads `portfolio.models.Position` for the tracked-symbol list - one
read-only leaf import, the same way several views read across apps.
"""
import logging
from datetime import date, timedelta

from django.core.cache import cache

from portfolio.models import Position

from . import finnhub
from .models import WatchlistItem
from .providers import ProviderUnavailable

logger = logging.getLogger(__name__)

UPCOMING_BACK = timedelta(days=7)
UPCOMING_AHEAD = timedelta(days=31)
HISTORY_BACK = timedelta(days=365 * 3)
HISTORY_AHEAD = timedelta(days=120)

# Approach A fans out one upstream call per symbol; cap it so holdings +
# watchlists growing can't turn one request into an unbounded burst.
MAX_FANOUT_SYMBOLS = 40


def _surprise(estimate, actual):
    if estimate in (None, 0) or actual is None:
        return None
    return round((actual - estimate) / abs(estimate) * 100, 2)


def _shape(row):
    estimate = row.get('epsEstimate')
    actual = row.get('epsActual')
    session = (row.get('hour') or '').strip().lower()
    return {
        'symbol': row.get('symbol'),
        'date': row.get('date'),
        'session': session or None,
        'quarter': row.get('quarter'),
        'year': row.get('year'),
        'eps_estimate': estimate,
        'eps_actual': actual,
        'revenue_estimate': row.get('revenueEstimate'),
        'revenue_actual': row.get('revenueActual'),
        'eps_surprise_pct': _surprise(estimate, actual),
    }


def tracked_symbols():
    tickers = Position.objects.values_list('ticker', flat=True)
    watched = WatchlistItem.objects.values_list('symbol', flat=True)
    return sorted({s.upper() for s in (*tickers, *watched) if s})


def _fetch_calendar(symbol, date_from, date_to):
    rows = finnhub.get_earnings_calendar(
        symbol, date_from.isoformat(), date_to.isoformat(),
    ).get('earningsCalendar', [])
    shaped = (_shape(row) for row in rows)
    # Drop dateless rows so neither layer has to bucket a null date.
    return sorted((event for event in shaped if event['date']), key=lambda event: event['date'])


def upcoming_earnings(symbols):
    today = date.today()
    date_from, date_to = today - UPCOMING_BACK, today + UPCOMING_AHEAD
    events, unavailable = [], []

    # Cap the fan-out; symbols past the cap report as unavailable, not fetched.
    symbols = list(symbols)
    unavailable.extend(symbols[MAX_FANOUT_SYMBOLS:])

    for symbol in symbols[:MAX_FANOUT_SYMBOLS]:
        key = f'research:earnings-cal:{symbol}:{today.isoformat()}'
        try:
            events.extend(cache.get_or_set(
                key,
                lambda s=symbol: _fetch_calendar(s, date_from, date_to),
                finnhub.EARNINGS_CAL_TTL,
            ))
        except ProviderUnavailable as exc:
            logger.warning('earnings calendar unavailable for %s: %s', symbol, exc)
            unavailable.append(symbol)

    events.sort(key=lambda event: (event['date'] or '', event['symbol'] or ''))
    return {
        'events': events,
        'unavailable': unavailable,
        'window': {'from': date_from.isoformat(), 'to': date_to.isoformat()},
    }


def symbol_earnings(symbol):
    today = date.today()
    key = f'research:earnings-sym:{symbol}:{today.isoformat()}'
    calendar = cache.get_or_set(
        key,
        lambda: _fetch_calendar(symbol, today - HISTORY_BACK, today + HISTORY_AHEAD),
        finnhub.EARNINGS_TTL,
    )

    today_iso = today.isoformat()
    history = [e for e in calendar if (e['date'] or '') < today_iso or e['eps_actual'] is not None]
    upcoming = [e for e in calendar if (e['date'] or '') >= today_iso and e['eps_actual'] is None]
    return {'available': True, 'history': history, 'next': upcoming[0] if upcoming else None}
