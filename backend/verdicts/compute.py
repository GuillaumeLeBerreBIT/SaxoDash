import logging
from typing import NamedTuple

from django.db import transaction
from django.utils import timezone

from research.models import ScreenerRow

from . import rules
from .models import StockVerdict, VerdictCall

logger = logging.getLogger(__name__)

NAME_MAX_LENGTH = StockVerdict._meta.get_field('name').max_length


class Result(NamedTuple):
    written: int
    failed: list


def _is_buy_grade(quality, valuation):
    return quality['grade'] == 'strong' and valuation['grade'] == 'cheap'


def _store(row, quality, valuation):
    StockVerdict.objects.update_or_create(
        ticker=row.ticker,
        defaults={
            'name': row.name[:NAME_MAX_LENGTH],
            'quality': quality['grade'],
            'valuation': valuation['grade'],
            'checks': quality['checks'],
            'current_pe': valuation['current_pe'],
            'cheap_below': valuation['cheap_below'],
            'expensive_above': valuation['expensive_above'],
            'last_close': row.last_close,
            'pct_vs_ma200': row.pct_vs_ma200,
            'as_of': row.fundamentals_at.date(),
        },
    )


def _track(row, quality, valuation, today):
    open_call = VerdictCall.objects.filter(ticker=row.ticker, ended_on__isnull=True).first()
    if not _is_buy_grade(quality, valuation):
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
        _store(row, quality, valuation)
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
