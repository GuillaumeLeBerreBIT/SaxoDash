from datetime import date

from research import finnhub
from research.listings import SEARCH_ASSET_TYPES, bare, look_up
from research.providers import ProviderUnavailable
from research.technicals import rsi, sma
from research.valuation import median_since, trailing_pe
from research.models import SymbolNote, Watchlist
from research.serializers import SymbolNoteSerializer
from research.views import (
    ChartView,
    CompanyNewsView,
    FilingsView,
    FundamentalsView,
    InsidersView,
    InstrumentSearchView,
    PeersView,
    QuotesView,
    StatementsView,
    SymbolEarningsView,
)

from ..envelope import Reply, Unavailable
from ..shaping import capped, without
from ..views import fetch, fetch_optional
from ..zones import zone
from . import tool

DAILY = 1440
DAILY_FETCH = 1200
INTERVALS = {'daily': (DAILY, 260), 'weekly': (10080, 1200), 'monthly': (43200, 1200)}
YEAR_SESSIONS = 252
CHANGE_SESSIONS = {'change_1m_pct': 21, 'change_3m_pct': 63, 'change_1y_pct': 252}
PULLBACK_WARNING = "Zone ignores the playbook's Value-pillar condition on pullbacks until the lens engine exists."
SAXO = 'saxo'


def _shape(row):
    return {
        'symbol': row['symbol'],
        'name': row.get('description') or row.get('name') or '',
        'uic': row['uic'],
        'asset_type': row['asset_type'],
        'currency': row.get('currency') or None,
        'exchange': row.get('exchange') or None,
    }


def _chart(listing, horizon, count):
    return fetch(
        ChartView,
        query={'uic': listing.uic, 'asset_type': listing.asset_type, 'horizon': horizon, 'count': count},
    )


def _resolved(symbol):
    listing = look_up(symbol)
    if not listing.resolved:
        raise Unavailable(f'{symbol} could not be resolved to a Saxo instrument.')
    return listing


def _change_pct(closes, sessions):
    if len(closes) <= sessions or not closes[-1 - sessions]:
        return None
    return round((closes[-1] / closes[-1 - sessions] - 1) * 100, 2)


def _last(series):
    return series[-1] if series else None


def _summary(candles):
    closes = [c['close'] for c in candles]
    last_close = _last(closes)
    ma20, ma50, ma200 = (_last(sma(closes, period)) for period in (20, 50, 200))
    rsi14 = _last(rsi(closes))
    year = candles[-YEAR_SESSIONS:]
    high_52w = max((c['high'] for c in year), default=None)
    low_52w = min((c['low'] for c in year), default=None)
    pct_from_high = None
    if last_close is not None and high_52w:
        pct_from_high = round((last_close / high_52w - 1) * 100, 2)
    summary = {
        'last_close': last_close,
        'ma20': ma20,
        'ma50': ma50,
        'ma200': ma200,
        'rsi14': rsi14,
        'high_52w': high_52w,
        'low_52w': low_52w,
        'pct_from_52w_high': pct_from_high,
    }
    for key, sessions in CHANGE_SESSIONS.items():
        summary[key] = _change_pct(closes, sessions)
    return summary


def _bar(candle):
    return {key: candle[key] for key in ('date', 'open', 'high', 'low', 'close', 'volume')}


@tool('Find stocks and ETFs on Saxo by name or ticker: symbol, name, currency, exchange.', sources=[SAXO], saxo=True)
def search_instruments(query: str):
    rows = fetch(InstrumentSearchView, query={'q': query, 'asset_types': SEARCH_ASSET_TYPES})
    return {'query': query, 'matches': [_shape(row) for row in rows]}


@tool('Latest prices for one or more tickers, with the day change and its basis (live or last close).', sources=[SAXO], saxo=True)
def get_quotes(symbols: list[str]):
    warnings = []
    by_type = {}
    for symbol in symbols:
        listing = look_up(symbol)
        if not listing.resolved:
            warnings.append(f'{symbol} could not be resolved to a Saxo instrument.')
            continue
        by_type.setdefault(listing.asset_type, {})[listing.uic] = listing
    rows = []
    for asset_type, listings in by_type.items():
        quotes = fetch_optional(QuotesView, warnings, query={'uics': ','.join(str(u) for u in listings), 'asset_type': asset_type})
        for quote in quotes or []:
            listing = listings.get(quote.get('uic'))
            if listing is None:
                continue
            rows.append({
                'symbol': listing.symbol,
                'name': listing.name,
                'currency': listing.currency,
                'price': quote.get('price'),
                'change_pct': quote.get('change_pct'),
                'change_basis': quote.get('change_basis'),
            })
    if rows:
        warnings.append('Prices are 15-minute delayed.')
    return Reply({'quotes': rows}, warnings)


