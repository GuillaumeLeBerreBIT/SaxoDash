from datetime import date
from typing import Annotated

from pydantic import Field

from portfolio import closed_positions, tax_year
from research import daily
from research.providers import ProviderError

from .. import throttled
from ..bounds import Euros
from ..envelope import Reply, Unavailable
from ..views import app_user
from . import tool


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
def get_tax_year(year: Annotated[int, Field(ge=0)] = 0, carry_over_eur: Euros = 0):
    year = year or date.today().year
    try:
        tax_year.ensure_tax_year(year)
    except tax_year.NotATaxYear as refused:
        raise Unavailable(str(refused)) from refused
    if year > date.today().year:
        raise Unavailable(f'The {year} tax year has not started yet.')
    rows, reason = closed_positions.for_year(year, user=app_user())
    result = tax_year.report(year, carry_over_eur, closed_rows=rows, closed_reason=reason, close_on=_basis_close)
    warnings = result.pop('warnings')
    return Reply({'year': year, **result}, warnings)
