# Famous investors (13F) — design

Date: 2026-10-04. Status: approved in conversation, awaiting written-spec review.

## Purpose

SaxoDash gets a section that shows what well-known fund managers hold and how their portfolios change. The user wants all four uses below, with as much of the filed information as possible:

1. **What they hold:** a portfolio per investor, with holdings, weights, sector mix and value.
2. **What they changed:** quarter-over-quarter moves (new, added, trimmed, sold out).
3. **Ideas and overlap:** stocks several investors own, and overlap with the user's own positions and watchlist, with a handoff to Research.
4. **Track over time:** the history of a portfolio, and of a single holding within it, across quarters.

This is sub-project 1 of a wider "famous investors and politicians" idea. Politicians are separate sub-projects with different sources and data shapes: Congress STOCK Act trade disclosures and executive-branch OGE 278-T reports. Both give value *ranges* and trades, not holdings, and are out of scope here.

## Data sources (verified live on 2026-10-04)

- **SEC EDGAR (free, keyless):**
  - `https://data.sec.gov/submissions/CIK##########.json` lists a filer's filings (`form`, `filingDate`, `reportDate`, `accessionNumber`).
  - `https://www.sec.gov/Archives/edgar/data/<cik>/<accession-no-dashes>/index.json` lists a filing's documents. The information table is the non-`primary_doc` `.xml`.
  - Each `<infoTable>` row has `nameOfIssuer`, `titleOfClass`, `cusip`, `value`, `shrsOrPrnAmt/sshPrnamt` with `sshPrnamtType` (`SH`/`PRN`), optional `putCall`, `investmentDiscretion`, `otherManager` and `votingAuthority`.
  - The XML may be namespaced, so the parser matches local names.
  - Berkshire's Q2 2026 table has 89 rows. The same CUSIP repeats once per `otherManager`.
  - The amendment type is `amendmentInfo/amendmentType` in the filing's `primary_doc.xml`, so a filing costs three requests (index, primary doc, table).
  - SEC fair-access rules require a descriptive `User-Agent` with a contact email (`SEC_USER_AGENT` setting) and no more than 10 requests per second.
- **OpenFIGI (free; key optional):** `POST https://api.openfigi.com/v3/mapping` with `[{idType: 'ID_CUSIP', idValue}]`. It returns listings, and we take `exchCode == 'US'` (verified: `02005N100` → ALLY, `037833100` → AAPL).
  - Keyless: 25 requests a minute, 10 jobs per request.
  - With the optional free `OPENFIGI_API_KEY`: 250 requests a minute, 100 jobs per request.
- **Rejected:** paid 13F APIs (FMP Ultimate, WhaleWisdom ~$300/yr). The user chose the free DIY route.

### What 13F cannot show (stated on every page)

- US-listed long positions and listed options only. No shorts, cash, non-US securities or private holdings.
- It shows quarter-end holdings, filed up to 45 days later. Trades inside the quarter are not visible.
- Some positions are filed confidentially and appear only in a later amendment.
- **Values are as of quarter end.** There is no "performance since filing", because that would need live prices for arbitrary tickers, and price data comes from Saxo only (a standing decision).

## Architecture

A new Django app, `investors`, independent of `research`, `saxo` and `analytics`. It stores everything it imports. The pages read only its tables, so quarter-over-quarter, history and cross-investor queries are database queries, not live fetches.

### Models

- **`Investor`:**
  - `name` (person, e.g. "Warren Buffett"), `firm` ("Berkshire Hathaway"), `cik` (unique), `slug` (unique), `blurb`
  - `curated` (bool), `added_at`
  - `last_checked_at`, `last_filing_at`
  - `quarters_expected` (null when no backfill is running): what the import progress counts against
- **`Filing`:**
  - `investor`, `quarter_end` (date), `filed_on`, `accession` (unique), `form` (`13F-HR` / `13F-HR/A`)
  - `amendment_type` (`''` / `RESTATEMENT` / `NEW HOLDINGS`)
  - `total_value` (USD), `positions`
  - unique (`investor`, `quarter_end`, `accession`)
- **`Holding`:**
  - `filing`, `cusip`, `issuer`, `title_of_class`
  - `shares` (or principal), `amount_type` (`SH` / `PRN`), `value` (USD)
  - `put_call` (`''` / `PUT` / `CALL`), `discretion`
  - rows are aggregated per (`filing`, `cusip`, `put_call`), with shares and value summed
- **`Security`:** `cusip` (pk), `ticker` (nullable), `name`, `figi`, `security_type`, `resolved_at`, `attempts`.
  - It is a global cache: a CUSIP resolves once.
  - A null ticker means unresolved, and it is retried on later runs.

