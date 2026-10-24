from congress.views import MemberDetailView, MemberListView
from congress.views import OwnershipDetailView as CongressOwnershipView
from investors.views import (
    InvestorAlertsView,
    InvestorChangesView,
    InvestorCopyView,
    InvestorDetailView,
    InvestorHubView,
    InvestorListView,
    InvestorStocksView,
)
from investors.views import OwnershipDetailView as InvestorOwnershipView

from research.listings import look_up

from ..envelope import Reply, Unavailable
from ..shaping import capped
from ..views import fetch, fetch_optional
from . import tool

EDGAR = '13f'
CONGRESS = 'house-clerk'
HOLDINGS_LIMIT = 50
MOVES_LIMIT = 25
CHANGES_LIMIT = 25
STOCK_ROWS_LIMIT = 50
TRADES_LIMIT = 50
MEMBER_HOLDINGS_LIMIT = 30
OWNERS_LIMIT = 30
DIRECTORY_LIMIT = 25


def _capped_lists(payload, limits=None, default=None):
    shaped = dict(payload)
    for key, value in payload.items():
        limit = (limits or {}).get(key, default)
        if isinstance(value, list) and limit is not None:
            shaped[key] = capped(value, limit)
    return shaped


def _without_series(copy):
    if not isinstance(copy, dict):
        return copy
    return {key: value for key, value in copy.items() if key != 'series'}


@tool(
    'Investors: tracked 13F funds, with each fund\'s latest quarter, value, turnover and copy-performance edge, capped at limit.',
    sources=[EDGAR],
)
def list_investors(limit: int = DIRECTORY_LIMIT):
    return {'investors': capped(fetch(InvestorListView), limit)}


@tool('Investors: cross-fund signals from the newest quarter most funds have filed (what several funds bought, sold or opened).', sources=[EDGAR])
def get_fund_signals():
    return fetch(InvestorHubView)


@tool(
    'Investors › Fund: one 13F fund by slug (profile, top holdings, moves, quarter-over-quarter changes and copy-after-filing performance).',
    sources=[EDGAR],
)
def get_investor(slug: str):
    kwargs = {'slug': slug}
    data = _capped_lists(fetch(InvestorDetailView, kwargs=kwargs), {'holdings': HOLDINGS_LIMIT, 'moves': MOVES_LIMIT})
    warnings = []
    changes = fetch_optional(InvestorChangesView, warnings, kwargs=kwargs)
    data['changes'] = None if changes is None else _capped_lists(changes, default=CHANGES_LIMIT)
    data['copy'] = _without_series(fetch_optional(InvestorCopyView, warnings, kwargs=kwargs))
    return Reply(data, warnings)


@tool('Investors › Stocks: stocks ranked by fund activity in the latest signal quarter; view is bought, sold, owned or new.', sources=[EDGAR])
def get_fund_stocks(view: str = 'bought'):
    return _capped_lists(fetch(InvestorStocksView, query={'view': view}), {'rows': STOCK_ROWS_LIMIT})


def _known(payload, owners_key):
    if payload is None or payload.get('stock') is None:
        return None
    return _capped_lists(payload, {owners_key: OWNERS_LIMIT})


def ownership(listing):
    reason = listing.refusal(allow_fund=True)
    if reason:
        raise Unavailable(reason)
    kwargs = {'ticker': listing.ticker}
    warnings = []
    data = {
        'ticker': listing.ticker,
        'investors': _known(fetch_optional(InvestorOwnershipView, warnings, kwargs=kwargs), 'funds'),
        'congress': _known(fetch_optional(CongressOwnershipView, warnings, kwargs=kwargs), 'members'),
    }
    return Reply(data, warnings)


@tool(
    'Research: which tracked funds and which House members hold or trade a ticker; either side is null when the ticker is unknown to it.',
    sources=[EDGAR, CONGRESS],
)
def get_ticker_ownership(symbol: str):
    return ownership(look_up(symbol))


@tool(
    'Congress: House members tracked from Clerk filings, with estimated portfolio performance (capped at limit) and the most-bought tickers.',
    sources=[CONGRESS],
)
def list_congress_members(limit: int = DIRECTORY_LIMIT):
    return _capped_lists(fetch(MemberListView), {'members': limit})


@tool('Congress › Member: one House member by slug (estimated holdings, recent trades and copy performance).', sources=[CONGRESS])
def get_congress_member(slug: str):
    data = _capped_lists(
        fetch(MemberDetailView, kwargs={'slug': slug}),
        {'holdings': MEMBER_HOLDINGS_LIMIT, 'trades': TRADES_LIMIT},
    )
    data['copy'] = _without_series(data.get('copy'))
    return data


@tool('Investors › Alerts: filing alerts for followed funds that filed a new quarter. Read-only; nothing is marked read.', sources=[EDGAR])
def get_filing_alerts():
    return fetch(InvestorAlertsView)
