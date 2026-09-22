from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import NetWorthSnapshot

from . import report


def _portfolio_dated_values():
    """The series risk/performance metrics are computed from.

    saxo_account_value (Saxo's reconciled cash+positions total), not
    portfolio_value (positions only) - a BUY/SELL only reallocates within
    the same Saxo account and leaves the former unchanged, while the latter
    drops every time a position is sold, reading as a loss that never
    happened. Days with no usable Saxo valuation (saxo_account_value is
    null - see portfolio.services.get_saxo_account_value) are excluded
    rather than treated as a zero.
    """
    return list(
        NetWorthSnapshot.objects
        .exclude(saxo_account_value__isnull=True)
        .order_by('date')
        .values_list('date', 'saxo_account_value')
    )


class RiskMetricsView(APIView):
    def get(self, request):
        return Response(report.risk_report(
            _portfolio_dated_values(), request.query_params.get('benchmark', ''),
        ))


class PerformanceView(APIView):
    """Portfolio vs. benchmark returns over several trailing windows.

    The benchmark half is best-effort (see report.performance_report): no Saxo
    connection just means every benchmark_pct/alpha_pct comes back None.
    """

    def get(self, request):
        return Response(report.performance_report(
            _portfolio_dated_values(), request.query_params.get('benchmark', ''),
        ))