The "current portfolio" of an investor is their latest quarter, after amendments are applied:
- a `RESTATEMENT` amendment replaces that quarter's holdings
- a `NEW HOLDINGS` amendment adds its rows to the quarter

### Import pipeline

The modules are small and match the `research/finnhub.py` style: call → shape → store.

- **`investors/edgar.py`:** a `requests` client with the User-Agent and a ≥0.12 s spacing between requests. It provides:
  - `filings(cik)` → the 13F-HR and 13F-HR/A entries from submissions JSON. It follows the paged `filings.files` when 5 years go beyond `recent`.
  - `information_table(cik, accession)` → raw XML text.
- **`investors/parse.py`:** `parse_information_table(xml)` → a list of row dicts.
  - It matches by local name, so namespaces don't matter.
  - **Value normalization:** for filings **filed** before 2023-01-03, `value × 1000`. SEC switched from thousands to dollars for filings made from that date, so a Q4 2022 report (filed Feb 2023) is already in dollars — verified on Berkshire's Q3 vs Q4 2022 totals.
  - Malformed XML raises `FilingUnreadable`.
- **`investors/figi.py`:** `resolve(cusips)` → `{cusip: {ticker, name, figi, security_type}}`. It batches and paces requests to the keyless or keyed limits and prefers the `exchCode == 'US'` listing.
- **`investors/importer.py`:**
  - `sync_investor(investor, since)`: lists the filings, skips accessions already stored, parses, aggregates, stores the `Filing` and its `Holding`s inside one transaction per filing, then resolves new CUSIPs.
  - Filings import **newest quarter first**, so a newly added investor's snapshot is usable within a minute while older quarters fill in behind it.
  - `backfill(investor)`: `since = today − 5 years`.
- **Tasks (`investors/tasks.py`):** `sync_investors`, under `@synced(reports_health=False)`, records a `SyncRun` without touching the Saxo health badge.
  - It runs daily in Feb/May/Aug/Nov, the 13F deadline months, and weekly otherwise.
  - A beat entry is added through a data migration, the way existing schedules are registered. Check the current pattern; the scheduler is `django_celery_beat`'s `DatabaseScheduler`.
- **Commands:**
  - `manage.py load_investors`: loads the curated CSV.
  - `manage.py backfill_investors [--slug]`

### Curated starter list (`investors/curated.csv`, hand-maintained)

All CIKs were verified against EDGAR on 2026-10-04. Each person's name is attached to the firm that files.

| Person | Firm (filer) | CIK | Latest 13F seen |
|---|---|---|---|
| Warren Buffett | Berkshire Hathaway | 1067983 | Q2 2026 |
| Bill Ackman | Pershing Square Capital Management | 1336528 | Q1 2026 |
| Michael Burry | Scion Asset Management | 1649339 | Q3 2025 (stopped filing) |
| Seth Klarman | Baupost Group | 1061768 | Q2 2026 |
| Stanley Druckenmiller | Duquesne Family Office | 1536411 | Q2 2026 |
| David Tepper | Appaloosa | 1656456 | Q2 2026 |
| Li Lu | Himalaya Capital Management | 1709323 | Q2 2026 |
| Mohnish Pabrai | Dalal Street, LLC | 1549575 | Q2 2026 |
| Carl Icahn | Icahn Carl C | 921669 | Q2 2026 |
| Dan Loeb | Third Point | 1040273 | Q2 2026 |
| Chase Coleman | Tiger Global Management | 1167483 | Q2 2026 |
| Ray Dalio (founder) | Bridgewater Associates | 1350694 | Q2 2026 |
| Howard Marks | Oaktree Capital Management | 949509 | Q2 2026 |
| Bill & Melinda Gates Foundation Trust | Gates Foundation Trust | 1166559 | Q2 2026 |
| Cathie Wood | ARK Investment Management | 1697748 | Q2 2026 |
| Terry Smith | Fundsmith | 1569205 | Q2 2026 |
| Chuck Akre | Akre Capital Management | 1112520 | Q2 2026 |
| Stephen Mandel | Lone Pine Capital | 1061165 | Q2 2026 |
| Philippe Laffont | Coatue Management | 1135730 | Q2 2026 |

Greenlight (Einhorn) is excluded: its last 13F under CIK 1079114 is from 2023.

**Import size:** about 19 investors × 20 quarters. Bridgewater, ARK and Coatue report hundreds to a thousand-plus positions each.
- EDGAR: about 2 requests per filing, a few minutes in all.
- OpenFIGI: a few thousand unique CUSIPs. Keyless that is roughly 20+ minutes for the first backfill; the optional key cuts it to about 1 minute.
- Later quarters only resolve new CUSIPs.

