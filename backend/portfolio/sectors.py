"""Backfills Position.sector from Finnhub's company-industry classification.

Deliberately separate from saxo/mapping.py::to_position_fields, which runs
inside sync_positions every 30 minutes - a Finnhub call per position on that
cadence would burn free-tier rate limit for no benefit, since a company's
sector classification moves on the order of years, not days. This runs on
its own, much less frequent schedule instead (see portfolio.tasks).
"""
import logging

from research.providers import ProviderError

from .models import Position

logger = logging.getLogger(__name__)

UNCATEGORIZED = 'Uncategorized'


def backfill_sectors():
    """Fetches and stores a real sector for every Position still at the
    default. Returns how many were updated.

    Safe to call repeatedly: a position with a real sector already is left
    alone (no repeat Finnhub call), and a symbol Finnhub has nothing for (an
    ETF, a delisted ticker, a rate-limited call) stays Uncategorized rather
    than aborting the run for the positions after it.
    """
    from research import finnhub  # function-level: avoid a portfolio<->research import cycle

    updated = 0
    for position in Position.objects.filter(sector=UNCATEGORIZED):
        try:
            value = finnhub.industry(position.ticker)
        except ProviderError as exc:
            logger.info('Sector backfill skipped %s: %s', position.ticker, exc)
            continue
        position.sector = value
        position.save(update_fields=['sector'])
        updated += 1
    return updated
