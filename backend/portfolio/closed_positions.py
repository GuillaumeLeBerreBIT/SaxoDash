from datetime import date

from django.core.cache import cache

from saxo import client
from saxo.client import SaxoAPIError
from saxo.credentials import SaxoNotConnected, active_credential

from .tax_year import BASIS_DAY

CACHE_TTL = 600
UNANSWERED = 'Realised gains unavailable, Saxo did not answer.'


def _with_uics(token, key, rows, today):
    older = [row for row in rows if (row.get('TradeDateOpen') or '')[:10] <= BASIS_DAY.isoformat()]
    if not older:
        return rows
    first = min(row['TradeDateOpen'][:10] for row in older)
    uics = {
        (trade.get('InstrumentSymbol'), trade.get('AssetType')): trade['Uic']
        for trade in client.get_trades_report(token, key, first, today.isoformat())
        if trade.get('Uic')
    }
    return [{**row, 'Uic': uics.get((row.get('InstrumentSymbol'), row.get('AssetType')))} for row in rows]


def _fetched(year, last, today):
    token = active_credential().access_token
    key = client.get_client_key(token)
    rows = client.get_closed_positions_report(token, key, f'{year}-01-01', last.isoformat())
    return _with_uics(token, key, rows, today)


def for_year(year, today=None):
    today = today or date.today()
    last = min(date(year, 12, 31), today)
    cache_key = f'portfolio:closed-positions:v1:{year}:{last.isoformat()}'
    rows = cache.get(cache_key)
    if rows is not None:
        return rows, None
    try:
        rows = _fetched(year, last, today)
    except SaxoNotConnected as error:
        return None, f'Realised gains unavailable, Saxo is not connected: {error}'
    except SaxoAPIError:
        return None, UNANSWERED
    cache.set(cache_key, rows, CACHE_TTL)
    return rows, None
