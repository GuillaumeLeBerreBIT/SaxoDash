from django.utils import timezone

from advisor import journal, scoring
from advisor.models import Recommendation
from investors.copying import BENCHMARK_TICKER, price_series
from investors.prices import Series

from ..envelope import answer
from ..shaping import capped
from . import tool

STATUSES = ('open', 'closed', 'all')


def _choices(field):
    return {value for value, _ in Recommendation._meta.get_field(field).choices}


def _row(rec):
    return {
        'id': rec.id,
        'ticker': rec.ticker,
        'uic': rec.uic,
        'asset_type': rec.asset_type,
        'action': rec.action,
        'review': rec.review,
        'thesis': rec.thesis,
        'bear_case': rec.bear_case,
        'invalidation': rec.invalidation,
        'target': rec.target,
        'buy_range': rec.buy_range,
        'sell_range': rec.sell_range,
        'figures': rec.figures,
        'lenses': rec.lenses,
        'zone': rec.zone,
        'conviction': rec.conviction,
        'horizon': rec.horizon,
        'uncertainties': rec.uncertainties,
        'entry_price': rec.entry_price,
        'entry_currency': rec.entry_currency,
        'recorded_at': rec.recorded_at.isoformat(),
        'decision': rec.decision,
        'closed_at': rec.closed_at.isoformat() if rec.closed_at else None,
        'close_reason': rec.close_reason or None,
    }


def _serialised(result):
    def point(entry):
        return None if entry is None else {**entry, 'day': entry['day'].isoformat()}

    return {
        'entry_day': result['entry_day'].isoformat() if result['entry_day'] else None,
        'checkpoints': {name: point(entry) for name, entry in result['checkpoints'].items()},
        'latest': point(result['latest']),
    }


def _refuse(reason):
    return answer(None, sources=['journal'], warnings=[reason])


def _invalid(field, value):
    return f'Unknown {field} {value!r}; use one of: {", ".join(sorted(_choices(field)))}.'


def _find(rec_id):
    try:
        return Recommendation.objects.filter(pk=int(rec_id)).first()
    except (TypeError, ValueError):
        return None


@tool('Log a recommendation to the decision journal. The entry price is filled from Saxo; a thesis, three bear-case risks, an invalidation and (for buy_new or add) a target are required.')
def log_recommendation(
    ticker: str,
    action: str,
    thesis: str,
    bear_case: list[str],
    invalidation: dict,
    horizon: str,
    conviction: str,
    target: dict | None = None,
    buy_range: dict | None = None,
    sell_range: dict | None = None,
    figures: dict | None = None,
    lenses: list[str] | None = None,
    zone: str = '',
    review: bool = False,
    uncertainties: list[str] | None = None,
):
    for field, value in (('action', action), ('horizon', horizon), ('conviction', conviction)):
        if value not in _choices(field):
            return _refuse(_invalid(field, value))
    try:
        rec = journal.log(
            ticker=ticker,
            action=action,
            thesis=thesis,
            bear_case=bear_case,
            invalidation=invalidation,
            horizon=horizon,
            conviction=conviction,
            target=target,
            buy_range=buy_range,
            sell_range=sell_range,
            figures=figures or {},
            lenses=lenses or [],
            zone=zone,
            review=review,
            uncertainties=uncertainties or [],
        )
    except journal.Refused as refused:
        return _refuse(str(refused))
    return answer(_row(rec), sources=['journal', 'saxo'])


@tool('Record whether a logged recommendation was accepted or declined.')
def set_decision(id: int, decision: str):
    if decision not in _choices('decision'):
        return _refuse(_invalid('decision', decision))
    rec = _find(id)
    if rec is None:
        return _refuse(f'No recommendation {id}.')
    rec.decision = decision
    rec.save(update_fields=['decision'])
    return answer(_row(rec), sources=['journal'])


@tool('Close a logged recommendation: sold, invalidated or superseded.')
def close_recommendation(id: int, reason: str):
    if reason not in _choices('close_reason'):
        return _refuse(_invalid('close_reason', reason))
    rec = _find(id)
    if rec is None:
        return _refuse(f'No recommendation {id}.')
    if rec.closed_at is not None:
        return _refuse(f'Recommendation {id} is already closed.')
    rec.closed_at = timezone.now()
    rec.close_reason = reason
    rec.save(update_fields=['closed_at', 'close_reason'])
    return answer(_row(rec), sources=['journal'])


@tool('List logged recommendations, newest first: open, closed or all.')
def list_recommendations(status: str = 'open', limit: int = 50):
    if status not in STATUSES:
        return _refuse(f'Unknown status {status!r}; use one of: {", ".join(STATUSES)}.')
    rows = Recommendation.objects.all()
    if status == 'open':
        rows = rows.filter(closed_at__isnull=True)
    elif status == 'closed':
        rows = rows.filter(closed_at__isnull=False)
    recs = list(rows)
    prices = price_series({rec.ticker for rec in recs} | {BENCHMARK_TICKER})
    benchmark = prices.get(BENCHMARK_TICKER) or Series([], [])
    today = timezone.localdate()
    items = []
    for rec in recs:
        item = _row(rec)
        item['score'] = scoring.score(rec, prices, benchmark, today)
        items.append(item)
    summary = scoring.summary(items)
    for item in items:
        item['score'] = _serialised(item['score'])
    warnings = [] if benchmark else [f'No {BENCHMARK_TICKER} price history yet, so recommendations are not scored.']
    data = {**capped(items, limit), 'summary': summary}
    return answer(data, sources=['journal', 'price history'], warnings=warnings)
