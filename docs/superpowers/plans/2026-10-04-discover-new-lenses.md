# Discover New Lenses (spec Phase 4 lenses) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the spec's three Phase 4 lenses. **Yield 3%+** and **5-year EPS growth 15%+** go under Fundamentals. **Reporting in the next 7 days** goes under a new **Events** group. The scan fills the three fields they need: `revenue_growth_5y`, `payout_ratio` and `next_earnings_date`.

**Architecture:**
- Two fields come from the Finnhub `/stock/metric` response the scan already fetches, so they cost zero new calls:
  - `revenueGrowth5Y`
  - `payoutRatioTTM` (both keys verified in a live payload on 2026-10-04)
- `next_earnings_date` comes from **one** market-wide `/calendar/earnings` call after the per-symbol loop, covering today to today+14. A failure there is logged and leaves the stored dates untouched. It never fails the scan.
- Lenses stay declarative in `research/shelves.py`.
- A new criterion op, `within_days`, matches a date in `[today, today + N]`.
- The frontend gains two value formats: `date` and `pct_1`. The Events group renders through the existing `groups` machinery.

**Tech Stack:** Django + DRF (`TestCase`/`APITestCase`), Vite + React 19 JS, vitest.

**Spec:** `docs/superpowers/specs/2026-10-02-discover-lenses-design.md`
- §1 catalogue rows `dividend-yield`, `eps-growth` and `reporting-soon`
- §1 "Decided against": no debt/equity guard on the dividend lens
- §2 `within_days`
- the file table rows for `models.py` and `scan.py`, Phase 4

The user chose on 2026-10-04 to build the lenses only. The stock endpoint, banner, Compare and `DiscoverSnapshot` are out of scope.

## Global Constraints

- Zero code comments in new or edited code (AGENTS.md).
- **A new migration isn't done until `manage.py migrate` has run against the dev database** (AGENTS.md). Task 1 does this.
- A lens rule never matches a null metric (existing `matching` null-exclusion covers every criterion and sort field).
- No debt/equity criterion on the dividend lens. D/E and payout ratio are shown as card values only (spec "Decided against").
- One market-calendar call per scan, never per symbol (Finnhub free tier is 60/min).
- Lens text is generated from the criteria (subtitle and order sentence). It is never hand-written prose.
- Leave `frontend/src/pages/Transactions.jsx`, `frontend/src/lib/logos.js`, `logos.test.js` and the untracked `docs/superpowers/plans/2026-10-04-app-review-roadmap.md` / `2026-10-04-review-phase-1-backend.md` alone. They are unrelated user work.

## Review Focus

1. **Calendar call fails**, whether Finnhub is not configured, returns HTTP 429, or returns malformed JSON. The scan still returns its OK count, and every row keeps its previous `next_earnings_date` (Task 2 test).
2. **A symbol with two events in the window**, for example a stale and a confirmed date. The stored date is the earliest one that is today or later (Task 2 test).
3. **A stock whose stored date has passed.** It drops out of "Reporting in the next 7 days" even before the next scan clears it, because `within_days` is evaluated against today, not stored as a flag (Task 3 test).
4. **A dividend payer with a null payout ratio.** It still matches Yield 3%+, because payout is a card field, not a criterion, and its card shows `—` (Task 3 test).
5. **A date formatted for display must not slip a day in the browser's time zone.** `'2026-10-08'` renders as `8 Oct` everywhere (Task 4 test).

---

### Task 1: New fields, migration, Finnhub mapping

**Files:**
- Modify: `backend/research/models.py` (`ScreenerRow`)
- Create: `backend/research/migrations/0012_screenerrow_phase4_fields.py` (via `makemigrations`)
- Modify: `backend/research/finnhub.py` (`SCREENER_METRICS`)
- Test: `backend/research/test_scan.py` (or wherever `to_screener_fundamentals` is tested: `grep -rn to_screener_fundamentals backend/research/test_*.py`)

