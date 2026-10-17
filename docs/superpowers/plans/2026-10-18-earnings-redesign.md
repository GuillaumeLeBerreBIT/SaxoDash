# Earnings Redesign (portfolio first) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Earnings page so it opens on the user's own holdings and watchlist reporting this week, with a day × session market grid and a day list whose rows fill in estimate → actual → surprise → price move.

**Architecture:** The one calendar endpoint stays; its cached Finnhub week is enriched per request from our own tables (`ScreenerRow`, `Position`, `WatchlistItem`) by a new `research/calendar_enrichment.py`, with price moves decided by a new pure `research/reaction.py`. Closes come from cached Saxo charts for the user's names and from a new `ScreenerRow.recent_closes` (written by the nightly scan) for the S&P 500 ∪ Nasdaq-100. The frontend page becomes a thin shell over four new components in `components/earnings/`, all ordered by one `rankEvents` helper.

**Tech Stack:** Django + DRF (`TestCase`), Vite + React 19 (JS), Tailwind, vitest + Testing Library, lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-18-earnings-redesign-design.md`

## Global Constraints

- Generated code carries **zero comments** (no docstrings either in new code). Leave existing comments in touched functions as they are; write none beside them. (AGENTS.md "Code style")
- No extra Finnhub calls: the calendar stays one Finnhub call per week (`research:earnings-week:<CACHE_V>:<monday>`).
- A missing figure is `null`, never `0` (market cap, move, weight, value). Frontend renders null as `—`.
- Money already in EUR (`value`, `pnl_impact`) renders with `fmtEur`; percents with `fmtPct`; market cap (Finnhub millions USD) with `fmtCompact`.
- Session words exactly: `Before open`, `After close`, `During hours`, `Time not set`.
- Move basis exactly `'1d'` / `'2d'`; `recent_closes` holds the last **15** sessions, oldest first, `[{"date": "YYYY-MM-DD", "close": float}]`.
- Grid cell shows at most **6** logos, then `+N more`.
- Share classes merge only on an identical, non-empty `ScreenerRow.name` on the same date.
- A new migration is not done until `manage.py migrate` has run against the dev database (AGENTS.md).
- Python: `PY=/Users/guillaumeleberre/Develop/GuillaumesLab/WebDevelopment/SaxoDash/backend/.venv/bin/python`; run backend commands from `backend/`, frontend commands from `frontend/` of the worktree `.worktrees/earnings-redesign`.
- Known pre-existing failures, not ours: `saxo.test_client…test_build_authorize_url_includes_client_id_and_state` and `saxo.test_views…test_valid_ticket_redirects_to_saxo_authorize_url_and_sets_session_state` (they expect the SIM URL while `.env` is LIVE). Every other backend test must pass.

## Review Focus

1. **A report today, before the open** — today's daily bar is still forming, so the move is "so far"; it must compute (not crash or null) and later requests refresh it (chart cache 15 min). Pinned in Task 1 (`test_bmo_today_uses_the_forming_bar`).
2. **A past week beyond the scan's 15 sessions** (week −3 … −8) — universe names have no closes that far back and must show `—`, while the user's names (60-bar charts) still get a move. Pinned in Task 3 (`test_universe_name_older_than_recent_closes_has_no_move`).
3. **Saxo disconnected** — `market.chart` raises `ProviderNotConnected`; the calendar must still answer 200 with moves from `recent_closes` or null. Pinned in Task 3 (`test_chart_failure_falls_back_to_recent_closes`).
4. **The nightly scan has never run** (no `ScreenerRow` rows) — every enrichment field is null, ranking falls back to revenue estimate, nothing merges. Pinned in Task 3 (`test_unknown_symbol_gets_nulls`) and Task 5 (`rankEvents` revenue fallback).
5. **A held position in a currency the total can't be expressed in / empty book** — `get_portfolio_value()` may raise `CurrencyMismatch` or be zero; `weight_pct` must be null, not a 500 or 0. Pinned in Task 3 (`test_weight_is_null_when_the_total_is_unavailable`).

---

## File Structure

Backend (`backend/research/`):
- Create `reaction.py` — pure: `(report_date, session, closes) → (move_pct, basis)`.
- Create `calendar_enrichment.py` — `enrich(events, today)`, `merge_share_classes(events)`, `next_mine(after)`.
- Modify `models.py` — `ScreenerRow.recent_closes`.
- Create `migrations/0013_screenerrow_recent_closes.py` (generated).
- Modify `technicals.py` — `technical_fields` also returns `recent_closes`.
- Modify `earnings.py` — `window_earnings` calls enrichment, merge, `next_mine`; `_week_stats` trimmed.
- Tests: create `test_reaction.py`, `test_calendar_enrichment.py`; modify `test_technicals.py`, `test_earnings_calendar.py`.

Frontend (`frontend/src/`):
- Modify `lib/earnings.js` — `sessionWords`, `rankEvents`, `buildWeekGrid`, `gridSessionKey`, `moveLabel`, `yourWeekTally`; spec in `lib/earnings.test.js`.
- Create `components/earnings/EarningsCells.jsx` (+ test) — `SurpriseChip`, `EpsCell`, `RevenueCell`, `MoveCell`, `CompanyCell`.
- Create `components/earnings/YourWeek.jsx` (+ test).
- Create `components/earnings/WeekGrid.jsx` and `DayStrip.jsx` (+ tests).
- Create `components/earnings/DayList.jsx` (+ test).
- Rewrite `pages/Earnings.jsx`; update `pages/Earnings.test.jsx`.

Docs: `AGENTS.md` (one "Decided" paragraph).

---

### Task 1: Price reaction rules (`research/reaction.py`)

**Files:**
- Create: `backend/research/reaction.py`
- Test: `backend/research/test_reaction.py`

**Interfaces:**
- Produces: `reaction.move(report_date: str, session: str | None, closes: list[tuple[str, float]]) -> tuple[float | None, str | None]` — closes are `(iso_date, close)` oldest first; returns `(pct rounded to 2dp, '1d' | '2d')` or `(None, None)`.

- [ ] **Step 1: Write the failing tests**

```python
from django.test import SimpleTestCase

from . import reaction

CLOSES = [
    ('2026-10-15', 100.0),
    ('2026-10-16', 110.0),
    ('2026-10-19', 99.0),
    ('2026-10-20', 121.0),
]


class MoveTest(SimpleTestCase):
    def test_before_open_compares_the_day_with_the_session_before(self):
        self.assertEqual(reaction.move('2026-10-16', 'bmo', CLOSES), (10.0, '1d'))

    def test_during_hours_is_judged_like_before_open(self):
        self.assertEqual(reaction.move('2026-10-16', 'dmh', CLOSES), (10.0, '1d'))

    def test_after_close_compares_the_next_session_with_the_day(self):
        self.assertEqual(reaction.move('2026-10-19', 'amc', CLOSES), (22.22, '1d'))

    def test_after_close_on_a_friday_reaches_over_the_weekend(self):
        self.assertEqual(reaction.move('2026-10-16', 'amc', CLOSES), (-10.0, '1d'))

    def test_no_session_spans_the_session_before_to_the_session_after(self):
        self.assertEqual(reaction.move('2026-10-16', None, CLOSES), (-1.0, '2d'))

    def test_after_close_with_no_next_session_yet_is_unknown(self):
        self.assertEqual(reaction.move('2026-10-20', 'amc', CLOSES), (None, None))

    def test_before_open_on_a_day_missing_from_the_closes_is_unknown(self):
        self.assertEqual(reaction.move('2026-10-17', 'bmo', CLOSES), (None, None))

    def test_no_earlier_session_is_unknown(self):
        self.assertEqual(reaction.move('2026-10-15', 'bmo', CLOSES), (None, None))

    def test_a_zero_base_close_is_unknown(self):
        closes = [('2026-10-15', 0.0), ('2026-10-16', 5.0)]
        self.assertEqual(reaction.move('2026-10-16', 'bmo', closes), (None, None))

    def test_empty_closes_are_unknown(self):
        self.assertEqual(reaction.move('2026-10-16', 'bmo', []), (None, None))

    def test_bmo_today_uses_the_forming_bar(self):
        closes = [('2026-10-19', 100.0), ('2026-10-20', 103.0)]
        self.assertEqual(reaction.move('2026-10-20', 'bmo', closes), (3.0, '1d'))
```

- [ ] **Step 2: Run to verify they fail**

Run: `$PY manage.py test research.test_reaction`
Expected: ERROR — `ImportError: cannot import name 'reaction'`.

- [ ] **Step 3: Implement**

```python
SAME_DAY_SESSIONS = frozenset({'bmo', 'dmh'})


def _pct(after, before):
    if after is None or not before:
        return None
    return round((after - before) / before * 100, 2)


def move(report_date, session, closes):
    previous = next((close for day, close in reversed(closes) if day < report_date), None)
    same_day = next((close for day, close in closes if day == report_date), None)
    following = next((close for day, close in closes if day > report_date), None)

    if session in SAME_DAY_SESSIONS:
        pct, basis = _pct(same_day, previous), '1d'
    elif session == 'amc':
        pct, basis = _pct(following, same_day), '1d'
    else:
        pct, basis = _pct(following, previous), '2d'
    return (pct, basis) if pct is not None else (None, None)
```

- [ ] **Step 4: Run to verify they pass**

Run: `$PY manage.py test research.test_reaction`
Expected: `OK` (11 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/research/reaction.py backend/research/test_reaction.py
git commit -m "feat(earnings): price reaction rules per report session"
```

---

### Task 2: `ScreenerRow.recent_closes` from the nightly scan

**Files:**
- Modify: `backend/research/models.py` (ScreenerRow, next to `sparkline`)
- Create: `backend/research/migrations/0013_screenerrow_recent_closes.py` (via makemigrations)
- Modify: `backend/research/technicals.py:66-86` (`technical_fields`)
- Test: `backend/research/test_technicals.py`, `backend/research/test_scan.py`

**Interfaces:**
- Produces: `ScreenerRow.recent_closes: list[{'date': str, 'close': float}]` (≤15, oldest first, default `[]`); `technicals.RECENT_CLOSES_LENGTH = 15`; `technical_fields(bars)['recent_closes']`.

- [ ] **Step 1: Write the failing tests**

In `backend/research/test_technicals.py`, add to the existing `technical_fields` test class (it already has a `bars_from` helper; read it first — if its bars carry no distinct `date`, build bars inline as below):

```python
    def test_recent_closes_keep_the_last_fifteen_sessions_with_dates(self):
        bars = [
            {'date': f'2026-09-{day:02d}', 'open': 1.0, 'high': 1.0, 'low': 1.0, 'close': float(day), 'volume': 1}
            for day in range(1, 21)
        ]
        fields = technicals.technical_fields(bars)
        self.assertEqual(len(fields['recent_closes']), 15)
        self.assertEqual(fields['recent_closes'][0], {'date': '2026-09-06', 'close': 6.0})
        self.assertEqual(fields['recent_closes'][-1], {'date': '2026-09-20', 'close': 20.0})

    def test_no_bars_means_no_recent_closes(self):
        self.assertEqual(technicals.technical_fields([])['recent_closes'], [])
```

In `backend/research/test_scan.py`, inside `ScanUniverseTest`, add (it reuses the module-level `BARS`, 260 bars):

```python
    def test_stores_the_recent_closes_it_already_fetched(self, search, chart, financials):
        self.search_for(search, {'AAPL': 211, 'BRK.B': 212})
        self.run_scan()
        stored = ScreenerRow.objects.get(ticker='AAPL').recent_closes
        self.assertEqual(len(stored), 15)
        self.assertEqual(stored[-1], {'date': BARS[-1]['date'], 'close': BARS[-1]['close']})
```

- [ ] **Step 2: Run to verify they fail**

