from research import daily, finnhub, valuation
from research.listings import SEARCH_ASSET_TYPES, bare
from research.price_summary import summarise
from research.providers import ProviderError, ProviderUnavailable
from research.models import PriceLine, SymbolNote, Watchlist
from research.serializers import PriceLineSerializer, SymbolNoteSerializer
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

from .. import throttled
from ..bounds import at_most
from ..envelope import Reply, Unavailable
from ..shaping import capped, numbers, without
from ..throttled import look_up
from ..views import fetch, fetch_optional
from . import tool

INTERVALS = {'daily': (daily.HORIZON, 260), 'weekly': (10080, 1200), 'monthly': (43200, 1200)}
PULLBACK_WARNING = "Zone ignores the playbook's Value-pillar condition on pullbacks until the lens engine exists."
SAXO = 'saxo'
QUOTE_LIMIT = 20
MAX_BARS = 1200
MAX_NEWS = 100
NOTE_NUMBERS = ('target_price', 'stop_price')


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


def _daily_bars(listing):
    try:
        return throttled.candles(listing)
    except ProviderError as error:
        raise Unavailable(daily.reason(error)) from error


def _resolved(symbol):
    listing = look_up(symbol)
    if not listing.resolved:
        raise Unavailable(f'{symbol} could not be resolved to a Saxo instrument.')
    return listing


def _bar(candle):
    return {key: candle[key] for key in ('date', 'open', 'high', 'low', 'close', 'volume')}


@tool('Research: find stocks and ETFs on Saxo by name or ticker (symbol, name, currency, exchange).', sources=[SAXO], saxo=True)
def search_instruments(query: str):
    rows = fetch(InstrumentSearchView, query={'q': query, 'asset_types': SEARCH_ASSET_TYPES})
    return {'query': query, 'matches': [_shape(row) for row in rows]}


@tool('Research: latest prices for one or more tickers, with the day change and its basis (live or last close).', sources=[SAXO], saxo=True)
def get_quotes(symbols: list[str]):
    warnings = []
    if len(symbols) > QUOTE_LIMIT:
        warnings.append(f'Quotes are limited to {QUOTE_LIMIT} symbols; the rest were left out.')
    by_type = {}
    for symbol in symbols[:QUOTE_LIMIT]:
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
    'Research › Chart: price history for a ticker (daily, weekly or monthly bars) with moving averages, RSI, 52-week range and the playbook zone.',
    sources=[SAXO],
    saxo=True,
)
def get_price_history(symbol: str, interval: str = 'weekly', bars: at_most(MAX_BARS) = 104):
    if interval not in INTERVALS:
        raise Unavailable(f"interval must be one of {', '.join(INTERVALS)}.")
    horizon, cap = INTERVALS[interval]
    count = min(bars, cap)
    listing = _resolved(symbol)
    bars = _daily_bars(listing)
    series = bars if horizon == daily.HORIZON else _chart(listing, horizon, count)
    trend = summarise(bars)
    data = {'instrument': listing.as_dict(), 'bars': [_bar(c) for c in series[-count:]], **trend}
    return Reply(data, [PULLBACK_WARNING] if trend['zone'] == 'pullback' else [])


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
    'Research › Overview: company profile, valuation and growth metrics, EPS and earnings history, peers and analyst trend (US-listed stocks only).',
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


@tool('Research › Financials: income statement, balance sheet and cash flow rows for a US-listed stock, annual or quarterly.', sources=[FINNHUB, 'sec'])
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


@tool('Research › Filings: recent SEC filings (10-K, 10-Q, 8-K) and insider trades for a US-listed stock.', sources=[FINNHUB, 'sec'])
def get_filings_and_insiders(symbol: str):
    listing, warnings = _gate(symbol)
    kwargs = {'symbol': listing.ticker}
    data = {
        'filings': _without_flag(fetch_optional(FilingsView, warnings, kwargs=kwargs)),
        'insiders': _without_flag(fetch_optional(InsidersView, warnings, kwargs=kwargs)),
    }
    return Reply(data, warnings)


@tool('Research › News: recent company headlines, newest first (US-listed stocks and ETFs).', sources=[FINNHUB])
def get_news(symbol: str, limit: at_most(MAX_NEWS) = 15):
    listing, warnings = _gate(symbol, allow_fund=True)
    try:
        payload = fetch(CompanyNewsView, kwargs={'symbol': listing.ticker})
    except Unavailable as missing:
        raise Unavailable(*warnings, *missing.warnings) from missing
    return Reply(capped(payload['items'], limit), warnings)


@tool("Research: your own notes for a ticker (thesis, risks, target and stop prices) and the price lines drawn on its chart.", sources=['notes'])
def get_my_notes(symbol: str):
    listing = look_up(symbol)
    note = SymbolNote.objects.filter(symbol=listing.ticker).first() or SymbolNote(symbol=listing.ticker)
    lines = PriceLine.objects.filter(uic=listing.uic, asset_type=listing.asset_type) if listing.resolved else []
    return {
        **numbers(SymbolNoteSerializer(note).data, NOTE_NUMBERS),
        'price_lines': [numbers(line, ('price',)) for line in PriceLineSerializer(lines, many=True).data],
    }


@tool('Watchlist: your watchlists and the instruments in each.', sources=['watchlists'])
def get_watchlists():
    watchlists = []
    for watchlist in Watchlist.objects.prefetch_related('items').order_by('order', 'id'):
        items = [
            without({'symbol': i.symbol, 'name': i.description, 'uic': i.uic, 'asset_type': i.asset_type})
            for i in watchlist.items.all()
        ]
        watchlists.append({'name': watchlist.name, 'items': items})
    return {'watchlists': watchlists}


@tool(
    'Research › Statistics: valuation history for a US-listed stock (P/E, P/S, P/FCF and EV/EBITDA series), a daily trailing P/E sampled weekly, and 5-year medians.',
    sources=[FINNHUB, SAXO],
    saxo=True,
)
def get_valuation_history(symbol: str):
    listing, warnings = _gate(symbol)
    try:
        series = finnhub.valuation_series(listing.ticker)
    except ProviderUnavailable as exc:
        raise Unavailable(*warnings, exc.reason) from exc
    bars, reason = throttled.available(listing)
    data, notes = valuation.history(listing.ticker, series, bars)
    return Reply(data, [*warnings, *([reason] if reason else []), *notes])
