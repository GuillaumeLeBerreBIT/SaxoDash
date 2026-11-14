# Signal Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store daily bars for the scanned stocks, score a fixed set of chart signals nightly against the average stock, and show them on the Research page as a toggleable lane and a Setup card, each with its evidence.

**Architecture:** `research` keeps the bars the scan already fetches (`DailyBars`). A new `signals` app reads only stored rows: `definitions.py` detects signals over one stock's bars, `evaluate.py` scores them across stocks, `compute.py` writes `SignalScore` and `StockSignals`, two read-only endpoints serve them. The frontend adds a query module, `lib/signals.js`, a Signals menu, a lane in `TVChart` and a `SetupCard`.

**Tech Stack:** Django + DRF, Celery, Postgres 17; React 19, TanStack Query, vitest. No new dependency.

**Spec:** `docs/superpowers/specs/2026-11-14-signal-lab-design.md` (evidence: `docs/superpowers/specs/2026-11-14-chart-signals-roadmap.md`). The exact rules were first run in `docs/superpowers/plans/reference/2026-11-14-signals-test.py`; Task 2's detectors must reproduce its `flags` for the same bars.

## Global Constraints

- Zero comments in code (AGENTS.md). Tests first. Branch `feat/signal-lab`, PR into `develop`.
- `signals` imports neither `research.finnhub`, `research.market` nor `requests`; add a test that asserts it, as `verdicts` has.
- Colours only through `lib/theme.js` semantic utilities and `useChartColors()`; `noPaletteClasses.test.js` must pass.
- Run `manage.py migrate` on the dev database after each new migration. Never run two test commands at once.
- Backend tests: `cd backend && .venv/bin/python manage.py test <app>`. Frontend: `cd frontend && npx vitest run <path>`, then `npx eslint src`.
- Markers are dots with a code, never arrows. No copy says "buy" or "sell" for a signal.
- Grade names are exactly `supported`, `no_edge`, `against`, `too_few`. Horizons are exactly `(5, 20, 60)`; the grade is decided on 60.
- A forward return is `closes[i+h] / opens[i+1] - 1` (entry at the next session's open). The interval is the wider of a by-stock and a by-calendar-month bootstrap. Because of both, stored figures will be somewhat lower than the roadmap's Test 3 table, which entered at the signal's close.
- Constants: `MIN_BARS = 520`, `FIRST_BAR = 260`, `MIN_STOCKS_PER_DATE = 50`, `MIN_CASES = 300`, `BOOTSTRAP_ROUNDS = 400`, `BOOTSTRAP_SEED = 7`.

## Review Focus

- A stock with fewer than 260 bars, or bars containing a zero volume or a repeated date: detectors return all-false for what they cannot compute and never raise.
- The first nightly run before any `DailyBars` exist: `compute.run` writes nothing, reports zero rows, and both endpoints answer (`grade: null`, `null`).
- A date on which fewer than 50 stocks have a forward return: its cases are left out of the scores, not compared with a tiny average.
- A user asking for the signals of an extra ticker they neither hold nor watch gets `null`, never another user's holding.
- A chart preference blob saved before this feature (no `signals` key) still loads, with every signal off.

---

### Task 1: Keep the scan's bars

**Files:**
- Modify: `backend/research/models.py`, `backend/research/scan.py`
- Create: migration via `makemigrations research`
- Test: `backend/research/test_scan.py`

**Interfaces:**
- Produces: `research.models.DailyBars(row: OneToOne ScreenerRow related_name='daily_bars', on_delete=CASCADE; bars: JSONField default list; updated_at: auto_now)`. `bars` is `[[iso_date, open, high, low, close, volume], ...]`, oldest first.
- Produces: `research.scan.stored_bars(bars) -> list` (drops a bar missing open/high/low/close, volume `None` becomes `0`, sorts by date, keeps one bar per date, the last seen).

- [ ] **Step 1: Failing tests** in `test_scan.py`: `test_scan_row_stores_daily_bars_oldest_first` (after `scan_row` with three chart bars given newest first, `row.daily_bars.bars == [['2026-01-02', 1, 2, 0.5, 1.5, 100], ...]` ascending), `test_stored_bars_drops_incomplete_and_duplicate_dates`, `test_a_failed_chart_keeps_the_previous_bars` (chart raises; existing `DailyBars` unchanged).
- [ ] **Step 2:** Run `manage.py test research.test_scan`; expect the three to fail.
- [ ] **Step 3:** Add the model, `stored_bars`, and in `scan_row` after the successful `row.save()` call `DailyBars.objects.update_or_create(row=row, defaults={'bars': stored_bars(bars)})` inside the same `try` that guards the save.
- [ ] **Step 4:** `makemigrations research`, run the tests (pass), `manage.py migrate` on the dev database.
- [ ] **Step 5:** Commit `feat(research): keep the daily bars the scan fetches`.

### Task 2: Signal definitions

**Files:**
- Create: `backend/signals/__init__.py`, `apps.py`, `series.py`, `definitions.py`, `test_definitions.py`, `test_imports.py`; add `'signals'` to `INSTALLED_APPS`.

**Interfaces:**
- Produces: `series.Series` (frozen dataclass: `dates, opens, highs, lows, closes, volumes`, lists of equal length) and `series.from_bars(bars) -> Series`.
- Produces: `definitions.Signal` (frozen dataclass: `key, code, label, description, kind` with kind in `'event' | 'state' | 'rank'`).
- Produces: `definitions.SIGNALS: tuple[Signal, ...]` with the 17 keys and codes from the spec table, in that order.
- Produces: `definitions.detect(series) -> dict[str, list[bool]]` for every non-rank key, each list as long as the series.
- Produces: `definitions.momentum(series) -> list[float | None]` (`closes[i-21] / closes[i-252] - 1`, `None` before bar 252).

- [ ] **Step 1: Failing tests.** One hand-built series per rule asserting the exact bar it fires on and that it is false one bar earlier or with one condition broken, for all 16 non-rank signals; `test_short_series_is_all_false` (100 bars); `test_zero_volume_never_raises`; `test_keys_and_codes_are_unique`; `test_detect_matches_the_reference_run` (load `signals/testdata/reference_flags.json`, built once by running the reference script's `flags` over two tickers' stored `DailyBars` after Task 1 and one scan, saved with those bars, and compared on every key and bar; the reference scripts read `data/bars.json` shaped `{ticker: [[date, open, high, low, close, volume], ...]}`). `test_imports.py`: no module under `signals` imports `research.finnhub`, `research.market` or `requests`.
- [ ] **Step 2:** Run `manage.py test signals`; expect failures.
- [ ] **Step 3:** Implement with the rules in the spec table. Rolling means, highs and volume averages come from prefix sums or a single pass, so `detect` is linear in the number of bars per signal.
- [ ] **Step 4:** Tests pass.
- [ ] **Step 5:** Commit `feat(signals): signal definitions over stored daily bars`.

### Task 3: Scoring

**Files:**
- Create: `backend/signals/evaluate.py`, `backend/signals/test_evaluate.py`

**Interfaces:**
- Consumes: `series.Series`, `definitions.detect`, `definitions.momentum`, `definitions.SIGNALS`.
- Produces: `evaluate.flags_by_stock(series_by_ticker: dict[str, Series]) -> dict[str, dict[str, list[bool]]]` (adds `momentum_top`: on each date, the top quarter by `momentum` among stocks with a value, at least 8 stocks needed).
- Produces: `evaluate.Score` (frozen dataclass: `key, horizon, cases, stocks, mean_excess, ci_low, ci_high, positive_share, first_half, second_half, grade, from_date, to_date`).
- Produces: `evaluate.score(series_by_ticker, flags) -> list[Score]`, one per (key, horizon), every key present even with zero cases (`grade='too_few'`, figures `None`).
- Produces: `evaluate.grade(cases, ci_low, ci_high, first_half, second_half) -> str`.

- [ ] **Step 1: Failing tests:** `test_grade_table` (299 cases is `too_few`; interval above zero with both halves positive is `supported`; interval above zero with a negative half is `no_edge`; the mirror is `against`; interval spanning zero is `no_edge`); `test_excess_subtracts_the_dates_average` (60 synthetic stocks, one flagged stock rising 10% over 5 bars while the rest are flat gives a mean excess of 10% minus the average); `test_dates_with_fewer_than_fifty_stocks_are_left_out`; `test_stocks_under_520_bars_are_ignored`; `test_two_runs_give_the_same_interval`; `test_momentum_top_is_the_top_quarter_per_date`; `test_a_signal_with_no_cases_is_too_few`.
- [ ] **Step 2:** Run; expect failures.
- [ ] **Step 3:** Implement as the spec's Scoring section: per-stock sums per signal and horizon, date averages for the excess, bootstrap over tickers and again over calendar months, each with its own `random.Random(BOOTSTRAP_SEED)`, keeping the lower low and the higher high, halves split at the median date. Grade on horizon 60 and copy it to the signal's other horizons.
- [ ] **Step 4:** Tests pass.
- [ ] **Step 5:** Commit `feat(signals): score signals against the average stock`.

### Task 4: Nightly run and storage

**Files:**
- Create: `backend/signals/models.py`, `compute.py`, `tasks.py`, `test_compute.py`, migration
- Modify: `backend/core/scheduling.py` (add `'Compute signals': {'task': 'signals.tasks.compute_signals', 'crontab': {'minute': '45', 'hour': '0'}}`)

**Interfaces:**
- Produces: `SignalScore(key, horizon, cases, stocks, mean_excess, ci_low, ci_high, positive_share, first_half, second_half, grade, from_date, to_date, computed_at)`, unique on `(key, horizon)`; float fields nullable.
- Produces: `StockSignals(ticker unique, uic nullable, as_of date nullable, active JSON list, events JSON dict, computed_at)`.
- Produces: `compute.run() -> compute.Result(written: int, failed: list[str])`; `compute.events_of(kind, flags: list[bool], dates) -> list[str]` (every true date for an event; the first date of each run otherwise).
- Produces: `tasks.compute_signals` (`@shared_task`, wrapping a `@synced(reports_health=False, task='compute_signals', credential=None)` function returning `SyncReport(rows=..., detail=...)`).

- [ ] **Step 1: Failing tests:** `test_run_with_no_bars_writes_nothing`; `test_run_writes_scores_for_universe_and_signals_for_everything` (an extra row gets `StockSignals` but its bars do not enter the scores); `test_active_lists_keys_true_on_the_last_bar`; `test_events_of_state_keeps_run_starts_only`; `test_unparseable_bars_are_named_and_skipped`; `test_a_ticker_that_left_everything_loses_its_row`; `test_task_records_a_sync_run_without_health`.
- [ ] **Step 2:** Run; expect failures.
- [ ] **Step 3:** Implement. `run` loads `DailyBars` joined to `ScreenerRow.everything`, builds series, computes flags once, scores the universe subset, and writes both tables with `update_or_create` (scores) and `bulk` replace per ticker inside a transaction each.
- [ ] **Step 4:** `makemigrations signals`; tests pass; `manage.py migrate` on the dev database.
- [ ] **Step 5:** Commit `feat(signals): nightly signal scores and per-stock signals`.

### Task 5: Endpoints

**Files:**
- Create: `backend/signals/views.py`, `urls.py`, `test_views.py`
- Modify: the project `urls.py` that mounts `api/verdicts/` (add `api/signals/` beside it)

**Interfaces:**
- Consumes: `verdicts.visibility.own_tickers(user)`, `ScreenerRow.everything`.
- Produces: `GET /api/signals/` -> `{"signals": [{key, code, label, description, kind, grade, period: {from, to} | null, horizons: {"5": {cases, stocks, mean_excess, ci_low, ci_high, positive_share, first_half, second_half}, "20": {...}, "60": {...}}}]}` in `SIGNALS` order; before the first run `grade` and `period` are `null` and `horizons` is `{}`.
- Produces: `GET /api/signals/<ticker>/` -> `{"stock_signals": {ticker, uic, as_of, active, events}}`, or `{"stock_signals": null}` (status 200).

- [ ] **Step 1: Failing tests:** anonymous is 401 on both; list before any run; list after a run carries the stored figures; detail for a universe ticker; detail is case-insensitive on the ticker; detail for an unknown ticker is `null`; detail for an extra is `null` for a stranger and present for its holder.
- [ ] **Step 2:** Run; expect failures. **Step 3:** Implement. **Step 4:** Tests pass, then run `manage.py test users.test_isolation` (no per-user model was added; it must still pass).
- [ ] **Step 5:** Commit `feat(signals): read endpoints for scores and a stock's signals`.

### Task 6: Frontend data and words

**Files:**
- Create: `frontend/src/api/queries/signals.js`, `frontend/src/lib/signals.js`, `frontend/src/lib/signals.test.js`
- Modify: `frontend/src/api/client` (add `getSignals`, `getStockSignals` beside the verdict calls), `frontend/src/api/queries` index export, `frontend/src/api/queries.test.jsx`

**Interfaces:**
- Produces: `useSignals()` (stale time 1 hour), `useStockSignals(ticker)` (disabled for an empty ticker).
- Produces in `lib/signals.js`: `GRADE_ORDER = ['supported', 'no_edge', 'against', 'too_few']`; `GRADE_WORDS = {supported: 'Held up in testing', no_edge: 'No edge found', against: 'Worked against', too_few: 'Too few cases'}`; `evidenceLine(signal, horizon = 60) -> string`; `groupedByGrade(signals) -> [{grade, signals}]` (empty groups left out, ungraded signals under `too_few`); `signalMarkers(stockSignals, chosenKeys, signals) -> [{date, key, code, label, grade}]` sorted by date then `SIGNALS` order; `activeSignals(stockSignals, signals)` supported first.

- [ ] **Step 1: Failing tests** with these exact strings: `evidenceLine` of a supported signal with `mean_excess 0.029`, `cases 27280` is `'+2.9% against the average stock over 60 sessions, 27,280 cases'`; against with `-0.0236`, `1075` is `'-2.4% against the average stock over 60 sessions, 1,075 cases'`; no edge with 4352 cases is `'No edge found in 4,352 cases'`; too few with 120 is `'Only 120 cases, too few to judge'`; a signal with no scores is `'Not tested yet'`. Marker and grouping tests for order, unchosen keys, and a `null` stock answer giving `[]`.
- [ ] **Step 2:** Run `npx vitest run src/lib/signals.test.js`; expect failures. **Step 3:** Implement. **Step 4:** Pass.
- [ ] **Step 5:** Commit `feat(signals): frontend queries and evidence wording`.

### Task 7: Signals menu and lane on the chart

**Files:**
- Modify: `frontend/src/lib/chartPrefs.js` (+ test), `frontend/src/components/research/useChartControls.js` (+ test), `frontend/src/components/research/chartMenus.jsx`, `frontend/src/components/research/TVChart.jsx`, `frontend/src/pages/Research.jsx`
- Create: `frontend/src/components/research/SignalLane.jsx`, `SignalLane.test.jsx`, `SignalsMenu.test.jsx`

**Interfaces:**
- Consumes: Task 6's `groupedByGrade`, `signalMarkers`, `evidenceLine`, `GRADE_WORDS`.
- Produces: chart prefs gain `signals: {}` (key to boolean; unknown keys dropped by `sanitizeChartPrefs`, a missing object is `{}`); `controls.signals`, `controls.toggleSignal(key)`.
- Produces: `TVChart` prop `signalMarkers = []`; `SIGNAL_LANE = 20` added to the lane height passed to `priceGeometry` only when a marker falls inside the visible window.
- Produces: `<SignalLane markers geometry colors onInspect />` rendering `data-testid="signal-lane"` and one focusable `data-testid="signal-marker"` per marker with `aria-label` `"<label> on <date>. <GRADE_WORDS[grade]>."`; `<SignalCard marker signal x bottom width />` with the label, date, description and `evidenceLine`.

- [ ] **Step 1: Failing tests:** prefs round-trip and an old blob without `signals`; menu lists groups in `GRADE_ORDER` with each evidence line and toggles through `controls.toggleSignal`; lane renders nothing with no markers, one marker per chosen event in view, stacks two markers on one date side by side, opens the card on focus; a marker outside the window adds no lane.
- [ ] **Step 2:** Run the listed specs; expect failures.
- [ ] **Step 3:** Implement. Marker colour by grade through `useChartColors()`: accent for `supported`, the muted ink for `no_edge` and `too_few`, the warning colour for `against`. `Research.jsx` calls `useSignals()` and `useStockSignals(companySymbol)`, applies `sameListing` on uic as for the verdict, and passes `signalMarkers` to the chart.
- [ ] **Step 4:** Specs pass; `npx vitest run` whole suite; `npx eslint src`.
- [ ] **Step 5:** Commit `feat(research): signals menu and marker lane on the chart`.

### Task 8: Setup card, guide text, real-data check

**Files:**
- Create: `frontend/src/components/signals/SetupCard.jsx`, `SetupCard.test.jsx`
- Modify: `frontend/src/components/research/OverviewTab.jsx` (+ test), `GuideTab.jsx`, `AGENTS.md`, `DESIGN.md` if a new pattern was introduced

**Interfaces:**
- Consumes: `activeSignals`, `evidenceLine`, `GRADE_WORDS`.
- Produces: `<SetupCard stockSignals signals />` rendered under `VerdictCard` in `OverviewTab` when `stockSignals` is not `null`.

- [ ] **Step 1: Failing tests:** heading "Setup"; "Active on the latest session" with each active signal's label, grade word and evidence line, supported first; with none active the text "No signals active on the latest session"; the footer names the period from `signals[0].period` and contains "before costs"; nothing renders for a `null` stock answer.
- [ ] **Step 2:** Run; expect failures. **Step 3:** Implement, panel anatomy per `DESIGN.md`. **Step 4:** Pass; full vitest, eslint, `npm run build`.
- [ ] **Step 5:** Guide tab: a "Signals" section explaining excess return, the interval, the two-halves rule and the limits (one market period, today's index members, no costs).
- [ ] **Step 6:** AGENTS.md "Decided" entry: bars are stored by the scan; `signals` reads stored rows only; grades are decided on 60 sessions with the two-halves rule; markers never read as instructions.
- [ ] **Step 7:** On the dev stack: run the scan once (fills `DailyBars`), then `compute_signals`; record the run time and the grade of every signal; open Research for a held stock in the three themes and at phone width, with the lane on, and fix what looks wrong. Compare the stored `momentum_top`, `news_gap_up` and `volume_thrust` 60-session figures with the roadmap's Test 3 table; a different sign means a bug in Task 2 or 3, not a new finding.
- [ ] **Step 8:** Commit `feat(signals): setup card, guide section and docs`; then superpowers:finishing-a-development-branch.
