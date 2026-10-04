import logging
import time
from datetime import date, timedelta

from django.db import transaction
from django.utils import timezone

from . import finnhub, market, scan_progress, technicals
from .models import ScreenerRow
from .providers import ProviderNotConnected, ProviderUnavailable
from .universe import UNIVERSE_CSV, load_universe

logger = logging.getLogger(__name__)

SCAN_TASK = 'scan_universe'
DAILY_HORIZON = 1440
CHART_BARS = 260
PAUSE_SECONDS = 1.2
US_EXCHANGES = ('NASDAQ', 'NYSE')
EARNINGS_WINDOW_DAYS = 14


def resolve(ticker):
    matches = [
        found for found in market.search(ticker, 'Stock')
        if found['symbol'].upper() == ticker and found.get('currency') == 'USD'
    ]
    preferred = [found for found in matches if found.get('exchange') in US_EXCHANGES]
    return (preferred or matches or [None])[0]


def _refresh_technicals(row):
    bars = market.chart(row.uic, row.asset_type, DAILY_HORIZON, CHART_BARS)
    for field, value in technicals.technical_fields(bars).items():
        setattr(row, field, value)
    row.technicals_at = timezone.now()


def _refresh_fundamentals(row):
    shaped = finnhub.to_screener_fundamentals(finnhub.get_basic_financials(row.ticker))
    for field, value in shaped.items():
        setattr(row, field, value)
    row.fundamentals_at = timezone.now()


def _resolved(row):
    if row.uic is not None:
        return True
    found = resolve(row.ticker)
    if found is None:
        return False
    row.uic = found['uic']
    row.asset_type = found['asset_type']
    return True


def _mark_failed(row, exc):
    logger.warning('Scan failed for %s', row.ticker, exc_info=True)
    row.status = ScreenerRow.FAILED
    row.error = str(exc)[:200]
    try:
        row.save()
    except Exception:
        logger.error('Could not record the failure for %s', row.ticker, exc_info=True)


def scan_row(row, *, with_fundamentals):
    try:
        if not _resolved(row):
            row.status = ScreenerRow.UNMATCHED
            row.error = ''
            row.save()
            return with_fundamentals
        _refresh_technicals(row)
    except ProviderNotConnected:
        raise
    except Exception as exc:
        _mark_failed(row, exc)
        return with_fundamentals

    row.status = ScreenerRow.OK
    row.error = ''
    if with_fundamentals:
        try:
            _refresh_fundamentals(row)
        except finnhub.FinnhubNotConfigured:
            with_fundamentals = False
        except ProviderUnavailable as exc:
            row.error = str(exc)[:200]
        except ProviderNotConnected:
            raise
        except Exception as exc:
            logger.warning('Fundamentals failed for %s', row.ticker, exc_info=True)
            row.error = str(exc)[:200]
    try:
        row.save()
    except Exception as exc:
        _mark_failed(row, exc)
    return with_fundamentals


def _earliest_dates(events, today, until):
    earliest = {}
    for event in events:
        when = date.fromisoformat(event['date'])
        if today <= when <= until and (event['symbol'] not in earliest or when < earliest[event['symbol']]):
            earliest[event['symbol']] = when
    return earliest


def refresh_earnings_dates(today):
    until = today + timedelta(days=EARNINGS_WINDOW_DAYS)
    try:
        events = finnhub.get_earnings_calendar(None, today.isoformat(), until.isoformat()).get('earningsCalendar', [])
        earliest = _earliest_dates(events, today, until)
    except Exception:
        logger.warning('Earnings calendar refresh failed; keeping stored dates', exc_info=True)
        return
    with transaction.atomic():
        ScreenerRow.objects.exclude(ticker__in=earliest).update(next_earnings_date=None)
        for ticker, when in earliest.items():
            ScreenerRow.objects.filter(ticker=ticker).update(next_earnings_date=when)


def scan_universe(pause=time.sleep, universe=UNIVERSE_CSV):
    load_universe(universe)
    rows = list(ScreenerRow.objects.order_by('ticker'))
    started_at = timezone.now().isoformat()
    with_fundamentals = True
    try:
        for done, row in enumerate(rows, start=1):
            with_fundamentals = scan_row(row, with_fundamentals=with_fundamentals)
            scan_progress.report(done, len(rows), started_at)
            pause(PAUSE_SECONDS)
        refresh_earnings_dates(timezone.localdate())
    finally:
        scan_progress.clear()
    return ScreenerRow.objects.filter(status=ScreenerRow.OK).count()