@tool(
    'Price history for a ticker (daily, weekly or monthly bars) with moving averages, RSI, 52-week range and the playbook zone.',
    sources=[SAXO],
    saxo=True,
)
def get_price_history(symbol: str, interval: str = 'weekly', bars: int = 104):
    if interval not in INTERVALS:
        raise Unavailable(f"interval must be one of {', '.join(INTERVALS)}.")
    horizon, cap = INTERVALS[interval]
    count = max(1, min(bars, cap))
    listing = _resolved(symbol)
    daily = _chart(listing, DAILY, DAILY_FETCH)
    series = daily if horizon == DAILY else _chart(listing, horizon, count)
    summary = _summary(daily)
    playbook_zone = zone(
        last_close=summary['last_close'],
        ma20=summary['ma20'],
        ma50=summary['ma50'],
        ma200=summary['ma200'],
        rsi14=summary['rsi14'],
    )
    data = {
        'instrument': listing.as_dict(),
        'bars': [_bar(c) for c in series[-count:]],
        'summary': summary,
        'zone': playbook_zone,
    }
    return Reply(data, [PULLBACK_WARNING] if playbook_zone == 'pullback' else [])


PROFILE_KEYS = ('name', 'exchange', 'industry', 'country', 'ipo_date', 'market_cap', 'shares_outstanding', 'free_float')
SERIES_KEYS = ('ratio_history', 'eps_history', 'recommendation', 'recommendation_history')
STATEMENT_PERIODS = ('annual', 'quarterly')
FINNHUB = 'finnhub'


def _gate(symbol, *, allow_fund=False):
    listing = look_up(symbol)
    reason = listing.refusal(allow_fund=allow_fund)
    if reason:
        raise Unavailable(reason)
    return listing, [listing.unverified_warning] if listing.unverified_warning else []


def _scalar_metrics(payload):
    skip = {'available', *PROFILE_KEYS, *SERIES_KEYS}
    return {k: v for k, v in payload.items() if k not in skip and not isinstance(v, (dict, list))}


def _without_flag(payload):
    return None if payload is None else {k: v for k, v in payload.items() if k != 'available'}


@tool(
    'Company profile, valuation and growth metrics, EPS and earnings history, peers and analyst trend (US-listed stocks only).',
    sources=[FINNHUB],
)
def get_company(symbol: str):
    listing, warnings = _gate(symbol)
    kwargs = {'symbol': listing.ticker}
    fundamentals = fetch_optional(FundamentalsView, warnings, kwargs=kwargs)
    earnings = fetch_optional(SymbolEarningsView, warnings, kwargs=kwargs)
    peers = fetch_optional(PeersView, warnings, kwargs=kwargs)
    data = {
        'profile': {k: fundamentals[k] for k in PROFILE_KEYS if k in fundamentals} if fundamentals else None,
        'metrics': _scalar_metrics(fundamentals) if fundamentals else None,
        'ratio_history': fundamentals.get('ratio_history') if fundamentals else None,
        'eps_history': fundamentals.get('eps_history') if fundamentals else None,
        'earnings': _without_flag(earnings),
        'peers': peers['symbols'] if peers else None,
        'recommendation_trend': fundamentals.get('recommendation_history') if fundamentals else None,
    }
    return Reply(data, warnings)


@tool('Income statement, balance sheet and cash flow rows for a US-listed stock, annual or quarterly.', sources=[FINNHUB, 'sec'])
def get_financial_statements(symbol: str, period: str = 'annual'):
    if period not in STATEMENT_PERIODS:
        raise Unavailable(f"period must be one of {', '.join(STATEMENT_PERIODS)}.")
    listing, warnings = _gate(symbol)
    try:
        payload = fetch(StatementsView, kwargs={'symbol': listing.ticker})
    except Unavailable as missing:
        raise Unavailable(*warnings, *missing.warnings) from missing
    if period == 'quarterly' and payload.get('partial'):
        warnings.append('Quarterly statements are unavailable right now; try again later.')
    return Reply({'period': period, 'periods': payload.get(period)}, warnings)


