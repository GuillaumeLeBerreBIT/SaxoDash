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


def _closed_rows():
    try:
        return client.get_closed_positions(active_credential().access_token), None
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
    rows, reason = _closed_rows()
    result = tax_year.report(year, carry_over_eur, closed_rows=rows, closed_reason=reason, close_on=_basis_close)
    warnings = result.pop('warnings')
    return Reply({'year': year, **result}, warnings)
