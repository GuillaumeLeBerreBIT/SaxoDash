# Chart Value Guides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Research chart's flat cheap/expensive zones with a point-in-time growth line and a P/E chip, and add a 52-week high line and volume-gap boxes, drawn in the cleaned-up style (right-axis tags, no painted background).

**Architecture:** The growth line is computed nightly in the `verdicts` app from stored `quarterly_eps` and served in the verdict detail payload with the P/E percentiles. The 52-week high and gaps are computed in the browser from the bars the chart already holds; gaps mirror `signals/definitions.py` and a shared fixture pins the two sides together. One frontend module (`lib/valueGuides.js`) reads the line, the chip and the sentence.

**Tech Stack:** Django + DRF (`APITestCase`/`TestCase`), Postgres 17; React 19 + Vite, vitest, SVG chart (`TVChart.jsx`).

**Spec:** `docs/superpowers/specs/2026-11-17-chart-value-guides-design.md`

## Global Constraints

- Zero comments in generated code (AGENTS.md). No hex literals or Tailwind palette classes; colours from `useChartColors()` / semantic utilities.
- No copy says buy or sell; no arrows as trade signals. "Opportunity" / "buy zone" wording is removed from the chart.
- `verdicts` imports neither `finnhub`, `market` nor `requests`.
- Constants: `REPORT_LAG_DAYS = 35`, `ONE_OFF_HIGH = 2.5`, `ONE_OFF_LOW = 0.4`, `GROWTH_YEARS = 3`, `FAIR_PE_FLOOR = 15`, `FAIR_PE_CAP = 30`, `KEEP_YEARS = 10`, `FAIR_BAND = 0.10`, `HIGH_WINDOW = 252`, `GAP_BOX_SESSIONS = 60`, `GAP_LOOKBACK = 252`.
- Gap rules, verbatim from `signals/definitions.py`: usual = sum of the previous 20 volumes / 20 (or 1 if zero); heavy = volume > 2 x usual; gap up = heavy and open > 1.04 x previous close and close > 0.98 x open; gap down = heavy and open < 0.96 x previous close; only from index 20.
- The verdict's grade, action and track record do not change. `cheap_below` / `expensive_above` stay in the model and payload.
- Work in `.worktrees/chart-value-guides` on `feat/chart-value-guides`. PR into `develop`, never `main`.

## Review Focus

1. A stock whose EPS turns negative inside the window (e.g. a loss year): no step for those dates, and the line has a visible gap rather than a zero or a crash. Test in Task 1.
2. A verdict with `growth_line: []` or `null` (row scanned before this ships, or a young listing): chart draws no line, chip still shows if percentiles exist, sentence says "Too little earnings history for a growth line." Test in Task 3.
3. A chart range whose first visible bar is older than the first step: bars before it have no reading and no line; nothing extrapolates backwards. Test in Task 3 (`stepAt` before first step).
4. Fewer than 252 bars loaded (recent IPO, short history): no 52-week high line rather than a high of the bars available. Test in Task 4.
5. A gap whose 60-session box would run past the last bar: box ends at the last bar. Test in Task 4.

---

### Task 1: Growth line module (backend)

**Files:**
- Create: `backend/verdicts/growth_line.py`
- Test: `backend/verdicts/test_growth_line.py`

**Interfaces:**
- Produces: `growth_line.steps(quarterly_eps: list[tuple[date, float]], today: date) -> list[dict]`, each dict `{"from": "YYYY-MM-DD", "price": float, "pe": float, "growth": float, "eps_ttm": float, "capped": bool}`, oldest first, rounded to 2 decimals (`growth` 1 decimal). Input order is not assumed; sort by period.

- [ ] **Step 1: Write the failing tests** (`django.test.SimpleTestCase`; build quarters with a helper `quarters(start, values)` that steps 91 days)

