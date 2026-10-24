from research.listings import look_up

from .models import Recommendation

MIN_RISKS = 3
TARGET_REQUIRED = ('buy_new', 'add')
CHART_BARS = 5
DAILY = 1440
SCORED_CURRENCY = 'USD'


class Refused(Exception):
    pass


def _entry(listing):
    from mcp_server import views
    from research.views import ChartView

    result = views.call_view(
        ChartView,
        query={
            'uic': listing.uic,
            'asset_type': listing.asset_type,
            'horizon': DAILY,
            'count': CHART_BARS,
        },
    )
    message = views.problem(result)
    if message:
        raise Refused(f'No entry price, so nothing was logged: {message}')
    closes = [c['close'] for c in result.data or [] if c.get('close') is not None]
    if not closes:
        raise Refused('No entry price, so nothing was logged: the chart has no closes.')
    return closes[-1]


def _number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _range_ok(value):
    return isinstance(value, dict) and _number(value.get('low')) and _number(value.get('high'))


def _validate(fields):
    if not (fields.get('thesis') or '').strip():
        raise Refused('A recommendation needs a thesis.')
    risks = fields.get('bear_case')
    if not isinstance(risks, list) or sum(isinstance(r, str) and bool(r.strip()) for r in risks) < MIN_RISKS or not all(isinstance(r, str) for r in risks):
        raise Refused(f'A recommendation needs at least {MIN_RISKS} bear-case risks, each a non-blank string.')
    invalidation = fields.get('invalidation')
    if not isinstance(invalidation, dict) or not (invalidation.get('price') is not None or invalidation.get('conditions')):
        raise Refused('An invalidation must be an object with a price or conditions.')
    target = fields.get('target')
    if target is not None and not isinstance(target, dict):
        raise Refused('A target must be an object with a price and condition.')
    if fields.get('action') in TARGET_REQUIRED and not target:
        raise Refused(f"A {fields['action']} needs a target.")
    for name in ('buy_range', 'sell_range'):
        if fields.get(name) is not None and not _range_ok(fields[name]):
            raise Refused(f'{name} must be an object with numeric low and high.')


def log(**fields):
    _validate(fields)
    ticker = fields.pop('ticker')
    listing = look_up(ticker)
    if not listing.resolved:
        raise Refused(f'{ticker} could not be resolved to a Saxo instrument.')
    if not listing.currency:
        raise Refused(f'{ticker} has no known listing currency.')
    if listing.currency != SCORED_CURRENCY:
        raise Refused('Only US-dollar listings can be scored against the S&P 500.')
    entry_price = _entry(listing)
    return Recommendation.objects.create(
        ticker=listing.symbol,
        uic=listing.uic,
        asset_type=listing.asset_type,
        entry_price=entry_price,
        entry_currency=listing.currency,
        **fields,
    )


def wanted_tickers():
    current = set(Recommendation.objects.filter(closed_at__isnull=True).values_list('ticker', flat=True))
    ever = set(Recommendation.objects.values_list('ticker', flat=True))
    return current, ever
