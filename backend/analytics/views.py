from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import NetWorthSnapshot

from . import report


def _portfolio_dated_values():
    return list(NetWorthSnapshot.objects.order_by('date').values_list('date', 'portfolio_value'))


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
