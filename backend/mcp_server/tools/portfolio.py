from django.conf import settings

from analytics.views import PerformanceView, RiskMetricsView
from portfolio.models import PortfolioValuation
from portfolio.views import PortfolioInsightsView, PortfolioSummaryView, PositionListView
from transactions.views import TransactionListView

from ..envelope import answer, saxo_warnings
from ..shaping import capped, without
from ..views import call_view, problem
from . import tool

BANKING_INSIGHT_KEYS = frozenset({'bank', 'bank_only', 'net_worth', 'change', 'spark'})
TRANSACTION_FETCH_SIZE = 1000


def _cash_eur():
    valuation = PortfolioValuation.objects.order_by('-as_of').first()
    if valuation is None or valuation.currency != settings.REPORTING_CURRENCY:
        return None
    return valuation.cash_balance


def _position(row):
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


def _insights(body):
    value = {k: v for k, v in body.get('value', {}).items() if k not in BANKING_INSIGHT_KEYS}
    kept = {k: v for k, v in body.items() if k not in BANKING_INSIGHT_KEYS}
    return without({**kept, 'value': value})


@tool('Portfolio: total value, cost and P/L in EUR, cash, every position with weight and price basis, and insights.')
def get_portfolio():
    warnings = saxo_warnings()
    summary = call_view(PortfolioSummaryView)
    positions = call_view(PositionListView)
    insights = call_view(PortfolioInsightsView)
    for result in (summary, positions, insights):
        message = problem(result)
        if message:
            warnings.append(message)

    summary_data = summary.data if problem(summary) is None else {}
    rows = [_position(row) for row in positions.data] if problem(positions) is None else None
    for row in rows or []:
        if row['price_source'] != 'live':
            warnings.append(f"{row['ticker']} priced from {row['price_source']}, not live")
    warnings.append('Prices are 15-minute delayed.')

    data = {
        'total_value_eur': summary_data.get('total_value'),
        'total_cost_eur': summary_data.get('total_cost'),
        'total_pnl_eur': summary_data.get('total_pnl'),
        'total_pnl_pct': summary_data.get('total_pnl_pct'),
        'cash_eur': _cash_eur(),
        'positions': rows,
        'insights': _insights(insights.data) if problem(insights) is None else None,
    }
    return answer(data, sources=['portfolio'], warnings=warnings)


@tool('Portfolio performance against a benchmark over trailing windows, plus risk metrics. Optional benchmark key.')
def get_performance(benchmark=''):
    query = {'benchmark': benchmark} if benchmark else {}
    performance = call_view(PerformanceView, query=query)
    risk = call_view(RiskMetricsView, query=query)
    warnings = []
    for result in (performance, risk):
        message = problem(result)
        if message:
            warnings.append(message)
    data = {
        'performance': without(performance.data) if problem(performance) is None else None,
        'risk': without(risk.data) if problem(risk) is None else None,
    }
    return answer(data, sources=['analytics'], warnings=warnings)


@tool('Recent transactions, newest first, capped at limit (default 50).')
def get_transactions(limit=50):
    result = call_view(TransactionListView, query={'page_size': TRANSACTION_FETCH_SIZE})
    message = problem(result)
    if message:
        return answer(None, sources=['transactions'], warnings=[message])
    return answer(capped(result.data['results'], limit), sources=['transactions'])
