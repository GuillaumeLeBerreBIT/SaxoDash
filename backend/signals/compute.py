import logging
from dataclasses import dataclass, field
from datetime import date

from django.db import transaction

from research.models import DailyBars, ScreenerRow

from . import context, definitions, evaluate
from .models import SignalScore, StockSignals
from .series import from_bars

logger = logging.getLogger(__name__)
BAR_FIELDS = 6


@dataclass(frozen=True)
class Listing:
    uic: int | None
    in_universe: bool


@dataclass
class Result:
    written: int = 0
    failed: list = field(default_factory=list)


def events_of(kind, flags, dates):
    if kind == definitions.EVENT:
        return [dates[i] for i, flag in enumerate(flags) if flag]
    return [dates[i] for i, flag in enumerate(flags) if flag and (i == 0 or not flags[i - 1])]


def runs_of(flags, dates):
    runs, start = [], None
    for i, flag in enumerate(flags):
        if flag and start is None:
            start = i
        if start is not None and (not flag or i == len(flags) - 1):
            runs.append([dates[start], dates[i if flag else i - 1]])
            start = None
    return runs


def _series(stored):
    if any(len(bar) != BAR_FIELDS for bar in stored.bars):
        raise ValueError('a stored bar does not have six fields')
    series = from_bars(stored.bars)
    for day in series.dates:
        date.fromisoformat(day)
    for column in (series.opens, series.highs, series.lows, series.closes):
        for value in column:
            float(value)
    return series


def _load(result):
    series_by_ticker, rows = {}, {}
    for stored in DailyBars.objects.select_related('row').iterator(chunk_size=20):
        ticker = stored.row.ticker
        try:
            series = _series(stored)
        except Exception:
            logger.error('Unreadable daily bars for %s', ticker, exc_info=True)
            result.failed.append(ticker)
            continue
        if len(series):
            series_by_ticker[ticker] = series
            rows[ticker] = Listing(stored.row.uic, stored.row.in_universe)
    return series_by_ticker, rows


def _write_scores(scores):
    for found in scores:
        SignalScore.objects.update_or_create(
            key=found.key, horizon=found.horizon,
            defaults={
                'cases': found.cases, 'stocks': found.stocks, 'mean_excess': found.mean_excess,
                'ci_low': found.ci_low, 'ci_high': found.ci_high, 'positive_share': found.positive_share,
                'first_half': found.first_half, 'second_half': found.second_half, 'grade': found.grade,
                'from_date': found.from_date, 'to_date': found.to_date,
            },
        )
    SignalScore.objects.exclude(key__in=definitions.BY_KEY).delete()


def _write_stock(ticker, row, series, flags, standing):
    StockSignals.objects.update_or_create(
        ticker=ticker,
        defaults={
            'uic': row.uic, 'as_of': series.dates[-1],
            'active': [signal.key for signal in definitions.SIGNALS if flags[signal.key][-1]],
            'events': {
                signal.key: events_of(signal.kind, flags[signal.key], series.dates)
                for signal in definitions.SIGNALS
            },
            'context': standing,
            'runs': {
                signal.key: runs_of(flags[signal.key], series.dates)
                for signal in definitions.SIGNALS if signal.kind != definitions.EVENT
            },
        },
    )


def run():
    result = Result()
    series_by_ticker, rows = _load(result)
    known = set(ScreenerRow.everything.values_list('ticker', flat=True))
    StockSignals.objects.exclude(ticker__in=known).delete()
    if not series_by_ticker:
        return result
    universe = {ticker: series for ticker, series in series_by_ticker.items() if rows[ticker].in_universe}
    flags = evaluate.flags_by_stock(series_by_ticker, universe=set(universe))
    with transaction.atomic():
        _write_scores(evaluate.score(universe, flags))
    standings = {ticker: context.standing(series) for ticker, series in series_by_ticker.items()}
    ranks = context.ranked(
        {ticker: context.latest_momentum(series) for ticker, series in series_by_ticker.items()}, set(universe),
    )
    for ticker, series in series_by_ticker.items():
        try:
            with transaction.atomic():
                _write_stock(
                    ticker, rows[ticker], series, flags[ticker],
                    {**standings[ticker], 'momentum_rank_pct': ranks[ticker]},
                )
            result.written += 1
        except Exception:
            logger.error('Could not store the signals for %s', ticker, exc_info=True)
            result.failed.append(ticker)
    return result