Run: `$PY manage.py test research.test_technicals research.test_scan`
Expected: FAIL/ERROR — `KeyError: 'recent_closes'` and `AttributeError ... recent_closes`.

- [ ] **Step 3: Implement**

`backend/research/models.py`, in `ScreenerRow` directly after `sparkline = models.JSONField(default=list, blank=True)`:

```python
    recent_closes = models.JSONField(default=list, blank=True)
```

`backend/research/technicals.py`: next to `SPARKLINE_LENGTH = 63` add `RECENT_CLOSES_LENGTH = 15`, and in `technical_fields`, add this entry to the `fields` dict right after `'sparkline': ...`:

```python
        'recent_closes': [
            {'date': bar['date'], 'close': bar['close']} for bar in bars[-RECENT_CLOSES_LENGTH:]
        ],
```

Then:

```bash
$PY manage.py makemigrations research -n screenerrow_recent_closes
```

Expected: `research/migrations/0013_screenerrow_recent_closes.py` with one `AddField`.

- [ ] **Step 4: Run to verify they pass**

Run: `$PY manage.py test research.test_technicals research.test_scan`
Expected: `OK`.

- [ ] **Step 5: Apply to the dev database**

Run: `$PY manage.py migrate research`
Expected: `Applying research.0013_screenerrow_recent_closes... OK`. (The worktree's `.env` symlinks to the main checkout's, so this is the dev `db.sqlite3`. Another checkout running older code ignores the extra column.)

- [ ] **Step 6: Commit**

```bash
git add backend/research/models.py backend/research/technicals.py backend/research/migrations/0013_screenerrow_recent_closes.py backend/research/test_technicals.py backend/research/test_scan.py
git commit -m "feat(research): keep the scan's last 15 dated closes on ScreenerRow"
```

---

### Task 3: Calendar enrichment (`research/calendar_enrichment.py`)

**Files:**
- Create: `backend/research/calendar_enrichment.py`
- Test: `backend/research/test_calendar_enrichment.py`

**Interfaces:**
- Consumes: `reaction.move` (Task 1); `ScreenerRow.recent_closes` (Task 2); `market.chart(uic, asset_type, horizon, count)` → bars `[{'date', 'close', ...}]` oldest first, raises `ProviderError` subclasses; `portfolio.services.get_portfolio_value() -> Money(amount: Decimal, currency: str)`; `Position.value -> Decimal` (EUR), `Position.weight_of(total: Decimal) -> Decimal`.
- Produces: `calendar_enrichment.enrich(events: list[dict], today: date) -> list[dict]`. Each input event already has `symbol, date, session, held, watched, mine, eps_*`, `revenue_*`. Each output event adds `name, market_cap, sector, value, weight_pct, move_pct, move_basis, pnl_impact, also` (`also` is `[]`).

- [ ] **Step 1: Write the failing tests**

```python
from datetime import date
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase, override_settings

from core.money import CurrencyMismatch, Money
from portfolio.models import Position

from . import calendar_enrichment
from .models import ScreenerRow, Watchlist, WatchlistItem
from .providers import ProviderNotConnected

TODAY = date(2026, 10, 21)
CLOSES = [
    {'date': '2026-10-15', 'close': 100.0},
    {'date': '2026-10-16', 'close': 110.0},
    {'date': '2026-10-19', 'close': 99.0},
    {'date': '2026-10-20', 'close': 121.0},
]


def event(symbol, day='2026-10-16', session='bmo', held=False, watched=False):
    return {
        'symbol': symbol, 'date': day, 'session': session, 'quarter': 3, 'year': 2026,
        'eps_estimate': 1.0, 'eps_actual': None, 'revenue_estimate': 1e9, 'revenue_actual': None,
        'eps_surprise_pct': None, 'revenue_surprise_pct': None,
        'held': held, 'watched': watched, 'mine': held or watched,
    }


def bars(closes):
    return [{'date': c['date'], 'open': c['close'], 'high': c['close'], 'low': c['close'], 'close': c['close'], 'volume': 1} for c in closes]


@patch('research.calendar_enrichment.get_portfolio_value', return_value=Money(Decimal('1000'), 'EUR'))
@patch('research.calendar_enrichment.market.chart', return_value=[])
@override_settings(REPORTING_CURRENCY='EUR')
class EnrichTest(TestCase):
    def setUp(self):
        ScreenerRow.objects.create(
            ticker='AAPL', name='Apple Inc', sector='Technology', indexes='SP500',
            market_cap=3_500_000.0, recent_closes=CLOSES,
        )

    def hold(self, ticker, value, uic=None):
        return Position.objects.create(
            ticker=ticker, name=ticker, qty=1, avg_cost=1, current_price=value,
            sector='Tech', type='STOCK', color='#fff', uic=uic, asset_type='Stock' if uic else None,
        )

    def test_company_details_come_from_the_screener_row(self, chart, total):
        (out,) = calendar_enrichment.enrich([event('AAPL')], TODAY)
        self.assertEqual((out['name'], out['market_cap'], out['sector']), ('Apple Inc', 3_500_000.0, 'Technology'))
        self.assertEqual(out['also'], [])

    def test_unknown_symbol_gets_nulls(self, chart, total):
        (out,) = calendar_enrichment.enrich([event('ZZZZ')], TODAY)
        for field in ('name', 'market_cap', 'sector', 'value', 'weight_pct', 'move_pct', 'move_basis', 'pnl_impact'):
            self.assertIsNone(out[field], field)

    def test_blank_sector_is_null(self, chart, total):
        ScreenerRow.objects.filter(ticker='AAPL').update(sector='')
        (out,) = calendar_enrichment.enrich([event('AAPL')], TODAY)
        self.assertIsNone(out['sector'])

    def test_universe_move_comes_from_recent_closes(self, chart, total):
        (out,) = calendar_enrichment.enrich([event('AAPL')], TODAY)
        self.assertEqual((out['move_pct'], out['move_basis']), (10.0, '1d'))
        chart.assert_not_called()

    def test_a_future_report_has_no_move_and_no_chart_call(self, chart, total):
        self.hold('AAPL', 10, uic=211)
        (out,) = calendar_enrichment.enrich([event('AAPL', day='2026-10-23', held=True)], TODAY)
        self.assertIsNone(out['move_pct'])
        chart.assert_not_called()

    def test_holding_gets_value_weight_and_pnl_impact(self, chart, total):
        self.hold('AAPL', 100)
        (out,) = calendar_enrichment.enrich([event('AAPL', held=True)], TODAY)
        self.assertEqual(out['value'], 100.0)
        self.assertEqual(out['weight_pct'], 10.0)
        self.assertEqual(out['pnl_impact'], 10.0)

    def test_watchlist_name_gets_no_money_fields(self, chart, total):
        wl = Watchlist.objects.create(name='W')
        WatchlistItem.objects.create(watchlist=wl, symbol='AAPL', uic=211)
        (out,) = calendar_enrichment.enrich([event('AAPL', watched=True)], TODAY)
        self.assertIsNone(out['value'])
        self.assertIsNone(out['weight_pct'])
        self.assertIsNone(out['pnl_impact'])

    def test_my_names_are_moved_from_the_saxo_chart(self, chart, total):
        self.hold('MSFT', 50, uic=300)
        chart.return_value = bars([{'date': '2026-10-15', 'close': 200.0}, {'date': '2026-10-16', 'close': 210.0}])
        (out,) = calendar_enrichment.enrich([event('MSFT', held=True)], TODAY)
        self.assertEqual((out['move_pct'], out['move_basis']), (5.0, '1d'))
        chart.assert_called_once_with(300, 'Stock', calendar_enrichment.DAILY_HORIZON, calendar_enrichment.MINE_CHART_BARS)

    def test_a_watchlist_name_is_charted_by_its_uic(self, chart, total):
        wl = Watchlist.objects.create(name='W')
        WatchlistItem.objects.create(watchlist=wl, symbol='MSFT', uic=300, asset_type='Stock')
        calendar_enrichment.enrich([event('MSFT', watched=True)], TODAY)
        chart.assert_called_once_with(300, 'Stock', calendar_enrichment.DAILY_HORIZON, calendar_enrichment.MINE_CHART_BARS)

    def test_one_chart_call_per_symbol(self, chart, total):
        self.hold('MSFT', 50, uic=300)
        calendar_enrichment.enrich([event('MSFT', held=True), event('MSFT', day='2026-10-19', held=True)], TODAY)
        self.assertEqual(chart.call_count, 1)

    def test_chart_failure_falls_back_to_recent_closes(self, chart, total):
        self.hold('AAPL', 100, uic=211)
        chart.side_effect = ProviderNotConnected('no token')
        (out,) = calendar_enrichment.enrich([event('AAPL', held=True)], TODAY)
        self.assertEqual(out['move_pct'], 10.0)

    def test_universe_name_older_than_recent_closes_has_no_move(self, chart, total):
        (out,) = calendar_enrichment.enrich([event('AAPL', day='2026-09-01')], TODAY)
        self.assertIsNone(out['move_pct'])

    def test_weight_is_null_when_the_total_is_unavailable(self, chart, total):
        self.hold('AAPL', 100)
        for failure in (CurrencyMismatch('x'), None):
            with self.subTest(failure=failure):
                total.side_effect = failure
                total.return_value = Money(Decimal('0'), 'EUR')
                (out,) = calendar_enrichment.enrich([event('AAPL', held=True)], TODAY)
                self.assertIsNone(out['weight_pct'])
                self.assertEqual(out['value'], 100.0)

    def test_a_total_in_another_currency_gives_no_weight(self, chart, total):
        self.hold('AAPL', 100)
        total.return_value = Money(Decimal('1000'), 'USD')
        (out,) = calendar_enrichment.enrich([event('AAPL', held=True)], TODAY)
        self.assertIsNone(out['weight_pct'])
```

Note: check `core/money.py` for the exact exception name before running (`CurrencyMismatch` per AGENTS.md); check `Watchlist` creation fields in `research/models.py` (existing tests use `Watchlist.objects.create(name='Tech')`).

- [ ] **Step 2: Run to verify they fail**

Run: `$PY manage.py test research.test_calendar_enrichment`
Expected: ERROR — `ImportError: cannot import name 'calendar_enrichment'`.

- [ ] **Step 3: Implement**

```python
import logging

from django.conf import settings

from core.money import CurrencyMismatch
from portfolio.models import Position
from portfolio.services import get_portfolio_value

from . import market, reaction
from .models import ScreenerRow, WatchlistItem
from .providers import ProviderError

logger = logging.getLogger(__name__)

DAILY_HORIZON = 1440
MINE_CHART_BARS = 60


def _portfolio_total():
    try:
        total = get_portfolio_value()
    except CurrencyMismatch:
        logger.warning('portfolio total unavailable for earnings weights', exc_info=True)
        return None
    if total.currency != settings.REPORTING_CURRENCY or not total.amount:
        return None
    return total.amount


def _instruments():
    found = {}
    for item in WatchlistItem.objects.all():
        found.setdefault(item.symbol.upper(), (item.uic, item.asset_type or 'Stock'))
    for position in Position.objects.exclude(uic=None):
        found[position.ticker.upper()] = (position.uic, position.asset_type or 'Stock')
    return found


def _chart_closes(instrument):
    try:
        bars = market.chart(*instrument, DAILY_HORIZON, MINE_CHART_BARS)
    except ProviderError:
        logger.info('earnings move: no Saxo chart for %s', instrument)
        return []
    return [(bar['date'], bar['close']) for bar in bars]


def _row_closes(row):
    if row is None:
        return []
    return [(entry['date'], entry['close']) for entry in row.recent_closes or []]


class _Closes:
    def __init__(self, rows):
        self.rows = rows
        self.instruments = _instruments()
        self.memo = {}

    def for_event(self, symbol, mine):
        if symbol not in self.memo:
            closes = []
            if mine and symbol in self.instruments:
                closes = _chart_closes(self.instruments[symbol])
            self.memo[symbol] = closes or _row_closes(self.rows.get(symbol))
        return self.memo[symbol]


def enrich(events, today):
    symbols = {(event['symbol'] or '').upper() for event in events}
    rows = {row.ticker.upper(): row for row in ScreenerRow.objects.filter(ticker__in=symbols)}
    positions = {position.ticker.upper(): position for position in Position.objects.all()}
    total = _portfolio_total() if any(event['held'] for event in events) else None
    closes = _Closes(rows)
    today_iso = today.isoformat()

    enriched = []
    for event in events:
        symbol = (event['symbol'] or '').upper()
        row = rows.get(symbol)
        position = positions.get(symbol) if event['held'] else None

        move_pct, basis = (None, None)
        if event['date'] <= today_iso:
            move_pct, basis = reaction.move(event['date'], event['session'], closes.for_event(symbol, event['mine']))

        value = float(position.value) if position else None
        enriched.append({
            **event,
            'name': row.name if row and row.name else None,
            'market_cap': row.market_cap if row else None,
            'sector': row.sector if row and row.sector else None,
            'value': value,
            'weight_pct': float(position.weight_of(total)) if position and total else None,
            'move_pct': move_pct,
            'move_basis': basis,
            'pnl_impact': round(value * move_pct / 100, 2) if value is not None and move_pct is not None else None,
            'also': [],
        })
    return enriched
```