**Interfaces:**
- Produces: `ScreenerRow.revenue_growth_5y` (FloatField, null), `ScreenerRow.payout_ratio` (FloatField, null) and `ScreenerRow.next_earnings_date` (DateField, null). `SCREENER_METRICS` gains `'revenue_growth_5y': 'revenueGrowth5Y'` and `'payout_ratio': 'payoutRatioTTM'`.

- [ ] **Step 1: Write the failing test.** Next to the existing `to_screener_fundamentals` tests:

```python
    def test_screener_fundamentals_carry_revenue_growth_and_payout(self):
        shaped = finnhub.to_screener_fundamentals({'metric': {'revenueGrowth5Y': 7.75, 'payoutRatioTTM': 77.24}})
        self.assertEqual(shaped['revenue_growth_5y'], 7.75)
        self.assertEqual(shaped['payout_ratio'], 77.24)
```

And in `test_scan.py` `ScanUniverseTest`, with a module constant `FINANCIALS` extended or a local override:

```python
    def test_stores_revenue_growth_and_payout_from_the_same_metrics_call(self, search, chart, financials):
        financials.return_value = {'metric': {'peNormalizedAnnual': 20.0, 'revenueGrowth5Y': 12.5, 'payoutRatioTTM': 40.0}}
        self.search_for(search, {'AAPL': 211, 'BRK.B': 212})
        self.run_scan()
        aapl = ScreenerRow.objects.get(ticker='AAPL')
        self.assertEqual((aapl.revenue_growth_5y, aapl.payout_ratio), (12.5, 40.0))
        self.assertEqual(financials.call_count, 2)
```

- [ ] **Step 2: Run, expect FAIL.** Run `cd backend && .venv/bin/python manage.py test research.test_scan` plus the finnhub test module.
- [ ] **Step 3: Implement.**
  - Add the three model fields after `market_cap`:
    - `revenue_growth_5y = models.FloatField(null=True, blank=True)`
    - `payout_ratio = models.FloatField(null=True, blank=True)`
    - `next_earnings_date = models.DateField(null=True, blank=True)`
  - Add the two `SCREENER_METRICS` entries.
  - Run `cd backend && .venv/bin/python manage.py makemigrations research --name screenerrow_phase4_fields`.
  - If a `FUNDAMENTAL_FIELDS`-style tuple sits above `ScreenerRow` in `models.py` (it lists `'debt_to_equity', 'dividend_yield', 'market_cap'`) and drives the scan's "no half-new fundamentals" validation, add `revenue_growth_5y` and `payout_ratio` to it too. Check its uses first.
- [ ] **Step 4: Run, expect PASS.** Run the full `research` suite: `cd backend && .venv/bin/python manage.py test research`.
- [ ] **Step 5: Migrate the dev database.** Run `cd backend && .venv/bin/python manage.py migrate research`, then `.venv/bin/python manage.py migrate --check`. The second command must exit 0.
- [ ] **Step 6: Commit.** Run `git add` on the model, the migration, finnhub.py and the tests, then `git commit -m "feat: scan stores revenue growth, payout ratio and a next-earnings slot for the new Discover lenses"`.

---

### Task 2: Scan fills `next_earnings_date` from one calendar call

**Files:**
- Modify: `backend/research/scan.py`
- Test: `backend/research/test_scan.py`

**Interfaces:**
- Consumes: `finnhub.get_earnings_calendar(None, date_from, date_to)` → `{'earningsCalendar': [{'symbol', 'date': 'YYYY-MM-DD', …}]}`, and `ScreenerRow.next_earnings_date` (Task 1).
- Produces:
  - `scan.EARNINGS_WINDOW_DAYS = 14`
  - `scan.refresh_earnings_dates(today)`. It sets each row's `next_earnings_date` to its earliest calendar date in `[today, today + 14]`, or `None` when the symbol has no event in the window. On any exception it logs at WARNING with `exc_info` and changes nothing.
  - `scan_universe` calls it once after the per-symbol loop completes, inside the `try`, before `finally`, with `timezone.localdate()`.

- [ ] **Step 1: Write the failing tests.** The existing scan tests must not hit the network. In `ScanUniverseTest.setUp`, start a patcher. Don't add a class decorator, because that would shift every test's mock arguments:

