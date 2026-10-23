from .models import Recommendation

MIN_RISKS = 3
TARGET_REQUIRED = ('buy_new', 'add')
CHART_BARS = 5
DAILY = 1440


class Refused(Exception):
    pass


def _entry(instrument):
    from mcp_server import views
    from research.views import ChartView

    result = views.call_view(
        ChartView,
        query={
            'uic': instrument['uic'],
            'asset_type': instrument['asset_type'],
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


def _validate(fields):
    if not (fields.get('thesis') or '').strip():
        raise Refused('A recommendation needs a thesis.')
    if len(fields.get('bear_case') or []) < MIN_RISKS:
        raise Refused(f'A recommendation needs at least {MIN_RISKS} bear-case risks.')
    if not fields.get('invalidation'):
        raise Refused('A recommendation needs an invalidation.')
    if fields.get('action') in TARGET_REQUIRED and not fields.get('target'):
        raise Refused(f"A {fields['action']} needs a target.")


def log(**fields):
    from mcp_server.tools.research import resolve

    _validate(fields)
    ticker = fields.pop('ticker')
    instrument = resolve(ticker)
    if instrument is None:
        raise Refused(f'{ticker} could not be resolved to a Saxo instrument.')
    if not instrument.get('currency'):
        raise Refused(f'{ticker} has no known listing currency.')
    entry_price = _entry(instrument)
    return Recommendation.objects.create(
        ticker=instrument['symbol'],
        uic=instrument['uic'],
        asset_type=instrument['asset_type'],
        entry_price=entry_price,
        entry_currency=instrument['currency'],
        **fields,
    )


def wanted_tickers():
    current = set(Recommendation.objects.filter(closed_at__isnull=True).values_list('ticker', flat=True))
    ever = set(Recommendation.objects.values_list('ticker', flat=True))
    return current, ever
