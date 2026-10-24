from advisor import journal
from investors.copying import BENCHMARK_TICKER
from research import daily
from research.listings import look_up

from ..envelope import Reply, Unavailable
from ..shaping import capped
from . import tool

NO_CLOSES = 'the chart has no closes.'


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
        'recorded_at': rec.recorded_at,
        'decision': rec.decision,
        'closed_at': rec.closed_at,
        'close_reason': rec.close_reason or None,
    }


def _entry_price(listing):
    bars, reason = daily.available(listing)
    price = daily.latest_close(bars or [])
    return price, None if price is not None else reason or NO_CLOSES


def _refusing(step, *args, **kwargs):
    try:
        return step(*args, **kwargs)
    except journal.Refused as refused:
        raise Unavailable(str(refused)) from refused


@tool(
    'Advisor: log a recommendation to the decision journal (US-dollar listings only). The entry price is filled from Saxo; '
    'a thesis, three bear-case risks, an invalidation and (for buy_new or add) a target are required.',
    sources=['journal', 'saxo'],
    saxo=True,
)
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
    rec = _refusing(
        journal.log,
        listing=look_up(ticker),
        entry_price=_entry_price,
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
    return _row(rec)


@tool('Advisor: record whether a logged recommendation was accepted or declined.', sources=['journal'])
def set_decision(id: int, decision: str):
    return _row(_refusing(journal.decide, id, decision))


@tool('Advisor: close a logged recommendation as sold, invalidated or superseded.', sources=['journal'])
def close_recommendation(id: int, reason: str):
    return _row(_refusing(journal.close, id, reason))


@tool('Advisor: logged recommendations, newest first, with 3/6/12-month scores against the S&P 500; status is open, closed or all.', sources=['journal', 'price history'])
def list_recommendations(status: str = 'open', limit: int = 50):
    result = _refusing(journal.review, status)
    items = [{**_row(rec), 'score': score} for rec, score in result['recommendations']]
    warnings = [f'No {BENCHMARK_TICKER} price history yet, so recommendations are not scored.'] if result['benchmark_missing'] else []
    return Reply({**capped(items, limit), 'summary': result['summary']}, warnings)