```python
def test_a_quarter_counts_35_days_after_its_end(self):
    eps = quarters(date(2018, 3, 31), [1.0] * 16 + [2.0])
    last = steps(eps, today=date(2026, 1, 1))[-1]
    self.assertEqual(last['from'], (eps[-1][0] + timedelta(days=35)).isoformat())

def test_no_step_uses_a_quarter_known_after_the_step(self):
    eps = quarters(date(2016, 3, 31), [1 + i * 0.1 for i in range(30)])
    for step in steps(eps, today=date(2026, 1, 1)):
        known = [d for d, _ in eps if d + timedelta(days=35) <= date.fromisoformat(step['from'])]
        self.assertAlmostEqual(step['eps_ttm'], round(sum(v for _, v in sorted(eps)[len(known) - 4:len(known)]), 2))

def test_a_one_off_quarter_is_replaced_by_the_median_of_the_four_before(self):
    eps = quarters(date(2018, 3, 31), [2.0] * 16 + [9.0, 2.0])
    by_from = {s['from']: s for s in steps(eps, today=date(2026, 1, 1))}
    spike = by_from[(eps[16][0] + timedelta(days=35)).isoformat()]
    self.assertEqual(spike['eps_ttm'], 8.0)

def test_low_one_off_is_replaced_too_and_neighbours_are_kept(self):
    eps = quarters(date(2018, 3, 31), [2.0] * 16 + [0.5, 2.6])
    s = steps(eps, today=date(2026, 1, 1))
    self.assertEqual(s[-2]['eps_ttm'], 8.0)
    self.assertEqual(s[-1]['eps_ttm'], 8.6)

def test_fewer_than_four_quarters_or_non_positive_ttm_gives_no_step(self):
    self.assertEqual(steps(quarters(date(2024, 3, 31), [1.0, 1.0, 1.0]), today=date(2026, 1, 1)), [])
    loss = quarters(date(2016, 3, 31), [1.0] * 16 + [-3.0] * 4 + [1.0] * 4)
    froms = [s['from'] for s in steps(loss, today=date(2026, 1, 1))]
    self.assertNotIn((loss[19][0] + timedelta(days=35)).isoformat(), froms)

def test_slow_growth_takes_the_floor_and_fast_growth_is_capped(self):
    flat = steps(quarters(date(2016, 3, 31), [1.0] * 20), today=date(2026, 1, 1))[-1]
    self.assertEqual((flat['pe'], flat['capped']), (15.0, False))
    fast = steps(quarters(date(2015, 3, 31), [1.5 ** (i / 4) for i in range(40)]), today=date(2026, 1, 1))[-1]
    self.assertEqual((fast['pe'], fast['capped']), (30.0, True))
    self.assertEqual(fast['price'], round(30.0 * fast['eps_ttm'], 2))

def test_growth_between_floor_and_cap_is_the_fair_pe(self):
    eps = quarters(date(2015, 3, 31), [1.2 ** (i / 4) for i in range(40)])
    last = steps(eps, today=date(2026, 1, 1))[-1]
    self.assertAlmostEqual(last['pe'], 20.0, delta=0.2)
    self.assertFalse(last['capped'])

def test_only_the_last_ten_years_are_kept(self):
    eps = quarters(date(2000, 3, 31), [1.0 + i * 0.05 for i in range(100)])
    first = steps(eps, today=date(2026, 1, 1))[0]
    self.assertGreaterEqual(date.fromisoformat(first['from']), date(2016, 1, 1))
```

- [ ] **Step 2: Run** `cd backend && .venv/bin/python manage.py test verdicts.test_growth_line` — Expected: FAIL (`ModuleNotFoundError: verdicts.growth_line`).

- [ ] **Step 3: Implement `steps(quarterly_eps, today)`** with the constants from Global Constraints. Adjust each quarter in order against the median of the four *unadjusted* quarters before it (skip when fewer than four or median ≤ 0). TTM = sum of last four adjusted; growth = `(ttm / ttm_at_step_3_years_earlier) ** (1/3) - 1` where the earlier TTM is the one whose known date is the latest on or before `from - 3 years`; skip when either TTM ≤ 0 or missing. Fair P/E = `min(30, max(15, growth_pct))`; `capped = growth_pct > 30`. Drop steps with `from < today - 10 years`.

- [ ] **Step 4: Run tests** — Expected: PASS (8 tests).

- [ ] **Step 5: Commit** `git add backend/verdicts/growth_line.py backend/verdicts/test_growth_line.py && git commit -m "feat(verdicts): point-in-time growth line from quarterly EPS"`

### Task 2: Store and serve the line and P/E percentiles

**Files:**
- Modify: `backend/verdicts/models.py` (StockVerdict), `backend/verdicts/compute.py` (`_store`), `backend/verdicts/payload.py` (`_detail`)
- Create: `backend/verdicts/migrations/0004_stockverdict_growth_line.py` (via `makemigrations verdicts`)
- Test: `backend/verdicts/test_compute.py`, `backend/verdicts/test_views.py`