### API (`/api/investors/…`, JWT like every other endpoint)

- **`GET /api/investors/`:** one card per investor:
  - name, firm, slug
  - latest quarter, total value, positions
  - top 3 holdings (ticker, weight)
  - new and exited counts vs. the previous quarter
  - `last_filing_at`, and a stale flag when there has been no filing for over 2 quarters
  - `curated`, and `import` progress while a backfill runs: quarters imported of quarters found, CUSIPs resolved of CUSIPs seen
- **`GET /api/investors/<slug>/?quarter=YYYY-MM-DD`:** header facts plus holdings for that quarter (latest by default). Each holding has:
  - `cusip`, `ticker`, `issuer`, `class`, `put_call`
  - `shares`, `value`, `weight`
  - `change`: `new` / `added` / `trimmed` / `unchanged`, with `shares_change_pct`
  - `quarters_held`
  - `sector` (from `research/universe.csv` when the ticker is in it, else `null`, shown as "Other")
  - `owned` / `watched` flags for the user's positions and watchlist, matched by ticker
- **`GET /api/investors/<slug>/changes/?quarter=`:** new, added, trimmed and sold out, each with the value delta. Sold-out positions come from the previous quarter.
- **`GET /api/investors/<slug>/history/`:** per quarter: total value, positions, top-10 concentration, turnover.
- **`GET /api/investors/<slug>/history/<cusip>/`:** per quarter: shares, value and weight of one holding.
- **`GET /api/investors/overview/?quarter=`:**
  - **Shared holdings:** tickers held by N of the tracked investors, with combined value. It is a count, never a score.
  - **Most added:** tickers that are `new` in several portfolios.
  - **Overlap with you.**
- **`GET /api/investors/search/?q=`:** EDGAR filer-name search for "Add investor". `POST /api/investors/` with `{cik, name?}` creates the investor (name defaults to the firm) and queues a backfill.
  - Each search result carries its latest 13F quarter, positions and value, or says it has no 13F filings (not selectable), or is already tracked.
- **`DELETE /api/investors/<slug>/`:** stops tracking an investor the user added, deleting its filings and holdings. Curated investors answer 403; `Security` rows stay, being a shared cache.
- **`GET /api/research/held-by/<ticker>/`:** for the Research "Held by" card: tracked investors holding it in their latest quarter, with weights.

Comparing quarters uses one rule throughout, in `investors/changes.py`, with one unit-tested home:
- A position is **new** when the CUSIP is absent from the previous stored quarter.
- **Added** or **trimmed** means the shares changed by at least 1%; anything smaller is **unchanged**.
- **Sold out** means present before and absent now.
- An investor's first stored quarter has no change column.

### Pages (frontend)

Built with the design system's `Card`, `PageHeader`, `Th`/`Td`/`Tr`, `InstrumentLogo`, `AllocationDonut` and `TBtn`. There is a sidebar entry **Investors**.

The agreed layout is the clickable mockup at https://claude.ai/artifact/PVYiFZfym6oN76ENLKbwT4 (example data). It is a starting point that later phases may extend.

1. **`/investors` (overview):**
   - a header subtitle stating the quarter and the filing lag, and an **Add investor** button
   - **Investor list toolbar:** filter chips *All / Curated / Added by you / Stopped filing*; a search box matching investor, firm or held ticker; a sort (largest value, most changes, most positions, name); a **Cards / Table** switch
     - **Cards:** firm, value, positions, top 3 logos, "+N new · −N exited", latest quarter and filed date, or "No 13F since …" when stale. The first 8 show, then "Show all N". A search shows every match.
     - **Table:** one row per investor with value, positions, top 3 logos, top-10 share, changes and latest quarter.
     - A search with no tracked match offers "Search EDGAR for it", opening Add investor with the query filled in.
   - **Snapshot panel** for the picked investor (card or row click; Berkshire by default):
     - a stats strip: total value, positions, top-10 share, new · sold out vs. the previous quarter, turnover and filed date
     - the top 10 holdings with a **Grid / Donut / List** switch, remembered per browser:
       - **Grid:** 10 tiles (5 × 2, 2 columns on mobile) with logo, ticker, name, weight, a weight bar scaled to the largest, value, change badge and You own / Watchlist badge
       - **Donut:** top 10 plus an "Other" slice for the remaining positions (omitted when there are ≤ 10). The centre shows total value, or the hovered slice's weight and value; a legend lists ticker, name, weight and value.
       - **List:** the Holdings table limited to 10 rows
     - beneath it, the remaining positions' share and value, and **Open full portfolio →**
   - panels for **Shared holdings**, **Most added** and **Overlap with you**
   - the 13F limits line (longs and listed options only, quarter-end values)
