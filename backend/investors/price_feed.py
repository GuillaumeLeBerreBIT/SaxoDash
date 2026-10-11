import logging
import time
from datetime import timedelta

from django.utils import timezone

from analytics.benchmarks import BENCHMARKS
from research import market, scan
from research.providers import ProviderNotConnected

from . import copying
from .models import Investor, PriceHistory

logger = logging.getLogger(__name__)

DAILY = 1440
BARS = 1200
PAUSE_SECONDS = 1.2
REFRESH_AFTER = timedelta(hours=20)
RETRY_AFTER = timedelta(days=7)
BENCHMARK_UIC = BENCHMARKS['sp500']['uic']
BENCHMARK_ASSET_TYPE = BENCHMARKS['sp500']['asset_type']


class NoBars(Exception):
    pass


def _wanted():
    current, ever = set(), set()
    for investor in Investor.objects.all():
        found = copying.periods(investor)
        for index, period in enumerate(found):
            tickers = {ticker for ticker, _ in period.holdings if ticker}
            ever |= tickers
            if index == len(found) - 1:
                current |= tickers
    return current, ever


def _is_due(row, refreshed_nightly, now):
    if row.checked_at is None:
        return True
    age = now - row.checked_at
    if row.status != PriceHistory.OK:
        return age >= RETRY_AFTER
    return row.ticker in refreshed_nightly and age >= REFRESH_AFTER


def _due(now):
    current, ever = _wanted()
    PriceHistory.objects.get_or_create(
        ticker=copying.BENCHMARK_TICKER, defaults={'uic': BENCHMARK_UIC, 'asset_type': BENCHMARK_ASSET_TYPE},
    )
    PriceHistory.objects.bulk_create([PriceHistory(ticker=ticker) for ticker in ever], ignore_conflicts=True)
    refreshed_nightly = current | {copying.BENCHMARK_TICKER}
    stored = PriceHistory.objects.filter(ticker__in=ever | {copying.BENCHMARK_TICKER})
    due = [row for row in stored if _is_due(row, refreshed_nightly, now)]
    return sorted(due, key=lambda row: (row.ticker != copying.BENCHMARK_TICKER, row.ticker))


def _fetch(row):
    if row.uic is None:
        found = scan.resolve(row.ticker)
        if found is None:
            row.status = PriceHistory.UNMATCHED
            return
        row.uic = found['uic']
        row.asset_type = found['asset_type']
    bars = market.chart(row.uic, row.asset_type, DAILY, BARS)
    if not bars:
        raise NoBars('Saxo returned no daily bars')
    row.closes = [[bar['date'], bar['close']] for bar in bars]
    row.status = PriceHistory.OK


def refresh(pause=time.sleep, now=None):
    now = now or timezone.now()
    fetched = 0
    for row in _due(now):
        row.error = ''
        try:
            _fetch(row)
        except ProviderNotConnected:
            raise
        except Exception as exc:
            logger.warning('Price history failed for %s', row.ticker, exc_info=True)
            row.status = PriceHistory.FAILED
            row.error = str(exc)[:200]
        row.checked_at = now
        row.save()
        fetched += row.status == PriceHistory.OK
        pause(PAUSE_SECONDS)
    return fetched
