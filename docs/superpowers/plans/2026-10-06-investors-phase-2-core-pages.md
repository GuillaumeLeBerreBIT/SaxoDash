# Famous investors — Phase 2 (Core pages) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 13F data visible: an **Investors** sidebar entry, an `/investors` overview (investor list with Cards/Table, filters, search, sort, and a snapshot panel with a Grid/Donut/List top-10), and an `/investors/:slug` page with a quarter picker and the Holdings and Changes tabs.

**Architecture:** Three small backend additions on top of Phase 1 (a turnover figure, a few more header facts, a `?holds=` filter and a `/changes/` endpoint), then a frontend slice that follows the app's existing layering: `api/client/investors.js` → `api/queries/investors.js` → pure helpers in `lib/investors.js` → presentational components in `components/investors/` → two pages. Everything renders through the design-system primitives in `components/ui.jsx`.

**Tech Stack:** Django + DRF (backend); Vite + React 19 (JavaScript), React Router, TanStack Query, Recharts, Tailwind, Lucide, Vitest + Testing Library (frontend).

**Spec:** `docs/superpowers/specs/2026-10-04-famous-investors-design.md` — this plan is its **Build phase 2 (Core pages)**. The agreed layout is the mockup at https://claude.ai/artifact/PVYiFZfym6oN76ENLKbwT4 (example data; a starting point).

## Global Constraints

- Generated code carries **zero comments**, tests included (AGENTS.md).
- Backend tests: `cd backend && .venv/bin/python manage.py test investors -v 1`. Frontend: `cd frontend && npx vitest run <paths>`, `npx eslint <touched files>`, `npm run build`.
- Read `docs/design-system.md` before any UI task. `Card` is the one container language; use `PageHeader`, `CardHeader`, `StatStrip`/`StatRow`, `Th`/`Td`/`Tr`, `TBtn`, `Badge`, `Button`, `Input`, `Select`, `TabList`/`TabButton`, `EmptyState`, `Alert`, `Skeleton`, `InstrumentLogo`, `InfoTip` from `components/ui.jsx`. No hand-rolled equivalents, no inline gain/loss hex.
- **Change badges describe without judging:** *New* in the accent blue (`Badge tone="blue"`), *Sold out* in amber (`tone="amber"`), *Added ▲ n%* and *Trimmed ▼ n%* neutral (`tone="zinc"`) with arrow and text. No gain/loss green or red anywhere on these pages.
- **Copy describes, never recommends:** no rank numbers, scores or "smart money" wording. "Held by 7 of 19" style counts only.
- Every page states the 13F limits line: *13F shows US-listed long positions and listed options at quarter end only. No shorts, cash or non-US holdings, and no trades inside the quarter. Values are as of quarter end.*
- Values are **USD as filed**, never converted to EUR and never priced live (Saxo-only price rule; no "performance since filing").
- An absent figure renders as `—` (`UNKNOWN` from `lib/format.js`), never as zero.
- Weights from the API are percent numbers (`22.04`) — format with `fmtPct(x, { sign: false, decimals: 1 })`.
- A holding with no ticker (unresolved CUSIP) shows the issuer name and has **no** Research link.
- Research handoff uses `researchHref(ticker, 'overview')` from `lib/research.js`.
- Per-browser preferences go through `localStorage` wrapped in `try/catch` (see `lib/chartPrefs.js`).
- Layout must work at 390 px wide: tiles drop to 2 columns, tables scroll horizontally inside their card.

### Rulings made while planning

