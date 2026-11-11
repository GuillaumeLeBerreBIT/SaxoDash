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


MIN_PE_WEEKS = 104


def _latest_eps_ttm(ordered, last_day):
    known = bisect_right([period for period, _ in ordered], last_day)
    if known < QUARTERS_PER_YEAR:
        return None
    return sum(value for _, value in ordered[known - QUARTERS_PER_YEAR:known])


def pe_percentiles(closes, quarterly_eps):
    points = [(day, close) for day, close in closes if close is not None]
    if not points:
        return None
    ordered = sorted(quarterly_eps, key=lambda point: point[0])
    eps_ttm = _latest_eps_ttm(ordered, points[-1][0])
    if eps_ttm is None or eps_ttm <= 0:
        return None
    weekly = {}
    for day, pe in trailing_pe(points, ordered):
        weekly[day.isocalendar()[:2]] = pe
    values = [pe for _, pe in sorted(weekly.items()) if pe is not None and pe > 0]
    if len(values) < MIN_PE_WEEKS:
        return None
    quartiles = statistics.quantiles(values, n=4, method='inclusive')
    return {
        'current': round(points[-1][1] / eps_ttm, 2),
        'p25': round(quartiles[0], 2),
        'p75': round(quartiles[2], 2),
        'eps_ttm': round(eps_ttm, 2),
        'weeks': len(values),
    }


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
