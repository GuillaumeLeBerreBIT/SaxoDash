"""Read-only market data from Saxo, shaped for the frontend and cached.

One module owns the whole path - resolve a credential, call Saxo, rename its
PascalCase payloads to the snake_case the app speaks, cache the result - so
the views stay four thin wrappers and the shaping is testable on its own.

TTLs are per-endpoint because the data ages very differently: a quote is stale
in seconds, an instrument's ISIN is not stale in a day. They also stand in for
rate limiting, which Saxo applies per app and not per user.
"""

from django.core.cache import cache

from saxo import client
from saxo.credentials import active_credential

QUOTES_TTL = 20
CHART_TTL = 900
SEARCH_TTL = 3600
DETAILS_TTL = 86400


def _cached(key, ttl, produce):
    return cache.get_or_set(key, produce, ttl)


def _cache_key(name, **params):
    parts = '&'.join(f'{k}={v}' for k, v in sorted(params.items()))
    return f'research:{name}:{parts}'


def _access_token():
    return active_credential().access_token


def _bare_symbol(symbol):
    """'NVDA:xnas' -> 'NVDA', matching how positions store their ticker."""
    return (symbol or '').split(':')[0]


def to_candle(sample):
    """One Saxo chart sample -> the shape the frontend chart consumes.

    Saxo sends Open/High/Low/Close for tradable-price instruments and the
    OpenBid/…/CloseBid family for quoted ones; take whichever is present.
    """
    def price(field):
        value = sample.get(field, sample.get(f'{field}Bid', sample.get(f'{field}Ask')))
        return None if value is None else float(value)

    return {
        'date': sample['Time'][:10],
        'open': price('Open'),
        'high': price('High'),
        'low': price('Low'),
        'close': price('Close'),
        'volume': float(sample.get('Volume', 0) or 0),
    }


def to_instrument(row):
    return {
        'symbol': _bare_symbol(row.get('Symbol')),
        'uic': row.get('Identifier', row.get('Uic')),
        'asset_type': row.get('AssetType', 'Stock'),
        'description': row.get('Description', ''),
        'exchange': row.get('ExchangeId', ''),
        'currency': row.get('CurrencyCode', ''),
    }


def to_details(row):
    exchange = row.get('Exchange') or {}
    return {
        **to_instrument(row),
        'uic': row.get('Uic', row.get('Identifier')),
        'exchange': exchange.get('ExchangeId', row.get('ExchangeId', '')),
        'exchange_name': exchange.get('Name', ''),
        'isin': row.get('Isin', ''),
        'lot_size': row.get('LotSize'),
    }


def to_quote(row):
    quote = row.get('Quote') or {}
    price_info = row.get('PriceInfo') or {}
    details = row.get('PriceInfoDetails') or {}

    price = details.get('LastTraded') or quote.get('Mid') or quote.get('Bid')

    return {
        'uic': row.get('Uic'),
        'asset_type': row.get('AssetType', ''),
        'price': None if price is None else float(price),
        'bid': quote.get('Bid'),
        'ask': quote.get('Ask'),
        'change_pct': price_info.get('PercentChange'),
    }


def chart(uic, asset_type, horizon, count):
    def produce():
        samples = client.get_chart(_access_token(), uic, asset_type, horizon, count)
        candles = [to_candle(s) for s in samples if s.get('Time')]
        # Saxo returns newest-first for some horizons; the chart draws left to right.
        return sorted(candles, key=lambda c: c['date'])

    key = _cache_key('chart', uic=uic, asset_type=asset_type, horizon=horizon, count=count)
    return _cached(key, CHART_TTL, produce)


def search(keywords, asset_types='Stock,Etf'):
    def produce():
        rows = client.search_instruments(_access_token(), keywords, asset_types)
        return [to_instrument(r) for r in rows]

    key = _cache_key('search', q=keywords.lower(), asset_types=asset_types)
    return _cached(key, SEARCH_TTL, produce)


def details(uic, asset_type):
    def produce():
        return to_details(client.get_instrument_details(_access_token(), uic, asset_type))

    return _cached(_cache_key('details', uic=uic, asset_type=asset_type), DETAILS_TTL, produce)


def quotes(uics, asset_type):
    """Prices for several instruments in one Saxo call.

    Batched deliberately: the watchlist rail asks for every row at once, and
    one infoprices/list request costs the same rate-limit budget as one quote.
    """
    if not uics:
        return []

    def produce():
        rows = client.get_infoprices(_access_token(), uics, asset_type)
        return [to_quote(r) for r in rows]

    key = _cache_key('quotes', uics=','.join(str(u) for u in sorted(uics)), asset_type=asset_type)
    return _cached(key, QUOTES_TTL, produce)
