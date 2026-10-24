from datetime import date

from portfolio import tax_year
from research import daily
from research.providers import ProviderError
from saxo import client
from saxo.client import SaxoAPIError
from saxo.credentials import SaxoNotConnected, active_credential

from .. import throttled
from ..envelope import Reply, Unavailable
from . import tool


def _with_uics(token, key, rows, today):
    older = [row for row in rows if (row.get('TradeDateOpen') or '')[:10] <= tax_year.BASIS_DAY.isoformat()]
    if not older:
        return rows
    first = min(row['TradeDateOpen'][:10] for row in older)
    uics = {
        (trade.get('InstrumentSymbol'), trade.get('AssetType')): trade['Uic']
        for trade in client.get_trades_report(token, key, first, today.isoformat())
        if trade.get('Uic')
    }
    return [{**row, 'Uic': uics.get((row.get('InstrumentSymbol'), row.get('AssetType')))} for row in rows]


def _closed_rows(year):
    today = date.today()
    last = min(date(year, 12, 31), today)
    try:
        token = active_credential().access_token
        key = client.get_client_key(token)
        rows = client.get_closed_positions_report(token, key, f'{year}-01-01', last.isoformat())
        return _with_uics(token, key, rows, today), None
    except SaxoNotConnected as error:
        return None, f'Realised gains unavailable, Saxo is not connected: {error}'
    except SaxoAPIError:
        return None, 'Realised gains unavailable, Saxo did not answer.'


def _basis_close(uic, asset_type):
    if uic is None or not asset_type:
        return None, 'no Saxo identity'
    try:
        bars = throttled.bars(uic, asset_type)
    except ProviderError as error:
        return None, daily.reason(error)
    close = daily.close_on_or_before(bars, tax_year.BASIS_DAY)
    return (close, None) if close is not None else (None, 'no close on or before 31 December 2025')


@tool(
    'Advisor: the Belgian tax year (realised gains from Saxo, unrealised gains per position, exemption left and estimated 10% tax).',
    sources=['saxo', 'portfolio'],
    saxo=True,
)
def get_tax_year(year: int = 0, carry_over_eur: float = 0):
    year = year or date.today().year
    try:
        tax_year.ensure_tax_year(year)
    except tax_year.NotATaxYear as refused:
        raise Unavailable(str(refused)) from refused
    if year > date.today().year:
        raise Unavailable(f'The {year} tax year has not started yet.')
    rows, reason = _closed_rows(year)
    result = tax_year.report(year, carry_over_eur, closed_rows=rows, closed_reason=reason, close_on=_basis_close)
    warnings = result.pop('warnings')
    return Reply({'year': year, **result}, warnings)
