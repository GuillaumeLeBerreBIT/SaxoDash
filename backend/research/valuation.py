import statistics
from bisect import bisect_right
from datetime import date

QUARTERS_PER_YEAR = 4


def trailing_pe(closes, quarterly_eps):
    ordered = sorted(quarterly_eps, key=lambda point: point[0])
    ends = [period for period, _ in ordered]
    result = []
    for day, close in closes:
        known = bisect_right(ends, day)
        if known < QUARTERS_PER_YEAR:
            result.append((day, None))
            continue
        ttm = sum(value for _, value in ordered[known - QUARTERS_PER_YEAR:known])
        result.append((day, round(close / ttm, 2) if ttm > 0 else None))
    return result


def median_since(points, years=5, today=None):
    today = today or date.today()
    try:
        cutoff = today.replace(year=today.year - years)
    except ValueError:
        cutoff = today.replace(year=today.year - years, day=28)
    values = [value for day, value in points if value is not None and day >= cutoff]
    return statistics.median(values) if values else None
