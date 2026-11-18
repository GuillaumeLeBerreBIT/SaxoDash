from research.valuation import QUARTERS_PER_YEAR

KEEP_YEARS = 10


def _years_before(day, years):
    try:
        return day.replace(year=day.year - years)
    except ValueError:
        return day.replace(year=day.year - years, day=28)


def steps(quarterly_eps, today):
    ordered = sorted((period, value) for period, value in quarterly_eps if period <= today)
    line = []
    for index in range(QUARTERS_PER_YEAR - 1, len(ordered)):
        ttm = sum(value for _, value in ordered[index - QUARTERS_PER_YEAR + 1:index + 1])
        eps = round(ttm, 2) if ttm > 0 else None
        if line and line[-1]['eps_ttm'] == eps:
            continue
        line.append({'from': ordered[index][0].isoformat(), 'eps_ttm': eps})
    start = _years_before(today, KEEP_YEARS).isoformat()
    first = max((index for index, step in enumerate(line) if step['from'] <= start), default=0)
    return line[first:]
