import hashlib
from datetime import date
from decimal import Decimal

def _color_for_ticker(ticker):
    digest = hashlib.md5(ticker.encode()).hexdigest()
    return f"#{digest[:6]}"

def to_position_fields(saxo_position):
    base = saxo_position['PositionBase']
    view = saxo_position.get('PositionView', {})
    display = saxo_position.get('DisplayAndFormat', {})
    
    ticker = display.get('Symbol', '').split(':')[0]

    # Saxo returns CurrentPrice: 0.0 with CurrentPriceType: 'None' when no live
    # price feed is available (e.g. market closed) - fall back to the position's
    # open price rather than showing a $0 mark.
    current_price = view.get('CurrentPrice', base['OpenPrice'])
    if view.get('CurrentPriceType') == 'None':
        current_price = base['OpenPrice']

    return {
        'ticker': ticker,
        'name': display.get('Description', ''),
        'qty': int(base['Amount']),
        'avg_cost': Decimal(str(base['OpenPrice'])),
        'current_price': Decimal(str(current_price)),
        'sector': 'Uncategorized',
        'type': 'STOCK' if base.get('AssetType') == 'Stock' else 'ETF',
        'color': _color_for_ticker(ticker),
    }
    
def to_transaction_fields(saxo_position):
    """Map one Saxo *open position* to an entry-trade ledger row.

    Sourced from /port/v1/positions/me, not /hist/v1/transactions: the SIM
    environment never populates the historical transactions endpoint (verified
    2026-08-27 - empty for the full year), so the open position is the only
    record of the entry trade. `saxo_trade_id` is the PositionId, so repeated
    syncs upsert the same row instead of duplicating it. A negative Amount is a
    short sale, so it maps to SELL.

    Exit trades (closing a long) are not covered here yet - they come from
    /port/v1/closedpositions/me, which had zero rows in SIM on 2026-08-27, so
    that mapping is deferred until a real closed-position payload exists.
    """
    base = saxo_position['PositionBase']
    display = saxo_position.get('DisplayAndFormat', {})
    amount = base['Amount']

    return {
        'saxo_trade_id': str(saxo_position['PositionId']),
        'date': date.fromisoformat(base['ExecutionTimeOpen'][:10]),
        'type': 'BUY' if amount >= 0 else 'SELL',
        'instrument': display.get('Description', ''),
        'ticker': display.get('Symbol', '').split(':')[0],
        'qty': Decimal(str(abs(amount))),
        'price': Decimal(str(base['OpenPrice'])),
        'account': 'Saxo',
    }
    
def to_account_fields(saxo_balance):
    return {
        'type': 'Cash',
        'iban_masked': '-',
        'balance': Decimal(str(saxo_balance['CashBalance'])),
        'available': Decimal(str(saxo_balance['CollateralAvailable'])),
        'gradient': 'from-slate-600 to-slate-800',
        'accent': '#334155',
    }
    