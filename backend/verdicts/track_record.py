from dataclasses import dataclass
from datetime import datetime, time

from django.utils import timezone

from advisor import scoring
from investors.copying import BENCHMARK_NAME, BENCHMARK_TICKER, price_series
from investors.prices import Series

from research.models import ScreenerRow

from . import visibility
from .models import VerdictCall


@dataclass(frozen=True)
class ScoredCall:
    ticker: str
    recorded_at: datetime
    action: str = 'buy_new'
    closed_at: datetime | None = None
    buy_range: dict | None = None
    conviction: str | None = None
    decision: str = 'pending'


def _as_scored(call):
    midnight = timezone.make_aware(datetime.combine(call.opened_on, time.min))
    return ScoredCall(ticker=call.ticker, recorded_at=midnight)


def _iso(day):
    return day.isoformat() if day else None


def _checkpoint(measure):
    return None if measure is None else {**measure, 'day': _iso(measure['day'])}


def _row(call, result):
    return {
        'ticker': call.ticker,
        'opened_on': _iso(call.opened_on),
        'ended_on': _iso(call.ended_on),
        'entry_close': call.entry_close,
        'checkpoints': {name: _checkpoint(measure) for name, measure in result['checkpoints'].items()},
        'latest': _checkpoint(result['latest']),
    }


def _visible_calls(user):
    calls = VerdictCall.objects.order_by('opened_on', 'ticker')
    if user is None:
        return list(calls)
    allowed = set(ScreenerRow.objects.values_list('ticker', flat=True)) | visibility.own_tickers(user)
    return [call for call in calls if call.ticker in allowed]


def report(today=None, user=None):
    today = today or timezone.localdate()
    calls = _visible_calls(user)
    prices = price_series({call.ticker for call in calls} | {BENCHMARK_TICKER})
    benchmark = prices.get(BENCHMARK_TICKER) or Series([], [])
    scored = [(call, scoring.score(_as_scored(call), prices, benchmark, today)) for call in calls]
    summary = scoring.summary([(_as_scored(call), result) for call, result in scored])
    return {
        'benchmark': BENCHMARK_NAME,
        'calls': [_row(call, result) for call, result in scored],
        'summary': {'overall': summary['overall']},
        'first_call_on': _iso(calls[0].opened_on) if calls else None,
    }


def wanted_tickers():
    current = set(VerdictCall.objects.filter(ended_on__isnull=True).values_list('ticker', flat=True))
    ever = set(VerdictCall.objects.values_list('ticker', flat=True))
    return current, ever
