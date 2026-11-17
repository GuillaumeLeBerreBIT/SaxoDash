SPARK_POINTS = 52
SESSIONS_PER_WEEK = 5
YEAR_SESSIONS = 252
CLOSE = 4


def _closes(bars):
    return [bar[CLOSE] for bar in bars or [] if len(bar) > CLOSE and bar[CLOSE] is not None]


def from_bars(bars):
    closes = _closes(bars)
    if not closes:
        return [], None
    weekly = closes[::-SESSIONS_PER_WEEK][:SPARK_POINTS]
    return list(reversed(weekly)), max(closes[-YEAR_SESSIONS:])
