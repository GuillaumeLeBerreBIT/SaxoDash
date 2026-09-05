"""Portfolio risk statistics, computed from value series the caller supplies.

Benchmark-relative functions (beta, tracking_error, information_ratio,
jensen_alpha) take plain return lists - fetching and currency-converting a
benchmark's own series is benchmarks.py's job, not this module's. See
AGENTS.md for why a benchmark used to be left out entirely.
"""
import math
import statistics
from datetime import timedelta

TRADING_DAYS = 252
MIN_DAILY_POINTS = 2

# (label, trailing days, years to annualise over - None means "show as-is")
PERFORMANCE_PERIODS = [
    ('1 month', 30, None),
    ('3 months', 91, None),
    ('1 year', 365, None),
    ('3 years', 365 * 3, 3),
    ('5 years', 365 * 5, 5),
]


def daily_returns(values):
    """Simple period-over-period returns between consecutive values."""
    return [values[i] / values[i - 1] - 1 for i in range(1, len(values))]


def expected_annual_return(returns):
    if len(returns) < MIN_DAILY_POINTS:
        return None
    return statistics.mean(returns) * TRADING_DAYS * 100


def annualized_volatility(returns):
    if len(returns) < MIN_DAILY_POINTS:
        return None
    return statistics.stdev(returns) * math.sqrt(TRADING_DAYS) * 100


def sharpe_ratio(returns, risk_free_annual):
    if len(returns) < MIN_DAILY_POINTS:
        return None
    stdev = statistics.stdev(returns)
    if stdev == 0:
        return None
    mean_annual = statistics.mean(returns) * TRADING_DAYS
    return (mean_annual - risk_free_annual) / (stdev * math.sqrt(TRADING_DAYS))


def sortino_ratio(returns, risk_free_annual):
    if len(returns) < MIN_DAILY_POINTS:
        return None
    downside = [r for r in returns if r < 0]
    if not downside:
        return None
    # Denominator over all periods, not just downside ones - a rare bad period
    # among many good ones should read as low downside risk, not high.
    downside_dev = math.sqrt(sum(r ** 2 for r in downside) / len(returns))
    mean_annual = statistics.mean(returns) * TRADING_DAYS
    return (mean_annual - risk_free_annual) / (downside_dev * math.sqrt(TRADING_DAYS))


def drawdown_series(values):
    """Decline from the running peak, as a percentage, one entry per value."""
    series = []
    peak = None
    for value in values:
        peak = value if peak is None else max(peak, value)
        series.append((value / peak - 1) * 100 if peak else 0.0)
    return series


def monthly_returns(dated_values):
    """One pct change per calendar-month boundary, using each month's last value."""
    month_end = {}
    for d, value in dated_values:
        month_end[(d.year, d.month)] = value  # dated_values is date-ascending

    months = sorted(month_end)
    result = []
    for previous, current in zip(months, months[1:]):
        prior_value = month_end[previous]
        year, month = current
        result.append({
            'year': year,
            'month': month,
            'pct': (month_end[current] / prior_value - 1) * 100,
        })
    return result


def best_worst_month(monthly):
    if not monthly:
        return None, None
    return max(monthly, key=lambda m: m['pct']), min(monthly, key=lambda m: m['pct'])


def positive_months_pct(monthly):
    if not monthly:
        return None
    return len([m for m in monthly if m['pct'] > 0]) / len(monthly) * 100


def beta(port_returns, bench_returns):
    if len(bench_returns) < MIN_DAILY_POINTS:
        return None
    bench_variance = statistics.variance(bench_returns)
    if bench_variance == 0:
        return None
    port_mean = statistics.mean(port_returns)
    bench_mean = statistics.mean(bench_returns)
    covariance = sum(
        (p - port_mean) * (b - bench_mean) for p, b in zip(port_returns, bench_returns)
    ) / (len(port_returns) - 1)
    return covariance / bench_variance


def tracking_error(port_returns, bench_returns):
    if len(port_returns) < MIN_DAILY_POINTS:
        return None
    active = [p - b for p, b in zip(port_returns, bench_returns)]
    return statistics.stdev(active) * math.sqrt(TRADING_DAYS) * 100


def information_ratio(port_expected_return, bench_expected_return, tracking_error_value):
    if not tracking_error_value:
        return None
    return (port_expected_return - bench_expected_return) / tracking_error_value


def jensen_alpha(port_expected_return, bench_expected_return, beta_value, risk_free_annual):
    if beta_value is None:
        return None
    risk_free_pct = risk_free_annual * 100
    return port_expected_return - (risk_free_pct + beta_value * (bench_expected_return - risk_free_pct))


def _aligned_values(dated_values_a, dated_values_b):
    """Two date-ascending series -> same-length value lists over their common dates."""
    by_date_a = dict(dated_values_a)
    by_date_b = dict(dated_values_b)
    common_dates = sorted(set(by_date_a) & set(by_date_b))
    return [float(by_date_a[d]) for d in common_dates], [float(by_date_b[d]) for d in common_dates]


