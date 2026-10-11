from django.db.models import Count

from . import changes, sectors, summaries
from .models import Investor, PositionMove, Security

MIN_FUNDS = 3
SHELF_LIMIT = 12
FACES = 5
TABLE_LIMIT = 200
QUARTER_CHOICES = 8
BUYS = (changes.NEW, changes.ADDED)
SELLS = (changes.TRIMMED, changes.SOLD_OUT)


class UnknownView(Exception):
    pass


VIEWS = {
    'bought': ('bought', lambda stock: (-len(stock['bought']), -stock['bought_value'], stock['cusip'])),
    'sold': ('sold', lambda stock: (-len(stock['sold']), -stock['sold_value'], stock['cusip'])),
    'owned': ('owners', lambda stock: (-len(stock['owners']), -stock['value'], stock['cusip'])),
    'new': ('new', lambda stock: (-len(stock['new']), -stock['value'], stock['cusip'])),
}

STOCK_SHELVES = (
    ('convergent-buys', 'Convergent buys', 'bought'),
    ('most-sold', 'Most sold', 'sold'),
)


def signal_quarter():
    tracked = Investor.objects.count()
    filed = list(
        PositionMove.objects.values('quarter_end')
        .annotate(filed=Count('investor', distinct=True)).order_by('-quarter_end')[:2]
    )
    if not filed:
        return None
    newest = filed[0]
    chosen = newest if len(filed) == 1 or newest['filed'] * 2 >= tracked else filed[1]
    return {
        'quarter': chosen['quarter_end'],
        'filed': chosen['filed'],
        'tracked': tracked,
        'newest_quarter': newest['quarter_end'],
        'newest_filed': newest['filed'],
    }


def _blank(position):
    return {
        'cusip': position['cusip'], 'issuer': position['issuer'], 'ticker': position['ticker'],
        'owners': [], 'bought': [], 'sold': [], 'new': [], 'value': 0, 'bought_value': 0, 'sold_value': 0,
    }


def _size(position):
    return max(position['value'], position['previous_value'] or 0)


def _combined(position, row):
    earlier = [side for side in (position, row) if side['previous_shares'] is not None]
    merged = {
        **(row if (_size(row), row['cusip']) > (_size(position), position['cusip']) else position),
        'shares': position['shares'] + row['shares'],
        'value': position['value'] + row['value'],
        'weight': position['weight'] + row['weight'],
        'previous_shares': sum(side['previous_shares'] for side in earlier) if earlier else None,
        'previous_value': sum(side['previous_value'] or 0 for side in earlier) if earlier else None,
        'previous_weight': sum(side['previous_weight'] or 0.0 for side in earlier) if earlier else None,
    }
    if position['kind'] is None or row['kind'] is None:
        merged['kind'] = None
    elif merged['shares'] == 0:
        merged['kind'] = changes.SOLD_OUT
    else:
        merged['kind'] = changes.position_change(merged['shares'], merged['previous_shares'])[0]
    return merged


def _positions(quarter_end):
    tickers = dict(Security.objects.filter(ticker__isnull=False).values_list('cusip', 'ticker'))
    positions = {}
    rows = PositionMove.objects.filter(quarter_end=quarter_end, put_call='').order_by('cusip').values(
        'cusip', 'issuer', 'investor_id', 'kind', 'shares', 'previous_shares', 'value', 'previous_value',
        'weight_pct', 'previous_weight_pct',
    )
    for row in rows:
        row['ticker'] = tickers.get(row['cusip'])
        row['weight'] = row.pop('weight_pct')
        row['previous_weight'] = row.pop('previous_weight_pct')
        key = (row['ticker'] or row['cusip'], row['investor_id'])
        positions[key] = _combined(positions[key], row) if key in positions else row
    return positions


def _stocks(quarter_end):
    stocks = {}
    for (identity, investor_id), position in _positions(quarter_end).items():
        stock = stocks.get(identity)
        if stock is None:
            stock = stocks[identity] = _blank(position)
            stock['largest'] = (_size(position), position['cusip'])
        elif (_size(position), position['cusip']) > stock['largest']:
            stock.update(cusip=position['cusip'], issuer=position['issuer'])
            stock['largest'] = (_size(position), position['cusip'])
        kind = position['kind']
        delta = position['value'] - (position['previous_value'] or 0)
        if kind != changes.SOLD_OUT:
            stock['owners'].append((position['weight'], investor_id))
            stock['value'] += position['value']
        if kind in BUYS:
            stock['bought'].append((position['weight'], investor_id))
            stock['bought_value'] += delta
        if kind == changes.NEW:
            stock['new'].append((position['weight'], investor_id))
        if kind in SELLS:
            stock['sold'].append((position['previous_weight'] or 0.0, investor_id))
            stock['sold_value'] -= delta
    return stocks


