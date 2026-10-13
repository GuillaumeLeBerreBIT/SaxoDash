# Research Extras (Filings, Insiders, Financial Health, Technicals Table) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the extras the free Finnhub key also backs: a Filings tab with SEC filings and insider activity, financial health charts on the Financials tab, and the indicator table behind the chart page's technicals gauge.

**Architecture:** One new backend module, `research/filings.py`, serves two cached endpoints (`filings`, `insiders`) under the fundamentals contract. Financial health is arithmetic over the statements the Financials tab already loads, so the older `cash_flow_trend` on fundamentals (a second, weaker mapping of the same filings) is removed. The technicals table shows the six votes `lib/technicalRating.js` already computes, with their values.

**Tech Stack:** Django + DRF, Finnhub free tier, React 19, Recharts, Tailwind, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-12-research-depth-design.md` (section "Phase 3", scoped in this plan's first commit).

## Global Constraints

- Generated code carries zero comments and zero docstrings (tool directives excepted). Leave existing comments as they are, except where a task deletes the code they sit on.
- No new dependency. No second data provider.
- Chart colours come from `frontend/src/lib/charts.js`; no hex literal in a new component. Type sizes use `--fig-*`; chart heights `--chart-h-sm|md|lg`.
- New endpoints follow the fundamentals contract: always HTTP 200 with an `available` boolean; never a 409.
- A figure the provider does not return is omitted or shown as a dash, never zero.
- The new tab is `equityOnly`: an ETF never sees it and never triggers its requests.
- External links open with `target="_blank"` and `rel="noopener noreferrer"`, and only when the URL is `https://www.sec.gov/...`.
- Test-first: write the failing test, run it and see it fail for the expected reason, then implement. Say in the report which red runs were seen.
- Backend tests: from the worktree's `backend/`, `/Users/guillaumeleberre/Develop/GuillaumesLab/WebDevelopment/SaxoDash/backend/.venv/bin/python manage.py test research`; if settings need env vars, `set -a; source /Users/guillaumeleberre/Develop/GuillaumesLab/WebDevelopment/SaxoDash/backend/.env; set +a` in the same shell (never print that file). Frontend: from `frontend/`, `npx vitest run`, `npx eslint .`, `npm run build`.
- Work only in the worktree `.worktrees/research-depth` on branch `feat/research-extras`. Never `git stash`. One commit per task; do not push.
- Pages mock `../api/queries` wholesale, so every new hook a page can reach must be stubbed in that page's test setup.

## Facts about the provider (probed 2026-10-13 on NVDA and JPM)

- `/stock/filings?symbol=X` returns the newest 500 filings of every form. For JPM that is one week of prospectuses (`424B2`), with no 10-K in sight. `/stock/filings?symbol=X&form=10-K` filters by form and is newest first (JPM: 23 annual reports back to 2000). Each row: `accessNumber`, `form`, `filedDate` and `acceptedDate` (`'YYYY-MM-DD HH:MM:SS'`), `reportUrl`, `filingUrl`.
- `/stock/insider-transactions?symbol=X` returns `{'data': [...], 'symbol'}`: about one year, newest first, 200 to 330 rows. Row: `name` (as filed, often upper case), `share` (holding after the transaction), `change` (signed shares), `filingDate`, `transactionDate` (`'YYYY-MM-DD'`), `transactionCode`, `transactionPrice` (0 when there is none), `isDerivative`, `id`. One sale is often filed as many rows at different prices (NVDA: 266 `S` rows in a year). Codes seen: `S` sale, `P` purchase, `A` award, `M` option exercise, `F` tax withholding, `G` gift, `J` other.
- `/stock/insider-sentiment?symbol=X&from=YYYY-MM-DD&to=YYYY-MM-DD` returns `{'data': [{'year', 'month', 'change', 'mspr'}]}`, oldest first, one row per month that had activity. `mspr` runs from -100 to 100.

## Review Focus