**Interfaces:**
- Consumes: `growth_line.steps` (Task 1).
- Produces: `StockVerdict.growth_line` (JSONField, default list, blank), `pe_p25`, `pe_p75` (FloatField null/blank). Detail payload keys `growth_line`, `pe_p25`, `pe_p75`.

- [ ] **Step 1: Write failing tests**
  - `test_compute`: `test_stores_the_growth_line_and_pe_percentiles` — a row with `fundamentals_history={'quarterly_eps': [[iso, v], ...20 quarters]}` and `pe_history={'p25': 20.0, 'p75': 30.0, 'current': 25.0, 'eps_ttm': 4.0, 'weeks': 200}` → after `compute.run`, `verdict.growth_line == growth_line.steps(parsed, today)` and `(verdict.pe_p25, verdict.pe_p75) == (20.0, 30.0)`.
  - `test_compute`: `test_a_row_without_eps_history_gets_an_empty_line` — `quarterly_eps` missing → `growth_line == []`, verdict still written.
  - `test_compute`: `test_not_judged_has_no_percentiles` — empty `pe_history` → `pe_p25 is None`.
  - `test_views`: the existing detail-payload test asserts `growth_line`, `pe_p25`, `pe_p75` keys present with stored values.

- [ ] **Step 2: Run** `.venv/bin/python manage.py test verdicts` — Expected: FAIL (unknown fields).

- [ ] **Step 3: Implement.** Add the three model fields; `makemigrations verdicts`. In `_store`, parse `row.fundamentals_history.get('quarterly_eps', [])` into `(date, float)` and call `steps(..., today=timezone.localdate())`; percentiles from `rules._levels(row.pe_history)` (`None` when it returns `None`). Add the three keys to `_detail`.

- [ ] **Step 4: Run** `.venv/bin/python manage.py test verdicts` — Expected: PASS.

- [ ] **Step 5: Migrate dev DB and fill once.** `.venv/bin/python manage.py migrate verdicts && .venv/bin/python manage.py shell -c "from verdicts import compute; print(compute.run())"` — Expected: `Result(written=<N>, failed=[])`; `StockVerdict.objects.get(ticker='NVDA').growth_line[-1]['capped']` is `True`.

- [ ] **Step 6: Commit** `git add backend/verdicts && git commit -m "feat(verdicts): serve the growth line and P/E percentiles with the verdict"`

### Task 3: `lib/valueGuides.js` — readings, chip and sentence

**Files:**
- Create: `frontend/src/lib/valueGuides.js`, `frontend/src/lib/valueGuides.test.js`
- Delete: `frontend/src/lib/priceZones.js`, `frontend/src/lib/priceZones.test.js` (move the stop-loss/earnings `entrySentence` tests that still apply into the new test file)

**Interfaces:**
- Consumes: verdict detail payload (Task 2): `growth_line`, `pe_p25`, `pe_p75`, `current_pe`, `valuation`, `quality`, `action`.
- Produces:
  - `FAIR_BAND = 0.1`
  - `stepAt(line, date: 'YYYY-MM-DD') -> step | null` (latest step with `from <= date`; `null` before the first or for empty/null line)
  - `readPrice(close, step) -> 'cheap' | 'fair' | 'expensive' | 'priced_in' | null`
  - `peChip(verdict) -> { pe, low, high, position: 'below' | 'inside' | 'above' } | null` (null when `valuation === 'not_judged'` or any figure missing)
  - `growthSentence(step, close, currency) -> string`
  - `entrySentence({ verdict, price, plan, held, earnings, currency })` — same signature and return shape as today (`{word, tone, why, next, risk, earnings}`)

- [ ] **Step 1: Write failing tests** (vitest)

