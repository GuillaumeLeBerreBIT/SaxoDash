import logging
import time
from dataclasses import dataclass

from saxo import client

from . import history, market
from .models import DailyBars
from .providers import ProviderError, ProviderNotConnected
from .scan import DAILY_HORIZON, PAUSE_SECONDS, stored_bars

logger = logging.getLogger(__name__)

ROWS_PER_RUN = 150


@dataclass(frozen=True)
class Result:
    completed: int
    failed: tuple


class Restated(Exception):
    pass


def _deepened(daily, user, pause):
    bars = list(daily.bars)
    while len(bars) < history.TARGET_BARS:
        page = stored_bars(market.chart_before(daily.row.uic, daily.row.asset_type, DAILY_HORIZON, bars[0][0], user=user))
        pause(PAUSE_SECONDS)
        if not history.agrees(bars, page) and page:
            raise Restated(daily.row.ticker)
        bars, grew = history.with_older(bars, page)
        if not grew or len(page) < client.CHART_MAX_COUNT - 5:
            break
    return bars


def backfill(pause=time.sleep, limit=ROWS_PER_RUN, *, user):
    waiting = DailyBars.objects.filter(history_complete=False).exclude(bars=[]).select_related('row').order_by('row__ticker')
    completed, failed = 0, []
    for daily in waiting[:limit]:
        try:
            daily.bars = _deepened(daily, user, pause)
        except ProviderNotConnected:
            raise
        except (ProviderError, Restated):
            logger.warning('Could not deepen the daily bars for %s', daily.row.ticker, exc_info=True)
            failed.append(daily.row.ticker)
            continue
        daily.history_complete = True
        daily.save(update_fields=['bars', 'history_complete', 'updated_at'])
        completed += 1
    return Result(completed, tuple(failed))
