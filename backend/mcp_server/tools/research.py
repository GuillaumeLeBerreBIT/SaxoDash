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

from ..envelope import answer, saxo_warnings
from ..shaping import capped, without
from ..views import call_view, problem
from ..zones import zone
from . import tool

INTERVAL_HORIZONS = {'daily': 1440, 'weekly': 10080, 'monthly': 43200}
DAILY_BAR_CAP = 260
BAR_CAP = 1200
DAILY_FETCH = 1200
YEAR_SESSIONS = 252
CHANGE_SESSIONS = {'change_1m_pct': 21, 'change_3m_pct': 63, 'change_1y_pct': 252}
PULLBACK_WARNING = "Zone ignores the playbook's Value-pillar condition on pullbacks until the lens engine exists."


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
    return call_view(
        ChartView,
        query={
            'uic': listing.uic,
            'asset_type': listing.asset_type,
            'horizon': horizon,
            'count': count,
        },
    )


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


@tool('Find stocks and ETFs on Saxo by name or ticker: symbol, name, currency, exchange.')
def search_instruments(query: str):
    warnings = saxo_warnings()
    result = call_view(InstrumentSearchView, query={'q': query, 'asset_types': SEARCH_ASSET_TYPES})
    message = problem(result)
    if message:
        return answer(None, sources=['saxo'], warnings=[*warnings, message])
    matches = [_shape(row) for row in result.data]
    return answer({'query': query, 'matches': matches}, sources=['saxo'], warnings=warnings)


@tool('Latest prices for one or more tickers, with the day change and its basis (live or last close).')
def get_quotes(symbols: list[str]):
    warnings = saxo_warnings()
    by_type = {}
    for symbol in symbols:
        listing = look_up(symbol)
        if not listing.resolved:
            warnings.append(f'{symbol} could not be resolved to a Saxo instrument.')
            continue
        by_type.setdefault(listing.asset_type, {})[listing.uic] = listing
    rows = []
    for asset_type, instruments in by_type.items():
        result = call_view(QuotesView, query={'uics': ','.join(str(u) for u in instruments), 'asset_type': asset_type})
        message = problem(result)
        if message:
            warnings.append(message)
            continue
        for quote in result.data:
            listing = instruments.get(quote['uic'])
            if listing is None:
                continue
            rows.append({
                'symbol': listing.symbol,
                'name': listing.name,
                'currency': listing.currency,
                'price': quote['price'],
                'change_pct': quote['change_pct'],
                'change_basis': quote['change_basis'],
            })
    if rows:
        warnings.append('Prices are 15-minute delayed.')
    return answer({'quotes': rows}, sources=['saxo'], warnings=warnings)


@tool('Price history for a ticker (daily, weekly or monthly bars) with moving averages, RSI, 52-week range and the playbook zone.')
def get_price_history(symbol: str, interval: str = 'weekly', bars: int = 104):
    warnings = saxo_warnings()
    if interval not in INTERVAL_HORIZONS:
        return answer(None, sources=['saxo'], warnings=[*warnings, f"interval must be one of {', '.join(INTERVAL_HORIZONS)}."])
    listing = look_up(symbol)
    if not listing.resolved:
        return answer(None, sources=['saxo'], warnings=[*warnings, f'{symbol} could not be resolved to a Saxo instrument.'])

    daily = _chart(listing, INTERVAL_HORIZONS['daily'], DAILY_FETCH)
    message = problem(daily)
    if message:
        return answer(None, sources=['saxo'], warnings=[*warnings, message])
    daily_candles = daily.data

    cap = DAILY_BAR_CAP if interval == 'daily' else BAR_CAP
    count = max(1, min(bars, cap))
    if interval == 'daily':
        series = daily_candles
    else:
        other = _chart(listing, INTERVAL_HORIZONS[interval], count)
        message = problem(other)
        if message:
            return answer(None, sources=['saxo'], warnings=[*warnings, message])
        series = other.data

    summary = _summary(daily_candles)
    playbook_zone = zone(
        last_close=summary['last_close'],
        ma20=summary['ma20'],
        ma50=summary['ma50'],
        ma200=summary['ma200'],
        rsi14=summary['rsi14'],
    )
    if playbook_zone == 'pullback':
        warnings.append(PULLBACK_WARNING)
    data = {
        'instrument': listing.as_dict(),
        'bars': [_bar(c) for c in series[-count:]],
        'summary': summary,
        'zone': playbook_zone,
    }
    return answer(data, sources=['saxo'], warnings=warnings)


PROFILE_KEYS = ('name', 'exchange', 'industry', 'country', 'ipo_date', 'market_cap', 'shares_outstanding', 'free_float')
SERIES_KEYS = ('ratio_history', 'eps_history', 'recommendation', 'recommendation_history')
STATEMENT_PERIODS = ('annual', 'quarterly')
FINNHUB = 'finnhub'


def _gate(symbol, *, allow_fund=False):
    listing = look_up(symbol)
    reason = listing.refusal(allow_fund=allow_fund)
    if reason:
        return listing, answer(None, sources=[FINNHUB], warnings=[reason])
    return listing, None


def _listing_warnings(listing):
    return [listing.unverified_warning] if listing.unverified_warning else []


def _part(view_class, ticker):
    result = call_view(view_class, kwargs={'symbol': ticker})
    message = problem(result)
    if message:
        return None, message
    return without(result.data), None


