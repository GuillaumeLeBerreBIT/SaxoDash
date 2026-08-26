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
    
def to_transaction_fields(saxo_closed_position):
    base = saxo_closed_position['ClosedPosition']
    display = saxo_closed_position.get('DisplayAndFormat', {})
    
    return {
        'saxo_trade_id': str(saxo_closed_position['ClosedPositionUniqueId']),
        'date': date.fromisoformat(base['ExecutionTimeClose'][:10]),
        'type': 'SELL',
        'instrument': display.get('Description', ''),
        'ticker': display.get('Symbol', '').split(':')[0],
        'qty': Decimal(str(abs(base['Amount']))),
        'price': Decimal(str(base['ClosingPrice'])),
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
    