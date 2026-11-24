from dataclasses import dataclass
from statistics import median
from typing import Callable, Optional

THRESHOLDS = {'roe': 15, 'roic': 10, 'net_margin': 10, 'revenue_growth': 5, 'debt_to_equity': 1.0}
FINANCIAL_SECTORS = {'Financials', 'Real Estate', 'Banking', 'Insurance', 'Financial Services'}
MIN_ANSWERED = 4
STRONG_SHARE = 0.8
MOST_UNKNOWN_FOR_STRONG = 1
WEAK_SHARE = 0.5
LATEST_MARGIN_FLOOR = 0.5
CASH_CONVERSION_FLOOR = 80


@dataclass(frozen=True)
class Check:
    key: str
    label: str
    threshold: str
    judge: Callable


def _annual(row, key):
    history = getattr(row, 'fundamentals_history', None) or {}
    return [year[key] for year in history.get('annual') or [] if year.get(key) is not None]


def _outcome(value, passed):
    if value is None:
        return 'unknown', None
    return ('pass' if passed else 'fail'), value


def _negative_equity(row):
    return row.debt_to_equity is not None and row.debt_to_equity < 0


def _median_at_least(key, floor):
    def judge(row):
        if key == 'roe' and _negative_equity(row):
            return 'unknown', None
        values = _annual(row, key)
        if not values:
            return 'unknown', None
        middle = median(values)
        return _outcome(middle, middle >= floor)

    return judge


def _margins(row):
    values = _annual(row, 'net_margin')
    if not values:
        return 'unknown', None
    middle = median(values)
    passed = middle >= THRESHOLDS['net_margin'] and values[-1] >= middle * LATEST_MARGIN_FLOOR
    return _outcome(middle, passed)


def _earnings_growth(row):
    growth = row.eps_growth_5y
    latest = _annual(row, 'eps')
    if growth is None or not latest:
        return 'unknown', None
    return _outcome(growth, growth > 0 and latest[-1] > 0)


def _revenue_growth(row):
    growth = row.revenue_growth_5y
    if growth is None:
        return 'unknown', None
    return _outcome(growth, growth >= THRESHOLDS['revenue_growth'])


def _debt(row):
    if not row.sector or row.sector in FINANCIAL_SECTORS or row.debt_to_equity is None:
        return 'unknown', None
    if _negative_equity(row):
        return 'fail', row.debt_to_equity
    return _outcome(row.debt_to_equity, row.debt_to_equity <= THRESHOLDS['debt_to_equity'])


def _cash(row):
    if not row.sector or row.sector in FINANCIAL_SECTORS:
        return 'unknown', None
    history = getattr(row, 'fundamentals_history', None) or {}
    shares = [
        year['fcf_margin'] / year['net_margin'] * 100
        for year in history.get('annual') or []
        if year.get('fcf_margin') is not None and (year.get('net_margin') or 0) > 0
    ]
    if not shares:
        return 'unknown', None
    middle = round(median(shares), 1)
    return _outcome(middle, middle >= CASH_CONVERSION_FLOOR)


CHECKS = (
    Check('roe', 'Return on equity', '15%', _median_at_least('roe', THRESHOLDS['roe'])),
    Check('roic', 'Return on capital', '10%', _median_at_least('roic', THRESHOLDS['roic'])),
    Check('margins', 'Margins', '10%', _margins),
    Check('earnings_growth', 'Earnings growth', 'above 0', _earnings_growth),
    Check('revenue_growth', 'Revenue growth', '5% a year', _revenue_growth),
    Check('debt', 'Debt', 'at most 1.0', _debt),
    Check('cash', 'Cash behind the profit', '80% of profit', _cash),
)


def grade(checks):
    passes = sum(1 for check in checks if check['status'] == 'pass')
    answered = passes + sum(1 for check in checks if check['status'] == 'fail')
    if answered < MIN_ANSWERED:
        return 'unknown'
    share = passes / answered
    if share >= STRONG_SHARE:
        unknowns = len(checks) - answered
        return 'strong' if unknowns <= MOST_UNKNOWN_FOR_STRONG else 'incomplete'
    if share < WEAK_SHARE:
        return 'weak'
    return 'mixed'


def quality(row):
    checks = []
    for check in CHECKS:
        status, value = check.judge(row)
        checks.append({
            'key': check.key, 'label': check.label, 'status': status,
            'value': value, 'threshold': check.threshold,
        })
    return {'grade': grade(checks), 'checks': checks}


def _levels(history) -> Optional[dict]:
    keys = ('current', 'p25', 'p75', 'eps_ttm')
    if not history or any(history.get(key) is None for key in keys):
        return None
    if any(history[key] <= 0 for key in keys):
        return None
    return history


def price_zone(close, cheap_below, expensive_above):
    if not close or close <= 0 or cheap_below is None or expensive_above is None:
        return 'not_judged'
    if not 0 < cheap_below < expensive_above:
        return 'not_judged'
    if close <= cheap_below:
        return 'cheap'
    if close >= expensive_above:
        return 'expensive'
    return 'fair'


def valuation(row):
    history = _levels(getattr(row, 'pe_history', None))
    if history is None:
        return {'grade': 'not_judged', 'current_pe': None, 'cheap_below': None, 'expensive_above': None}
    eps = history['eps_ttm']
    cheap_below = round(eps * history['p25'], 2)
    expensive_above = round(eps * history['p75'], 2)
    close = getattr(row, 'last_close', None)
    if close is None or close <= 0:
        current = history['current']
        close = eps * current
    else:
        current = round(close / eps, 2)
    return {
        'grade': price_zone(round(close, 2), cheap_below, expensive_above),
        'current_pe': current,
        'cheap_below': cheap_below,
        'expensive_above': expensive_above,
    }
