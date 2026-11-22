import logging
import math
from datetime import date
from typing import NamedTuple

from django.db import transaction
from django.utils import timezone

from research.models import DailyBars, ScreenerRow

from . import price_line, rules
from .models import StockVerdict, VerdictCall

logger = logging.getLogger(__name__)

NAME_MAX_LENGTH = StockVerdict._meta.get_field('name').max_length


class Result(NamedTuple):
    written: int
    failed: list


def _is_buy_grade(quality):
    return quality['grade'] == 'strong'


def _price_line(row):
    if row.pk is None:
        return [], None
    stored =DailyBars.objects.filter(row=row).values_list('bars', flat=True).first()
    return price_line.from_bars(stored)


def quarterly_eps(row):
    parsed = {}
    for entry in (row.fundamentals_history or {}).get('quarterly_eps') or []:
        try:
            period, value = entry
            value = float(value)
            if not math.isfinite(value):
                continue
            parsed[date.fromisoformat(period)] = value
        except (TypeError, ValueError):
            continue
    return list(parsed.items())


def _pe_percentiles(row):
    levels = rules._levels(row.pe_history)
    if levels is None:
        return None, None
    return levels['p25'], levels['p75']


def _close_date(row):
    if row.last_close is None or not row.recent_closes:
        return None
    bar = row.recent_closes[-1]
    if isinstance(bar, dict) and bar.get('close') == row.last_close:
        try:
            return date.fromisoformat(bar['date'])
        except (KeyError, TypeError, ValueError):
            return None
    return None


def _store(row, quality, valuation, today):
    spark, high_1y = _price_line(row)
    pe_p25, pe_p75 = _pe_percentiles(row)
    StockVerdict.objects.update_or_create(
        ticker=row.ticker,
        defaults={
            'name': row.name[:NAME_MAX_LENGTH],
            'uic': row.uic,
            'quality': quality['grade'],
            'valuation': valuation['grade'],
            'checks': quality['checks'],
            'current_pe': valuation['current_pe'],
            'cheap_below': valuation['cheap_below'],
            'expensive_above': valuation['expensive_above'],
            'pe_p25': pe_p25,
            'pe_p75': pe_p75,
            'last_close': row.last_close,
            'close_date': _close_date(row),
            'pct_vs_ma200': row.pct_vs_ma200,
            'spark': spark,
            'high_1y': high_1y,
            'as_of': row.fundamentals_at.date(),
        },
    )


def _track(row, quality, valuation, today):
    open_call = VerdictCall.objects.filter(ticker=row.ticker, ended_on__isnull=True).first()
    if not _is_buy_grade(quality):
        if open_call is not None:
            open_call.ended_on = today
            open_call.save(update_fields=['ended_on'])
        return
    if open_call is None and row.last_close is not None:
        VerdictCall.objects.create(
            ticker=row.ticker, opened_on=today, entry_close=row.last_close,
            quality=quality['grade'], valuation=valuation['grade'], checks=quality['checks'],
        )


def _judge(row, today):
    quality = rules.quality(row)
    valuation = rules.valuation(row)
    with transaction.atomic():
        _store(row, quality, valuation, today)
        _track(row, quality, valuation, today)


def _retire(present_tickers, today):
    with transaction.atomic():
        StockVerdict.objects.exclude(ticker__in=present_tickers).delete()
        VerdictCall.objects.filter(ended_on__isnull=True).exclude(ticker__in=present_tickers).update(
            ended_on=today,
        )


def run(today=None):
    today = today or timezone.localdate()
    rows = ScreenerRow.everything.filter(status=ScreenerRow.OK, fundamentals_at__isnull=False)
    written = 0
    failed = []
    for row in rows:
        try:
            _judge(row, today)
        except Exception:
            logger.exception('Verdict for %s could not be computed', row.ticker)
            failed.append(row.ticker)
            continue
        written += 1
    _retire(list(ScreenerRow.everything.values_list('ticker', flat=True)), today)
    return Result(written, failed)
