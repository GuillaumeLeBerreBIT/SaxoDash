from django.db.models import Count

from . import changes, sectors, summaries
from .models import Investor, PositionMove

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


def _blank(cusip, issuer):
    return {
        'cusip': cusip, 'issuer': issuer, 'owners': [], 'bought': [], 'sold': [], 'new': [],
        'value': 0, 'bought_value': 0, 'sold_value': 0,
    }


def _stocks(quarter_end):
    stocks = {}
    rows = PositionMove.objects.filter(quarter_end=quarter_end, put_call='').values_list(
        'cusip', 'issuer', 'investor_id', 'kind', 'value', 'previous_value', 'weight_pct', 'previous_weight_pct',
    )
    for cusip, issuer, investor_id, kind, value, previous_value, weight, previous_weight in rows:
        stock = stocks.setdefault(cusip, _blank(cusip, issuer))
        delta = value - (previous_value or 0)
        if kind != changes.SOLD_OUT:
            stock['owners'].append((weight, investor_id))
            stock['value'] += value
        if kind in BUYS:
            stock['bought'].append((weight, investor_id))
            stock['bought_value'] += delta
        if kind == changes.NEW:
            stock['new'].append((weight, investor_id))
        if kind in SELLS:
            stock['sold'].append((previous_weight or 0.0, investor_id))
            stock['sold_value'] -= delta
    return stocks


def _face(investor):
    return {'slug': investor.slug, 'name': investor.name}


def _faces(pairs, investors):
    ranked = sorted(pairs, key=lambda pair: (-pair[0], pair[1]))[:FACES]
    return [_face(investors[investor_id]) for _, investor_id in ranked]


def _item(stock, side, investors, tickers):
    ticker = tickers.get(stock['cusip'])
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
    tickers = summaries.tickers_for(stock['cusip'] for stock in ranked[:limit])
    return len(ranked), [_item(stock, side, investors, tickers) for stock in ranked[:limit]]


def _new_bets(quarter_end, investors):
    found = PositionMove.objects.filter(quarter_end=quarter_end, put_call='', kind=changes.NEW)
    rows = list(found.order_by('-weight_pct', 'cusip', 'investor_id')[:SHELF_LIMIT])
    tickers = summaries.tickers_for(row.cusip for row in rows)
    items = [
        {
            'cusip': row.cusip,
            'ticker': tickers.get(row.cusip),
            'issuer': row.issuer,
            'sector': sectors.sector_for(tickers.get(row.cusip)),
            'weight': row.weight_pct,
            'value': row.value,
            'investors': [_face(investors[row.investor_id])],
        }
        for row in rows
    ]
    return found.count(), items


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
    shelves.append(_shelf('new-bets', 'Biggest new bets', 'stocks', *_new_bets(signal['quarter'], investors)))
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