```python
        calendar = mock.patch('research.scan.finnhub.get_earnings_calendar', return_value={'earningsCalendar': []})
        self.calendar = calendar.start()
        self.addCleanup(calendar.stop)
```

Then add a new test class:

```python
@override_settings(CACHES=LOCMEM)
class EarningsDatesTest(TestCase):
    today = date(2026, 10, 4)

    def setUp(self):
        for ticker in ('AAPL', 'KO', 'MSFT'):
            ScreenerRow.objects.create(ticker=ticker, name=ticker, indexes='SP500')

    def dates(self):
        return dict(ScreenerRow.objects.values_list('ticker', 'next_earnings_date'))

    @mock.patch('research.scan.finnhub.get_earnings_calendar')
    def test_each_stock_gets_its_earliest_upcoming_date_in_the_window(self, calendar):
        calendar.return_value = {'earningsCalendar': [
            {'symbol': 'AAPL', 'date': '2026-10-30'},
            {'symbol': 'AAPL', 'date': '2026-10-09'},
            {'symbol': 'KO', 'date': '2026-10-03'},
            {'symbol': 'ZZZZ', 'date': '2026-10-05'},
        ]}
        scan.refresh_earnings_dates(self.today)
        calendar.assert_called_once_with(None, '2026-10-04', '2026-10-18')
        self.assertEqual(self.dates(), {'AAPL': date(2026, 10, 9), 'KO': None, 'MSFT': None})

    @mock.patch('research.scan.finnhub.get_earnings_calendar')
    def test_a_stock_no_longer_in_the_calendar_loses_its_old_date(self, calendar):
        ScreenerRow.objects.filter(ticker='MSFT').update(next_earnings_date=date(2026, 10, 1))
        calendar.return_value = {'earningsCalendar': []}
        scan.refresh_earnings_dates(self.today)
        self.assertIsNone(self.dates()['MSFT'])

    @mock.patch('research.scan.finnhub.get_earnings_calendar', side_effect=FinnhubAPIError('429'))
    def test_a_failed_calendar_call_keeps_the_dates_it_had(self, calendar):
        ScreenerRow.objects.filter(ticker='AAPL').update(next_earnings_date=date(2026, 10, 9))
        with self.assertLogs('research.scan', level='WARNING'):
            scan.refresh_earnings_dates(self.today)
        self.assertEqual(self.dates()['AAPL'], date(2026, 10, 9))

    @mock.patch('research.scan.finnhub.get_earnings_calendar', return_value={'earningsCalendar': [{'symbol': 'AAPL', 'date': 'soon'}]})
    def test_a_malformed_calendar_keeps_the_dates_it_had(self, calendar):
        ScreenerRow.objects.filter(ticker='AAPL').update(next_earnings_date=date(2026, 10, 9))
        with self.assertLogs('research.scan', level='WARNING'):
            scan.refresh_earnings_dates(self.today)
        self.assertEqual(self.dates()['AAPL'], date(2026, 10, 9))
```

In `ScanUniverseTest`:

```python
    def test_fills_earnings_dates_once_after_the_symbols(self, search, chart, financials):
        self.search_for(search, {'AAPL': 211, 'BRK.B': 212})
        self.run_scan()
        self.calendar.assert_called_once()

    def test_a_failed_calendar_call_does_not_fail_the_scan(self, search, chart, financials):
        self.calendar.side_effect = FinnhubNotConfigured('no key')
        self.search_for(search, {'AAPL': 211, 'BRK.B': 212})
        with self.assertLogs('research.scan', level='WARNING'):
            self.assertEqual(self.run_scan(), 2)
```

Add `from datetime import date` to the imports. The second `ScanUniverseTest` test assumes both symbols scan OK with the class's mocks. Check `run_scan()`'s return value in an existing test and adjust the expected count if needed.

- [ ] **Step 2: Run, expect FAIL.** Run `cd backend && .venv/bin/python manage.py test research.test_scan`.
- [ ] **Step 3: Implement** in `scan.py`:

