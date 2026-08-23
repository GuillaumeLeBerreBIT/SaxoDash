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
    
    return {
        'ticker': ticker,
        'name': display.get('Description', ''),
        'qty': int(base['Amount']),
        'avg_cost': Decimal(str(base['OpenPrice'])),
        'current_price': Decimal(str(view.get('CurrentPrice', base['OpenPrice']))),
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