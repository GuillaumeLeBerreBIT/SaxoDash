# Valuation Yardstick Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grade the two valuation yardsticks (the stock's own P/E range, and the growth line) on the stored history
with the Signal Lab's engine, so the chart and the verdict keep only a yardstick with evidence behind it.

**Architecture:** A pure module turns each stock's daily bars and quarterly EPS into point-in-time flags
(`pe_cheap`, `pe_expensive`, `growth_cheap`, `growth_expensive`), sampled on the first session of each month.
The flags go through `signals/evaluate.score`, extended to take horizons, which measures forward returns against the
same-day average stock with a bootstrap range by stock and a first-half/second-half check. A management command
prints the table and writes a dated report. Nothing user-facing changes in this plan; the decision comes after.

**Tech Stack:** Django management command, the `signals` evaluation engine, `DailyBars` (about 23 years of daily
bars) and `ScreenerRow.fundamentals_history.quarterly_eps`.

**Spec:** `docs/superpowers/specs/2026-11-17-chart-value-guides-design.md`, revision "one yardstick, the verdict's
own P/E range" (2026-11-18), and the decision entry in `docs/decisions.md` ("The chart draws the verdict's own
cheap and expensive levels..."). The owner asked for "what is financially correct, otherwise I do not need it".

## Global Constraints

- No hindsight. A quarter's EPS counts from 35 days after its period end for BOTH yardsticks in the test (the
  10-Q deadline is 40 days). The P/E percentiles on a day use only weekly P/E from the five years before that day
  (at least 104 weeks, `research.valuation.MIN_PE_WEEKS`), never today's range.
- P/E range rule: cheap when P/E <= its 25th percentile, expensive when >= its 75th (`verdicts/rules.valuation`).
- Growth rule: exactly `backend/verdicts/growth_line.py` as of commit 9609ccc (restore it as
  `backend/verdicts/yardsticks_growth.py`, unchanged): cheap below 0.9x the line, expensive above 1.1x on an
  uncapped step; a capped step is never expensive.
- Grading: `signals.evaluate.grade` unchanged (at least 300 cases, 95% bootstrap range above zero and both halves
  positive = supported). Horizons 60, 120 and 250 sessions; the grade is read at 250, since valuation works slowly.
- Excess return is measured against the same-day average of all stocks with data, as the Signal Lab does.
- One case per stock per month (first session of the month), so a stock that stays cheap for a year is 12 cases,
  not 250 overlapping ones.
- Generated code carries zero comments (AGENTS.md).

## Review Focus

1. **Split mismatch.** Saxo bars are split-adjusted; if Finnhub's quarterly EPS is not, P/E jumps 4-10x at a
   split and floods one side. Expected: the data check in Task 1 counts stocks whose daily P/E changes more than
   3x in one session, and the report lists them and runs once with them excluded.
2. **Restated EPS.** Finnhub may serve restated figures, a mild hindsight. Expected: named as a limit in the
   report; not fixable with the data we hold.
3. **Survivorship.** The universe is today's stocks, so companies that died are missing, which flatters "cheap".
   Expected: named as a limit; the cheap-minus-expensive spread is less exposed than "cheap" alone and is reported.
4. **Too little history.** Stocks with fewer than four quarters plus 104 weeks have no flags. Expected: counted in
   the report, never treated as "fair".
5. **Losses.** A non-positive trailing EPS gives no P/E and no growth step. Expected: no flag that day.

---

### Task 1: Point-in-time yardstick flags

**Files:**
- Create: `backend/verdicts/yardsticks.py`, `backend/verdicts/yardsticks_growth.py` (restored from 9609ccc)
- Test: `backend/verdicts/test_yardsticks.py`

**Interfaces:**
- Produces: `monthly_flags(series, quarterly_eps) -> dict[str, list[bool]]` with keys `pe_cheap`,
  `pe_expensive`, `growth_cheap`, `growth_expensive`, each the length of `series.dates`, True only on the first
  session of a month whose rule holds; `split_suspects(series, quarterly_eps) -> int` (sessions where P/E moves
  more than 3x).

- [ ] **Step 1: Write the failing tests**: a stock with flat EPS and a price that falls to below its 25th
  percentile P/E is `pe_cheap` on the next month's first session and on no other weekday; a quarter whose period end
  is 20 days before a session is not yet known; the percentiles on a 2015 session ignore all 2016 prices; a capped
  growth step above the line is never `growth_expensive`; a 4:1 split in prices with unadjusted EPS is counted by
  `split_suspects`.
- [ ] **Step 2: Run** `python manage.py test verdicts.test_yardsticks` and see them fail.
- [ ] **Step 3: Implement** with `research.valuation.trailing_pe` for the daily P/E (fed EPS shifted by 35 days),
  `statistics.quantiles(n=4, method='inclusive')` over the trailing five years of weekly values, and
  `yardsticks_growth.steps` for the growth line.
- [ ] **Step 4: Run** the tests and see them pass.
- [ ] **Step 5: Commit** `feat(verdicts): point-in-time valuation flags for the yardstick test`.

### Task 2: Horizons for the evaluation engine

**Files:**
- Modify: `backend/signals/evaluate.py` (`score(series_by_ticker, flags, horizons=HORIZONS, grade_horizon=GRADE_HORIZON)`)
- Test: `backend/signals/test_evaluate.py`

- [ ] **Step 1: Failing test**: `score(..., horizons=(60, 250), grade_horizon=250)` returns scores at 60 and 250
  and grades on 250; the default call returns exactly what it returns today (5, 20, 60, graded on 60).
- [ ] **Step 2-4:** run, implement by threading the two parameters through, run.
- [ ] **Step 5: Commit** `feat(signals): let the evaluation engine take horizons`.

### Task 3: The grading command and report

**Files:**
- Create: `backend/verdicts/management/commands/grade_valuation.py`
- Test: `backend/verdicts/test_grade_valuation.py`
- Output: `docs/research/2026-11-valuation-yardsticks.md` (written by the command, committed after the run)

- [ ] **Step 1: Failing test**: on a small fixture universe the command prints one row per flag and horizon with
  cases, stocks, mean excess, 95% range, both halves and grade, plus a "cheap minus expensive" row per yardstick,
  the split-suspect count, and the number of stocks with no flags.
- [ ] **Step 2-4:** run, implement (load like `signals.compute._load`, build `monthly_flags` per stock, call
  `evaluate.score(horizons=(60, 120, 250), grade_horizon=250)`, run once more with split suspects excluded), run.
- [ ] **Step 5: Commit** `feat(verdicts): grade the valuation yardsticks on stored history`.

### Task 4: Run it and decide with the owner

- [ ] **Step 1:** Run `python manage.py grade_valuation` on the dev database (full history) and once limited to
  2023-2026, the Signal Lab's test window.
- [ ] **Step 2:** Commit the report with a plain-language summary at the top: which yardstick, if any, is
  supported, how big the effect is, and the limits (split suspects, restatements, survivorship).
- [ ] **Step 3:** Bring the owner one recommendation, using these rules decided now so the result cannot bend
  them:
  - P/E range supported: keep everything as built; the Guide cites the evidence.
  - Growth line supported and P/E range not: propose moving the verdict and the chart to the growth line (a new
    design, since it changes the verdict and restarts its track record).
  - Both supported: keep the P/E range (already the verdict) and report the growth line's figure for comparison.
  - Neither supported: per the owner's rule "hide what has no edge", propose turning the zones off by default and
    labelling the badge's price word as a rule of thumb.
