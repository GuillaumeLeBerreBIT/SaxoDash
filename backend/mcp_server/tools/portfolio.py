from django.conf import settings

from analytics.views import PerformanceView, RiskMetricsView
from portfolio.models import PortfolioValuation
from portfolio.insights import build_position_insights
from portfolio.views import PortfolioSummaryView, PositionListView
from transactions.views import TransactionListView

from ..envelope import Reply
from ..shaping import capped, numbers, without
from ..views import fetch, fetch_optional
from . import tool

TRANSACTION_FETCH_SIZE = 1000


def _cash_eur():
    valuation = PortfolioValuation.objects.order_by('-as_of').first()
    if valuation is None or valuation.currency != settings.REPORTING_CURRENCY:
        return None
    return valuation.cash_balance


POSITION_NUMBERS = ('qty', 'avg_cost', 'current_price')
TRANSACTION_NUMBERS = ('qty', 'price', 'fx_rate')


def _position(row):
    row = numbers(row, POSITION_NUMBERS)
    return {
        'ticker': row['ticker'],
        'name': row['name'],
        'qty': row['qty'],
        'currency': row['currency'],
        'avg_cost': row['avg_cost'],
        'current_price': row['current_price'],
        'value_eur': row['value'],
        'cost_eur': row['cost'],
        'pnl_eur': row['pnl'],
        'pnl_pct': row['pnl_pct'],
        'weight_pct': row['weight'],
        'price_source': row['price_source'],
        'has_thesis': row['has_thesis'],
    }


@tool(
    'Portfolio: total value, cost and P/L in EUR, cash, every position with weight and price basis, and insights.',
    sources=['portfolio'],
    saxo=True,
)
def get_portfolio():
    warnings = []
    summary = fetch_optional(PortfolioSummaryView, warnings) or {}
    listed = fetch_optional(PositionListView, warnings)
    rows = None if listed is None else [_position(row) for row in listed]
    for row in rows or []:
        if row['price_source'] != 'live':
            warnings.append(f"{row['ticker']} priced from {row['price_source']}, not live")
    if rows:
        warnings.append('Prices are 15-minute delayed.')
    data = {
        'total_value_eur': summary.get('total_value'),
        'total_cost_eur': summary.get('total_cost'),
        'total_pnl_eur': summary.get('total_pnl'),
        'total_pnl_pct': summary.get('total_pnl_pct'),
        'cash_eur': _cash_eur(),
        'positions': rows,
        'insights': without(build_position_insights()),
    }
    return Reply(data, warnings)


@tool(
    'Analytics: portfolio performance against a benchmark over trailing windows, plus risk metrics. Optional benchmark key.',
    sources=['analytics'],
)
def get_performance(benchmark: str = ''):
    query = {'benchmark': benchmark} if benchmark else {}
    warnings = []
    data = {
        'performance': fetch_optional(PerformanceView, warnings, query=query),
        'risk': fetch_optional(RiskMetricsView, warnings, query=query),
    }
    return Reply(data, warnings)


@tool('Transactions: recent transactions, newest first, capped at limit (default 50).', sources=['transactions'], saxo=True)
def get_transactions(limit: int = 50):
    page = fetch(TransactionListView, query={'page_size': TRANSACTION_FETCH_SIZE})
    rows = [numbers(row, TRANSACTION_NUMBERS) for row in page['results']]
    return capped(rows, min(limit, TRANSACTION_FETCH_SIZE), page['count'])
