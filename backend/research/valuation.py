import math
import statistics
from bisect import bisect_right
from datetime import date, timedelta
from django.utils import timezone

QUARTERS_PER_YEAR = 4
QUARTER_RELEASE_LAG = timedelta(days=45)
YEAR_END_RELEASE_LAG = timedelta(days=60)
YEAR_END_TOLERANCE_DAYS = 7
DAYS_PER_YEAR = 365.2425


def _is_year_end(period, year_ends):
    for end in year_ends:
        drift = (period - end).days % DAYS_PER_YEAR
        if min(drift, DAYS_PER_YEAR - drift) <= YEAR_END_TOLERANCE_DAYS:
            return True
    return False


def published_on(period, released=None, year_end=False):
    if released is not None:
        return max(released, period + timedelta(days=1))
    return period + (YEAR_END_RELEASE_LAG if year_end else QUARTER_RELEASE_LAG)


def published_eps(quarterly_eps, released=None, year_ends=()):
    released = released or {}
    return sorted(
        (published_on(period, released.get(period), _is_year_end(period, year_ends)), value)
        for period, value in quarterly_eps
    )


def _iso_dates(values):
    found = []
    for value in values:
        try:
            found.append(date.fromisoformat(value))
        except (TypeError, ValueError):
            continue
    return found


def _stored_points(entries):
    parsed = {}
    for entry in entries or []:
        try:
            period, value = entry
            value = float(value)
            if not math.isfinite(value):
                continue
            parsed[date.fromisoformat(period)] = value
        except (TypeError, ValueError):
            continue
    return list(parsed.items())


def stored_releases(fundamentals_history):
    found = {}
    for period, day in ((fundamentals_history or {}).get('eps_released') or {}).items():
        try:
            found[date.fromisoformat(period)] = date.fromisoformat(day)
        except (TypeError, ValueError):
            continue
    return found


def _year_ends(stored):
    return _iso_dates(row.get('period') for row in stored.get('annual') or [] if isinstance(row, dict))


def latest_quarter(fundamentals_history, today=None):
    stored = fundamentals_history or {}
    today = today or timezone.localdate()
    releases = stored_releases(stored)
    year_ends = _year_ends(stored)
    public = [
        period for period, _ in _stored_points(stored.get('quarterly_eps'))
        if published_on(period, releases.get(period), _is_year_end(period, year_ends)) <= today
    ]
    if not public:
        return None, None
    period = max(public)
    return period, releases.get(period)


def stored_eps(fundamentals_history):
    stored = fundamentals_history or {}
    return published_eps(_stored_points(stored.get('quarterly_eps')), stored_releases(stored), _year_ends(stored))


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
PE_WINDOW_BARS = 1200


def trailing_eps(days, quarterly_eps):
    ordered = sorted(quarterly_eps, key=lambda point: point[0])
    return [_latest_eps_ttm(ordered, day) for day in days]


def _latest_eps_ttm(ordered, last_day):
    known = bisect_right([period for period, _ in ordered], last_day)
    if known < QUARTERS_PER_YEAR:
        return None
    return sum(value for _, value in ordered[known - QUARTERS_PER_YEAR:known])


def _usual_samples(window):
    weekly = {}
    for day, pe in window:
        if pe is not None and pe > 0:
            weekly[day.isocalendar()[:2]] = pe
    return list(weekly.values())


def _quartile_levels(values):
    if len(values) < MIN_PE_WEEKS:
        return None
    quartiles = statistics.quantiles(values, n=4, method='inclusive')
    return quartiles[0], quartiles[2]


def usual_range_at(daily, index):
    window = daily[max(0, index - PE_WINDOW_BARS + 1):index + 1]
    return _quartile_levels(_usual_samples(window))


def usual_band(daily):
    band = []
    for index, (day, _) in enumerate(daily):
        levels = usual_range_at(daily, index)
        low, high = (None, None) if levels is None else (round(levels[0], 2), round(levels[1], 2))
        band.append([day.isoformat(), low, high])
    return band


def pe_percentiles(closes, quarterly_eps):
    points = [(day, close) for day, close in closes if close is not None]
    if not points:
        return None
    ordered = sorted(quarterly_eps, key=lambda point: point[0])
    eps_ttm = _latest_eps_ttm(ordered, points[-1][0])
    if eps_ttm is None or eps_ttm <= 0:
        return None
    daily = trailing_pe(points, ordered)
    values = _usual_samples(daily[-PE_WINDOW_BARS:])
    levels = _quartile_levels(values)
    if levels is None:
        return None
    return {
        'current': round(points[-1][1] / eps_ttm, 2),
        'p25': round(levels[0], 2),
        'p75': round(levels[1], 2),
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


def _annual_periods(annual):
    return _iso_dates(row.get('period') for rows in (annual or {}).values() for row in rows or [])


def series_eps(series, released=None):
    return published_eps(_points(series['quarterly'].get('eps')), released, _annual_periods(series.get('annual')))


def history(ticker, series, bars, today=None, released=None):
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
        daily = trailing_pe(closes, series_eps(series, released))
    medians = {name: median_since(_points(quarterly.get(name)), today=today) for name in VALUATION_RATIOS}
    medians['daily_pe'] = median_since(daily, today=today)
    latest = {name: quarterly[name][-1]['v'] if quarterly.get(name) else None for name in VALUATION_RATIOS}
    latest['daily_pe'] = daily[-1][1] if daily else None
    data = {
        'annual': series['annual'],
        'quarterly': quarterly,
        'daily_pe': _weekly(daily),
        'daily_pe_band': usual_band(daily),
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
