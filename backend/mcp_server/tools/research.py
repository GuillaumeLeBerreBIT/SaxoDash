from portfolio.models import Position
from research.technicals import rsi, sma
from research.views import ChartView, InstrumentDetailsView, InstrumentSearchView, QuotesView

from ..envelope import answer, saxo_warnings
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
    position = Position.objects.filter(ticker__iexact=symbol, uic__isnull=False).first()
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
    for row in result.data:
        if _bare(row.get('symbol') or '') == wanted:
            instrument = _shape(row)
            if instrument['currency'] is None:
                instrument['currency'] = _details_currency(instrument['uic'], instrument['asset_type'])
            return instrument
    return None


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
