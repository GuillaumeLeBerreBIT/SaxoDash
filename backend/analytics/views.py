from rest_framework.response import Response
from rest_framework.views import APIView

from portfolio import account_performance

from . import report


def _with_history(build, request):
    growth, warning = account_performance.growth_series(user=request.user)
    body = build(growth, request.query_params.get('benchmark', ''), user=request.user)
    body['history_warning'] = warning
    return Response(body)


class RiskMetricsView(APIView):
    def get(self, request):
        return _with_history(report.risk_report, request)


class PerformanceView(APIView):
    """Portfolio vs. benchmark returns over several trailing windows.

    The benchmark half is best-effort (see report.performance_report): no Saxo
    connection just means every benchmark_pct/alpha_pct comes back None.
    """

    def get(self, request):
        return _with_history(report.performance_report, request)
