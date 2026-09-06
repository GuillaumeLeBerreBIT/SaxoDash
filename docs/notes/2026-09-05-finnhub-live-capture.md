# Finnhub live capture (AAPL)

Captured with a real `FINNHUB_API_KEY` against the live Finnhub API, to confirm real
response field names before Task 4 shapes the combined fundamentals payload.

Command run (from `backend/`, exactly as specified in the Task 3 brief):

```bash
cd backend && .venv/bin/python manage.py shell -c "
from research import finnhub
import json
for name, fn in [
    ('profile', finnhub.get_profile),
    ('basic_financials', finnhub.get_basic_financials),
    ('recommendation_trends', finnhub.get_recommendation_trends),
    ('earnings_history', finnhub.get_earnings_history),
]:
    print(f'--- {name} ---')
    print(json.dumps(fn('AAPL'), indent=2))
"
```

## Raw responses (AAPL, captured 2026-09-06)

### profile

```json
{
  "ticker": "AAPL",
  "name": "Apple Inc",
  "country": "US",
  "currency": "USD",
  "estimateCurrency": "USD",
  "exchange": "NASDAQ NMS - GLOBAL MARKET",
  "ipo": "1980-12-12",
  "marketCapitalization": 4669699.553033864,
  "logo": "https://static2.finnhub.io/file/publicdatany/finnhubimage/stock_logo/AAPL.png",
  "shareOutstanding": 14687.36,
  "finnhubIndustry": "Technology",
  "phone": "14089961010",
  "weburl": "https://www.apple.com/",
  "floatingShare": 14445.7
}
```

### basic_financials

The real response is `{"metric": {...}, "metricType": "all", "series": {...}, "symbol": "AAPL"}`.
The `metric` object (the flat fields Task 4 shapes from) is reproduced below in full —
it is 134 keys, unabridged. The `series` object is a decades-deep annual/quarterly
time series (27,208 lines of raw JSON, ~500KB) that duplicates the same metric names
under `series.annual.<name>` / `series.quarterly.<name>` as `[{"period": ..., "v": ...}, ...]`
arrays going back to 1989 (quarterly) / 1990 (annual). It is abridged here — replaced
with a `series` note listing every metric name available under it — because it adds no
field names beyond what's already in `metric` below, and pasting it in full would make
this file impractically large for what Task 4 actually needs (confirmed field names,
not historical values). Nothing under `metric`, `metricType`, or `symbol` was touched.

