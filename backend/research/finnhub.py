"""Read-only company fundamentals from Finnhub, shaped and cached the same
way market.py does for Saxo - call, shape, cache. Finnhub needs a static API
key, not a per-user OAuth token, so there is no credential lookup here.
"""

import logging

import requests
from django.conf import settings
from django.core.cache import cache

from .providers import ProviderUnavailable

API_BASE = 'https://finnhub.io/api/v1'
REQUEST_TIMEOUT = 10
ERROR_BODY_LIMIT = 200

# Every Finnhub failure is a ProviderUnavailable: the fundamentals endpoint's
# contract is to answer 200 with `available: false`, never a status code.


class FinnhubNotConfigured(ProviderUnavailable):
    """FINNHUB_API_KEY is not set."""

    def __init__(self):
        super().__init__('Market data is not configured.')


class FinnhubAPIError(ProviderUnavailable):
    """A Finnhub HTTP call failed. `str(exc)` carries the upstream detail for the
    log; `body()` overrides it so the client only sees a generic reason."""

    log = True

    def body(self):
        return {'available': False, 'reason': 'Market data is unavailable right now.'}


class FinnhubNoData(ProviderUnavailable):
    """Finnhub returned 200 but has no profile for the symbol."""

    def __init__(self, symbol):
        super().__init__(f'Finnhub has no data for symbol {symbol!r}.')


class FinnhubUnexpected(ProviderUnavailable):
    """A Finnhub payload we could not read - logged at ERROR (our parser or
    their shape changed), but still not a 500."""

    log = True
    log_level = logging.ERROR

    def __init__(self):
        super().__init__('Fundamentals data is unavailable.')


def _get(path, **params):
    if not settings.FINNHUB_API_KEY:
        raise FinnhubNotConfigured()

    try:
        response = requests.get(
            f'{API_BASE}{path}',
            params={**params, 'token': settings.FINNHUB_API_KEY},
            timeout=REQUEST_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise FinnhubAPIError(f'{path} failed: {exc}') from exc

    if not response.ok:
        body = response.text[:ERROR_BODY_LIMIT]
        raise FinnhubAPIError(f'{path} failed: {response.status_code} {body}')

    try:
        return response.json()
    except ValueError as exc:
        raise FinnhubAPIError(f'{path} returned a non-JSON body') from exc


def get_profile(symbol):
    return _get('/stock/profile2', symbol=symbol)


def get_basic_financials(symbol):
    return _get('/stock/metric', symbol=symbol, metric='all')


def get_recommendation_trends(symbol):
    return _get('/stock/recommendation', symbol=symbol)


def get_earnings_history(symbol):
    return _get('/stock/earnings', symbol=symbol)


def get_earnings_calendar(symbol, date_from, date_to):
    # Finnhub names the window params `from` / `to` (reserved words in Python,
    # so they go through **kwargs).
    return _get('/calendar/earnings', symbol=symbol, **{'from': date_from, 'to': date_to})


FUNDAMENTALS_TTL = 86400
EARNINGS_CAL_TTL = 43200  # 12h — the portfolio-wide agenda's per-symbol window
EARNINGS_TTL = 86400      # 24h — the per-symbol history window


def _cache_key(symbol):
    # Normalization (uppercasing) is the caller's job - FundamentalsView does
    # it once, on the way in.
    return f'research:fundamentals:{symbol}'


def _metric(financials, key):
    return (financials.get('metric') or {}).get(key)


def _peg_ratio(pe, eps_growth_5y):
    if pe is None or not eps_growth_5y:
        return None
    return round(pe / eps_growth_5y, 2)


def _to_recommendation(row):
    if not row:
        return None
    return {
        'strong_buy': row.get('strongBuy', 0),
        'buy': row.get('buy', 0),
        'hold': row.get('hold', 0),
        'sell': row.get('sell', 0),
        'strong_sell': row.get('strongSell', 0),
        'period': row.get('period', ''),
    }


def _to_eps_row(row):
    return {
        'period': row.get('period', ''),
        'actual': row.get('actual'),
        'estimate': row.get('estimate'),
        'surprise_percent': row.get('surprisePercent'),
    }


def to_fundamentals(profile, financials, recommendations, earnings):
    pe = _metric(financials, 'peNormalizedAnnual')
    eps_growth_5y = _metric(financials, 'epsGrowth5Y')

    return {
        'name': profile.get('name', ''),
        'exchange': profile.get('exchange', ''),
        'industry': profile.get('finnhubIndustry', ''),
        'logo': profile.get('logo', ''),
        'market_cap': profile.get('marketCapitalization'),
        'shares_outstanding': profile.get('shareOutstanding'),
        'pe_ratio': pe,
        'ps_ratio': _metric(financials, 'psTTM'),
        'pb_ratio': _metric(financials, 'pbAnnual'),
        'peg_ratio': _peg_ratio(pe, eps_growth_5y),
        'dividend_yield': _metric(financials, 'dividendYieldIndicatedAnnual'),
        'eps_ttm': _metric(financials, 'epsInclExtraItemsTTM'),
        'week52_high': _metric(financials, '52WeekHigh'),
        'week52_low': _metric(financials, '52WeekLow'),
        'roe': _metric(financials, 'roeTTM'),
        'net_margin': _metric(financials, 'netProfitMarginTTM'),
        'gross_margin': _metric(financials, 'grossMarginTTM'),
        'beta': _metric(financials, 'beta'),
        'forward_pe': _metric(financials, 'forwardPE'),
        'ev_ebitda': _metric(financials, 'evEbitdaTTM'),
        'ev_revenue': _metric(financials, 'evRevenueTTM'),
        'current_ratio': _metric(financials, 'currentRatioAnnual'),
        'roa': _metric(financials, 'roaTTM'),
        'roi': _metric(financials, 'roiTTM'),
        'dividend_growth_5y': _metric(financials, 'dividendGrowthRate5Y'),
        'price_return_1m': _metric(financials, 'monthToDatePriceReturnDaily'),
        'price_return_ytd': _metric(financials, 'yearToDatePriceReturnDaily'),
        'price_return_1y': _metric(financials, '52WeekPriceReturnDaily'),
        # Finnhub sends newest-first; the most recent period is "the" trend.
        'recommendation': _to_recommendation(recommendations[0] if recommendations else None),
        # Oldest-first, same convention as market.chart's candles - the chart draws left to right.
        'eps_history': [_to_eps_row(row) for row in reversed(earnings)],
    }


def fundamentals(symbol):
    def produce():
        profile = get_profile(symbol)
        if not profile.get('name'):
            # Finnhub answers 200 with an empty/near-empty profile for a
            # ticker it doesn't recognize - raising here (before the other
            # three calls, and before get_or_set stores anything) keeps a
            # wrong "unknown symbol" answer from being pinned for 24h.
            raise FinnhubNoData(symbol)
        return to_fundamentals(
            profile,
            get_basic_financials(symbol),
            get_recommendation_trends(symbol),
            get_earnings_history(symbol),
        )

    try:
        data = cache.get_or_set(_cache_key(symbol), produce, FUNDAMENTALS_TTL)
    except ProviderUnavailable:
        raise
    except (KeyError, TypeError, IndexError) as exc:
        # A payload shape to_fundamentals could not read - degrade, don't 500.
        # A real bug (AttributeError, NameError, ...) still surfaces as a 500.
        raise FinnhubUnexpected() from exc

    return {'available': True, **data}
