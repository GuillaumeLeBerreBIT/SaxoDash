# Congress trades — design

## Purpose

The Investors section follows 88 funds through their 13F filings. Members of Congress disclose
their trades too (STOCK Act Periodic Transaction Reports), and they are what apps like Autopilot
("Pelosi Tracker+") and TrueWallet are built on. Nothing in the app shows them.

The goal is to **follow members of Congress the way the app follows funds**: an estimated
portfolio per member, what copying them from the filing date would have returned, and whether
Congress is buying or selling a stock you own or are researching.

Success: `/investors` has a Congress tab next to Funds; a member's page shows their estimated
holdings, every parsed trade and a copy-performance chart against the S&P 500; Portfolio and
Research say at a glance which members recently bought or sold a stock.

Out of scope for this version: the Senate, a feed or alerts for new trades, OCR of paper
reports, trades before 2021, and AI-run portfolios (a separate project).

## What the data says

Checked on 2026-10-15 against the House Clerk's public files:

- `https://disclosures-clerk.house.gov/public_disc/financial-pdfs/{YEAR}FD.zip` holds
  `{YEAR}FD.xml`, one `<Member>` per filing with `Prefix, Last, First, Suffix, FilingType,
  StateDst, Year, FilingDate, DocID`. No member ID and no party.
- `FilingType` `P` is a Periodic Transaction Report. 2026 so far: 423, of which 371 e-filed
  (DocID `2…`) and 52 paper (DocID `8…` / `9…`).
- E-filed PDFs (`…/ptr-pdfs/{YEAR}/{DocID}.pdf`) carry extractable text. Pelosi's 20035553:
  owner `SP`, asset `REOF XXX, LLC [AB]`, type `P`, trade and notification dates, amount
  `$500,001 - $1,000,000`, "Filing Status: New". Paper PDFs extract zero characters.
- The ZIP is regenerated about daily: `Last-Modified` 14 Oct 13:00 GMT (09:00 Washington), it
  already listed a report filed that day, and the server allows 4 h caching. The exact schedule
  is unconfirmed, so the sync logs `Last-Modified` to establish it.
- Volume: 5–16 PTRs a week since August 2026.
- The Senate's eFD site answers Akamai "Access Denied" from the user's location, in a headless
  browser and in the user's own browser with VPN off. It is geo-blocked and stays out until the
  backend runs from a US host or a dataset is chosen.

## Decisions

- **A new `congress` app, not a kind of `Investor`.** Funds report quarterly snapshots of share
  counts per CUSIP; members report dated trades in dollar ranges. Converting trades into
  synthetic 13F filings would discard dates and ranges and break the 13F rules (amendments at
  read time, value unit by filing date). Rejected as well: generalising `investors` into a shared
  portfolio core first. Revisit once a third source exists.
- **One Investors section, two apps.** The user sees Funds and Congress as tabs of one section.
  `congress` imports from `investors` (`PriceHistory`, `price_feed.resolve`, `copying.measure`,
  `prices.Series`); `investors` never imports `congress`.
- **House only.** See the Senate finding above.
- **All active traders.** Every member with a PTR in the window is tracked; cross-signals need
  breadth.
- **Backfill from 2021.** `PriceHistory` keeps 1,200 daily bars (about 4.7 years); older trades
  could not be priced.
- **Paper reports are skipped and counted.** Never downloaded; each member page says how many
  were left out.
- **Range midpoints.** A trade's size is the midpoint of its reported range. Everything built on
  it is labelled "estimated".
- **Options count as the underlying.** A call bought is a purchase of the stock at the range
  midpoint; puts and exchanges are listed but never added. This understates the real leverage of
  option positions, and the page says so.
- **Stocks and options only.** Asset-type codes `[ST]` and `[OP]` with a ticker are priceable;
  anything else (`[AB]`, bonds, funds without a ticker) is stored and listed, never priced.
- **Copy entry is the first session after the filing date**, the same rule as funds, so the
  disclosure delay is part of the result.
- **No request reaches the Clerk at read time.** Pages and endpoints read only `congress` tables.

## Data import

`congress.house` owns the Clerk. One task, `sync_house`, runs daily at 16:00 Europe/Brussels
(after the morning Washington rebuild and its cache window):

1. **Index.** Fetch the current year's ZIP with the stored `ETag` / `If-Modified-Since`; a 304
   ends the run. For each `P` entry upsert a `Report` keyed on `doc_id`. DocIDs starting `8` or
   `9` get status `paper`; the rest `pending`. The backfill command `backfill_house --since 2021`
   walks earlier years' ZIPs the same way.
2. **Parse.** For each `pending` (and `failed` with fewer than 3 attempts) report, download the
   PDF, extract text with `pypdf` (new backend dependency) and hand it to `congress.parse`, which
   returns trade rows and the filing status (New / Amended). Requests are paced 1 s apart; the
   first backfill is about 2,500 PDFs.
3. **Members.** `congress.members` matches the XML name and state to the public-domain
   `unitedstates/congress-legislators` dataset for `bioguide_id`, party and photo; a hand-kept
   `member_aliases.csv` answers the names that do not match. An unmatched member is still
   created, without party or photo, and logged.