- [ ] **Step 4: Run to verify they pass**

Run: `$PY manage.py test research.test_calendar_enrichment`
Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git add backend/research/calendar_enrichment.py backend/research/test_calendar_enrichment.py
git commit -m "feat(earnings): enrich the calendar week with company, holding and move fields"
```

---

### Task 4: Share-class merge, `next_mine`, trimmed stats, wired into `window_earnings`

**Files:**
- Modify: `backend/research/calendar_enrichment.py` (add `merge_share_classes`, `next_mine`)
- Modify: `backend/research/earnings.py:144-208` (`_week_stats`, `window_earnings`)
- Test: `backend/research/test_calendar_enrichment.py`, `backend/research/test_earnings_calendar.py`

**Interfaces:**
- Consumes: `enrich` (Task 3).
- Produces: `merge_share_classes(events) -> list[dict]` (sorted by `(date, symbol)`); `next_mine(after: date) -> {'symbol': str, 'date': str} | None`; `window_earnings(...)` response `{'events', 'window', 'stats': {total, reported, beat, missed, inline, mine}, 'next_mine', 'ok'}`. Failure path unchanged: `{'events': [], 'window', 'ok': False}`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/research/test_calendar_enrichment.py`:

```python
def enriched(symbol, name=None, market_cap=None, held=False, watched=False, value=None, weight=None, move=None):
    return {
        **event(symbol, held=held, watched=watched),
        'name': name, 'market_cap': market_cap, 'sector': None,
        'value': value, 'weight_pct': weight, 'move_pct': move, 'move_basis': '1d' if move is not None else None,
        'pnl_impact': None, 'also': [],
    }


class MergeShareClassesTest(TestCase):
    def test_identical_names_on_one_date_merge_into_the_larger_class(self):
        out = calendar_enrichment.merge_share_classes([
            enriched('GOOG', 'Alphabet Inc', 2_000_000.0),
            enriched('GOOGL', 'Alphabet Inc', 2_100_000.0),
        ])
        self.assertEqual([(e['symbol'], e['also']) for e in out], [('GOOGL', ['GOOG'])])

    def test_equal_caps_break_the_tie_alphabetically(self):
        out = calendar_enrichment.merge_share_classes([
            enriched('GOOGL', 'Alphabet Inc', 1.0), enriched('GOOG', 'Alphabet Inc', 1.0),
        ])
        self.assertEqual(out[0]['symbol'], 'GOOG')

    def test_flags_are_or_ed_and_holdings_summed(self):
        out = calendar_enrichment.merge_share_classes([
            enriched('GOOGL', 'Alphabet Inc', 2.0, watched=True),
            enriched('GOOG', 'Alphabet Inc', 1.0, held=True, value=100.0, weight=4.0, move=10.0),
        ])
        (merged,) = out
        self.assertEqual((merged['held'], merged['watched'], merged['mine']), (True, False, True))
        self.assertEqual((merged['value'], merged['weight_pct']), (100.0, 4.0))

    def test_merged_pnl_impact_uses_the_lead_move_and_summed_value(self):
        (merged,) = calendar_enrichment.merge_share_classes([
            enriched('GOOGL', 'Alphabet Inc', 2.0, held=True, value=50.0, weight=2.0, move=4.0),
            enriched('GOOG', 'Alphabet Inc', 1.0, held=True, value=50.0, weight=2.0, move=9.0),
        ])
        self.assertEqual(merged['pnl_impact'], 4.0)

    def test_nothing_merges_without_a_name(self):
        out = calendar_enrichment.merge_share_classes([enriched('BRK.A'), enriched('BRK.B')])
        self.assertEqual(len(out), 2)

    def test_different_names_stay_apart(self):
        out = calendar_enrichment.merge_share_classes([enriched('A', 'One'), enriched('B', 'Two')])
        self.assertEqual(len(out), 2)


class NextMineTest(TestCase):
    def hold(self, ticker):
        Position.objects.create(
            ticker=ticker, name=ticker, qty=1, avg_cost=1, current_price=1,
            sector='Tech', type='STOCK', color='#fff',
        )

    def test_the_soonest_holding_report_after_the_window(self):
        self.hold('AAPL')
        self.hold('MSFT')
        ScreenerRow.objects.create(ticker='AAPL', name='Apple', indexes='SP500', next_earnings_date=date(2026, 10, 30))
        ScreenerRow.objects.create(ticker='MSFT', name='Microsoft', indexes='SP500', next_earnings_date=date(2026, 10, 28))
        ScreenerRow.objects.create(ticker='NVDA', name='Nvidia', indexes='SP500', next_earnings_date=date(2026, 10, 27))
        self.assertEqual(calendar_enrichment.next_mine(date(2026, 10, 25)), {'symbol': 'MSFT', 'date': '2026-10-28'})

    def test_none_when_no_holding_has_a_date(self):
        self.hold('ZZZZ')
        self.assertIsNone(calendar_enrichment.next_mine(date(2026, 10, 25)))
```

