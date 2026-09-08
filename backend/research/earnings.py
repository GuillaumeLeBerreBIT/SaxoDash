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
