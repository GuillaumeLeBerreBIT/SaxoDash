"""Curated benchmark indices, priced in EUR from Saxo's own chart data.

Saxo doesn't expose raw indices to search - these are liquid ETF proxies,
looked up once and hardcoded rather than searched at runtime (verified live
against SIM: SPY/QQQ/IWDA and EURUSD all return real chart data). SPY and QQQ
are USD; converting through EURUSD's own daily close means a benchmark's
"return" never silently includes FX movement it didn't earn as reported
market performance.
"""
import logging
from datetime import date

from research import market
from research.providers import ProviderError

logger = logging.getLogger(__name__)

EURUSD_UIC = 21
CHART_COUNT = 500


class BenchmarkUnavailable(Exception):
    """No benchmark series can be built right now - not connected, an empty
    chart, or nothing left after FX conversion. One exception so callers never
    have to catch a provider failure, a KeyError, or a divide-by-zero.
    """

BENCHMARKS = {
    'sp500': {'name': 'S&P 500', 'uic': 36590, 'asset_type': 'Etf', 'currency': 'USD'},
    'nasdaq100': {'name': 'NASDAQ 100', 'uic': 4328771, 'asset_type': 'Etf', 'currency': 'USD'},
    'world': {'name': 'World Index', 'uic': 50629, 'asset_type': 'Etf', 'currency': 'EUR'},
}


def eur_closes(benchmark_key):
    """Daily closes for one benchmark, converted to EUR - (date, float) pairs.

    Raises BenchmarkUnavailable for every reason the series can't be built.
    """
    info = BENCHMARKS[benchmark_key]
    needs_fx = info['currency'] != 'EUR'
    try:
        candles = market.chart(info['uic'], info['asset_type'], 1440, CHART_COUNT)
        fx_candles = market.chart(EURUSD_UIC, 'FxSpot', 1440, CHART_COUNT) if needs_fx else []
    except ProviderError as exc:
        raise BenchmarkUnavailable(str(exc)) from exc

    if not candles:
        raise BenchmarkUnavailable(f'No chart data for benchmark {benchmark_key!r}.')

    if not needs_fx:
        pairs = [(date.fromisoformat(c['date']), c['close']) for c in candles]
    else:
        # Skip any day with a missing or zero FX rate rather than divide by it.
        fx_by_date = {c['date']: c['close'] for c in fx_candles if c['close']}
        pairs = [
            (date.fromisoformat(c['date']), c['close'] / fx_by_date[c['date']])
            for c in candles if c['date'] in fx_by_date
        ]

    if not pairs:
        # Real chart data that produced zero rows is a data-join bug (date or
        # timezone drift), not a normal "not connected" - make it visible.
        logger.warning(
            'Benchmark %r: %d candles, %d FX days, no overlapping dates',
            benchmark_key, len(candles), len(fx_candles),
        )
        raise BenchmarkUnavailable(
            f'No EUR-convertible closes for benchmark {benchmark_key!r}.'
        )
    return pairs
