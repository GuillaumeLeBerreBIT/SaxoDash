# Verdict Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every night each covered stock gets a quality grade, a valuation grade and two price levels with reasons; the app turns that into one action per stock for the signed-in user and keeps a track record against the S&P 500.

**Architecture:** `research` keeps owning provider data: the nightly scan stores the Finnhub series and P/E percentiles it already has in hand, and now also scans held and watched US stocks outside the index universe. A new app `verdicts` reads only stored rows, applies pure rule functions, stores one `StockVerdict` per ticker and logs `VerdictCall`s. The action is computed per request from the verdict and the user's `Position`. The frontend shows a card and badges; MCP dispatches the same views.

**Tech Stack:** Django 5 + DRF, Celery, Postgres 17; React 19, TanStack Query, vitest.

**Spec:** `docs/superpowers/specs/2026-11-11-verdict-engine-design.md` (read it first).

## Global Constraints

- Zero comments in new or edited code (AGENTS.md "Code style").
- No new provider calls: nothing in `verdicts` imports `finnhub`, `market` or `requests`.
- A missing figure is `None` / "unknown", never zero and never a pass.
- "Sell (review)" comes only from quality grade Weak. No rule reads a price change.
- `research`, `portfolio`, `investors`, `advisor` never import `verdicts`.
- Discover (shelves, counts, heatmaps, earnings enrichment) must see index-universe rows only.
- Frontend colour only through semantic utilities; `noPaletteClasses.test.js` must pass. A badge names its action in words.
- Test-first. Backend: `python manage.py test <app>` from `backend/`. Frontend: `npx vitest run <path>` from `frontend/`.
- Every new migration is also applied to the dev database: `python manage.py migrate`.
- Commit after each task, conventional message (`feat(verdicts): …`).

## Review Focus

1. A stock that joins the index csv while it already has an extra (non-universe) row: must become a universe row, not raise on the unique ticker.
2. A scan night where Finnhub fundamentals fail for a row: the stored series and percentiles from the last good night stay; the verdict keeps its date and is not downgraded to "Not enough data".
3. A company with negative or zero trailing earnings: valuation is "Not judged", both price levels are `None`, and the action is never Buy or Add.
4. Two users, one holding a stock above 15% and one not holding it: each gets their own action from the same verdict row.
5. A watchlist item on a European exchange sharing a US ticker (`NVDA:xetr`): gets no extra row and reads "Not covered".

## File Structure

```
backend/research/models.py            ScreenerRow: in_universe, fundamentals_history, pe_history, managers
backend/research/universe.py          promote an extra row instead of failing
backend/research/coverage.py          NEW: which non-universe tickers get scanned
backend/research/finnhub.py           to_screener_history()
backend/research/valuation.py         pe_percentiles()
backend/research/scan.py              1,200 bars, store history, call coverage
backend/verdicts/                     NEW app
  rules.py        thresholds table, quality(), valuation()
  actions.py      action()
  models.py       StockVerdict, VerdictCall
  compute.py      run()
  tasks.py        compute_verdicts
  track_record.py summary(), wanted_tickers()
  views.py urls.py apps.py
backend/mcp_server/tools/verdicts.py  NEW: two tools
backend/core/scheduling.py            'Compute verdicts'
frontend/src/api/client/verdicts.js   NEW
frontend/src/api/queries/verdicts.js  NEW
frontend/src/lib/verdicts.js          NEW: labels, tones, ticker gate
frontend/src/components/verdicts/     NEW: VerdictCard.jsx, ActionBadge.jsx
```

---

### Task 1: Universe flag and extra coverage

**Files:**
- Modify: `backend/research/models.py` (ScreenerRow), `backend/research/universe.py`, `backend/research/scan.py`
- Create: `backend/research/coverage.py`, `backend/research/test_coverage.py`, migration
- Test: `backend/research/test_universe.py`, `test_coverage.py`, `test_scan.py`

**Interfaces:**
- Produces: `ScreenerRow.in_universe: bool` (default `True`); `ScreenerRow.objects` returns universe rows only; `ScreenerRow.everything` returns all rows. `coverage.sync_extras(*, user) -> {'added': int, 'removed': int}`.

