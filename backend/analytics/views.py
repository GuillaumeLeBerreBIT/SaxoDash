from django.conf import settings
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import NetWorthSnapshot
from saxo.credentials import SaxoNotConnected

from . import benchmarks, metrics

DEFAULT_BENCHMARK = 'world'


def _resolve_benchmark_key(request):
    key = request.query_params.get('benchmark', DEFAULT_BENCHMARK)
    return key if key in benchmarks.BENCHMARKS else DEFAULT_BENCHMARK


def _available_benchmarks():
    return [{'key': key, 'name': info['name']} for key, info in benchmarks.BENCHMARKS.items()]


def _portfolio_dated_values():
    return list(NetWorthSnapshot.objects.order_by('date').values_list('date', 'portfolio_value'))


class RiskMetricsView(APIView):

    def get(self, request):
        dated_values = _portfolio_dated_values()
        summary = metrics.risk_summary(dated_values, settings.RISK_FREE_RATE_ANNUAL)

        benchmark_key = _resolve_benchmark_key(request)
        summary['available_benchmarks'] = _available_benchmarks()
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
        # benchmark_summary already produces this exact shape when it has too
        # little overlap to compute anything - reuse it rather than a second,
        # easy-to-forget copy of the same five keys.
        empty = metrics.benchmark_summary([], [], settings.RISK_FREE_RATE_ANNUAL)
        return {'key': key, 'name': benchmarks.BENCHMARKS[key]['name'], 'reason': reason, **empty}


class PerformanceView(APIView):
    """Portfolio vs. benchmark returns over several trailing windows.

    Each period row tolerates a missing side on its own (see
    metrics.performance_summary) - no Saxo connection just means every
    benchmark_pct/alpha_pct comes back None, not a failed request.
    """

    def get(self, request):
        dated_values = _portfolio_dated_values()
        benchmark_key = _resolve_benchmark_key(request)

        bench_dated_values = []
        if dated_values:
            try:
                bench_dated_values = benchmarks.eur_closes(benchmark_key)
            except SaxoNotConnected:
                pass

        summary = metrics.performance_summary(dated_values, bench_dated_values)
        summary['benchmark'] = {'key': benchmark_key, 'name': benchmarks.BENCHMARKS[benchmark_key]['name']}
        summary['available_benchmarks'] = _available_benchmarks()
        return Response(summary)