```python
EARNINGS_WINDOW_DAYS = 14


def _earliest_dates(events, today, until):
    earliest = {}
    for event in events:
        when = date.fromisoformat(event['date'])
        if today <= when <= until and (event['symbol'] not in earliest or when < earliest[event['symbol']]):
            earliest[event['symbol']] = when
    return earliest


def refresh_earnings_dates(today):
    until = today + timedelta(days=EARNINGS_WINDOW_DAYS)
    try:
        events = finnhub.get_earnings_calendar(None, today.isoformat(), until.isoformat()).get('earningsCalendar', [])
        earliest = _earliest_dates(events, today, until)
    except Exception:
        logger.warning('Earnings calendar refresh failed; keeping stored dates', exc_info=True)
        return
    with transaction.atomic():
        ScreenerRow.objects.exclude(ticker__in=earliest).update(next_earnings_date=None)
        for ticker, when in earliest.items():
            ScreenerRow.objects.filter(ticker=ticker).update(next_earnings_date=when)
```

Imports: `from datetime import date, timedelta` and `from django.db import transaction`. In `scan_universe`, after the `for` loop and still inside `try`, add `refresh_earnings_dates(timezone.localdate())`.

The broad `except Exception` is deliberate here. The spec says this step "never fails the scan", and it covers malformed payloads such as `KeyError` and `ValueError` from `fromisoformat`. Keep it confined to this one function.

- [ ] **Step 4: Run, expect PASS.** Run the full `research` suite.
- [ ] **Step 5: Commit.** Run `git commit -m "feat: scan records each stock's next earnings date from one market calendar call"`.

---

### Task 3: Lenses: `within_days`, Events group, three new lenses

**Files:**
- Modify: `backend/research/screener_fields.py`, `backend/research/shelves.py`
- Test: `backend/research/test_shelves.py`, `backend/research/test_discover_views.py`

**Interfaces:**
- Consumes: Task 1 fields.
- Produces:
  - **`FIELDS` additions:**
    - `'dividend_yield': Field('Dividend yield', 'Yield', '%', 'pct_1')`
    - `'payout_ratio': Field('Payout ratio', 'Payout', '%', 'pct')`
    - `'debt_to_equity': Field('Debt/equity', 'D/E', '', 'ratio')`
    - `'revenue_growth_5y': Field('5-year revenue growth', 'Rev 5Y', '%', 'signed_pct')`
    - `'next_earnings_date': Field('Next earnings', 'Reports', '', 'date')`
  - **`Criterion` op `'within_days'`:** `q()` returns `Q(**{f'{field}__gte': today, f'{field}__lte': today + timedelta(days=value)})` with `today = timezone.localdate()`. The phrase reads `Next earnings within 7 days`.
  - **`order(shelf)`:** for a field whose format is `'date'`, the direction words are `soonest` / `latest`, giving `Ordered by next earnings, soonest first`. Every other field keeps `lowest` / `highest`.
  - **`GROUPS`** gains `('events', 'Events')`.
  - **`SHELVES`** appends, in this order (they keep group order):
    - after `pe-under-15`: `dividend-yield`. Title `Dividend yield 3% or more`, short `Yield 3%+`, group `fundamentals`. Criteria `(Criterion('dividend_yield', 'gte', 3),)`. Sort `dividend_yield` descending. Card fields `('dividend_yield', 'payout_ratio', 'debt_to_equity')`.
    - then `eps-growth`. Title `5-year EPS growth 15% or more`, short `EPS growth`, group `fundamentals`. Criteria `(Criterion('eps_growth_5y', 'gte', 15), Criterion('revenue_growth_5y', 'gte', 10), Criterion('net_margin', 'gt', 0))`. Sort `eps_growth_5y` descending. Card fields `('eps_growth_5y', 'revenue_growth_5y', 'net_margin')`.
    - then `reporting-soon`. Title `Reporting in the next 7 days`, short `Reports soon`, group `events`. Criteria `(Criterion('next_earnings_date', 'within_days', 7),)`. Sort `next_earnings_date` ascending. Card fields `('next_earnings_date',)`.