- [ ] **Step 1: Failing tests**

```python
def test_default_manager_hides_extra_rows(self):
    ScreenerRow.everything.create(ticker='NBIS', name='Nebius', indexes='', in_universe=False)
    self.assertFalse(ScreenerRow.objects.filter(ticker='NBIS').exists())
    self.assertTrue(ScreenerRow.everything.filter(ticker='NBIS').exists())

def test_load_universe_promotes_an_extra_row_and_keeps_others(self):
    ScreenerRow.everything.create(ticker='AAA', name='x', indexes='', in_universe=False, uic=7)
    ScreenerRow.everything.create(ticker='NBIS', name='Nebius', indexes='', in_universe=False)
    load_universe(csv_listing('AAA'))
    self.assertTrue(ScreenerRow.objects.get(ticker='AAA').in_universe)
    self.assertEqual(ScreenerRow.objects.get(ticker='AAA').uic, 7)
    self.assertTrue(ScreenerRow.everything.filter(ticker='NBIS').exists())
```

`test_coverage.py`, with `scan.resolve` patched:

```python
def test_adds_a_held_usd_stock_outside_the_universe(self): ...
    # Position(ticker='NBIS', currency='USD', asset_type='Stock', uic=11) -> row in_universe=False, uic=11
def test_adds_a_watched_stock_only_when_saxo_confirms_the_same_usd_listing(self): ...
    # WatchlistItem(symbol='NBIS:xnas', uic=11): resolve -> {'uic': 11,...} added; resolve -> {'uic': 99} or None not added
def test_skips_etfs_non_usd_positions_and_universe_tickers(self): ...
def test_removes_an_extra_nobody_holds_or_watches_any_more(self): ...
def test_counts_every_users_positions_and_watchlists(self): ...
```

In `test_scan.py`: `test_scan_universe_scans_extra_rows_too` (an extra row ends with `status == OK`).

- [ ] **Step 2: Run, expect failures** — `python manage.py test research.test_universe research.test_coverage research.test_scan`

- [ ] **Step 3: Implement**
  - `ScreenerRow`: `in_universe = BooleanField(default=True, db_index=True)`; declare `objects = UniverseManager()` first (filters `in_universe=True`), then `everything = models.Manager()`.
  - `load_universe`: look existing rows up through `everything`; a matching extra row is updated with the csv values and `in_universe=True`; the final delete stays on `objects`.
  - `coverage.sync_extras`: wanted = bare tickers (`listings.bare`) of every user's `Position` with `asset_type='Stock'` and `currency='USD'`, plus every `WatchlistItem` with `asset_type='Stock'` whose `scan.resolve(ticker, user=user)` returns the item's own `uic`; minus universe tickers. A watched ticker that already has an extra row is not re-resolved. Create missing extras (`name` from the position or item description, `indexes=''`, `uic`, `asset_type`), delete extras no longer wanted.
  - `scan.scan_universe`: after `load_universe`, call `coverage.sync_extras(user=user)` inside a try that logs and continues; iterate `ScreenerRow.everything`; the returned count stays universe-only.

- [ ] **Step 4: Run the whole research suite, expect pass** — `python manage.py test research`. Then `python manage.py makemigrations --check` clean and `python manage.py migrate`.
- [ ] **Step 5: Commit**

---

### Task 2: The scan keeps the history it already receives

**Files:**
- Modify: `backend/research/finnhub.py`, `valuation.py`, `scan.py`, `models.py`; migration
- Test: `test_fundamentals_shaping.py`, `test_valuation.py`, `test_scan.py`

**Interfaces:**
- Produces on `ScreenerRow`:
  - `fundamentals_history` JSON, default `{}`: `{'annual': [{'period': 'YYYY-MM-DD', 'roe': pct, 'roic': pct, 'net_margin': pct, 'eps': float}, …oldest first, at most 5], 'quarterly_eps': [['YYYY-MM-DD', float], …oldest first]}`. A missing figure is an absent key.
  - `pe_history` JSON, default `{}`: `{'current': float, 'p25': float, 'p75': float, 'eps_ttm': float, 'weeks': int}` or `{}`.
