from datetime import timedelta

MIN_HISTORY_DAYS = {
    'volatility': 30,
    'tracking_error': 30,
    'beta': 90,
    'expected_return': 365,
    'sharpe': 365,
    'sortino': 365,
    'information_ratio': 365,
    'jensen_alpha': 365,
}

RISK_METRICS = ('expected_return', 'volatility', 'sharpe', 'sortino')
BENCHMARK_METRICS = ('tracking_error', 'beta', 'information_ratio', 'jensen_alpha')

PROJECTION_MIN_HISTORY_DAYS = 365
MIN_COMPLETE_MONTHS = 2
MONTH_END_TOLERANCE_DAYS = 3
BENCHMARK_EDGE_TOLERANCE_DAYS = 4


def span_days(dates):
    if len(dates) < 2:
        return 0
    return (dates[-1] - dates[0]).days


def history_days(dated_values):
    return span_days([d for d, _ in dated_values])


def days_missing(have, need):
    return max(0, need - have)


def needs_days(days, names):
    return {name: days_missing(days, MIN_HISTORY_DAYS[name]) for name in names}


def gate(value, days, metric):
    return value if days >= MIN_HISTORY_DAYS[metric] else None


def inputs_reliable(days):
    return days >= PROJECTION_MIN_HISTORY_DAYS


def latest_month_is_complete(last_date):
    return (last_date + timedelta(days=MONTH_END_TOLERANCE_DAYS)).month != last_date.month
