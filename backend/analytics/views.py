from django.conf import settings
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import NetWorthSnapshot
from saxo.credentials import SaxoNotConnected

from . import benchmarks, metrics

DEFAULT_BENCHMARK = 'world'

EMPTY_BENCHMARK = {
    'has_data': False,
    'expected_return': None,
    'beta': None,
    'tracking_error': None,
    'information_ratio': None,
    'jensen_alpha': None,
}


class RiskMetricsView(APIView):

    def get(self, request):
        dated_values = list(
            NetWorthSnapshot.objects.order_by('date').values_list('date', 'portfolio_value')
        )
        summary = metrics.risk_summary(dated_values, settings.RISK_FREE_RATE_ANNUAL)

        benchmark_key = request.query_params.get('benchmark', DEFAULT_BENCHMARK)
        if benchmark_key not in benchmarks.BENCHMARKS:
            benchmark_key = DEFAULT_BENCHMARK

        summary['benchmark'] = (
            self._benchmark_summary(benchmark_key, dated_values)
            if summary['has_data']
            else self._empty_benchmark(benchmark_key, reason=None)
        )
        return Response(summary)

    def _benchmark_summary(self, key, dated_values):
        # Nothing about the portfolio's own metrics should depend on Saxo
        # being connected right now - only this extra, opt-in comparison does.
        try:
            bench_dated_values = benchmarks.eur_closes(key)
        except SaxoNotConnected as exc:
            return self._empty_benchmark(key, reason=str(exc))

        result = metrics.benchmark_summary(
            dated_values, bench_dated_values, settings.RISK_FREE_RATE_ANNUAL
        )
        return {'key': key, 'name': benchmarks.BENCHMARKS[key]['name'], 'reason': None, **result}

    def _empty_benchmark(self, key, reason):
        return {
            'key': key,
            'name': benchmarks.BENCHMARKS[key]['name'],
            'reason': reason,
            **EMPTY_BENCHMARK,
        }