def _scalar_metrics(payload):
    skip = {'available', *PROFILE_KEYS, *SERIES_KEYS}
    return {k: v for k, v in payload.items() if k not in skip and not isinstance(v, (dict, list))}


@tool('Company profile, valuation and growth metrics, EPS and earnings history, peers and analyst trend (US-listed stocks only).')
def get_company(symbol: str):
    listing, refused = _gate(symbol)
    if refused:
        return refused
    ticker = listing.ticker
    warnings = _listing_warnings(listing)
    fundamentals, message = _part(FundamentalsView, ticker)
    if message:
        warnings.append(message)
    earnings, message = _part(SymbolEarningsView, ticker)
    if message:
        warnings.append(message)
    peers, message = _part(PeersView, ticker)
    if message:
        warnings.append(message)
    data = {
        'profile': {k: fundamentals[k] for k in PROFILE_KEYS if k in fundamentals} if fundamentals else None,
        'metrics': _scalar_metrics(fundamentals) if fundamentals else None,
        'ratio_history': fundamentals.get('ratio_history') if fundamentals else None,
        'eps_history': fundamentals.get('eps_history') if fundamentals else None,
        'earnings': {k: v for k, v in earnings.items() if k != 'available'} if earnings else None,
        'peers': peers['symbols'] if peers else None,
        'recommendation_trend': fundamentals.get('recommendation_history') if fundamentals else None,
    }
    return answer(data, sources=[FINNHUB], warnings=warnings)


@tool('Income statement, balance sheet and cash flow rows for a US-listed stock, annual or quarterly.')
def get_financial_statements(symbol: str, period: str = 'annual'):
    if period not in STATEMENT_PERIODS:
        return answer(None, sources=[FINNHUB], warnings=[f"period must be one of {', '.join(STATEMENT_PERIODS)}."])
    listing, refused = _gate(symbol)
    if refused:
        return refused
    warnings = _listing_warnings(listing)
    payload, message = _part(StatementsView, listing.ticker)
    if message:
        return answer(None, sources=[FINNHUB], warnings=[*warnings, message])
    if period == 'quarterly' and payload.get('partial'):
        warnings.append('Quarterly statements are unavailable right now; try again later.')
    data = {'period': period, 'periods': payload.get(period)}
    return answer(data, sources=[FINNHUB, 'sec'], warnings=warnings)


@tool('Recent SEC filings (10-K, 10-Q, 8-K) and insider trades for a US-listed stock.')
def get_filings_and_insiders(symbol: str):
    listing, refused = _gate(symbol)
    if refused:
        return refused
    ticker = listing.ticker
    warnings = _listing_warnings(listing)
    filings, message = _part(FilingsView, ticker)
    if message:
        warnings.append(message)
    insiders, message = _part(InsidersView, ticker)
    if message:
        warnings.append(message)
    data = {
        'filings': {k: v for k, v in filings.items() if k != 'available'} if filings else None,
        'insiders': {k: v for k, v in insiders.items() if k != 'available'} if insiders else None,
    }
    return answer(data, sources=[FINNHUB, 'sec'], warnings=warnings)


@tool('Recent company headlines, newest first (US-listed stocks and ETFs).')
def get_news(symbol: str, limit: int = 15):
    listing, refused = _gate(symbol, allow_fund=True)
    if refused:
        return refused
    warnings = _listing_warnings(listing)
    payload, message = _part(CompanyNewsView, listing.ticker)
    if message:
        return answer(None, sources=[FINNHUB], warnings=[*warnings, message])
    return answer(capped(payload['items'], limit), sources=[FINNHUB], warnings=warnings)


@tool("Your own notes for a ticker: thesis, risks, target and stop prices.")
def get_my_notes(symbol: str):
    ticker = bare(symbol)
    note = SymbolNote.objects.filter(symbol=ticker).first() or SymbolNote(symbol=ticker)
    return answer(dict(SymbolNoteSerializer(note).data), sources=['notes'])


@tool('Your watchlists and the instruments in each.')
def get_watchlists():
    watchlists = []
    for watchlist in Watchlist.objects.prefetch_related('items').order_by('order', 'id'):
        items = [
            without({'symbol': i.symbol, 'name': i.description, 'uic': i.uic, 'asset_type': i.asset_type})
            for i in watchlist.items.all()
        ]
        watchlists.append({'name': watchlist.name, 'items': items})
    return answer({'watchlists': watchlists}, sources=['watchlists'])


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
    result = _chart(listing, INTERVAL_HORIZONS['daily'], DAILY_FETCH)
    message = problem(result)
    if message:
        warnings.append(message)
        return []
    closes = [(date.fromisoformat(c['date']), c['close']) for c in result.data]
    return trailing_pe(closes, eps)


@tool('Valuation history for a US-listed stock: P/E, P/S, P/FCF and EV/EBITDA series, a daily trailing P/E sampled weekly, and 5-year medians.')
def get_valuation_history(symbol: str):
    listing, refused = _gate(symbol)
    if refused:
        return refused
    ticker = listing.ticker
    try:
        series = finnhub.valuation_series(ticker)
    except ProviderUnavailable as exc:
        return answer(None, sources=[FINNHUB], warnings=[*_listing_warnings(listing), exc.reason])
    warnings = saxo_warnings() if listing.resolved else []
    warnings.extend(_listing_warnings(listing))
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
    return answer(data, sources=[FINNHUB, 'saxo'], warnings=warnings)
