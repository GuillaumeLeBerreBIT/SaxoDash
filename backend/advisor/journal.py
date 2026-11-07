from django.utils import timezone

from investors.copying import BENCHMARK_TICKER, price_series
from investors.prices import Series
from research import daily, market

from . import scoring
from .models import Recommendation
from .serializers import RecommendationInput, problems

SCORED_CURRENCY = 'USD'
STATUSES = ('open', 'closed', 'all')


class Refused(Exception):
    pass


def _choice(field, value):
    allowed = [choice for choice, _ in Recommendation._meta.get_field(field).choices]
    if value not in allowed:
        raise Refused(f'Unknown {field} {value!r}; use one of: {", ".join(sorted(allowed))}.')


def _validated(fields):
    given = RecommendationInput(data=fields)
    if not given.is_valid():
        raise Refused(problems(given.errors))
    return given.validated_data


def _scorable(listing):
    if not listing.resolved:
        raise Refused(f'{listing.ticker} could not be resolved to a Saxo instrument.')
    if not listing.currency:
        raise Refused(f'{listing.ticker} has no known listing currency.')
    if listing.currency != SCORED_CURRENCY:
        raise Refused('Only US-dollar listings can be scored against the S&P 500.')


NO_CLOSES = 'the chart has no closes.'


def _entry_price(listing, saxo, user):
    bars, reason = daily.available(listing, saxo, user=user)
    price = daily.latest_close(bars or [])
    if price is None:
        raise Refused(f'No entry price, so nothing was logged: {reason or NO_CLOSES}')
    return price


def log(*, listing, user, saxo=market, **fields):
    values = _validated(fields)
    _scorable(listing)
    price = _entry_price(listing, saxo, user)
    return Recommendation.objects.create(
        ticker=listing.symbol,
        uic=listing.uic,
        asset_type=listing.asset_type,
        entry_price=price,
        entry_currency=listing.currency,
        **values,
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
