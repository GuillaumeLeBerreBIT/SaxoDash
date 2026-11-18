from datetime import timedelta
from statistics import median

REPORT_LAG_DAYS = 35
ONE_OFF_HIGH = 2.5
ONE_OFF_LOW = 0.4
GROWTH_YEARS = 3
FAIR_PE_FLOOR = 15
FAIR_PE_CAP = 30


def _adjusted(values):
    adjusted = []
    for index, value in enumerate(values):
        if index >= 4:
            middle = median(values[index - 4:index])
            if middle > 0 and (value > ONE_OFF_HIGH * middle or value < ONE_OFF_LOW * middle):
                value = middle
        adjusted.append(value)
    return adjusted


def _ttm_points(quarterly_eps):
    ordered = sorted(quarterly_eps, key=lambda quarter: quarter[0])
    adjusted = _adjusted([value for _, value in ordered])
    return [
        (ordered[index][0] + timedelta(days=REPORT_LAG_DAYS), sum(adjusted[index - 3:index + 1]))
        for index in range(3, len(ordered))
    ]


def _line_end(known):
    return {'from': known.isoformat(), 'price': None, 'pe': None, 'growth': None, 'eps_ttm': None, 'capped': False}


def steps(quarterly_eps):
    points = _ttm_points(quarterly_eps)
    result = []
    lookback = GROWTH_YEARS * 4
    for index, (known, ttm) in enumerate(points):
        if index < lookback:
            continue
        earlier = points[index - lookback][1]
        if ttm <= 0 or earlier <= 0:
            if result and result[-1]['price'] is not None:
                result.append(_line_end(known))
            continue
        growth = ((ttm / earlier) ** (1 / GROWTH_YEARS) - 1) * 100
        pe = min(FAIR_PE_CAP, max(FAIR_PE_FLOOR, growth))
        result.append({
            'from': known.isoformat(),
            'price': round(round(pe, 2) * round(ttm, 2), 2),
            'pe': round(pe, 2),
            'growth': round(growth, 1),
            'eps_ttm': round(ttm, 2),
            'capped': growth > FAIR_PE_CAP,
        })
    return result
