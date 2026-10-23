from datetime import date

from django.db.models import Min

from portfolio import tax_year
from portfolio.models import Position
from research.views import ChartView
from saxo import client
from saxo.client import SaxoAPIError
from saxo.credentials import SaxoNotConnected, active_credential
from transactions.models import Transaction

from ..envelope import answer, saxo_warnings
from ..views import call_view, problem
from . import tool

DAILY = 1440
CHART_BARS = 1200
COVERAGE_NOTE = (
    "Realised gains come from Saxo's closed-positions list, whose coverage of the full year "
    "is not yet verified; compare with Saxo's annual tax report."
)
FX_NOTE = "FX: today's rate is used for both ends of an unrealised gain."


def _number(value):
    return None if value is None else float(value)


def _opened_on():
    rows = Transaction.objects.filter(type='BUY').values('ticker').annotate(first=Min('date'))
    return {row['ticker']: row['first'] for row in rows}


def _basis_close(position):
    if position.uic is None or not position.asset_type:
        return None, f'{position.ticker} has no Saxo identity, so no 31 December close.'
    result = call_view(
        ChartView,
        query={
            'uic': position.uic,
            'asset_type': position.asset_type,
            'horizon': DAILY,
            'count': CHART_BARS,
        },
    )
    message = problem(result)
    if message:
        return None, f'{position.ticker}: no 31 December close ({message})'
    closes = [
        (candle['date'], candle['close'])
        for candle in result.data or []
        if candle.get('close') is not None and candle['date'] <= tax_year.BASIS_DAY.isoformat()
    ]
    if not closes:
        return None, f'{position.ticker}: no close on or before 31 December 2025.'
    return max(closes)[1], None


def _realised(year):
    try:
        credential = active_credential()
        return tax_year.realised(client.get_closed_positions(credential.access_token), year), None
    except SaxoNotConnected as error:
        return None, f'Realised gains unavailable, Saxo is not connected: {error}'
    except SaxoAPIError:
        return None, 'Realised gains unavailable, Saxo did not answer.'


def _entry(row):
    return {
        key: (value.isoformat() if isinstance(value, date) else _number(value) if hasattr(value, 'quantize') else value)
        for key, value in row.items()
    }


@tool('Belgian tax year: realised gains from Saxo, unrealised gains per position, exemption left and estimated 10% tax.')
def get_tax_year(year: int = 0, carry_over_eur: float = 0):
    year = year or date.today().year
    warnings = saxo_warnings()
    opened_on = _opened_on()
    positions = list(Position.objects.all())

    basis_closes = {}
    for position in positions:
        opened = opened_on.get(position.ticker)
        if opened is None:
            warnings.append(f'{position.ticker} has no recorded purchase, so avg_cost is its basis.')
        elif opened <= tax_year.BASIS_DAY:
            basis_closes[position.ticker], message = _basis_close(position)
            if message:
                warnings.append(message)

    realised_rows, realised_warning = _realised(year)
    if realised_warning:
        warnings.append(realised_warning)
    elif realised_rows is None:
        warnings.append('A closed position this year lacks its account-currency P/L, so realised gains are unknown.')

    unrealised_rows = tax_year.unrealised(positions, basis_closes, opened_on)
    figures = tax_year.summary(realised_rows, unrealised_rows, carry_over_eur)

    warnings.extend([COVERAGE_NOTE, FX_NOTE, tax_year.ADVISER_NOTE])
    data = {
        'year': year,
        'realised': None if realised_rows is None else [_entry(row) for row in realised_rows],
        'unrealised': [_entry(row) for row in unrealised_rows],
        'summary': {key: _number(value) for key, value in figures.items()},
    }
    return answer(data, sources=['saxo', 'portfolio'], warnings=warnings)