- `finnhub.to_screener_history(financials) -> dict` (shape above).
- `valuation.pe_percentiles(closes, quarterly_eps) -> dict | None`, `closes` as `[(date, close)]`, `quarterly_eps` as `[(date, value)]`.

- [ ] **Step 1: Failing tests**

```python
def test_screener_history_keeps_five_years_as_percent_oldest_first(self):
    out = finnhub.to_screener_history(METRIC_PAYLOAD_WITH_SERIES)
    self.assertEqual([r['period'] for r in out['annual']], sorted(r['period'] for r in out['annual']))
    self.assertLessEqual(len(out['annual']), 5)
    self.assertEqual(out['annual'][-1]['roe'], 31.2)      # payload 0.312
    self.assertNotIn('roic', out['annual'][0])             # absent in payload for that year

def test_screener_history_without_a_series_block_is_empty(self):
    self.assertEqual(finnhub.to_screener_history({'metric': {}}), {'annual': [], 'quarterly_eps': []})

def test_pe_percentiles_over_weekly_positive_points(self):
    out = valuation.pe_percentiles(closes_three_years(), four_quarters_each_year(eps=1.0))
    self.assertEqual(out['eps_ttm'], 4.0)
    self.assertLess(out['p25'], out['p75'])
    self.assertEqual(out['current'], round(closes_three_years()[-1][1] / 4.0, 2))

def test_pe_percentiles_is_none_under_104_weeks_or_without_earnings(self): ...
    # 80 weekly points -> None; latest trailing EPS <= 0 -> None
```

`test_scan.py`: `test_scan_stores_history_and_percentiles`; `test_fundamentals_failure_keeps_last_nights_history` (pre-set both fields, make `get_basic_financials` raise `ProviderUnavailable`, assert unchanged); `test_technicals_still_read_the_last_260_bars` (give 1,200 bars, assert `technical_fields` received 260).

- [ ] **Step 2: Run, expect failures**
- [ ] **Step 3: Implement**
  - `to_screener_history`: reuse `RATIO_SERIES` scaling for `roe`, `roic`, `net_margin`; add annual `eps`; quarterly `eps` through the existing `_shape_series`/`_oldest_first` helpers.
  - `pe_percentiles`: `trailing_pe` → keep the last point of each ISO week → positive values only; `None` under 104 points or when the latest trailing EPS is not positive; percentiles by `statistics.quantiles(values, n=4, method='inclusive')`; round to 2.
  - `scan.py`: `HISTORY_BARS = 1200`, `TECHNICAL_BARS = 260`; `_refresh_technicals` fetches `HISTORY_BARS`, hands the newest `TECHNICAL_BARS` to `technical_fields` and returns the bars; `_refresh_fundamentals(row, bars)` makes the one existing `get_basic_financials` call, then sets the screener fields, `fundamentals_history` and `pe_history` (`{}` when `pe_percentiles` is `None`). Check which order `market.chart` returns bars in before slicing.
- [ ] **Step 4: Run `python manage.py test research`, migrate dev DB**
- [ ] **Step 5: Commit**

---

### Task 3: Rules — quality, valuation, action

**Files:**
- Create: `backend/verdicts/__init__.py`, `apps.py`, `rules.py`, `actions.py`, `test_rules.py`, `test_actions.py`
- Modify: `backend/backend/settings.py` (`INSTALLED_APPS` += `'verdicts'`)
- Test: also `frontend/src/lib/snapshot.test.js` (threshold parity)