2. **Add investor** (dialog):
   - Searching for a firm name queries EDGAR filers. The empty state explains that 13Fs are filed under the fund's name, not the manager's.
   - Each result shows its latest 13F, positions and value. "Already tracked" and "No 13F filings" results are disabled. A filer whose last 13F is old is marked so, and will show as stopped filing.
   - Picking a result asks for an optional person's name ("Shown as"), describes the 5-year import (newest quarter first; a warning about slower ticker resolution when the filer has over 500 positions), and offers **Track**.
   - The new investor gets an "Added by you" badge. Its card shows "Queued", then "Importing history · N of M quarters · tickers X/Y" with a progress bar. Its snapshot explains the wait until the newest quarter lands, then fills in as usual while older quarters continue.
3. **`/investors/:slug`:** a back link, a header with name, firm and quarter picker, the same stats strip, plus four tabs. A user-added investor also has **Stop tracking**, confirmed in-page.
   - **Holdings:** logo, ticker, name, % of portfolio with a weight bar, value, shares, change badge, quarters held, You own / Watchlist badge; Put/Call badges on options rows. Sorted by weight. Filter chips *All / New / Added / Trimmed / Options / Yours* and a ticker/name search; 15 rows, then "Show 25 more" with "Showing N of M". The row opens Research; unresolved CUSIPs show the issuer name with no link.
   - **Changes:** grouped New / Added / Trimmed / Sold out, each with the value delta.
   - **Allocation:** sector bar list (not a donut), largest first, with **Unclassified** (tickers outside `research/universe.csv`) always last in a neutral colour, so a portfolio like ARK's doesn't read as one grey wedge. Top-10 concentration and turnover.
   - **History:** portfolio value and position count as two small charts sharing one quarter axis (no dual axis). Clicking a holding shows its weight and shares over time.
4. **Change badges** describe without judging: *New* in the accent blue, *Sold out* in amber, *Added ▲ n%* and *Trimmed ▼ n%* neutral with arrow and text. No gain/loss green or red.
5. **Research Overview:** a small **"Held by"** card listing tracked investors and their weights in their latest quarter.

The copy follows Discover's rule: describe, never recommend. "Held by 7 of 19" is a count. There are no rank numbers, scores or "smart money buys".

## Errors and edge cases

- **EDGAR unavailable or rate-limited:** the `SyncRun` is `failed`, stored data is untouched, and only this app's health is affected.
- **One unreadable filing:** that filing is skipped and logged (`SyncRun` detail), and the rest of the investor's quarters still import.
- **OpenFIGI limits or misses:** paced batches. Unresolved CUSIPs keep `ticker = null`, with `attempts` counting retries on later runs, and the row shows the issuer name only.
- **An investor who stopped filing (e.g. Scion):** the page shows their last quarter with "No 13F since Q3 2025". They are never shown as an empty portfolio.
- **Amendments:** `RESTATEMENT` replaces the quarter and `NEW HOLDINGS` merges into it. A confidential position that appears later shows up once its amendment is imported.
- **Options rows (`putCall`):** kept apart from the stock position with a "Put" or "Call" badge, and counted in value as filed.

## Testing

- **Parser:** recorded fixtures (the current Berkshire XML, one pre-2023 filing in thousands, one namespaced document, one with put/call rows). Asserts aggregation and value normalization.
- **Importer:** HTTP mocked. Covers skipping already-stored accessions, both amendment types, unresolved CUSIPs, a failed fetch, and a malformed filing being skipped.
- **`changes.py`:** unit tests for new, added, trimmed, unchanged, sold-out and the first-quarter case.
- **API:** `APITestCase` per endpoint. Frontend: vitest for lib helpers and the pages.

## Build phases (each gets its own plan and review)

1. **Data:**
   - app, models and migrations (run against the dev DB)
   - EDGAR, parser, OpenFIGI and importer
   - curated CSV plus `load_investors` / `backfill_investors`
   - scheduled task
   - the `/api/investors/` list and detail endpoints, enough to inspect the import
2. **Core pages:** sidebar entry, `/investors` with the list toolbar (Cards / Table, filters, search, sort) and the snapshot panel (Grid / Donut / List), the investor page with quarter picker and the Holdings and Changes tabs.
3. **Depth:** the Allocation and History tabs, and the per-holding history.
4. **Connections:** Add investor (search, import progress) and Stop tracking, the Research "Held by" card, Overlap with you, Shared holdings, Most added.

## Out of scope

- Politicians (Congress PTRs, OGE 278-T): separate sub-projects.
- Live prices or performance since filing: Saxo-only price rule.
- Alerts or notifications on new filings: deferred by the user.
- 13D/13G and Form 4 insider filings: possible later sources, not part of this design.
