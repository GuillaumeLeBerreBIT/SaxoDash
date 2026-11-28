from bisect import bisect_right
from datetime import date

from research.valuation import trailing_pe, usual_range_at

from . import yardsticks_growth

GROWTH_CHEAP = 0.9
GROWTH_EXPENSIVE = 1.1
SPLIT_JUMP = 1.5
KEYS = ('pe_cheap', 'pe_expensive', 'growth_cheap', 'growth_expensive')


def _month_starts(dates):
    return [i for i, day in enumerate(dates) if i == 0 or day[:7] != dates[i - 1][:7]]


def _daily_pe(series, published_eps):
    closes = [(date.fromisoformat(day), close) for day, close in zip(series.dates, series.closes)]
    return trailing_pe(closes, published_eps)


def _growth_step(line, starts, day):
    found = bisect_right(starts, day)
    return line[found - 1] if found else None


def monthly_flags(series, published_eps):
    flags = {key: bytearray(len(series)) for key in KEYS}
    daily = _daily_pe(series, published_eps)
    line = yardsticks_growth.steps(published_eps)
    starts = [step['from'] for step in line]
    for index in _month_starts(series.dates):
        pe = daily[index][1]
        levels = usual_range_at(daily, index) if pe is not None and pe > 0 else None
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