```json
{
  "metric": {
    "10DayAverageTradingVolume": 37.06557,
    "13WeekPriceReturnDaily": 2.8082,
    "26WeekPriceReturnDaily": 21.3156,
    "3MonthADReturnStd": 31.72754,
    "3MonthAverageTradingVolume": 52.997,
    "52WeekHigh": 344.5699,
    "52WeekHighDate": "2026-07-29",
    "52WeekLow": 225.95,
    "52WeekLowDate": "2025-09-10",
    "52WeekPriceReturnDaily": 33.4933,
    "5DayPriceReturnDaily": 0.9847,
    "assetTurnoverAnnual": 1.1584,
    "assetTurnoverTTM": 1.2508,
    "beta": 1.0966319,
    "bookValuePerShareAnnual": 4.991,
    "bookValuePerShareQuarterly": 7.3599,
    "bookValueShareGrowth5Y": 5.34,
    "capexCagr5Y": 11.71,
    "cashFlowPerShareAnnual": 6.6855,
    "cashFlowPerShareQuarterly": 9.3561,
    "cashFlowPerShareTTM": 6.86253,
    "cashPerSharePerShareAnnual": 3.7024,
    "cashPerSharePerShareQuarterly": 4.2713,
    "currentDividendYieldTTM": 0.3349,
    "currentEv/freeCashFlowAnnual": 47.7335,
    "currentEv/freeCashFlowTTM": 34.4922,
    "currentRatioAnnual": 0.8933,
    "currentRatioQuarterly": 1.0033,
    "dividendGrowthRate5Y": 4.95,
    "dividendIndicatedAnnual": 1.08,
    "dividendPerShareAnnual": 1.0318,
    "dividendPerShareTTM": 1.0616,
    "dividendYieldIndicatedAnnual": 0.50534,
    "ebitdPerShareAnnual": 9.6468,
    "ebitdPerShareTTM": 11.365,
    "ebitdaCagr5Y": 13.35,
    "ebitdaInterimCagr5Y": 7.67,
    "enterpriseValue": 4714499.5,
    "epsAnnual": 7.465,
    "epsBasicExclExtraItemsAnnual": 7.465,
    "epsBasicExclExtraItemsTTM": 8.723299999999998,
    "epsExclExtraItemsAnnual": 7.465,
    "epsExclExtraItemsTTM": 8.723299999999998,
    "epsGrowth3Y": 6.89,
    "epsGrowth5Y": 17.91,
    "epsGrowthQuarterlyYoy": 29.13,
    "epsGrowthTTMYoy": 32.61,
    "epsInclExtraItemsAnnual": 7.465,
    "epsInclExtraItemsTTM": 8.723299999999998,
    "epsNormalizedAnnual": 7.465,
    "epsTTM": 8.723299999999998,
    "evEbitdaTTM": 28.0693,
    "evRevenueTTM": 10.0991,
    "focfCagr5Y": 6.13,
    "forwardPE": 34.85022,
    "forwardPEG": 2.52538,
    "grossMargin5Y": 44.47,
    "grossMarginAnnual": 46.91,
    "grossMarginTTM": 48.65,
    "inventoryTurnoverAnnual": 33.9834,
    "inventoryTurnoverTTM": 28.1718,
    "longTermDebt/equityAnnual": 1.0623,
    "longTermDebt/equityQuarterly": 0.6635,
    "marketCapitalization": 4669699.5,
    "monthToDatePriceReturnDaily": 0.9847,
    "netIncomeEmployeeAnnual": 0.6748,
    "netIncomeEmployeeTTM": 0.7767,
    "netInterestCoverageAnnual": 622.5082,
    "netInterestCoverageTTM": 622.5082,
    "netMarginGrowth5Y": 5.18,
    "netProfitMargin5Y": 25.48,
    "netProfitMarginAnnual": 26.92,
    "netProfitMarginTTM": 27.62,
    "operatingMargin5Y": 30.67,
    "operatingMarginAnnual": 31.97,
    "operatingMarginTTM": 33.17,
    "payoutRatioAnnual": 13.77,
    "payoutRatioTTM": 12.13,
    "pb": 43.431,
    "pbAnnual": 50.978,
    "pbQuarterly": 38.486,
    "pcfShareAnnual": 41.8875,
    "pcfShareTTM": 31.8264,
    "peAnnual": 41.69,
    "peBasicExclExtraTTM": 36.2189,
    "peExclExtraAnnual": 30.96975,
    "peExclExtraTTM": 36.2189,
    "peInclExtraTTM": 36.2189,
    "peNormalizedAnnual": 41.69,
    "peTTM": 36.2189,
    "pegTTM": 2.93443,
    "pfcfShareAnnual": 47.28,
    "pfcfShareTTM": 34.1644,
    "pretaxMargin5Y": 30.64,
    "pretaxMarginAnnual": 31.89,
    "pretaxMarginTTM": 33.4,
    "priceRelativeToS&P50013Week": 1.0779,
    "priceRelativeToS&P50026Week": 8.1073,
    "priceRelativeToS&P5004Week": 4.1661,
    "priceRelativeToS&P50052Week": 14.4973,
    "priceRelativeToS&P500Ytd": 4.7523,
    "psAnnual": 11.2209,
    "psTTM": 10.0031,
    "ptbvAnnual": 4.8643,
    "ptbvQuarterly": 47.4663,
    "quickRatioAnnual": 0.8588,
    "quickRatioQuarterly": 0.929,
    "receivablesTurnoverAnnual": 11.3725,
    "receivablesTurnoverTTM": 15.8366,
    "revenueEmployeeAnnual": 2.507,
    "revenueEmployeeTTM": 2.8122,
    "revenueGrowth3Y": 1.81,
    "revenueGrowth5Y": 8.68,
    "revenueGrowthQuarterlyYoy": 16.36,
    "revenueGrowthTTMYoy": 14.24,
    "revenuePerShareAnnual": 27.7354,
    "revenuePerShareTTM": 31.725,
    "revenueShareGrowth5Y": 12.11,
    "roa5Y": 27.93,
    "roaRfy": 31.180000000000003,
    "roaTTM": 34.55,
    "roe5Y": 163.92,
    "roeRfy": 151.91,
    "roeTTM": 137.17999999999998,
    "roi5Y": 57.1,
    "roiAnnual": 64.51,
    "roiTTM": 70.25,
    "tangibleBookValuePerShareAnnual": 5.8583,
    "tangibleBookValuePerShareQuarterly": 5.9674,
    "tbvCagr5Y": 11.34,
    "totalDebt/totalEquityAnnual": 1.3547,
    "totalDebt/totalEquityQuarterly": 0.7844,
    "yearToDatePriceReturnDaily": 17.6966
  },
  "metricType": "all",
  "series": {
    "_note": "ABRIDGED for this doc — 27,208 lines of {period, v} history omitted. Each metric name below has an array of {\"period\": \"YYYY-MM-DD\", \"v\": <number>} entries, newest first, back to ~1989/1990.",
    "annual": {
      "_metric_names": [
        "bookValue", "cashRatio", "currentRatio", "ebitPerShare", "ebitda", "eps",
        "ev", "evEbitda", "evRevenue", "fcfMargin", "grossMargin", "inventoryTurnover",
        "longtermDebtTotalAsset", "longtermDebtTotalCapital", "longtermDebtTotalEquity",
        "netDebtToTotalCapital", "netDebtToTotalEquity", "netMargin", "operatingMargin",
        "payoutRatio", "pb", "pe", "pfcf", "pretaxMargin", "ps", "ptbv", "quickRatio",
        "receivablesTurnover", "roa", "roe", "roic", "rotc", "salesPerShare", "sgaToSale",
        "tangibleBookValue", "totalDebtToEquity", "totalDebtToTotalAsset",
        "totalDebtToTotalCapital", "totalRatio"
      ]
    },
    "quarterly": {
      "_metric_names": [
        "assetTurnoverTTM", "bookValue", "cashRatio", "currentRatio", "ebitPerShare",
        "ebitda", "eps", "ev", "evEbitdaTTM", "evRevenueTTM", "fcfMargin",
        "fcfPerShareTTM", "grossMargin", "inventoryTurnoverTTM",
        "longtermDebtTotalAsset", "longtermDebtTotalCapital", "longtermDebtTotalEquity",
        "netDebtToTotalCapital", "netDebtToTotalEquity", "netMargin", "operatingMargin",
        "payoutRatioTTM", "pb", "peTTM", "pfcfTTM", "pretaxMargin", "psTTM", "ptbv",
        "quickRatio", "receivablesTurnoverTTM", "roaTTM", "roeTTM", "roicTTM",
        "rotcTTM", "salesPerShare", "sgaToSale", "tangibleBookValue",
        "totalDebtToEquity", "totalDebtToTotalAsset", "totalDebtToTotalCapital",
        "totalRatio"
      ]
    }
  },
  "symbol": "AAPL"
}
```