1. **Phase 4 pieces stay out:** the *Add investor* button and dialog, the *Added by you* filter chip, "Search EDGAR for it", *Stop tracking*, and the Shared holdings / Most added / Overlap with you panels all ship with Phase 4. A button that cannot work yet is an anti-pattern in this repo (`Button` doc comment), and the *Added by you* chip would always be empty. Phase 2 chips: *All / Curated / Stopped filing*.
2. **Turnover** (stats strip) is defined as *value of positions opened this quarter + value of positions closed (at last quarter's value), divided by both quarters' combined value*, in percent, 2 places; `null` for an investor's first stored quarter. It needs no prices, is bounded 0–100, and ignores size changes inside kept positions. The UI explains it in an `InfoTip`.
3. **Change value deltas** are `value_now − value_before` as filed, so they include price movement; the Changes tab always shows the share change next to them so a price-driven delta is not mistaken for buying.
4. **"Held ticker" search** uses a new `GET /api/investors/?holds=TICKER` filter (exact ticker, latest quarter) rather than shipping every holding to the browser.
5. The donut reuses `AllocationDonut`, extended with an optional centre read-out and legend note; its default behaviour is unchanged for existing callers.
6. Top-10 view (Grid/Donut/List) is remembered per browser; the Cards/Table layout is not (spec only asks for the former).

## Review Focus

1. **An investor with nothing imported yet, or a first stored quarter** — cards, snapshot, stats and Changes tab must render with dashes and an explanatory empty state, never crash or show `+0 · −0`. Pinned in Tasks 2, 3, 6, 9, 11.
2. **Unresolved CUSIPs (`ticker: null`)** — logo fallback, issuer name, no Research link, no crash in donut/grid/table. Pinned in Tasks 5, 7, 8.
3. **A filer with ≤ 10 positions** (Pabrai has ~4) — no "Other" slice, no "Remaining 0 positions" line. Pinned in Tasks 5, 8.
4. **A stopped filer (Scion)** — card and snapshot say "No 13F since Q3 2025" and still show the last portfolio. Pinned in Tasks 6, 9, 10.
5. **Very large portfolios (Bridgewater ~1,000 rows)** — the Holdings tab pages 15 + 25 at a time and filters client-side without re-fetching. Pinned in Task 11.

---

## File Structure

```
backend/investors/
  changes.py                    modify: turnover()
  summaries.py                  modify: shared quarter comparison; card.top10_weight; detail.new_count/exited_count/turnover/filed_on; changes_payload(); holds_ticker()
  views.py, urls.py             modify: ?holds= on list; InvestorChangesView
  test_changes.py, test_list_api.py, test_detail_api.py   modify
  test_changes_api.py           create
frontend/src/
  api/client/investors.js       create   (+ export from api/client/index.js)
  api/queries/investors.js      create   (+ export + keys merge in api/queries/index.js)
  api/queries/investors.test.jsx create
  lib/investors.js              create   pure helpers (labels, formatting, filters, sorts, donut slices, view pref)
  lib/investors.test.js         create
  lib/charts.js                 modify: colorForRank()
  components/AllocationDonut.jsx modify: optional `center` + legend `note`
  components/AllocationDonut.test.jsx create
  components/investors/
    ChangeBadge.jsx, HoldingBadges.jsx, WeightBar.jsx, InvestorStats.jsx      (+ tests)
    HoldingsTable.jsx                                                         (+ test)
    TopHoldings.jsx                                                           (+ test)
    SnapshotPanel.jsx                                                         (+ test)
    InvestorToolbar.jsx, InvestorCards.jsx, InvestorTable.jsx                 (+ tests via page)
    HoldingsTab.jsx, ChangesTab.jsx                                           (+ tests)
    LimitsNote.jsx
  pages/Investors.jsx, pages/Investors.test.jsx    create
  pages/Investor.jsx,  pages/Investor.test.jsx     create
  App.jsx                       modify: two routes
  components/Sidebar.jsx        modify: Investors entry
```

---

### Task 1: Turnover in the change rule's home

**Files:**
- Modify: `backend/investors/changes.py`
- Test: `backend/investors/test_changes.py`

**Interfaces:**
- Produces: `changes.turnover(current_values: dict[key,int], previous_values: dict[key,int] | None, new_keys: list[key], sold_out_keys: list[key]) -> float | None`

- [ ] **Step 1: Write the failing tests** — append to `backend/investors/test_changes.py`:

```python
class TurnoverTest(SimpleTestCase):
    def test_a_first_quarter_has_no_turnover(self):
        self.assertIsNone(changes.turnover({AAPL: 100}, None, [], []))

    def test_counts_opened_and_closed_value_against_both_quarters(self):
        current = {AAPL: 700, AAPL_CALL: 300}
        previous = {AAPL: 600, ALLY: 400}
        self.assertEqual(changes.turnover(current, previous, [AAPL_CALL], [ALLY]), 35.0)

    def test_a_portfolio_kept_whole_has_zero_turnover(self):
        self.assertEqual(changes.turnover({AAPL: 700}, {AAPL: 600}, [], []), 0.0)

    def test_an_empty_pair_of_quarters_has_no_turnover(self):
        self.assertIsNone(changes.turnover({}, {}, [], []))
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test investors.test_changes -v 2`
Expected: `AttributeError: module 'investors.changes' has no attribute 'turnover'`.

- [ ] **Step 3: Implement** — append to `backend/investors/changes.py`:

```python
def turnover(current_values, previous_values, new_keys, sold_out_keys):
    if previous_values is None:
        return None
    combined = sum(current_values.values()) + sum(previous_values.values())
    if not combined:
        return None
    replaced = sum(current_values[key] for key in new_keys) + sum(previous_values[key] for key in sold_out_keys)
    return round(replaced / combined * 100, 2)
```

- [ ] **Step 4: Run the tests** — same command. Expected: all pass (17 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/investors/changes.py backend/investors/test_changes.py
git commit -m "feat(investors): turnover between two stored quarters"
```

---

### Task 2: Header facts for the stats strip, top-10 share on cards, `?holds=` filter

**Files:**
- Modify: `backend/investors/summaries.py` (full replacement below), `backend/investors/views.py`
- Test: `backend/investors/test_list_api.py`, `backend/investors/test_detail_api.py`

**Interfaces:**
- Consumes: `changes.turnover` (Task 1).
- Produces:
  - card gains `top10_weight` (float | None)
  - detail gains `filed_on` (iso | None, latest filing date stored for that quarter), `new_count`, `exited_count`, `turnover` (all None for a first stored quarter or an empty investor)
  - `summaries.holds_ticker(investor, ticker: str) -> bool` (latest quarter, case-insensitive exact ticker)
  - `GET /api/investors/?holds=AAPL` returns only the cards of investors whose latest quarter holds AAPL
  - internal helpers later tasks reuse: `_resolve_quarter(ends, quarter_end) -> (quarter_end, previous)`, `_comparison(investor, quarter_end, previous) -> (snap, previous_snap, per_key, sold_out)`, `_values(snap)`, `_weight(value, total)`

- [ ] **Step 1: Write the failing tests**

Append to `InvestorListApiTest` in `backend/investors/test_list_api.py`:

```python
    def test_a_card_carries_the_top_ten_share(self):
        investor = make_investor(last_filing_at=date(2026, 8, 14))
        store_quarter(investor, Q2, [('037833100', 'APPLE INC', 10, 600), ('02005N100', 'ALLY', 5, 400)])

        self.assertEqual(self.card('berkshire-hathaway')['top10_weight'], 100.0)

    def test_an_empty_investor_has_no_top_ten_share(self):
        make_investor()
        self.assertIsNone(self.card('berkshire-hathaway')['top10_weight'])

    def test_holds_lists_only_investors_whose_latest_quarter_has_the_ticker(self):
        berkshire = make_investor()
        pershing = make_investor(name='Bill Ackman', firm='Pershing Square', cik=1336528, slug='pershing-square')
        store_quarter(berkshire, Q2, [('037833100', 'APPLE INC', 10, 500)])
        store_quarter(pershing, Q1, [('037833100', 'APPLE INC', 10, 500)])
        store_quarter(pershing, Q2, [('02005N100', 'ALLY', 5, 400)])
        Security.objects.create(cusip='037833100', ticker='AAPL')

        slugs = [card['slug'] for card in self.client.get(self.url, {'holds': 'aapl'}).data]

        self.assertEqual(slugs, ['berkshire-hathaway'])
```

Append to `InvestorDetailApiTest` in `backend/investors/test_detail_api.py`:

```python
    def test_the_stats_strip_facts_compare_against_the_previous_quarter(self):
        data = self.client.get(self.url()).data

        self.assertEqual((data['new_count'], data['exited_count']), (2, 1))
        self.assertEqual(data['turnover'], 30.95)
        self.assertEqual(data['filed_on'], '2026-08-14')

    def test_a_first_quarter_has_no_comparison_facts(self):
        data = self.client.get(self.url(), {'quarter': '2026-03-31'}).data

        self.assertEqual((data['new_count'], data['exited_count'], data['turnover']), (None, None, None))
        self.assertEqual(data['filed_on'], '2026-05-15')

    def test_an_empty_investor_has_no_stats_strip_facts(self):
        make_investor(name='Bill Ackman', firm='Pershing Square', cik=1336528, slug='pershing-square')

        data = self.client.get(self.url('pershing-square')).data

        self.assertEqual(
            (data['filed_on'], data['new_count'], data['exited_count'], data['turnover']),
            (None, None, None, None),
        )
```

(Fixture arithmetic: Q2 new keys NVDA 200 + NVDA CALL 50, sold out ALLY 400 → 650 / (1000 + 1100) = 30.95 %. `store_quarter` files 45 days after quarter end: Q2 → 2026-08-14, Q1 → 2026-05-15.)

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test investors.test_list_api investors.test_detail_api -v 2`
Expected: `KeyError: 'top10_weight'` / `KeyError: 'new_count'` and the holds test returning both investors.

- [ ] **Step 3: Replace `backend/investors/summaries.py`** (keeps every existing behaviour; adds the new facts and shared helpers):

```python
from datetime import timedelta

from django.db.models import Max

from portfolio.models import Position
from research.models import WatchlistItem

from . import changes, importer, quarters, sectors
from .models import Security

STALE_AFTER = timedelta(days=183)
TOP_HOLDINGS = 3
TOP_TEN = 10


def tickers_for(cusips):
    return dict(Security.objects.filter(cusip__in=list(cusips)).values_list('cusip', 'ticker'))


def _weight(value, total):
    return round(value / total * 100, 2) if total else 0.0


def weighted(snap, tickers):
    total = sum(row['value'] for row in snap.values())
    rows = [
        {**row, 'ticker': tickers.get(row['cusip']), 'weight': _weight(row['value'], total)}
        for row in snap.values()
    ]
    return sorted(rows, key=lambda row: (-row['value'], row['cusip'], row['put_call']))


def is_stale(investor, today):
    return investor.last_filing_at is not None and today - investor.last_filing_at > STALE_AFTER


def _shares(snap):
    return {key: row['shares'] for key, row in snap.items()}


def _values(snap):
    return {key: row['value'] for key, row in snap.items()}


def _top10(rows):
    return round(sum(row['weight'] for row in rows[:TOP_TEN]), 2)


class QuarterNotFound(Exception):
    pass


def _header(investor, today):
    return {
        'name': investor.name,
        'firm': investor.firm,
        'slug': investor.slug,
        'blurb': investor.blurb,
        'curated': investor.curated,
        'last_filing_at': investor.last_filing_at.isoformat() if investor.last_filing_at else None,
        'stale': is_stale(investor, today),
        'import': importer.progress(investor),
    }


def _yours():
    owned = {ticker.upper() for ticker in Position.objects.values_list('ticker', flat=True)}
    watched = {symbol.upper() for symbol in WatchlistItem.objects.values_list('symbol', flat=True)}
    return owned, watched


def _resolve_quarter(ends, quarter_end):
    quarter_end = quarter_end or ends[0]
    if quarter_end not in ends:
        raise QuarterNotFound(quarter_end)
    position = ends.index(quarter_end)
    previous = ends[position + 1] if position + 1 < len(ends) else None
    return quarter_end, previous


def _comparison(investor, quarter_end, previous):
    snap = quarters.snapshot(investor, quarter_end)
    previous_snap = quarters.snapshot(investor, previous) if previous else None
    previous_shares = _shares(previous_snap) if previous_snap is not None else None
    per_key, sold_out = changes.compare(_shares(snap), previous_shares)
    return snap, previous_snap, per_key, sold_out


def _movement(snap, previous_snap, per_key, sold_out):
    if previous_snap is None:
        return {'new_count': None, 'exited_count': None, 'turnover': None}
    new_keys = [key for key, change in per_key.items() if change[0] == changes.NEW]
    return {
        'new_count': len(new_keys),
        'exited_count': len(sold_out),
        'turnover': changes.turnover(_values(snap), _values(previous_snap), new_keys, sold_out),
    }


def _filed_on(investor, quarter_end):
    latest = investor.filings.filter(quarter_end=quarter_end).aggregate(latest=Max('filed_on'))['latest']
    return latest.isoformat() if latest else None


def holds_ticker(investor, ticker):
    ends = quarters.quarter_ends(investor)
    if not ends:
        return False
    cusips = {row['cusip'] for row in quarters.snapshot(investor, ends[0]).values()}
    return Security.objects.filter(cusip__in=cusips, ticker__iexact=ticker).exists()


def card(investor, today):
    ends = quarters.quarter_ends(investor)
    base = {
        **_header(investor, today),
        'latest_quarter': None,
        'total_value': None,
        'positions': None,
        'top10_weight': None,
        'top_holdings': [],
        'new_count': None,
        'exited_count': None,
    }
    if not ends:
        return base

    quarter_end, previous = _resolve_quarter(ends, None)
    snap, previous_snap, per_key, sold_out = _comparison(investor, quarter_end, previous)
    rows = weighted(snap, tickers_for(row['cusip'] for row in snap.values()))
    movement = _movement(snap, previous_snap, per_key, sold_out)
    base.update({
        'latest_quarter': quarter_end.isoformat(),
        'total_value': sum(row['value'] for row in rows),
        'positions': len(rows),
        'top10_weight': _top10(rows),
        'top_holdings': [
            {'cusip': row['cusip'], 'ticker': row['ticker'], 'issuer': row['issuer'], 'weight': row['weight']}
            for row in rows[:TOP_HOLDINGS]
        ],
        'new_count': movement['new_count'],
        'exited_count': movement['exited_count'],
    })
    return base


def detail(investor, quarter_end, today):
    ends = quarters.quarter_ends(investor)
    base = {
        **_header(investor, today),
        'quarters': [end.isoformat() for end in ends],
        'quarter': None,
        'previous_quarter': None,
        'filed_on': None,
        'total_value': None,
        'positions': None,
        'top10_weight': None,
        'new_count': None,
        'exited_count': None,
        'turnover': None,
        'holdings': [],
    }
    if not ends:
        return base
    quarter_end, previous = _resolve_quarter(ends, quarter_end)
    snap, previous_snap, per_key, sold_out = _comparison(investor, quarter_end, previous)
    rows = weighted(snap, tickers_for(row['cusip'] for row in snap.values()))
    held = quarters.quarters_held(quarters.held_keys_by_quarter(investor), quarter_end)
    owned, watched = _yours()

    holdings = []
    for row in rows:
        key = (row['cusip'], row['put_call'])
        change = per_key[key]
        ticker = row['ticker']
        holdings.append({
            'cusip': row['cusip'],
            'ticker': ticker,
            'issuer': row['issuer'],
            'class': row['title_of_class'],
            'put_call': row['put_call'],
            'amount_type': row['amount_type'],
            'shares': row['shares'],
            'value': row['value'],
            'weight': row['weight'],
            'change': change[0] if change else None,
            'shares_change_pct': change[1] if change else None,
            'quarters_held': held.get(key, 1),
            'sector': sectors.sector_for(ticker),
            'owned': bool(ticker) and ticker.upper() in owned,
            'watched': bool(ticker) and ticker.upper() in watched,
        })

    base.update({
        'quarter': quarter_end.isoformat(),
        'previous_quarter': previous.isoformat() if previous else None,
        'filed_on': _filed_on(investor, quarter_end),
        'total_value': sum(row['value'] for row in rows),
        'positions': len(rows),
        'top10_weight': _top10(rows),
        **_movement(snap, previous_snap, per_key, sold_out),
        'holdings': holdings,
    })
    return base
```

In `backend/investors/views.py` replace `InvestorListView.get` with:

```python
class InvestorListView(APIView):
    def get(self, request):
        today = date.today()
        investors = Investor.objects.all()
        holds = request.query_params.get('holds', '').strip()
        if holds:
            investors = [investor for investor in investors if summaries.holds_ticker(investor, holds)]
        return Response([summaries.card(investor, today) for investor in investors])
```

- [ ] **Step 4: Run the investors suite**

Run: `cd backend && .venv/bin/python manage.py test investors -v 1`
Expected: all pass (existing card/detail tests unchanged plus the 6 new ones).

- [ ] **Step 5: Commit**

```bash
git add backend/investors/summaries.py backend/investors/views.py backend/investors/test_list_api.py backend/investors/test_detail_api.py
git commit -m "feat(investors): stats-strip facts, top-10 share on cards and a holds filter"
```

---

### Task 3: `GET /api/investors/<slug>/changes/?quarter=`

**Files:**
- Modify: `backend/investors/summaries.py` (append), `backend/investors/views.py`, `backend/investors/urls.py`
- Create: `backend/investors/test_changes_api.py`

**Interfaces:**
- Consumes: `_resolve_quarter`, `_comparison`, `_values`, `_weight`, `tickers_for`, `QuarterNotFound` (Task 2).
- Produces: `summaries.changes_payload(investor, quarter_end) -> dict` and URL name `investor-changes`. Payload: `{quarter, previous_quarter, new: [...], added: [...], trimmed: [...], sold_out: [...]}`; each item `{cusip, put_call, ticker, issuer, shares, previous_shares, shares_change_pct, value, previous_value, value_change, weight, previous_weight}`; groups sorted by `abs(value_change)` desc; a first stored quarter or empty investor returns empty groups with `previous_quarter: null`.

- [ ] **Step 1: Write the failing tests** — `backend/investors/test_changes_api.py`:

```python
from datetime import date

from django.contrib.auth.models import User
from django.urls import reverse
from rest_framework.test import APITestCase

from .factories import make_investor, store_quarter
from .models import Security

Q1 = date(2026, 3, 31)
Q2 = date(2026, 6, 30)


class InvestorChangesApiTest(APITestCase):
    def setUp(self):
        self.client.force_authenticate(User.objects.create_user('me', password='x'))
        self.investor = make_investor()
        store_quarter(self.investor, Q1, [
            ('037833100', 'APPLE INC', 100, 600), ('02005N100', 'ALLY FINL INC', 5, 400),
            ('084670702', 'BERKSHIRE HATHAWAY INC', 10, 100),
        ])
        store_quarter(self.investor, Q2, [
            ('037833100', 'APPLE INC', 110, 700), ('67066G104', 'NVIDIA CORP', 1, 200),
            ('67066G104', 'NVIDIA CORP', 1, 50, 'CALL'), ('084670702', 'BERKSHIRE HATHAWAY INC', 10, 50),
        ])
        Security.objects.create(cusip='037833100', ticker='AAPL')
        Security.objects.create(cusip='67066G104', ticker='NVDA')

    def url(self, slug='berkshire-hathaway'):
        return reverse('investor-changes', args=[slug])

    def test_groups_new_added_trimmed_and_sold_out_with_value_changes(self):
        data = self.client.get(self.url()).data

        self.assertEqual((data['quarter'], data['previous_quarter']), ('2026-06-30', '2026-03-31'))
        self.assertEqual([(i['ticker'], i['put_call'], i['value_change']) for i in data['new']],
                         [('NVDA', '', 200), ('NVDA', 'CALL', 50)])
        self.assertEqual(data['added'], [{
            'cusip': '037833100', 'put_call': '', 'ticker': 'AAPL', 'issuer': 'APPLE INC',
            'shares': 110, 'previous_shares': 100, 'shares_change_pct': 10.0,
            'value': 700, 'previous_value': 600, 'value_change': 100,
            'weight': 70.0, 'previous_weight': 54.55,
        }])
        self.assertEqual(data['trimmed'], [])

    def test_a_sold_out_position_comes_from_the_previous_quarter(self):
        sold = self.client.get(self.url()).data['sold_out']

        self.assertEqual(sold, [{
            'cusip': '02005N100', 'put_call': '', 'ticker': None, 'issuer': 'ALLY FINL INC',
            'shares': None, 'previous_shares': 5, 'shares_change_pct': -100.0,
            'value': None, 'previous_value': 400, 'value_change': -400,
            'weight': None, 'previous_weight': 36.36,
        }])

    def test_a_kept_position_with_unchanged_shares_is_in_no_group(self):
        data = self.client.get(self.url()).data
        listed = {i['cusip'] for group in ('new', 'added', 'trimmed', 'sold_out') for i in data[group]}
        self.assertNotIn('084670702', listed)

    def test_a_first_stored_quarter_has_nothing_to_compare(self):
        data = self.client.get(self.url(), {'quarter': '2026-03-31'}).data

        self.assertEqual((data['quarter'], data['previous_quarter']), ('2026-03-31', None))
        self.assertEqual([data[g] for g in ('new', 'added', 'trimmed', 'sold_out')], [[], [], [], []])

    def test_an_empty_investor_answers_empty(self):
        make_investor(name='Bill Ackman', firm='Pershing Square', cik=1336528, slug='pershing-square')

        data = self.client.get(self.url('pershing-square')).data

        self.assertEqual((data['quarter'], data['previous_quarter'], data['new']), (None, None, []))

    def test_a_quarter_not_stored_is_404(self):
        self.assertEqual(self.client.get(self.url(), {'quarter': '2025-12-31'}).status_code, 404)

    def test_a_malformed_quarter_is_400(self):
        self.assertEqual(self.client.get(self.url(), {'quarter': 'Q2'}).status_code, 400)

    def test_an_unknown_investor_is_404(self):
        self.assertEqual(self.client.get(self.url('nobody')).status_code, 404)
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test investors.test_changes_api -v 2`
Expected: `NoReverseMatch: 'investor-changes'`.

- [ ] **Step 3: Implement** — append to `backend/investors/summaries.py`:

```python
CHANGE_GROUPS = (changes.NEW, changes.ADDED, changes.TRIMMED, changes.SOLD_OUT)


def _side(row, total):
    if row is None:
        return None, None, None
    return row['shares'], row['value'], _weight(row['value'], total)


def _change_item(key, now, before, totals, tickers, pct):
    shares, value, weight = _side(now, totals[0])
    previous_shares, previous_value, previous_weight = _side(before, totals[1])
    return {
        'cusip': key[0],
        'put_call': key[1],
        'ticker': tickers.get(key[0]),
        'issuer': (now or before)['issuer'],
        'shares': shares,
        'previous_shares': previous_shares,
        'shares_change_pct': pct,
        'value': value,
        'previous_value': previous_value,
        'value_change': (value or 0) - (previous_value or 0),
        'weight': weight,
        'previous_weight': previous_weight,
    }


def changes_payload(investor, quarter_end):
    groups = {group: [] for group in CHANGE_GROUPS}
    ends = quarters.quarter_ends(investor)
    if not ends:
        return {'quarter': None, 'previous_quarter': None, **groups}
    quarter_end, previous = _resolve_quarter(ends, quarter_end)
    if previous is None:
        return {'quarter': quarter_end.isoformat(), 'previous_quarter': None, **groups}

    snap, previous_snap, per_key, sold_out = _comparison(investor, quarter_end, previous)
    tickers = tickers_for({key[0] for key in [*snap, *previous_snap]})
    totals = (sum(_values(snap).values()), sum(_values(previous_snap).values()))
    for key, (kind, pct) in per_key.items():
        if kind in groups:
            groups[kind].append(_change_item(key, snap[key], previous_snap.get(key), totals, tickers, pct))
    for key in sold_out:
        groups[changes.SOLD_OUT].append(_change_item(key, None, previous_snap[key], totals, tickers, -100.0))
    for items in groups.values():
        items.sort(key=lambda item: (-abs(item['value_change']), item['cusip'], item['put_call']))
    return {'quarter': quarter_end.isoformat(), 'previous_quarter': previous.isoformat(), **groups}
```

Append to `backend/investors/views.py`:

```python
class InvestorChangesView(APIView):
    def get(self, request, slug):
        investor = get_object_or_404(Investor, slug=slug)
        try:
            return Response(summaries.changes_payload(investor, _quarter_param(request)))
        except summaries.QuarterNotFound:
            raise NotFound('No filing is stored for that quarter.')
```

`backend/investors/urls.py`:

```python
from django.urls import path

from .views import InvestorChangesView, InvestorDetailView, InvestorListView

urlpatterns = [
    path('', InvestorListView.as_view(), name='investor-list'),
    path('<slug:slug>/', InvestorDetailView.as_view(), name='investor-detail'),
    path('<slug:slug>/changes/', InvestorChangesView.as_view(), name='investor-changes'),
]
```

- [ ] **Step 4: Run the investors suite** — `cd backend && .venv/bin/python manage.py test investors -v 1`. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/investors/summaries.py backend/investors/views.py backend/investors/urls.py backend/investors/test_changes_api.py
git commit -m "feat(investors): GET /api/investors/<slug>/changes/ grouped quarter changes"
```

---

### Task 4: API client and query hooks

**Files:**
- Create: `frontend/src/api/client/investors.js`, `frontend/src/api/queries/investors.js`, `frontend/src/api/queries/investors.test.jsx`
- Modify: `frontend/src/api/client/index.js` (add `export * from './investors'` after research), `frontend/src/api/queries/index.js` (add `export * from './investors'`, import `investorsKeys`, spread it into `queryKeys`)

**Interfaces:**
- Produces: client `getInvestors(holds?)`, `getInvestor(slug, quarter?)`, `getInvestorChanges(slug, quarter?)`; keys `investorsKeys.list(holds)`, `.detail(slug, quarter)`, `.changes(slug, quarter)`; hooks `useInvestors({ holds } = {})`, `useInvestor(slug, quarter)`, `useInvestorChanges(slug, quarter)`. `holds`/`quarter` are optional strings; an empty `holds` lists everyone; `useInvestors({ holds })` with a non-empty value is a separate cached query.

- [ ] **Step 1: Write the failing test** — `frontend/src/api/queries/investors.test.jsx`:

```jsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('../client')
import * as client from '../client'
import { investorsKeys, useInvestor, useInvestorChanges, useInvestors } from './investors'

function setup(useHook) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  return renderHook(useHook, { wrapper })
}

describe('investor queries', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists every investor without a holds filter', async () => {
    client.getInvestors.mockResolvedValue([{ slug: 'berkshire-hathaway' }])
    const { result } = setup(() => useInvestors())
    await waitFor(() => expect(result.current.data).toEqual([{ slug: 'berkshire-hathaway' }]))
    expect(client.getInvestors).toHaveBeenCalledWith('')
  })

  it('asks for holders of a ticker as its own query', async () => {
    client.getInvestors.mockResolvedValue([])
    const { result } = setup(() => useInvestors({ holds: 'AAPL' }))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(client.getInvestors).toHaveBeenCalledWith('AAPL')
    expect(investorsKeys.list('AAPL')).not.toEqual(investorsKeys.list(''))
  })

  it('loads one investor for the asked quarter', async () => {
    client.getInvestor.mockResolvedValue({ slug: 'berkshire-hathaway' })
    const { result } = setup(() => useInvestor('berkshire-hathaway', '2026-03-31'))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(client.getInvestor).toHaveBeenCalledWith('berkshire-hathaway', '2026-03-31')
  })

  it('waits for a slug before loading an investor', () => {
    setup(() => useInvestor(null))
    expect(client.getInvestor).not.toHaveBeenCalled()
  })

  it('loads the changes for a quarter', async () => {
    client.getInvestorChanges.mockResolvedValue({ new: [] })
    const { result } = setup(() => useInvestorChanges('berkshire-hathaway'))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(client.getInvestorChanges).toHaveBeenCalledWith('berkshire-hathaway', undefined)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run src/api/queries/investors.test.jsx`
Expected: import failure (`./investors` not found).

- [ ] **Step 3: Implement**

`frontend/src/api/client/investors.js`:

```js
import { apiFetch } from './http'

const quarterQuery = (quarter) => (quarter ? `?quarter=${encodeURIComponent(quarter)}` : '')

export const getInvestors = (holds = '') =>
  apiFetch(`/api/investors/${holds ? `?holds=${encodeURIComponent(holds)}` : ''}`)

export const getInvestor = (slug, quarter) => apiFetch(`/api/investors/${slug}/${quarterQuery(quarter)}`)

export const getInvestorChanges = (slug, quarter) =>
  apiFetch(`/api/investors/${slug}/changes/${quarterQuery(quarter)}`)
```

`frontend/src/api/queries/investors.js`:

```js
import { useQuery } from '@tanstack/react-query'

import { getInvestor, getInvestorChanges, getInvestors } from '../client'

export const investorsKeys = {
  list: (holds = '') => ['investors', holds],
  detail: (slug, quarter) => ['investor', slug, quarter ?? 'latest'],
  changes: (slug, quarter) => ['investor-changes', slug, quarter ?? 'latest'],
}

export function useInvestors({ holds = '' } = {}) {
  return useQuery({ queryKey: investorsKeys.list(holds), queryFn: () => getInvestors(holds) })
}

export function useInvestor(slug, quarter) {
  return useQuery({
    queryKey: investorsKeys.detail(slug, quarter),
    queryFn: () => getInvestor(slug, quarter),
    enabled: Boolean(slug),
  })
}

export function useInvestorChanges(slug, quarter) {
  return useQuery({
    queryKey: investorsKeys.changes(slug, quarter),
    queryFn: () => getInvestorChanges(slug, quarter),
    enabled: Boolean(slug),
  })
}
```

Wire both `index.js` files as listed under **Files** (the queries index also gets `import { investorsKeys } from './investors'` and `...investorsKeys` inside `queryKeys`; leave its existing comments untouched).

- [ ] **Step 4: Run** — `cd frontend && npx vitest run src/api/queries/investors.test.jsx && npx eslint src/api`. Expected: 5 pass, lint clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api
git commit -m "feat(investors): API client and query hooks for investors"
```

---

### Task 5: Pure helpers (`lib/investors.js`) and a rank palette

**Files:**
- Create: `frontend/src/lib/investors.js`, `frontend/src/lib/investors.test.js`
- Modify: `frontend/src/lib/charts.js` (add `colorForRank`)

**Interfaces:**
- Produces (all pure):
  - `quarterLabel(iso) -> 'Q2 2026' | '—'`
  - `fmtUsdCompact(value, { sign = false } = {}) -> '$299.3B' | '$13.1B' | '$920M' | '$450K' | '$12' | '—'` (T 2dp, B 1dp, M 0dp, K 0dp; sign adds `+`, negatives `-`)
  - `fmtFiledDate(iso) -> 'Aug 14, 2026' | '—'`
  - `latestQuarter(cards) -> iso | null`
  - `INVESTOR_GROUPS`, `INVESTOR_SORTS`, `CARD_LIMIT = 8`
  - `visibleInvestors(cards, { group, query, sort, holderSlugs })`
  - `looksLikeTicker(query) -> bool` (1–6 letters, optional `.` class suffix)
  - `HOLDING_FILTERS`, `PAGE_SIZE = 15`, `PAGE_STEP = 25`, `filterHoldings(holdings, { filter, query })`
  - `holdingLabel(h) -> ticker ?? issuer`
  - `topTen(holdings)`, `remainder(detail) -> { count, weight, value } | null`
  - `donutSlices(detail) -> [{ name, note, value, weight, color, logo }]`
  - `TOP10_VIEWS`, `readTop10View()`, `writeTop10View(view)`
  - charts.js: `colorForRank(index) -> HOLDINGS_PALETTE[index % 10]`

- [ ] **Step 1: Write the failing tests** — `frontend/src/lib/investors.test.js`:

```js
import { beforeEach, describe, expect, it } from 'vitest'

import { OTHER_SLICE, colorForRank } from './charts'
import {
  donutSlices, filterHoldings, fmtFiledDate, fmtUsdCompact, latestQuarter, looksLikeTicker,
  quarterLabel, readTop10View, remainder, topTen, visibleInvestors, writeTop10View,
} from './investors'

const card = (over) => ({
  slug: 's', name: 'N', firm: 'F', curated: true, stale: false, total_value: 1, positions: 1,
  new_count: 0, exited_count: 0, latest_quarter: '2026-06-30', ...over,
})

describe('labels and formatting', () => {
  it('names a quarter end', () => {
    expect(quarterLabel('2026-06-30')).toBe('Q2 2026')
    expect(quarterLabel('2025-12-31')).toBe('Q4 2025')
    expect(quarterLabel(null)).toBe('—')
  })

  it('compacts dollar values', () => {
    expect(fmtUsdCompact(299253556246)).toBe('$299.3B')
    expect(fmtUsdCompact(1_250_000_000_000)).toBe('$1.25T')
    expect(fmtUsdCompact(920_400_000)).toBe('$920M')
    expect(fmtUsdCompact(450_400)).toBe('$450K')
    expect(fmtUsdCompact(12)).toBe('$12')
    expect(fmtUsdCompact(null)).toBe('—')
  })

  it('signs a dollar change on request', () => {
    expect(fmtUsdCompact(1_200_000_000, { sign: true })).toBe('+$1.2B')
    expect(fmtUsdCompact(-400_000, { sign: true })).toBe('-$400K')
  })

  it('formats a filing date', () => {
    expect(fmtFiledDate('2026-08-14')).toBe('Aug 14, 2026')
    expect(fmtFiledDate(null)).toBe('—')
  })

  it('finds the latest quarter across cards, ignoring empty ones', () => {
    expect(latestQuarter([card({ latest_quarter: '2025-09-30' }), card({ latest_quarter: null }), card()])).toBe('2026-06-30')
    expect(latestQuarter([])).toBeNull()
  })
})

describe('visibleInvestors', () => {
  const cards = [
    card({ slug: 'b', name: 'Warren Buffett', firm: 'Berkshire Hathaway', total_value: 300, positions: 29, new_count: 1, exited_count: 1 }),
    card({ slug: 's', name: 'Michael Burry', firm: 'Scion', total_value: 1, positions: 9, stale: true, new_count: 6, exited_count: 3 }),
    card({ slug: 'e', name: 'Empty Fund', firm: 'Nothing Yet', total_value: null, positions: null, new_count: null, exited_count: null }),
  ]

  it('sorts by value with empty investors last', () => {
    expect(visibleInvestors(cards, { group: 'all', query: '', sort: 'value' }).map((c) => c.slug)).toEqual(['b', 's', 'e'])
  })

  it('sorts by most changes and by name', () => {
    expect(visibleInvestors(cards, { group: 'all', query: '', sort: 'changes' }).map((c) => c.slug)).toEqual(['s', 'b', 'e'])
    expect(visibleInvestors(cards, { group: 'all', query: '', sort: 'name' }).map((c) => c.slug)).toEqual(['e', 's', 'b'])
  })

  it('keeps only stopped filers', () => {
    expect(visibleInvestors(cards, { group: 'stale', query: '', sort: 'value' }).map((c) => c.slug)).toEqual(['s'])
  })

  it('matches investor or firm, plus holders of a ticker', () => {
    expect(visibleInvestors(cards, { group: 'all', query: 'berk', sort: 'value' }).map((c) => c.slug)).toEqual(['b'])
    expect(visibleInvestors(cards, { group: 'all', query: 'aapl', sort: 'value', holderSlugs: new Set(['s']) }).map((c) => c.slug)).toEqual(['s'])
  })

  it('recognises a ticker-shaped query', () => {
    expect(looksLikeTicker('aapl')).toBe(true)
    expect(looksLikeTicker('BRK.B')).toBe(true)
    expect(looksLikeTicker('berkshire hathaway')).toBe(false)
    expect(looksLikeTicker('')).toBe(false)
  })
})

describe('holdings', () => {
  const holdings = [
    { ticker: 'AAPL', issuer: 'APPLE INC', change: 'added', put_call: '', owned: true, watched: false, value: 70, weight: 70 },
    { ticker: 'NVDA', issuer: 'NVIDIA CORP', change: 'new', put_call: 'CALL', owned: false, watched: false, value: 20, weight: 20 },
    { ticker: null, issuer: 'LIBERTY LATIN AMERICA', change: 'trimmed', put_call: '', owned: false, watched: false, value: 10, weight: 10 },
  ]

  it('filters by change, options and yours', () => {
    expect(filterHoldings(holdings, { filter: 'new', query: '' }).map((h) => h.issuer)).toEqual(['NVIDIA CORP'])
    expect(filterHoldings(holdings, { filter: 'options', query: '' }).map((h) => h.issuer)).toEqual(['NVIDIA CORP'])
    expect(filterHoldings(holdings, { filter: 'yours', query: '' }).map((h) => h.issuer)).toEqual(['APPLE INC'])
  })

  it('searches ticker or issuer, including unresolved rows', () => {
    expect(filterHoldings(holdings, { filter: 'all', query: 'liberty' }).map((h) => h.issuer)).toEqual(['LIBERTY LATIN AMERICA'])
    expect(filterHoldings(holdings, { filter: 'all', query: 'nvd' }).map((h) => h.issuer)).toEqual(['NVIDIA CORP'])
  })
})

describe('top ten', () => {
  const holdings = Array.from({ length: 12 }, (_, i) => ({ ticker: i === 3 ? null : `T${i}`, issuer: `Issuer ${i}`, value: 100 - i, weight: 8 }))
  const detail = { holdings, positions: 12, total_value: 1134, top10_weight: 80 }

  it('keeps the first ten and states the rest', () => {
    expect(topTen(holdings)).toHaveLength(10)
    expect(remainder(detail)).toEqual({ count: 2, weight: 20, value: 1134 - holdings.slice(0, 10).reduce((s, h) => s + h.value, 0) })
  })

  it('has no remainder for a small portfolio', () => {
    expect(remainder({ holdings: holdings.slice(0, 4), positions: 4, total_value: 394, top10_weight: 100 })).toBeNull()
  })

  it('builds donut slices with an Other slice and rank colours', () => {
    const slices = donutSlices(detail)
    expect(slices).toHaveLength(11)
    expect(slices[0]).toMatchObject({ name: 'T0', note: 'Issuer 0', value: 100, color: colorForRank(0), logo: true })
    expect(slices[3]).toMatchObject({ name: 'Issuer 3', logo: false })
    expect(slices[10]).toMatchObject({ name: 'Other', color: OTHER_SLICE, logo: false, weight: 20 })
  })

  it('omits the Other slice at ten positions or fewer', () => {
    expect(donutSlices({ holdings: holdings.slice(0, 4), positions: 4, total_value: 394, top10_weight: 100 })).toHaveLength(4)
  })
})

describe('top-10 view preference', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to grid and remembers a choice', () => {
    expect(readTop10View()).toBe('grid')
    writeTop10View('donut')
    expect(readTop10View()).toBe('donut')
  })

  it('ignores an unknown stored value', () => {
    localStorage.setItem('saxodash:investors-top10-view', 'pie')
    expect(readTop10View()).toBe('grid')
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `cd frontend && npx vitest run src/lib/investors.test.js`. Expected: import failure.

- [ ] **Step 3: Implement**

In `frontend/src/lib/charts.js`, directly after `colorForTicker`, add:

```js
export function colorForRank(index) {
  return HOLDINGS_PALETTE[index % HOLDINGS_PALETTE.length]
}
```

`frontend/src/lib/investors.js`:

```js
import { OTHER_SLICE, colorForRank } from './charts'
import { UNKNOWN } from './format'

const VIEW_KEY = 'saxodash:investors-top10-view'

export const CARD_LIMIT = 8
export const PAGE_SIZE = 15
export const PAGE_STEP = 25
export const TOP10_VIEWS = [['grid', 'Grid'], ['donut', 'Donut'], ['list', 'List']]
export const INVESTOR_GROUPS = [['all', 'All'], ['curated', 'Curated'], ['stale', 'Stopped filing']]
export const INVESTOR_SORTS = [['value', 'Largest value'], ['changes', 'Most changes'], ['positions', 'Most positions'], ['name', 'Name']]
export const HOLDING_FILTERS = [['all', 'All'], ['new', 'New'], ['added', 'Added'], ['trimmed', 'Trimmed'], ['options', 'Options'], ['yours', 'Yours']]

export function quarterLabel(iso) {
  if (!iso) return UNKNOWN
  const [year, month] = iso.split('-').map(Number)
  return `Q${Math.ceil(month / 3)} ${year}`
}

const SCALES = [[1e12, 'T', 2], [1e9, 'B', 1], [1e6, 'M', 0], [1e3, 'K', 0]]

export function fmtUsdCompact(value, { sign = false } = {}) {
  if (value == null || Number.isNaN(Number(value))) return UNKNOWN
  const n = Number(value)
  const abs = Math.abs(n)
  const scale = SCALES.find(([size]) => abs >= size)
  const body = scale ? `${(abs / scale[0]).toFixed(scale[2])}${scale[1]}` : `${Math.round(abs)}`
  const prefix = n < 0 ? '-' : sign && n > 0 ? '+' : ''
  return `${prefix}$${body}`
}

const FILED = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

export function fmtFiledDate(iso) {
  return iso ? FILED.format(new Date(`${iso}T00:00:00Z`)) : UNKNOWN
}

export function latestQuarter(cards) {
  const quarters = cards.map((c) => c.latest_quarter).filter(Boolean).sort()
  return quarters.length ? quarters[quarters.length - 1] : null
}

export function looksLikeTicker(query) {
  return /^[A-Za-z]{1,5}(\.[A-Za-z])?$/.test(query.trim())
}

const GROUP_TESTS = {
  all: () => true,
  curated: (c) => c.curated,
  stale: (c) => c.stale,
}

const SORT_KEYS = {
  value: (c) => -(c.total_value ?? -1),
  changes: (c) => -((c.new_count ?? 0) + (c.exited_count ?? 0)),
  positions: (c) => -(c.positions ?? -1),
}

export function visibleInvestors(cards, { group = 'all', query = '', sort = 'value', holderSlugs = new Set() }) {
  const q = query.trim().toLowerCase()
  const matches = (c) => !q || c.name.toLowerCase().includes(q) || c.firm.toLowerCase().includes(q) || holderSlugs.has(c.slug)
  const key = SORT_KEYS[sort]
  return cards
    .filter((c) => (GROUP_TESTS[group] ?? GROUP_TESTS.all)(c) && matches(c))
    .sort((a, b) => (key ? key(a) - key(b) : 0) || a.name.localeCompare(b.name))
}

const HOLDING_TESTS = {
  all: () => true,
  options: (h) => Boolean(h.put_call),
  yours: (h) => h.owned || h.watched,
}

export function filterHoldings(holdings, { filter = 'all', query = '' }) {
  const q = query.trim().toLowerCase()
  const test = HOLDING_TESTS[filter] ?? ((h) => h.change === filter)
  return holdings.filter(
    (h) => test(h) && (!q || (h.ticker ?? '').toLowerCase().includes(q) || h.issuer.toLowerCase().includes(q)),
  )
}

export const holdingLabel = (h) => h.ticker ?? h.issuer

export const topTen = (holdings) => holdings.slice(0, 10)

export function remainder(detail) {
  if (detail.positions <= 10) return null
  const shown = topTen(detail.holdings).reduce((sum, h) => sum + h.value, 0)
  return {
    count: detail.positions - 10,
    weight: Math.round((100 - detail.top10_weight) * 100) / 100,
    value: detail.total_value - shown,
  }
}

export function donutSlices(detail) {
  const slices = topTen(detail.holdings).map((h, i) => ({
    name: holdingLabel(h),
    note: h.ticker ? h.issuer : null,
    value: h.value,
    weight: h.weight,
    color: colorForRank(i),
    logo: Boolean(h.ticker),
  }))
  const rest = remainder(detail)
  return rest
    ? [...slices, { name: 'Other', note: `${rest.count} smaller positions`, value: rest.value, weight: rest.weight, color: OTHER_SLICE, logo: false }]
    : slices
}

const VIEW_KEYS = new Set(TOP10_VIEWS.map(([key]) => key))

export function readTop10View() {
  try {
    const stored = localStorage.getItem(VIEW_KEY)
    return VIEW_KEYS.has(stored) ? stored : 'grid'
  } catch {
    return 'grid'
  }
}

export function writeTop10View(view) {
  try {
    localStorage.setItem(VIEW_KEY, view)
  } catch {
    return
  }
}
```

- [ ] **Step 4: Run** — `cd frontend && npx vitest run src/lib/investors.test.js src/lib/charts.test.js && npx eslint src/lib/investors.js src/lib/charts.js`. Expected: all pass, lint clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/investors.js frontend/src/lib/investors.test.js frontend/src/lib/charts.js
git commit -m "feat(investors): pure helpers for labels, filters, sorts and the top-10 donut"
```

---

### Task 6: Badges, weight bar and the stats strip

**Files:**
- Create: `frontend/src/components/investors/ChangeBadge.jsx`, `HoldingBadges.jsx`, `WeightBar.jsx`, `InvestorStats.jsx`, `LimitsNote.jsx`, and `frontend/src/components/investors/badges.test.jsx`

**Interfaces:**
- Produces: `<ChangeBadge change pct />` (`change` ∈ new/added/trimmed/unchanged/sold_out/null), `<OptionBadge putCall />`, `<YouBadge owned watched />`, `<WeightBar weight max />`, `<InvestorStats detail />` (uses `quarter`, `total_value`, `positions`, `top10_weight`, `new_count`, `exited_count`, `turnover`, `filed_on`), `<LimitsNote />`.

- [ ] **Step 1: Write the failing tests** — `frontend/src/components/investors/badges.test.jsx`:

```jsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import ChangeBadge from './ChangeBadge'
import InvestorStats from './InvestorStats'
import LimitsNote from './LimitsNote'
import WeightBar from './WeightBar'
import { OptionBadge, YouBadge } from './HoldingBadges'

describe('ChangeBadge', () => {
  it('names a new position in the accent tone', () => {
    render(<ChangeBadge change="new" />)
    expect(screen.getByText('New')).toHaveClass('text-blue-400')
  })

  it('describes added and trimmed with an arrow and whole percent, neutrally', () => {
    const { rerender } = render(<ChangeBadge change="added" pct={10.4} />)
    expect(screen.getByText('▲ Added 10%')).toHaveClass('text-zinc-300')
    rerender(<ChangeBadge change="trimmed" pct={-4.6} />)
    expect(screen.getByText('▼ Trimmed 5%')).toHaveClass('text-zinc-300')
  })

  it('marks a sold-out position in amber', () => {
    render(<ChangeBadge change="sold_out" />)
    expect(screen.getByText('Sold out')).toHaveClass('text-amber-400')
  })

  it('says unchanged quietly and nothing for a first quarter', () => {
    const { container, rerender } = render(<ChangeBadge change="unchanged" />)
    expect(screen.getByText('Unchanged')).toBeInTheDocument()
    rerender(<ChangeBadge change={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('holding badges', () => {
  it('labels options and your own positions', () => {
    render(<><OptionBadge putCall="PUT" /><YouBadge owned watched={false} /><YouBadge owned={false} watched /></>)
    expect(screen.getByText('Put')).toBeInTheDocument()
    expect(screen.getByText('You own')).toBeInTheDocument()
    expect(screen.getByText('Watchlist')).toBeInTheDocument()
  })

  it('renders nothing for a plain stock you do not follow', () => {
    const { container } = render(<><OptionBadge putCall="" /><YouBadge owned={false} watched={false} /></>)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('WeightBar', () => {
  it('scales the fill to the largest weight', () => {
    const { container } = render(<WeightBar weight={11} max={22} />)
    expect(container.querySelector('[data-fill]')).toHaveStyle({ width: '50%' })
  })
})

describe('InvestorStats', () => {
  const detail = {
    quarter: '2026-06-30', total_value: 299253556246, positions: 29, top10_weight: 86.42,
    new_count: 1, exited_count: 1, turnover: 3.21, filed_on: '2026-08-14',
  }

  it('states value, positions, top-10 share, movement and turnover', () => {
    render(<InvestorStats detail={detail} />)
    expect(screen.getByText('$299.3B')).toBeInTheDocument()
    expect(screen.getByText('as of Q2 2026 end')).toBeInTheDocument()
    expect(screen.getByText('29')).toBeInTheDocument()
    expect(screen.getByText('86.4%')).toBeInTheDocument()
    expect(screen.getByText('+1 · −1')).toBeInTheDocument()
    expect(screen.getByText('3.2%')).toBeInTheDocument()
    expect(screen.getByText('filed Aug 14, 2026')).toBeInTheDocument()
  })

  it('shows dashes when there is no earlier quarter to compare', () => {
    render(<InvestorStats detail={{ ...detail, new_count: null, exited_count: null, turnover: null }} />)
    expect(screen.getAllByText('—')).toHaveLength(2)
  })
})

describe('LimitsNote', () => {
  it('states what 13F cannot show', () => {
    render(<LimitsNote />)
    expect(screen.getByText(/US-listed long positions and listed options at quarter end only/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `cd frontend && npx vitest run src/components/investors/badges.test.jsx`. Expected: import failures.

- [ ] **Step 3: Implement**

`ChangeBadge.jsx`:

```jsx
import { Badge } from '../ui'

const wholePct = (pct) => (pct == null ? '' : ` ${Math.round(Math.abs(pct))}%`)

export default function ChangeBadge({ change, pct }) {
  if (change === 'new') return <Badge tone="blue">New</Badge>
  if (change === 'sold_out') return <Badge tone="amber">Sold out</Badge>
  if (change === 'added') return <Badge tone="zinc">{`▲ Added${wholePct(pct)}`}</Badge>
  if (change === 'trimmed') return <Badge tone="zinc">{`▼ Trimmed${wholePct(pct)}`}</Badge>
  if (change === 'unchanged') return <span className="text-[var(--fig-2xs)] text-zinc-500">Unchanged</span>
  return null
}
```

`HoldingBadges.jsx`:

```jsx
import { Badge } from '../ui'

export function OptionBadge({ putCall }) {
  if (!putCall) return null
  return <Badge tone="zinc">{putCall === 'PUT' ? 'Put' : 'Call'}</Badge>
}

export function YouBadge({ owned, watched }) {
  if (owned) return <Badge tone="blue">You own</Badge>
  if (watched) return <Badge tone="zinc">Watchlist</Badge>
  return null
}
```

`WeightBar.jsx`:

```jsx
export default function WeightBar({ weight, max, className = '' }) {
  const width = max > 0 ? `${Math.min(100, (weight / max) * 100)}%` : '0%'
  return (
    <span aria-hidden="true" className={`block h-1 rounded-full bg-white/[0.06] overflow-hidden ${className}`}>
      <span data-fill className="block h-full rounded-full bg-blue-500/70" style={{ width }} />
    </span>
  )
}
```

`InvestorStats.jsx`:

```jsx
import { InfoTip, StatRow, StatStrip } from '../ui'
import { UNKNOWN, fmtNum, fmtPct } from '../../lib/format'
import { fmtFiledDate, fmtUsdCompact, quarterLabel } from '../../lib/investors'

const share = (value) => fmtPct(value, { sign: false, decimals: 1 })

export default function InvestorStats({ detail }) {
  const moved = detail.new_count == null ? UNKNOWN : `+${detail.new_count} · −${detail.exited_count}`
  return (
    <StatStrip>
      <StatRow label="Total value" value={fmtUsdCompact(detail.total_value)} note={`as of ${quarterLabel(detail.quarter)} end`} />
      <StatRow label="Positions" value={fmtNum(detail.positions)} note="US-listed longs + options" />
      <StatRow label="Top 10 share" value={share(detail.top10_weight)} note="of reported value" />
      <StatRow label="vs previous quarter" value={moved} note="new · sold out" />
      <StatRow
        label={
          <span className="inline-flex items-center gap-1">
            Turnover
            <InfoTip label="What turnover means">
              Value of positions opened this quarter plus value of positions closed, as a share of both quarters
              combined. Size changes inside kept positions are not counted.
            </InfoTip>
          </span>
        }
        value={share(detail.turnover)}
        note={`filed ${fmtFiledDate(detail.filed_on)}`}
      />
    </StatStrip>
  )
}
```

`LimitsNote.jsx`:

```jsx
export default function LimitsNote() {
  return (
    <p className="text-[var(--fig-xs)] text-zinc-500 max-w-[70ch]">
      13F shows US-listed long positions and listed options at quarter end only. No shorts, cash or non-US
      holdings, and no trades inside the quarter. Values are as of quarter end.
    </p>
  )
}
```

- [ ] **Step 4: Run** — `cd frontend && npx vitest run src/components/investors && npx eslint src/components/investors`. Expected: pass, clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/investors
git commit -m "feat(investors): change badges, weight bar and the stats strip"
```

---

### Task 7: Holdings table

**Files:**
- Create: `frontend/src/components/investors/HoldingsTable.jsx`, `HoldingsTable.test.jsx`

**Interfaces:**
- Consumes: Task 6 components; `researchHref` (`lib/research.js`); `TickerInitial` (`components/discover/TickerInitial.jsx`); `fmtUsdCompact`, `holdingLabel` (Task 5).
- Produces: `<HoldingsTable holdings showChange />` — columns Holding, % of portfolio (with WeightBar scaled to the largest row), Value, Shares, Change (omitted when `showChange` is false), Held (`Nq`), You. A resolved row links its ticker to Research and the whole row navigates there on click; an unresolved row shows the issuer and is not clickable.

- [ ] **Step 1: Write the failing test** — `HoldingsTable.test.jsx`:

```jsx
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import HoldingsTable from './HoldingsTable'

const holdings = [
  { cusip: '037833100', ticker: 'AAPL', issuer: 'APPLE INC', put_call: '', shares: 227917808, value: 65950296923, weight: 22.04, change: 'trimmed', shares_change_pct: -7.2, quarters_held: 20, owned: true, watched: false },
  { cusip: '67066G104', ticker: 'NVDA', issuer: 'NVIDIA CORP', put_call: 'CALL', shares: 100, value: 5000, weight: 11.02, change: 'new', shares_change_pct: null, quarters_held: 1, owned: false, watched: true },
  { cusip: '999999999', ticker: null, issuer: 'LIBERTY LATIN AMERICA LTD', put_call: '', shares: 10, value: 10, weight: 0.1, change: 'unchanged', shares_change_pct: 0, quarters_held: 20, owned: false, watched: false },
]

const renderTable = (props = {}) =>
  render(
    <MemoryRouter initialEntries={['/investors/berkshire-hathaway']}>
      <Routes>
        <Route path="/investors/:slug" element={<HoldingsTable holdings={holdings} showChange {...props} />} />
        <Route path="/research" element={<p>Research page</p>} />
      </Routes>
    </MemoryRouter>,
  )

describe('HoldingsTable', () => {
  it('links a resolved ticker to Research', () => {
    renderTable()
    expect(screen.getByRole('link', { name: 'AAPL' })).toHaveAttribute('href', '/research?symbol=AAPL&tab=overview')
  })

  it('shows an unresolved holding by issuer with no link', () => {
    renderTable()
    expect(screen.getByText('LIBERTY LATIN AMERICA LTD')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /LIBERTY/ })).toBeNull()
  })

  it('opens Research from anywhere on a resolved row', () => {
    renderTable()
    fireEvent.click(screen.getByText('$66.0B'))
    expect(screen.getByText('Research page')).toBeInTheDocument()
  })

  it('shows weight, value, shares, change, tenure and your badges', () => {
    renderTable()
    expect(screen.getByText('22.0%')).toBeInTheDocument()
    expect(screen.getByText('227,917,808')).toBeInTheDocument()
    expect(screen.getByText('▼ Trimmed 7%')).toBeInTheDocument()
    expect(screen.getAllByText('20q')).toHaveLength(2)
    expect(screen.getByText('You own')).toBeInTheDocument()
    expect(screen.getByText('Call')).toBeInTheDocument()
  })

  it('drops the change column for a first stored quarter', () => {
    renderTable({ showChange: false })
    expect(screen.queryByRole('columnheader', { name: 'Change' })).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `cd frontend && npx vitest run src/components/investors/HoldingsTable.test.jsx`.

- [ ] **Step 3: Implement** — `HoldingsTable.jsx`:

```jsx
import { Link, useNavigate } from 'react-router-dom'

import { InstrumentLogo, Td, Th, Tr } from '../ui'
import TickerInitial from '../discover/TickerInitial'
import ChangeBadge from './ChangeBadge'
import WeightBar from './WeightBar'
import { OptionBadge, YouBadge } from './HoldingBadges'
import { fmtNum, fmtPct } from '../../lib/format'
import { fmtUsdCompact, holdingLabel } from '../../lib/investors'
import { researchHref } from '../../lib/research'

export default function HoldingsTable({ holdings, showChange = true }) {
  const navigate = useNavigate()
  const max = Math.max(0, ...holdings.map((h) => h.weight))

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-[var(--fig-sm)]">
        <thead className="text-[var(--fig-2xs)] uppercase tracking-wider text-zinc-500 border-b border-white/[0.06]">
          <tr>
            <Th edge>Holding</Th>
            <Th align="right">% of portfolio</Th>
            <Th align="right">Value</Th>
            <Th align="right">Shares</Th>
            {showChange && <Th>Change</Th>}
            <Th align="right">Held</Th>
            <Th edge>You</Th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => {
            const href = h.ticker ? researchHref(h.ticker, 'overview') : null
            return (
              <Tr
                key={`${h.cusip}-${h.put_call}`}
                className={href ? 'cursor-pointer' : ''}
                onClick={href ? () => navigate(href) : undefined}
              >
                <Td edge>
                  <div className="flex items-center gap-2.5">
                    <InstrumentLogo
                      symbol={h.ticker}
                      size={24}
                      className="rounded"
                      fallback={<TickerInitial ticker={h.ticker ?? h.issuer} size={24} />}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {href ? (
                          <Link
                            to={href}
                            onClick={(e) => e.stopPropagation()}
                            className="font-mono font-semibold text-zinc-100 hover:text-blue-300"
                          >
                            {h.ticker}
                          </Link>
                        ) : (
                          <span className="text-zinc-200">{holdingLabel(h)}</span>
                        )}
                        <OptionBadge putCall={h.put_call} />
                      </div>
                      {h.ticker && <div className="text-[var(--fig-xs)] text-zinc-500 truncate max-w-[260px]">{h.issuer}</div>}
                    </div>
                  </div>
                </Td>
                <Td align="right">
                  <div className="flex items-center justify-end gap-2">
                    <span className="num font-mono text-zinc-200">{fmtPct(h.weight, { sign: false, decimals: 1 })}</span>
                    <WeightBar weight={h.weight} max={max} className="w-16" />
                  </div>
                </Td>
                <Td align="right" className="num font-mono text-zinc-300">{fmtUsdCompact(h.value)}</Td>
                <Td align="right" className="num font-mono text-zinc-400">{fmtNum(h.shares)}</Td>
                {showChange && <Td><ChangeBadge change={h.change} pct={h.shares_change_pct} /></Td>}
                <Td align="right" className="num font-mono text-zinc-400">{`${h.quarters_held}q`}</Td>
                <Td edge><YouBadge owned={h.owned} watched={h.watched} /></Td>
              </Tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: Run** — `cd frontend && npx vitest run src/components/investors && npx eslint src/components/investors`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/investors/HoldingsTable.jsx frontend/src/components/investors/HoldingsTable.test.jsx
git commit -m "feat(investors): holdings table with Research handoff"
```

---

### Task 8: Top 10 holdings — Grid / Donut / List (and the donut's centre read-out)

**Files:**
- Modify: `frontend/src/components/AllocationDonut.jsx`
- Create: `frontend/src/components/AllocationDonut.test.jsx`, `frontend/src/components/investors/TopHoldings.jsx`, `TopHoldings.test.jsx`

**Interfaces:**
- Consumes: Tasks 5–7.
- Produces:
  - `AllocationDonut` gains two optional props, default behaviour unchanged: `center: (activeItem | null) => ({ label, value, hint })` renders a centred read-out over the ring that follows the hovered slice; each item may carry `note` (shown muted after its name in the legend).
  - `<TopHoldings detail slug />` — header "Top 10 holdings" + Grid/Donut/List `TBtn` group (persisted via `readTop10View`/`writeTop10View`); below the view, the remainder line ("Remaining N positions: x% · $v" or "That's the whole portfolio: N positions.") and a link "Open full portfolio →" to `/investors/:slug`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/components/AllocationDonut.test.jsx`:

```jsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import AllocationDonut from './AllocationDonut'

const items = [
  { name: 'AAPL', note: 'APPLE INC', value: 70, color: '#60a5fa' },
  { name: 'Other', value: 30, color: '#52525b' },
]

describe('AllocationDonut', () => {
  it('shows a legend note next to the name', () => {
    render(<AllocationDonut items={items} formatValue={(v) => `$${v}`} />)
    expect(screen.getByText('APPLE INC')).toBeInTheDocument()
  })

  it('renders a centre read-out when asked, defaulting to the whole', () => {
    render(
      <AllocationDonut
        items={items}
        formatValue={(v) => `$${v}`}
        center={(active) => (active ? { label: active.name, value: `$${active.value}` } : { label: 'Total value', value: '$100', hint: '2 slices' })}
      />,
    )
    expect(screen.getByText('Total value')).toBeInTheDocument()
    expect(screen.getByText('2 slices')).toBeInTheDocument()
  })

  it('has no centre read-out by default', () => {
    render(<AllocationDonut items={items} formatValue={(v) => `$${v}`} />)
    expect(screen.queryByTestId('donut-center')).toBeNull()
  })
})
```

`frontend/src/components/investors/TopHoldings.test.jsx`:

```jsx
import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import TopHoldings from './TopHoldings'

const holding = (i, over = {}) => ({
  cusip: `C${i}`, ticker: `T${i}`, issuer: `Issuer ${i}`, put_call: '', shares: 10, value: 1000 - i * 10,
  weight: 10 - i * 0.1, change: 'unchanged', shares_change_pct: 0, quarters_held: 4, owned: false, watched: false, ...over,
})
const detail = (count) => ({
  slug: 'berkshire-hathaway', quarter: '2026-06-30', positions: count, total_value: 20000, top10_weight: count > 10 ? 86.4 : 100,
  holdings: Array.from({ length: count }, (_, i) => holding(i, i === 0 ? { owned: true, change: 'new' } : {})),
})

const renderTop = (d) => render(<MemoryRouter><TopHoldings detail={d} slug="berkshire-hathaway" /></MemoryRouter>)

describe('TopHoldings', () => {
  beforeEach(() => localStorage.clear())

  it('shows ten tiles with weight, change and your badge by default', () => {
    renderTop(detail(29))
    expect(screen.getAllByTestId('holding-tile')).toHaveLength(10)
    expect(screen.getByText('New')).toBeInTheDocument()
    expect(screen.getByText('You own')).toBeInTheDocument()
  })

  it('states the remaining positions and links to the full portfolio', () => {
    renderTop(detail(29))
    expect(screen.getByText(/Remaining 19 positions/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open full portfolio →' })).toHaveAttribute('href', '/investors/berkshire-hathaway')
  })

  it('says a small portfolio is shown whole', () => {
    renderTop(detail(4))
    expect(screen.getAllByTestId('holding-tile')).toHaveLength(4)
    expect(screen.getByText("That's the whole portfolio: 4 positions.")).toBeInTheDocument()
  })

  it('switches to the list and remembers the choice', () => {
    renderTop(detail(29))
    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    expect(screen.getAllByRole('row')).toHaveLength(11)
    expect(localStorage.getItem('saxodash:investors-top10-view')).toBe('list')
  })

  it('shows the donut with an Other slice in its legend', () => {
    localStorage.setItem('saxodash:investors-top10-view', 'donut')
    renderTop(detail(29))
    expect(screen.getByText('Other')).toBeInTheDocument()
    expect(screen.getByText('Total value')).toBeInTheDocument()
  })

  it('shows an unresolved holding by issuer in a tile', () => {
    renderTop({ ...detail(3), holdings: [holding(0, { ticker: null, issuer: 'LIBERTY LATIN AMERICA LTD' })] })
    expect(screen.getByText('LIBERTY LATIN AMERICA LTD')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify they fail** — `cd frontend && npx vitest run src/components/AllocationDonut.test.jsx src/components/investors/TopHoldings.test.jsx`.

- [ ] **Step 3: Implement**

`AllocationDonut.jsx` — keep all existing code and comments; make these additive edits:
1. `import { useState } from 'react'` at the top.
2. Signature: `export default function AllocationDonut({ items, formatValue, showIcons = false, height = '320px', center })`.
3. Inside: `const [activeIndex, setActiveIndex] = useState(null)` and `const readout = center ? center(activeIndex == null ? null : items[activeIndex]) : null`.
4. Give the measured container `relative`: `<div ref={containerRef} className="mt-3 relative" style={{ height }}>`.
5. On `<Pie ...>` add `onMouseEnter={(_, index) => setActiveIndex(index)}` and `onMouseLeave={() => setActiveIndex(null)}`.
6. After `</ResponsiveContainer>` (still inside the measured div) add:

```jsx
        {readout && (
          <div data-testid="donut-center" className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[var(--fig-xs)] text-zinc-500">{readout.label}</span>
            <span className="text-[var(--fig-lg)] num font-mono text-zinc-50">{readout.value}</span>
            {readout.hint && <span className="text-[var(--fig-2xs)] num font-mono text-zinc-500">{readout.hint}</span>}
          </div>
        )}
```

7. In the legend row, after the name span add `{d.note && <span className="text-zinc-500 truncate">{d.note}</span>}`.

`TopHoldings.jsx`:

```jsx
import { useState } from 'react'
import { Link } from 'react-router-dom'

import AllocationDonut from '../AllocationDonut'
import { InstrumentLogo, TBtn } from '../ui'
import TickerInitial from '../discover/TickerInitial'
import ChangeBadge from './ChangeBadge'
import HoldingsTable from './HoldingsTable'
import WeightBar from './WeightBar'
import { OptionBadge, YouBadge } from './HoldingBadges'
import { fmtPct } from '../../lib/format'
import {
  TOP10_VIEWS, donutSlices, fmtUsdCompact, holdingLabel, readTop10View, remainder, topTen, writeTop10View,
} from '../../lib/investors'

const share = (value) => fmtPct(value, { sign: false, decimals: 1 })

function HoldingTile({ holding, max }) {
  return (
    <div data-testid="holding-tile" className="bg-white/[0.02] border border-white/[0.06] rounded-md p-3 flex flex-col gap-2 min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        <InstrumentLogo
          symbol={holding.ticker}
          size={28}
          className="rounded"
          fallback={<TickerInitial ticker={holdingLabel(holding)} size={28} />}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-mono font-semibold text-zinc-100 truncate">{holding.ticker ?? holding.issuer}</span>
            <OptionBadge putCall={holding.put_call} />
          </div>
          {holding.ticker && <div className="text-[var(--fig-2xs)] text-zinc-500 truncate">{holding.issuer}</div>}
        </div>
      </div>
      <div className="text-[var(--fig-lg)] num font-mono text-zinc-50">{share(holding.weight)}</div>
      <WeightBar weight={holding.weight} max={max} />
      <div className="flex items-center justify-between gap-1 flex-wrap text-[var(--fig-xs)]">
        <span className="num font-mono text-zinc-400">{fmtUsdCompact(holding.value)}</span>
        <ChangeBadge change={holding.change} pct={holding.shares_change_pct} />
      </div>
      <YouBadge owned={holding.owned} watched={holding.watched} />
    </div>
  )
}

function Grid({ holdings }) {
  const max = Math.max(0, ...holdings.map((h) => h.weight))
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2">
      {holdings.map((h) => <HoldingTile key={`${h.cusip}-${h.put_call}`} holding={h} max={max} />)}
    </div>
  )
}

function Donut({ detail }) {
  const slices = donutSlices(detail)
  const center = (active) =>
    active
      ? { label: active.name, value: share(active.weight), hint: fmtUsdCompact(active.value) }
      : { label: 'Total value', value: fmtUsdCompact(detail.total_value), hint: `${detail.positions} positions` }
  return <AllocationDonut items={slices} formatValue={(v) => fmtUsdCompact(v)} center={center} height="300px" />
}

export default function TopHoldings({ detail, slug }) {
  const [view, setView] = useState(readTop10View)
  const holdings = topTen(detail.holdings)
  const rest = remainder(detail)

  const choose = (next) => {
    setView(next)
    writeTop10View(next)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-[var(--fig-sm)] font-medium text-zinc-200">Top 10 holdings</h3>
        <div role="group" aria-label="Top 10 view" className="flex items-center gap-0.5">
          {TOP10_VIEWS.map(([key, label]) => (
            <TBtn key={key} active={view === key} onClick={() => choose(key)}>{label}</TBtn>
          ))}
        </div>
      </div>
      {view === 'grid' && <Grid holdings={holdings} />}
      {view === 'donut' && <Donut detail={detail} />}
      {view === 'list' && <HoldingsTable holdings={holdings} showChange={detail.previous_quarter != null} />}
      <div className="flex items-center justify-between gap-3 flex-wrap text-[var(--fig-xs)] text-zinc-500">
        <span>
          {rest
            ? `Remaining ${rest.count} positions: ${share(rest.weight)} · ${fmtUsdCompact(rest.value)}`
            : `That's the whole portfolio: ${detail.positions} positions.`}
        </span>
        <Link to={`/investors/${slug}`} className="text-blue-400 hover:text-blue-300">Open full portfolio →</Link>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run** — `cd frontend && npx vitest run src/components && npx eslint src/components/AllocationDonut.jsx src/components/investors`. Expected: new tests pass and every existing component test (Dashboard/Portfolio donut users) still passes.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/AllocationDonut.jsx frontend/src/components/AllocationDonut.test.jsx frontend/src/components/investors/TopHoldings.jsx frontend/src/components/investors/TopHoldings.test.jsx
git commit -m "feat(investors): top-10 holdings as grid, donut or list"
```

---

### Task 9: Snapshot panel

**Files:**
- Create: `frontend/src/components/investors/SnapshotPanel.jsx`, `SnapshotPanel.test.jsx`

**Interfaces:**
- Consumes: `useInvestor` (Task 4), `InvestorStats` (Task 6), `TopHoldings` (Task 8), `quarterLabel`/`fmtFiledDate` (Task 5).
- Produces: `<SnapshotPanel slug />` — a `Card` with name, `firm · Qn YYYY` (plus amber "No 13F since …" when `stale`), an import-progress line when `import` is set, a primary "Open full portfolio →" link, the stats strip and `TopHoldings`. Loading → skeleton; error → `Alert`; nothing imported → `EmptyState` "Nothing imported for {name} yet" with hint "The newest quarter appears here once its filing lands."

- [ ] **Step 1: Write the failing test** — `SnapshotPanel.test.jsx`:

```jsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import SnapshotPanel from './SnapshotPanel'

let state
vi.mock('../../api/queries', () => ({ useInvestor: () => state }))

const detail = {
  slug: 'scion-asset-management', name: 'Michael Burry', firm: 'Scion Asset Management', stale: true,
  quarter: '2025-09-30', previous_quarter: '2025-06-30', filed_on: '2025-11-14', total_value: 920000000, positions: 2,
  top10_weight: 100, new_count: 2, exited_count: 3, turnover: 74, import: null,
  holdings: [
    { cusip: 'A', ticker: 'PLTR', issuer: 'PALANTIR', put_call: 'PUT', shares: 1, value: 600000000, weight: 65.2, change: 'new', shares_change_pct: null, quarters_held: 1, owned: false, watched: false },
    { cusip: 'B', ticker: 'NVDA', issuer: 'NVIDIA', put_call: 'PUT', shares: 1, value: 320000000, weight: 34.8, change: 'new', shares_change_pct: null, quarters_held: 1, owned: true, watched: false },
  ],
}

const renderPanel = () => render(<MemoryRouter><SnapshotPanel slug="scion-asset-management" /></MemoryRouter>)

describe('SnapshotPanel', () => {
  it('heads the snapshot and says a stopped filer stopped', () => {
    state = { data: detail, isLoading: false, error: null }
    renderPanel()
    expect(screen.getByRole('heading', { name: 'Michael Burry' })).toBeInTheDocument()
    expect(screen.getByText('Scion Asset Management · Q3 2025')).toBeInTheDocument()
    expect(screen.getByText('No 13F since Q3 2025')).toBeInTheDocument()
    expect(screen.getByText('$920M')).toBeInTheDocument()
  })

  it('shows import progress while a backfill runs', () => {
    state = { data: { ...detail, import: { quarters_imported: 3, quarters_expected: 19, cusips_resolved: 40, cusips_seen: 90 } }, isLoading: false, error: null }
    renderPanel()
    expect(screen.getByText('Importing history · 3 of 19 quarters · tickers 40/90')).toBeInTheDocument()
  })

  it('explains an investor with nothing imported', () => {
    state = { data: { ...detail, quarter: null, holdings: [], quarters: [] }, isLoading: false, error: null }
    renderPanel()
    expect(screen.getByText('Nothing imported for Michael Burry yet')).toBeInTheDocument()
  })

  it('reports a failed load', () => {
    state = { data: undefined, isLoading: false, error: new Error('boom') }
    renderPanel()
    expect(screen.getByText(/Could not load this investor/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `cd frontend && npx vitest run src/components/investors/SnapshotPanel.test.jsx`.

- [ ] **Step 3: Implement** — `SnapshotPanel.jsx`:

```jsx
import { Link } from 'react-router-dom'

import { useInvestor } from '../../api/queries'
import { Alert, Card, EmptyState, Skeleton } from '../ui'
import InvestorStats from './InvestorStats'
import TopHoldings from './TopHoldings'
import { quarterLabel } from '../../lib/investors'

export function ImportProgress({ progress }) {
  if (!progress) return null
  const done = progress.quarters_expected ? progress.quarters_imported / progress.quarters_expected : 0
  return (
    <div className="flex flex-col gap-1 text-[var(--fig-2xs)] text-blue-400">
      <span className="num font-mono">
        {`Importing history · ${progress.quarters_imported} of ${progress.quarters_expected} quarters · tickers ${progress.cusips_resolved}/${progress.cusips_seen}`}
      </span>
      <span aria-hidden="true" className="block h-1 rounded-full bg-white/[0.06] overflow-hidden">
        <span className="block h-full bg-blue-500/70" style={{ width: `${Math.round(done * 100)}%` }} />
      </span>
    </div>
  )
}

export default function SnapshotPanel({ slug }) {
  const { data, isLoading, error } = useInvestor(slug)

  if (error) return <Alert>Could not load this investor. {error.message}</Alert>
  if (isLoading || !data) return <Card><Skeleton className="h-64" /></Card>

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <ImportProgress progress={data.import} />
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-[var(--fig-md)] font-medium text-zinc-50">{data.name}</h2>
            <p className="text-[var(--fig-xs)] text-zinc-500 mt-0.5">
              {data.quarter ? `${data.firm} · ${quarterLabel(data.quarter)}` : data.firm}
            </p>
            {data.stale && data.quarter && (
              <p className="text-[var(--fig-xs)] text-amber-400 mt-0.5">{`No 13F since ${quarterLabel(data.quarter)}`}</p>
            )}
          </div>
          {data.quarter && (
            <Link
              to={`/investors/${slug}`}
              className="inline-flex items-center h-9 px-3.5 rounded-md bg-blue-500 text-white hover:bg-blue-400 text-[var(--fig-sm)] font-medium"
            >
              Open full portfolio →
            </Link>
          )}
        </div>
        {data.quarter ? (
          <>
            <InvestorStats detail={data} />
            <TopHoldings detail={data} slug={slug} />
          </>
        ) : (
          <EmptyState title={`Nothing imported for ${data.name} yet`} hint="The newest quarter appears here once its filing lands." />
        )}
      </div>
    </Card>
  )
}
```

(The link copies `Button variant="primary"`'s classes because `Button` renders a `<button>`, and this is navigation. If `docs/design-system.md` documents a link-styled button pattern, use that instead and say so in the report.)

- [ ] **Step 4: Run** — `cd frontend && npx vitest run src/components/investors && npx eslint src/components/investors`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/investors/SnapshotPanel.jsx frontend/src/components/investors/SnapshotPanel.test.jsx
git commit -m "feat(investors): snapshot panel for the picked investor"
```

---

### Task 10: `/investors` overview page, sidebar entry and route

**Files:**
- Create: `frontend/src/components/investors/InvestorToolbar.jsx`, `InvestorCards.jsx`, `InvestorTable.jsx`, `frontend/src/pages/Investors.jsx`, `frontend/src/pages/Investors.test.jsx`
- Modify: `frontend/src/App.jsx` (`<Route path='investors' element={<Investors />} />` after `earnings`), `frontend/src/components/Sidebar.jsx` (add `{ to: '/investors', label: 'Investors', icon: Users }` after Earnings; import `Users` from `lucide-react`)

**Interfaces:**
- Consumes: `useInvestors` (Task 4); Task 5 helpers; `SnapshotPanel`, `ImportProgress` (Task 9); `LimitsNote` (Task 6); `useDebouncedValue` (`lib/useDebouncedValue.js`).
- Produces: the `/investors` page. The picked investor lives in the URL as `?investor=<slug>` (default `berkshire-hathaway` when present, else the first visible investor). A ticker-shaped search (debounced 300 ms) additionally asks `useInvestors({ holds })` and includes those investors.

- [ ] **Step 1: Write the failing test** — `frontend/src/pages/Investors.test.jsx`:

```jsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import Investors from './Investors'

const card = (over) => ({
  slug: 's', name: 'N', firm: 'F', curated: true, stale: false, import: null, latest_quarter: '2026-06-30',
  last_filing_at: '2026-08-14', total_value: 1e9, positions: 10, top10_weight: 90, new_count: 1, exited_count: 0,
  top_holdings: [{ cusip: 'C', ticker: 'AAPL', issuer: 'APPLE', weight: 20 }], ...over,
})
const cards = [
  card({ slug: 'berkshire-hathaway', name: 'Warren Buffett', firm: 'Berkshire Hathaway', total_value: 299e9 }),
  card({ slug: 'scion-asset-management', name: 'Michael Burry', firm: 'Scion Asset Management', stale: true, latest_quarter: '2025-09-30', total_value: 0.9e9 }),
  ...Array.from({ length: 8 }, (_, i) => card({ slug: `fund-${i}`, name: `Manager ${i}`, firm: `Fund ${i}`, total_value: (i + 1) * 1e9 })),
]

let holders
vi.mock('../api/queries', () => ({
  useInvestors: ({ holds } = {}) => (holds ? { data: holders, isLoading: false } : { data: cards, isLoading: false, error: null }),
}))
vi.mock('../components/investors/SnapshotPanel', () => ({
  default: ({ slug }) => <p>Snapshot of {slug}</p>,
  ImportProgress: () => null,
}))

const renderPage = (route = '/investors') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <Routes><Route path="/investors" element={<Investors />} /></Routes>
    </MemoryRouter>,
  )

describe('Investors', () => {
  beforeEach(() => { holders = [] })

  it('states how many managers are tracked, the latest quarter and the lag', () => {
    renderPage()
    expect(screen.getByText('13F holdings of 10 tracked managers · latest quarter Q2 2026 · filings arrive up to 45 days after quarter end')).toBeInTheDocument()
  })

  it('shows the first 8 cards by value, then offers the rest', () => {
    renderPage()
    expect(screen.getAllByTestId('investor-card')).toHaveLength(8)
    fireEvent.click(screen.getByRole('button', { name: 'Show all 10' }))
    expect(screen.getAllByTestId('investor-card')).toHaveLength(10)
  })

  it('picks Berkshire by default and another investor on click', () => {
    renderPage()
    expect(screen.getByText('Snapshot of berkshire-hathaway')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Manager 7/ }))
    expect(screen.getByText('Snapshot of fund-7')).toBeInTheDocument()
  })

  it('keeps only stopped filers and says when they stopped', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Stopped filing' }))
    expect(screen.getAllByTestId('investor-card')).toHaveLength(1)
    expect(screen.getByText('No 13F since Q3 2025')).toBeInTheDocument()
  })

  it('searches by investor or firm and shows every match', () => {
    renderPage()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search investors' }), { target: { value: 'fund' } })
    expect(screen.getAllByTestId('investor-card')).toHaveLength(8)
    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull()
  })

  it('explains an empty search', () => {
    renderPage()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search investors' }), { target: { value: 'zzzz zzzz' } })
    expect(screen.getByText('No tracked investor matches “zzzz zzzz”.')).toBeInTheDocument()
  })

  it('switches to a table with the top-10 share column', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Table' }))
    const table = screen.getByRole('table')
    expect(within(table).getByRole('columnheader', { name: 'Top 10' })).toBeInTheDocument()
    expect(within(table).getAllByRole('row')).toHaveLength(11)
  })

  it('sorts by name', () => {
    renderPage()
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort investors' }), { target: { value: 'name' } })
    expect(within(screen.getAllByTestId('investor-card')[0]).getByText('Manager 0')).toBeInTheDocument()
  })

  it('states the 13F limits', () => {
    renderPage()
    expect(screen.getByText(/US-listed long positions and listed options/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `cd frontend && npx vitest run src/pages/Investors.test.jsx`.

- [ ] **Step 3: Implement**

`InvestorToolbar.jsx`:

```jsx
import { Input, Select, TBtn } from '../ui'
import { INVESTOR_GROUPS, INVESTOR_SORTS } from '../../lib/investors'

export default function InvestorToolbar({ group, onGroup, query, onQuery, sort, onSort, layout, onLayout }) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div role="group" aria-label="Show investors" className="flex items-center gap-0.5">
        {INVESTOR_GROUPS.map(([key, label]) => (
          <TBtn key={key} active={group === key} onClick={() => onGroup(key)}>{label}</TBtn>
        ))}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          type="search"
          aria-label="Search investors"
          placeholder="Investor, firm or ticker"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          className="w-56"
        />
        <Select aria-label="Sort investors" value={sort} onChange={(e) => onSort(e.target.value)}>
          {INVESTOR_SORTS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </Select>
        <div role="group" aria-label="Investor layout" className="flex items-center gap-0.5">
          <TBtn active={layout === 'cards'} onClick={() => onLayout('cards')}>Cards</TBtn>
          <TBtn active={layout === 'table'} onClick={() => onLayout('table')}>Table</TBtn>
        </div>
      </div>
    </div>
  )
}
```

`InvestorCards.jsx`:

```jsx
import { Card, InstrumentLogo } from '../ui'
import TickerInitial from '../discover/TickerInitial'
import { ImportProgress } from './SnapshotPanel'
import { UNKNOWN, fmtNum } from '../../lib/format'
import { fmtFiledDate, fmtUsdCompact, quarterLabel } from '../../lib/investors'

export function TopLogos({ holdings }) {
  return (
    <span className="flex -space-x-1.5">
      {holdings.map((h) => (
        <InstrumentLogo
          key={h.cusip}
          symbol={h.ticker}
          size={22}
          className="rounded-full ring-2 ring-zinc-900"
          fallback={<TickerInitial ticker={h.ticker ?? h.issuer} size={22} />}
        />
      ))}
    </span>
  )
}

export const movement = (c) => (c.new_count == null ? UNKNOWN : `+${c.new_count} new · −${c.exited_count} exited`)

export function LatestLine({ investor }) {
  if (!investor.latest_quarter) return <span className="text-zinc-500">No filings imported yet</span>
  if (investor.stale) return <span className="text-amber-400">{`No 13F since ${quarterLabel(investor.latest_quarter)}`}</span>
  return <span className="text-zinc-500">{`${quarterLabel(investor.latest_quarter)} · filed ${fmtFiledDate(investor.last_filing_at)}`}</span>
}

export default function InvestorCards({ investors, selected, onSelect }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2.5">
      {investors.map((c) => (
        <button
          key={c.slug}
          type="button"
          data-testid="investor-card"
          aria-pressed={c.slug === selected}
          onClick={() => onSelect(c.slug)}
          className="text-left rounded-lg focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          <Card interactive className={`h-full flex flex-col gap-2 ${c.slug === selected ? 'border-blue-500/60 bg-blue-500/[0.06]' : ''}`}>
            <div>
              <div className="text-[var(--fig-sm)] font-medium text-zinc-100">{c.name}</div>
              <div className="text-[var(--fig-xs)] text-zinc-500 truncate">{c.firm}</div>
            </div>
            <ImportProgress progress={c.import} />
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[var(--fig-md)] num font-mono text-zinc-50">{fmtUsdCompact(c.total_value)}</span>
              <span className="text-[var(--fig-xs)] num font-mono text-zinc-500">{c.positions == null ? UNKNOWN : `${fmtNum(c.positions)} pos`}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-[var(--fig-xs)]">
              <TopLogos holdings={c.top_holdings} />
              <span className="num font-mono text-zinc-400">{movement(c)}</span>
            </div>
            <div className="text-[var(--fig-xs)]"><LatestLine investor={c} /></div>
          </Card>
        </button>
      ))}
    </div>
  )
}
```

`InvestorTable.jsx`:

```jsx
import { Card, Td, Th, Tr } from '../ui'
import { LatestLine, TopLogos } from './InvestorCards'
import { UNKNOWN, fmtNum, fmtPct } from '../../lib/format'
import { fmtUsdCompact } from '../../lib/investors'

export default function InvestorTable({ investors, selected, onSelect }) {
  return (
    <Card padding={false}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-[var(--fig-sm)]">
          <thead className="text-[var(--fig-2xs)] uppercase tracking-wider text-zinc-500 border-b border-white/[0.06]">
            <tr>
              <Th edge>Investor</Th>
              <Th align="right">Value</Th>
              <Th align="right">Positions</Th>
              <Th>Top 3</Th>
              <Th align="right">Top 10</Th>
              <Th>vs prev. quarter</Th>
              <Th edge>Latest</Th>
            </tr>
          </thead>
          <tbody>
            {investors.map((c) => (
              <Tr key={c.slug} selected={c.slug === selected} className="cursor-pointer" onClick={() => onSelect(c.slug)}>
                <Td edge>
                  <div className="font-medium text-zinc-100">{c.name}</div>
                  <div className="text-[var(--fig-xs)] text-zinc-500">{c.firm}</div>
                </Td>
                <Td align="right" className="num font-mono text-zinc-200">{fmtUsdCompact(c.total_value)}</Td>
                <Td align="right" className="num font-mono text-zinc-400">{c.positions == null ? UNKNOWN : fmtNum(c.positions)}</Td>
                <Td><TopLogos holdings={c.top_holdings} /></Td>
                <Td align="right" className="num font-mono text-zinc-400">{fmtPct(c.top10_weight, { sign: false, decimals: 1 })}</Td>
                <Td className="num font-mono text-zinc-400">{c.new_count == null ? UNKNOWN : `+${c.new_count} · −${c.exited_count}`}</Td>
                <Td edge className="text-[var(--fig-xs)]"><LatestLine investor={c} /></Td>
              </Tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
```

`frontend/src/pages/Investors.jsx`:

```jsx
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { useInvestors } from '../api/queries'
import { Alert, Button, EmptyState, PageHeader, Skeleton } from '../components/ui'
import InvestorCards from '../components/investors/InvestorCards'
import InvestorTable from '../components/investors/InvestorTable'
import InvestorToolbar from '../components/investors/InvestorToolbar'
import LimitsNote from '../components/investors/LimitsNote'
import SnapshotPanel from '../components/investors/SnapshotPanel'
import { CARD_LIMIT, latestQuarter, looksLikeTicker, quarterLabel, visibleInvestors } from '../lib/investors'
import { useDebouncedValue } from '../lib/useDebouncedValue'

const DEFAULT_INVESTOR = 'berkshire-hathaway'

export default function Investors() {
  const [params, setParams] = useSearchParams()
  const [group, setGroup] = useState('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('value')
  const [layout, setLayout] = useState('cards')
  const [showAll, setShowAll] = useState(false)

  const { data: cards = [], isLoading, error } = useInvestors()
  const debounced = useDebouncedValue(query.trim())
  const holds = looksLikeTicker(debounced) ? debounced.toUpperCase() : ''
  const { data: holders = [] } = useInvestors({ holds })

  const visible = useMemo(
    () => visibleInvestors(cards, { group, query, sort, holderSlugs: new Set(holds ? holders.map((h) => h.slug) : []) }),
    [cards, group, query, sort, holds, holders],
  )

  const fallback = cards.some((c) => c.slug === DEFAULT_INVESTOR) ? DEFAULT_INVESTOR : visible[0]?.slug
  const selected = params.get('investor') ?? fallback
  const select = (slug) => setParams({ investor: slug }, { replace: true })

  const searching = query.trim() !== ''
  const shown = showAll || searching ? visible : visible.slice(0, CARD_LIMIT)
  const latest = latestQuarter(cards)

  if (error) return <Alert>Could not load investors. {error.message}</Alert>

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Investors"
        subtitle={`13F holdings of ${cards.length} tracked managers · latest quarter ${quarterLabel(latest)} · filings arrive up to 45 days after quarter end`}
      />
      <InvestorToolbar
        group={group}
        onGroup={(g) => { setGroup(g); setShowAll(false) }}
        query={query}
        onQuery={setQuery}
        sort={sort}
        onSort={setSort}
        layout={layout}
        onLayout={setLayout}
      />
      {isLoading ? (
        <Skeleton className="h-40" />
      ) : visible.length === 0 ? (
        <EmptyState title={`No tracked investor matches “${query}”.`} hint="Try a manager, a firm or a ticker they hold." />
      ) : layout === 'table' ? (
        <InvestorTable investors={visible} selected={selected} onSelect={select} />
      ) : (
        <>
          <InvestorCards investors={shown} selected={selected} onSelect={select} />
          {shown.length < visible.length && (
            <div className="flex items-center justify-between gap-3 text-[var(--fig-xs)] text-zinc-500">
              <span>{`Showing ${shown.length} of ${visible.length}`}</span>
              <Button size="sm" onClick={() => setShowAll(true)}>{`Show all ${visible.length}`}</Button>
            </div>
          )}
        </>
      )}
      {selected && <SnapshotPanel slug={selected} />}
      <LimitsNote />
    </div>
  )
}
```

Add the route and the sidebar item as listed under **Files**.

- [ ] **Step 4: Run** — `cd frontend && npx vitest run src/pages/Investors.test.jsx src/components && npx eslint src/pages/Investors.jsx src/components/investors src/components/Sidebar.jsx src/App.jsx`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Investors.jsx frontend/src/pages/Investors.test.jsx frontend/src/components/investors frontend/src/App.jsx frontend/src/components/Sidebar.jsx
git commit -m "feat(investors): /investors overview with list toolbar and snapshot"
```

---

### Task 11: `/investors/:slug` — quarter picker, Holdings and Changes tabs

**Files:**
- Create: `frontend/src/components/investors/HoldingsTab.jsx`, `ChangesTab.jsx`, `HoldingsTab.test.jsx`, `ChangesTab.test.jsx`, `frontend/src/pages/Investor.jsx`, `frontend/src/pages/Investor.test.jsx`
- Modify: `frontend/src/App.jsx` (`<Route path='investors/:slug' element={<Investor />} />`)

**Interfaces:**
- Consumes: `useInvestor`, `useInvestorChanges` (Task 4); helpers (Task 5); `InvestorStats`, `ChangeBadge`, `LimitsNote` (Task 6); `HoldingsTable` (Task 7).
- Produces: the investor page. URL state: `?quarter=YYYY-MM-DD` (absent = latest) and `?tab=holdings|changes` (absent = holdings).
  - `HoldingsTab({ detail })`: filter chips (`HOLDING_FILTERS`), a ticker/name search, `PAGE_SIZE` rows then "Show 25 more", footer "Showing N of M"; filter or search resets paging; empty → `EmptyState`.
  - `ChangesTab({ slug, quarter })`: four Cards (New / Added / Trimmed / Sold out) with counts; each row: logo + ticker (or issuer), right side the signed `value_change` and a detail line (new: `x% of portfolio`; added/trimmed: `shares ▲10%` / `shares ▼4%`; sold out: `was x%`); first stored quarter → `EmptyState` "First stored quarter — there is no earlier filing to compare against."

- [ ] **Step 1: Write the failing tests**

`HoldingsTab.test.jsx`:

```jsx
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import HoldingsTab from './HoldingsTab'

const holdings = Array.from({ length: 50 }, (_, i) => ({
  cusip: `C${i}`, ticker: `T${i}`, issuer: `Issuer ${i}`, put_call: i === 1 ? 'CALL' : '', shares: 10, value: 1000 - i,
  weight: 2, change: i < 3 ? 'new' : 'unchanged', shares_change_pct: null, quarters_held: 2, owned: i === 4, watched: false,
}))
const detail = { previous_quarter: '2026-03-31', holdings }

const renderTab = () => render(<MemoryRouter><HoldingsTab detail={detail} /></MemoryRouter>)
const bodyRows = () => screen.getAllByRole('row').length - 1

describe('HoldingsTab', () => {
  it('shows 15 rows, then 25 more at a time', () => {
    renderTab()
    expect(bodyRows()).toBe(15)
    expect(screen.getByText('Showing 15 of 50')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show 25 more' }))
    expect(bodyRows()).toBe(40)
    fireEvent.click(screen.getByRole('button', { name: 'Show 10 more' }))
    expect(bodyRows()).toBe(50)
    expect(screen.queryByRole('button', { name: /more/ })).toBeNull()
  })

  it('filters by chip and by search, starting the paging over', () => {
    renderTab()
    fireEvent.click(screen.getByRole('button', { name: 'New' }))
    expect(bodyRows()).toBe(3)
    fireEvent.click(screen.getByRole('button', { name: 'Options' }))
    expect(bodyRows()).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'Yours' }))
    expect(bodyRows()).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search holdings' }), { target: { value: 'issuer 4' } })
    expect(screen.getByText('Showing 11 of 11')).toBeInTheDocument()
  })

  it('explains an empty filter', () => {
    renderTab()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search holdings' }), { target: { value: 'zzz' } })
    expect(screen.getByText('No holding matches this filter.')).toBeInTheDocument()
  })
})
```

`ChangesTab.test.jsx`:

```jsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'

import ChangesTab from './ChangesTab'

let state
vi.mock('../../api/queries', () => ({ useInvestorChanges: () => state }))

const item = (over) => ({
  cusip: 'C', put_call: '', ticker: 'AAPL', issuer: 'APPLE INC', shares: 110, previous_shares: 100, shares_change_pct: 10,
  value: 700, previous_value: 600, value_change: 100, weight: 70, previous_weight: 54.55, ...over,
})

describe('ChangesTab', () => {
  it('groups changes with counts, value changes and share moves', () => {
    state = {
      isLoading: false, error: null,
      data: {
        quarter: '2026-06-30', previous_quarter: '2026-03-31',
        new: [item({ cusip: 'N', ticker: 'NVDA', previous_shares: null, shares_change_pct: null, previous_value: null, value_change: 200_000_000, weight: 20 })],
        added: [item({ value_change: 100_000_000 })],
        trimmed: [],
        sold_out: [item({ cusip: 'S', ticker: null, issuer: 'ALLY FINL INC', shares: null, value: null, value_change: -400_000_000, weight: null, previous_weight: 36.36, shares_change_pct: -100 })],
      },
    }
    render(<ChangesTab slug="berkshire-hathaway" />)
    const added = screen.getByRole('region', { name: 'Added' })
    expect(within(added).getByText('1')).toBeInTheDocument()
    expect(within(added).getByText('+$100M')).toBeInTheDocument()
    expect(within(added).getByText('shares ▲10%')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'New' })).getByText('20.0% of portfolio')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Sold out' })).getByText('ALLY FINL INC')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Sold out' })).getByText('was 36.4%')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Trimmed' })).getByText('None')).toBeInTheDocument()
  })

  it('explains a first stored quarter', () => {
    state = { isLoading: false, error: null, data: { quarter: '2021-12-31', previous_quarter: null, new: [], added: [], trimmed: [], sold_out: [] } }
    render(<ChangesTab slug="berkshire-hathaway" />)
    expect(screen.getByText('First stored quarter — there is no earlier filing to compare against.')).toBeInTheDocument()
  })
})
```

`frontend/src/pages/Investor.test.jsx`:

```jsx
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

import Investor from './Investor'

const detail = {
  slug: 'berkshire-hathaway', name: 'Warren Buffett', firm: 'Berkshire Hathaway', stale: false, import: null,
  quarters: ['2026-06-30', '2026-03-31'], quarter: '2026-06-30', previous_quarter: '2026-03-31', filed_on: '2026-08-14',
  total_value: 299253556246, positions: 1, top10_weight: 100, new_count: 0, exited_count: 0, turnover: 1.2,
  holdings: [{ cusip: 'C', ticker: 'AAPL', issuer: 'APPLE INC', put_call: '', shares: 1, value: 299253556246, weight: 100, change: 'unchanged', shares_change_pct: 0, quarters_held: 20, owned: false, watched: false }],
}
let lastQuarter
vi.mock('../api/queries', () => ({
  useInvestor: (slug, quarter) => { lastQuarter = quarter; return { data: detail, isLoading: false, error: null } },
  useInvestorChanges: () => ({ data: { quarter: '2026-06-30', previous_quarter: '2026-03-31', new: [], added: [], trimmed: [], sold_out: [] }, isLoading: false, error: null }),
}))

function Where() {
  const location = useLocation()
  return <p data-testid="where">{location.search}</p>
}

const renderPage = (route = '/investors/berkshire-hathaway') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <Routes><Route path="/investors/:slug" element={<><Investor /><Where /></>} /></Routes>
    </MemoryRouter>,
  )

describe('Investor', () => {
  it('heads the page with a back link, the name and the firm', () => {
    renderPage()
    expect(screen.getByRole('link', { name: '← Investors' })).toHaveAttribute('href', '/investors?investor=berkshire-hathaway')
    expect(screen.getByRole('heading', { name: 'Warren Buffett', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('Berkshire Hathaway')).toBeInTheDocument()
  })

  it('picks a quarter through the URL', () => {
    renderPage()
    fireEvent.change(screen.getByRole('combobox', { name: 'Quarter' }), { target: { value: '2026-03-31' } })
    expect(screen.getByTestId('where')).toHaveTextContent('quarter=2026-03-31')
    expect(lastQuarter).toBe('2026-03-31')
  })

  it('opens on Holdings and switches to Changes', () => {
    renderPage()
    expect(screen.getByRole('link', { name: 'AAPL' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Changes' }))
    expect(screen.getByTestId('where')).toHaveTextContent('tab=changes')
    expect(screen.getByRole('region', { name: 'New' })).toBeInTheDocument()
  })

  it('states the 13F limits', () => {
    renderPage()
    expect(screen.getByText(/US-listed long positions and listed options/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify they fail** — `cd frontend && npx vitest run src/components/investors/HoldingsTab.test.jsx src/components/investors/ChangesTab.test.jsx src/pages/Investor.test.jsx`.

- [ ] **Step 3: Implement**

`HoldingsTab.jsx`:

```jsx
import { useState } from 'react'

import { Button, EmptyState, Input, TBtn } from '../ui'
import HoldingsTable from './HoldingsTable'
import { HOLDING_FILTERS, PAGE_SIZE, PAGE_STEP, filterHoldings } from '../../lib/investors'

export default function HoldingsTab({ detail }) {
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [count, setCount] = useState(PAGE_SIZE)

  const matching = filterHoldings(detail.holdings, { filter, query })
  const shown = matching.slice(0, count)
  const next = Math.min(PAGE_STEP, matching.length - shown.length)

  const choose = (key) => { setFilter(key); setCount(PAGE_SIZE) }
  const search = (value) => { setQuery(value); setCount(PAGE_SIZE) }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div role="group" aria-label="Filter holdings" className="flex items-center gap-0.5 flex-wrap">
          {HOLDING_FILTERS.map(([key, label]) => (
            <TBtn key={key} active={filter === key} onClick={() => choose(key)}>{label}</TBtn>
          ))}
        </div>
        <Input
          type="search"
          aria-label="Search holdings"
          placeholder="Search ticker or name"
          value={query}
          onChange={(e) => search(e.target.value)}
          className="w-56"
        />
      </div>
      {matching.length === 0 ? (
        <EmptyState title="No holding matches this filter." />
      ) : (
        <HoldingsTable holdings={shown} showChange={detail.previous_quarter != null} />
      )}
      <div className="flex items-center justify-between gap-3 text-[var(--fig-xs)] text-zinc-500">
        <span>{`Showing ${shown.length} of ${matching.length}`}</span>
        {next > 0 && <Button size="sm" onClick={() => setCount(count + PAGE_STEP)}>{`Show ${next} more`}</Button>}
      </div>
    </div>
  )
}
```

`ChangesTab.jsx`:

```jsx
import { useId } from 'react'

import { useInvestorChanges } from '../../api/queries'
import { Alert, Card, EmptyState, InstrumentLogo, Skeleton } from '../ui'
import TickerInitial from '../discover/TickerInitial'
import { fmtPct } from '../../lib/format'
import { fmtUsdCompact, holdingLabel } from '../../lib/investors'

const share = (value) => fmtPct(value, { sign: false, decimals: 1 })
const move = (pct) => (pct == null ? '' : `shares ${pct >= 0 ? '▲' : '▼'}${Math.round(Math.abs(pct))}%`)

const DETAILS = {
  new: (i) => `${share(i.weight)} of portfolio`,
  added: (i) => move(i.shares_change_pct),
  trimmed: (i) => move(i.shares_change_pct),
  sold_out: (i) => `was ${share(i.previous_weight)}`,
}

const GROUPS = [['new', 'New'], ['added', 'Added'], ['trimmed', 'Trimmed'], ['sold_out', 'Sold out']]

function Group({ kind, title, items }) {
  const headingId = useId()
  return (
    <Card>
      <section aria-labelledby={headingId}>
        <h3 className="flex items-center gap-2 text-[var(--fig-sm)] font-medium text-zinc-200">
          <span id={headingId}>{title}</span>
          <span className="num font-mono text-zinc-500 font-normal">{items.length}</span>
        </h3>
        <ul className="mt-2 divide-y divide-white/[0.06]">
          {items.length === 0 && <li className="py-2 text-[var(--fig-xs)] text-zinc-500">None</li>}
          {items.map((i) => (
            <li key={`${i.cusip}-${i.put_call}`} className="py-2 flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 min-w-0">
                <InstrumentLogo symbol={i.ticker} size={20} className="rounded" fallback={<TickerInitial ticker={holdingLabel(i)} size={20} />} />
                <span className={`truncate ${i.ticker ? 'font-mono font-semibold text-zinc-100' : 'text-zinc-200'}`}>{holdingLabel(i)}</span>
              </span>
              <span className="flex flex-col items-end shrink-0">
                <span className="num font-mono text-zinc-200 text-[var(--fig-sm)]">{fmtUsdCompact(i.value_change, { sign: true })}</span>
                <span className="text-[var(--fig-2xs)] text-zinc-500">{DETAILS[kind](i)}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </Card>
  )
}

export default function ChangesTab({ slug, quarter }) {
  const { data, isLoading, error } = useInvestorChanges(slug, quarter)

  if (error) return <Alert>Could not load the changes. {error.message}</Alert>
  if (isLoading || !data) return <Skeleton className="h-40" />
  if (!data.previous_quarter) {
    return <EmptyState title="First stored quarter — there is no earlier filing to compare against." />
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[var(--fig-xs)] text-zinc-500">
        Value changes are quarter-end values as filed, so they include price moves; the share change shows what was bought or sold.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {GROUPS.map(([kind, title]) => <Group key={kind} kind={kind} title={title} items={data[kind]} />)}
      </div>
    </div>
  )
}
```

`frontend/src/pages/Investor.jsx`:

```jsx
import { Link, useParams, useSearchParams } from 'react-router-dom'

import { useInvestor } from '../api/queries'
import { Alert, Card, EmptyState, PageHeader, Select, Skeleton, TabButton, TabList } from '../components/ui'
import ChangesTab from '../components/investors/ChangesTab'
import HoldingsTab from '../components/investors/HoldingsTab'
import InvestorStats from '../components/investors/InvestorStats'
import LimitsNote from '../components/investors/LimitsNote'
import { ImportProgress } from '../components/investors/SnapshotPanel'
import { quarterLabel } from '../lib/investors'

const TABS = [['holdings', 'Holdings'], ['changes', 'Changes']]

export default function Investor() {
  const { slug } = useParams()
  const [params, setParams] = useSearchParams()
  const quarter = params.get('quarter') ?? undefined
  const tab = params.get('tab') === 'changes' ? 'changes' : 'holdings'
  const { data, isLoading, error } = useInvestor(slug, quarter)

  const update = (patch) => {
    const next = new URLSearchParams(params)
    Object.entries(patch).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)))
    setParams(next, { replace: true })
  }

  const back = (
    <Link to={`/investors?investor=${slug}`} className="inline-block text-[var(--fig-xs)] text-blue-400 hover:text-blue-300">
      ← Investors
    </Link>
  )

  if (error) return <div className="flex flex-col gap-3">{back}<Alert>Could not load this investor. {error.message}</Alert></div>
  if (isLoading || !data) return <div className="flex flex-col gap-3">{back}<Skeleton className="h-64" /></div>

  const subtitle = data.stale && data.quarter
    ? <>{data.firm} · <span className="text-amber-400">{`No 13F since ${quarterLabel(data.quarter)}`}</span></>
    : data.firm

  return (
    <div className="flex flex-col gap-4">
      {back}
      <PageHeader
        title={data.name}
        subtitle={subtitle}
        right={
          data.quarters.length > 0 && (
            <label className="flex items-center gap-2 text-[var(--fig-xs)] text-zinc-500">
              Quarter
              <Select aria-label="Quarter" value={data.quarter} onChange={(e) => update({ quarter: e.target.value === data.quarters[0] ? null : e.target.value })}>
                {data.quarters.map((q) => <option key={q} value={q}>{quarterLabel(q)}</option>)}
              </Select>
            </label>
          )
        }
      />
      <ImportProgress progress={data.import} />
      {data.quarter ? (
        <Card>
          <div className="flex flex-col gap-4">
            <InvestorStats detail={data} />
            <TabList>
              {TABS.map(([key, label]) => (
                <TabButton key={key} active={tab === key} onClick={() => update({ tab: key === 'holdings' ? null : key })}>{label}</TabButton>
              ))}
            </TabList>
            {tab === 'holdings' ? <HoldingsTab key={data.quarter} detail={data} /> : <ChangesTab slug={slug} quarter={quarter} />}
          </div>
        </Card>
      ) : (
        <EmptyState title={`Nothing imported for ${data.name} yet`} hint="The newest quarter appears here once its filing lands." />
      )}
      <LimitsNote />
    </div>
  )
}
```

Add the route as listed under **Files** (after the `investors` route).

Note: the Investor test changes the quarter to `2026-03-31`, which is not the first entry, so the URL gains `quarter=2026-03-31`; choosing the first (latest) entry clears the param.

- [ ] **Step 4: Run** — `cd frontend && npx vitest run && npx eslint src && npm run build`. Expected: the whole suite passes, lint clean, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/investors frontend/src/pages/Investor.jsx frontend/src/pages/Investor.test.jsx frontend/src/App.jsx
git commit -m "feat(investors): investor page with quarter picker, holdings and changes"
```

---

### Task 12: Screenshot review against live data, polish, docs

No new features. Requires the dev stack (`scripts/dev.sh`) and the Phase 1 data already in the dev DB.

- [ ] **Step 1: Screenshot** — follow the `saxodash-design-system` skill's harness recipe (JWT into `localStorage`, Playwright from an existing `~/.npm/_npx` install). Capture at 1440×1000 and 390×844:
  - `/investors` (Cards, default Berkshire snapshot in Grid), `/investors` with Table layout, the Donut view, the List view
  - `/investors?investor=scion-asset-management` (stopped filer), `/investors?investor=bridgewater-associates` (large), `/investors?investor=dalal-street-llc` (≤10 positions)
  - `/investors/berkshire-hathaway` Holdings, the same with `tab=changes`, and an older quarter via the picker
  Read every PNG.
- [ ] **Step 2: Critique** against `docs/design-system.md` and this plan's Global Constraints: one Card language; no green/red; badges per the change-badge rule; dashes for absent figures; tables scroll inside cards at 390 px; tiles at 2 columns on mobile; nothing overlapping or clipped; the donut legend readable.
- [ ] **Step 3: Fix** what the screenshots show (small, scoped changes only), re-run `cd frontend && npx vitest run && npx eslint src && npm run build`, re-screenshot the affected views.
- [ ] **Step 4: Docs** — add one paragraph to AGENTS.md's "Decided" section: *Investors pages read only `/api/investors/…`; turnover is opened + closed value over both quarters' value (no prices); change value deltas include price moves and always sit next to the share change; Phase 4 features (Add investor, Stop tracking, cross-investor panels) are deliberately absent until their backend exists.*
- [ ] **Step 5: Commit**

```bash
git add -A frontend/src AGENTS.md
git commit -m "polish(investors): screenshot review fixes and AGENTS.md entry"
```

---

## Self-review notes

- **Spec coverage (Phase 2):** sidebar entry → T10; `/investors` header subtitle → T10; toolbar chips/search/sort/Cards-Table → T10 (Phase-4 chip deferred, ruling 1); cards (value, positions, top-3 logos, +new/−exited, quarter + filed, stale line, first 8 + Show all, search shows all) → T10; table (value, positions, top 3, top-10 share, changes, latest) → T2 + T10; snapshot panel stats strip (value, positions, top-10, new · sold out, turnover, filed) → T1 + T2 + T6 + T9; Grid/Donut/List remembered → T5 + T8; remainder + Open full portfolio → T8; limits line → T6/T10/T11; investor page back link, header, quarter picker, stats strip, Holdings tab (columns, badges, Put/Call, filters, search, 15 + 25 paging, Research row, unresolved issuer) → T7 + T11; Changes tab grouped with value delta → T3 + T11; change-badge colours → T6; copy rule → Global Constraints.
- **Deferred by design:** Allocation/History tabs (Phase 3); Add investor, Stop tracking, Added-by-you chip, cross-investor panels, Research "Held by" (Phase 4).
