"""Curated benchmark indices, priced in EUR from Saxo's own chart data.

Saxo doesn't expose raw indices to search - these are liquid ETF proxies,
looked up once and hardcoded rather than searched at runtime (verified live
against SIM: SPY/QQQ/IWDA and EURUSD all return real chart data). SPY and QQQ
are USD; converting through EURUSD's own daily close means a benchmark's
"return" never silently includes FX movement it didn't earn as reported
market performance.
"""
from datetime import date

from research import market

EURUSD_UIC = 21
CHART_COUNT = 500

BENCHMARKS = {
    'sp500': {'name': 'S&P 500', 'uic': 36590, 'asset_type': 'Etf', 'currency': 'USD'},
    'nasdaq100': {'name': 'NASDAQ 100', 'uic': 4328771, 'asset_type': 'Etf', 'currency': 'USD'},
    'world': {'name': 'World Index', 'uic': 50629, 'asset_type': 'Etf', 'currency': 'EUR'},
}


def eur_closes(benchmark_key):
    """Daily closes for one benchmark, converted to EUR - (date, float) pairs."""
    info = BENCHMARKS[benchmark_key]
    candles = market.chart(info['uic'], info['asset_type'], 1440, CHART_COUNT)

    if info['currency'] == 'EUR':
        return [(date.fromisoformat(c['date']), c['close']) for c in candles]

    fx_by_date = {c['date']: c['close'] for c in market.chart(EURUSD_UIC, 'FxSpot', 1440, CHART_COUNT)}
    return [
        (date.fromisoformat(c['date']), c['close'] / fx_by_date[c['date']])
        for c in candles if c['date'] in fx_by_date
    ]
