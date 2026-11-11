from dataclasses import dataclass
from statistics import median
from typing import Callable, Optional

THRESHOLDS = {'roe': 15, 'roic': 10, 'net_margin': 10, 'revenue_growth': 5, 'debt_to_equity': 1.0}
FINANCIAL_SECTORS = {'Financials', 'Real Estate'}
MIN_ANSWERED = 4
STRONG_SHARE = 0.8
WEAK_SHARE = 0.5
LATEST_MARGIN_FLOOR = 0.5


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


def _median_at_least(key, floor):
    def judge(row):
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
    if row.sector in FINANCIAL_SECTORS or row.debt_to_equity is None:
        return 'unknown', None
    return _outcome(row.debt_to_equity, row.debt_to_equity <= THRESHOLDS['debt_to_equity'])


CHECKS = (
    Check('roe', 'Return on equity', '15%', _median_at_least('roe', THRESHOLDS['roe'])),
    Check('roic', 'Return on capital', '10%', _median_at_least('roic', THRESHOLDS['roic'])),
    Check('margins', 'Margins', '10%', _margins),
    Check('earnings_growth', 'Earnings growth', 'above 0', _earnings_growth),
    Check('revenue_growth', 'Revenue growth', '5% a year', _revenue_growth),
    Check('debt', 'Debt', 'at most 1.0', _debt),
)


def grade(checks):
    passes = sum(1 for check in checks if check['status'] == 'pass')
    answered = passes + sum(1 for check in checks if check['status'] == 'fail')
    if answered < MIN_ANSWERED:
        return 'unknown'
    share = passes / answered
    if share >= STRONG_SHARE:
        return 'strong'
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
    return history


def valuation(row):
    history = _levels(getattr(row, 'pe_history', None))
    if history is None:
        return {'grade': 'not_judged', 'current_pe': None, 'cheap_below': None, 'expensive_above': None}
    current = history['current']
    if current <= history['p25']:
        verdict = 'cheap'
    elif current >= history['p75']:
        verdict = 'expensive'
    else:
        verdict = 'fair'
    return {
        'grade': verdict,
        'current_pe': current,
        'cheap_below': round(history['eps_ttm'] * history['p25'], 2),
        'expensive_above': round(history['eps_ttm'] * history['p75'], 2),
    }