- [ ] **Step 1: Write the failing tests** (in `test_shelves.py`, reusing `row` / `tickers`):

```python
class NewLensesTest(TestCase):
    def test_dividend_yield_needs_three_percent_and_ignores_debt(self):
        row('HIGH', dividend_yield=6.2, debt_to_equity=4.0)
        row('EDGE', dividend_yield=3.0)
        row('LOW', dividend_yield=2.9)
        row('NONE')
        self.assertEqual(tickers('dividend-yield'), ['HIGH', 'EDGE'])

    def test_a_dividend_payer_without_payout_ratio_still_matches_and_shows_a_gap(self):
        payer = row('KO', dividend_yield=3.1)
        reasons = shelves.reasons(payer, shelves.by_key('dividend-yield'))
        self.assertEqual([r['field'] for r in reasons], ['dividend_yield', 'payout_ratio', 'debt_to_equity'])
        self.assertIsNone(reasons[1]['value'])

    def test_eps_growth_needs_revenue_growth_and_a_profit(self):
        row('REAL', eps_growth_5y=20.0, revenue_growth_5y=12.0, net_margin=8.0)
        row('BUYBACK', eps_growth_5y=25.0, revenue_growth_5y=2.0, net_margin=8.0)
        row('LOSS', eps_growth_5y=30.0, revenue_growth_5y=15.0, net_margin=-1.0)
        row('FAST', eps_growth_5y=40.0, revenue_growth_5y=30.0, net_margin=20.0)
        self.assertEqual(tickers('eps-growth'), ['FAST', 'REAL'])

    def test_reporting_soon_is_today_through_seven_days_soonest_first(self):
        today = timezone.localdate()
        row('LATER', next_earnings_date=today + timedelta(days=7))
        row('TODAY', next_earnings_date=today)
        row('PAST', next_earnings_date=today - timedelta(days=1))
        row('FAR', next_earnings_date=today + timedelta(days=8))
        self.assertEqual(tickers('reporting-soon'), ['TODAY', 'LATER'])


class NewLensTextTest(TestCase):
    def test_within_days_reads_as_a_window(self):
        self.assertEqual(shelves.subtitle(shelves.by_key('reporting-soon')), 'Next earnings within 7 days')

    def test_a_date_order_reads_soonest_first(self):
        self.assertEqual(shelves.order(shelves.by_key('reporting-soon')), 'Ordered by next earnings, soonest first')

    def test_eps_growth_lists_every_test(self):
        self.assertEqual(
            shelves.subtitle(shelves.by_key('eps-growth')),
            '5-year EPS growth ≥ 15% · 5-year revenue growth ≥ 10% · Net margin > 0%',
        )
```

Imports: `from datetime import timedelta`, `from django.utils import timezone`. Update `CatalogueTest.test_keys_are_unique_and_retired_keys_are_gone` to the new key list, appending `'dividend-yield', 'eps-growth', 'reporting-soon'`. The existing `test_shelves_follow_group_order`, `test_cards_show_between_one_and_four_values` and `test_every_field_a_lens_uses_is_described` must pass unchanged.

In `test_discover_views.py` add:

```python
    def test_events_is_a_group_of_its_own(self):
        response = self.client.get(reverse('research-discover'))
        self.assertEqual([g['key'] for g in response.data['groups']], ['price', 'fundamentals', 'events'])
        soon = next(s for s in response.data['shelves'] if s['key'] == 'reporting-soon')
        self.assertEqual(soon['group'], 'events')
```

Also check that any test asserting the exact list of shelf keys in the Discover payload still matches. Update it the same way.

