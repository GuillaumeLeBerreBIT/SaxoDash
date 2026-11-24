import statistics
from bisect import bisect_left, bisect_right
from datetime import date

from research.valuation import MIN_PE_WEEKS, PE_WINDOW_BARS, trailing_pe

from . import yardsticks_growth

GROWTH_CHEAP = 0.9
GROWTH_EXPENSIVE = 1.1
SPLIT_JUMP = 1.5
KEYS = ('pe_cheap', 'pe_expensive', 'growth_cheap', 'growth_expensive')


def _month_starts(dates):
    return [i for i, day in enumerate(dates) if i == 0 or day[:7] != dates[i - 1][:7]]


def _daily_pe(series, published_eps):
    closes = [(date.fromisoformat(day), close) for day, close in zip(series.dates, series.closes)]
    return [pe for _, pe in trailing_pe(closes, published_eps)]


def _week_ends(dates):
    weeks = [date.fromisoformat(day).isocalendar()[:2] for day in dates]
    return [i for i in range(len(dates)) if i == len(dates) - 1 or weeks[i] != weeks[i + 1]]


def _pe_range(daily, ends, index):
    lowest = max(0, index - PE_WINDOW_BARS + 1)
    window = ends[bisect_left(ends, lowest):bisect_left(ends, index)]
    values = [daily[i] for i in window] + [daily[index]]
    values = [pe for pe in values if pe is not None and pe > 0]
    if len(values) < MIN_PE_WEEKS:
        return None
    quartiles = statistics.quantiles(values, n=4, method='inclusive')
    return quartiles[0], quartiles[2]


def _growth_step(line, starts, day):
    found = bisect_right(starts, day)
    return line[found - 1] if found else None


def monthly_flags(series, published_eps):
    flags = {key: bytearray(len(series)) for key in KEYS}
    daily = _daily_pe(series, published_eps)
    ends = _week_ends(series.dates)
    line = yardsticks_growth.steps(published_eps)
    starts = [step['from'] for step in line]
    for index in _month_starts(series.dates):
        pe = daily[index]
        levels = _pe_range(daily, ends, index) if pe is not None and pe > 0 else None
        if levels is not None:
            flags['pe_cheap'][index] = pe <= levels[0]
            flags['pe_expensive'][index] = pe >= levels[1]
        step = _growth_step(line, starts, series.dates[index])
        if step is not None and step['price'] is not None:
            close = series.closes[index]
            flags['growth_cheap'][index] = close < GROWTH_CHEAP * step['price']
            flags['growth_expensive'][index] = close > GROWTH_EXPENSIVE * step['price'] and not step['capped']
    return flags


def split_suspects(series):
    closes = series.closes
    return sum(
        1 for before, after in zip(closes, closes[1:])
        if before > 0 and after > 0 and max(before / after, after / before) >= SPLIT_JUMP
    )
