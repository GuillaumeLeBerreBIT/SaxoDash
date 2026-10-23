from datetime import date

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


def _lots():
    lots = {}
    for row in Transaction.objects.filter(type='BUY').values('ticker', 'date', 'qty', 'price'):
        lots.setdefault(row['ticker'], []).append((row['date'], row['qty'], row['price']))
    return lots


def _basis_close(ticker, uic, asset_type):
    if uic is None or not asset_type:
        return None, f'{ticker} has no Saxo identity, so no 31 December close.'
    result = call_view(
        ChartView,
        query={'uic': uic, 'asset_type': asset_type, 'horizon': DAILY, 'count': CHART_BARS},
    )
    message = problem(result)
    if message:
        return None, f'{ticker}: no 31 December close ({message})'
    closes = [
        (candle['date'], candle['close'])
        for candle in result.data or []
        if candle.get('close') is not None and candle['date'] <= tax_year.BASIS_DAY.isoformat()
    ]
    if not closes:
        return None, f'{ticker}: no close on or before 31 December 2025.'
    return max(closes)[1], None


def _realised(year, warnings):
    try:
        credential = active_credential()
        rows = client.get_closed_positions(credential.access_token)
    except SaxoNotConnected as error:
        return None, f'Realised gains unavailable, Saxo is not connected: {error}'
    except SaxoAPIError:
        return None, 'Realised gains unavailable, Saxo did not answer.'
    basis_closes = {}
    for (uic, asset_type), ticker in tax_year.basis_instruments(rows, year).items():
        basis_closes[(uic, asset_type)], message = _basis_close(ticker, uic, asset_type)
        if message:
            warnings.append(message)
    return tax_year.realised(rows, year, basis_closes)


def _entry(row):
    return {
        key: (value.isoformat() if isinstance(value, date) else _number(value) if hasattr(value, 'quantize') else value)
        for key, value in row.items()
    }


@tool('Belgian tax year: realised gains from Saxo, unrealised gains per position, exemption left and estimated 10% tax.')
def get_tax_year(year: int = 0, carry_over_eur: float = 0):
    year = year or date.today().year
    warnings = saxo_warnings()
    lots = _lots()
    positions = list(Position.objects.all())

    basis_closes = {}
    for position in positions:
        held = lots.get(position.ticker)
        if not held:
            warnings.append(f'{position.ticker} has no recorded purchase, so avg_cost is its basis.')
        elif tax_year.needs_basis_close(held):
            basis_closes[position.ticker], message = _basis_close(position.ticker, position.uic, position.asset_type)
            if message:
                warnings.append(message)

    realised_rows, realised_warning = _realised(year, warnings)
    if realised_warning:
        warnings.append(realised_warning)

    unrealised_rows = tax_year.unrealised(positions, basis_closes, lots)
    for row in unrealised_rows:
        if row['basis_source'] == tax_year.UNSPLIT_BASIS:
            warnings.append(
                f"{row['ticker']} has lots on both sides of 31 December 2025 and sales since, "
                'so its basis cannot be split and its unrealised gain is unknown.'
            )
    figures = tax_year.summary(realised_rows, unrealised_rows, carry_over_eur)

    warnings.extend([COVERAGE_NOTE, FX_NOTE, tax_year.ADVISER_NOTE])
    data = {
        'year': year,
        'realised': None if realised_rows is None else [_entry(row) for row in realised_rows],
        'unrealised': [_entry(row) for row in unrealised_rows],
        'summary': {key: _number(value) for key, value in figures.items()},
    }
    return answer(data, sources=['saxo', 'portfolio'], warnings=warnings)
