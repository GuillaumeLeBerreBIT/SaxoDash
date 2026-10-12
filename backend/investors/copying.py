from collections import defaultdict
from dataclasses import dataclass
from datetime import timedelta

from django.db import transaction
from django.db.models import Min

from .models import CopyPerformance, Filing, Investor, PositionMove, PriceHistory, Security
from .prices import Series

HOLDINGS = 20
BENCHMARK_TICKER = 'SPY'
BENCHMARK_NAME = 'S&P 500'
MIN_PRICED_SHARE = 0.5
STALE_AFTER = timedelta(days=7)
SAMPLE_EVERY = 5
ANNUALISE_FROM_DAYS = 365
YEAR_DAYS = 365.25
START_LEVEL = 100.0


@dataclass
class Period:
    filed_on: object
    holdings: list
    stock_value: int


def periods(investor):
    filed = dict(
        Filing.objects.filter(investor=investor).values_list('quarter_end').annotate(first=Min('filed_on'))
    )
    rows = PositionMove.objects.filter(investor=investor, put_call='', shares__gt=0).values_list(
        'quarter_end', 'cusip', 'value',
    )
    by_quarter = defaultdict(list)
    for quarter_end, cusip, value in rows:
        by_quarter[quarter_end].append((cusip, value))
    tickers = dict(
        Security.objects.filter(cusip__in={cusip for held in by_quarter.values() for cusip, _ in held})
        .exclude(ticker__isnull=True).values_list('cusip', 'ticker')
    )
    known = set(tickers.values())
    found = []
    for quarter_end in sorted(by_quarter):
        merged = defaultdict(int)
        for cusip, value in by_quarter[quarter_end]:
            merged[tickers.get(cusip) or cusip] += value
        largest = sorted(merged.items(), key=lambda held: (-held[1], held[0]))[:HOLDINGS]
        holdings = [(name if name in known else None, value) for name, value in largest]
        found.append(Period(filed[quarter_end], holdings, sum(merged.values())))
    return found


def _bought(period, entry, prices):
    bought = []
    for ticker, value in period.holdings:
        series = prices.get(ticker)
        if not series:
            continue
        priced_on = series.day_at(entry)
        if priced_on is None or entry - priced_on > STALE_AFTER:
            continue
        bought.append((series, value, series.at(entry)))
    return bought


def _stints(periods, prices, benchmark):
    last_day = benchmark.days[-1]
    entries = [(benchmark.after(period.filed_on), period) for period in periods]
    entries = [(entry, period) for entry, period in entries if entry is not None]
    stints = []
    for index, (entry, period) in enumerate(entries):
        end = entries[index + 1][0] if index + 1 < len(entries) else last_day
        bought = _bought(period, entry, prices)
        copied = sum(value for _, value in period.holdings)
        priced = sum(value for _, value, _ in bought)
        invested = copied > 0 and priced / copied >= MIN_PRICED_SHARE
        stints.append((entry, end, bought if invested else None, priced / period.stock_value if period.stock_value else 0))
    while stints and stints[0][2] is None:
        stints.pop(0)
    return stints


def _annualised(level, days):
    if days < ANNUALISE_FROM_DAYS:
        return None
    return round(((level / START_LEVEL) ** (YEAR_DAYS / days) - 1) * 100, 2)


def _thinned(points, keep):
    last = len(points) - 1
    return [
        point for index, point in enumerate(points)
        if index % SAMPLE_EVERY == 0 or index == last or point[0] in keep
    ]


def measure(periods, prices, benchmark):
    if not benchmark:
        return None
    stints = _stints(periods, prices, benchmark)
    if not stints:
        return None
    since = stints[0][0]
    benchmark_start = benchmark.at(since)
    level = START_LEVEL
    points = [[since, level, START_LEVEL]]
    coverage = []
    for entry, end, bought, share in stints:
        base = level
        priced = sum(value for _, value, _ in bought) if bought else 0
        if bought:
            coverage.append(share)
        for day in benchmark.between(entry, end):
            if bought:
                level = base * sum(value / priced * series.at(day) / paid for series, value, paid in bought)
            points.append([day, level, benchmark.at(day) / benchmark_start * START_LEVEL])
    until = points[-1][0]
    if until == since:
        return None
    days = (until - since).days
    benchmark_level = points[-1][2]
    rebalances = {entry for entry, *_ in stints}
    return {
        'since': since,
        'until': until,
        'clone_return_pct': round(level - START_LEVEL, 2),
        'benchmark_return_pct': round(benchmark_level - START_LEVEL, 2),
        'clone_cagr_pct': _annualised(level, days),
        'benchmark_cagr_pct': _annualised(benchmark_level, days),
        'coverage_pct': round(sum(coverage) / len(coverage) * 100, 2),
        'periods': len(coverage),
        'skipped_periods': len(stints) - len(coverage),
        'series': [
            [day.isoformat(), round(clone, 2), round(market, 2)]
            for day, clone, market in _thinned(points, rebalances)
        ],
    }


def _series(tickers):
    stored = PriceHistory.objects.filter(ticker__in=tickers, status=PriceHistory.OK).values_list('ticker', 'closes')
    return {ticker: Series.from_rows(closes) for ticker, closes in stored}


@transaction.atomic
def rebuild(investor):
    found = periods(investor)
    wanted = {ticker for period in found for ticker, _ in period.holdings if ticker}
    prices = _series(wanted | {BENCHMARK_TICKER})
    measured = measure(found, prices, prices.get(BENCHMARK_TICKER) or Series([], []))
    if measured is None:
        CopyPerformance.objects.filter(investor=investor).delete()
        return False
    CopyPerformance.objects.update_or_create(investor=investor, defaults=measured)
    return True


def rebuild_all():
    return sum(rebuild(investor) for investor in Investor.objects.all())


def _edge(ours, market):
    return None if ours is None or market is None else round(ours - market, 2)


def payload(investor):
    method = {'benchmark': BENCHMARK_NAME, 'holdings': HOLDINGS}
    stored = CopyPerformance.objects.filter(investor=investor).first()
    if stored is None:
        return {'available': False, **method}
    return {
        'available': True,
        **method,
        'since': stored.since.isoformat(),
        'until': stored.until.isoformat(),
        'clone_return_pct': stored.clone_return_pct,
        'benchmark_return_pct': stored.benchmark_return_pct,
        'excess_return_pct': _edge(stored.clone_return_pct, stored.benchmark_return_pct),
        'clone_cagr_pct': stored.clone_cagr_pct,
        'benchmark_cagr_pct': stored.benchmark_cagr_pct,
        'excess_cagr_pct': _edge(stored.clone_cagr_pct, stored.benchmark_cagr_pct),
        'coverage_pct': stored.coverage_pct,
        'periods': stored.periods,
        'skipped_periods': stored.skipped_periods,
        'series': stored.series,
        'computed_at': stored.computed_at.isoformat(),
    }


def annualised_edges(investor_ids):
    rows = CopyPerformance.objects.filter(investor_id__in=investor_ids).values_list(
        'investor_id', 'clone_cagr_pct', 'benchmark_cagr_pct',
    )
    return {investor_id: _edge(ours, market) for investor_id, ours, market in rows}
