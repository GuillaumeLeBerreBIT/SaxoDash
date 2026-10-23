from datetime import date

from portfolio.models import Position
from research import finnhub
from research.providers import ProviderUnavailable
from research.valuation import median_since, trailing_pe
from research.technicals import rsi, sma
from research.models import SymbolNote, Watchlist
from research.serializers import SymbolNoteSerializer
from research.views import (
    ChartView,
    CompanyNewsView,
    FilingsView,
    FundamentalsView,
    InsidersView,
    InstrumentDetailsView,
    InstrumentSearchView,
    PeersView,
    QuotesView,
    StatementsView,
    SymbolEarningsView,
)

from .. import company_data
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
SEARCH_ASSET_TYPES = 'Stock,Etf'
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


def _bare(symbol):
    return symbol.split(':')[0].strip().upper()


def _held(symbol):
    position = Position.objects.filter(ticker__iexact=symbol, uic__isnull=False).order_by('id').first()
    if position is None or not position.asset_type:
        return None
    return {
        'symbol': position.ticker,
        'name': position.name,
        'uic': position.uic,
        'asset_type': position.asset_type,
        'currency': position.currency,
        'exchange': None,
    }


def _details_currency(uic, asset_type):
    result = call_view(InstrumentDetailsView, kwargs={'uic': uic, 'asset_type': asset_type})
    if problem(result):
        return None
    return result.data.get('currency') or None


def resolve(symbol):
    wanted = _bare(symbol)
    held = _held(wanted)
    if held is not None:
        return held
    result = call_view(InstrumentSearchView, query={'q': wanted, 'asset_types': SEARCH_ASSET_TYPES})
    if problem(result) or not isinstance(result.data, list):
        return None
    matches = [row for row in result.data if _bare(row.get('symbol') or '') == wanted]
    if not matches:
        return None
    row = next((r for r in matches if r.get('currency') == company_data.COMPANY_DATA_CURRENCY), matches[0])
    instrument = _shape(row)
    if instrument['currency'] is None:
        instrument['currency'] = _details_currency(instrument['uic'], instrument['asset_type'])
    return instrument


