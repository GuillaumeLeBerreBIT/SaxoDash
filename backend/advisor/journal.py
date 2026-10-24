from django.utils import timezone

from investors.copying import BENCHMARK_TICKER, price_series
from investors.prices import Series
from research import daily, market

from . import scoring
from .models import Recommendation

MIN_RISKS = 3
TARGET_REQUIRED = ('buy_new', 'add')
SCORED_CURRENCY = 'USD'
STATUSES = ('open', 'closed', 'all')


class Refused(Exception):
    pass


def _choice(field, value):
    allowed = [choice for choice, _ in Recommendation._meta.get_field(field).choices]
    if value not in allowed:
        raise Refused(f'Unknown {field} {value!r}; use one of: {", ".join(sorted(allowed))}.')


def _number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _range_ok(value):
    return isinstance(value, dict) and _number(value.get('low')) and _number(value.get('high'))


def _validate(fields):
    for field in ('action', 'horizon', 'conviction'):
        _choice(field, fields.get(field))
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


def _scorable(listing):
    if not listing.resolved:
        raise Refused(f'{listing.ticker} could not be resolved to a Saxo instrument.')
    if not listing.currency:
        raise Refused(f'{listing.ticker} has no known listing currency.')
    if listing.currency != SCORED_CURRENCY:
        raise Refused('Only US-dollar listings can be scored against the S&P 500.')


NO_CLOSES = 'the chart has no closes.'


def _entry_price(listing, saxo):
    bars, reason = daily.available(listing, saxo)
    price = daily.latest_close(bars or [])
    if price is None:
        raise Refused(f'No entry price, so nothing was logged: {reason or NO_CLOSES}')
    return price


def log(*, listing, saxo=market, **fields):
    _validate(fields)
    _scorable(listing)
    price = _entry_price(listing, saxo)
    return Recommendation.objects.create(
        ticker=listing.symbol,
        uic=listing.uic,
        asset_type=listing.asset_type,
        entry_price=price,
        entry_currency=listing.currency,
        **fields,
    )


def _find(rec_id):
    try:
        found = Recommendation.objects.filter(pk=int(rec_id)).first()
    except (TypeError, ValueError):
        found = None
    if found is None:
        raise Refused(f'No recommendation {rec_id}.')
    return found


def decide(rec_id, decision):
    _choice('decision', decision)
    rec = _find(rec_id)
    rec.decision = decision
    rec.save(update_fields=['decision'])
    return rec


def close(rec_id, reason):
    _choice('close_reason', reason)
    rec = _find(rec_id)
    if rec.closed_at is not None:
        raise Refused(f'Recommendation {rec_id} is already closed.')
    rec.closed_at = timezone.now()
    rec.close_reason = reason
    rec.save(update_fields=['closed_at', 'close_reason'])
    return rec


def review(status, today=None):
    if status not in STATUSES:
        raise Refused(f'Unknown status {status!r}; use one of: {", ".join(STATUSES)}.')
    rows = Recommendation.objects.all()
    if status != 'all':
        rows = rows.filter(closed_at__isnull=status == 'open')
    recs = list(rows)
    prices = price_series({rec.ticker for rec in recs} | {BENCHMARK_TICKER})
    benchmark = prices.get(BENCHMARK_TICKER) or Series([], [])
    today = today or timezone.localdate()
    scored = [(rec, scoring.score(rec, prices, benchmark, today)) for rec in recs]
    return {
        'recommendations': scored,
        'summary': scoring.summary(scored),
        'benchmark_missing': bool(recs) and not benchmark,
    }


def wanted_tickers():
    current = set(Recommendation.objects.filter(closed_at__isnull=True).values_list('ticker', flat=True))
    ever = set(Recommendation.objects.values_list('ticker', flat=True))
    return current, ever
