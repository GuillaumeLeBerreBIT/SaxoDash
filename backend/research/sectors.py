from .models import ScreenerRow

STOCK_FIELDS = ('ticker', 'name', 'uic', 'asset_type', 'last_close', 'change_1d', 'change_1m', 'market_cap')


def _average(values):
    present = [value for value in values if value is not None]
    return sum(present) / len(present) if present else None


def _by_size(stock):
    return (stock['market_cap'] is None, -(stock['market_cap'] or 0), stock['ticker'])


def _by_move(sector):
    return (sector['change_1d'] is None, -(sector['change_1d'] or 0), sector['sector'])


def overview():
    grouped = {}
    rows = ScreenerRow.objects.filter(status=ScreenerRow.OK).exclude(sector='').values(*STOCK_FIELDS, 'sector')
    for row in rows:
        grouped.setdefault(row['sector'], []).append({field: row[field] for field in STOCK_FIELDS})
    sectors = [
        {
            'sector': name,
            'count': len(stocks),
            'change_1d': _average(stock['change_1d'] for stock in stocks),
            'change_1m': _average(stock['change_1m'] for stock in stocks),
            'stocks': sorted(stocks, key=_by_size),
        }
        for name, stocks in grouped.items()
    ]
    return sorted(sectors, key=_by_move)
