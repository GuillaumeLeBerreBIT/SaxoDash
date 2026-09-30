from dataclasses import dataclass

from django.db.models import F, Q

from .models import ScreenerRow

CARD_LIMIT = 20


@dataclass(frozen=True)
class Shelf:
    key: str
    title: str
    subtitle: str
    metric: str
    rule: Q
    descending: bool


SHELVES = (
    Shelf(
        'quality-on-sale', 'Quality on sale',
        'ROE ≥ 15%, net margin ≥ 10%, growing 5-year EPS, trading below the 200-day MA',
        'pct_vs_ma200',
        Q(roe__gte=15, net_margin__gte=10, eps_growth_5y__gt=0, pct_vs_ma200__lt=0),
        False,
    ),
    Shelf('overbought', 'Overbought', 'RSI 14 at or above 70', 'rsi14', Q(rsi14__gte=70), True),
    Shelf('oversold', 'Oversold', 'RSI 14 at or below 30', 'rsi14', Q(rsi14__lte=30), False),
    Shelf(
        'strong-trend', 'Strong trend', 'Close above the 50-day MA, 50-day above the 200-day',
        'change_3m', Q(last_close__gt=F('ma50'), ma50__gt=F('ma200')), True,
    ),
    Shelf(
        'near-high', 'Near 52-week high', 'Within 3% of the 52-week high',
        'pct_from_52w_high', Q(pct_from_52w_high__gte=-3), True,
    ),
    Shelf('cheap-pe', 'Cheap by P/E', 'Positive P/E below 15', 'pe', Q(pe__gt=0, pe__lt=15), False),
    Shelf(
        'unusual-volume', 'Unusual volume', "Last session's volume at least 2× its 20-day average",
        'rvol', Q(rvol__gte=2), True,
    ),
)

_BY_KEY = {shelf.key: shelf for shelf in SHELVES}


def by_key(key):
    return _BY_KEY.get(key)


def matching(shelf):
    order = f'-{shelf.metric}' if shelf.descending else shelf.metric
    return (
        ScreenerRow.objects.filter(status=ScreenerRow.OK)
        .filter(shelf.rule)
        .filter(**{f'{shelf.metric}__isnull': False})
        .order_by(order, 'ticker')
    )


def card(row, shelf):
    return {
        'ticker': row.ticker,
        'name': row.name,
        'uic': row.uic,
        'asset_type': row.asset_type,
        'last_close': row.last_close,
        'change_1d': row.change_1d,
        'metric_value': getattr(row, shelf.metric),
        'sparkline': row.sparkline,
    }
