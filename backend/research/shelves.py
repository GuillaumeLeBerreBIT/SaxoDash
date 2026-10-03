from dataclasses import asdict, dataclass

from django.db.models import F, Q

from .models import ScreenerRow
from .screener_fields import FIELDS

CARD_LIMIT = 20
EMPTY = 'No stocks match these criteria in the last session.'

GROUPS = (
    ('price', 'Price action'),
    ('fundamentals', 'Fundamentals'),
)

SYMBOLS = {'gt': '>', 'gte': '≥', 'lt': '<', 'lte': '≤'}
LOWER_BOUNDS = {'gt': 'lt', 'gte': 'lte'}


@dataclass(frozen=True)
class Criterion:
    field: str
    op: str
    value: float | None = None
    ref: str | None = None

    @property
    def fields(self):
        return (self.field, self.ref) if self.ref else (self.field,)

    def q(self):
        return Q(**{f'{self.field}__{self.op}': F(self.ref) if self.ref else self.value})


@dataclass(frozen=True)
class Shelf:
    key: str
    title: str
    short: str
    group: str
    criteria: tuple
    sort: str
    descending: bool
    card_fields: tuple

    def rule(self):
        rule = Q()
        for criterion in self.criteria:
            rule &= criterion.q()
        return rule


SHELVES = (
    Shelf(
        key='oversold', title='Oversold', short='Oversold', group='price',
        criteria=(Criterion('rsi14', 'lte', 30),),
        sort='rsi14', descending=False, card_fields=('rsi14',),
    ),
    Shelf(
        key='overbought', title='Overbought', short='Overbought', group='price',
        criteria=(Criterion('rsi14', 'gte', 70),),
        sort='rsi14', descending=True, card_fields=('rsi14',),
    ),
    Shelf(
        key='above-moving-averages', title='Above 50- & 200-day averages', short='Above MAs', group='price',
        criteria=(Criterion('last_close', 'gt', ref='ma50'), Criterion('ma50', 'gt', ref='ma200')),
        sort='pct_vs_ma200', descending=True, card_fields=('pct_vs_ma200', 'pct_from_52w_high'),
    ),
    Shelf(
        key='unusual-volume', title='Unusual volume', short='Unusual volume', group='price',
        criteria=(Criterion('rvol', 'gte', 2),),
        sort='rvol', descending=True, card_fields=('rvol',),
    ),
    Shelf(
        key='profitable-below-200d', title='Profitable & below 200-day average', short='Profitable < 200D',
        group='fundamentals',
        criteria=(
            Criterion('roe', 'gte', 15),
            Criterion('net_margin', 'gte', 10),
            Criterion('eps_growth_5y', 'gt', 0),
            Criterion('pct_vs_ma200', 'lt', 0),
        ),
        sort='market_cap', descending=True, card_fields=('roe', 'net_margin', 'eps_growth_5y', 'pct_vs_ma200'),
    ),
    Shelf(
        key='pe-under-15', title='P/E under 15', short='P/E < 15', group='fundamentals',
        criteria=(Criterion('pe', 'gt', 0), Criterion('pe', 'lt', 15)),
        sort='pe', descending=False, card_fields=('pe',),
    ),
)

_BY_KEY = {shelf.key: shelf for shelf in SHELVES}


def by_key(key):
    return _BY_KEY.get(key)


def _required_fields(shelf):
    required = {shelf.sort}
    for criterion in shelf.criteria:
        required.update(criterion.fields)
    return sorted(required)


def matching(shelf):
    order = f'-{shelf.sort}' if shelf.descending else shelf.sort
    return (
        ScreenerRow.objects.filter(status=ScreenerRow.OK)
        .filter(shelf.rule())
        .filter(**{f'{name}__isnull': False for name in _required_fields(shelf)})
        .order_by(order, 'ticker')
    )


def _number(value):
    return f'{value:g}'


def _threshold(criterion):
    return f'{_number(criterion.value)}{FIELDS[criterion.field].unit}'


def _phrase(criterion):
    target = FIELDS[criterion.ref].label if criterion.ref else _threshold(criterion)
    return f'{FIELDS[criterion.field].label} {SYMBOLS[criterion.op]} {target}'


def _bounds(first, second):
    return (
        first.field == second.field
        and not first.ref and not second.ref
        and (first.op in LOWER_BOUNDS) != (second.op in LOWER_BOUNDS)
    )


def _range(first, second):
    low, high = (first, second) if first.op in LOWER_BOUNDS else (second, first)
    return (
        f'{_threshold(low)} {SYMBOLS[LOWER_BOUNDS[low.op]]} {FIELDS[low.field].label} '
        f'{SYMBOLS[high.op]} {_threshold(high)}'
    )


def subtitle(shelf):
    pending = list(shelf.criteria)
    phrases = []
    while pending:
        first = pending.pop(0)
        partner = next((other for other in pending if _bounds(first, other)), None)
        if partner:
            pending.remove(partner)
            phrases.append(_range(first, partner))
        else:
            phrases.append(_phrase(first))
    return ' · '.join(phrases)


def _in_sentence(label):
    return label[0].lower() + label[1:] if label[1:2].islower() else label


def order(shelf):
    direction = 'highest' if shelf.descending else 'lowest'
    return f'Ordered by {_in_sentence(FIELDS[shelf.sort].label)}, {direction} first'


def reasons(row, shelf):
    return [
        {'field': name, 'label': FIELDS[name].short, 'value': getattr(row, name), 'format': FIELDS[name].format}
        for name in shelf.card_fields
    ]


def card(row, shelf):
    return {
        'ticker': row.ticker,
        'name': row.name,
        'uic': row.uic,
        'asset_type': row.asset_type,
        'sector': row.sector,
        'last_close': row.last_close,
        'change_1d': row.change_1d,
        'sparkline': row.sparkline,
        'reasons': reasons(row, shelf),
        'metric_value': getattr(row, shelf.card_fields[0]),
    }


def payload(shelf, limit=None):
    rows = matching(shelf)
    selected = rows[:limit] if limit else rows
    return {
        'key': shelf.key,
        'title': shelf.title,
        'short': shelf.short,
        'group': shelf.group,
        'subtitle': subtitle(shelf),
        'order': order(shelf),
        'empty': EMPTY,
        'criteria': [asdict(criterion) for criterion in shelf.criteria],
        'sort': {'field': shelf.sort, 'descending': shelf.descending},
        'metric': shelf.card_fields[0],
        'total': rows.count(),
        'items': [card(row, shelf) for row in selected],
    }