def benchmark_summary(port_dated_values, bench_dated_values, risk_free_annual):
    """Beta/tracking-error/information-ratio/Jensen-alpha against one benchmark.

    Aligned on dates present in both series - a portfolio snapshot with no
    matching benchmark bar (or vice versa) is excluded rather than guessed at.
    """
    port_values, bench_values = _aligned_values(port_dated_values, bench_dated_values)
    if len(port_values) < MIN_DAILY_POINTS:
        return {
            'has_data': False,
            'expected_return': None,
            'beta': None,
            'tracking_error': None,
            'information_ratio': None,
            'jensen_alpha': None,
        }

    port_returns = daily_returns(port_values)
    bench_returns = daily_returns(bench_values)
    port_expected = expected_annual_return(port_returns)
    bench_expected = expected_annual_return(bench_returns)
    beta_value = beta(port_returns, bench_returns)
    te = tracking_error(port_returns, bench_returns)

    return {
        'has_data': True,
        'expected_return': bench_expected,
        'beta': beta_value,
        'tracking_error': te,
        'information_ratio': information_ratio(port_expected, bench_expected, te),
        'jensen_alpha': jensen_alpha(port_expected, bench_expected, beta_value, risk_free_annual),
    }


def period_return(dated_values, days):
    """Compound % change over the trailing `days` calendar days, or None."""
    if len(dated_values) < MIN_DAILY_POINTS:
        return None
    end_date, end_value = dated_values[-1]
    cutoff = end_date - timedelta(days=days)
    window = [(d, v) for d, v in dated_values if d >= cutoff]
    if len(window) < MIN_DAILY_POINTS:
        return None
    return (float(end_value) / float(window[0][1]) - 1) * 100


def ytd_return(dated_values):
    if not dated_values:
        return None
    year = dated_values[-1][0].year
    window = [(d, v) for d, v in dated_values if d.year == year]
    if len(window) < MIN_DAILY_POINTS:
        return None
    return (float(window[-1][1]) / float(window[0][1]) - 1) * 100


def since_inception_return(dated_values):
    if len(dated_values) < MIN_DAILY_POINTS:
        return None
    return (float(dated_values[-1][1]) / float(dated_values[0][1]) - 1) * 100


def annualize(total_pct, years):
    if total_pct is None:
        return None
    return ((1 + total_pct / 100) ** (1 / years) - 1) * 100


def calendar_year_returns(port_dated_values, bench_dated_values):
    """One row per calendar year either series has data for.

    The latest year is marked partial - it's presumptively still in
    progress relative to the data on hand, not a claim about the calendar.
    """
    def by_year(dated_values):
        buckets = {}
        for d, v in dated_values:
            buckets.setdefault(d.year, []).append((d, v))
        return buckets

    def year_pct(rows):
        if len(rows) < MIN_DAILY_POINTS:
            return None
        return (float(rows[-1][1]) / float(rows[0][1]) - 1) * 100

    port_years = by_year(port_dated_values)
    bench_years = by_year(bench_dated_values)
    latest_year = port_dated_values[-1][0].year if port_dated_values else None

    return [
        {
            'year': year,
            'portfolio_pct': year_pct(port_years.get(year, [])),
            'benchmark_pct': year_pct(bench_years.get(year, [])),
            'partial': year == latest_year,
        }
        for year in sorted(set(port_years) | set(bench_years))
    ]


def performance_summary(port_dated_values, bench_dated_values):
    """Portfolio vs. benchmark returns over several trailing windows.

    Each side computes its own period return independently - unlike beta or
    tracking error, a period total doesn't need day-by-day alignment, just
    enough points inside its own window.
    """
    def row(label, port_pct, bench_pct, annualised=False):
        alpha = None if port_pct is None or bench_pct is None else port_pct - bench_pct
        return {
            'label': label, 'portfolio_pct': port_pct, 'benchmark_pct': bench_pct,
            'alpha_pct': alpha, 'annualised': annualised,
        }

    rows = []
    for label, days, years in PERFORMANCE_PERIODS:
        port_total = period_return(port_dated_values, days)
        bench_total = period_return(bench_dated_values, days)
        if years:
            rows.append(row(
                f'{label} (ann.)', annualize(port_total, years), annualize(bench_total, years),
                annualised=True,
            ))
        else:
            rows.append(row(label, port_total, bench_total))

    rows.insert(2, row('Year to date', ytd_return(port_dated_values), ytd_return(bench_dated_values)))
    rows.append(row(
        'Since inception',
        since_inception_return(port_dated_values), since_inception_return(bench_dated_values),
    ))

    return {
        'periods': rows,
        'calendar_years': calendar_year_returns(port_dated_values, bench_dated_values),
    }


def risk_summary(dated_values, risk_free_annual):
    """The benchmark-free Risk tab, computed from a date-ascending value series."""
    if len(dated_values) < MIN_DAILY_POINTS:
        return {
            'has_data': False,
            'risk_free_annual': risk_free_annual,
            'expected_return': None,
            'volatility': None,
            'sharpe': None,
            'sortino': None,
            'max_drawdown': None,
            'current_drawdown': None,
            'positive_months_pct': None,
            'best_month': None,
            'worst_month': None,
            'drawdown_series': [],
            'monthly_returns': [],
        }

    dates = [d for d, _ in dated_values]
    values = [float(v) for _, v in dated_values]
    returns = daily_returns(values)
    dd = drawdown_series(values)
    monthly = monthly_returns(dated_values)
    best, worst = best_worst_month(monthly)

    return {
        'has_data': True,
        'risk_free_annual': risk_free_annual,
        'expected_return': expected_annual_return(returns),
        'volatility': annualized_volatility(returns),
        'sharpe': sharpe_ratio(returns, risk_free_annual),
        'sortino': sortino_ratio(returns, risk_free_annual),
        'max_drawdown': min(dd),
        'current_drawdown': dd[-1],
        'positive_months_pct': positive_months_pct(monthly),
        'best_month': best,
        'worst_month': worst,
        'drawdown_series': [{'date': d.isoformat(), 'dd': v} for d, v in zip(dates, dd)],
        'monthly_returns': monthly,
    }
