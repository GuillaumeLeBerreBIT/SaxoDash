from research import daily, finnhub, valuation
from research.listings import bare, look_up
from research.models import ScreenerRow
from research.price_summary import summarise
from research.providers import ProviderUnavailable
from research.views import FundamentalsView

from ..envelope import Reply, Unavailable
from ..views import fetch_optional
from . import tool
from .research import FINNHUB, SAXO, _scalar_metrics
from .smart_money import CONGRESS, EDGAR, ownership

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
    latest = history['latest'] if history else {}
    medians = history['medians_5y'] if history else {}
    current = {
        'pe_ttm': valuation.current_pe(latest.get('pe_ttm'), metrics),
        'forward_pe': (metrics or {}).get('forward_pe'),
        'peg': (metrics or {}).get('peg_ratio'),
        'ps_ttm': latest.get('ps_ttm'),
        'pfcf_ttm': latest.get('pfcf_ttm'),
        'ev_ebitda_ttm': latest.get('ev_ebitda_ttm'),
    }
    figures = {}
    for name, value in current.items():
        figures[name] = value
        median = medians.get(name) if name in valuation.VALUATION_RATIOS else None
        figures[f'{name}_vs_5y_median'] = _ratio_vs_median(value, median)
    return figures


def _trend(bars):
    if bars is None:
        return {'zone': None, **{key: None for key in TREND}}
    result = summarise(bars)
    return {'zone': result['zone'], **{key: result['summary'][key] for key in TREND}}


def _history(listing, bars, warnings):
    try:
        series = finnhub.valuation_series(listing.ticker)
    except ProviderUnavailable as exc:
        warnings.append(exc.reason)
        return None
    data, notes = valuation.history(listing.ticker, series, bars)
    warnings.extend(notes)
    return data


def _ownership(listing, warnings):
    try:
        reply = ownership(listing)
    except Unavailable as missing:
        warnings.extend(missing.warnings)
        return None
    warnings.extend(reply.warnings)
    return reply.data


def _pillars(listing, warnings):
    fundamentals = fetch_optional(FundamentalsView, warnings, kwargs={'symbol': listing.ticker})
    bars, reason = daily.available(listing)
    if reason:
        warnings.append(reason)
    history = _history(listing, bars, warnings)
    metrics = _scalar_metrics(fundamentals) if fundamentals else None
    profitability = _pick(metrics, PROFITABILITY)
    annual_roic = _latest_roic(fundamentals)
    if annual_roic is not None:
        profitability['roic_pct'] = annual_roic
    pillars = {
        'growth': _fill_from_screener(_pick(metrics, GROWTH), listing.ticker),
        'profitability': profitability,
        'health': _pick(metrics, HEALTH),
        'valuation': _valuation(metrics, history),
        'trend': _trend(bars),
    }
    return (fundamentals or {}).get('name'), pillars


def _compare_one(listing):
    warnings = [listing.unverified_warning] if listing.unverified_warning else []
    entry = {'symbol': listing.ticker, 'name': listing.name, 'status': listing.company_status, 'pillars': None, 'ownership': None}
    refusal = listing.refusal()
    if refusal and listing.refusal(allow_fund=True):
        return entry, [*warnings, refusal]
    entry['ownership'] = _ownership(listing, warnings)
    if refusal:
        return entry, [*warnings, refusal]
    name, entry['pillars'] = _pillars(listing, warnings)
    entry['name'] = name or entry['name']
    return entry, warnings


@tool(
    'Compare two to five companies side by side on growth, profitability, health, valuation versus their own 5-year median and trend, plus fund and Congress ownership.',
    sources=[FINNHUB, SAXO, EDGAR, CONGRESS],
    saxo=True,
)
def compare_companies(symbols: list[str]):
    distinct = list(dict.fromkeys(bare(s) for s in symbols))
    if not MIN_SYMBOLS <= len(distinct) <= MAX_SYMBOLS:
        raise Unavailable(COUNT_WARNING)
    companies, warnings = [], []
    for symbol in distinct:
        entry, notes = _compare_one(look_up(symbol))
        companies.append(entry)
        warnings.extend(f'{entry["symbol"]}: {note}' for note in notes)
    return Reply({'companies': companies}, warnings)