**Interfaces:**
- `rules.THRESHOLDS = {'roe': 15, 'roic': 10, 'net_margin': 10, 'revenue_growth': 5, 'debt_to_equity': 1.0}`; `rules.FINANCIAL_SECTORS = {'Financial Services'}` (verify the sector strings in `research/universe.csv` and list every financial one).
- `rules.quality(row) -> {'grade': 'strong'|'mixed'|'weak'|'unknown', 'checks': [{'key', 'label', 'status': 'pass'|'fail'|'unknown', 'value': float|None, 'threshold': str}]}` — six checks in spec order, keys `roe, roic, margins, earnings_growth, revenue_growth, debt`.
- `rules.valuation(row) -> {'grade': 'cheap'|'fair'|'expensive'|'not_judged', 'current_pe', 'cheap_below', 'expensive_above'}` (levels `None` when not judged).
- `actions.WEIGHT_CAP_PCT = 15`; `actions.action(quality_grade, valuation_grade, weight_pct, failed_labels) -> {'action': 'buy'|'add'|'hold'|'trim'|'sell_review'|'wait'|'not_a_fit'|'no_verdict', 'reason': str}`; `weight_pct is None` means not held.

- [ ] **Step 1: Failing tests** — table cases, one per spec row. Must include:

```python
def test_median_of_five_years_decides_roe_not_the_latest(self): ...     # [20,20,20,20,5] passes
def test_margin_fails_when_latest_is_under_half_the_median(self): ...   # [20,20,20,20,9] fails
def test_financial_sector_debt_is_unknown(self): ...
def test_missing_figure_is_unknown_never_pass(self): ...
def test_grades(self):   # (passes, fails, unknown) -> grade
    cases = [((5,1,0),'strong'), ((4,1,1),'strong'), ((3,1,2),'mixed'), ((2,3,1),'weak'), ((3,0,3),'unknown'), ((2,2,2),'mixed')]
def test_valuation_grades_and_levels(self):
    row = stub(pe_history={'current': 18, 'p25': 20, 'p75': 30, 'eps_ttm': 5, 'weeks': 200})
    self.assertEqual(rules.valuation(row), {'grade': 'cheap', 'current_pe': 18, 'cheap_below': 100.0, 'expensive_above': 150.0})
def test_empty_pe_history_is_not_judged_with_no_levels(self): ...
```

`test_actions.py`: one case per row of the spec's action table, plus `held + strong + not_judged -> hold`, `held 16% + fair -> hold with 'over your 15% cap' in reason`, `not held + strong + not_judged -> wait`, `unknown -> no_verdict` whether held or not, and `weak + held` reason starts `"Story check failed: "` followed by the failed labels.

Frontend parity, in `snapshot.test.js`:

```js
it('shares its quality thresholds with the nightly verdict engine', () => {
  expect([T.roeStrong, T.marginStrong, T.deLow, T.revSteady]).toEqual([15, 10, 1, 5])
})
```

and the mirror in `test_rules.py` asserting `THRESHOLDS` values, each naming the other file in the test name.

- [ ] **Step 2: Run, expect failures** — `python manage.py test verdicts`
- [ ] **Step 3: Implement.** Checks are a declarative list (label, reader, predicate) like `research/shelves.py`. Grade rule: `answered = passes + fails`; under 4 answered → `unknown`; `passes/answered >= 0.8` → `strong`; `< 0.5` → `weak`; else `mixed`. Earnings growth passes when `row.eps_growth_5y > 0` and the latest annual `eps > 0`. Reasons are the exact strings in the spec's action table.
- [ ] **Step 4: Run, expect pass**
- [ ] **Step 5: Commit**

---

### Task 4: Stored verdicts, nightly compute, logged calls

**Files:**
- Create: `backend/verdicts/models.py`, `compute.py`, `tasks.py`, `test_compute.py`, `test_tasks.py`, migration
- Modify: `backend/core/scheduling.py`, `backend/core/test_scheduling.py`