In `backend/research/test_earnings_calendar.py`, add (the class's existing `_row` and `_monday` helpers apply; `market.chart` must not be reached — no `uic` on these positions):

```python
    @patch('research.earnings.finnhub.get_earnings_calendar')
    def test_events_carry_the_enrichment_fields(self, mock_cal):
        from .models import ScreenerRow
        ScreenerRow.objects.create(ticker='AAPL', name='Apple Inc', indexes='SP500', market_cap=3.5e6)
        mock_cal.return_value = {'earningsCalendar': [self._row('AAPL', self._monday().isoformat())]}
        (only,) = earnings.window_earnings('all', 0)['events']
        self.assertEqual((only['name'], only['market_cap'], only['also']), ('Apple Inc', 3.5e6, []))

    @patch('research.earnings.finnhub.get_earnings_calendar')
    def test_share_classes_are_one_event_and_counted_once(self, mock_cal):
        from .models import ScreenerRow
        ScreenerRow.objects.create(ticker='GOOGL', name='Alphabet Inc', indexes='SP500', market_cap=2.1e6)
        ScreenerRow.objects.create(ticker='GOOG', name='Alphabet Inc', indexes='NDX', market_cap=2.0e6)
        mon = self._monday().isoformat()
        mock_cal.return_value = {'earningsCalendar': [self._row('GOOGL', mon), self._row('GOOG', mon)]}
        result = earnings.window_earnings('all', 0)
        self.assertEqual([e['symbol'] for e in result['events']], ['GOOGL'])
        self.assertEqual(result['stats']['total'], 1)

    @patch('research.earnings.finnhub.get_earnings_calendar')
    def test_stats_drop_the_tile_only_fields(self, mock_cal):
        mock_cal.return_value = {'earningsCalendar': []}
        stats = earnings.window_earnings('all', 0)['stats']
        self.assertEqual(set(stats), {'total', 'reported', 'beat', 'missed', 'inline', 'mine'})

    @patch('research.earnings.finnhub.get_earnings_calendar')
    def test_response_names_the_next_holding_report(self, mock_cal):
        mock_cal.return_value = {'earningsCalendar': []}
        self.assertIn('next_mine', earnings.window_earnings('all', 0))
```

Then find the existing stats test (`stats = earnings.window_earnings('all', 0)['stats']`, around line 150 of `test_earnings_calendar.py`) and delete any assertion on `avg_surprise` or `by_day`; keep its count assertions.

- [ ] **Step 2: Run to verify they fail**

Run: `$PY manage.py test research.test_calendar_enrichment research.test_earnings_calendar`
Expected: ERROR/FAIL — `AttributeError: ... has no attribute 'merge_share_classes'`, `KeyError: 'name'`, stats set mismatch.

- [ ] **Step 3: Implement**

Append to `backend/research/calendar_enrichment.py`:

```python
def _summed(values):
    present = [value for value in values if value is not None]
    return round(sum(present), 2) if present else None


def _merge(group):
    lead = min(group, key=lambda e: (-(e['market_cap'] or 0), e['symbol'] or ''))
    held = any(e['held'] for e in group)
    value = _summed(e['value'] for e in group)
    move_pct = lead['move_pct']
    return {
        **lead,
        'also': sorted(e['symbol'] for e in group if e is not lead),
        'held': held,
        'watched': not held and any(e['watched'] for e in group),
        'mine': any(e['mine'] for e in group),
        'value': value,
        'weight_pct': _summed(e['weight_pct'] for e in group),
        'pnl_impact': round(value * move_pct / 100, 2) if value is not None and move_pct is not None else None,
    }


def merge_share_classes(events):
    grouped = {}
    singles = []
    for event in events:
        if event.get('name'):
            grouped.setdefault((event['date'], event['name']), []).append(event)
        else:
            singles.append(event)
    merged = [group[0] if len(group) == 1 else _merge(group) for group in grouped.values()]
    return sorted(merged + singles, key=lambda e: (e['date'], e['symbol'] or ''))


def next_mine(after):
    held = [ticker.upper() for ticker in Position.objects.values_list('ticker', flat=True) if ticker]
    row = (
        ScreenerRow.objects.filter(ticker__in=held, next_earnings_date__gt=after)
        .order_by('next_earnings_date', 'ticker')
        .first()
    )
    return {'symbol': row.ticker, 'date': row.next_earnings_date.isoformat()} if row else None
```

In `backend/research/earnings.py`:

1. Add `from . import calendar_enrichment, finnhub` (replacing `from . import finnhub`).
2. In `_week_stats`, delete the `per_day` loop and the `'avg_surprise'` and `'by_day'` entries; leave the existing docstring's first sentence and delete only its `by_day` paragraph (that paragraph would now describe a field that is gone). Result body:

```python
    summary = _surprise_summary([e['eps_surprise_pct'] for e in events])
    return {
        'total': len(events),
        'reported': summary['reported'],
        'beat': summary['beat'],
        'missed': summary['missed'],
        'inline': summary['inline'],
        'mine': sum(1 for e in events if e.get('mine')),
    }
```

3. In `window_earnings`, set `today = today or date.today()` as the first line and use `current_week_start(today)`; after the `tagged` loop insert:

```python
    tagged = calendar_enrichment.merge_share_classes(calendar_enrichment.enrich(tagged, today))
```

and change the final return to:

```python
    return {
        'events': events,
        'window': window,
        'stats': _week_stats(events),
        'next_mine': calendar_enrichment.next_mine(end),
        'ok': True,
    }
```

- [ ] **Step 4: Run to verify they pass, plus the Dashboard's reader**

Run: `$PY manage.py test research portfolio`
Expected: `OK`. If an older `test_earnings_calendar` test fails on `get_portfolio_value` or `market.chart`, it is because a held row now reaches them: those tests create positions without `uic`, so `market.chart` is not called; `get_portfolio_value` reads the test DB and is safe. Fix the test data, not the code.

- [ ] **Step 5: Commit**

```bash
git add backend/research/calendar_enrichment.py backend/research/earnings.py backend/research/test_calendar_enrichment.py backend/research/test_earnings_calendar.py
git commit -m "feat(earnings): merge share classes, name the next holding report, trim week stats"
```

---

### Task 5: Frontend helpers in `lib/earnings.js`

**Files:**
- Modify: `frontend/src/lib/earnings.js`
- Test: `frontend/src/lib/earnings.test.js`

**Interfaces:**
- Consumes: the event shape from Task 4 (`held, watched, mine, weight_pct, market_cap, revenue_estimate, symbol, session, date, eps_actual, eps_surprise_pct, move_pct, move_basis`).
- Produces:
  - `sessionWords(session) -> string`
  - `rankEvents(events) -> events` (new array)
  - `gridSessionKey(session) -> 'bmo' | 'amc' | 'other'`
  - `GRID_SESSIONS: [key, label][]`
  - `buildWeekGrid(events) -> { days: [key, label][], sessions: [key, label][], cells: { [sessionKey]: { [dayKey]: events } } }`
  - `moveLabel(event) -> { text: string, basis: '1d' | '2d' } | null`
  - `yourWeekTally(events) -> { count, reported, beat }`
  - `weekdayKeyOf(iso) -> 'mon' … 'sun'`

- [ ] **Step 1: Write the failing tests**

Extend the import in `frontend/src/lib/earnings.test.js` with `buildWeekGrid, gridSessionKey, moveLabel, rankEvents, sessionWords, weekdayKeyOf, yourWeekTally`, then append:

```js
const e = (o = {}) => ({
  symbol: 'X', date: '2026-10-26', session: 'amc', held: false, watched: false, mine: false,
  weight_pct: null, market_cap: null, revenue_estimate: null, eps_actual: null, eps_surprise_pct: null,
  move_pct: null, move_basis: null, ...o,
})

describe('sessionWords', () => {
  it('says each session in words and admits an unset time', () => {
    expect(sessionWords('bmo')).toBe('Before open')
    expect(sessionWords('amc')).toBe('After close')
    expect(sessionWords('dmh')).toBe('During hours')
    expect(sessionWords(null)).toBe('Time not set')
  })
})

describe('rankEvents', () => {
  it('puts holdings by weight, then watchlist, then the market by cap', () => {
    const ranked = rankEvents([
      e({ symbol: 'BIG', market_cap: 9e6 }),
      e({ symbol: 'W', watched: true, mine: true, market_cap: 1 }),
      e({ symbol: 'H1', held: true, mine: true, weight_pct: 2 }),
      e({ symbol: 'H2', held: true, mine: true, weight_pct: 8 }),
    ])
    expect(ranked.map((r) => r.symbol)).toEqual(['H2', 'H1', 'W', 'BIG'])
  })

  it('ranks unknown caps last and falls back to revenue estimate', () => {
    const ranked = rankEvents([
      e({ symbol: 'NOCAP_SMALL', revenue_estimate: 1 }),
      e({ symbol: 'CAP', market_cap: 5 }),
      e({ symbol: 'NOCAP_BIG', revenue_estimate: 9 }),
    ])
    expect(ranked.map((r) => r.symbol)).toEqual(['CAP', 'NOCAP_BIG', 'NOCAP_SMALL'])
  })

  it('does not mutate its input', () => {
    const input = [e({ symbol: 'B', market_cap: 1 }), e({ symbol: 'A', market_cap: 2 })]
    rankEvents(input)
    expect(input[0].symbol).toBe('B')
  })
})

describe('buildWeekGrid', () => {
  it('lays a week out by session and weekday', () => {
    const grid = buildWeekGrid([
      e({ symbol: 'A', date: '2026-10-26', session: 'bmo' }),
      e({ symbol: 'B', date: '2026-10-28', session: 'amc' }),
    ])
    expect(grid.days.map(([k]) => k)).toEqual(['mon', 'tue', 'wed', 'thu', 'fri'])
    expect(grid.sessions.map(([k]) => k)).toEqual(['bmo', 'amc'])
    expect(grid.cells.bmo.mon.map((r) => r.symbol)).toEqual(['A'])
    expect(grid.cells.amc.wed.map((r) => r.symbol)).toEqual(['B'])
    expect(grid.cells.amc.mon).toEqual([])
  })

  it('adds the during-hours row only when the week has one', () => {
    const grid = buildWeekGrid([e({ session: 'dmh' }), e({ symbol: 'Y', session: null })])
    expect(grid.sessions.map(([k]) => k)).toEqual(['bmo', 'amc', 'other'])
    expect(grid.cells.other.mon).toHaveLength(2)
  })

  it('adds a weekend column only when it carries a report', () => {
    const grid = buildWeekGrid([e({ date: '2026-10-31' })])
    expect(grid.days.map(([k]) => k)).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat'])
  })

  it('ranks each cell', () => {
    const grid = buildWeekGrid([e({ symbol: 'S', market_cap: 1 }), e({ symbol: 'L', market_cap: 9 })])
    expect(grid.cells.amc.mon.map((r) => r.symbol)).toEqual(['L', 'S'])
  })
})

describe('gridSessionKey', () => {
  it('folds during-hours and unset into one row', () => {
    expect(gridSessionKey('bmo')).toBe('bmo')
    expect(gridSessionKey('dmh')).toBe('other')
    expect(gridSessionKey(undefined)).toBe('other')
  })
})

describe('weekdayKeyOf', () => {
  it('names the weekday of an ISO date', () => {
    expect(weekdayKeyOf('2026-10-26')).toBe('mon')
    expect(weekdayKeyOf('2026-11-01')).toBe('sun')
  })
})

describe('moveLabel', () => {
  it('is the signed move and its window', () => {
    expect(moveLabel(e({ move_pct: 3.21, move_basis: '1d' }))).toEqual({ text: '+3.2%', basis: '1d' })
    expect(moveLabel(e({ move_pct: -4, move_basis: '2d' }))).toEqual({ text: '-4.0%', basis: '2d' })
  })

  it('is null without a move', () => {
    expect(moveLabel(e())).toBeNull()
  })
})

describe('yourWeekTally', () => {
  it('counts only my names, reported and beating', () => {
    expect(
      yourWeekTally([
        e({ mine: true, eps_actual: 1, eps_surprise_pct: 5 }),
        e({ mine: true, eps_actual: 1, eps_surprise_pct: -2 }),
        e({ mine: true }),
        e({ eps_actual: 1, eps_surprise_pct: 9 }),
      ]),
    ).toEqual({ count: 3, reported: 2, beat: 1 })
  })
})
```

Check `fmtPct(-4, { decimals: 1 })` output in `lib/format.js` before running: if it renders a minus sign `−` rather than `-`, change the expected text to match `fmtPct` (the label must equal `fmtPct(move, { decimals: 1 })`).

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/earnings.test.js`
Expected: FAIL — `sessionWords is not a function` (and the rest).

- [ ] **Step 3: Implement**

In `frontend/src/lib/earnings.js`, change the format import to `import { fmtCompact, fmtDate, fmtPct } from './format'` and add:

```js
export function weekdayKeyOf(iso) {
  return KEY_BY_DOW[new Date(iso + 'T00:00:00').getDay()]
}

const SESSION_WORDS = { bmo: 'Before open', amc: 'After close', dmh: 'During hours' }

export function sessionWords(session) {
  return SESSION_WORDS[session] || 'Time not set'
}

const tier = (event) => (event.held ? 0 : event.watched ? 1 : 2)
const desc = (a, b) => (b ?? -Infinity) - (a ?? -Infinity)

export function rankEvents(events) {
  return [...events].sort(
    (a, b) =>
      tier(a) - tier(b) ||
      (tier(a) === 0 ? desc(a.weight_pct, b.weight_pct) : 0) ||
      desc(a.market_cap, b.market_cap) ||
      desc(a.revenue_estimate, b.revenue_estimate) ||
      String(a.symbol).localeCompare(String(b.symbol)),
  )
}

export const GRID_SESSIONS = [
  ['bmo', 'Before open'],
  ['amc', 'After close'],
  ['other', 'During hours / time not set'],
]

export function gridSessionKey(session) {
  return session === 'bmo' || session === 'amc' ? session : 'other'
}

export function buildWeekGrid(events) {
  const busyDays = new Set(events.map((event) => weekdayKeyOf(event.date)))
  const days = WEEKDAYS.filter(([key], index) => index < 5 || busyDays.has(key))
  const busySessions = new Set(events.map((event) => gridSessionKey(event.session)))
  const sessions = GRID_SESSIONS.filter(([key]) => key !== 'other' || busySessions.has('other'))

  const cells = Object.fromEntries(sessions.map(([s]) => [s, Object.fromEntries(days.map(([d]) => [d, []]))]))
  for (const event of events) cells[gridSessionKey(event.session)][weekdayKeyOf(event.date)].push(event)
  for (const [s] of sessions) for (const [d] of days) cells[s][d] = rankEvents(cells[s][d])
  return { days, sessions, cells }
}

export function moveLabel(event) {
  if (event.move_pct == null) return null
  return { text: fmtPct(event.move_pct, { decimals: 1 }), basis: event.move_basis }
}

export function yourWeekTally(events) {
  const mine = events.filter((event) => event.mine)
  const reported = mine.filter((event) => event.eps_actual != null)
  return {
    count: mine.length,
    reported: reported.length,
    beat: reported.filter((event) => event.eps_surprise_pct > 0).length,
  }
}
```

`groupByWeekday` may now use `weekdayKeyOf` internally; leave it otherwise unchanged.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/lib/earnings.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/earnings.js frontend/src/lib/earnings.test.js
git commit -m "feat(earnings): ranking, week grid and move helpers"
```

---

### Task 6: Shared cells (`components/earnings/EarningsCells.jsx`)

**Files:**
- Create: `frontend/src/components/earnings/EarningsCells.jsx`
- Test: `frontend/src/components/earnings/EarningsCells.test.jsx`

**Interfaces:**
- Consumes: `moveLabel`, `reportStatus`, `fmtRevenue` (lib/earnings); `surpriseSign` (lib/charts); `fmtNum`, `fmtPct`, `pctToneClass` (lib/format); `InstrumentLogo` (components/ui).
- Produces (named exports): `SurpriseChip({ sign, children })`, `EpsCell({ event })`, `RevenueCell({ event })`, `MoveCell({ event })`, `CompanyCell({ event, size = 20 })`.

- [ ] **Step 1: Write the failing tests**

```jsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { CompanyCell, EpsCell, MoveCell, RevenueCell } from './EarningsCells'

const ev = (o = {}) => ({
  symbol: 'AAPL', name: 'Apple Inc', date: '2099-01-01', session: 'amc',
  eps_estimate: 1.5, eps_actual: null, eps_surprise_pct: null,
  revenue_estimate: 2e9, revenue_actual: null, revenue_surprise_pct: null,
  move_pct: null, move_basis: null, also: [], ...o,
})

describe('EarningsCells', () => {
  it('an upcoming EPS shows the estimate marked e', () => {
    render(<EpsCell event={ev()} />)
    expect(screen.getByText('1.50')).toBeInTheDocument()
    expect(screen.getByText('e')).toBeInTheDocument()
  })

  it('a reported EPS shows the actual and a surprise chip', () => {
    render(<EpsCell event={ev({ eps_actual: 1.8, eps_surprise_pct: 20 })} />)
    expect(screen.getByText('1.80')).toBeInTheDocument()
    expect(screen.getByText(/▲/)).toHaveTextContent('20.0%')
  })

  it('a move shows its sign and window; no move is a dash', () => {
    const { rerender } = render(<MoveCell event={ev({ move_pct: -3.4, move_basis: '2d' })} />)
    expect(screen.getByText('2d')).toBeInTheDocument()
    rerender(<MoveCell event={ev()} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('revenue with nothing known is a dash', () => {
    render(<RevenueCell event={ev({ revenue_estimate: null })} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('the company cell shows ticker, name and merged share classes', () => {
    render(<CompanyCell event={ev({ also: ['GOOG'], symbol: 'GOOGL', name: 'Alphabet Inc' })} />)
    expect(screen.getByText('GOOGL')).toBeInTheDocument()
    expect(screen.getByText('Alphabet Inc')).toBeInTheDocument()
    expect(screen.getByText('+GOOG')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/components/earnings/EarningsCells.test.jsx`
Expected: FAIL — cannot resolve `./EarningsCells`.

- [ ] **Step 3: Implement**

Move `Chip`, `EpsCell` and `RevenueCell` out of `pages/Earnings.jsx` verbatim (rename `Chip` → `SurpriseChip`), then add `MoveCell` and `CompanyCell`:

```jsx
import { InstrumentLogo } from '../ui'
import { surpriseSign } from '../../lib/charts'
import { fmtRevenue, moveLabel, reportStatus } from '../../lib/earnings'
import { fmtNum, fmtPct, pctToneClass } from '../../lib/format'

const absPct = (v) => fmtPct(Math.abs(v), { sign: false, decimals: 1 })

export function SurpriseChip({ sign, children }) {
  const tone =
    sign > 0
      ? 'text-emerald-400 bg-emerald-500/10'
      : sign < 0
        ? 'text-red-400 bg-red-500/10'
        : 'text-zinc-400 bg-white/[0.06]'
  return (
    <span className={`text-[var(--fig-2xs)] num font-mono rounded-[3px] px-1 ${tone}`}>
      {sign > 0 ? '▲' : sign < 0 ? '▼' : '▬'} {children}
    </span>
  )
}

export function EpsCell({ event }) {
  if (event.eps_actual == null) {
    const pending = reportStatus(event) === 'pending'
    return (
      <span className={`text-[var(--fig-xs)] num font-mono ${pending ? 'text-amber-500' : 'text-zinc-400'}`}>
        {fmtNum(event.eps_estimate, 2)}
        <span className={pending ? 'text-amber-600' : 'text-zinc-600'}>{pending ? ' pending' : 'e'}</span>
      </span>
    )
  }
  const surprise = event.eps_surprise_pct
  return (
    <span className="flex items-baseline gap-1.5 justify-end">
      <span className="text-[var(--fig-xs)] num font-mono text-zinc-100">{fmtNum(event.eps_actual, 2)}</span>
      {surprise != null && <SurpriseChip sign={surpriseSign(surprise)}>{absPct(surprise)}</SurpriseChip>}
      {event.eps_estimate != null && (
        <span className="text-[var(--fig-2xs)] num font-mono text-zinc-600">est {fmtNum(event.eps_estimate, 2)}</span>
      )}
    </span>
  )
}

export function RevenueCell({ event }) {
  const { revenue_estimate: est, revenue_actual: act, revenue_surprise_pct: surprise } = event
  if (est == null && act == null) return <span className="text-[var(--fig-2xs)] text-zinc-600">—</span>
  if (act == null) {
    return (
      <span className="text-[var(--fig-2xs)] num font-mono text-zinc-500">
        {fmtRevenue(est)}
        <span className="text-zinc-600">e</span>
      </span>
    )
  }
  return (
    <span className="flex items-baseline gap-1.5 justify-end">
      <span className="text-[var(--fig-2xs)] num font-mono text-zinc-300">{fmtRevenue(act)}</span>
      {surprise != null && <SurpriseChip sign={surpriseSign(surprise)}>{absPct(surprise)}</SurpriseChip>}
    </span>
  )
}

export function MoveCell({ event }) {
  const move = moveLabel(event)
  if (!move) return <span className="text-[var(--fig-2xs)] text-zinc-600">—</span>
  return (
    <span className="flex items-baseline gap-1 justify-end">
      <span className={`text-[var(--fig-xs)] num font-mono ${pctToneClass(event.move_pct, 1)}`}>{move.text}</span>
      <span className="text-[var(--fig-2xs)] text-zinc-600">{move.basis}</span>
    </span>
  )
}

function LetterAvatar({ symbol, size }) {
  return (
    <span
      className="shrink-0 rounded bg-white/[0.06] text-zinc-400 text-[var(--fig-2xs)] font-semibold flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {(symbol || '?').slice(0, 1)}
    </span>
  )
}

export function CompanyCell({ event, size = 20 }) {
  return (
    <span className="flex items-center gap-2 min-w-0">
      <InstrumentLogo
        symbol={event.symbol}
        size={size}
        className="rounded"
        fallback={<LetterAvatar symbol={event.symbol} size={size} />}
      />
      <span className="flex flex-col leading-tight min-w-0">
        <span className="flex items-baseline gap-1">
          <span className={`text-[var(--fig-sm)] num font-mono font-semibold ${event.held ? 'text-blue-400' : 'text-zinc-100'}`}>
            {event.symbol}
          </span>
          {event.also?.length > 0 && (
            <span className="text-[var(--fig-2xs)] num font-mono text-zinc-600">+{event.also.join(' +')}</span>
          )}
        </span>
        {event.name && <span className="text-[var(--fig-2xs)] text-zinc-500 truncate">{event.name}</span>}
      </span>
    </span>
  )
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/components/earnings/EarningsCells.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/earnings/EarningsCells.jsx frontend/src/components/earnings/EarningsCells.test.jsx
git commit -m "feat(earnings): shared EPS, revenue, move and company cells"
```

---

### Task 7: The "Your week" band (`components/earnings/YourWeek.jsx`)

**Files:**
- Create: `frontend/src/components/earnings/YourWeek.jsx`
- Test: `frontend/src/components/earnings/YourWeek.test.jsx`

**Interfaces:**
- Consumes: `rankEvents`, `sessionWords`, `yourWeekTally`, `eventKey` (lib/earnings); `CompanyCell`, `EpsCell`, `MoveCell` (Task 6); `fmtEur`, `fmtPct`, `fmtDayMonth` (lib/format); `Card` (components/ui).
- Produces: default export `YourWeek({ events, nextMine, onOpen })` — `events` is the whole response's events (it filters `mine` itself); `nextMine` is `{symbol, date} | null`; `onOpen(symbol)`.

- [ ] **Step 1: Write the failing tests**

```jsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import YourWeek from './YourWeek'

const ev = (o = {}) => ({
  symbol: 'X', name: null, date: '2099-01-05', session: 'amc', quarter: 4, year: 2098,
  eps_estimate: 1, eps_actual: null, eps_surprise_pct: null,
  revenue_estimate: 1e9, revenue_actual: null, revenue_surprise_pct: null,
  held: false, watched: false, mine: false, weight_pct: null, value: null,
  market_cap: null, move_pct: null, move_basis: null, pnl_impact: null, also: [], ...o,
})

describe('YourWeek', () => {
  it('lists holdings before the watchlist and leaves the market out', () => {
    render(
      <YourWeek
        events={[
          ev({ symbol: 'WAT', watched: true, mine: true }),
          ev({ symbol: 'HLD', held: true, mine: true, weight_pct: 12.5, value: 5000 }),
          ev({ symbol: 'MKT' }),
        ]}
        nextMine={null}
        onOpen={() => {}}
      />,
    )
    const rows = screen.getAllByRole('button')
    expect(rows.map((r) => within(r).getByText(/^[A-Z]{3}$/).textContent)).toEqual(['HLD', 'WAT'])
    expect(screen.getByText('Held')).toBeInTheDocument()
    expect(screen.getByText('Watching')).toBeInTheDocument()
    expect(screen.getByText('12.5%')).toBeInTheDocument()
  })

  it('headlines the tally', () => {
    render(
      <YourWeek
        events={[
          ev({ symbol: 'AAA', held: true, mine: true, eps_actual: 2, eps_surprise_pct: 10 }),
          ev({ symbol: 'BBB', held: true, mine: true }),
        ]}
        nextMine={null}
        onOpen={() => {}}
      />,
    )
    expect(screen.getByText('2 of yours report · 1 reported, 1 beat')).toBeInTheDocument()
  })

  it('shows the P/L impact of a holding that moved', () => {
    render(
      <YourWeek
        events={[ev({ symbol: 'HLD', held: true, mine: true, value: 1000, move_pct: 5, move_basis: '1d', pnl_impact: 50 })]}
        nextMine={null}
        onOpen={() => {}}
      />,
    )
    expect(screen.getByText(/\+€50\.00|€\+50\.00|\+50\.00/)).toBeInTheDocument()
  })

  it('a quiet week names the next holding report', () => {
    render(<YourWeek events={[ev()]} nextMine={{ symbol: 'AAPL', date: '2026-10-30' }} onOpen={() => {}} />)
    expect(screen.getByText(/None of yours report this week\./)).toBeInTheDocument()
    expect(screen.getByText(/Next: AAPL/)).toBeInTheDocument()
  })

  it('a quiet week with nothing ahead says only that', () => {
    render(<YourWeek events={[]} nextMine={null} onOpen={() => {}} />)
    expect(screen.getByText('None of yours report this week.')).toBeInTheDocument()
  })

  it('opens the symbol', async () => {
    const onOpen = vi.fn()
    render(<YourWeek events={[ev({ symbol: 'HLD', held: true, mine: true })]} nextMine={null} onOpen={onOpen} />)
    await userEvent.click(screen.getByRole('button'))
    expect(onOpen).toHaveBeenCalledWith('HLD')
  })

  it('is titled Your week as a section heading', () => {
    render(<YourWeek events={[]} nextMine={null} onOpen={() => {}} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Your week' })).toBeInTheDocument()
  })
})
```

Before running, read `fmtEur(50, { sign: true })`'s actual output in `lib/format.js` and replace the P/L regex with that exact string.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/components/earnings/YourWeek.test.jsx`
Expected: FAIL — cannot resolve `./YourWeek`.

- [ ] **Step 3: Implement**

```jsx
import { Card } from '../ui'
import { eventKey, rankEvents, sessionWords, yourWeekTally } from '../../lib/earnings'
import { fmtDayMonth, fmtEur, fmtPct, pctToneClass } from '../../lib/format'
import { CompanyCell, EpsCell, MoveCell } from './EarningsCells'

const ROW_GRID =
  'grid-cols-[minmax(0,1fr)_88px_72px] md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_64px_minmax(0,1fr)_80px_88px]'
const weekday = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short' })

function headline({ count, reported, beat }) {
  const base = `${count} of yours report`
  return reported ? `${base} · ${reported} reported, ${beat} beat` : base
}

function QuietWeek({ nextMine }) {
  return (
    <p className="px-3.5 py-3 text-[var(--fig-sm)] text-zinc-500">
      None of yours report this week.
      {nextMine && (
        <>
          {' '}
          Next: <span className="num font-mono text-zinc-300">{nextMine.symbol}</span>,{' '}
          {weekday(nextMine.date)} {fmtDayMonth(nextMine.date)}
        </>
      )}
    </p>
  )
}

function YourRow({ event, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(event.symbol)}
      className={`w-full grid items-center ${ROW_GRID} gap-2.5 h-12 px-3.5 text-left hover:bg-white/[0.045] transition-colors`}
    >
      <span className="flex items-center gap-2 min-w-0">
        <CompanyCell event={event} />
        <span className={`text-[var(--fig-2xs)] ${event.held ? 'text-blue-500' : 'text-zinc-600'}`}>
          {event.held ? 'Held' : 'Watching'}
        </span>
      </span>
      <span className="hidden md:block text-[var(--fig-2xs)] text-zinc-400">
        {weekday(event.date)} · {sessionWords(event.session)}
      </span>
      <span className="hidden md:block text-right text-[var(--fig-2xs)] num font-mono text-zinc-400">
        {event.weight_pct == null ? '' : fmtPct(event.weight_pct, { sign: false, decimals: 1 })}
      </span>
      <span className="text-right">
        <EpsCell event={event} />
      </span>
      <span className="text-right">
        <MoveCell event={event} />
      </span>
      <span className={`hidden md:block text-right text-[var(--fig-2xs)] num font-mono ${pctToneClass(event.pnl_impact, 2)}`}>
        {event.pnl_impact == null ? '' : fmtEur(event.pnl_impact, { sign: true })}
      </span>
    </button>
  )
}

export default function YourWeek({ events, nextMine, onOpen }) {
  const mine = rankEvents(events.filter((event) => event.mine))
  const tally = yourWeekTally(events)
  return (
    <Card padding={false} className="mb-4">
      <div className="flex items-baseline justify-between gap-3 px-3.5 py-3 border-b border-white/[0.06]">
        <h2 className="text-[var(--fig-sm)] font-semibold text-zinc-100">Your week</h2>
        {mine.length > 0 && <span className="text-[var(--fig-2xs)] text-zinc-500">{headline(tally)}</span>}
      </div>
      {mine.length === 0 ? (
        <QuietWeek nextMine={nextMine} />
      ) : (
        mine.map((event) => <YourRow key={eventKey(event)} event={event} onOpen={onOpen} />)
      )}
    </Card>
  )
}
```

Check `Card` in `components/ui.jsx` accepts `className` (it does: `Card({ children, className = '', padding = true, ... })`). Check `fmtDayMonth` takes an ISO date string; if it takes a `Date`, pass `new Date(nextMine.date + 'T00:00:00')`.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/components/earnings/YourWeek.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/earnings/YourWeek.jsx frontend/src/components/earnings/YourWeek.test.jsx
git commit -m "feat(earnings): Your week band of holdings and watchlist"
```

---

### Task 8: Week grid and phone day strip

**Files:**
- Create: `frontend/src/components/earnings/WeekGrid.jsx`, `frontend/src/components/earnings/DayStrip.jsx`
- Test: `frontend/src/components/earnings/WeekGrid.test.jsx`, `frontend/src/components/earnings/DayStrip.test.jsx`

**Interfaces:**
- Consumes: `buildWeekGrid` output (Task 5), `dayDate`, `reportStatus`, `eventKey` (lib/earnings), `surpriseSign`, `BEAT`, `MISS`, `REPORTED`, `PENDING` (lib/charts), `InstrumentLogo` (ui).
- Produces:
  - `WeekGrid({ grid, windowFrom, selectedDay, onSelect, onOpen })` — `onSelect(dayKey, sessionKey | null)`, `onOpen(symbol)`. Exports `CELL_LIMIT = 6`.
  - `DayStrip({ days, counts, windowFrom, selectedDay, onSelect })` — `days: [key, label][]`, `counts: {[dayKey]: number}`, `onSelect(dayKey)`.

- [ ] **Step 1: Write the failing tests**

`WeekGrid.test.jsx`:

```jsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import WeekGrid, { CELL_LIMIT } from './WeekGrid'
import { buildWeekGrid } from '../../lib/earnings'

const ev = (symbol, o = {}) => ({
  symbol, date: '2026-10-26', session: 'bmo', held: false, watched: false, mine: false,
  market_cap: null, revenue_estimate: null, eps_actual: null, eps_surprise_pct: null, ...o,
})
const renderGrid = (events, props = {}) =>
  render(
    <WeekGrid
      grid={buildWeekGrid(events)}
      windowFrom="2026-10-26"
      selectedDay="mon"
      onSelect={props.onSelect || (() => {})}
      onOpen={props.onOpen || (() => {})}
    />,
  )

describe('WeekGrid', () => {
  it('shows at most six logos and a +N more for the rest', () => {
    renderGrid(Array.from({ length: 9 }, (_, i) => ev(`S${i}`)))
    expect(CELL_LIMIT).toBe(6)
    expect(screen.getAllByRole('button', { name: /^Open S\d$/ })).toHaveLength(6)
    expect(screen.getByRole('button', { name: '+3 more' })).toBeInTheDocument()
  })

  it('labels the session rows and counts each cell', () => {
    renderGrid([ev('A'), ev('B')])
    expect(screen.getByText('Before open')).toBeInTheDocument()
    expect(screen.getByText('After close')).toBeInTheDocument()
    expect(screen.getByLabelText('Mon before open: 2 reporting')).toBeInTheDocument()
  })

  it('a day header selects the day; +N more selects the cell', async () => {
    const onSelect = vi.fn()
    renderGrid(Array.from({ length: 7 }, (_, i) => ev(`S${i}`)), { onSelect })
    await userEvent.click(screen.getByRole('button', { name: /^Tue 27/ }))
    expect(onSelect).toHaveBeenLastCalledWith('tue', null)
    await userEvent.click(screen.getByRole('button', { name: '+1 more' }))
    expect(onSelect).toHaveBeenLastCalledWith('mon', 'bmo')
  })

  it('a logo opens its company', async () => {
    const onOpen = vi.fn()
    renderGrid([ev('AAPL')], { onOpen })
    await userEvent.click(screen.getByRole('button', { name: 'Open AAPL' }))
    expect(onOpen).toHaveBeenCalledWith('AAPL')
  })

  it('marks the selected day', () => {
    renderGrid([ev('A')])
    expect(screen.getByRole('button', { name: /^Mon 26/ })).toHaveAttribute('aria-pressed', 'true')
  })
})
```

`DayStrip.test.jsx`:

```jsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import DayStrip from './DayStrip'
import { WEEKDAYS } from '../../lib/earnings'

describe('DayStrip', () => {
  it('shows each day with its count and selects on tap', async () => {
    const onSelect = vi.fn()
    render(
      <DayStrip days={WEEKDAYS.slice(0, 5)} counts={{ mon: 4 }} windowFrom="2026-10-26" selectedDay="mon" onSelect={onSelect} />,
    )
    expect(screen.getByRole('button', { name: '4 reporting on Mon 26' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: '0 reporting on Wed 28' }))
    expect(onSelect).toHaveBeenCalledWith('wed')
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/components/earnings/WeekGrid.test.jsx src/components/earnings/DayStrip.test.jsx`
Expected: FAIL — cannot resolve modules.

- [ ] **Step 3: Implement**

`WeekGrid.jsx`:

```jsx
import { InstrumentLogo } from '../ui'
import { BEAT, MISS, PENDING, REPORTED, surpriseSign } from '../../lib/charts'
import { dayDate, eventKey, reportStatus } from '../../lib/earnings'

export const CELL_LIMIT = 6
const EDGE = [MISS, REPORTED, BEAT]

function edgeColor(event) {
  const status = reportStatus(event)
  if (status === 'reported') return EDGE[surpriseSign(event.eps_surprise_pct) + 1]
  if (status === 'pending') return PENDING
  return 'transparent'
}

function LogoTile({ event, onOpen }) {
  return (
    <button
      type="button"
      aria-label={`Open ${event.symbol}`}
      title={event.name ? `${event.symbol} · ${event.name}` : event.symbol}
      onClick={(e) => {
        e.stopPropagation()
        onOpen(event.symbol)
      }}
      className={`relative w-8 h-8 rounded-md bg-[#141418] border flex items-center justify-center overflow-hidden ${
        event.mine ? 'border-blue-500/60' : 'border-white/[0.06]'
      }`}
      style={{ boxShadow: `inset 0 -2px 0 ${edgeColor(event)}` }}
    >
      <InstrumentLogo
        symbol={event.symbol}
        size={22}
        className="rounded-sm"
        fallback={<span className="text-[9px] num font-mono text-zinc-400">{event.symbol.slice(0, 4)}</span>}
      />
    </button>
  )
}

function Cell({ dayKey, dayLabel, sessionKey, sessionLabel, events, selected, onSelect, onOpen }) {
  const shown = events.slice(0, CELL_LIMIT)
  const rest = events.length - shown.length
  return (
    <div
      aria-label={`${dayLabel} ${sessionLabel.toLowerCase()}: ${events.length} reporting`}
      onClick={() => events.length && onSelect(dayKey, sessionKey)}
      className={`relative min-h-[84px] rounded-lg border p-2 ${
        selected ? 'bg-[#15151a] border-blue-500/40' : 'bg-[#0e0e11] border-white/[0.06]'
      } ${events.length ? 'cursor-pointer' : 'opacity-40'}`}
    >
      {events.length > 0 && (
        <span className="absolute top-1.5 right-2 text-[var(--fig-2xs)] num font-mono text-zinc-500">{events.length}</span>
      )}
      <div className="flex flex-wrap gap-1.5 pr-5">
        {shown.map((event) => (
          <LogoTile key={eventKey(event)} event={event} onOpen={onOpen} />
        ))}
        {rest > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onSelect(dayKey, sessionKey)
            }}
            className="h-8 px-1.5 rounded-md text-[var(--fig-2xs)] num font-mono text-zinc-400 bg-white/[0.04] hover:text-zinc-100"
          >
            +{rest} more
          </button>
        )}
      </div>
    </div>
  )
}

export default function WeekGrid({ grid, windowFrom, selectedDay, onSelect, onOpen }) {
  const { days, sessions, cells } = grid
  const columns = `120px repeat(${days.length}, minmax(0,1fr))`
  return (
    <div className="mb-4">
      <div className="grid gap-2" style={{ gridTemplateColumns: columns }}>
        <span />
        {days.map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={selectedDay === key}
            onClick={() => onSelect(key, null)}
            className={`text-left text-[var(--fig-sm)] font-medium pb-1 border-b-2 ${
              selectedDay === key ? 'text-zinc-100 border-blue-500' : 'text-zinc-400 border-transparent hover:text-zinc-200'
            }`}
          >
            {label} {dayDate(windowFrom, key)}
          </button>
        ))}
        {sessions.map(([sessionKey, sessionLabel]) => (
          <div key={sessionKey} className="contents">
            <span className="self-center text-[var(--fig-2xs)] uppercase tracking-[0.08em] text-zinc-600">{sessionLabel}</span>
            {days.map(([dayKey, dayLabel]) => (
              <Cell
                key={dayKey}
                dayKey={dayKey}
                dayLabel={dayLabel}
                sessionKey={sessionKey}
                sessionLabel={sessionLabel}
                events={cells[sessionKey][dayKey]}
                selected={selectedDay === dayKey}
                onSelect={onSelect}
                onOpen={onOpen}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
```

`DayStrip.jsx`:

```jsx
import { dayDate } from '../../lib/earnings'

export default function DayStrip({ days, counts, windowFrom, selectedDay, onSelect }) {
  return (
    <div className="sticky top-0 z-10 -mx-4 px-4 py-2 mb-3 bg-[var(--bg,#09090b)] flex gap-1.5 overflow-x-auto">
      {days.map(([key, label]) => {
        const count = counts[key] || 0
        const date = dayDate(windowFrom, key)
        return (
          <button
            key={key}
            type="button"
            aria-pressed={selectedDay === key}
            aria-label={`${count} reporting on ${label} ${date}`}
            onClick={() => onSelect(key)}
            className={`shrink-0 min-w-[60px] h-11 rounded-lg border px-2 flex flex-col items-center justify-center ${
              selectedDay === key ? 'bg-[#15151a] border-blue-500/50 text-zinc-100' : 'bg-[#0e0e11] border-white/[0.06] text-zinc-400'
            } ${count ? '' : 'opacity-50'}`}
          >
            <span className="text-[var(--fig-2xs)]">{label} {date}</span>
            <span className="text-[var(--fig-2xs)] num font-mono">{count}</span>
          </button>
        )
      })}
    </div>
  )
}
```

The sticky strip's background must match the page's; read the body/page background token in `docs/design-system.md` and replace `bg-[var(--bg,#09090b)]` with it.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/components/earnings/WeekGrid.test.jsx src/components/earnings/DayStrip.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/earnings/WeekGrid.jsx frontend/src/components/earnings/WeekGrid.test.jsx frontend/src/components/earnings/DayStrip.jsx frontend/src/components/earnings/DayStrip.test.jsx
git commit -m "feat(earnings): day by session logo grid and phone day strip"
```

---

### Task 9: Day list (`components/earnings/DayList.jsx`)

**Files:**
- Create: `frontend/src/components/earnings/DayList.jsx`
- Test: `frontend/src/components/earnings/DayList.test.jsx`

**Interfaces:**
- Consumes: `rankEvents`, `splitBySession`, `eventKey`, `WEEKDAYS` (lib/earnings); `EpsCell`, `RevenueCell`, `MoveCell`, `CompanyCell` (Task 6); `fmtCompact` (lib/format); `Card`, `InfoTip` (ui); `BEAT`, `MISS`, `REPORTED`, `PENDING`, `surpriseSign`, `withAlpha` (lib/charts).
- Produces: default export `DayList({ day, events, scope, focusSession, onOpen, onViewAll })` — `events` are the selected day's; `focusSession` is `'bmo' | 'amc' | 'other' | null`; `onViewAll()` switches scope to all.

- [ ] **Step 1: Write the failing tests**

```jsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import DayList from './DayList'

const ev = (o = {}) => ({
  symbol: 'X', name: null, date: '2099-01-05', session: 'amc', quarter: 4, year: 2098,
  eps_estimate: 1, eps_actual: null, eps_surprise_pct: null,
  revenue_estimate: 1e9, revenue_actual: null, revenue_surprise_pct: null,
  held: false, watched: false, mine: false, market_cap: null,
  move_pct: null, move_basis: null, also: [], ...o,
})

describe('DayList', () => {
  it('ranks my names first, then by market cap, within a session', () => {
    render(
      <DayList
        day="mon"
        events={[ev({ symbol: 'SMALL', market_cap: 1 }), ev({ symbol: 'BIG', market_cap: 9 }), ev({ symbol: 'MINE', held: true, mine: true })]}
        scope="all"
        focusSession={null}
        onOpen={() => {}}
        onViewAll={() => {}}
      />,
    )
    const group = screen.getByRole('group', { name: 'After close' })
    expect(within(group).getAllByRole('button').map((b) => within(b).getByText(/^[A-Z]+$/).textContent)).toEqual(['MINE', 'BIG', 'SMALL'])
  })

  it('keeps every column before the report, as dashes', () => {
    render(<DayList day="mon" events={[ev({ symbol: 'UPC' })]} scope="all" focusSession={null} onOpen={() => {}} onViewAll={() => {}} />)
    const row = screen.getByRole('button', { name: /UPC/ })
    expect(within(row).getAllByText('—').length).toBeGreaterThanOrEqual(2)
  })

  it('shows market cap compactly', () => {
    render(<DayList day="mon" events={[ev({ symbol: 'CAP', market_cap: 3_500_000 })]} scope="all" focusSession={null} onOpen={() => {}} onViewAll={() => {}} />)
    expect(screen.getByText('3.5T')).toBeInTheDocument()
  })

  it('an empty day in Mine scope offers View all', async () => {
    const onViewAll = vi.fn()
    render(<DayList day="mon" events={[]} scope="mine" focusSession={null} onOpen={() => {}} onViewAll={onViewAll} />)
    await userEvent.click(screen.getByRole('button', { name: /View all/ }))
    expect(onViewAll).toHaveBeenCalled()
  })

  it('an empty day in All scope says nobody reports', () => {
    render(<DayList day="mon" events={[]} scope="all" focusSession={null} onOpen={() => {}} onViewAll={() => {}} />)
    expect(screen.getByText('No companies report this day.')).toBeInTheDocument()
  })

  it('labels its columns', () => {
    render(<DayList day="mon" events={[ev()]} scope="all" focusSession={null} onOpen={() => {}} onViewAll={() => {}} />)
    for (const label of ['Company', 'Mkt cap', 'Qtr', 'EPS · est', 'Revenue', 'Move']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })
})
```

Before running, check `fmtCompact(3_500_000)` in `lib/format.js` (input is millions); set the expected market-cap text to its real output.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/components/earnings/DayList.test.jsx`
Expected: FAIL — cannot resolve `./DayList`.

- [ ] **Step 3: Implement**

```jsx
import { memo, useEffect, useMemo, useRef } from 'react'
import { ChevronRight } from 'lucide-react'

import { Card, InfoTip } from '../ui'
import { BEAT, MISS, PENDING, REPORTED, surpriseSign, withAlpha } from '../../lib/charts'
import { WEEKDAYS, eventKey, rankEvents, reportStatus, splitBySession } from '../../lib/earnings'
import { fmtCompact } from '../../lib/format'
import { CompanyCell, EpsCell, MoveCell, RevenueCell } from './EarningsCells'

const EDGE = [withAlpha(MISS, 0.45), withAlpha(REPORTED, 0.45), withAlpha(BEAT, 0.45)]
const ROW_GRID =
  'grid-cols-[minmax(0,1fr)_96px_72px_14px] md:grid-cols-[minmax(0,1.4fr)_72px_64px_minmax(0,1fr)_minmax(0,0.8fr)_80px_14px]'
const PHONE_HIDDEN = 'hidden md:block'
const FOCUS_SECTION = { bmo: ['bmo'], amc: ['amc'], other: ['dmh', 'unset'] }
const weekdayLabel = (key) => (WEEKDAYS.find(([k]) => k === key) || ['', key])[1]

function edge(event) {
  const status = reportStatus(event)
  if (status === 'reported') return `inset 3px 0 0 ${EDGE[surpriseSign(event.eps_surprise_pct) + 1]}`
  if (status === 'pending') return `inset 3px 0 0 ${withAlpha(PENDING, 0.45)}`
  return 'none'
}

const DayRow = memo(function DayRow({ event, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(event.symbol)}
      className={`w-full grid items-center ${ROW_GRID} gap-2.5 h-12 pl-3 pr-3.5 text-left hover:bg-white/[0.045] transition-colors`}
      style={{
        borderLeft: `2px solid ${event.held ? REPORTED : event.watched ? withAlpha(REPORTED, 0.4) : 'transparent'}`,
        boxShadow: edge(event),
      }}
    >
      <CompanyCell event={event} />
      <span className={`${PHONE_HIDDEN} text-right text-[var(--fig-2xs)] num font-mono text-zinc-500`}>
        {event.market_cap == null ? '—' : fmtCompact(event.market_cap)}
      </span>
      <span className={`${PHONE_HIDDEN} text-[var(--fig-2xs)] num font-mono text-zinc-600 whitespace-nowrap`}>
        {event.quarter ? `Q${event.quarter} ${event.year ?? ''}`.trim() : ''}
      </span>
      <span className="text-right">
        <EpsCell event={event} />
      </span>
      <span className={`${PHONE_HIDDEN} text-right`}>
        <RevenueCell event={event} />
      </span>
      <span className="text-right">
        <MoveCell event={event} />
      </span>
      <span className="text-zinc-600 flex">
        <ChevronRight size={14} />
      </span>
    </button>
  )
})

function ColumnHeader() {
  return (
    <div
      className={`grid items-center ${ROW_GRID} gap-2.5 pl-3 pr-3.5 py-1.5 border-b border-white/[0.06] text-[var(--fig-2xs)] uppercase tracking-[0.08em] text-zinc-600`}
      style={{ borderLeft: '2px solid transparent' }}
    >
      <span>Company</span>
      <span className={`${PHONE_HIDDEN} text-right`}>Mkt cap</span>
      <span className={PHONE_HIDDEN}>Qtr</span>
      <span className="text-right">EPS · est</span>
      <span className={`${PHONE_HIDDEN} text-right`}>Revenue</span>
      <span className="text-right">Move</span>
      <span />
    </div>
  )
}

export default function DayList({ day, events, scope, focusSession, onOpen, onViewAll }) {
  const sections = useMemo(() => splitBySession(rankEvents(events)), [events])
  const refs = useRef({})

  useEffect(() => {
    if (!focusSession) return
    const target = FOCUS_SECTION[focusSession].map((key) => refs.current[key]).find(Boolean)
    target?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }, [focusSession, day])

  return (
    <Card padding={false}>
      <div className="flex items-center justify-between px-3.5 py-3 border-b border-white/[0.06]">
        <h2 className="flex items-center gap-1.5 text-[var(--fig-sm)] font-semibold text-zinc-100">
          {weekdayLabel(day)}
          <span className="text-zinc-600 font-normal"> · {events.length} reporting</span>
          <InfoTip>
            One row per company, your names first, then by market cap. A coloured left edge means it has
            reported: green beat consensus, red missed, blue in line; amber means the date has passed but no
            figure is posted yet. Move is the share price change across the report: 1d for a known session,
            2d when the time was not set.
          </InfoTip>
        </h2>
      </div>
      {events.length === 0 ? (
        <p className="px-4 py-9 text-center text-[var(--fig-sm)] text-zinc-500">
          {scope === 'mine' ? (
            <>
              Nothing on your lists reports this day.{' '}
              <button type="button" className="text-blue-400" onClick={onViewAll}>
                View all →
              </button>
            </>
          ) : (
            'No companies report this day.'
          )}
        </p>
      ) : (
        <>
          <ColumnHeader />
          {sections.map(({ key, label, rows }, i) => (
            <div key={key} role="group" aria-label={label} ref={(el) => (refs.current[key] = el)}>
              <div className={`px-3.5 pt-2.5 pb-1 text-[var(--fig-2xs)] uppercase tracking-[0.09em] text-zinc-600 ${i ? 'border-t border-white/[0.04]' : ''}`}>
                {label}
              </div>
              {rows.map((event) => (
                <DayRow key={eventKey(event)} event={event} onOpen={onOpen} />
              ))}
            </div>
          ))}
        </>
      )}
    </Card>
  )
}
```

Note `splitBySession` keeps input order inside each section, so ranking before splitting ranks each section.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/components/earnings/DayList.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/earnings/DayList.jsx frontend/src/components/earnings/DayList.test.jsx
git commit -m "feat(earnings): ranked day list with a move column"
```

---

### Task 10: Rewrite the page (`pages/Earnings.jsx`)

**Files:**
- Modify (rewrite): `frontend/src/pages/Earnings.jsx`
- Modify: `frontend/src/pages/Earnings.test.jsx`

**Interfaces:**
- Consumes: `useEarningsCalendar(scope, week)` → `{ data: { events, window, stats, next_mine, ok }, isLoading, error }`; `YourWeek`, `WeekGrid`, `DayStrip`, `DayList`; `buildWeekGrid`, `groupByWeekday`, `weekdayKey`, `weekLabel`, `currentWeekLabel` (lib/earnings); `Pill` (components/RangePills); `Card`, `PageHeader` (ui).

- [ ] **Step 1: Update the page tests first**

In `frontend/src/pages/Earnings.test.jsx`:

1. Add to `ev`'s defaults: `name: null, market_cap: null, value: null, weight_pct: null, move_pct: null, move_basis: null, pnl_impact: null, also: [],`. Replace `STATS` with `{ total: 1, reported: 0, beat: 0, missed: 0, inline: 0, mine: 0 }` and add `next_mine: null` to `stub`'s data.
2. Delete `shows the week-summary headline from the backend stats` and `shows the day of the month on each day card`.
3. In `labels every docket column and carries a reading-guide tooltip`, change the expected column labels to `Company`, `Mkt cap`, `Qtr`, `EPS · est`, `Revenue`, `Move`.
4. Every test that clicked a day card by `getByRole('button', { name: /^Mon 26/ })` keeps working: the grid's day headers carry the same accessible name, and the phone strip's chips are named `N reporting on Mon 26`, so the two never collide (jsdom renders both, since `md:hidden` is only CSS). If a phone-layout test (`collapses the docket rows…`, `wraps the week navigation…`) asserted day-card or `BulletBar` classes, rewrite it to assert the `md:` hidden columns on `DayList` rows (`Mkt cap`, `Qtr`, `Revenue` headers carry `hidden md:block`).
5. Add:

```jsx
it('opens with the Your week band above the market grid', () => {
  stub({ events: [ev({ symbol: 'HLD', held: true, mine: true }), ev({ symbol: 'MKT' })] })
  renderWithProviders(<Earnings />, { route: '/earnings' })
  const band = screen.getByRole('heading', { level: 2, name: 'Your week' })
  const grid = screen.getByText('Before open')
  expect(band.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

it('summarises the market week in one line', () => {
  stub({ stats: { total: 412, reported: 100, beat: 61, missed: 30, inline: 9, mine: 0 } })
  renderWithProviders(<Earnings />, { route: '/earnings' })
  expect(screen.getByText('412 reporting · 61% of reported beat')).toBeInTheDocument()
})

it('says nothing about beats before anything has reported', () => {
  stub({ stats: { total: 40, reported: 0, beat: 0, missed: 0, inline: 0, mine: 0 } })
  renderWithProviders(<Earnings />, { route: '/earnings' })
  expect(screen.getByText('40 reporting')).toBeInTheDocument()
})

it('the band ignores the Mine/All toggle and the list follows it', async () => {
  stub({ events: [ev({ symbol: 'HLD', held: true, mine: true })] })
  renderWithProviders(<Earnings />, { route: '/earnings' })
  await userEvent.click(screen.getByRole('button', { name: 'Mine' }))
  expect(queries.useEarningsCalendar).toHaveBeenLastCalledWith('mine', 0)
  expect(screen.getByRole('heading', { level: 2, name: 'Your week' })).toBeInTheDocument()
})

it('does not render the old summary tiles', () => {
  stub()
  renderWithProviders(<Earnings />, { route: '/earnings' })
  expect(screen.queryByText('Beat rate')).not.toBeInTheDocument()
  expect(screen.queryByText('Net by day')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/pages/Earnings.test.jsx`
Expected: FAIL — no "Your week" heading, old column labels.

- [ ] **Step 3: Rewrite `pages/Earnings.jsx`**

```jsx
import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { useEarningsCalendar } from '../api/queries'
import { Pill } from '../components/RangePills'
import DayList from '../components/earnings/DayList'
import DayStrip from '../components/earnings/DayStrip'
import WeekGrid from '../components/earnings/WeekGrid'
import YourWeek from '../components/earnings/YourWeek'
import { Card, PageHeader } from '../components/ui'
import { buildWeekGrid, currentWeekLabel, groupByWeekday, weekLabel, weekdayKey } from '../lib/earnings'

const MIN_WEEK = -8
const MAX_WEEK = 12
const NAV_BUTTON =
  'w-11 h-11 md:w-6 md:h-6 rounded border border-white/[0.08] bg-[#0e0e11] text-zinc-400 hover:text-zinc-100 disabled:opacity-40 flex items-center justify-center'

function marketLine({ total, reported, beat }) {
  const base = `${total} reporting`
  return reported ? `${base} · ${Math.round((beat / reported) * 100)}% of reported beat` : base
}

export default function Earnings() {
  const navigate = useNavigate()
  const [scope, setScope] = useState('all')
  const [week, setWeek] = useState(0)
  const [picked, setPicked] = useState(null)

  const { data, isLoading, error } = useEarningsCalendar(scope, week)
  const failed = Boolean(error) || (data != null && data.ok === false)
  const events = useMemo(() => data?.events || [], [data])

  const groups = useMemo(() => groupByWeekday(events), [events])
  const grid = useMemo(() => buildWeekGrid(events), [events])
  const counts = useMemo(() => Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length])), [groups])

  const autoDay = useMemo(() => {
    const wanted = week === 0 ? weekdayKey() : 'mon'
    if (groups[wanted]?.length) return wanted
    const firstBusy = grid.days.find(([k]) => groups[k]?.length)
    return firstBusy ? firstBusy[0] : wanted
  }, [week, groups, grid])
  const day = picked?.day ?? autoDay

  const openSymbol = useCallback((symbol) => navigate(`/research?symbol=${symbol}&tab=earnings`), [navigate])
  const select = useCallback((dayKey, session = null) => setPicked({ day: dayKey, session }), [])
  const shiftWeek = (delta) => {
    setWeek((w) => Math.max(MIN_WEEK, Math.min(MAX_WEEK, w + delta)))
    setPicked(null)
  }
  const resetWeek = () => {
    setWeek(0)
    setPicked(null)
  }

  return (
    <div>
      <PageHeader
        title="Earnings"
        subtitle="Your names first, then the US market week"
        right={
          <div className="flex items-center gap-1 bg-[#0e0e11] border border-white/[0.07] rounded-lg p-0.5">
            <Pill active={scope === 'all'} onClick={() => setScope('all')}>All</Pill>
            <Pill active={scope === 'mine'} onClick={() => setScope('mine')}>Mine</Pill>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2.5 mb-3">
        <button type="button" onClick={() => shiftWeek(-1)} disabled={week <= MIN_WEEK} aria-label="Previous week" className={NAV_BUTTON}>
          <ChevronLeft size={13} />
        </button>
        <span className="text-[var(--fig-sm)] num font-mono font-semibold text-zinc-200 md:min-w-[200px]">
          {weekLabel(data?.window)}
        </span>
        <button type="button" onClick={() => shiftWeek(1)} disabled={week >= MAX_WEEK} aria-label="Next week" className={NAV_BUTTON}>
          <ChevronRight size={13} />
        </button>
        {week !== 0 && (
          <button
            type="button"
            onClick={resetWeek}
            className="h-11 md:h-6 px-2 rounded border border-white/[0.08] bg-[#0e0e11] text-[var(--fig-xs)] text-zinc-400 hover:text-zinc-100"
          >
            {currentWeekLabel()}
          </button>
        )}
      </div>

      {isLoading && (
        <Card>
          <p className="text-[var(--fig-xs)] text-zinc-500">Loading…</p>
        </Card>
      )}

      {!isLoading && failed && (
        <Card>
          <p className="text-[var(--fig-sm)] text-red-400">Couldn’t load the earnings calendar.</p>
        </Card>
      )}

      {!isLoading && !failed && data && (
        <>
          <div className="md:hidden">
            <DayStrip days={grid.days} counts={counts} windowFrom={data.window?.from} selectedDay={day} onSelect={select} />
          </div>

          <YourWeek events={events} nextMine={data.next_mine} onOpen={openSymbol} />

          {data.stats && (
            <p className="mb-2 text-[var(--fig-2xs)] text-zinc-500">{marketLine(data.stats)}</p>
          )}

          <div className="hidden md:block">
            <WeekGrid grid={grid} windowFrom={data.window?.from} selectedDay={day} onSelect={select} onOpen={openSymbol} />
          </div>

          <DayList
            day={day}
            events={groups[day] || []}
            scope={scope}
            focusSession={picked?.session ?? null}
            onOpen={openSymbol}
            onViewAll={() => setScope('all')}
          />
        </>
      )}
    </div>
  )
}
```

Keep `dayDate`, `groupByWeekday` and `splitBySession` in `lib/earnings.js`: the new components use them. Delete `components/BulletBar.jsx` and `components/research/SurpriseBars.jsx` **only if** `grep -rn "BulletBar\|SurpriseBars" frontend/src` shows no other importer; otherwise leave them.

- [ ] **Step 4: Run the page tests, the whole suite and lint**

Run: `npx vitest run src/pages/Earnings.test.jsx && npx vitest run && npx eslint src`
Expected: all PASS, eslint clean. `expectValidHeadingOutline` (the h1 test) passes: h1 page title, h2 "Your week", h2 day list heading.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Earnings.jsx frontend/src/pages/Earnings.test.jsx frontend/src/lib/earnings.js
git commit -m "feat(earnings): portfolio-first page — Your week, week grid, day list"
```

---

### Task 11: Visual review, docs, final verification

**Files:**
- Modify: `AGENTS.md` (add one paragraph at the end of "## Decided")
- Possibly modify: the components from Tasks 6–10 (visual fixes only)

- [ ] **Step 1: Screenshot review**

Invoke the `saxodash-design-system` skill and follow its critique → implement → screenshot → fix recipe (stubbed API, as it describes) for `/earnings` at desktop (1440px) and phone (390px) widths, with: a week with 3 holdings + 2 watchlist names reporting (one reported beat with a move, one pending, one upcoming), a quiet week with `next_mine`, and a Mine-scope empty day. Fix spacing, contrast and overflow it surfaces; no horizontal page scroll at 390px. Re-run `npx vitest run src/components/earnings src/pages/Earnings.test.jsx` after any change.

- [ ] **Step 2: Add the AGENTS.md "Decided" paragraph**

```markdown
**The Earnings page is portfolio first, and a move says which window it measured.** The calendar
endpoint still makes one Finnhub call per week; `research/calendar_enrichment.py` adds name, market
cap and sector from `ScreenerRow`, value and weight from `Position`, and a price move per event after
the cache. `research/reaction.py` is the only place a move is defined: before open or during hours,
the day's close against the session before; after close, the next session against the day; no session,
the next session against the session before, labelled `2d`. Closes come from cached Saxo charts for the
user's names and from `ScreenerRow.recent_closes` (the nightly scan's last 15 sessions) for the
S&P 500 ∪ Nasdaq-100, so a universe name older than three weeks, or outside the universe, has no move
rather than a guessed one. Share classes merge only on an identical `ScreenerRow.name` on one date.
On a weekend, week 0 is the coming week (`earnings.current_week_start`).
```

- [ ] **Step 3: Full verification**

Run, from the worktree:

```bash
cd backend && $PY manage.py test 2>&1 | grep -E "^(Ran|OK|FAILED|FAIL:|ERROR:)"
cd ../frontend && npx vitest run 2>&1 | tail -4 && npx eslint src && npx vite build 2>&1 | tail -3
cd ../backend && $PY manage.py migrate --check
```

Expected: backend fails only the two known `saxo` SIM-URL tests listed in Global Constraints; frontend all pass; eslint clean; build succeeds; `migrate --check` exits 0.

- [ ] **Step 4: Live check against the dev data**

Run `$PY manage.py shell -c "from research.earnings import window_earnings; r = window_earnings('all', -1); print(r['stats'], sum(e['move_pct'] is not None for e in r['events']), r['next_mine'])"`. Expected: stats without `by_day`; a non-zero move count once the nightly scan (or Discover → Refresh) has filled `recent_closes` — if it is 0, say so in the hand-off rather than treating it as a pass.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md frontend/src
git commit -m "docs: record the portfolio-first Earnings decisions; visual polish"
```

- [ ] **Step 6: Learning record**

If anything in Tasks 1–11 surprised you (a behaviour that contradicted the obvious reading), append `learning/learning-records/NNNN-<slug>.md` per AGENTS.md; skip if it was routine.
