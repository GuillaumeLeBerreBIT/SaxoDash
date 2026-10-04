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
  - **Value normalization:** for filings with `quarter_end < 2023-01-01`, `value × 1000`, because SEC changed the unit from thousands to dollars in January 2023.
  - Malformed XML raises `FilingUnreadable`.
- **`investors/figi.py`:** `resolve(cusips)` → `{cusip: {ticker, name, figi, security_type}}`. It batches and paces requests to the keyless or keyed limits and prefers the `exchCode == 'US'` listing.
- **`investors/importer.py`:**
  - `sync_investor(investor, since)`: lists the filings, skips accessions already stored, parses, aggregates, stores the `Filing` and its `Holding`s inside one transaction per filing, then resolves new CUSIPs.
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
- **`GET /api/investors/search/?q=`:** EDGAR filer-name search for "Add investor". `POST /api/investors/` with `{cik}` creates the investor and queues a backfill.
- **`GET /api/research/held-by/<ticker>/`:** for the Research "Held by" card: tracked investors holding it in their latest quarter, with weights.

Comparing quarters uses one rule throughout, in `investors/changes.py`, with one unit-tested home:
- A position is **new** when the CUSIP is absent from the previous stored quarter.
- **Added** or **trimmed** means the shares changed by at least 1%; anything smaller is **unchanged**.
- **Sold out** means present before and absent now.
- An investor's first stored quarter has no change column.

### Pages (frontend)

Built with the design system's `Card`, `PageHeader`, `Th`/`Td`/`Tr`, `InstrumentLogo`, `AllocationDonut` and `TBtn`. There is a sidebar entry **Investors**.

1. **`/investors` (overview):**
   - a header subtitle stating the quarter and the filing lag
   - investor cards: firm, value, positions, top 3 logos, "+N new · −N exited", and a stale note when relevant
   - panels for **Shared holdings**, **Most added** and **Overlap with you**
   - an **Add investor** button (search → pick → "importing 5 years…" progress)
2. **`/investors/:slug`:** a header with name, firm, quarter picker, value, positions, filed date and turnover, plus four tabs:
   - **Holdings:** logo, ticker, name, % of portfolio, value, shares, change badge, quarters held, You own / Watchlist badge. The row opens Research; unresolved CUSIPs show the issuer name with no link.
   - **Changes:** grouped New / Added / Trimmed / Sold out, each with the value delta.
   - **Allocation:** sector donut, top-10 concentration, turnover.
   - **History:** portfolio value and position-count chart over the stored quarters. Picking a holding shows its weight and shares over time.
3. **Research Overview:** a small **"Held by"** card listing tracked investors and their weights in their latest quarter.

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
2. **Core pages:** sidebar entry, `/investors` cards, the investor page with quarter picker and the Holdings and Changes tabs.
3. **Depth:** the Allocation and History tabs, and the per-holding history.
4. **Connections:** Add investor (search and backfill progress), the Research "Held by" card, Overlap with you, Shared holdings, Most added.

## Out of scope

- Politicians (Congress PTRs, OGE 278-T): separate sub-projects.
- Live prices or performance since filing: Saxo-only price rule.
- Alerts or notifications on new filings: deferred by the user.
- 13D/13G and Form 4 insider filings: possible later sources, not part of this design.