- [ ] **Step 2: Run, expect FAIL.** Run `cd backend && .venv/bin/python manage.py test research.test_shelves research.test_discover_views`.
- [ ] **Step 3: Implement.**
  - Add the `FIELDS` entries.
  - `Criterion.q()` branches on `self.op == 'within_days'`.
  - `_phrase` handles `within_days` as `f'{FIELDS[c.field].label} within {_number(c.value)} days'`. Keep `SYMBOLS` for the comparison ops only. Make sure `_bounds` never pairs a `within_days` criterion: its op is in neither set, but check that `(op in LOWER_BOUNDS) != …` cannot treat it as an upper bound by accident. If it can, add `and first.op in SYMBOLS and second.op in SYMBOLS` to `_bounds`.
  - `order()` picks `('soonest', 'latest')` when `FIELDS[shelf.sort].format == 'date'`.
  - Extend `GROUPS` and `SHELVES`.
  - Imports: `from datetime import timedelta` and `from django.utils import timezone`.
- [ ] **Step 4: Run, expect PASS.** Run the full backend suite once: `cd backend && .venv/bin/python manage.py test`.
- [ ] **Step 5: Commit.** Run `git commit -m "feat: Discover gains Yield 3%+, EPS growth and Reporting in the next 7 days"`.

---

### Task 4: Frontend formats `date` and `pct_1`

**Files:**
- Modify: `frontend/src/lib/discover.js` (`FIELD_FORMATS`)
- Test: `frontend/src/lib/discover.test.js`, `frontend/src/pages/Discover.test.jsx`

**Interfaces:**
- Produces:
  - `formatFieldValue('date', '2026-10-08') → '8 Oct'`. It splits the ISO date into parts and builds it with `new Date(Date.UTC(y, m - 1, d))` formatted with `timeZone: 'UTC'`, so it never shifts a day.
  - `formatFieldValue('pct_1', 3.14) → '3.1%'`, using `fmtPct(v, { sign: false, decimals: 1 })`.
  - Null still renders `—`.

- [ ] **Step 1: Write the failing tests** in `discover.test.js`:

```js
describe('date and one-decimal percentage formats', () => {
  it('shows a calendar date without shifting it across time zones', () => {
    expect(formatFieldValue('date', '2026-10-08')).toBe('8 Oct')
    expect(formatFieldValue('date', '2026-01-01')).toBe('1 Jan')
  })

  it('shows a yield to one decimal without a sign', () => {
    expect(formatFieldValue('pct_1', 3.14154)).toBe('3.1%')
  })

  it('keeps the gap for a missing value', () => {
    expect(formatFieldValue('date', null)).toBe('—')
    expect(formatFieldValue('pct_1', null)).toBe('—')
  })
})
```

In `Discover.test.jsx`, add a test where `groups` includes `{ key: 'events', title: 'Events' }` and a `reporting-soon` shelf (group `events`). Its card carries `reasons: [{ field: 'next_earnings_date', label: 'Reports', value: '2026-10-08', format: 'date' }]`. Assert that an h2 "Events" renders and that the card's reasons list reads `Reports 8 Oct`.

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Add to `FIELD_FORMATS`:

```js
  pct_1: (v) => fmtPct(v, { sign: false, decimals: 1 }),
  date: (v) => {
    const [year, month, day] = String(v).split('-').map(Number)
    return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  },
```

- [ ] **Step 4: Run, expect PASS.** Run the full suite once, then `cd frontend && npx eslint src`.
- [ ] **Step 5: Commit.** Run `git commit -m "feat: Discover shows earnings dates and yields in their own formats"`.

---

### Task 5: Live verification (controller)

- [ ] Run `cd backend && .venv/bin/python manage.py migrate --check`. It must exit 0.
- [ ] Run one scan with the new code. The dev celery worker still runs old code until it is restarted, so run `cd backend && .venv/bin/python manage.py scan_universe` in the background, about 10 minutes. Confirm afterwards:
  - `ScreenerRow` counts with non-null `revenue_growth_5y`, `payout_ratio` and `next_earnings_date`
  - the three new lens totals
  - Yield 3%+ is near the spec's calibration (~127)
  - EPS growth is below 143, since the revenue test was added
- [ ] Take screenshots of `/discover` at 1440px and 390px in both views. Check the Events group, the `Reports 8 Oct` reason, `Yield 3.1%` and the chips.
- [ ] Tell the user to restart the celery worker (or `scripts/dev.sh`) so nightly scans use the new code.
