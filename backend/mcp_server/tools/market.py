from datetime import timedelta

from django.db.models import F, FloatField
from django.utils import timezone

from research.models import ScreenerRow
from research.views import DiscoverShelfView, DiscoverView, EarningsCalendarView

from ..envelope import answer
from ..shaping import without
from ..views import call_view, problem
from . import tool

SCREEN_FIELDS = tuple(
    field.name for field in ScreenerRow._meta.get_fields() if isinstance(field, FloatField)
)
DEFAULT_SORT = '-market_cap'
MAX_LIMIT = 100
STALE_AFTER = timedelta(hours=36)
DROPPED = frozenset({'sparkline', 'recent_closes', 'error'})
SOURCE = 'discover'


def _bounds(filters, warnings):
    bounds = {}
    for key, value in (filters or {}).items():
        side, _, field = key.partition('_')
        if side not in ('min', 'max') or field not in SCREEN_FIELDS:
            warnings.append(f'Unknown filter {key} ignored; use min_<field> or max_<field> over {", ".join(SCREEN_FIELDS)}.')
            continue
        bounds[f'{field}__{"gte" if side == "min" else "lte"}'] = value
    return bounds


def _ordering(sort, warnings):
    descending = sort.startswith('-')
    field = sort.lstrip('-')
    if field not in SCREEN_FIELDS:
        warnings.append(f'Unknown sort {sort} ignored; sorted by {DEFAULT_SORT}.')
        descending, field = True, DEFAULT_SORT.lstrip('-')
    column = F(field)
    return column.desc(nulls_last=True) if descending else column.asc(nulls_last=True)


def _row(row):
    return {key: value for key, value in row.items() if key not in DROPPED}


@tool('Screen the S&P 500 and Nasdaq-100 snapshot with min_/max_ filters on technical and fundamental fields, sorted and capped.')
def screen_universe(filters=None, sort=DEFAULT_SORT, sector='', limit=25):
    warnings = []
    bounds = _bounds(filters, warnings)
    rows = ScreenerRow.objects.filter(status=ScreenerRow.OK)
    rows = rows.filter(**bounds, **{f'{key.split("__")[0]}__isnull': False for key in bounds})
    if sector:
        rows = rows.filter(sector__iexact=sector)
    matched = rows.count()
    limit = max(1, min(int(limit), MAX_LIMIT))
    ordered = rows.order_by(_ordering(sort, warnings), 'ticker')[:limit]
    latest = ScreenerRow.objects.filter(technicals_at__isnull=False).order_by('-technicals_at').values_list('technicals_at', flat=True).first()
    if latest is not None and timezone.now() - latest > STALE_AFTER:
        warnings.append(f'The scan is older than 36 hours (last {latest.isoformat()}); figures may be stale.')
    data = {
        'matched': matched,
        'fields': list(SCREEN_FIELDS),
        'rows': [_row(row) for row in ordered.values()],
    }
    return answer(data, sources=[SOURCE], warnings=warnings, as_of=latest)


@tool('Discover shelves: ready-made screens of the universe. Pass a shelf key for one shelf in full, or nothing for the overview.')
def get_discover_shelves(key=''):
    if key:
        result = call_view(DiscoverShelfView, kwargs={'key': key})
    else:
        result = call_view(DiscoverView)
    message = problem(result)
    if message:
        return answer(None, sources=[SOURCE], warnings=[message])
    return answer(without(result.data), sources=[SOURCE])


@tool('Earnings calendar for a week (0 = current, negative past, positive future); scope all or mine for your portfolio and watchlist.')
def get_earnings_calendar(week=0, scope='all'):
    result = call_view(EarningsCalendarView, query={'week': week, 'scope': scope})
    message = problem(result)
    if message:
        return answer(None, sources=['finnhub'], warnings=[message])
    return answer(without(result.data), sources=['finnhub'])
