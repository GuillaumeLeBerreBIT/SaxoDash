# MCP server probes (run 2026-10-24, live Saxo account)

## Closed trades for the tax year

| Endpoint | Rows for 2026 | Usable for realised gains |
|---|---|---|
| `/port/v1/closedpositions/me` | 0 (closes from 20 Oct already synced were gone) | No: it lists the current session's closes only |
| `/cs/v1/reports/closedPositions/{ClientKey}/{From}/{To}` | 45 (54 since 2025-01-01) | **Yes** |
| `/cs/v1/reports/trades/{ClientKey}?FromDate=&ToDate=` | 178 trades since 2025-01-01 | For the `Uic` the closed-positions report lacks |

`ClientKey` comes from `/port/v1/clients/me`. The closed-positions report covers the full history back
to March 2025, in account currency (EUR) for every row (instrument currencies USD, EUR, SEK).

Redacted sample row (no account fields):

```json
{
  "InstrumentSymbol": "CSPX:xams", "AssetType": "Etf", "CloseType": "Sell",
  "TradeDateOpen": "2025-11-05", "TradeDateClose": "2026-03-05",
  "AmountOpen": 14.0, "AmountClose": -14.0, "OpenPrice": 571.58, "ClosePrice": 631.85,
  "PnLAccountCurrency": 792.45,
  "TotalBookedOnOpeningLegAccountCurrency": -8035.74,
  "TotalBookedOnClosingLegAccountCurrency": 8828.19
}
```

`PnLAccountCurrency` is the two booked legs added together, so costs and FX are included. A lot opened
on or before 31 Dec 2025 is rebased as closing proceeds × (close price − 31 Dec close) / close price,
which holds for longs and shorts without a separate FX rate. The report has no `Uic`; the trades report
supplies it by `InstrumentSymbol` + `AssetType` (22 of 22 symbols matched).

Result through `get_tax_year(2026)`: 45 realised rows, net €4,054.88 (Saxo's €4,800.98 with the one
pre-2026 lot, CSPX, rebased from €792.45 to €46.35).

## Finnhub quarterly EPS

GOOGL's last four quarterly `eps` values sum to 19.912 against `metric.epsTTM` 19.9118: the series is
per quarter, so `valuation.trailing_pe` sums the right figures.

## Cowork

Not yet checked: needs a Claude Desktop restart with the server configured.
