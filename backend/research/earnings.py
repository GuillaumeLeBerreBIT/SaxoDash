"""Compose the earnings responses from Finnhub's calendar endpoint.

`finnhub.py` is the thin client; this module owns the week-window fetch of
the whole US market, shaping, the held/watchlist tagging, and the
per-symbol history split. It reads `portfolio.models.Position` and
`WatchlistItem` for the held/watched tagging - read-only leaf reads.
"""
import logging
from datetime import date, timedelta

from django.core.cache import cache

from portfolio.models import Position

from . import finnhub
from .models import WatchlistItem
from .providers import ProviderUnavailable

logger = logging.getLogger(__name__)

HISTORY_BACK = timedelta(days=365 * 3)
HISTORY_AHEAD = timedelta(days=120)

# The week-nav arrows page one calendar week at a time; clamp how far.
MIN_WEEK, MAX_WEEK = -8, 12


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


def _fetch_calendar(symbol, date_from, date_to):
    rows = finnhub.get_earnings_calendar(
        symbol, date_from.isoformat(), date_to.isoformat(),
    ).get('earningsCalendar', [])
    shaped = (_shape(row) for row in rows)
    # Drop dateless rows so neither layer has to bucket a null date.
    return sorted((event for event in shaped if event['date']), key=lambda event: event['date'])


def _monday_of(day):
    return day - timedelta(days=day.weekday())


def _tracked():
    held = {s.upper() for s in Position.objects.values_list('ticker', flat=True) if s}
    watched = {s.upper() for s in WatchlistItem.objects.values_list('symbol', flat=True) if s} - held
    return held, watched


def _market_week(start, end):
    rows = finnhub.get_earnings_calendar(
        None, start.isoformat(), end.isoformat(),
    ).get('earningsCalendar', [])
    shaped = (_shape(row) for row in rows)
    return sorted(
        (event for event in shaped if event['date']),
        key=lambda event: (event['date'], event['symbol'] or ''),
    )


def window_earnings(scope='all', week_offset=0):
    """One week of the whole US-market calendar, tagged with the user's
    holdings/watchlists. `scope='mine'` keeps only tagged rows.

    The market week is cached un-tagged (one entry per calendar week), so
    'all' and 'mine' share it; tagging is per request.
    """
    start = _monday_of(date.today()) + timedelta(weeks=week_offset)
    end = start + timedelta(days=6)
    window = {'from': start.isoformat(), 'to': end.isoformat(), 'week': week_offset}
    key = f'research:earnings-week:{start.isoformat()}'

    try:
        events = cache.get_or_set(key, lambda: _market_week(start, end), finnhub.EARNINGS_CAL_TTL)
    except ProviderUnavailable as exc:
        logger.warning('market earnings calendar unavailable for week of %s: %s', start, exc)
        return {'events': [], 'window': window, 'ok': False}

    held, watched = _tracked()
    tagged = []
    for event in events:
        symbol = (event['symbol'] or '').upper()
        is_held = symbol in held
        is_watched = symbol in watched
        tagged.append({**event, 'held': is_held, 'watched': is_watched, 'mine': is_held or is_watched})

    if scope == 'mine':
        tagged = [event for event in tagged if event['mine']]

    return {'events': tagged, 'window': window, 'ok': True}


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