4. **Prices.** Priceable tickers are handed to `investors.price_feed` through a function the
   `congress` app passes in, so the nightly price refresh covers them without `investors`
   importing `congress`.
5. **Rebuild.** For every member whose trades changed, rebuild the estimated portfolio and copy
   performance.

The task is `@synced(reports_health=False, needs_credential=False)`: it never touches the Saxo
health badge and runs without a Saxo credential.

## Models

- `Member`: `slug`, `bioguide_id` (nullable, unique), `first_name`, `last_name`, `chamber`
  (`house`), `state_district`, `party` (blank when unknown), `photo_url`.
- `Report`: `doc_id` (unique), `member`, `year`, `filed_on`, `status` (`pending` / `parsed` /
  `failed` / `paper`), `amended` (bool), `attempts`, `error`.
- `Trade`: `report`, `owner` (`self` / `SP` / `JT` / `DC`), `asset`, `asset_type`, `ticker`
  (nullable), `kind` (`purchase` / `sale` / `partial_sale` / `exchange`), `option`
  (`''` / `call` / `put`), `traded_on`, `notified_on`, `amount_low`, `amount_high` (nullable for
  "over $50,000,000"-style open ranges), `priceable`.
- `CopyPerformance`: one per member, the same fields as `investors.CopyPerformance`.
- `HouseIndexState`: one row per year holding `etag`, `last_modified`, `checked_at`.

Duplicates: an amended report repeats the original's trades. A trade's identity is member,
asset, `traded_on`, `kind` and range; when two reports carry the same trade, the amended one
wins. This is applied at read time; stored reports are never rewritten.

## Estimated portfolio

`congress.replay` is pure functions over a member's trades in filing-date order:

- **Purchase, or call bought:** add the range midpoint in dollars as shares at the close on
  `traded_on`.
- **Sale or partial sale:** remove the midpoint in dollars as shares at the `traded_on` close,
  capped at the shares held.
- **Sale of a ticker never seen bought** (held before 2021): ignored and counted.
- **Puts and exchanges:** not applied.

After each report it yields the estimated holdings, each ticker valued at the close on the
filing date. Each report becomes an `investors.copying.Period(filed_on, holdings, value)` and
the list goes to `copying.measure` unchanged, with all its rules: unpriced holdings are left out
and the rest reweighted, a period priced below half its value sits in cash, and leading
unpriceable periods are dropped.

Every figure carries its basis: trades counted since 2021, paper reports left out, reports that
failed to parse, sales of earlier holdings ignored, and trades that are not priceable.

## API

All under `/api/congress/`, authenticated like the rest of the app, reading only stored data:

- `members/`: the directory. Name, party, state/district, trade count, last filing date,
  annualised copy edge.
- `members/<slug>/`: profile. Estimated holdings with weights, trade list (owner, asset, kind,
  option, range, traded and filed dates, priceable), basis counts, copy performance and series.
- `ownership/?tickers=A,B`: per ticker, `holders` (members with an estimated position) and
  `buyers` / `sellers` among reports filed in the last 90 days. An unknown ticker is `null`,
  never zeros.
- `ownership/<ticker>/`: the members behind those counts and their trades in the ticker.

## Pages

- `/investors` gains **Funds | Congress** tabs (`?tab=congress`). The Congress tab lists members,
  sortable by copy edge, plus one shelf: "Most bought by Congress, last 90 days".
- `/investors/congress/:slug`: member page reusing the copy-performance chart, stats strip and
  holdings-table components, plus a trade-history table that shows ranges, and the "estimated"
  basis note near the top.
- `/investors/stocks` gains a Congress column from the ownership lookup.
- **Portfolio:** a "Congress" column beside "Funds" showing `buyers ↑ / sellers ↓` over 90 days,
  holder count on hover, hidden below 1440px (`hideBelow="wide"`).
- **Research:** a Congress tab beside Funds listing the members and their trades in the stock.
- Portfolio and Research ask only about USD-quoted tickers through `lib/ownership.js::
  ownershipTicker`, and call `/api/congress/ownership/…` directly; `portfolio` and `research`
  never import `congress`.

## Errors

- Index download fails: the run records `failed`; stored data is untouched; the next run retries.
- A PDF does not parse: the report is `failed` with the reason, retried on up to 3 runs, then
  left for the `reparse_reports` command. Failed reports appear in the basis counts.
- Unknown asset-type code or no ticker: stored, `priceable=False`, listed, never priced.
- Missing prices: `copying.measure`'s existing rules.
- Unmatched member name: created without party or photo, logged for `member_aliases.csv`.

## Testing

Test-first, `APITestCase` per module as in the other apps.

- `parse`: real PTR PDFs as fixtures, covering a spouse-owned non-stock asset (Pelosi
  20035553), a stock purchase, a call option, a partial sale and an amended report.
- `house`: unchanged `ETag` does no work; new reports are created; paper DocIDs are never
  downloaded; a failed parse is retried and then left.
- `members`: dataset match, alias match, unmatched fallback.
- `replay`: buy then sell, sale capped at holding, sale of an unseen holding, call as
  underlying, put ignored, amended duplicate counted once.
- API tests for the four endpoints, including `null` for an unknown ticker.
- Vitest: the Congress tab, the member page, the Portfolio column and the Research tab.