### recommendation_trends

```json
[
  {
    "symbol": "AAPL",
    "period": "2026-09-01",
    "strongBuy": 12,
    "buy": 22,
    "hold": 15,
    "sell": 3,
    "strongSell": 1
  },
  {
    "symbol": "AAPL",
    "period": "2026-08-01",
    "strongBuy": 13,
    "buy": 24,
    "hold": 14,
    "sell": 3,
    "strongSell": 0
  },
  {
    "symbol": "AAPL",
    "period": "2026-07-01",
    "strongBuy": 13,
    "buy": 23,
    "hold": 16,
    "sell": 2,
    "strongSell": 0
  },
  {
    "symbol": "AAPL",
    "period": "2026-06-01",
    "strongBuy": 14,
    "buy": 24,
    "hold": 15,
    "sell": 2,
    "strongSell": 0
  }
]
```

### earnings_history

```json
[
  {
    "symbol": "AAPL",
    "estimate": 1.9271,
    "actual": 1.91,
    "period": "2026-06-30",
    "surprise": -0.0171,
    "surprisePercent": -0.8873,
    "year": 2026,
    "quarter": 3
  },
  {
    "symbol": "AAPL",
    "estimate": 1.9884,
    "actual": 2.01,
    "period": "2026-03-31",
    "surprise": 0.0216,
    "surprisePercent": 1.0863,
    "year": 2026,
    "quarter": 2
  },
  {
    "symbol": "AAPL",
    "estimate": 2.7257,
    "actual": 2.84,
    "period": "2025-12-31",
    "surprise": 0.1143,
    "surprisePercent": 4.1934,
    "year": 2026,
    "quarter": 1
  },
  {
    "symbol": "AAPL",
    "estimate": 1.8075,
    "actual": 1.85,
    "period": "2025-09-30",
    "surprise": 0.0425,
    "surprisePercent": 2.3513,
    "year": 2025,
    "quarter": 4
  }
]
```