def _chart(instrument, horizon, count):
    return call_view(
        ChartView,
        query={
            'uic': instrument['uic'],
            'asset_type': instrument['asset_type'],
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
def search_instruments(query):
    warnings = saxo_warnings()
    result = call_view(InstrumentSearchView, query={'q': query, 'asset_types': SEARCH_ASSET_TYPES})
    message = problem(result)
    if message:
        return answer(None, sources=['saxo'], warnings=[*warnings, message])
    matches = [_shape(row) for row in result.data]
    return answer({'query': query, 'matches': matches}, sources=['saxo'], warnings=warnings)


@tool('Latest prices for one or more tickers, with the day change and its basis (live or last close).')
def get_quotes(symbols):
    warnings = saxo_warnings()
    by_type = {}
    for symbol in symbols:
        instrument = resolve(symbol)
        if instrument is None:
            warnings.append(f'{symbol} could not be resolved to a Saxo instrument.')
            continue
        by_type.setdefault(instrument['asset_type'], {})[instrument['uic']] = instrument
    rows = []
    for asset_type, instruments in by_type.items():
        result = call_view(QuotesView, query={'uics': ','.join(str(u) for u in instruments), 'asset_type': asset_type})
        message = problem(result)
        if message:
            warnings.append(message)
            continue
        for quote in result.data:
            instrument = instruments.get(quote['uic'])
            if instrument is None:
                continue
            rows.append({
                'symbol': instrument['symbol'],
                'name': instrument['name'],
                'currency': instrument['currency'],
                'price': quote['price'],
                'change_pct': quote['change_pct'],
                'change_basis': quote['change_basis'],
            })
    if rows:
        warnings.append('Prices are 15-minute delayed.')
    return answer({'quotes': rows}, sources=['saxo'], warnings=warnings)


@tool('Price history for a ticker (daily, weekly or monthly bars) with moving averages, RSI, 52-week range and the playbook zone.')
def get_price_history(symbol, interval='weekly', bars=104):
    warnings = saxo_warnings()
    if interval not in INTERVAL_HORIZONS:
        return answer(None, sources=['saxo'], warnings=[*warnings, f"interval must be one of {', '.join(INTERVAL_HORIZONS)}."])
    instrument = resolve(symbol)
    if instrument is None:
        return answer(None, sources=['saxo'], warnings=[*warnings, f'{symbol} could not be resolved to a Saxo instrument.'])

    daily = _chart(instrument, INTERVAL_HORIZONS['daily'], DAILY_FETCH)
    message = problem(daily)
    if message:
        return answer(None, sources=['saxo'], warnings=[*warnings, message])
    daily_candles = daily.data

    cap = DAILY_BAR_CAP if interval == 'daily' else BAR_CAP
    count = max(1, min(int(bars), cap))
    if interval == 'daily':
        series = daily_candles
    else:
        other = _chart(instrument, INTERVAL_HORIZONS[interval], count)
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
        'instrument': instrument,
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
    instrument = resolve(symbol)
    status = company_data.status(
        asset_type=instrument['asset_type'] if instrument else None,
        currency=instrument['currency'] if instrument else None,
        resolved=instrument is not None,
    )
    if status == company_data.ELIGIBLE or (allow_fund and status == company_data.FUND):
        return _bare(symbol), None
    return None, answer(None, sources=[FINNHUB], warnings=[company_data.refusal(status)])


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
def get_company(symbol):
    ticker, refused = _gate(symbol)
    if refused:
        return refused
    warnings = []
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
def get_financial_statements(symbol, period='annual'):
    if period not in STATEMENT_PERIODS:
        return answer(None, sources=[FINNHUB], warnings=[f"period must be one of {', '.join(STATEMENT_PERIODS)}."])
    ticker, refused = _gate(symbol)
    if refused:
        return refused
    payload, message = _part(StatementsView, ticker)
    if message:
        return answer(None, sources=[FINNHUB], warnings=[message])
    warnings = []
    if period == 'quarterly' and payload.get('partial'):
        warnings.append('Quarterly statements are unavailable right now; try again later.')
    data = {'period': period, 'periods': payload.get(period)}
    return answer(data, sources=[FINNHUB, 'sec'], warnings=warnings)


@tool('Recent SEC filings (10-K, 10-Q, 8-K) and insider trades for a US-listed stock.')
def get_filings_and_insiders(symbol):
    ticker, refused = _gate(symbol)
    if refused:
        return refused
    warnings = []
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
def get_news(symbol, limit=15):
    ticker, refused = _gate(symbol, allow_fund=True)
    if refused:
        return refused
    payload, message = _part(CompanyNewsView, ticker)
    if message:
        return answer(None, sources=[FINNHUB], warnings=[message])
    return answer(capped(payload['items'], int(limit)), sources=[FINNHUB])


@tool("Your own notes for a ticker: thesis, risks, target and stop prices.")
def get_my_notes(symbol):
    ticker = _bare(symbol)
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
UNVERIFIED_CURRENCY_WARNING = 'The listing currency was not verified, so the symbol is assumed to be US-listed.'
NO_DAILY_PE_WARNING = 'Daily P/E needs Saxo closes, which are unavailable for this symbol.'


def _points(rows):
    return [(date.fromisoformat(row['period']), row['v']) for row in rows or []]


def _weekly(points):
    last_of_week = {}
    for day, value in points:
        last_of_week[day.isocalendar()[:2]] = (day, value)
    return [[day.isoformat(), value] for day, value in sorted(last_of_week.values())]


def _daily_pe(instrument, eps, warnings):
    if instrument is None:
        warnings.append(NO_DAILY_PE_WARNING)
        return []
    result = _chart(instrument, INTERVAL_HORIZONS['daily'], DAILY_FETCH)
    message = problem(result)
    if message:
        warnings.append(message)
        return []
    closes = [(date.fromisoformat(c['date']), c['close']) for c in result.data]
    return trailing_pe(closes, eps)


@tool('Valuation history for a US-listed stock: P/E, P/S, P/FCF and EV/EBITDA series, a daily trailing P/E sampled weekly, and 5-year medians.')
def get_valuation_history(symbol):
    ticker, refused = _gate(symbol)
    if refused:
        return refused
    try:
        series = finnhub.valuation_series(ticker)
    except ProviderUnavailable as exc:
        return answer(None, sources=[FINNHUB], warnings=[exc.reason])
    instrument = resolve(symbol)
    warnings = saxo_warnings() if instrument else []
    if instrument is None or not instrument['currency']:
        warnings.append(UNVERIFIED_CURRENCY_WARNING)
    quarterly = series['quarterly']
    daily = _daily_pe(instrument, _points(quarterly.get('eps')), warnings)
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
