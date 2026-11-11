from collections import defaultdict
from decimal import Decimal

from django.conf import settings

from core.money import Money
from portfolio.models import Position
from research.listings import bare

from .actions import WEIGHT_CAP_PCT, action


def weights_by_ticker(user):
    positions = list(Position.objects.filter(user=user))
    total = Money.total(
        (Money(position.value, settings.REPORTING_CURRENCY) for position in positions),
        settings.REPORTING_CURRENCY,
    ).amount
    if not total:
        return {}
    weights = defaultdict(Decimal)
    for position in positions:
        if position.asset_type == 'Stock' and position.currency == 'USD':
            weights[bare(position.ticker)] += position.weight_of(total)
    return dict(weights)


def _failed_labels(verdict):
    return [check['label'] for check in verdict.checks if check['status'] == 'fail']


def _summary(verdict, weight):
    weight_pct = float(weight) if weight is not None else None
    decided = action(verdict.quality, verdict.valuation, weight_pct, _failed_labels(verdict))
    return {
        **decided,
        'quality': verdict.quality,
        'valuation': verdict.valuation,
        'as_of': verdict.as_of.isoformat() if verdict.as_of else None,
    }


def _detail(verdict, weight):
    return {
        **_summary(verdict, weight),
        'ticker': verdict.ticker,
        'name': verdict.name,
        'checks': verdict.checks,
        'current_pe': verdict.current_pe,
        'cheap_below': verdict.cheap_below,
        'expensive_above': verdict.expensive_above,
        'last_close': verdict.last_close,
        'pct_vs_ma200': verdict.pct_vs_ma200,
        'held': weight is not None,
        'weight_pct': round(float(weight), 1) if weight is not None else None,
        'weight_cap_pct': WEIGHT_CAP_PCT,
    }


def for_user(verdicts, user, detailed=False):
    weights = weights_by_ticker(user)
    build = _detail if detailed else _summary
    return {verdict.ticker: build(verdict, weights.get(verdict.ticker)) for verdict in verdicts}