1. A company with thousands of non-periodic filings (a bank's prospectuses): the Filings tab still shows its annual and quarterly reports, because each form is requested on its own.
2. One sale split over dozens of rows: the table shows one line per insider, day and type, with the shares summed and a share-weighted average price, not dozens of lines.
3. A row with no price (awards, gifts): its value is a dash, never zero, and it does not count toward the bought or sold totals.
4. A company without current assets or current liabilities on its balance sheet (a bank): the assets-against-liabilities chart is left out, and the cash and debt chart still shows what exists.
5. Too little price history for an indicator (a recent listing): that indicator is absent from the technicals table and from the vote count, not shown as neutral.

## File Structure

Backend (`backend/research/`): create `filings.py`, `test_filings.py`; modify `finnhub.py` (three client calls; remove the cash flow trend), `views.py`, `urls.py`, `test_views.py`, `test_fundamentals_shaping.py`; modify `backend/backend/settings.py` (one throttle rate).

Frontend (`frontend/src/`): modify `api/client/research.js`, `api/queries/research.js`, `lib/charts.js`, `lib/technicalRating.js`; create `lib/insiders.js`, `lib/financialHealth.js`, `lib/secLinks.js`; create in `components/research/`: `CashAndDebtChart.jsx`, `AssetsLiabilitiesChart.jsx`, `FilingsList.jsx`, `InsiderSentimentChart.jsx`, `InsiderTransactions.jsx`, `FilingsTab.jsx`, `TechnicalsTable.jsx` (each with a test); delete `CashFlowTrendChart.jsx` and its test; modify `FinancialsTab.jsx`, `SymbolPanel.jsx`, `pages/Research.jsx` and their tests.

---

### Task 1: Filings and insiders endpoints; drop the cash flow trend (backend)

**Files:**
- Create: `backend/research/filings.py`, `backend/research/test_filings.py`
- Modify: `backend/research/finnhub.py`, `backend/research/views.py`, `backend/research/urls.py`, `backend/backend/settings.py`
- Test: `backend/research/test_views.py`, `backend/research/test_fundamentals_shaping.py` (and any other test that mentions `cash_flow_trend`)

**Interfaces (produces):**
- `GET /api/research/filings/<symbol>/` → `{'available': True, 'filings': [{'form', 'filed', 'accepted', 'url', 'report_url', 'accession'}]}`, newest first. `filed` is `'YYYY-MM-DD'`; `accepted` is the full stamp or `''`. `url` / `report_url` are kept only when they start with `https://www.sec.gov/`, else `''`.
- `GET /api/research/insiders/<symbol>/` → `{'available': True, 'transactions': [...], 'summary': {...}, 'sentiment': [...]}`.
  - transaction: `{'date', 'filed', 'name', 'code', 'shares', 'price', 'value', 'holdings'}`; `shares` is signed; `price` and `value` are `None` when the filing has no price.
  - summary: `{'buys', 'sells', 'shares_bought', 'shares_sold', 'value_bought', 'value_sold', 'insiders', 'since', 'until'}` over open-market purchases (`P`) and sales (`S`) only; `since` / `until` are the oldest and newest transaction dates in the provider's answer, or `None`.
  - sentiment: `[{'month': 'YYYY-MM', 'mspr', 'change'}]`, oldest first, at most 12.
- Throttle scope `research.filings` at `30/min`.
- The fundamentals payload no longer carries `cash_flow_trend`.

- [ ] **Step 1: Client calls.** In `finnhub.py`, beside the other `get_*` functions:

```python
def get_filings(symbol, form):
    return _get('/stock/filings', symbol=symbol, form=form)


def get_insider_transactions(symbol):
    return _get('/stock/insider-transactions', symbol=symbol)


def get_insider_sentiment(symbol, date_from, date_to):
    return _get('/stock/insider-sentiment', symbol=symbol, **{'from': date_from, 'to': date_to})
```

- [ ] **Step 2: Write the failing tests** in `backend/research/test_filings.py` (`SimpleTestCase` for shaping, `TestCase` with the `LOCMEM` cache override and `FINNHUB_API_KEY='test-key'` for the cached entry points, patching `research.finnhub.get_filings` etc.). Cover:

Shaping of filings (`filings.to_filings(by_form)` where `by_form` maps a form to Finnhub's list):
- keeps `FORM_LIMITS = {'10-K': 6, '10-Q': 8, '8-K': 20}` newest rows per form and merges them newest first by `filed`, ties broken by `accepted`;
- cuts `filedDate` to the day; passes `accessNumber` through as `accession`;
- blanks a `filingUrl` or `reportUrl` that does not start with `https://www.sec.gov/` (test `http://www.sec.gov/x`, `https://evil.example/www.sec.gov/`, `javascript:alert(1)`, `None`);
- skips a row with no `filedDate` or no `form`;
- an empty or `None` list for a form contributes nothing.

Shaping of insiders (`filings.to_transactions(rows)`, `filings.to_summary(rows)`, `filings.to_sentiment(rows)`):
- rows of one insider, one `transactionDate` and one code merge into one transaction: `shares` is the sum of `change`, `price` is the share-weighted average of the rows that have a price above zero, `value` is the sum of `abs(change) * price` over those rows, `holdings` is the smallest `share` for a net decrease and the largest for a net increase;
- a group whose rows all have price 0 has `price None` and `value None`;
- `isDerivative` rows and rows with `change == 0` or no `transactionDate` are dropped;
- output is newest first by `date`, then `name`, capped at `TRANSACTIONS_KEPT = 60`;
- summary counts merged groups, not raw rows: `buys` / `sells` are the number of `P` / `S` groups, `shares_bought` / `shares_sold` are positive totals, `value_bought` / `value_sold` sum the group values that exist, `insiders` is the number of distinct names among `P` and `S` groups; awards, gifts and exercises change none of these; the summary is computed before the cap of 60;
- `since` / `until` come from every kept transaction, and are `None` for no rows;
- sentiment rows become `{'month': '2026-09', 'mspr': round(mspr, 2), 'change': change}` oldest first, last 12, skipping a row without `year`, `month` or `mspr`.

Cached entry points:
- `filings.filings('JPM')` calls `get_filings` once per form in `FORM_LIMITS` and answers `available True`; a second call does not refetch;
- a provider failure on any form propagates and nothing is cached (a later call fetches again);
- all forms empty answers `{'available': True, 'filings': []}` and is cached;
- `filings.insiders('NVDA')` calls the transactions endpoint once and the sentiment endpoint once with `from` = the first day of the month twelve months before today and `to` = today (patch `filings.date` or pass through a `_today()` helper so the test can pin the day);
- a failed sentiment call still answers with transactions and `sentiment: []`, cached for `PARTIAL_TTL = 600` instead of `INSIDERS_TTL = 43200`; a failed transactions call propagates and caches nothing;
- a malformed payload (`{'data': 'oops'}`) becomes `finnhub.FinnhubUnexpected`.

Views (`test_views.py`, mirroring `StatementsViewTest`): both endpoints require authentication, answer 200 `available True` with shaped data, answer 200 `available False` when the key is not configured, uppercase the symbol, and reject a malformed symbol the way the fundamentals view does. Add both views to the existing throttle-scope test with scope `research.filings`.

Fundamentals: replace the tests that asserted `cash_flow_trend` with one asserting the key is absent even when `reported` holds 10-K rows, and that `annual_results` is still built from the same `reported`.

- [ ] **Step 3: Run and see them fail** (`ModuleNotFoundError` for `research.filings`, 404s for the views).

- [ ] **Step 4: Implement `backend/research/filings.py`.** Same shape as `statements.py`: pure `to_*` functions, then `filings(symbol)` and `insiders(symbol)` that use `cache.get` / `cache.set` explicitly, re-raise `ProviderUnavailable`, and convert `(KeyError, TypeError, IndexError, ValueError, AttributeError)` to `finnhub.FinnhubUnexpected`. Constants: `SEC_PREFIX = 'https://www.sec.gov/'`, `FORM_LIMITS`, `TRANSACTIONS_KEPT = 60`, `SENTIMENT_MONTHS = 12`, `FILINGS_TTL = 43200`, `INSIDERS_TTL = 43200`, `PARTIAL_TTL = 600`, `OPEN_MARKET = {'P': 'bought', 'S': 'sold'}`, cache keys `research:filings:v1:{symbol}` and `research:insiders:v1:{symbol}`. The grouping key is `(name, transactionDate, transactionCode)`.

- [ ] **Step 5: Views, routes, throttle.** `FilingsView` and `InsidersView` in `views.py` after `StatementsView`, each with `throttle_scope = 'research.filings'` and the same `_symbol` / `provider_response` body; routes `filings/<str:symbol>/` and `insiders/<str:symbol>/` in `urls.py`; `'research.filings': '30/min',` in `DEFAULT_THROTTLE_RATES` after `'research.news'`.

- [ ] **Step 6: Remove the cash flow trend from fundamentals.** In `finnhub.py` delete `CASH_TREND_POINTS`, `_DEBT_CONCEPTS`, `_concept_values`, `_cash_flow_row`, `_cash_flow_trend` and the block in `to_fundamentals` that sets `cash_flow_trend` (keep the `reported` argument and `annual_results`). Check each helper has no other caller before deleting it (`grep -rn` in `backend/`). Bump `CACHE_V` by one and update the test that pins the key string.

- [ ] **Step 7: Run the whole research suite; all pass.**

- [ ] **Step 8: Commit** (`backend/` files only, staged by path): `feat(research): filings and insider endpoints; fundamentals drops the duplicate cash flow trend`

---

### Task 2: Data layer and pure logic (frontend)

**Files:**
- Modify: `frontend/src/api/client/research.js`, `frontend/src/api/queries/research.js`, `frontend/src/lib/charts.js`
- Create: `frontend/src/lib/insiders.js`, `frontend/src/lib/financialHealth.js`, `frontend/src/lib/secLinks.js`, each with a `.test.js`

**Interfaces (produces):**
- `getFilings(symbol)`, `getInsiders(symbol)`; `useFilings(symbol)`, `useInsiders(symbol)` (disabled for an empty symbol; `staleTime` 12 hours when `data?.available`, else 5 minutes, through one exported pure helper `filingsStaleTime(data)` with tests); keys `researchKeys.filings(symbol)`, `researchKeys.insiders(symbol)`. Follow `useStatements` exactly, including its tests in `api/queries/research.test.jsx`.
- `lib/secLinks.js`: `secUrl(value)` returns the string when it is a string starting with `https://www.sec.gov/`, else `null`.
- `lib/insiders.js`:
  - `TRANSACTION_LABELS` and `transactionLabel(code)`: `P` → `Buy`, `S` → `Sell`, `A` → `Award`, `M` → `Option exercise`, `X` → `Option exercise`, `F` → `Tax withholding`, `G` → `Gift`, `C` → `Conversion`, `D` → `Returned to issuer`, anything else → `Other`.
  - `isOpenMarket(transaction)`: code is `P` or `S`.
  - `filterTransactions(transactions, scope)`: `scope` is `'open'` (default; open-market only) or `'all'`.
  - `insiderName(name)`: title-cases an all-upper-case name (`'COXE TENCH'` → `'Coxe Tench'`) and leaves mixed case alone.
  - `netActivity(summary)`: `null` without a summary or when `buys + sells === 0`; otherwise `{ tone: 'buy' | 'sell' | 'flat', text }` where the text is, for example, `Insiders sold 1.2M shares net over 14 sales and 0 buys` (use the existing `fmtShares` from `lib/format.js` for the share count; read it first and assert its real output in the tests). `tone` follows the sign of `shares_bought - shares_sold`.
  - `sentimentRows(sentiment)`: `[{ month, label, mspr, change }]` where `label` is `fmtMonthYear(month + '-01')`.
- `lib/financialHealth.js` (input: the statements endpoint's `annual` rows, oldest first; output keeps that order and the newest 10):
  - `cashAndDebtRows(annual)`: `[{ label, free_cash_flow, cash, total_debt }]`, each key present only when the figure exists, rows with none of the three dropped.
  - `balanceRows(annual)`: `[{ label, current_assets, long_term_assets, current_liabilities, long_term_liabilities }]` only for years that have all of `total_assets`, `current_assets`, `total_liabilities`, `current_liabilities`; the long-term figures are total minus current. A negative derived figure drops that year.
- `lib/charts.js`: `HEALTH_SERIES = { free_cash_flow: POSITIVE, cash: SERIES_TOTAL, total_debt: SERIES_BANK, current_assets: SERIES_TOTAL, long_term_assets: REPORTED, current_liabilities: SERIES_BANK, long_term_liabilities: PENDING }`.

- [ ] **Step 1: Write the failing tests** for the three lib modules and the hooks, one `describe` per export, covering every sentence above plus: `filterTransactions` with an unknown scope behaves as `'open'`; `insiderName` of `''` / `null` is `''`; `netActivity` for more bought than sold has tone `'buy'` and for equal shares `'flat'`; `cashAndDebtRows` / `balanceRows` of `undefined` are `[]`; `balanceRows` skips a bank-shaped year (no current assets); `secUrl` rejects `http://www.sec.gov/x`, `https://evil.example/https://www.sec.gov/`, `javascript:alert(1)`, `''`, `null`.
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npx vitest run src/lib src/api` and `npx eslint src/lib src/api`; all pass.**
- [ ] **Step 5: Commit** (`git add -A frontend/src`): `feat(research): filings and insiders hooks and the logic behind them`

---

### Task 3: Financial health charts on the Financials tab (frontend)

**Files:**
- Create: `frontend/src/components/research/CashAndDebtChart.jsx`, `AssetsLiabilitiesChart.jsx` (+ tests)
- Delete: `frontend/src/components/research/CashFlowTrendChart.jsx`, `CashFlowTrendChart.test.jsx`
- Modify: `frontend/src/components/research/FinancialsTab.jsx`, `FinancialsTab.test.jsx`, and any test that still feeds or asserts `cash_flow_trend` (`StatisticsTab.test.jsx`)

**Interfaces:** consumes `cashAndDebtRows`, `balanceRows`, `HEALTH_SERIES` (Task 2). Produces `<CashAndDebtChart annual={annualRows} />` and `<AssetsLiabilitiesChart annual={annualRows} />`, each a full `Card` that renders nothing when its rows are empty.

Behaviour:
- `CashAndDebtChart`: card titled `Cash and debt`, subtitle `Free cash flow, cash and total debt by fiscal year`. Recharts `ComposedChart`: bars for free cash flow and cash, a line for total debt, `fmtAxisDollars` axis, `fmtTooltipDollars` tooltip, a legend rendered as plain HTML listing only the series that have data, the chart wrapper carrying `role="img"` and `aria-label="Free cash flow, cash and total debt by fiscal year"`. Keep the `InfoTip` explanation the old chart had, reworded: `Free cash flow is operating cash flow minus capital expenditure. Total debt sums commercial paper and current and non-current long-term debt, where the filing reports them.`
- `AssetsLiabilitiesChart`: card titled `Assets against liabilities`, subtitle `Short- and long-term, by fiscal year`. Two stacked bars per year (`stackId="assets"`: current then long-term assets; `stackId="liabilities"`: current then long-term liabilities), same axis, tooltip, HTML legend and `role="img"` / `aria-label="Short- and long-term assets against liabilities by fiscal year"`.
- `FinancialsTab`: both charts are rendered inside the statements-available branch, after the "From revenue to profit" card, from `data.annual` (always annual, whatever the Annual / Quarterly switch says). `CashFlowTrendChart` and its import go away; the margin trend chart stays where it is, fed by fundamentals.

- [ ] **Step 1: Write the failing tests.** Chart components: card title and `role="img"` name present with data; legend lists only series with data (a fixture with no `total_debt` shows no `Total debt` legend entry); nothing rendered for an empty or bank-shaped input (`AssetsLiabilitiesChart` with years lacking `current_assets`). `FinancialsTab`: with the existing annual fixture extended by `balance` and `cash_flow` figures, both card titles appear; they stay when Quarterly is chosen; with statements unavailable neither appears and `Cash generation & balance sheet` never appears anywhere (replace the old "still shows the fundamentals-based charts" test with: the margin trend still shows when statements are unavailable and fundamentals carry `quarterly_trends`).
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement; delete the old chart and its test with `git rm`.**
- [ ] **Step 4: Run the full frontend suite, eslint and build; all pass.**
- [ ] **Step 5: Commit**: `feat(research): cash and debt and assets-against-liabilities charts on Financials`

---

### Task 4: Filings tab (frontend)

**Files:**
- Create in `frontend/src/components/research/`: `FilingsList.jsx`, `InsiderSentimentChart.jsx`, `InsiderTransactions.jsx`, `FilingsTab.jsx` (+ tests)
- Modify: `frontend/src/pages/Research.jsx`, `frontend/src/pages/Research.test.jsx`

**Interfaces:** consumes `useFilings`, `useInsiders`, `lib/insiders.js`, `lib/secLinks.js` (Task 2). Produces `<FilingsTab symbol={symbol} />` and the tab key `filings`.

Behaviour:
- **Tab list** becomes Overview, Financials, Statistics, Peers, Earnings, Funds, Filings, News, Guide; `['filings', 'Filings', { equityOnly: true }]` goes after `funds`. Render `<FilingsTab key={symbol} symbol={symbol} />` for it. Update the tab-order test and the ETF test (Filings hidden for an ETF; `?tab=filings` on an ETF falls back to Overview). Stub `useFilings` and `useInsiders` in the page test setup; assert neither is called with the symbol unless the Filings tab is open.
- **`FilingsTab`** calls both hooks and stacks three cards, each with its own loading (a `Skeleton`), error (`could not be loaded` plus a `Try again` button calling `refetch`) and unavailable (`data.reason` or a fallback sentence naming the symbol) states, so one failing request does not blank the others:
  1. `Insider activity`: the `netActivity` sentence (emerald for `buy`, red for `sell`, zinc for `flat`, always with the words so colour is not the only signal), the period `since` to `until` formatted with `fmtDate`, then `InsiderSentimentChart`. When there are no transactions and no sentiment: `No insider transactions were filed for {symbol} in the past year.`
  2. `Insider transactions`: `InsiderTransactions`.
  3. `SEC filings`: `FilingsList`.
- **`InsiderSentimentChart({ sentiment })`**: hand-rolled bars (flex columns, like the analyst trend), one per month, height by `abs(mspr) / 100`, above a centre line when positive and below when negative, filled `POSITIVE` / `NEGATIVE`; month label under each; the list has `aria-label="Insider sentiment by month"` and each item an accessible name like `Sep 26: -64.04, net -1,952 shares`. Caption: `Monthly share purchase ratio: 100 is all buying, -100 all selling.` Renders nothing for an empty list.
- **`InsiderTransactions({ transactions })`**: a scope switch (`Open market` default, `All`) using `TBtn`; a table (`Date`, `Insider`, `Type`, `Shares`, `Price`, `Value`, `Holding after`) inside an `overflow-x-auto` wrapper with real `th scope="col"` headers; `Shares` signed with thousands separators and coloured by sign; `Price` through `fmtMoney(price, 'USD')`; `Value` compact dollars; a dash for a missing price or value; names through `insiderName`; type through `transactionLabel`. Shows 15 rows with a `Show all N` button when there are more. With no rows in the chosen scope: `No open-market trades in this period.` or `No transactions in this period.`
- **`FilingsList({ filings })`**: filter chips `All`, `10-K`, `10-Q`, `8-K` (only the forms present, plus All) using the existing `Chip`; a list of rows, each: form badge, a plain-language label (`Annual report`, `Quarterly report`, `Current report`), the filed date through `fmtDate`, and a link `Open on SEC.gov` to `secUrl(url)` (fall back to `secUrl(report_url)`; no link when neither is valid) with `target="_blank" rel="noopener noreferrer"` and an accessible name that includes the form and date. Empty list: `No annual, quarterly or current reports were found for this company.`

- [ ] **Step 1: Write the failing tests**, one file per component, covering every state and sentence above, plus: the scope switch changes the row count; `Show all` reveals the rest and disappears; a transaction with `price: null` prints dashes in `Price` and `Value`; a filing whose `url` is not on sec.gov renders no link; chips filter the list and `All` restores it; `FilingsTab` keeps showing the filings card when the insiders request errors, and its `Try again` calls that query's `refetch`.
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement the four components, then wire the page.**
- [ ] **Step 4: Run the full frontend suite, eslint and build; all pass.**
- [ ] **Step 5: Commit**: `feat(research): Filings tab with SEC filings and insider activity`

---

### Task 5: Indicator table behind the technicals gauge; project notes

**Files:**
- Modify: `frontend/src/lib/technicalRating.js`, `frontend/src/lib/technicalRating.test.js`
- Create: `frontend/src/components/research/TechnicalsTable.jsx`, `TechnicalsTable.test.jsx`
- Modify: `frontend/src/components/research/SymbolPanel.jsx`, `SymbolPanel.test.jsx`
- Modify: `AGENTS.md`

**Interfaces:** each entry of `technicalRating(bars).votes` gains `value` (number) and `reading` (string); `key`, `label`, `vote` and everything else the function returns stay exactly as they are. Produces `<TechnicalsTable votes={votes} />`.

Behaviour:
- `value` / `reading` per indicator: RSI → the RSI, reading `Oversold` (below 30), `Overbought` (above 70) or `Mid-range`; MACD → the line minus the signal, reading `Above signal`, `Below signal` or `On signal`; each average → the average itself, reading `Price above`, `Price below` or `Price at`.
- `TechnicalsTable`: a three-column table (`Indicator`, `Value`, `Signal`) with `th scope="col"` headers and one row per vote; `Value` with two decimals; `Signal` is the reading followed by the vote word (`Buy`, `Sell`, `Neutral`), the vote word coloured emerald / red / zinc. Renders nothing for no votes.
- `SymbolPanel`: under the technicals counts, replace the paragraph that lists the indicator names with a disclosure: a button `Show indicators` / `Hide indicators` with `aria-expanded` and `aria-controls`, closed by default, which reveals `TechnicalsTable`. The choice resets when the symbol changes. The names stay discoverable: the button's closed-state text is `Show indicators (6)` using the real vote count.
- `AGENTS.md`: append one paragraph in the "Decided" style:

```markdown
**SEC filings and insider activity are asked for by form and merged by trade.**
`research/filings.py` requests Finnhub's filings once per form (10-K, 10-Q, 8-K): the
unfiltered list is the newest 500 of everything, which for a bank is a week of
prospectuses with no annual report in it. Insider rows are merged per insider, day and
transaction type, because one sale is filed as dozens of rows at different prices; the
price shown is share-weighted and a row with no price has no value rather than zero.
The buy and sell totals count open-market trades only (codes P and S), so awards, gifts
and option exercises never read as buying or selling. Links leave the app only for
`https://www.sec.gov/`. Both endpoints follow the fundamentals contract under their own
`research.filings` scope, cached for 12 hours. Financial health charts are arithmetic
over the statements endpoint; the older `cash_flow_trend` on fundamentals, a second
mapping of the same filings, is gone.
```

- [ ] **Step 1: Write the failing tests.** `technicalRating`: with the existing rising and falling fixtures, each vote carries a finite `value` and the expected `reading`; an RSI above 70 reads `Overbought` with vote `sell`; with only 30 bars there is no `sma50` or `sma200` vote at all; the existing assertions on `votes`, counts, `fraction` and `label` are untouched. `TechnicalsTable`: headers, one row per vote, formatted value, reading and vote word, nothing for an empty list. `SymbolPanel`: the table is absent until the button is pressed, present after, absent again after a second press; `aria-expanded` follows; rerendering with another symbol closes it; update or remove the existing assertion on the comma-separated indicator names.
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full frontend suite, eslint, build, and the backend research suite; all pass.**
- [ ] **Step 5: Commit** (`git add -A frontend/src AGENTS.md`): `feat(research): indicator table behind the technicals gauge; record the filings decisions`
- [ ] **Step 6: Screenshot review (controller, not an implementer).** Stubbed API, 1440px and 390px: the Filings tab (with data, with no insider trades, with an errored insiders request), the Financials tab's two health charts for a normal company and a bank, the chart page panel with the indicator table open. No horizontal page overflow, no console errors, no empty cards.

---

## Self-Review

**Spec coverage (Phase 3):** insider transactions with monthly sentiment: Tasks 1, 2, 4. Filings list (10-K, 10-Q, 8-K with links): Tasks 1, 2, 4. Financial health charts (debt, free cash flow and cash by year; short- and long-term assets against liabilities): Tasks 2, 3. Full technicals table behind the gauge: Task 5.

**Scoping decisions:** filings and insiders share one new "Filings" tab rather than joining the Funds tab, which reads only the investors app. The technicals table lists the six indicators the gauge already votes with; it does not add indicators. The health charts replace the phase 2 "Cash generation & balance sheet" chart rather than sitting beside it.

**Review Focus coverage:** (1) Task 1 per-form requests and its tests. (2) and (3) Task 1 merge and price tests, Task 4 dash test. (4) Task 2 `balanceRows` bank test, Task 3 chart test. (5) Task 5 thirty-bar test.