def _face(investor):
    return {'slug': investor.slug, 'name': investor.name}


def _faces(pairs, investors):
    ranked = sorted(pairs, key=lambda pair: (-pair[0], pair[1]))[:FACES]
    return [_face(investors[investor_id]) for _, investor_id in ranked]


def _item(stock, side, investors):
    ticker = stock['ticker']
    return {
        'cusip': stock['cusip'],
        'ticker': ticker,
        'issuer': stock['issuer'],
        'sector': sectors.sector_for(ticker),
        'owners': len(stock['owners']),
        'bought': len(stock['bought']),
        'sold': len(stock['sold']),
        'new': len(stock['new']),
        'value': stock['value'],
        'investors': _faces(stock[side], investors),
    }


def _items(stocks, view, investors, minimum, limit):
    side, key = VIEWS[view]
    ranked = sorted((stock for stock in stocks.values() if len(stock[side]) >= minimum), key=key)
    return len(ranked), [_item(stock, side, investors) for stock in ranked[:limit]]


def _biggest_new(stock):
    return max(weight for weight, _ in stock['new'])


def _new_bets(stocks, investors):
    ranked = sorted(
        (stock for stock in stocks.values() if stock['new']),
        key=lambda stock: (-_biggest_new(stock), stock['cusip']),
    )
    shown = ranked[:SHELF_LIMIT]
    items = [{**_item(stock, 'new', investors), 'weight': _biggest_new(stock)} for stock in shown]
    return len(ranked), items


def _shelf(key, title, kind, total, items):
    return {'key': key, 'title': title, 'kind': kind, 'total': total, 'items': items}


def _investor_shelf(key, title, members, today):
    ordered = sorted(
        members,
        key=lambda investor: (-(investor.last_filing_at.toordinal() if investor.last_filing_at else 0), investor.name),
    )
    return _shelf(key, title, 'investors', len(ordered), summaries.cards(ordered[:SHELF_LIMIT], today))


def hub(today):
    everyone = list(Investor.objects.all())
    signal = signal_quarter()
    if signal is None:
        return {
            'quarter': None, 'filed': 0, 'tracked': len(everyone),
            'newest_quarter': None, 'newest_filed': 0, 'shelves': [],
        }
    investors = {investor.pk: investor for investor in everyone}
    stocks = _stocks(signal['quarter'])
    shelves = [_investor_shelf('following', 'Following', [i for i in everyone if i.followed], today)]
    for key, title, view in STOCK_SHELVES:
        shelves.append(_shelf(key, title, 'stocks', *_items(stocks, view, investors, MIN_FUNDS, SHELF_LIMIT)))
    shelves.append(_shelf('new-bets', 'Biggest new bets', 'stocks', *_new_bets(stocks, investors)))
    shelves.append(_investor_shelf('just-filed', 'Just filed', [i for i in everyone if i.last_filing_at], today))
    return {
        'quarter': signal['quarter'].isoformat(),
        'filed': signal['filed'],
        'tracked': signal['tracked'],
        'newest_quarter': signal['newest_quarter'].isoformat(),
        'newest_filed': signal['newest_filed'],
        'shelves': [shelf for shelf in shelves if shelf['items']],
    }


def stock_activity(view, quarter_end=None):
    if view not in VIEWS:
        raise UnknownView(view)
    signal = signal_quarter()
    quarter_end = quarter_end or (signal['quarter'] if signal else None)
    quarters = list(
        PositionMove.objects.values_list('quarter_end', flat=True).distinct().order_by('-quarter_end')[:QUARTER_CHOICES]
    )
    rows = []
    if quarter_end is not None:
        investors = {investor.pk: investor for investor in Investor.objects.all()}
        _, rows = _items(_stocks(quarter_end), view, investors, 1, TABLE_LIMIT)
    return {
        'quarter': quarter_end.isoformat() if quarter_end else None,
        'signal_quarter': signal['quarter'].isoformat() if signal else None,
        'quarters': [quarter.isoformat() for quarter in quarters],
        'view': view,
        'rows': rows,
    }
