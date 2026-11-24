SPARK_POINTS = 52
SESSIONS_PER_WEEK = 5
YEAR_SESSIONS = 252
HIGH = 2
CLOSE = 4


def _closes(bars):
    return [bar[CLOSE] for bar in bars or [] if len(bar) > CLOSE and bar[CLOSE] is not None]


def _year_high(bars):
    year = (bars or [])[-YEAR_SESSIONS:]
    highs = [bar[HIGH] for bar in year if len(bar) > HIGH and bar[HIGH] is not None]
    if len(year) < YEAR_SESSIONS or not highs:
        return None
    return max(highs)


def from_bars(bars):
    closes = _closes(bars)
    if not closes:
        return [], None
    weekly = closes[::-SESSIONS_PER_WEEK][:SPARK_POINTS]
    return list(reversed(weekly)), _year_high(bars)
