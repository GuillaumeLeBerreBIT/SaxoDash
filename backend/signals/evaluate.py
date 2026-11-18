import math
import random
from array import array
from collections import defaultdict
from dataclasses import dataclass

from . import definitions

HORIZONS = (5, 20, 60)
GRADE_HORIZON = 60
MIN_BARS = 520
FIRST_BAR = 260
MIN_STOCKS_PER_DATE = 50
MIN_CASES = 300
MIN_RANKED_STOCKS = 8
BOOTSTRAP_ROUNDS = 400
BOOTSTRAP_SEED = 7
WORST_RETURN = -0.9
BEST_RETURN = 3.0
SUPPORTED, NO_EDGE, AGAINST, TOO_FEW = 'supported', 'no_edge', 'against', 'too_few'
UNPROVEN = 'unproven'


@dataclass(frozen=True)
class Score:
    key: str
    horizon: int
    cases: int
    stocks: int
    mean_excess: float | None
    ci_low: float | None
    ci_high: float | None
    positive_share: float | None
    first_half: float | None
    second_half: float | None
    grade: str
    from_date: str | None
    to_date: str | None


def grade(cases, ci_low, ci_high, first_half, second_half):
    if cases < MIN_CASES or ci_low is None or ci_high is None:
        return TOO_FEW
    if ci_low > 0 and first_half is not None and second_half is not None and first_half > 0 and second_half > 0:
        return SUPPORTED
    if ci_high < 0 and first_half is not None and second_half is not None and first_half < 0 and second_half < 0:
        return AGAINST
    return NO_EDGE


def _momentum_leaders(series_by_ticker, universe):
    values = {
        ticker: array('d', (math.nan if value is None else value for value in definitions.momentum(series)))
        for ticker, series in series_by_ticker.items()
    }
    by_date = defaultdict(lambda: array('d'))
    for ticker, series in series_by_ticker.items():
        if universe is not None and ticker not in universe:
            continue
        for i, value in enumerate(values[ticker]):
            if value == value:
                by_date[series.dates[i]].append(value)
    cutoffs = {}
    for day, found in by_date.items():
        leading = len(found) // 4
        if len(found) >= MIN_RANKED_STOCKS and leading:
            cutoffs[day] = sorted(found)[-leading]
    leaders = {}
    for ticker, series in series_by_ticker.items():
        marked = bytearray(len(series))
        for i, value in enumerate(values[ticker]):
            if value == value and value >= cutoffs.get(series.dates[i], math.inf):
                marked[i] = 1
        leaders[ticker] = marked
    return leaders


def flags_by_stock(series_by_ticker, universe=None):
    leaders = _momentum_leaders(series_by_ticker, universe)
    return {
        ticker: {
            **{key: bytearray(marked) for key, marked in definitions.detect(series).items()},
            'momentum_top': leaders[ticker],
        }
        for ticker, series in series_by_ticker.items()
    }


def _forward_returns(series, horizon):
    opens, closes = series.opens, series.closes
    count = len(closes)
    returns = array('d', [math.nan]) * count
    for i in range(FIRST_BAR, count - horizon):
        if opens[i + 1]:
            returns[i] = min(max(closes[i + horizon] / opens[i + 1] - 1, WORST_RETURN), BEST_RETURN)
    return returns


def _known(returns):
    return ((i, value) for i, value in enumerate(returns) if value == value)


def _interval(groups, seed):
    totals = list(groups.values())
    if not totals:
        return None, None
    generator = random.Random(seed)
    means = []
    for _ in range(BOOTSTRAP_ROUNDS):
        picked = generator.choices(totals, k=len(totals))
        cases = sum(count for _, count in picked)
        if cases:
            means.append(sum(total for total, _ in picked) / cases)
    if not means:
        return None, None
    means.sort()
    return means[int(0.025 * len(means))], means[min(len(means) - 1, int(0.975 * len(means)))]


def _mean(total, count):
    return total / count if count else None


def _score_horizon(eligible, flags, horizon):
    returns = {ticker: _forward_returns(series, horizon) for ticker, series in eligible.items()}
    date_totals = defaultdict(lambda: [0.0, 0])
    for ticker, series in eligible.items():
        for i, value in _known(returns[ticker]):
            entry = date_totals[series.dates[i]]
            entry[0] += value
            entry[1] += 1
    averages = {
        day: total / count for day, (total, count) in date_totals.items() if count >= MIN_STOCKS_PER_DATE
    }
    ordered = sorted(averages)
    middle = ordered[len(ordered) // 2] if ordered else None

    scores = {}
    for signal in definitions.SIGNALS:
        by_stock = defaultdict(lambda: [0.0, 0])
        by_month = defaultdict(lambda: [0.0, 0])
        halves = [[0.0, 0], [0.0, 0]]
        positives = 0
        first_day = last_day = None
        for ticker, series in eligible.items():
            marked = flags.get(ticker, {}).get(signal.key)
            if not marked:
                continue
            for i, value in _known(returns[ticker]):
                if not marked[i]:
                    continue
                day = series.dates[i]
                if day not in averages:
                    continue
                excess = value - averages[day]
                for entry in (by_stock[ticker], by_month[day[:7]], halves[0 if day < middle else 1]):
                    entry[0] += excess
                    entry[1] += 1
                positives += excess > 0
                first_day = day if first_day is None or day < first_day else first_day
                last_day = day if last_day is None or day > last_day else last_day
        cases = sum(count for _, count in by_stock.values())
        stock_low, stock_high = _interval(by_stock, BOOTSTRAP_SEED)
        month_low, month_high = _interval(by_month, BOOTSTRAP_SEED)
        lows = [value for value in (stock_low, month_low) if value is not None]
        highs = [value for value in (stock_high, month_high) if value is not None]
        scores[signal.key] = Score(
            key=signal.key, horizon=horizon, cases=cases, stocks=len(by_stock),
            mean_excess=_mean(sum(total for total, _ in by_stock.values()), cases),
            ci_low=min(lows) if lows else None, ci_high=max(highs) if highs else None,
            positive_share=_mean(positives, cases),
            first_half=_mean(*halves[0]), second_half=_mean(*halves[1]),
            grade=TOO_FEW, from_date=first_day, to_date=last_day,
        )
    return scores


def score(series_by_ticker, flags):
    eligible = {ticker: series for ticker, series in series_by_ticker.items() if len(series) >= MIN_BARS}
    by_horizon = {horizon: _score_horizon(eligible, flags, horizon) for horizon in HORIZONS}
    out = []
    for signal in definitions.SIGNALS:
        decider = by_horizon[GRADE_HORIZON][signal.key]
        decided = grade(decider.cases, decider.ci_low, decider.ci_high, decider.first_half, decider.second_half)
        if decided == SUPPORTED and signal.buys_weakness:
            decided = UNPROVEN
        for horizon in HORIZONS:
            found = by_horizon[horizon][signal.key]
            out.append(Score(**{**found.__dict__, 'grade': decided}))
    return out
