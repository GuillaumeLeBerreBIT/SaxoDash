"""Compose the risk and performance responses from `metrics` + `benchmarks`.

The views used to do this twice, with two different policies for "Saxo isn't
connected". Here the benchmark half is best-effort in one place: `benchmarks`
raises `BenchmarkUnavailable` and this module turns that into an empty benchmark
block with a reason, so a view never has to know Saxo exists.
"""
from django.conf import settings

from . import benchmarks, metrics

DEFAULT_BENCHMARK = 'world'


def resolve_benchmark_key(raw):
    return raw if raw in benchmarks.BENCHMARKS else DEFAULT_BENCHMARK


def available_benchmarks():
    return [{'key': key, 'name': info['name']} for key, info in benchmarks.BENCHMARKS.items()]


def _empty_benchmark(key, reason):
    # benchmark_summary already produces this exact shape with too little data;
    # reuse it rather than a second copy of the same keys.
    empty = metrics.benchmark_summary([], [], settings.RISK_FREE_RATE_ANNUAL)
    return {'key': key, 'name': benchmarks.BENCHMARKS[key]['name'], 'reason': reason, **empty}


def _benchmark(key, port_dated_values):
    try:
        bench_dated_values = benchmarks.eur_closes(key)
    except benchmarks.BenchmarkUnavailable as exc:
        return _empty_benchmark(key, reason=str(exc))

    result = metrics.benchmark_summary(
        port_dated_values, bench_dated_values, settings.RISK_FREE_RATE_ANNUAL
    )
    return {'key': key, 'name': benchmarks.BENCHMARKS[key]['name'], 'reason': None, **result}


def risk_report(port_dated_values, benchmark_key):
    key = resolve_benchmark_key(benchmark_key)
    summary = metrics.risk_summary(port_dated_values, settings.RISK_FREE_RATE_ANNUAL)
    summary['available_benchmarks'] = available_benchmarks()
    summary['benchmark'] = (
        _benchmark(key, port_dated_values)
        if summary['has_data']
        else _empty_benchmark(key, reason=None)
    )
    return summary


def performance_report(port_dated_values, benchmark_key):
    key = resolve_benchmark_key(benchmark_key)

    # Same threshold as risk_report's has_data: below it, the benchmark can add
    # nothing, so don't spend a Saxo call on it.
    bench_dated_values = []
    reason = None
    if len(port_dated_values) >= metrics.MIN_DAILY_POINTS:
        try:
            bench_dated_values = benchmarks.eur_closes(key)
        except benchmarks.BenchmarkUnavailable as exc:
            reason = str(exc)  # every benchmark_pct/alpha_pct then comes back None

    summary = metrics.performance_summary(port_dated_values, bench_dated_values)
    # Thinner than risk_report's block on purpose: the per-period rows already
    # carry benchmark_pct; this is just the label plus why it may be blank.
    summary['benchmark'] = {'key': key, 'name': benchmarks.BENCHMARKS[key]['name'], 'reason': reason}
    summary['available_benchmarks'] = available_benchmarks()
    return summary
