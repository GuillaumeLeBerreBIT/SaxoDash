from bisect import bisect_left
from dataclasses import dataclass

from signals import definitions, evaluate
from signals.series import Series

from . import yardsticks

HORIZONS = (60, 120, 250)
GRADE_HORIZON = 250
GRADE_WORDS = {
    evaluate.SUPPORTED: 'held up', evaluate.NO_EDGE: 'no edge', evaluate.AGAINST: 'worked against',
    evaluate.TOO_FEW: 'too few cases', evaluate.UNPROVEN: 'cannot be judged fairly',
}
SIGNALS = (
    definitions.Signal('pe_cheap', 'PC', 'P/E range: cheap', 'P/E at or below its 25th percentile.',
                       definitions.STATE, buys_weakness=True),
    definitions.Signal('pe_expensive', 'PE', 'P/E range: expensive', 'P/E at or above its 75th percentile.',
                       definitions.STATE),
    definitions.Signal('growth_cheap', 'GC', 'Growth line: cheap', 'Price below 0.9x the growth line.',
                       definitions.STATE, buys_weakness=True),
    definitions.Signal('growth_expensive', 'GE', 'Growth line: expensive',
                       'Price above 1.1x an uncapped growth line.', definitions.STATE),
)
SPREADS = (('P/E range', 'pe_cheap', 'pe_expensive'), ('Growth line', 'growth_cheap', 'growth_expensive'))


@dataclass(frozen=True)
class Run:
    title: str
    scores: list
    stocks: int
    unflagged: int
    split_suspects: list


def _percent(value):
    return '–' if value is None else f'{value * 100:+.1f}%'


def _from(series, flags, since):
    if since is None:
        return series, flags
    first = max(0, bisect_left(series.dates, since) - evaluate.FIRST_BAR)
    trimmed = Series(*(column[first:] for column in (
        series.dates, series.opens, series.highs, series.lows, series.closes, series.volumes,
    )))
    kept = {key: bytearray(flag if day >= since else 0 for flag, day in zip(marked[first:], trimmed.dates))
            for key, marked in flags.items()}
    return trimmed, kept


def grade_run(title, series_by_ticker, eps_by_ticker, since=None, exclude=()):
    flags, kept, unflagged, suspects = {}, {}, 0, []
    for ticker, series in series_by_ticker.items():
        if ticker in exclude:
            continue
        eps = eps_by_ticker.get(ticker) or []
        kept[ticker], flags[ticker] = _from(series, yardsticks.monthly_flags(series, eps), since)
        unflagged += not any(any(marked) for marked in flags[ticker].values())
        if yardsticks.split_suspects(series):
            suspects.append(ticker)
    scores = evaluate.score(kept, flags, signals=SIGNALS, horizons=HORIZONS, grade_horizon=GRADE_HORIZON)
    return Run(title, scores, len(kept), unflagged, sorted(suspects))


def _score_rows(scores):
    labels = {signal.key: signal.label for signal in SIGNALS}
    rows = []
    for found in scores:
        span = f'{found.ci_low * 100:+.1f}% to {found.ci_high * 100:+.1f}%' if found.ci_low is not None else '–'
        rows.append(
            f'| {labels[found.key]} | {found.horizon} | {found.cases} | {found.stocks} | '
            f'{_percent(found.mean_excess)} | {span} | {_percent(found.first_half)} | '
            f'{_percent(found.second_half)} | {GRADE_WORDS[found.grade]} |'
        )
    return rows


def _spread_rows(scores):
    by_key = {(found.key, found.horizon): found.mean_excess for found in scores}
    rows = []
    for label, cheap, expensive in SPREADS:
        for horizon in HORIZONS:
            low, high = by_key.get((cheap, horizon)), by_key.get((expensive, horizon))
            gap = None if low is None or high is None else low - high
            rows.append(f'| {label} | {horizon} | {_percent(gap)} |')
    return rows


def render(run):
    lines = [
        f'### {run.title}', '',
        f'{run.stocks} stocks; {run.unflagged} never flagged (too little history or losses); '
        f'{len(run.split_suspects)} whose close moves 1.5x or more in one session (likely an unadjusted split).', '',
        '| Flag | Sessions ahead | Cases | Stocks | Mean vs average stock | 95% range | First half | Second half | Grade |',
        '|---|---|---|---|---|---|---|---|---|',
        *_score_rows(run.scores), '',
        '| Yardstick | Sessions ahead | Cheap minus expensive |',
        '|---|---|---|',
        *_spread_rows(run.scores), '',
    ]
    if run.split_suspects:
        lines += [f'Split suspects: {", ".join(run.split_suspects)}.', '']
    return '\n'.join(lines)