@tool('Recent SEC filings (10-K, 10-Q, 8-K) and insider trades for a US-listed stock.', sources=[FINNHUB, 'sec'])
def get_filings_and_insiders(symbol: str):
    listing, warnings = _gate(symbol)
    kwargs = {'symbol': listing.ticker}
    data = {
        'filings': _without_flag(fetch_optional(FilingsView, warnings, kwargs=kwargs)),
        'insiders': _without_flag(fetch_optional(InsidersView, warnings, kwargs=kwargs)),
    }
    return Reply(data, warnings)


@tool('Recent company headlines, newest first (US-listed stocks and ETFs).', sources=[FINNHUB])
def get_news(symbol: str, limit: int = 15):
    listing, warnings = _gate(symbol, allow_fund=True)
    try:
        payload = fetch(CompanyNewsView, kwargs={'symbol': listing.ticker})
    except Unavailable as missing:
        raise Unavailable(*warnings, *missing.warnings) from missing
    return Reply(capped(payload['items'], limit), warnings)


@tool("Your own notes for a ticker: thesis, risks, target and stop prices.", sources=['notes'])
def get_my_notes(symbol: str):
    ticker = bare(symbol)
    note = SymbolNote.objects.filter(symbol=ticker).first() or SymbolNote(symbol=ticker)
    return dict(SymbolNoteSerializer(note).data)


@tool('Your watchlists and the instruments in each.', sources=['watchlists'])
def get_watchlists():
    watchlists = []
    for watchlist in Watchlist.objects.prefetch_related('items').order_by('order', 'id'):
        items = [
            without({'symbol': i.symbol, 'name': i.description, 'uic': i.uic, 'asset_type': i.asset_type})
            for i in watchlist.items.all()
        ]
        watchlists.append({'name': watchlist.name, 'items': items})
    return {'watchlists': watchlists}


VALUATION_RATIOS = ('pe_ttm', 'ps_ttm', 'pfcf_ttm', 'ev_ebitda_ttm')
NO_DAILY_PE_WARNING = 'Daily P/E needs Saxo closes, which are unavailable for this symbol.'
HOME_COUNTRY = 'US'


def _foreign_issuer_warning(ticker, country):
    return (
        f'Finnhub lists {ticker} as a {country} company: its EPS may be in another currency '
        'or per ordinary share rather than per ADR, so the daily P/E may be off.'
    )


def _points(rows):
    return [(date.fromisoformat(row['period']), row['v']) for row in rows or []]


def _weekly(points):
    last_of_week = {}
    for day, value in points:
        last_of_week[day.isocalendar()[:2]] = (day, value)
    return [[day.isoformat(), value] for day, value in sorted(last_of_week.values())]


def _daily_pe(listing, eps, warnings):
    if not listing.resolved:
        warnings.append(NO_DAILY_PE_WARNING)
        return []
    try:
        candles = _chart(listing, DAILY, DAILY_FETCH)
    except Unavailable as missing:
        warnings.extend(missing.warnings)
        return []
    closes = [(date.fromisoformat(c['date']), c['close']) for c in candles]
    return trailing_pe(closes, eps)


@tool(
    'Valuation history for a US-listed stock: P/E, P/S, P/FCF and EV/EBITDA series, a daily trailing P/E sampled weekly, and 5-year medians.',
    sources=[FINNHUB, SAXO],
    saxo=True,
)
def get_valuation_history(symbol: str):
    listing, warnings = _gate(symbol)
    ticker = listing.ticker
    try:
        series = finnhub.valuation_series(ticker)
    except ProviderUnavailable as exc:
        raise Unavailable(*warnings, exc.reason) from exc
    country = series.get('country')
    if country and country != HOME_COUNTRY:
        warnings.append(_foreign_issuer_warning(ticker, country))
    quarterly = series['quarterly']
    daily = _daily_pe(listing, _points(quarterly.get('eps')), warnings)
    medians = {name: median_since(_points(quarterly.get(name))) for name in VALUATION_RATIOS}
    medians['daily_pe'] = median_since(daily)
    latest = {name: quarterly[name][-1]['v'] if quarterly.get(name) else None for name in VALUATION_RATIOS}
    latest['daily_pe'] = daily[-1][1] if daily else None
    data = {
        'annual': series['annual'],
        'quarterly': quarterly,
        'daily_pe': _weekly(daily),
        'medians_5y': medians,
        'latest': latest,
    }
    return Reply(data, warnings)
