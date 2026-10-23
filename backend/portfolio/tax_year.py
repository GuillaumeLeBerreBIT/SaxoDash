from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from saxo.mapping import bare_symbol

RATE = Decimal('0.10')
EXEMPTION_EUR = Decimal('10000')
CARRY_OVER_CAP_EUR = Decimal('5000')
BASIS_DAY = date(2025, 12, 31)
ADVISER_NOTE = 'Check with a Belgian tax adviser.'

CENT = Decimal('0.01')


def _cents(value):
    return Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)


def realised(rows, year):
    entries = []
    for row in rows:
        base = row['ClosedPosition']
        closed_at = base.get('ExecutionTimeClose')
        if not closed_at:
            return None
        closed_on = date.fromisoformat(closed_at[:10])
        if closed_on.year != year:
            continue
        pnl = base.get('ProfitLossOnTradeInBaseCurrency')
        if pnl is None:
            return None
        entries.append({
            'ticker': bare_symbol(row.get('DisplayAndFormat', {}).get('Symbol')),
            'closed_on': closed_on,
            'qty': Decimal(str(abs(base['Amount']))),
            'realised_eur': _cents(Decimal(str(pnl))),
        })
    return entries


def unrealised(positions, basis_closes, opened_on):
    rows = []
    for position in positions:
        opened = opened_on.get(position.ticker)
        if opened is not None and opened <= BASIS_DAY:
            source = 'dec_31_2025'
            basis = basis_closes.get(position.ticker)
        else:
            source = 'avg_cost'
            basis = float(position.avg_cost)
        gain = None
        if basis is not None:
            move = position.current_price - Decimal(str(basis))
            gain = _cents(position.qty * move * position.fx_rate)
        rows.append({
            'ticker': position.ticker,
            'basis': basis,
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
