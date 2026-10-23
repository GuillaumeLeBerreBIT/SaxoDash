from research.models import ScreenerRow

from .. import company_data
from ..envelope import answer
from . import tool
from .research import (
    FINNHUB,
    _bare,
    get_company,
    get_price_history,
    get_valuation_history,
    resolve,
)
from .smart_money import get_ticker_ownership

MIN_SYMBOLS = 2
MAX_SYMBOLS = 5
COUNT_WARNING = 'Compare two to five companies.'

GROWTH = {
    'revenue_growth_5y_pct': 'revenue_growth_5y',
    'eps_growth_5y_pct': None,
    'revenue_growth_yoy_pct': 'revenue_growth_ttm_yoy',
    'eps_growth_yoy_pct': 'eps_growth_ttm_yoy',
}
PROFITABILITY = {
    'gross_margin_pct': 'gross_margin',
    'operating_margin_pct': 'operating_margin_ttm',
    'net_margin_pct': 'net_margin',
    'roe_pct': 'roe',
    'roic_pct': 'roi',
    'fcf_margin_pct': None,
}
HEALTH = {
    'debt_to_equity': 'debt_to_equity',
    'current_ratio': 'current_ratio',
    'net_debt_to_equity': None,
}
TREND = ('change_3m_pct', 'change_1y_pct', 'pct_from_52w_high', 'rsi14')
HISTORY_RATIOS = ('pe_ttm', 'ps_ttm', 'pfcf_ttm', 'ev_ebitda_ttm')
SCREENER_FALLBACKS = {'eps_growth_5y_pct': 'eps_growth_5y', 'revenue_growth_5y_pct': 'revenue_growth_5y'}


def _pick(source, mapping):
    source = source or {}
    return {name: source.get(key) if key else None for name, key in mapping.items()}


def _ratio_vs_median(current, median):
    if current is None or median is None or median <= 0:
        return None
    return round(current / median, 2)


def _screener_row(ticker):
    return ScreenerRow.objects.filter(ticker__iexact=ticker).first()


def _fill_from_screener(growth, ticker):
    missing = [name for name, value in growth.items() if value is None and name in SCREENER_FALLBACKS]
    if not missing:
        return growth
    row = _screener_row(ticker)
    if row is None:
        return growth
    return {
        name: getattr(row, SCREENER_FALLBACKS[name]) if name in missing else value
        for name, value in growth.items()
    }


def _latest_roic(company):
    history = (company or {}).get('ratio_history') or []
    return history[-1].get('roic') if history else None


def _valuation(metrics, history):
    latest = (history or {}).get('latest') or {}
    medians = (history or {}).get('medians_5y') or {}
    metrics = metrics or {}
    pe = latest.get('pe_ttm')
    if pe is None:
        pe = metrics.get('pe_ratio')
    eps = metrics.get('eps_ttm')
    if pe is not None and (pe <= 0 or (eps is not None and eps <= 0)):
        pe = None
    current = {
        'pe_ttm': pe,
        'forward_pe': metrics.get('forward_pe'),
        'peg': metrics.get('peg_ratio'),
        'ps_ttm': latest.get('ps_ttm'),
        'pfcf_ttm': latest.get('pfcf_ttm'),
        'ev_ebitda_ttm': latest.get('ev_ebitda_ttm'),
    }
    figures = {}
    for name, value in current.items():
        figures[name] = value
        median = medians.get(name) if name in HISTORY_RATIOS else None
        figures[f'{name}_vs_5y_median'] = _ratio_vs_median(value, median)
    return figures


def _trend(prices):
    summary = (prices or {}).get('summary') or {}
    return {'zone': (prices or {}).get('zone'), **{key: summary.get(key) for key in TREND}}


def _prefixed(symbol, result):
    return [f'{symbol}: {message}' for message in result['warnings']]


def _compare_one(symbol):
    ticker = _bare(symbol)
    instrument = resolve(symbol)
    status = company_data.status_of(instrument)
    name = instrument['name'] if instrument else None
    ownership = get_ticker_ownership(ticker)
    warnings = _prefixed(ticker, ownership)
    entry = {'symbol': ticker, 'name': name, 'status': status, 'pillars': None, 'ownership': ownership['data']}
    if status != company_data.ELIGIBLE:
        reason = company_data.refusal(status)
        if reason and f'{ticker}: {reason}' not in warnings:
            warnings.append(f'{ticker}: {reason}')
        return entry, warnings

    fundamentals = get_company(ticker)
    history = get_valuation_history(ticker)
    prices = get_price_history(ticker, interval='daily', bars=1)
    for result in (fundamentals, history, prices):
        warnings.extend(_prefixed(ticker, result))
    company = fundamentals['data']
    metrics = company['metrics'] if company else None
    if company and company.get('profile'):
        entry['name'] = company['profile'].get('name') or name
    growth = _fill_from_screener(_pick(metrics, GROWTH), ticker)
    profitability = _pick(metrics, PROFITABILITY)
    annual_roic = _latest_roic(company)
    if annual_roic is not None:
        profitability['roic_pct'] = annual_roic
    entry['pillars'] = {
        'growth': growth,
        'profitability': profitability,
        'health': _pick(metrics, HEALTH),
        'valuation': _valuation(metrics, history['data']),
        'trend': _trend(prices['data']),
    }
    return entry, warnings


@tool('Compare two to five companies side by side on growth, profitability, health, valuation versus their own 5-year median and trend, plus fund and Congress ownership.')
def compare_companies(symbols: list[str]):
    distinct = list(dict.fromkeys(_bare(s) for s in symbols))
    if not MIN_SYMBOLS <= len(distinct) <= MAX_SYMBOLS:
        return answer(None, sources=[FINNHUB], warnings=[COUNT_WARNING])
    companies, warnings = [], []
    for symbol in distinct:
        entry, entry_warnings = _compare_one(symbol)
        companies.append(entry)
        warnings.extend(entry_warnings)
    return answer(
        {'companies': companies},
        sources=[FINNHUB, 'saxo', '13f', 'house-clerk'],
        warnings=list(dict.fromkeys(warnings)),
    )
