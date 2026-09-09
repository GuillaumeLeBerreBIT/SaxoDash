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

HISTORY_AHEAD = timedelta(days=120)

# Bump when a cached payload's SHAPE changes, so a deploy never hands new code
# an entry an old build wrote (a shape mismatch here was a 500, not just
# staleness). Old entries expire on their own TTL.
CACHE_V = 'v3'

# The week-nav arrows page one calendar week at a time; clamp how far.
MIN_WEEK, MAX_WEEK = -8, 12

# The current week must pick up today's just-posted actuals; settled weeks
# (past, or far enough out to be all estimates) can cache far longer.
CURRENT_WEEK_TTL = 3600


def _surprise(estimate, actual):
    if estimate in (None, 0) or actual is None:
        return None
    return round((actual - estimate) / abs(estimate) * 100, 2)


def _shape(row):
    estimate = row.get('epsEstimate')
    actual = row.get('epsActual')
    rev_estimate = row.get('revenueEstimate')
    rev_actual = row.get('revenueActual')
    session = (row.get('hour') or '').strip().lower()
    return {
        'symbol': row.get('symbol'),
        'date': row.get('date'),
        'session': session or None,
        'quarter': row.get('quarter'),
        'year': row.get('year'),
        'eps_estimate': estimate,
        'eps_actual': actual,
        'revenue_estimate': rev_estimate,
        'revenue_actual': rev_actual,
        'eps_surprise_pct': _surprise(estimate, actual),
        'revenue_surprise_pct': _surprise(rev_estimate, rev_actual),
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


def _surprise_summary(values):
    """Beat / miss / in-line split and mean over the surprise %s that exist.
    `None`s (not yet reported) are dropped. The one place the >0 / <0 / ==0
    rule lives - `_week_stats` and `_score` both go through here.
    """
    scored = [v for v in values if v is not None]
    beat = sum(1 for v in scored if v > 0)
    missed = sum(1 for v in scored if v < 0)
    return {
        'reported': len(scored),
        'beat': beat,
        'missed': missed,
        'inline': len(scored) - beat - missed,
        'avg': round(sum(scored) / len(scored), 2) if scored else None,
    }


def _week_stats(events):
    """Headline counts for the calendar's week-summary strip and its day
    rail, reduced from the rows already in hand - no extra fetch.

    `by_day` is the beat / miss / in-line split per date, oldest-first;
    the summary chart and the day cards both read off it.
    """
    summary = _surprise_summary([e['eps_surprise_pct'] for e in events])

    per_day = {}
    for event in events:
        surprise = event['eps_surprise_pct']
        if surprise is None:
            continue
        slot = per_day.setdefault(event['date'], {'beat': 0, 'missed': 0, 'inline': 0})
        slot['beat' if surprise > 0 else 'missed' if surprise < 0 else 'inline'] += 1

    return {
        'total': len(events),
        'reported': summary['reported'],
        'beat': summary['beat'],
        'missed': summary['missed'],
        'inline': summary['inline'],
        'mine': sum(1 for e in events if e.get('mine')),
        'avg_surprise': summary['avg'],
        'by_day': [{'date': d, **counts} for d, counts in sorted(per_day.items())],
    }


def window_earnings(scope='all', week_offset=0):
    """One week of the whole US-market calendar, tagged with the user's
    holdings/watchlists. `scope='mine'` keeps only tagged rows.

    The market week is cached un-tagged (one entry per calendar week), so
    'all' and 'mine' share it; tagging is per request.
    """
    start = _monday_of(date.today()) + timedelta(weeks=week_offset)
    end = start + timedelta(days=6)
    window = {'from': start.isoformat(), 'to': end.isoformat(), 'week': week_offset}
    key = f'research:earnings-week:{CACHE_V}:{start.isoformat()}'
    ttl = CURRENT_WEEK_TTL if week_offset == 0 else finnhub.EARNINGS_CAL_TTL

    try:
        events = cache.get_or_set(key, lambda: _market_week(start, end), ttl)
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
        events = [event for event in tagged if event['mine']]
    else:
        # The whole-market feed is mostly OTC/ADR shells with a date and
        # nothing else; a consensus estimate is the "covered company" signal.
        # Held/watched rows stay in regardless.
        events = [event for event in tagged if event['eps_estimate'] is not None or event['mine']]

    return {'events': events, 'window': window, 'stats': _week_stats(events), 'ok': True}


def _eps_history(symbol):
    """Recent reported quarters from /stock/earnings (EPS only, oldest-first).

    /calendar/earnings only reliably carries the *next* date, not deep
    history - so the history charts read from here instead.
    """
    rows = finnhub.get_earnings_history(symbol) or []
    shaped = [
        {
            'date': row.get('period'),
            'eps_actual': row.get('actual'),
            'eps_estimate': row.get('estimate'),
            'eps_surprise_pct': row.get('surprisePercent'),
        }
        for row in rows
        if row.get('period')
    ]
    return sorted(shaped, key=lambda event: event['date'])


def _score(history):
    """Beat record over the reported quarters we have, so the Research tab
    renders a verdict without re-deriving it. `streak` counts consecutive
    beats back from the most recent quarter (history is oldest-first).
    """
    summary = _surprise_summary([e['eps_surprise_pct'] for e in history])
    quarters = summary['reported']

    streak = 0
    for e in reversed(history):
        surprise = e['eps_surprise_pct']
        if surprise is None:
            continue
        if surprise <= 0:
            break
        streak += 1

    return {
        'beats': summary['beat'],
        'quarters': quarters,
        'beat_rate': round(summary['beat'] / quarters, 2) if quarters else None,
        'avg_surprise': summary['avg'],
        'streak': streak,
    }


def _next_scheduled(symbol, today):
    """The soonest still-unreported earnings date from the forward calendar."""
    rows = _fetch_calendar(symbol, today, today + HISTORY_AHEAD)
    upcoming = [e for e in rows if (e['date'] or '') >= today.isoformat() and e['eps_actual'] is None]
    return upcoming[0] if upcoming else None


def symbol_earnings(symbol):
    today = date.today()
    key = f'research:earnings-sym:{CACHE_V}:{symbol}:{today.isoformat()}'

    def produce():
        history = _eps_history(symbol)
        return {
            'history': history,
            'next': _next_scheduled(symbol, today),
            'score': _score(history),
        }

    return {'available': True, **cache.get_or_set(key, produce, finnhub.EARNINGS_TTL)}
