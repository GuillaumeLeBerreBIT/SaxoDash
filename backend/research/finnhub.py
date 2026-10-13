"""Read-only company fundamentals from Finnhub, shaped and cached the same
way market.py does for Saxo - call, shape, cache. Finnhub needs a static API
key, not a per-user OAuth token, so there is no credential lookup here.
"""

import html
import logging
import re
import statistics
import time
from datetime import date, datetime, timedelta, timezone

import requests
from django.conf import settings
from django.core.cache import cache

from core.http_client import request_json

from .providers import ProviderUnavailable
from .statement_shaping import to_annual

logger = logging.getLogger(__name__)

API_BASE = 'https://finnhub.io/api/v1'

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


class FinnhubBusy(ProviderUnavailable):
    def __init__(self):
        super().__init__('Market data is busy. Try again in a minute.')


BUDGET_WINDOW_SECONDS = 60
BUDGET_KEY_TTL = 2 * BUDGET_WINDOW_SECONDS


def _minute():
    return int(time.time() // BUDGET_WINDOW_SECONDS)


def _budget_key():
    return f'research:finnhub-calls:{_minute()}'


def _spend_call():
    key = _budget_key()
    try:
        cache.add(key, 0, BUDGET_KEY_TTL)
        spent = cache.incr(key)
    except Exception:
        logger.warning('Finnhub call budget could not be counted', exc_info=True)
        return
    if spent > settings.FINNHUB_CALLS_PER_MINUTE:
        raise FinnhubBusy()


def _get(path, **params):
    if not settings.FINNHUB_API_KEY:
        raise FinnhubNotConfigured()
    _spend_call()

    return request_json(
        requests.get,
        f'{API_BASE}{path}',
        path,
        transient=FinnhubAPIError,
        permanent=FinnhubAPIError,
        params={**params, 'token': settings.FINNHUB_API_KEY},
    )


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
    # so they go through **kwargs). A falsy `symbol` fetches the whole market.
    params = {'from': date_from, 'to': date_to}
    if symbol:
        params['symbol'] = symbol
    return _get('/calendar/earnings', **params)


def get_company_news(symbol, date_from, date_to):
    # Same `from` / `to` reserved-word dance as the earnings calendar.
    return _get('/company-news', symbol=symbol, **{'from': date_from, 'to': date_to})


def get_peers(symbol):
    return _get('/stock/peers', symbol=symbol)


def get_financials_reported(symbol, freq='annual'):
    return _get('/stock/financials-reported', symbol=symbol, freq=freq)


REPORTED_ANNUAL_TTL = 86400


def reported_annual(symbol):
    key = f'research:reported-annual:v1:{symbol}'
    reported = cache.get(key)
    if reported is None:
        reported = get_financials_reported(symbol, 'annual')
        if (reported or {}).get('data'):
            cache.set(key, reported, REPORTED_ANNUAL_TTL)
    return reported


def get_filings(symbol, form):
    return _get('/stock/filings', symbol=symbol, form=form)


def get_insider_transactions(symbol):
    return _get('/stock/insider-transactions', symbol=symbol)


def get_insider_sentiment(symbol, date_from, date_to):
    return _get('/stock/insider-sentiment', symbol=symbol, **{'from': date_from, 'to': date_to})


FUNDAMENTALS_TTL = 86400
EARNINGS_CAL_TTL = 43200  # 12h — a settled (past / far-future) market week
EARNINGS_TTL = 7200       # 2h — per-symbol history; short so today's actual shows
NEWS_TTL = 7200           # 2h — headlines move through the day, not by the second
NEWS_WINDOW_DAYS = 14
NEWS_MAX_ITEMS = 30
PEERS_TTL = 86400  # peer sets rarely change; same cadence as fundamentals
MAX_PEERS = 5

CACHE_V = 'v7'  # bump when the shaped fundamentals payload changes shape


def _cache_key(symbol):
    # Normalization (uppercasing) is the caller's job - FundamentalsView does
    # it once, on the way in.
    return f'research:fundamentals:{CACHE_V}:{symbol}'


def _metric(financials, key):
    return (financials.get('metric') or {}).get(key)


SCREENER_METRICS = {
    'pe': 'peNormalizedAnnual',
    'forward_pe': 'forwardPE',
    'roe': 'roeTTM',
    'net_margin': 'netProfitMarginTTM',
    'eps_growth_5y': 'epsGrowth5Y',
    'debt_to_equity': 'totalDebt/totalEquityAnnual',
    'dividend_yield': 'dividendYieldIndicatedAnnual',
    'market_cap': 'marketCapitalization',
    'revenue_growth_5y': 'revenueGrowth5Y',
    'payout_ratio': 'payoutRatioTTM',
}


def to_screener_fundamentals(financials):
    return {field: _metric(financials, key) for field, key in SCREENER_METRICS.items()}


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


_VALUATION_SERIES = {'pe': 'pe', 'ps': 'ps', 'pb': 'pb', 'ev_ebitda': 'evEbitda'}


def _series_stats(series_annual, key):
    """min / median / max / latest over one named annual series from Finnhub's
    `series` block. `None` when the series is missing or empty - never guessed."""
    points = [p['v'] for p in (series_annual.get(key) or []) if p.get('v') is not None]
    if not points:
        return None
    return {
        'latest': points[0],  # Finnhub sends newest first
        'min': min(points),
        'median': round(statistics.median(points), 2),
        'max': max(points),
        'n': len(points),
    }


def _valuation_history(financials):
    """Each valuation ratio against its own multi-year annual history, or None
    when `/stock/metric` came back without a `series` block."""
    annual = (financials.get('series') or {}).get('annual') or {}
    if not annual:
        return None
    out = {}
    for out_key, series_key in _VALUATION_SERIES.items():
        stats = _series_stats(annual, series_key)
        if stats:
            out[out_key] = stats
    return out or None


QUARTERLY_TREND_KEYS = {
    'eps': 'eps',
    'revenue_per_share': 'salesPerShare',
    'gross_margin': 'grossMargin',
    'net_margin': 'netMargin',
    'operating_margin': 'operatingMargin',
}
QUARTERLY_MIN_POINTS = 8     # two YoY comparisons need index-5..index-1 to exist
QUARTERLY_TREND_POINTS = 12  # ~3 years, oldest-first


def _quarterly_points(quarterly, key):
    return {p['period']: p['v'] for p in (quarterly.get(key) or []) if p.get('v') is not None}


def _quarterly_trends(financials):
    """Per-quarter eps / revenue-per-share proxy / margins, oldest-first,
    aligned on periods where both eps and salesPerShare exist. `None` when
    the series is missing or too shallow for the two-YoY-comparison the
    frontend's insight math needs."""
    quarterly = (financials.get('series') or {}).get('quarterly') or {}
    if not quarterly:
        return None

    eps_by_period = _quarterly_points(quarterly, QUARTERLY_TREND_KEYS['eps'])
    rev_by_period = _quarterly_points(quarterly, QUARTERLY_TREND_KEYS['revenue_per_share'])
    margin_maps = {
        field: _quarterly_points(quarterly, key)
        for field, key in QUARTERLY_TREND_KEYS.items()
        if field not in ('eps', 'revenue_per_share')
    }

    periods = sorted(set(eps_by_period) & set(rev_by_period))
    if len(periods) < QUARTERLY_MIN_POINTS:
        return None

    periods = periods[-QUARTERLY_TREND_POINTS:]
    return [
        {
            'period': period,
            'eps': eps_by_period[period],
            'revenue_per_share': rev_by_period[period],
            **{field: margin_maps[field].get(period) for field in margin_maps},
        }
        for period in periods
    ]


RECOMMENDATION_HISTORY_MONTHS = 12
RATIO_HISTORY_YEARS = 10
PERCENT = 100

RATIO_SERIES = {
    'pe': ('pe', 1),
    'ps': ('ps', 1),
    'pb': ('pb', 1),
    'ev_ebitda': ('evEbitda', 1),
    'pfcf': ('pfcf', 1),
    'gross_margin': ('grossMargin', PERCENT),
    'operating_margin': ('operatingMargin', PERCENT),
    'net_margin': ('netMargin', PERCENT),
    'roe': ('roe', PERCENT),
    'roa': ('roa', PERCENT),
    'roic': ('roic', PERCENT),
    'current_ratio': ('currentRatio', 1),
    'quick_ratio': ('quickRatio', 1),
    'cash_ratio': ('cashRatio', 1),
    'debt_to_equity': ('totalDebtToEquity', 1),
    'debt_to_assets': ('totalDebtToTotalAsset', 1),
    'long_term_debt_to_equity': ('longtermDebtTotalEquity', 1),
}


def _ratio_history(financials):
    annual = (financials.get('series') or {}).get('annual') or {}
    by_period = {}
    for field, (series_key, scale) in RATIO_SERIES.items():
        for point in annual.get(series_key) or []:
            if point.get('v') is None or not point.get('period'):
                continue
            by_period.setdefault(point['period'], {})[field] = round(point['v'] * scale, 2)
    periods = sorted(by_period)[-RATIO_HISTORY_YEARS:]
    return [{'period': period, **by_period[period]} for period in periods]


ANNUAL_EPS_POINTS = 8
ANNUAL_RESULTS_YEARS = 5


def _annual_eps(financials):
    points = ((financials.get('series') or {}).get('annual') or {}).get('eps') or []
    usable = [
        {'period': point['period'], 'eps': round(point['v'], 2)}
        for point in points
        if point.get('period') and isinstance(point.get('v'), (int, float)) and not isinstance(point.get('v'), bool)
    ]
    return sorted(usable, key=lambda row: row['period'])[-ANNUAL_EPS_POINTS:]


def _annual_results(reported):
    results = []
    for row in to_annual(reported):
        revenue = row['income'].get('revenue')
        if revenue is None:
            continue
        result = {'label': row['label'], 'fiscal_year': row['fiscal_year'], 'revenue': revenue}
        if 'net_income' in row['income']:
            result['net_income'] = row['income']['net_income']
        results.append(result)
    return results[-ANNUAL_RESULTS_YEARS:]


def to_fundamentals(profile, financials, recommendations, earnings, reported=None):
    pe = _metric(financials, 'peNormalizedAnnual')
    eps_growth_5y = _metric(financials, 'epsGrowth5Y')

    shaped = {
        'name': profile.get('name', ''),
        'exchange': profile.get('exchange', ''),
        'industry': profile.get('finnhubIndustry', ''),
        'logo': profile.get('logo', ''),
        'market_cap': profile.get('marketCapitalization'),
        'shares_outstanding': profile.get('shareOutstanding'),
        'free_float': profile.get('floatingShare'),
        'ipo_date': profile.get('ipo') or None,
        'website': profile.get('weburl', ''),
        'country': profile.get('country', ''),
        'enterprise_value': _metric(financials, 'enterpriseValue'),
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
        'revenue_growth_ttm_yoy': _metric(financials, 'revenueGrowthTTMYoy'),
        'eps_growth_ttm_yoy': _metric(financials, 'epsGrowthTTMYoy'),
        'revenue_growth_3y': _metric(financials, 'revenueGrowth3Y'),
        'revenue_growth_5y': _metric(financials, 'revenueGrowth5Y'),
        'eps_growth_3y': _metric(financials, 'epsGrowth3Y'),
        'operating_margin_ttm': _metric(financials, 'operatingMarginTTM'),
        'operating_margin_5y': _metric(financials, 'operatingMargin5Y'),
        'gross_margin_5y': _metric(financials, 'grossMargin5Y'),
        'net_margin_5y': _metric(financials, 'netProfitMargin5Y'),
        'debt_to_equity': _metric(financials, 'totalDebt/totalEquityQuarterly'),
        'long_term_debt_to_equity': _metric(financials, 'longTermDebt/equityQuarterly'),
        'interest_coverage': _metric(financials, 'netInterestCoverageTTM'),
        'quick_ratio': _metric(financials, 'quickRatioQuarterly'),
        # Finnhub sends newest-first; the most recent period is "the" trend.
        'recommendation': _to_recommendation(recommendations[0] if recommendations else None),
        'recommendation_history': [
            _to_recommendation(row)
            for row in reversed(recommendations[:RECOMMENDATION_HISTORY_MONTHS])
            if row
        ],
        # Oldest-first, same convention as market.chart's candles - the chart draws left to right.
        'eps_history': [_to_eps_row(row) for row in reversed(earnings)],
    }

    history = _valuation_history(financials)
    if history:
        shaped['valuation_history'] = history
    trends = _quarterly_trends(financials)
    if trends:
        shaped['quarterly_trends'] = trends
    ratio_history = _ratio_history(financials)
    if ratio_history:
        shaped['ratio_history'] = ratio_history
    annual_eps = _annual_eps(financials)
    if annual_eps:
        shaped['annual_eps'] = annual_eps
    if reported:
        annual_results = _annual_results(reported)
        if annual_results:
            shaped['annual_results'] = annual_results
    return shaped


def fundamentals(symbol):
    def produce():
        profile = get_profile(symbol)
        if not profile.get('name'):
            # Finnhub answers 200 with an empty/near-empty profile for a
            # ticker it doesn't recognize - raising here (before the other
            # three calls, and before get_or_set stores anything) keeps a
            # wrong "unknown symbol" answer from being pinned for 24h.
            raise FinnhubNoData(symbol)
        try:
            # An optional enrichment, not core to fundamentals: a symbol this
            # endpoint doesn't cover (rate limit, no US-GAAP filings) degrades
            # to no cash-flow trend rather than failing the whole payload.
            reported = reported_annual(symbol)
        except ProviderUnavailable:
            reported = None
        return to_fundamentals(
            profile,
            get_basic_financials(symbol),
            get_recommendation_trends(symbol),
            get_earnings_history(symbol),
            reported,
        )

    try:
        data = cache.get_or_set(_cache_key(symbol), produce, FUNDAMENTALS_TTL)
    except ProviderUnavailable:
        raise
    except (KeyError, TypeError, IndexError, AttributeError) as exc:
        # A payload shape to_fundamentals could not read - degrade, don't 500.
        # A real bug (AttributeError, NameError, ...) still surfaces as a 500.
        raise FinnhubUnexpected() from exc

    return {'available': True, **data}


def _peers_cache_key(symbol):
    return f'research:peers:v1:{symbol}'


def peers(symbol):
    def produce():
        raw = get_peers(symbol) or []
        symbols = [s for s in raw if s and s.upper() != symbol][:MAX_PEERS]
        return {'symbols': symbols}

    data = cache.get_or_set(_peers_cache_key(symbol), produce, PEERS_TTL)
    return {'available': True, **data}


# A week, not FUNDAMENTALS_TTL's 24h - a company's industry classification
# moves on the order of years, not days, so there is no freshness reason to
# recheck it daily the way a price-derived ratio needs to.
INDUSTRY_TTL = 86400 * 7


def _industry_cache_key(symbol):
    return f'research:industry:v1:{symbol}'


def industry(symbol):
    """Finnhub's coarse industry/sector classification for a company - just
    the one profile field, cached separately from fundamentals() (which
    fetches three more endpoints this doesn't need). Backs the Position.sector
    backfill in portfolio.sectors."""
    def produce():
        profile = get_profile(symbol)
        value = profile.get('finnhubIndustry')
        if not value:
            # Same reasoning as fundamentals()'s own no-name check: raise
            # before caching, so an ETF/unlisted symbol's "no data" doesn't
            # get pinned for a week.
            raise FinnhubNoData(symbol)
        return value

    return cache.get_or_set(_industry_cache_key(symbol), produce, INDUSTRY_TTL)


_TAG = re.compile(r'</?[A-Za-z!][^>]*>')


def _clean_text(value):
    if not isinstance(value, str):
        return ''
    return ' '.join(html.unescape(_TAG.sub(' ', value)).split())


def _to_news_item(row):
    ts = row.get('datetime')
    return {
        'id': row.get('id'),
        'datetime': datetime.fromtimestamp(ts, tz=timezone.utc).isoformat() if ts else None,
        'headline': _clean_text(row.get('headline', '')),
        'source': row.get('source', ''),
        'summary': _clean_text(row.get('summary', '')),
        'url': row.get('url', ''),
    }


def news(symbol):
    """Company headlines for the last NEWS_WINDOW_DAYS, newest first, capped.
    Drops the image (kept deliberately spare) and any row missing a headline,
    url or timestamp."""
    today = date.today()
    start = today - timedelta(days=NEWS_WINDOW_DAYS)
    key = f'research:news:v2:{symbol}:{today.isoformat()}'

    def produce():
        rows = get_company_news(symbol, start.isoformat(), today.isoformat()) or []
        items = [
            item for item in map(_to_news_item, rows)
            if item['headline'] and item['url'] and item['datetime']
        ]
        items.sort(key=lambda item: item['datetime'], reverse=True)
        return items[:NEWS_MAX_ITEMS]

    return {'available': True, 'items': cache.get_or_set(key, produce, NEWS_TTL)}