```js
const step = { from: '2026-08-30', price: 100, pe: 24, growth: 24.1, eps_ttm: 4.17, capped: false }
const capped = { ...step, pe: 30, growth: 167.4, capped: true }
it('reads cheap, fair and expensive around a ±10% band', () => {
  expect(readPrice(89, step)).toBe('cheap'); expect(readPrice(91, step)).toBe('fair')
  expect(readPrice(109, step)).toBe('fair'); expect(readPrice(111, step)).toBe('expensive')
})
it('never calls a capped line expensive', () => {
  expect(readPrice(89, capped)).toBe('cheap'); expect(readPrice(150, capped)).toBe('priced_in')
})
it('finds the step covering a date and nothing before the first', () => {
  const line = [{ ...step, from: '2026-01-10' }, { ...step, from: '2026-04-10', price: 120 }]
  expect(stepAt(line, '2026-01-09')).toBeNull()
  expect(stepAt(line, '2026-04-09').price).toBe(100)
  expect(stepAt(line, '2026-05-01').price).toBe(120)
  expect(stepAt([], '2026-05-01')).toBeNull(); expect(stepAt(null, '2026-05-01')).toBeNull()
})
it('places today\'s P/E against its usual range', () => {
  expect(peChip({ valuation: 'cheap', current_pe: 19.8, pe_p25: 45, pe_p75: 77 })).toEqual({ pe: 19.8, low: 45, high: 77, position: 'below' })
  expect(peChip({ valuation: 'not_judged', current_pe: 19.8, pe_p25: 45, pe_p75: 77 })).toBeNull()
})
it('words the growth line, capped or not', () => {
  expect(growthSentence(step, 118, 'USD')).toBe('Against its growth: earnings grew 24% a year over three years, which supports a P/E of 24, about $100.00. Price is +18% from that line, so fair.')
  expect(growthSentence(capped, 66, 'USD')).toBe('Against its growth: earnings grew 167% a year, more than a P/E of 30 assumes. At P/E 30 that is about $100.00; price is −34% below it, so cheap even on that floor.')
})
it('keeps the verdict word and why, and puts the growth view in next', () => {
  const s = entrySentence({ verdict: { action: 'buy', quality: 'strong', valuation: 'cheap', growth_line: [step] }, price: 118, currency: 'USD' })
  expect(s.why).toBe('Strong company, cheap price.')
  expect(s.next).toMatch(/^Against its growth/)
  expect(JSON.stringify(s)).not.toMatch(/opportunity|updates tonight/i)
})
it('says when there is no growth line', () => {
  expect(entrySentence({ verdict: { action: 'hold', quality: 'mixed', valuation: 'fair', growth_line: [] }, price: 50 }).next)
    .toBe('Too little earnings history for a growth line.')
})
```

