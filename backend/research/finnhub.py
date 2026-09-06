"""Read-only company fundamentals from Finnhub, shaped and cached the same
way market.py does for Saxo - call, shape, cache. Finnhub needs a static API
key, not a per-user OAuth token, so there is no credential lookup here.
"""

import requests
from django.conf import settings
from django.core.cache import cache

API_BASE = 'https://finnhub.io/api/v1'
REQUEST_TIMEOUT = 10
ERROR_BODY_LIMIT = 200


class FinnhubNotConfigured(Exception):
    """Raised when FINNHUB_API_KEY is not set."""


class FinnhubAPIError(Exception):
    """Raised when a Finnhub request fails."""


def _get(path, **params):
    if not settings.FINNHUB_API_KEY:
        raise FinnhubNotConfigured('FINNHUB_API_KEY is not set.')

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


FUNDAMENTALS_TTL = 86400


def _cache_key(symbol):
    return f'research:fundamentals:{symbol.upper()}'


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
        # Finnhub sends newest-first; the most recent period is "the" trend.
        'recommendation': _to_recommendation(recommendations[0] if recommendations else None),
        # Oldest-first, same convention as market.chart's candles - the chart draws left to right.
        'eps_history': [_to_eps_row(row) for row in reversed(earnings)],
    }


def fundamentals(symbol):
    def produce():
        return to_fundamentals(
            get_profile(symbol),
            get_basic_financials(symbol),
            get_recommendation_trends(symbol),
            get_earnings_history(symbol),
        )

    return cache.get_or_set(_cache_key(symbol), produce, FUNDAMENTALS_TTL)
