from django.utils import timezone

from advisor import journal
from advisor.models import Recommendation

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


def _refuse(reason):
    return answer(None, sources=['journal'], warnings=[reason])


def _invalid(field, value):
    return f'Unknown {field} {value!r}; use one of: {", ".join(sorted(_choices(field)))}.'


def _find(rec_id):
    return Recommendation.objects.filter(pk=rec_id).first()


@tool('Log a recommendation to the decision journal. The entry price is filled from Saxo; a thesis, three bear-case risks, an invalidation and (for buy_new or add) a target are required.')
def log_recommendation(
    ticker,
    action,
    thesis,
    bear_case,
    invalidation,
    horizon,
    conviction,
    target=None,
    buy_range=None,
    sell_range=None,
    figures=None,
    lenses=None,
    zone='',
    review=False,
    uncertainties=None,
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
def set_decision(id, decision):
    if decision not in _choices('decision'):
        return _refuse(_invalid('decision', decision))
    rec = _find(id)
    if rec is None:
        return _refuse(f'No recommendation {id}.')
    rec.decision = decision
    rec.save(update_fields=['decision'])
    return answer(_row(rec), sources=['journal'])


@tool('Close a logged recommendation: sold, invalidated or superseded.')
def close_recommendation(id, reason):
    if reason not in _choices('close_reason'):
        return _refuse(_invalid('close_reason', reason))
    rec = _find(id)
    if rec is None:
        return _refuse(f'No recommendation {id}.')
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
    items = [_row(rec) for rec in rows]
    return answer(capped(items, limit), sources=['journal'])
