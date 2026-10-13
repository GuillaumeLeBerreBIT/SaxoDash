# Investors ↔ Portfolio link — design

## Purpose

The app tracks 88 funds' 13F filings and, separately, the user's own positions. Nothing joins
them: to learn what tracked funds did with a stock you own, you leave Portfolio, open
`/investors/stocks` and hunt for the row.

The goal is to **check a holding against the tracked funds**: for a stock you own or are
researching, show which funds hold it and what they did in the latest quarter.

Success: the Holdings table says at a glance which positions funds are buying or selling, and
one click shows who.

## What the data says

Checked against the dev database (Q2 2026, 88 funds):

| Position | Funds with a row | New | Added | Trimmed | Sold out |
|---|---|---|---|---|---|
| NBIS | 7 | 5 | 1 | 0 | 1 |
| AMZN | 37 | 1 | 18 | 17 | 0 |
| MSFT | 38 | 2 | 13 | 14 | 4 |
| GOOGL | 40 | 4 | 7 | 19 | 1 |

An owner count alone is noise for megacaps (37–40 of 88 hold each). What varies, and what a
holder cares about, is how many shares the funds hold in total and whether that figure grew or
shrank, so the Portfolio table leads with those two.

## Decisions

- **Read-only, stored data only.** Both endpoints read `PositionMove` and `Security`. No EDGAR,
  Saxo or Finnhub call, so no throttle scope.
- **`investors` owns the lookup; the pages compose.** `portfolio` and `research` do not import
  `investors`. The frontend calls `/api/investors/ownership/…` next to the calls it already makes.
  Rejected: adding the figures to the positions serializer (couples the apps, slows the most-used
  endpoint) and filtering `/investors/stocks/` in the browser (capped at 200 rows and 3 funds, no
  per-fund rows).
- **Same quarter as the hub.** `signals.signal_quarter()`, so the numbers agree with
  `/investors`. The quarter is always shown.
- **Options never count**, as on the hub (`put_call=''` only).
- **Grouped by ticker.** Two CUSIPs with one ticker held by one fund are one position, combined
  the way the hub combines them.
- **Unknown is not zero.** A ticker no `Security` carries answers `null`; a known stock nobody
  holds this quarter answers zeros.
- **Only USD-quoted instruments are asked about.** Tickers are bare symbols, and a European
  listing can share one with an unrelated US stock. The currency lives on the position and on the
  Research instrument, so the rule is a frontend one: `lib/ownership.js::ownershipTicker` returns
  nothing for a non-USD instrument and no request is made.
- **`ChangeBadge` shows a multiple from 1,000% up** ("Added 763×"), fixing "Added 76194%" where
  the new table would show it most.

## Backend

New module `investors/ownership.py`, two views in `investors/views.py`.

### `GET /api/investors/ownership/?tickers=NBIS,MSFT`

Tickers are upper-cased and de-duplicated; more than 200, or none, is a 400. The number of queries
does not grow with the number of tickers.

```json
{
  "quarter": "2026-06-30",
  "filed": 80,
  "tracked": 88,
  "stocks": {
    "NBIS": {"owners": 6, "new": 5, "added": 1, "trimmed": 0, "sold_out": 1, "unchanged": 0,
             "shares": 9296436, "shares_change": 9076300, "shares_change_pct": 4123.1},
    "ASML": null
  }
}
```

`owners` counts funds holding the stock at quarter end, so a sold-out fund is not an owner. A
fund with one stored quarter (`kind` null) is an owner with no move.

`shares` is the total tracked funds hold at quarter end. `shares_change` is the net change since
the previous quarter over funds that have one: a new position adds its shares, a sold-out fund
subtracts what it held, and a fund with no earlier filing contributes nothing. `shares_change_pct`
is that change over what those same funds held before, null when they held nothing. A zero
`shares_change` is what the UI shows as a dash. With no `PositionMove` rows
at all, `quarter` is null and every stock is null.

### `GET /api/investors/ownership/<ticker>/`

The same header, plus the stock's counts and one row per fund:

```json
{
  "quarter": "2026-06-30", "filed": 80, "tracked": 88,
  "ticker": "NBIS", "issuer": "NEBIUS GROUP N.V.",
  "stock": {"owners": 6, "new": 5, "added": 1, "trimmed": 0, "sold_out": 1, "unchanged": 0,
            "shares": 9296436, "shares_change": 9076300, "shares_change_pct": 4123.1},
  "funds": [
    {"slug": "…", "name": "…", "firm": "…", "followed": true, "kind": "new",
     "shares": 1200000, "previous_shares": null, "change_pct": null,
     "value": 61000000, "weight": 2.4, "previous_weight": null}
  ]
}
```

Funds are ordered by `weight` descending, sold-out funds last by `previous_weight`. An unknown
ticker answers 200 with `stock: null` and `funds: []`.

## Frontend

- **`lib/ownership.js`** — `ownershipTicker(instrument)`, `sharesHeld`, `sharesChange` and
  `fmtSharesCompact`, plus the labels both surfaces use.
- **`api/queries/investors.js`** — `useOwnershipSummary(tickers)` and `useOwnership(ticker)`,
  both disabled when there is nothing to ask.
- **Portfolio, Holdings table** — two columns, "Fund shares" (total held by tracked funds,
  compact: `41.2M`) and "Fund change" (net shares, `▲ +9.1M` or `▼ -4.4M`, and a dash when
  nothing changed). The exact figure is the cell's tooltip and accessible name; both cells link
  to the Research Funds tab. The percent change sits beside the figure from 1600px up. The
  columns are hidden below 1440px (`hideBelow="wide"` on `Th`/`Td`) because they would push
  Weight out of the table; the Research tab carries the same figures at any width.
- **Research, "Funds" tab** (`components/research/FundsTab.jsx`), shown for stocks and ETFs:
  - a strip: owners out of tracked funds, shares held, and the net change with its percent
    (dash when nothing changed); the new / added / trimmed / sold out counts sit in the card
    header, and the quarter with its filing lag is stated in the subtitle;
  - a table of funds with `ChangeBadge`, shares and weight in their portfolio, each linking
    to `/investors/:slug`, followed funds starred;
  - empty states: "No tracked fund reported this in Q2 2026" and "13F filings cover US-listed
    securities only".

## Out of scope

Exit warnings, Dashboard tiles, alerts, ownership history over several quarters, overlap with a
fund's portfolio, and ideas from funds that share your holdings.

## Testing

- `investors/test_ownership_api.py`: counts per kind, options excluded, sold-out not an owner,
  two CUSIPs under one ticker combined, unknown ticker null, empty table, 400s, fund ordering,
  constant query count.
- vitest: `lib/ownership.test.js`, the query hooks, `FundHoldings`, the Portfolio columns,
  `FundsTab`, the `wide` breakpoint on `Th`/`Td`, and the `ChangeBadge` multiple.