**Interfaces:**
- `StockVerdict`: `ticker` (unique, 20), `name`, `quality`, `valuation`, `checks` JSON, `current_pe`, `cheap_below`, `expensive_above`, `last_close`, `pct_vs_ma200` (floats, null), `as_of` (the row's `fundamentals_at` date, null), `computed_at`.
- `VerdictCall`: `ticker`, `opened_on` date, `entry_close` float, `quality`, `valuation`, `checks` JSON, `ended_on` date null. At most one open call per ticker (conditional `UniqueConstraint` on `ticker` where `ended_on` is null).
- `compute.run(today=None) -> int` (verdicts written).
- `verdicts.tasks.compute_verdicts` (Celery task name).

- [ ] **Step 1: Failing tests**

```python
def test_writes_one_verdict_per_ok_row_including_extras(self): ...
def test_skips_rows_never_given_fundamentals(self): ...           # fundamentals_at is None -> no verdict row
def test_becoming_strong_and_cheap_opens_one_call_at_the_close(self): ...
def test_staying_strong_and_cheap_does_not_open_a_second(self): ...   # run twice
def test_leaving_strong_and_cheap_ends_the_call(self): ...
def test_a_row_that_disappears_takes_its_verdict_but_keeps_its_calls(self): ...
def test_run_is_repeatable(self): ...                              # second run changes nothing but computed_at
```

`test_tasks.py`: the task records a `SyncRun` with `task='compute_verdicts'`, `outcome='ok'`, and runs with no Saxo credential. `test_scheduling.py`: `'Compute verdicts'` → `verdicts.tasks.compute_verdicts` at `('15', '0')`.

- [ ] **Step 2: Run, expect failures**
- [ ] **Step 3: Implement.** `run` reads `ScreenerRow.everything.filter(status=ScreenerRow.OK, fundamentals_at__isnull=False)`, one transaction per ticker. Task: `@shared_task` over `@synced(reports_health=False, credential=None)`, following `investors.tasks.sync_investors`. Schedule entry in `core/scheduling.py` at 00:15 (the 22:30 scan needs well over an hour at 1.2 s a row plus the Finnhub budget).
- [ ] **Step 4: Run `python manage.py test verdicts core`, migrate dev DB**
- [ ] **Step 5: Commit**

---

### Task 5: Track record

**Files:**
- Create: `backend/verdicts/track_record.py`, `test_track_record.py`
- Modify: `backend/verdicts/apps.py`

**Interfaces:**
- Consumes: `advisor.scoring.score(rec, prices, benchmark, today)` and `advisor.scoring.summary(scored)`; `investors.copying.price_series`, `BENCHMARK_TICKER`, `BENCHMARK_NAME`.
- Produces: `track_record.wanted_tickers() -> (current: set, ever: set)`; `track_record.report(today=None) -> {'benchmark': 'S&P 500', 'calls': [{'ticker', 'opened_on', 'ended_on', 'entry_close', 'checkpoints': {'3m','6m','12m'}, 'latest'}], 'summary': {...}, 'first_call_on': date|None}`.

- [ ] **Step 1: Failing tests**

```python
def test_a_call_is_scored_like_a_journal_buy_from_the_next_session(self): ...
def test_an_ended_call_is_still_measured_to_its_checkpoints(self): ...
def test_unelapsed_or_unpriced_windows_are_null(self): ...
def test_no_calls_gives_an_empty_report_not_zeros(self): ...
def test_wanted_tickers_are_open_calls_now_and_every_call_ever(self): ...
```

- [ ] **Step 2: Run, expect failures**
- [ ] **Step 3: Implement.** Adapt each `VerdictCall` to what `scoring.score` reads (`ticker`, `action='buy_new'`, `recorded_at` at midnight of `opened_on`, `closed_at=None`, `buy_range=None`); do not copy the scoring maths. Read `advisor/journal.py:95-112` for how the journal assembles prices and the summary and follow it. `VerdictsConfig.ready()` registers `price_feed.add_ticker_source(track_record.wanted_tickers)` exactly as `advisor/apps.py` does.
- [ ] **Step 4: Run, expect pass**
- [ ] **Step 5: Commit**

---

### Task 6: API

**Files:**
- Create: `backend/verdicts/views.py`, `urls.py`, `payload.py`, `test_views.py`
- Modify: `backend/backend/urls.py`, `backend/users/test_isolation.py`

**Interfaces:**
- `GET /api/verdicts/?tickers=A,B` → `{'verdicts': {'A': {'action', 'reason', 'quality', 'valuation', 'as_of'} | null}}`. Reuse `investors.ownership.parse_tickers` rules (same cap, 400 on a bad list) by copying the contract, not importing across apps unless it is already shared.
- `GET /api/verdicts/<ticker>/` → the summary fields plus `name`, `checks`, `current_pe`, `cheap_below`, `expensive_above`, `last_close`, `pct_vs_ma200`, `held`, `weight_pct`, `weight_cap_pct`; `404`-free: an unknown ticker answers `200 {'verdict': null}`.
- `GET /api/verdicts/track-record/` → `track_record.report()`.
- `payload.for_user(verdicts, user) -> dict` is the one place weight is worked out: `Position.weight_of(total)` over the user's positions summed per bare ticker.

- [ ] **Step 1: Failing tests**

```python
def test_summary_gives_null_for_an_unknown_ticker(self): ...
def test_action_follows_the_requesting_users_weight(self):
    # same StockVerdict (strong, expensive); alice holds it at 30% -> 'trim'; bob does not hold it -> 'wait'
def test_two_lots_of_one_ticker_are_one_weight(self): ...
def test_detail_lists_six_checks_and_both_levels(self): ...
def test_endpoints_require_login(self): ...
def test_track_record_route_is_not_read_as_a_ticker(self): ...
```

In `users/test_isolation.py`: add the three endpoints to the other-user sweep; `StockVerdict` and `VerdictCall` carry no `user`, so `COVERED` is unchanged and that test must still pass.

- [ ] **Step 2: Run, expect failures**
- [ ] **Step 3: Implement.** Declare the `track-record/` path before `<str:ticker>/`. Tickers are upper-cased bare symbols. No throttle scope: these read only our own tables, in a fixed number of queries (assert with `assertNumQueries` on the summary for 20 tickers).
- [ ] **Step 4: Run `python manage.py test verdicts users`**
- [ ] **Step 5: Commit**

---

### Task 7: MCP tools

**Files:**
- Create: `backend/mcp_server/tools/verdicts.py`, `backend/mcp_server/test_verdict_tools.py`
- Modify: `backend/mcp_server/tools/__init__.py` (registration, as the other modules do)

**Interfaces:**
- `get_verdict(symbol: str)` → dispatches `VerdictDetailView` through `mcp_server.views.fetch`; `get_verdict_track_record()` → `TrackRecordView`.

- [ ] **Step 1: Failing tests** — each tool returns the view's payload for `MCP_USER`; an uncovered symbol returns `{'verdict': None}` with a warning "No verdict: not in the nightly scan."; both appear in `REGISTRY`.
- [ ] **Step 2–4:** follow `mcp_server/tools/smart_money.py` for the `@tool` shape; description strings start "Verdict ›" and say the labels are rule output, not advice, and that the server never trades.
- [ ] **Step 5: Commit**

---

### Task 8: Frontend data layer and the Verdict card

**Files:**
- Create: `frontend/src/api/client/verdicts.js`, `api/queries/verdicts.js`, `lib/verdicts.js`, `lib/verdicts.test.js`, `components/verdicts/VerdictCard.jsx`, `VerdictCard.test.jsx`
- Modify: `frontend/src/api/client/index.js`, `api/queries/index.js`, `components/research/OverviewTab.jsx`, `OverviewTab.test.jsx`

**Interfaces:**
- `getVerdictSummary(tickers)`, `getVerdict(ticker)`, `getVerdictTrackRecord()`.
- `useVerdictSummary(tickers)` — chunked and merged like `useCongressOwnershipSummary`; `useVerdict(ticker)` — disabled for an empty ticker.
- `lib/verdicts.js`: `ACTION_LABEL = {buy: 'Buy', add: 'Add', hold: 'Hold', trim: 'Trim', sell_review: 'Sell (review)', wait: 'Wait', not_a_fit: 'Not a fit', no_verdict: 'No verdict'}`; `actionTone(action)` → `'up'` for buy/add, `'warn'` for trim/sell_review, `undefined` otherwise; `GRADE_LABEL` for both grades; `checkLine(check)` → e.g. `"Return on equity 31.2% · needs 15%"` / `"… · no figure"`; `verdictTicker(instrument)` reusing `ownershipTicker` (US-dollar listings only).

- [ ] **Step 1: Failing tests**

```js
it('labels every action the backend can send', …)
it('never colours a sell as down-red: review reads as a warning', () => expect(actionTone('sell_review')).toBe('warn'))
it('says no figure instead of a zero', () => expect(checkLine({label:'Return on capital', status:'unknown', value:null, threshold:'10%'})).toBe('Return on capital · no figure'))
```

`VerdictCard.test.jsx`: renders the action in words, both grades, six check lines with a pass/fail/unknown word each (not colour alone), both price levels through `fmtMoney(value, 'USD')`, the trend sentence, "As of <date>"; `verdict: null` renders "Not covered by the nightly scan"; `no_verdict` shows the reason; loading renders the panel skeleton.
`OverviewTab.test.jsx`: the card appears above the snapshot for an eligible company and is absent for an ETF or a foreign listing.

- [ ] **Step 2: Run, expect failures** — `npx vitest run src/lib/verdicts.test.js src/components/verdicts`
- [ ] **Step 3: Implement.** Invoke the `saxodash-design-system` skill first. The card is a standard panel (see `SnapshotSection.jsx` for anatomy); the action uses the shared `Tag`; footer line: "Rules, not advice. Sell (review) means check the story, not an order." Gate with the page's existing `companyDataStatus` (`eligible` only) so no request is made otherwise.
- [ ] **Step 4: Run `npx vitest run` (whole suite) and `npx eslint src`**
- [ ] **Step 5: Commit**

---

### Task 9: Badges on the watchlist and the Portfolio table

**Files:**
- Create: `frontend/src/components/verdicts/ActionBadge.jsx`, `ActionBadge.test.jsx`
- Modify: `components/research/WatchlistRail.jsx` (+ test), `components/portfolio/PositionsTable.jsx` (+ test), `pages/Portfolio.jsx` if that is where the ownership summaries are fetched

**Interfaces:**
- Consumes: `useVerdictSummary`, `verdictTicker`, `ACTION_LABEL`, `actionTone`.
- `ActionBadge({ verdict })` renders nothing for `undefined` (loading), a dash for `null` (not covered), else the label with `title={verdict.reason}`.

- [ ] **Step 1: Failing tests** — badge states above; the watchlist makes one summary request for all its rows, not one per row; Portfolio gets a "Verdict" column (`hideBelow="md"`, placed after Weight) showing the badge, and a foreign-currency position shows a dash without being asked about.
- [ ] **Step 2–4:** follow how the "Fund shares" column gets its data in `PositionsTable`. Run the whole vitest suite, eslint and `npm run build`.
- [ ] **Step 5: Commit**

---

### Task 10: Run it for real, document it

**Files:**
- Modify: `AGENTS.md` ("Decided": one paragraph, same voice as its neighbours), `DESIGN.md` (pages table: Verdict card on Research, Verdict column on Portfolio), `docs/running-the-stack.md` if it lists scheduled tasks
- Create: `learning/learning-records/NNNN-<slug>.md` only if something surprised

- [ ] **Step 1:** `python manage.py migrate` on the dev DB; with Saxo connected run `python manage.py scan_universe` (or scan a handful of rows from a shell if the full run is too long) and then `compute.run()`.
- [ ] **Step 2:** Print the verdicts for GOOGL, AMZN, MSFT, NVDA, META and NBIS and read them against the Research page's own figures. Record in the PR description anything that looks wrong (a megacap graded Weak is a bug until explained).
- [ ] **Step 3:** Screenshot the Overview card, the watchlist and the Portfolio column in both themes with the design-system skill's review harness; fix what the review finds.
- [ ] **Step 4:** Full suites: `python manage.py test`, `npx vitest run`, `npx eslint src`, `npm run build`.
- [ ] **Step 5:** Commit, push, open a PR **into `develop`**.