## Reconciliation

Every field name assumed in the Task 3/4 brief was checked against the real capture
above. Result: **all assumed field names matched exactly — zero renames, zero missing
fields.**

### Profile

| Assumed | Real | Status |
|---|---|---|
| `name` | `name` | matched exactly |
| `finnhubIndustry` | `finnhubIndustry` | matched exactly |
| `marketCapitalization` | `marketCapitalization` | matched exactly |
| `shareOutstanding` | `shareOutstanding` | matched exactly |

### Basic financials (`metric` object)

| Assumed | Real | Status |
|---|---|---|
| `peNormalizedAnnual` | `peNormalizedAnnual` | matched exactly |
| `psTTM` | `psTTM` | matched exactly |
| `pbAnnual` | `pbAnnual` | matched exactly |
| `epsGrowth5Y` | `epsGrowth5Y` | matched exactly |
| `dividendYieldIndicatedAnnual` | `dividendYieldIndicatedAnnual` | matched exactly |
| `epsInclExtraItemsTTM` | `epsInclExtraItemsTTM` | matched exactly |
| `52WeekHigh` | `52WeekHigh` | matched exactly |
| `52WeekLow` | `52WeekLow` | matched exactly |
| `roeTTM` | `roeTTM` | matched exactly |
| `netProfitMarginTTM` | `netProfitMarginTTM` | matched exactly |
| `grossMarginTTM` | `grossMarginTTM` | matched exactly |

No assumed fields were missing. Note for Task 4: `get_basic_financials` calls
`/stock/metric?metric=all`, so the real response also carries a `metricType` field
and a large `series` object (historical annual/quarterly time series, same metric
names, `{period, v}` shape) alongside `metric` — Task 4 should read only from
`metric` and can ignore `series` unless a future task specifically wants history.

### Recommendation trends

| Assumed | Real | Status |
|---|---|---|
| `buy` | `buy` | matched exactly |
| `hold` | `hold` | matched exactly |
| `sell` | `sell` | matched exactly |
| `strongBuy` | `strongBuy` | matched exactly |
| `strongSell` | `strongSell` | matched exactly |
| `period` | `period` | matched exactly |
| newest first | confirmed (2026-09-01, 2026-08-01, 2026-07-01, 2026-06-01) | matched exactly |

Not assumed but present: `symbol` on every entry (harmless extra field).

### Earnings history

| Assumed | Real | Status |
|---|---|---|
| `period` | `period` | matched exactly |
| `actual` | `actual` | matched exactly |
| `estimate` | `estimate` | matched exactly |
| `surprisePercent` | `surprisePercent` | matched exactly |
| newest first | confirmed (2026-06-30, 2026-03-31, 2025-12-31, 2025-09-30) | matched exactly |

Not assumed but present: `symbol`, `surprise` (absolute, not percent), `year`,
`quarter` on every entry (harmless extra fields — Task 4 can pick these up too if
useful, but they were not part of the original assumption list).

**Conclusion for Task 4:** the brief's assumed field names can be used as-is,
unchanged. No substitutions or omissions are required for any of the four endpoints.
