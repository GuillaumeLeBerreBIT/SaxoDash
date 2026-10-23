from datetime import UTC, date
from decimal import ROUND_HALF_UP, Decimal
from zoneinfo import ZoneInfo

from django.utils.dateparse import parse_datetime

from saxo.mapping import bare_symbol

RATE = Decimal('0.10')
EXEMPTION_EUR = Decimal('10000')
CARRY_OVER_CAP_EUR = Decimal('5000')
BASIS_DAY = date(2025, 12, 31)
ADVISER_NOTE = 'Check with a Belgian tax adviser.'
TAX_ZONE = ZoneInfo('Europe/Brussels')

SAXO_BASIS = 'saxo'
DEC_31_BASIS = 'dec_31_2025'
COST_BASIS = 'avg_cost'
SPLIT_BASIS = 'dec_31_2025_and_cost'
UNSPLIT_BASIS = 'unsplit'

CENT = Decimal('0.01')


def _cents(value):
    return Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)


def _decimal(value):
    return Decimal(str(value))


def local_day(stamp):
    moment = parse_datetime(stamp) if stamp else None
    if moment is None:
        return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    return moment.astimezone(TAX_ZONE).date()


def _ticker(row):
    return bare_symbol(row.get('DisplayAndFormat', {}).get('Symbol'))


def _instrument(base):
    return base.get('Uic'), base.get('AssetType')


def _closed_in(rows, year):
    for row in rows:
        base = row['ClosedPosition']
        closed_on = local_day(base.get('ExecutionTimeClose'))
        if closed_on is None or closed_on.year == year:
            yield row, base, closed_on


def _opened_before_basis(base):
    opened_on = local_day(base.get('ExecutionTimeOpen'))
    return opened_on is not None and opened_on <= BASIS_DAY


def basis_instruments(rows, year):
    return {
        _instrument(base): _ticker(row)
        for row, base, closed_on in _closed_in(rows, year)
        if closed_on is not None and _opened_before_basis(base)
    }


def _rebased(base, basis_close):
    closing = base.get('ClosingPrice')
    rate = base.get('ConversionRateClose')
    if basis_close is None or closing is None or rate is None:
        return None
    direction = 1 if base.get('BuyOrSell') == 'Buy' else -1
    move = _decimal(closing) - _decimal(basis_close)
    return _cents(direction * move * _decimal(abs(base['Amount'])) * _decimal(rate))


def realised(rows, year, basis_closes):
    entries = []
    for row, base, closed_on in _closed_in(rows, year):
        ticker = _ticker(row)
        if closed_on is None:
            return None, f'{ticker}: a closed position has no close time, so realised gains are unknown.'
        if local_day(base.get('ExecutionTimeOpen')) is None:
            return None, f'{ticker}: a closed position has no opening time, so its tax basis is unknown.'
        if _opened_before_basis(base):
            source = DEC_31_BASIS
            gain = _rebased(base, basis_closes.get(_instrument(base)))
            if gain is None:
                return None, (
                    f'{ticker}: a lot bought before 2026 needs its 31 December 2025 close, its closing price '
                    'and its conversion rate, and one is missing, so realised gains are unknown.'
                )
        else:
            source = SAXO_BASIS
            pnl = base.get('ProfitLossOnTradeInBaseCurrency')
            if pnl is None:
                return None, f'{ticker}: a closed position lacks its account-currency P/L, so realised gains are unknown.'
            gain = _cents(_decimal(pnl))
        entries.append({
            'ticker': ticker,
            'closed_on': closed_on,
            'qty': _decimal(abs(base['Amount'])),
            'basis_source': source,
            'realised_eur': gain,
        })
    return entries, None


def _basis(position, basis_close, lots):
    before = sum((qty for day, qty, _ in lots if day <= BASIS_DAY), Decimal('0'))
    after = [(qty, price) for day, qty, price in lots if day > BASIS_DAY]
    if not before:
        return COST_BASIS, _decimal(position.avg_cost)
    if not after:
        return DEC_31_BASIS, None if basis_close is None else _decimal(basis_close)
    if before + sum(qty for qty, _ in after) != position.qty:
        return UNSPLIT_BASIS, None
    if basis_close is None:
        return SPLIT_BASIS, None
    cost = before * _decimal(basis_close) + sum(qty * price for qty, price in after)
    return SPLIT_BASIS, cost / position.qty


def needs_basis_close(lots):
    return any(day <= BASIS_DAY for day, _, _ in lots)


def unrealised(positions, basis_closes, lots):
    rows = []
    for position in positions:
        source, basis = _basis(position, basis_closes.get(position.ticker), lots.get(position.ticker) or [])
        gain = None
        if basis is not None:
            gain = _cents(position.qty * (position.current_price - basis) * position.fx_rate)
        rows.append({
            'ticker': position.ticker,
            'basis': None if basis is None else round(float(basis), 4),
            'basis_source': source,
            'unrealised_eur': gain,
        })
    return rows


def summary(realised_rows, unrealised_rows, carry_over_eur):
    exemption = EXEMPTION_EUR + min(max(Decimal(carry_over_eur), Decimal('0')), CARRY_OVER_CAP_EUR)
    known = [row['unrealised_eur'] for row in unrealised_rows if row['unrealised_eur'] is not None]
    result = {
        'realised_net_eur': None,
        'exemption_eur': exemption,
        'exemption_left_eur': None,
        'taxable_eur': None,
        'estimated_tax_eur': None,
        'unrealised_gains_eur': None,
        'unrealised_losses_eur': None,
    }
    if known or not unrealised_rows:
        result['unrealised_gains_eur'] = _cents(sum((v for v in known if v > 0), Decimal('0')))
        result['unrealised_losses_eur'] = _cents(sum((v for v in known if v < 0), Decimal('0')))
    if realised_rows is None:
        return result
    net = _cents(sum((row['realised_eur'] for row in realised_rows), Decimal('0')))
    taxable = max(Decimal('0'), net - exemption)
    result.update(
        realised_net_eur=net,
        exemption_left_eur=_cents(max(Decimal('0'), exemption - max(net, Decimal('0')))),
        taxable_eur=_cents(taxable),
        estimated_tax_eur=_cents(taxable * RATE),
    )
    return result