(Use the repo's `fmtMoney` output for the dollar amounts; adjust the literal if `fmtMoney(100, 'USD')` formats differently, but keep the wording.)

- [ ] **Step 2: Run** `cd frontend && npx vitest run src/lib/valueGuides.test.js` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement** the five exports. `why` uses `verdict.valuation` (`not_judged` → "no valuation yet"); `next` uses `stepAt(verdict.growth_line, today's date)` with `price` — use the last step when `price` is today's close. Keep `riskLine`/`againstAverage` and earnings behaviour as they are in `priceZones.js`. Percent sign uses U+2212 for negatives as in the test.

- [ ] **Step 4: Run** — Expected: PASS. Then `npx vitest run` to list callers broken by the deleted module (fixed in Task 6).

- [ ] **Step 5: Commit** `git add -A frontend/src/lib && git commit -m "feat(research): growth-line readings, P/E chip and sentence in valueGuides"`

### Task 4: 52-week high and volume gaps (indicators + parity)

**Files:**
- Modify: `frontend/src/lib/indicators.js`, `frontend/src/lib/indicators.test.js`
- Create: `frontend/src/lib/fixtures/gap-parity.json`, `frontend/src/lib/gapParity.test.js`, `backend/signals/test_gap_parity.py`

**Interfaces:**
- Produces:
  - `HIGH_WINDOW = 252`, `rollingHigh(bars, window = HIGH_WINDOW) -> (number|null)[]` — `null` until `window` bars (inclusive) exist; max of `high`.
  - `GAP_BOX_SESSIONS = 60`, `GAP_LOOKBACK = 252`, `volumeGaps(bars) -> Array<{ index, up: boolean, from: number /* previous close */, to: number /* open */, end: number /* last index of the box */, filled: boolean, rvol: number }>` — only gaps with `index >= bars.length - GAP_LOOKBACK`; `end` = first later index whose low ≤ previous close (up) or high ≥ previous close (down), else `min(index + 60, bars.length - 1)`; `filled` true only in the first case.

- [ ] **Step 1: Write failing tests**
  - `rollingHigh`: 251 bars → all `null`; 253 bars → index 251 is max of highs 0..251, index 252 is max of 1..252.
  - `volumeGaps`: a synthetic series with 25 quiet bars (volume 100, close 10) then a bar open 10.5, close 10.4, volume 300 → one gap `{index: 25, up: true, from: 10, to: 10.5}`; a later bar with low 9.9 at index 30 → `end: 30, filled: true`; with no fill and only 40 bars → `end: 39, filled: false`; open 10.3 (3%) → no gap; close 10.2 (< 0.98 × open) → no gap up; open 9.5 on 3x volume → gap down.
  - `gapParity.test.js`: `volumeGaps` on `fixture.bars` (with `GAP_LOOKBACK` covering all) yields indices equal to `fixture.expected.gap_up` / `gap_down`.
  - `test_gap_parity.py` (`SimpleTestCase`): `definitions.detect(series.from_bars(rows))` on the same fixture → indices where `news_gap_up` / `news_gap_down` are true equal the fixture's lists.

- [ ] **Step 2: Build the fixture.** 120 bars, dates from 2025-01-01, deterministic (no random), containing at least two qualifying gap ups, one gap up that fails the hold rule, one gap down and one 3% non-gap. Compute `expected` from the Python `detect` output and write it to the JSON once.

- [ ] **Step 3: Run** `npx vitest run src/lib/indicators.test.js src/lib/gapParity.test.js` and `.venv/bin/python manage.py test signals.test_gap_parity` — Expected: frontend FAIL (missing exports), backend PASS (fixture built from it).

- [ ] **Step 4: Implement** `rollingHigh` and `volumeGaps` with the Global Constraints rules (volume average over the previous 20 bars including zeros, `|| 1`).

- [ ] **Step 5: Run** both commands — Expected: PASS.

- [ ] **Step 6: Commit** `git add frontend/src/lib backend/signals/test_gap_parity.py && git commit -m "feat(research): 52-week high and Signal Lab volume gaps for the chart"`

### Task 5: Draw the guides on the chart

**Files:**
- Modify: `frontend/src/components/research/ChartGuides.jsx` (remove `PriceZones`; add `GrowthLine`, `HighLine`, `GapBoxes`, `GuideTags`), `ChartGuides.test.jsx`, `TVChart.jsx` (`ChartBody` props and `TVChart` props), `ChartCanvas.jsx` (prop pass-through; `OhlcLegend` values)
- Test: `ChartGuides.test.jsx`, `ChartCanvas.test.jsx`

**Interfaces:**
- Consumes: `stepAt`, `readPrice` (Task 3); `rollingHigh`, `volumeGaps` (Task 4).
- Produces: `TVChart` / `ChartCanvas` props replace `priceZones`, `zoneCurrency` with `valueGuides = { line: step[] | null, high: boolean, gaps: boolean, currency }`; `tradePlan` unchanged.

- [ ] **Step 1: Write failing tests** (`ChartGuides.test.jsx`, rendering inside `<svg>` with a stub geometry as existing tests do)
  - `GrowthLine` draws one `path` with `stroke={colors.warn}` and no `rect` fill; steps before the first visible bar are clipped to it; nothing renders for `line=[]`.
  - `GuideTags`: a tag for the latest step reads `Growth-fair · P/E 24` (or `Growth floor · P/E 30+` when capped) with the price on the right axis; a value above the visible range renders at the top edge with an up marker; two tags 5px apart are pushed at least 16px apart.
  - `HighLine` renders nothing when the visible `rollingHigh` series is all `null`; its tag reads `52w high −35.7%` for close 156.38 and high 243.37.
  - `GapBoxes`: one `rect` per gap from `xAt(index)` to `xAt(end)`, between `from` and `to`; open gaps carry `strokeDasharray`; a label `Gap up 2.6x vol` appears on unfilled gaps.
  - `ChartCanvas`: hovering a bar with a covering step shows `P/E then`, `Growth-fair` and the reading in the legend.
  - No element in the chart has `data-testid="price-zones"`.

- [ ] **Step 2: Run** `npx vitest run src/components/research` — Expected: FAIL.

- [ ] **Step 3: Implement.** Tags sit in the `PAD_R` gutter like `PriceLines` badges (16px tall, `colors.tooltip.bg` fill, stroke in the guide colour), words to their left inside the plot; collisions resolved by sorting by y and pushing down by 17px. `GapBoxes` uses `colors.up`/`colors.down` at 0.12 (filled) / 0.22 (open) opacity. Guides render inside the existing clip group, before the candles; tags after. The price scale never includes guide values.

- [ ] **Step 4: Run** — Expected: PASS.

- [ ] **Step 5: Commit** `git commit -am "feat(research): draw the growth line, 52-week high and volume gaps on the chart"`

### Task 6: Wire it into Research — prefs, menu, chip, sentence

**Files:**
- Modify: `frontend/src/lib/chartPrefs.js`, `chartPrefs.test.js`, `frontend/src/components/research/chartMenus.jsx`, `ChartPanel.jsx`, `frontend/src/pages/Research.jsx`, `AnswerCard.test.jsx` (copy), any test still importing `priceZones`
- Create: `frontend/src/components/research/PeChip.jsx`, `PeChip.test.jsx`

**Interfaces:**
- Consumes: `peChip`, `entrySentence` (Task 3); `valueGuides` prop (Task 5).
- Produces: `DEFAULT_CHART_PREFS.guides = { value: true, high52: true, gaps: true, plan: false }`.

- [ ] **Step 1: Write failing tests**
  - `chartPrefs`: a stored blob `{ guides: { zones: false, plan: true } }` loads as `{ value: false, high52: true, gaps: true, plan: true }`; a blob without guides loads the defaults; non-boolean values are ignored (update the three existing guide tests).
  - `PeChip`: renders `P/E 19.8` and `below its usual 45–77`, a dot with `bg-up` for below, `bg-warn` for above, `bg-ink-3` for inside; renders nothing for a `null` chip; has a `title` starting "Today's P/E against the middle half".
  - Guides menu: lists `Value: growth line and P/E`, `52-week high`, `Volume gaps`, `Stop-loss`, each toggling its key.

- [ ] **Step 2: Run** `npx vitest run` — Expected: FAIL.

- [ ] **Step 3: Implement.** `sanitizeChartPrefs` maps `guides.zones` to `value` when `value` is absent. `GUIDES` copy: value → `['Value: growth line and P/E', 'The price its earnings growth supports, and P/E against its usual range']`, high52 → `['52-week high', 'The highest price of the past year and how far below it today is']`, gaps → `['Volume gaps', 'Big opening gaps on heavy volume, until filled or 60 sessions pass']`, plan unchanged. In `Research.jsx` the `guides` memo builds `available` (`value` only with a verdict; `high52`, `gaps` always for daily bars; `plan` as today), `valueGuides`, `chip: peChip(judged)`, and `answer` via the new `entrySentence`. `ChartPanel` renders `<PeChip chip={guides?.chip} />` in the toolbar's right-hand group before `PeriodChange` when `controls.guides.value` is on, and passes `valueGuides` to `ChartCanvas`.

- [ ] **Step 4: Run** `npx vitest run && npx eslint src && npm run build` — Expected: all pass, including `noPaletteClasses.test.js`.

- [ ] **Step 5: Commit** `git commit -am "feat(research): guides menu, P/E chip and growth sentence on the Research page"`

### Task 7: Records, Guide tab and visual review

**Files:**
- Modify: `docs/decisions.md` (rewrite the entry "The chart shows where the price is cheap or expensive for the company, in words, and nothing from the candles"), `frontend/src/components/research/GuideTab.jsx`, `GuideTab.test.jsx`

- [ ] **Step 1: Failing test** — `GuideTab` has a "Chart guides" section with four entries: Growth line, P/E chip, 52-week high, Volume gaps; the gaps entry says gap up held up and gap down "cannot be judged fairly".
- [ ] **Step 2: Implement** the section with `GuideMetric` rows; rewrite the decisions entry: growth line (rule, 30+ floor, one-off quarters, 35-day lag), chip on the verdict's percentiles, the two views can disagree by the owner's choice (2026-11-17), the two candle tools and why only they are drawn, patterns held back pending a graded test.
- [ ] **Step 3: Run** `npx vitest run src/components/research/GuideTab.test.jsx` — Expected: PASS.
- [ ] **Step 4: Visual review.** With the dev stack running from this worktree, follow the `saxodash-design-system` skill's screenshot harness: Research chart for NVDA, MSFT, GOOGL; Republic and Porcelain; 1400px and 390px. Check: no painted background; tags readable and not overlapping; growth line visible or edge-tagged; chip beside the price; sentence reads "Against its growth: …". Fix what shows, one pass.
- [ ] **Step 5: Full suites** `cd backend && .venv/bin/python manage.py test` and `cd frontend && npx vitest run` — Expected: all pass.
- [ ] **Step 6: Commit** `git commit -am "docs: chart value guides in decisions and the Guide tab"`
