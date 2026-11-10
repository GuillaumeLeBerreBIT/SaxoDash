import statistics
from bisect import bisect_right
from datetime import date
from django.utils import timezone

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
    today = today or timezone.localdate()
    try:
        cutoff = today.replace(year=today.year - years)
    except ValueError:
        cutoff = today.replace(year=today.year - years, day=28)
    values = [value for day, value in points if value is not None and day >= cutoff]
    return statistics.median(values) if values else None


VALUATION_RATIOS = ('pe_ttm', 'ps_ttm', 'pfcf_ttm', 'ev_ebitda_ttm')
NO_DAILY_PE_WARNING = 'Daily P/E needs Saxo closes, which are unavailable for this symbol.'
HOME_COUNTRY = 'US'


def _foreign_issuer_warning(ticker, country):
    return (
        f'Finnhub lists {ticker} as a {country} company: its EPS may be in another currency '
        'or per ordinary share rather than per ADR, so the daily P/E may be off.'
    )


def _points(rows):
    return [(date.fromisoformat(row['period']), row['v']) for row in rows or []]


def _weekly(points):
    last_of_week = {}
    for day, value in points:
        last_of_week[day.isocalendar()[:2]] = (day, value)
    return [[day.isoformat(), value] for day, value in sorted(last_of_week.values())]


def history(ticker, series, bars, today=None):
    warnings = []
    country = series.get('country')
    if country and country != HOME_COUNTRY:
        warnings.append(_foreign_issuer_warning(ticker, country))
    quarterly = series['quarterly']
    if bars is None:
        warnings.append(NO_DAILY_PE_WARNING)
        daily = []
    else:
        closes = [(date.fromisoformat(bar['date']), bar['close']) for bar in bars if bar.get('close') is not None]
        daily = trailing_pe(closes, _points(quarterly.get('eps')))
    medians = {name: median_since(_points(quarterly.get(name)), today=today) for name in VALUATION_RATIOS}
    medians['daily_pe'] = median_since(daily, today=today)
    latest = {name: quarterly[name][-1]['v'] if quarterly.get(name) else None for name in VALUATION_RATIOS}
    latest['daily_pe'] = daily[-1][1] if daily else None
    data = {
        'annual': series['annual'],
        'quarterly': quarterly,
        'daily_pe': _weekly(daily),
        'medians_5y': medians,
        'latest': latest,
    }
    return data, warnings


def current_pe(series_pe, metrics):
    metrics = metrics or {}
    pe = series_pe if series_pe is not None else metrics.get('pe_ratio')
    eps = metrics.get('eps_ttm')
    if pe is None or pe <= 0 or (eps is not None and eps <= 0):
        return None
    return pe
