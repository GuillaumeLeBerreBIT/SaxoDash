"""Portfolio risk statistics, computed from the portfolio's own value series.

No benchmark input anywhere here on purpose: beta, tracking error, information
ratio and Jensen alpha all need an index return series the app does not have
yet, so they are left out rather than faked against nothing. See AGENTS.md.
"""
import math
import statistics

TRADING_DAYS = 252
MIN_DAILY_POINTS = 2


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
