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

from .. import company_data
from ..envelope import answer
from ..shaping import capped, without
from ..views import call_view, problem
from . import tool
from .research import _bare, resolve

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


def _capped_keys(payload, limits):
    shaped = dict(payload)
    for key, limit in limits.items():
        if isinstance(shaped.get(key), list):
            shaped[key] = capped(shaped[key], limit)
    return shaped


def _failed(sources, *messages):
    return answer(None, sources=sources, warnings=[m for m in messages if m])


@tool('Tracked 13F funds: the directory with each fund latest quarter, value, turnover and copy-performance edge, capped at limit.')
def list_investors(limit: int = DIRECTORY_LIMIT):
    result = call_view(InvestorListView)
    message = problem(result)
    if message:
        return _failed([EDGAR], message)
    return answer({'investors': capped(without(result.data), limit)}, sources=[EDGAR])


@tool('Cross-fund signals from the newest quarter most funds have filed: what several funds bought, sold or opened.')
def get_fund_signals():
    result = call_view(InvestorHubView)
    message = problem(result)
    if message:
        return _failed([EDGAR], message)
    return answer(without(result.data), sources=[EDGAR])


@tool('One 13F fund by slug: profile, top holdings, moves, quarter-over-quarter changes and copy-after-filing performance.')
def get_investor(slug: str):
    kwargs = {'slug': slug}
    detail = call_view(InvestorDetailView, kwargs=kwargs)
    message = problem(detail)
    if message:
        return _failed([EDGAR], message)
    changes = call_view(InvestorChangesView, kwargs=kwargs)
    copy = call_view(InvestorCopyView, kwargs=kwargs)
    warnings = [m for m in (problem(changes), problem(copy)) if m]
    data = _capped_keys(without(detail.data), {'holdings': HOLDINGS_LIMIT, 'moves': MOVES_LIMIT})
    if problem(changes) is None:
        data['changes'] = {
            key: capped(value, CHANGES_LIMIT) if isinstance(value, list) else value
            for key, value in without(changes.data).items()
        }
    else:
        data['changes'] = None
    if problem(copy) is None:
        copy_data = without(copy.data)
        copy_data.pop('series', None)
        data['copy'] = copy_data
    else:
        data['copy'] = None
    return answer(data, sources=[EDGAR], warnings=warnings)


@tool('Stocks ranked by fund activity in the latest signal quarter: view is bought, sold, owned or new.')
def get_fund_stocks(view: str = 'bought'):
    result = call_view(InvestorStocksView, query={'view': view})
    message = problem(result)
    if message:
        return _failed([EDGAR], message)
    return answer(_capped_keys(without(result.data), {'rows': STOCK_ROWS_LIMIT}), sources=[EDGAR])


@tool('Which tracked funds and which House members hold or trade a ticker; either side is null when the ticker is unknown to it.')
def get_ticker_ownership(symbol: str):
    ticker = _bare(symbol)
    listing = company_data.status_of(resolve(ticker))
    if listing in (company_data.FOREIGN, company_data.UNVERIFIED):
        return _failed([EDGAR, CONGRESS], company_data.refusal(listing))
    kwargs = {'ticker': ticker}
    funds = call_view(InvestorOwnershipView, kwargs=kwargs)
    members = call_view(CongressOwnershipView, kwargs=kwargs)
    fund_problem, member_problem = problem(funds), problem(members)
    investors = None
    if fund_problem is None and funds.data.get('stock') is not None:
        investors = _capped_keys(without(funds.data), {'funds': OWNERS_LIMIT})
    congress = None
    if member_problem is None and members.data.get('stock') is not None:
        congress = _capped_keys(without(members.data), {'members': OWNERS_LIMIT})
    return answer(
        {'ticker': ticker, 'investors': investors, 'congress': congress},
        sources=[EDGAR, CONGRESS],
        warnings=[m for m in (fund_problem, member_problem) if m],
    )


@tool('House members tracked from Clerk filings: directory with estimated portfolio performance (capped at limit) and the most-bought tickers.')
def list_congress_members(limit: int = DIRECTORY_LIMIT):
    result = call_view(MemberListView)
    message = problem(result)
    if message:
        return _failed([CONGRESS], message)
    return answer(_capped_keys(without(result.data), {'members': limit}), sources=[CONGRESS])


@tool('One House member by slug: estimated holdings, recent trades and copy performance.')
def get_congress_member(slug: str):
    result = call_view(MemberDetailView, kwargs={'slug': slug})
    message = problem(result)
    if message:
        return _failed([CONGRESS], message)
    data = _capped_keys(without(result.data), {'holdings': MEMBER_HOLDINGS_LIMIT, 'trades': TRADES_LIMIT})
    if isinstance(data.get('copy'), dict):
        data['copy'] = {key: value for key, value in data['copy'].items() if key != 'series'}
    return answer(data, sources=[CONGRESS])


@tool('Filing alerts for followed funds that filed a new quarter. Read-only: does not mark anything read.')
def get_filing_alerts():
    result = call_view(InvestorAlertsView)
    message = problem(result)
    if message:
        return _failed([EDGAR], message)
    return answer(without(result.data), sources=[EDGAR])
