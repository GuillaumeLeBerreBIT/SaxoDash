from saxo import client

from . import market
from .providers import ProviderError, ProviderNotConnected

HORIZON = 1440
NOT_CONNECTED = 'Saxo is not connected — reconnect in the app.'
UPSTREAM = 'Upstream error (502).'


def bars(uic, asset_type, saxo=market):
    return saxo.chart(uic, asset_type, HORIZON, client.CHART_MAX_COUNT)


def candles(listing, saxo=market):
    return bars(listing.uic, listing.asset_type, saxo)


def _closes(bars):
    return [(bar['date'], bar['close']) for bar in bars if bar.get('close') is not None]


def latest_close(bars):
    closes = _closes(bars)
    return closes[-1][1] if closes else None


def close_on_or_before(bars, day):
    closes = [close for when, close in _closes(bars) if when <= day.isoformat()]
    return closes[-1] if closes else None


def reason(error):
    if isinstance(error, ProviderNotConnected):
        return NOT_CONNECTED
    return str(error) or UPSTREAM


def available(listing, saxo=market):
    if not listing.resolved:
        return None, None
    try:
        return candles(listing, saxo), None
    except ProviderError as error:
        return None, reason(error)
