# Dashboard command centre — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One `GET /api/portfolio/insights/` endpoint that aggregates portfolio intelligence from data already in the app, and a reorganised Dashboard that leads with a value hero, deltas, a "needs attention" band, movers/contributors charts, upcoming earnings, and a sector/currency exposure card beside the kept allocation pie.

**Architecture:** New `portfolio/insights.py` composes the payload from `Position`, `core.NetWorthSnapshot`, and a best-effort function-level call into `research.earnings` (avoids the `portfolio ↔ research` module cycle). One thin `PortfolioInsightsView`. Frontend adds `usePortfolioInsights` and six small `components/dashboard/*` presentational components, then rewires `pages/Dashboard.jsx` render order. All change metrics are end-of-day (Saxo SIM has no quote feed).

**Tech Stack:** Django REST Framework; Vite + React 19 (JS, not TS), TanStack Query, Recharts, Lucide, Tailwind v4; vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-10-dashboard-command-center-design.md` — read alongside this plan.

## Global Constraints

- **No new data provider, no new model, no new sync.** `insights.py` only reads existing tables + one already-cached `research.earnings` call.
- **Change metrics are end-of-day**, from `NetWorthSnapshot` (written once/day). Never labelled "live" or "today" without the end-of-day qualifier.
- **`null` / empty / loading stay visually distinct**: `—` for a null delta, explicit empty-state lines, `Skeleton` for loading. No fake data as real.
- **Best-effort earnings:** any failure in the earnings call ⇒ `upcoming_earnings: null`, HTTP 200, rest of the payload intact. Same spirit as `analytics/report.py`'s benchmark block.
- **Charts kept and added** — the allocation pie is untouched; this slice only adds visualisation.
- **Money in the payload** is Decimal (DRF serialises to string, matching `PortfolioSummaryView`); **percentages** are rounded floats.
- **Testing:** backend `manage.py test`, frontend `npm test` + `npm run lint` + `npm run build` all green at the end of every task. Commit style: `type: summary` ending `Claude-Session: https://claude.ai/code/session_01PybJQDy4bPtNvqd9tzRJ4v`. Branch `dashboard-command-center` (already created).

---

## File Structure

**Backend (`backend/`):**
- `portfolio/insights.py` — CREATE: thresholds, `_value_block`, `_day`/`_trailing`/`_ytd`/`_all_time` deltas, `_concentration`, `_exposure`, `_movers`, `_contributors`, `_attention`, `_upcoming_earnings`, `build_insights`.
- `portfolio/views.py` — MODIFY: `PortfolioInsightsView`.
- `portfolio/urls.py` — MODIFY: route `insights/`.
- `portfolio/tests.py` — MODIFY: `InsightsHelpersTest`, `InsightsAttentionTest`, `UpcomingEarningsTest`, `BuildInsightsTest`, `PortfolioInsightsViewTest`.

**Frontend (`frontend/src/`):**
- `api/client.js` — MODIFY: `getPortfolioInsights`.
- `api/queries.js` — MODIFY: `queryKeys.portfolioInsights`, `usePortfolioInsights`.
- `lib/charts.js` — MODIFY: export `SECTOR_PALETTE` (lifted from `pages/Portfolio.jsx`).
- `pages/Portfolio.jsx` — MODIFY: import `SECTOR_PALETTE` from `lib/charts` instead of its local const.
- `components/dashboard/HeroValue.jsx`, `AttentionBand.jsx`, `MoversCard.jsx`, `ContributorsCard.jsx`, `UpcomingEarnings.jsx`, `ExposureCard.jsx` — CREATE, each with a `.test.jsx`.
- `pages/Dashboard.jsx` — MODIFY: hooks + render order.
- `pages/Dashboard.test.jsx` — CREATE.
- `api/client.test.js` — MODIFY: `getPortfolioInsights` case.

---

## Task 1: Backend — snapshot-derived block (`value`, `change`, `spark`)

**Files:**
- Create: `backend/portfolio/insights.py`
- Test: `backend/portfolio/tests.py` (`InsightsHelpersTest`)

**Interfaces:**
- Produces: `insights.STALE_DAYS=2`, `SPARK_POINTS=30` (module constants; more added in later tasks).
- Produces: `insights._day(pairs) -> {"abs": Decimal, "pct": float} | None` — `pairs` is date-ascending `list[(date, Decimal)]`; last two points; `None` if `< 2`.
- Produces: `insights._trailing(pairs, days) -> {"abs","pct"} | None` — window = points with `date >= last_date - days`; needs `>= 2` in window; anchors to the first in-window point (matches `analytics.metrics.period_return`).
- Produces: `insights._ytd(pairs) -> {...} | None` — window = points in the latest point's calendar year; needs `>= 2`.
- Produces: `insights._all_time(pairs) -> {...} | None` — first vs last; `None` if `< 2`.

- [ ] **Step 1: Write the failing tests**

Add to `backend/portfolio/tests.py`:

```python
from datetime import date

from core.models import NetWorthSnapshot
from portfolio import insights


def _snap(d, portfolio, bank=Decimal('1000.00')):
    return NetWorthSnapshot.objects.create(
        date=d, portfolio_value=Decimal(portfolio), bank_total=bank,
        net_worth=Decimal(portfolio) + bank,
    )


class InsightsHelpersTest(TestCase):
    def test_day_delta_is_the_last_two_points(self):
        pairs = [(date(2026, 9, 8), Decimal('100')), (date(2026, 9, 9), Decimal('110'))]
        self.assertEqual(insights._day(pairs), {'abs': Decimal('10'), 'pct': 10.0})

    def test_day_delta_needs_two_points(self):
        self.assertIsNone(insights._day([(date(2026, 9, 9), Decimal('100'))]))

    def test_trailing_window_anchors_to_the_first_in_window_point(self):
        pairs = [
            (date(2026, 8, 1), Decimal('100')),
            (date(2026, 9, 5), Decimal('120')),
            (date(2026, 9, 12), Decimal('132')),
        ]
        # trailing 10 days from 2026-09-12 -> cutoff 2026-09-02, window = [120, 132]
        self.assertEqual(insights._trailing(pairs, 10), {'abs': Decimal('12'), 'pct': 10.0})

    def test_trailing_returns_none_when_the_window_has_under_two_points(self):
        pairs = [(date(2026, 8, 1), Decimal('100')), (date(2026, 9, 12), Decimal('132'))]
        self.assertIsNone(insights._trailing(pairs, 3))

    def test_ytd_uses_the_latest_years_points(self):
        pairs = [
            (date(2025, 12, 31), Decimal('90')),
            (date(2026, 1, 2), Decimal('100')),
            (date(2026, 9, 12), Decimal('125')),
        ]
        self.assertEqual(insights._ytd(pairs), {'abs': Decimal('25'), 'pct': 25.0})

    def test_all_time_is_first_versus_last(self):
        pairs = [(date(2026, 1, 1), Decimal('80')), (date(2026, 9, 1), Decimal('100'))]
        self.assertEqual(insights._all_time(pairs), {'abs': Decimal('20'), 'pct': 25.0})

    def test_pct_is_none_when_the_anchor_is_zero(self):
        pairs = [(date(2026, 9, 1), Decimal('0')), (date(2026, 9, 2), Decimal('5'))]
        self.assertEqual(insights._day(pairs), {'abs': Decimal('5'), 'pct': None})
```

- [ ] **Step 2: Run, verify fail**

Run: `cd backend && .venv/bin/python manage.py test portfolio.tests.InsightsHelpersTest -v 2`
Expected: FAIL — `ModuleNotFoundError: No module named 'portfolio.insights'`.

- [ ] **Step 3: Create `portfolio/insights.py` with the delta helpers**

```python
"""Portfolio intelligence for the Dashboard command centre.

Composes one payload from data already in the app: `Position`, the daily
`core.NetWorthSnapshot` series, and a best-effort call into
`research.earnings`. No new model, no sync. Every change figure is
end-of-day - Saxo SIM has no quote feed.
"""
import logging
from datetime import date, timedelta
from decimal import Decimal

from core.models import NetWorthSnapshot
from portfolio.models import Position
from portfolio.services import get_portfolio_value

logger = logging.getLogger(__name__)

STALE_DAYS = 2
SINGLE_NAME_PCT = 30
TOP3_PCT = 60
EARNINGS_SOON_DAYS = 7
EARNINGS_HORIZON_DAYS = 14
SPARK_POINTS = 30
MOVERS = 3
CONTRIBUTORS = 8


def _delta(anchor, end):
    abs_ = end - anchor
    pct = round(float(abs_ / anchor * 100), 2) if anchor else None
    return {'abs': abs_, 'pct': pct}


def _day(pairs):
    if len(pairs) < 2:
        return None
    return _delta(pairs[-2][1], pairs[-1][1])


def _trailing(pairs, days):
    if len(pairs) < 2:
        return None
    cutoff = pairs[-1][0] - timedelta(days=days)
    window = [v for d, v in pairs if d >= cutoff]
    if len(window) < 2:
        return None
    return _delta(window[0], window[-1])


def _ytd(pairs):
    if not pairs:
        return None
    year = pairs[-1][0].year
    window = [v for d, v in pairs if d.year == year]
    if len(window) < 2:
        return None
    return _delta(window[0], window[-1])


def _all_time(pairs):
    if len(pairs) < 2:
        return None
    return _delta(pairs[0][1], pairs[-1][1])
```

- [ ] **Step 4: Run, verify pass**

Run: `cd backend && .venv/bin/python manage.py test portfolio.tests.InsightsHelpersTest -v 2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/portfolio/insights.py backend/portfolio/tests.py
git commit -m "feat: add net-worth-snapshot delta helpers for portfolio insights

$(printf 'Claude-Session: https://claude.ai/code/session_01PybJQDy4bPtNvqd9tzRJ4v')"
```

---

## Task 2: Backend — position-derived blocks

**Files:**
- Modify: `backend/portfolio/insights.py`
- Test: `backend/portfolio/tests.py` (`InsightsPositionsTest`)

**Interfaces:**
- Produces: `_concentration(positions, total) -> {"top1": {"ticker","pct"}|None, "top3_pct": float|None, "hhi": float|None, "positions": int}`.
- Produces: `_exposure(positions, total, key, label) -> list[{label: str, "pct": float, "value": Decimal}]` desc by value; `key` is `'sector'` or `'currency'`, `label` is the output key name (`'name'` or `'currency'`); blank ⇒ `"Unknown"`; `total` `0`/empty ⇒ `[]`.
- Produces: `_movers(positions) -> {"best": [...], "worst": [...]}` — each row `{"ticker","name","pnl_pct": float,"pnl": Decimal,"value": Decimal}`, `≤ MOVERS`, `worst` excludes any ticker in `best`, `worst` is worst-first.
- Produces: `_contributors(positions, total_cost, total_pnl) -> list[{"ticker","pnl","contribution_pp": float,"share_of_gain_pct": float}]` desc by `abs(contribution_pp)`, `≤ CONTRIBUTORS`; zero denominators ⇒ `0.0`.

- [ ] **Step 1: Write the failing tests**

Add to `backend/portfolio/tests.py`:

```python
def _pos(ticker, qty, avg, price, sector='Technology', currency='USD', color='#111111',
         price_source='live'):
    return Position.objects.create(
        ticker=ticker, name=f'{ticker} Inc', qty=Decimal(qty), avg_cost=Decimal(avg),
        current_price=Decimal(price), sector=sector, type='STOCK', color=color,
        currency=currency, price_source=price_source,
    )


class InsightsPositionsTest(TestCase):
    def setUp(self):
        # values: NVDA 6000, AAPL 3000, KO 1000  -> total 10000
        self.nvda = _pos('NVDA', '10', '100', '600', sector='Technology', currency='USD')
        self.aapl = _pos('AAPL', '10', '400', '300', sector='Technology', currency='USD')
        self.ko = _pos('KO', '10', '50', '100', sector='Staples', currency='EUR')
        self.positions = list(Position.objects.all())
        self.total = sum((p.value for p in self.positions), Decimal('0'))

    def test_concentration_maths(self):
        c = insights._concentration(self.positions, self.total)
        self.assertEqual(c['top1'], {'ticker': 'NVDA', 'pct': 60.0})
        self.assertEqual(c['top3_pct'], 100.0)
        self.assertAlmostEqual(c['hhi'], 0.36 + 0.09 + 0.01, places=4)
        self.assertEqual(c['positions'], 3)

    def test_concentration_of_an_empty_book_is_nulls(self):
        c = insights._concentration([], Decimal('0'))
        self.assertIsNone(c['top1'])
        self.assertIsNone(c['top3_pct'])
        self.assertIsNone(c['hhi'])
        self.assertEqual(c['positions'], 0)

    def test_sector_exposure_groups_and_orders_by_value(self):
        rows = insights._exposure(self.positions, self.total, 'sector', 'name')
        self.assertEqual(rows[0], {'name': 'Technology', 'pct': 90.0, 'value': Decimal('9000.00')})
        self.assertEqual(rows[1]['name'], 'Staples')

    def test_currency_exposure_uses_the_instrument_currency(self):
        rows = insights._exposure(self.positions, self.total, 'currency', 'currency')
        self.assertEqual(rows[0], {'currency': 'USD', 'pct': 90.0, 'value': Decimal('9000.00')})

    def test_blank_key_becomes_unknown(self):
        _pos('X', '1', '1', '1', sector='')
        rows = insights._exposure(list(Position.objects.all()), self.total + Decimal('1'),
                                  'sector', 'name')
        self.assertIn('Unknown', [r['name'] for r in rows])

    def test_movers_split_best_and_worst_without_overlap(self):
        m = insights._movers(self.positions)
        self.assertEqual([r['ticker'] for r in m['best']], ['NVDA', 'KO', 'AAPL'])
        self.assertEqual([r['ticker'] for r in m['worst']], ['AAPL', 'KO', 'NVDA'])
        self.assertNotEqual(m['best'][0]['ticker'], None)

    def test_contributors_ordered_by_absolute_contribution(self):
        total_cost = sum((p.cost for p in self.positions), Decimal('0'))
        total_pnl = self.total - total_cost
        rows = insights._contributors(self.positions, total_cost, total_pnl)
        self.assertEqual(rows[0]['ticker'], 'NVDA')       # +5000 pnl, biggest magnitude
        self.assertEqual(rows[-1]['ticker'], 'KO')        # +500 pnl, smallest
        self.assertAlmostEqual(rows[0]['contribution_pp'], 5000 / 6000 * 100, places=2)

    def test_contributors_survive_zero_denominators(self):
        rows = insights._contributors(self.positions, Decimal('0'), Decimal('0'))
        self.assertTrue(all(r['contribution_pp'] == 0.0 for r in rows))
```

- [ ] **Step 2: Run, verify fail**

Run: `cd backend && .venv/bin/python manage.py test portfolio.tests.InsightsPositionsTest -v 2`
Expected: FAIL — `AttributeError: module 'portfolio.insights' has no attribute '_concentration'`.

- [ ] **Step 3: Implement the blocks in `portfolio/insights.py`**

```python
def _concentration(positions, total):
    if not positions or not total:
        return {'top1': None, 'top3_pct': None, 'hhi': None, 'positions': len(positions)}
    ranked = sorted(positions, key=lambda p: p.value, reverse=True)
    weights = [float(p.value / total) for p in ranked]
    return {
        'top1': {'ticker': ranked[0].ticker, 'pct': round(weights[0] * 100, 1)},
        'top3_pct': round(sum(weights[:3]) * 100, 1),
        'hhi': round(sum(w * w for w in weights), 4),
        'positions': len(positions),
    }


def _exposure(positions, total, key, label):
    if not total:
        return []
    buckets = {}
    for p in positions:
        name = (getattr(p, key) or '').strip() or 'Unknown'
        buckets[name] = buckets.get(name, Decimal('0')) + p.value
    rows = [
        {label: name, 'pct': round(float(value / total * 100), 1), 'value': value}
        for name, value in buckets.items()
    ]
    rows.sort(key=lambda r: r['value'], reverse=True)
    return rows


def _mover_row(p):
    return {'ticker': p.ticker, 'name': p.name, 'pnl_pct': float(p.pnl_pct),
            'pnl': p.pnl, 'value': p.value}


def _movers(positions):
    if not positions:
        return {'best': [], 'worst': []}
    ranked = sorted(positions, key=lambda p: p.pnl_pct, reverse=True)
    best = ranked[:MOVERS]
    best_tickers = {p.ticker for p in best}
    worst = [p for p in reversed(ranked) if p.ticker not in best_tickers][:MOVERS]
    return {'best': [_mover_row(p) for p in best], 'worst': [_mover_row(p) for p in worst]}


def _contributors(positions, total_cost, total_pnl):
    rows = []
    for p in positions:
        contribution_pp = float(p.pnl / total_cost * 100) if total_cost else 0.0
        share = float(p.pnl / total_pnl * 100) if total_pnl else 0.0
        rows.append({
            'ticker': p.ticker, 'pnl': p.pnl,
            'contribution_pp': round(contribution_pp, 2),
            'share_of_gain_pct': round(share, 1),
        })
    rows.sort(key=lambda r: abs(r['contribution_pp']), reverse=True)
    return rows[:CONTRIBUTORS]
```

- [ ] **Step 4: Run, verify pass**

Run: `cd backend && .venv/bin/python manage.py test portfolio.tests.InsightsPositionsTest -v 2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/portfolio/insights.py backend/portfolio/tests.py
git commit -m "feat: add concentration, exposure, movers and contributors helpers

$(printf 'Claude-Session: https://claude.ai/code/session_01PybJQDy4bPtNvqd9tzRJ4v')"
```

---

## Task 3: Backend — attention rules, upcoming earnings, `build_insights`

**Files:**
- Modify: `backend/portfolio/insights.py`
- Test: `backend/portfolio/tests.py` (`InsightsAttentionTest`, `UpcomingEarningsTest`, `BuildInsightsTest`)

**Interfaces:**
- Produces: `_upcoming_earnings(held_upper: set[str], today: date) -> list[dict] | None` — each `{"ticker","date","days_until": int,"session","eps_estimate"}`, `date >= today`, not yet reported, `<= today + EARNINGS_HORIZON_DAYS`, soonest first; any exception ⇒ `None`.
- Produces: `_attention(positions, pairs, today, concentration, upcoming) -> list[{"kind","severity","text","ticker"?}]` in the fixed order: `single_name`, `concentration`, `stale_value`, `price_basis`, `earnings_soon`, `no_history`.
- Produces: `build_insights() -> dict` — the full payload from the spec.

- [ ] **Step 1: Write the failing tests**

Add to `backend/portfolio/tests.py`:

```python
from unittest.mock import patch


class UpcomingEarningsTest(TestCase):
    def _win(self, events):
        return {'events': events, 'window': {}, 'ok': True}

    @patch('portfolio.insights._window_earnings')
    def test_keeps_held_unreported_rows_inside_the_horizon(self, mock_win):
        today = date(2026, 9, 10)
        mock_win.side_effect = [
            self._win([
                {'symbol': 'MSFT', 'date': '2026-09-13', 'session': 'amc',
                 'eps_estimate': 3.1, 'eps_actual': None, 'held': True},
                {'symbol': 'AAPL', 'date': '2026-09-11', 'session': 'bmo',
                 'eps_estimate': 1.5, 'eps_actual': 1.6, 'held': True},   # already reported
                {'symbol': 'TSLA', 'date': '2026-09-12', 'session': 'amc',
                 'eps_estimate': 0.7, 'eps_actual': None, 'held': False},  # not held
            ]),
            self._win([
                {'symbol': 'MSFT', 'date': '2026-09-30', 'session': 'amc',
                 'eps_estimate': 3.2, 'eps_actual': None, 'held': True},   # past horizon
            ]),
        ]
        rows = insights._upcoming_earnings({'MSFT', 'AAPL', 'TSLA'}, today)
        self.assertEqual([r['ticker'] for r in rows], ['MSFT'])
        self.assertEqual(rows[0]['days_until'], 3)

    @patch('portfolio.insights._window_earnings', side_effect=RuntimeError('feed down'))
    def test_a_feed_failure_yields_none(self, _mock):
        self.assertIsNone(insights._upcoming_earnings({'MSFT'}, date(2026, 9, 10)))


class InsightsAttentionTest(TestCase):
    def test_single_name_and_concentration_fire_at_their_thresholds(self):
        c = {'top1': {'ticker': 'NVDA', 'pct': 34.0}, 'top3_pct': 61.0, 'hhi': 0.2, 'positions': 5}
        kinds = [i['kind'] for i in insights._attention([], [], date(2026, 9, 10), c, None)]
        self.assertEqual(kinds[:2], ['single_name', 'concentration'])

    def test_nothing_fires_below_threshold(self):
        c = {'top1': {'ticker': 'NVDA', 'pct': 20.0}, 'top3_pct': 45.0, 'hhi': 0.1, 'positions': 8}
        pairs = [(date(2026, 9, 9), Decimal('1')), (date(2026, 9, 10), Decimal('1'))]
        self.assertEqual(insights._attention([], pairs, date(2026, 9, 10), c, None), [])

    def test_stale_value_names_the_age(self):
        c = {'top1': None, 'top3_pct': None, 'hhi': None, 'positions': 0}
        pairs = [(date(2026, 9, 1), Decimal('1')), (date(2026, 9, 5), Decimal('1'))]
        items = insights._attention([], pairs, date(2026, 9, 10), c, None)
        self.assertEqual(items[0]['kind'], 'stale_value')
        self.assertIn('5 days old', items[0]['text'])

    def test_price_basis_counts_unpriced_holdings(self):
        _pos('A', '1', '1', '1', price_source='derived')
        _pos('B', '1', '1', '1', price_source='live')
        c = {'top1': None, 'top3_pct': None, 'hhi': None, 'positions': 2}
        items = insights._attention(list(Position.objects.all()), [], date(2026, 9, 10), c, None)
        pb = next(i for i in items if i['kind'] == 'price_basis')
        self.assertIn('1 holding', pb['text'])

    def test_earnings_soon_carries_the_ticker(self):
        c = {'top1': None, 'top3_pct': None, 'hhi': None, 'positions': 0}
        upcoming = [{'ticker': 'MSFT', 'date': '2026-09-13', 'days_until': 3,
                     'session': 'amc', 'eps_estimate': 3.1}]
        items = insights._attention([], [], date(2026, 9, 10), c, upcoming)
        es = next(i for i in items if i['kind'] == 'earnings_soon')
        self.assertEqual(es['ticker'], 'MSFT')
        self.assertIn('in 3 days', es['text'])

    def test_no_history_when_under_two_snapshots(self):
        c = {'top1': None, 'top3_pct': None, 'hhi': None, 'positions': 0}
        items = insights._attention([], [(date(2026, 9, 10), Decimal('1'))], date(2026, 9, 10), c, None)
        self.assertEqual(items[-1]['kind'], 'no_history')


class BuildInsightsTest(TestCase):
    @patch('portfolio.insights._upcoming_earnings', return_value=None)
    def test_empty_portfolio_and_no_snapshots_is_well_formed(self, _mock):
        payload = insights.build_insights()
        self.assertIsNone(payload['as_of'])
        self.assertFalse(payload['stale'])
        self.assertEqual(payload['spark'], [])
        self.assertIsNone(payload['change']['day'])
        self.assertEqual(payload['sector_exposure'], [])
        self.assertIsNone(payload['upcoming_earnings'])
        self.assertEqual(payload['attention'][-1]['kind'], 'no_history')

    @patch('portfolio.insights._upcoming_earnings', return_value=[])
    def test_a_seeded_book_produces_the_expected_shape(self, _mock):
        _pos('NVDA', '10', '100', '600')
        _snap(date(2026, 9, 8), '5000')
        _snap(date(2026, 9, 9), '5500')
        payload = insights.build_insights()
        self.assertEqual(payload['as_of'], '2026-09-09')
        self.assertEqual(payload['change']['day']['pct'], 10.0)
        self.assertEqual(payload['concentration']['top1']['ticker'], 'NVDA')
        self.assertEqual(len(payload['spark']), 2)
        self.assertEqual(payload['upcoming_earnings'], [])
```

- [ ] **Step 2: Run, verify fail**

Run: `cd backend && .venv/bin/python manage.py test portfolio.tests.InsightsAttentionTest portfolio.tests.UpcomingEarningsTest portfolio.tests.BuildInsightsTest -v 2`
Expected: FAIL — `_window_earnings` / `_attention` / `build_insights` missing.

- [ ] **Step 3: Implement in `portfolio/insights.py`**

Add near the top (after the constants):

```python
def _window_earnings(week_offset):
    """Indirection so tests patch one seam. Function-level import of
    `research.earnings` breaks the portfolio <-> research module cycle."""
    from research import earnings as research_earnings
    return research_earnings.window_earnings('mine', week_offset)
```

Then:

```python
def _upcoming_earnings(held_upper, today):
    horizon = (today + timedelta(days=EARNINGS_HORIZON_DAYS)).isoformat()
    try:
        events = []
        for offset in (0, 1):
            events.extend(_window_earnings(offset).get('events', []))
    except Exception as exc:  # feed down, shape change - degrade, don't 500
        logger.warning('upcoming earnings unavailable: %s', exc)
        return None

    rows = []
    seen = set()
    for e in events:
        symbol = (e.get('symbol') or '').upper()
        day = e.get('date') or ''
        key = (symbol, day)
        if not e.get('held') or symbol not in held_upper or key in seen:
            continue
        if e.get('eps_actual') is not None:
            continue
        if not (today.isoformat() <= day <= horizon):
            continue
        seen.add(key)
        rows.append({
            'ticker': symbol,
            'date': day,
            'days_until': (date.fromisoformat(day) - today).days,
            'session': e.get('session'),
            'eps_estimate': e.get('eps_estimate'),
        })
    rows.sort(key=lambda r: r['date'])
    return rows


def _attention(positions, pairs, today, concentration, upcoming):
    items = []
    c = concentration
    if c['top1'] and c['top1']['pct'] >= SINGLE_NAME_PCT:
        items.append({'kind': 'single_name', 'severity': 'warn',
                      'text': f"{c['top1']['ticker']} alone is {c['top1']['pct']:.0f}% of the portfolio."})
    if c['top3_pct'] is not None and c['top3_pct'] >= TOP3_PCT:
        items.append({'kind': 'concentration', 'severity': 'warn',
                      'text': f"Top 3 holdings are {c['top3_pct']:.0f}% of the portfolio."})
    if pairs:
        age = (today - pairs[-1][0]).days
        if age > STALE_DAYS:
            items.append({'kind': 'stale_value', 'severity': 'warn',
                          'text': f"Portfolio value is {age} days old "
                                  f"(last {pairs[-1][0].strftime('%b %d')})."})
    unpriced = [p for p in positions if p.price_source != 'live']
    if unpriced:
        n = len(unpriced)
        items.append({'kind': 'price_basis', 'severity': 'info',
                      'text': f"{n} holding{'' if n == 1 else 's'} priced off Saxo P/L, "
                              f"not a live quote."})
    if upcoming:
        soon = upcoming[0]
        if soon['days_until'] <= EARNINGS_SOON_DAYS:
            d = soon['days_until']
            when = 'today' if d == 0 else 'tomorrow' if d == 1 else f'in {d} days'
            items.append({'kind': 'earnings_soon', 'severity': 'info', 'ticker': soon['ticker'],
                          'text': f"{soon['ticker']} reports {when}."})
    if len(pairs) < 2:
        items.append({'kind': 'no_history', 'severity': 'info',
                      'text': 'Not enough history yet for change metrics.'})
    return items


def build_insights():
    positions = list(Position.objects.all())
    pairs = list(
        NetWorthSnapshot.objects.order_by('date').values_list('date', 'portfolio_value')
    )
    latest = NetWorthSnapshot.objects.order_by('date').last()
    today = date.today()

    total = sum((p.value for p in positions), Decimal('0'))
    total_cost = sum((p.cost for p in positions), Decimal('0'))
    total_pnl = total - total_cost

    portfolio_value = get_portfolio_value().rounded().amount
    bank = latest.bank_total if latest else Decimal('0')

    concentration = _concentration(positions, total)
    held_upper = {p.ticker.upper() for p in positions if p.ticker}
    upcoming = _upcoming_earnings(held_upper, today)

    return {
        'as_of': pairs[-1][0].isoformat() if pairs else None,
        'stale': bool(pairs) and (today - pairs[-1][0]).days > STALE_DAYS,
        'value': {
            'net_worth': portfolio_value + bank,
            'portfolio': portfolio_value,
            'bank': bank,
        },
        'change': {
            'day': _day(pairs),
            'week': _trailing(pairs, 7),
            'month': _trailing(pairs, 30),
            'ytd': _ytd(pairs),
            'all_time': _all_time(pairs),
        },
        'spark': [{'date': d.isoformat(), 'value': float(v)} for d, v in pairs[-SPARK_POINTS:]],
        'concentration': concentration,
        'sector_exposure': _exposure(positions, total, 'sector', 'name'),
        'currency_exposure': _exposure(positions, total, 'currency', 'currency'),
        'movers': _movers(positions),
        'contributors': _contributors(positions, total_cost, total_pnl),
        'attention': _attention(positions, pairs, today, concentration, upcoming),
        'upcoming_earnings': upcoming,
    }
```

- [ ] **Step 4: Run, verify pass**

Run: `cd backend && .venv/bin/python manage.py test portfolio.tests.InsightsAttentionTest portfolio.tests.UpcomingEarningsTest portfolio.tests.BuildInsightsTest -v 2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/portfolio/insights.py backend/portfolio/tests.py
git commit -m "feat: add attention rules, best-effort upcoming earnings, build_insights

$(printf 'Claude-Session: https://claude.ai/code/session_01PybJQDy4bPtNvqd9tzRJ4v')"
```

---

## Task 4: Backend — `PortfolioInsightsView` + route

**Files:**
- Modify: `backend/portfolio/views.py`, `backend/portfolio/urls.py`
- Test: `backend/portfolio/tests.py` (`PortfolioInsightsViewTest`)

**Interfaces:**
- Produces: `GET /api/portfolio/insights/` → `PortfolioInsightsView`, authenticated, `200` with `insights.build_insights()`.

- [ ] **Step 1: Write the failing test**

Add to `backend/portfolio/tests.py`:

```python
class PortfolioInsightsViewTest(APITestCase):
    def setUp(self):
        user = User.objects.create_user(username='alex', password='pw')
        token = RefreshToken.for_user(user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_requires_authentication(self):
        self.client.credentials()
        self.assertEqual(self.client.get('/api/portfolio/insights/').status_code, 401)

    @patch('portfolio.insights._upcoming_earnings', return_value=[])
    def test_returns_the_insights_payload(self, _mock):
        _pos('NVDA', '10', '100', '600')
        _snap(date(2026, 9, 8), '5000')
        _snap(date(2026, 9, 9), '5500')
        response = self.client.get('/api/portfolio/insights/')
        self.assertEqual(response.status_code, 200)
        for key in ('value', 'change', 'spark', 'concentration', 'sector_exposure',
                    'currency_exposure', 'movers', 'contributors', 'attention',
                    'upcoming_earnings'):
            self.assertIn(key, response.data)
        self.assertEqual(response.data['concentration']['top1']['ticker'], 'NVDA')

    @patch('portfolio.insights._window_earnings', side_effect=RuntimeError('boom'))
    def test_an_earnings_feed_failure_is_still_a_200_with_null_earnings(self, _mock):
        _pos('NVDA', '10', '100', '600')
        response = self.client.get('/api/portfolio/insights/')
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data['upcoming_earnings'])

    @patch('portfolio.insights._upcoming_earnings', return_value=None)
    def test_no_positions_is_a_clean_200(self, _mock):
        response = self.client.get('/api/portfolio/insights/')
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data['concentration']['top1'])
```

- [ ] **Step 2: Run, verify fail**

Run: `cd backend && .venv/bin/python manage.py test portfolio.tests.PortfolioInsightsViewTest -v 2`
Expected: FAIL — 404 (route missing).

- [ ] **Step 3: Add the view and route**

`backend/portfolio/views.py` — add the import and the view:

```python
from . import insights
```

```python
class PortfolioInsightsView(APIView):
    def get(self, request):
        return Response(insights.build_insights())
```

`backend/portfolio/urls.py`:

```python
from .views import PositionListView, PortfolioSummaryView, PortfolioInsightsView

urlpatterns = [
    path('positions/', PositionListView.as_view(), name='position-list'),
    path('summary/', PortfolioSummaryView.as_view(), name='portfolio-summary'),
    path('insights/', PortfolioInsightsView.as_view(), name='portfolio-insights'),
]
```

- [ ] **Step 4: Run, verify pass**

Run: `cd backend && .venv/bin/python manage.py test portfolio.tests.PortfolioInsightsViewTest -v 2`
Expected: PASS.

- [ ] **Step 5: Full backend suite**

Run: `cd backend && .venv/bin/python manage.py test`
Expected: PASS — no regression.

- [ ] **Step 6: Commit**

```bash
git add backend/portfolio/views.py backend/portfolio/urls.py backend/portfolio/tests.py
git commit -m "feat: expose GET /api/portfolio/insights/

$(printf 'Claude-Session: https://claude.ai/code/session_01PybJQDy4bPtNvqd9tzRJ4v')"
```

---

## Task 5: Frontend — client call + query hook

**Files:**
- Modify: `frontend/src/api/client.js`, `frontend/src/api/queries.js`, `frontend/src/api/client.test.js`

**Interfaces:**
- Produces: `getPortfolioInsights()` → `Promise<object>` hitting `GET /api/portfolio/insights/`.
- Produces: `queryKeys.portfolioInsights = ['portfolio-insights']`; `usePortfolioInsights()` → TanStack Query result, `staleTime: 5 * 60_000`.

- [ ] **Step 1: Write the failing client test**

In `frontend/src/api/client.test.js`, add `getPortfolioInsights` to the import from `./client` and add (next to the `getFundamentals` case):

```js
  it('getPortfolioInsights hits the insights route', async () => {
    window.fetch = vi.fn().mockResolvedValue(jsonResponse({ value: {}, change: {} }))
    await getPortfolioInsights()
    expect(window.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/portfolio/insights/'),
      expect.anything(),
    )
  })
```

- [ ] **Step 2: Run, verify fail**

Run: `cd frontend && npx vitest run src/api/client.test.js`
Expected: FAIL — `getPortfolioInsights is not a function`.

- [ ] **Step 3: Add the client function**

`frontend/src/api/client.js`, next to `getPortfolioSummary`:

```js
export const getPortfolioInsights = () => apiFetch('/api/portfolio/insights/')
```

- [ ] **Step 4: Add the query hook**

`frontend/src/api/queries.js`:
- add `getPortfolioInsights` to the import block from `./client`.
- add `portfolioInsights: ['portfolio-insights'],` to `queryKeys`.
- add near `usePortfolioSummary`:

```js
// EOD data (one daily snapshot); 5-minute client staleness is plenty.
export function usePortfolioInsights() {
  return useQuery({
    queryKey: queryKeys.portfolioInsights,
    queryFn: getPortfolioInsights,
    staleTime: 5 * 60_000,
  })
}
```

- [ ] **Step 5: Run, verify pass + full suite + lint**

Run: `cd frontend && npx vitest run src/api/client.test.js && npm test && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/client.js frontend/src/api/queries.js frontend/src/api/client.test.js
git commit -m "feat: add the portfolio-insights client call and query hook

$(printf 'Claude-Session: https://claude.ai/code/session_01PybJQDy4bPtNvqd9tzRJ4v')"
```

---

## Task 6: Frontend — lift `SECTOR_PALETTE`; `HeroValue` + `AttentionBand`

**Files:**
- Modify: `frontend/src/lib/charts.js`, `frontend/src/pages/Portfolio.jsx`
- Create: `frontend/src/components/dashboard/HeroValue.jsx` (+ `.test.jsx`), `frontend/src/components/dashboard/AttentionBand.jsx` (+ `.test.jsx`)

**Interfaces:**
- Produces: `SECTOR_PALETTE` (array of hex strings) exported from `lib/charts.js`.
- Produces: `HeroValue` default export — `props: { value: {net_worth,portfolio,bank}, change: {day,week,month,ytd}, spark: Array<{date,value}> }`.
- Produces: `AttentionBand` default export — `props: { items: Array<{kind,severity,text,ticker?}> }`.

- [ ] **Step 1: Lift `SECTOR_PALETTE`**

In `frontend/src/lib/charts.js` add:

```js
// Blue-family ramp for sector / category breakdowns. Lifted here so the
// Portfolio sector bars and the Dashboard exposure donut share one.
export const SECTOR_PALETTE = ['#3b82f6', '#60a5fa', '#93c5fd', '#1d4ed8', '#0ea5e9', '#1e40af']
```

In `frontend/src/pages/Portfolio.jsx`: delete the local
`const SECTOR_PALETTE = [...]` line and add `SECTOR_PALETTE` to the existing
`import { ... } from '../lib/charts'` (or add such an import if none exists —
check the file; it currently imports from `../lib/format` and `../components/ui`,
so add `import { SECTOR_PALETTE } from '../lib/charts'`).

Run: `cd frontend && npx vitest run src/pages/Portfolio.test.jsx` — expected PASS (no behaviour change).

- [ ] **Step 2: Write the failing `HeroValue` test**

Create `frontend/src/components/dashboard/HeroValue.test.jsx`:

```js
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import HeroValue from './HeroValue'

const base = {
  value: { net_worth: '10000.00', portfolio: '9000.00', bank: '1000.00' },
  change: {
    day: { abs: '50.00', pct: 0.56 },
    week: { abs: '-120.00', pct: -1.3 },
    month: null,
    ytd: { abs: '800.00', pct: 9.0 },
  },
  spark: [{ date: '2026-09-08', value: 9900 }, { date: '2026-09-09', value: 10000 }],
}

describe('HeroValue', () => {
  it('shows the net worth and a green and a red delta', () => {
    render(<HeroValue {...base} />)
    expect(screen.getByText('€10,000.00')).toBeInTheDocument()
    expect(screen.getByText(/\+0\.56%/)).toBeInTheDocument()
    expect(screen.getByText(/-1\.3%/)).toBeInTheDocument()
  })

  it('renders an em dash for a null delta', () => {
    render(<HeroValue {...base} />)
    expect(screen.getByText('Month').closest('div')).toHaveTextContent('—')
  })

  it('omits the sparkline when there is no series', () => {
    const { container } = render(<HeroValue {...base} spark={[]} />)
    expect(container.querySelector('svg')).toBeNull()
  })
})
```

- [ ] **Step 3: Run, verify fail**

Run: `cd frontend && npx vitest run src/components/dashboard/HeroValue.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `HeroValue`**

Create `frontend/src/components/dashboard/HeroValue.jsx`:

```jsx
import { Area, AreaChart, ResponsiveContainer } from 'recharts'

import { fmtEur, fmtPct } from '../../lib/format'
import { Card } from '../ui'

const PERIODS = [
  ['day', 'Day'],
  ['week', 'Week'],
  ['month', 'Month'],
  ['ytd', 'YTD'],
]

function DeltaPill({ label, delta }) {
  const known = delta && delta.pct != null
  const up = known && Number(delta.pct) >= 0
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-zinc-600">{label}</span>
      <span
        className={`text-[13px] num font-mono ${
          !known ? 'text-zinc-500' : up ? 'text-emerald-400' : 'text-red-400'
        }`}
      >
        {!known ? '—' : `${fmtPct(delta.pct, { decimals: Math.abs(delta.pct) < 10 ? 2 : 1 })}`}
      </span>
      {known && (
        <span className="text-[10px] num font-mono text-zinc-600">
          {fmtEur(delta.abs, { sign: true, decimals: 0 })}
        </span>
      )}
    </div>
  )
}

export default function HeroValue({ value, change, spark }) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium">Net worth</div>
          <div className="mt-1 text-[clamp(24px,3vw,34px)] font-semibold tracking-tight num font-mono text-zinc-50">
            {fmtEur(value.net_worth)}
          </div>
          <div className="mt-1 text-[12px] text-zinc-500 num font-mono">
            {fmtEur(value.portfolio)} invested · {fmtEur(value.bank)} bank
          </div>
        </div>
        {spark.length > 1 && (
          <div className="w-[160px] h-[44px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={spark} margin={{ top: 4, bottom: 4, left: 0, right: 0 }}>
                <defs>
                  <linearGradient id="heroSpark" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#60a5fa" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone" dataKey="value" stroke="#60a5fa" strokeWidth={1.5}
                  fill="url(#heroSpark)" dot={false} isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      <div className="mt-4 pt-4 border-t border-white/[0.06] flex flex-wrap gap-6">
        {PERIODS.map(([key, label]) => (
          <DeltaPill key={key} label={label} delta={change?.[key]} />
        ))}
      </div>
      <p className="mt-3 text-[10px] text-zinc-600">Change is end-of-day, from the daily net-worth snapshot.</p>
    </Card>
  )
}
```

- [ ] **Step 5: Run, verify pass**

Run: `cd frontend && npx vitest run src/components/dashboard/HeroValue.test.jsx`
Expected: PASS.

- [ ] **Step 6: Write the failing `AttentionBand` test**

Create `frontend/src/components/dashboard/AttentionBand.test.jsx`:

```js
import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'

import { renderWithProviders } from '../../test/renderWithProviders'
import AttentionBand from './AttentionBand'

describe('AttentionBand', () => {
  it('renders warn and info chips', () => {
    renderWithProviders(
      <AttentionBand
        items={[
          { kind: 'concentration', severity: 'warn', text: 'Top 3 holdings are 61% of the portfolio.' },
          { kind: 'price_basis', severity: 'info', text: '3 holdings priced off Saxo P/L, not a live quote.' },
        ]}
      />,
    )
    expect(screen.getByText(/Top 3 holdings/)).toBeInTheDocument()
    expect(screen.getByText(/priced off Saxo/)).toBeInTheDocument()
  })

  it('links an earnings_soon chip to the Research earnings tab', () => {
    renderWithProviders(
      <AttentionBand
        items={[{ kind: 'earnings_soon', severity: 'info', ticker: 'MSFT', text: 'MSFT reports in 3 days.' }]}
      />,
    )
    expect(screen.getByRole('link', { name: /MSFT reports/ })).toHaveAttribute(
      'href', '/research?symbol=MSFT&tab=earnings',
    )
  })

  it('shows a calm line when nothing needs attention', () => {
    renderWithProviders(<AttentionBand items={[]} />)
    expect(screen.getByText(/Nothing needs attention/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 7: Run, verify fail**

Run: `cd frontend && npx vitest run src/components/dashboard/AttentionBand.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 8: Implement `AttentionBand`**

Create `frontend/src/components/dashboard/AttentionBand.jsx`:

```jsx
import { Link } from 'react-router-dom'
import { AlertTriangle, Info } from 'lucide-react'

import { researchHref } from '../../lib/research'

const PORTFOLIO_KINDS = new Set(['concentration', 'single_name', 'price_basis'])

function chipClass(severity) {
  return severity === 'warn'
    ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
    : 'bg-white/[0.04] text-zinc-300 border-white/[0.08]'
}

function Chip({ item }) {
  const Icon = item.severity === 'warn' ? AlertTriangle : Info
  const body = (
    <span className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-[11.5px] ${chipClass(item.severity)}`}>
      <Icon size={12} />
      {item.text}
    </span>
  )
  if (item.kind === 'earnings_soon' && item.ticker) {
    return <Link to={researchHref(item.ticker, 'earnings')}>{body}</Link>
  }
  if (PORTFOLIO_KINDS.has(item.kind)) {
    return <Link to="/portfolio">{body}</Link>
  }
  return body
}

export default function AttentionBand({ items }) {
  if (!items || items.length === 0) {
    return <p className="text-[12px] text-zinc-600">Nothing needs attention right now.</p>
  }
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Chip key={`${item.kind}:${item.text}`} item={item} />
      ))}
    </div>
  )
}
```

- [ ] **Step 9: Run, verify pass + full suite + lint**

Run: `cd frontend && npx vitest run src/components/dashboard/ && npm test && npm run lint`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/lib/charts.js frontend/src/pages/Portfolio.jsx frontend/src/components/dashboard/HeroValue.jsx frontend/src/components/dashboard/HeroValue.test.jsx frontend/src/components/dashboard/AttentionBand.jsx frontend/src/components/dashboard/AttentionBand.test.jsx
git commit -m "feat: add the Dashboard hero value + attention band

$(printf 'Claude-Session: https://claude.ai/code/session_01PybJQDy4bPtNvqd9tzRJ4v')"
```

---

## Task 7: Frontend — `MoversCard`, `ContributorsCard`, `UpcomingEarnings`, `ExposureCard`

**Files:**
- Create: `frontend/src/components/dashboard/MoversCard.jsx`, `ContributorsCard.jsx`, `UpcomingEarnings.jsx`, `ExposureCard.jsx` (+ a `.test.jsx` each)

**Interfaces:**
- `MoversCard` — `props: { movers: { best: Row[], worst: Row[] } }`, `Row = {ticker,name,pnl_pct,pnl,value}`.
- `ContributorsCard` — `props: { contributors: Array<{ticker,pnl,contribution_pp,share_of_gain_pct}> }`.
- `UpcomingEarnings` — `props: { items: Array<{ticker,date,days_until,session,eps_estimate}> | null }`.
- `ExposureCard` — `props: { sector: Array<{name,pct,value}>, currency: Array<{currency,pct,value}>, concentration: {top1,top3_pct,hhi,positions} }`.

- [ ] **Step 1: Write the failing tests**

Create the four test files:

`frontend/src/components/dashboard/MoversCard.test.jsx`:

```js
import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders'
import MoversCard from './MoversCard'

const movers = {
  best: [{ ticker: 'NVDA', name: 'NVIDIA', pnl_pct: 112.3, pnl: '6949.50', value: '13131.00' }],
  worst: [{ ticker: 'INTC', name: 'Intel', pnl_pct: -22.1, pnl: '-540.00', value: '1900.00' }],
}

describe('MoversCard', () => {
  it('splits gainers and losers and links the tickers', () => {
    renderWithProviders(<MoversCard movers={movers} />)
    expect(screen.getByRole('link', { name: /NVDA/ })).toHaveAttribute('href', '/research?symbol=NVDA')
    expect(screen.getByText(/\+112\.3%/)).toBeInTheDocument()
    expect(screen.getByText(/-22\.1%/)).toBeInTheDocument()
  })

  it('shows an empty state with no holdings', () => {
    renderWithProviders(<MoversCard movers={{ best: [], worst: [] }} />)
    expect(screen.getByText(/No holdings/)).toBeInTheDocument()
  })
})
```

`frontend/src/components/dashboard/ContributorsCard.test.jsx`:

```js
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import ContributorsCard from './ContributorsCard'

describe('ContributorsCard', () => {
  it('renders a row per contributor', () => {
    render(
      <ContributorsCard
        contributors={[
          { ticker: 'NVDA', pnl: '6949.50', contribution_pp: 42.1, share_of_gain_pct: 88 },
          { ticker: 'AAPL', pnl: '900.00', contribution_pp: 5.4, share_of_gain_pct: 11 },
        ]}
      />,
    )
    expect(screen.getByText('NVDA')).toBeInTheDocument()
    expect(screen.getByText('AAPL')).toBeInTheDocument()
  })

  it('shows a placeholder when empty', () => {
    render(<ContributorsCard contributors={[]} />)
    expect(screen.getByText(/No contribution data/)).toBeInTheDocument()
  })
})
```

`frontend/src/components/dashboard/UpcomingEarnings.test.jsx`:

```js
import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders'
import UpcomingEarnings from './UpcomingEarnings'

describe('UpcomingEarnings', () => {
  it('renders nothing when the feed was unavailable (null)', () => {
    const { container } = renderWithProviders(<UpcomingEarnings items={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the two-week line when nothing is scheduled', () => {
    renderWithProviders(<UpcomingEarnings items={[]} />)
    expect(screen.getByText(/next 2 weeks/)).toBeInTheDocument()
  })

  it('links each row to the Research earnings tab', () => {
    renderWithProviders(
      <UpcomingEarnings
        items={[{ ticker: 'MSFT', date: '2026-09-13', days_until: 3, session: 'amc', eps_estimate: 3.1 }]}
      />,
    )
    expect(screen.getByRole('link', { name: /MSFT/ })).toHaveAttribute(
      'href', '/research?symbol=MSFT&tab=earnings',
    )
    expect(screen.getByText(/in 3 days/)).toBeInTheDocument()
  })
})
```

`frontend/src/components/dashboard/ExposureCard.test.jsx`:

```js
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import ExposureCard from './ExposureCard'

const base = {
  sector: [{ name: 'Technology', pct: 90, value: '9000.00' }, { name: 'Staples', pct: 10, value: '1000.00' }],
  concentration: { top1: { ticker: 'NVDA', pct: 60 }, top3_pct: 100, hhi: 0.46, positions: 3 },
}

describe('ExposureCard', () => {
  it('lists sectors and a concentration caption', () => {
    render(<ExposureCard {...base} currency={[{ currency: 'USD', pct: 90, value: '9000.00' }, { currency: 'EUR', pct: 10, value: '1000.00' }]} />)
    expect(screen.getByText('Technology')).toBeInTheDocument()
    expect(screen.getByText(/Top 3: 100%/)).toBeInTheDocument()
    expect(screen.getByText(/HHI 0\.46/)).toBeInTheDocument()
  })

  it('shows a single currency as text, not a chart', () => {
    render(<ExposureCard {...base} currency={[{ currency: 'EUR', pct: 100, value: '10000.00' }]} />)
    expect(screen.getByText(/100% EUR/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run, verify fail**

Run: `cd frontend && npx vitest run src/components/dashboard/`
Expected: FAIL — four modules not found.

- [ ] **Step 3: Implement `MoversCard`**

Create `frontend/src/components/dashboard/MoversCard.jsx`:

```jsx
import { Link } from 'react-router-dom'

import { fmtEur, fmtPct } from '../../lib/format'
import { researchHref } from '../../lib/research'
import { Card, CardHeader } from '../ui'

function Row({ r }) {
  const up = Number(r.pnl_pct) >= 0
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <Link to={researchHref(r.ticker)} className="text-[12.5px] font-medium text-zinc-100 hover:text-blue-300">
        {r.ticker}
      </Link>
      <div className="flex items-center gap-2">
        <span className={`text-[12px] num font-mono ${up ? 'text-emerald-400' : 'text-red-400'}`}>
          {fmtPct(r.pnl_pct, { decimals: 1 })}
        </span>
        <span className="text-[11px] num font-mono text-zinc-600">{fmtEur(r.pnl, { sign: true, decimals: 0 })}</span>
      </div>
    </div>
  )
}

export default function MoversCard({ movers }) {
  const empty = movers.best.length === 0 && movers.worst.length === 0
  return (
    <Card>
      <CardHeader title="Movers" subtitle="By all-time return" />
      {empty ? (
        <p className="mt-3 text-[12px] text-zinc-500">No holdings to compare yet.</p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-x-6">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-zinc-600 mb-1">Gainers</div>
            {movers.best.map((r) => <Row key={r.ticker} r={r} />)}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-zinc-600 mb-1">Losers</div>
            {movers.worst.map((r) => <Row key={r.ticker} r={r} />)}
          </div>
        </div>
      )}
    </Card>
  )
}
```

- [ ] **Step 4: Implement `ContributorsCard`**

Create `frontend/src/components/dashboard/ContributorsCard.jsx`:

```jsx
import { Bar, BarChart, Cell, ResponsiveContainer, XAxis, YAxis } from 'recharts'

import { Card, CardHeader, ChartPlaceholder } from '../ui'

export default function ContributorsCard({ contributors }) {
  if (!contributors || contributors.length === 0) {
    return (
      <Card>
        <CardHeader title="Contributors" subtitle="Share of total return" />
        <ChartPlaceholder height={200}>No contribution data yet</ChartPlaceholder>
      </Card>
    )
  }
  const data = contributors.map((c) => ({ ticker: c.ticker, pp: Number(c.contribution_pp) }))
  return (
    <Card>
      <CardHeader title="Contributors" subtitle="Each holding's contribution to total return (pp)" />
      <div className="mt-4 h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
            <XAxis type="number" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false}
              tickFormatter={(v) => `${v}`} />
            <YAxis type="category" dataKey="ticker" tick={{ fill: '#a1a1aa', fontSize: 11 }}
              axisLine={false} tickLine={false} width={56} />
            <Bar dataKey="pp" radius={[0, 3, 3, 0]} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.ticker} fill={d.pp >= 0 ? '#34d399' : '#f87171'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
```

- [ ] **Step 5: Implement `UpcomingEarnings`**

Create `frontend/src/components/dashboard/UpcomingEarnings.jsx`:

```jsx
import { Link } from 'react-router-dom'

import { fmtNum } from '../../lib/format'
import { researchHref } from '../../lib/research'
import { Card, CardHeader } from '../ui'

const SESSION = { bmo: 'Before open', amc: 'After close', dmh: 'During hours' }
const whenText = (d) => (d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`)

export default function UpcomingEarnings({ items }) {
  if (items == null) return null
  return (
    <Card padding={false}>
      <div className="px-5 py-3 border-b border-white/[0.06]">
        <CardHeader title="Upcoming earnings" subtitle="Your holdings, next 2 weeks" />
      </div>
      {items.length === 0 ? (
        <p className="px-5 py-4 text-[12px] text-zinc-500">No holdings report in the next 2 weeks.</p>
      ) : (
        <div className="divide-y divide-white/[0.04]">
          {items.slice(0, 5).map((e) => (
            <div key={`${e.ticker}-${e.date}`} className="flex items-center justify-between gap-3 px-5 py-2.5">
              <Link to={researchHref(e.ticker, 'earnings')} className="text-[12.5px] font-medium text-zinc-100 hover:text-blue-300">
                {e.ticker}
              </Link>
              <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                <span className="num font-mono">{e.date}</span>
                <span>{whenText(e.days_until)}</span>
                <span>{SESSION[e.session] || '—'}</span>
                <span className="num font-mono">est {fmtNum(e.eps_estimate, 2)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
```

- [ ] **Step 6: Implement `ExposureCard`**

Create `frontend/src/components/dashboard/ExposureCard.jsx`:

```jsx
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

import { chartTooltipProps, SECTOR_PALETTE } from '../../lib/charts'
import { fmtEur } from '../../lib/format'
import { Card, CardHeader } from '../ui'

function Donut({ data, nameKey }) {
  return (
    <div className="h-[150px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey={nameKey} innerRadius={38} outerRadius={62}
            paddingAngle={2} stroke="#18181b" strokeWidth={2} isAnimationActive={false}>
            {data.map((d, i) => <Cell key={i} fill={SECTOR_PALETTE[i % SECTOR_PALETTE.length]} />)}
          </Pie>
          <Tooltip {...chartTooltipProps} formatter={(v, n) => [fmtEur(v), n]} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

function Legend({ rows, nameKey }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
      {rows.map((r, i) => (
        <div key={r[nameKey]} className="flex items-center gap-1.5 text-[11.5px]">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: SECTOR_PALETTE[i % SECTOR_PALETTE.length] }} />
          <span className="text-zinc-300">{r[nameKey]}</span>
          <span className="ml-auto text-zinc-500 num font-mono">{r.pct}%</span>
        </div>
      ))}
    </div>
  )
}

export default function ExposureCard({ sector, currency, concentration }) {
  const c = concentration || {}
  const caption = [
    c.top3_pct != null && `Top 3: ${Math.round(c.top3_pct)}%`,
    c.hhi != null && `HHI ${c.hhi.toFixed(2)}`,
    c.positions != null && `${c.positions} position${c.positions === 1 ? '' : 's'}`,
  ].filter(Boolean).join(' · ')

  return (
    <Card>
      <CardHeader title="Exposure" subtitle="Sector and currency, by value" />
      <div className="mt-2">
        {sector.length > 0 ? (
          <>
            <Donut data={sector} nameKey="name" />
            <Legend rows={sector} nameKey="name" />
          </>
        ) : (
          <p className="text-[12px] text-zinc-500">No holdings yet.</p>
        )}
      </div>
      {currency.length > 1 ? (
        <div className="mt-4 pt-3 border-t border-white/[0.06]">
          <Legend rows={currency} nameKey="currency" />
        </div>
      ) : currency.length === 1 ? (
        <div className="mt-3 pt-3 border-t border-white/[0.06] text-[11.5px] text-zinc-500">
          100% {currency[0].currency}
        </div>
      ) : null}
      {caption && <p className="mt-3 text-[11px] text-zinc-500">{caption}</p>}
    </Card>
  )
}
```

- [ ] **Step 7: Run, verify pass + full suite + lint**

Run: `cd frontend && npx vitest run src/components/dashboard/ && npm test && npm run lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/dashboard/
git commit -m "feat: add movers, contributors, upcoming-earnings and exposure cards

$(printf 'Claude-Session: https://claude.ai/code/session_01PybJQDy4bPtNvqd9tzRJ4v')"
```

---

## Task 8: Frontend — Dashboard reorganisation

**Files:**
- Modify: `frontend/src/pages/Dashboard.jsx`
- Create: `frontend/src/pages/Dashboard.test.jsx`

**Interfaces:**
- Consumes: `usePortfolioInsights`, `usePositions`, `usePortfolioSummary`, `useTransactions` from `../api/queries`; the six `components/dashboard/*`; `Skeleton` from `../components/ui`.

- [ ] **Step 1: Write the failing Dashboard test**

Create `frontend/src/pages/Dashboard.test.jsx`:

```js
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'

import { renderWithProviders } from '../test/renderWithProviders'
import Dashboard from './Dashboard'

vi.mock('../api/queries')
import * as queries from '../api/queries'

const idle = { data: undefined, isLoading: false, error: null }

const insights = {
  as_of: '2026-09-09', stale: false,
  value: { net_worth: '10000.00', portfolio: '9000.00', bank: '1000.00' },
  change: { day: { abs: '50.00', pct: 0.56 }, week: null, month: null, ytd: { abs: '800.00', pct: 9 }, all_time: { abs: '2000.00', pct: 25 } },
  spark: [{ date: '2026-09-08', value: 9900 }, { date: '2026-09-09', value: 10000 }],
  concentration: { top1: { ticker: 'NVDA', pct: 60 }, top3_pct: 100, hhi: 0.46, positions: 1 },
  sector_exposure: [{ name: 'Technology', pct: 100, value: '9000.00' }],
  currency_exposure: [{ currency: 'USD', pct: 100, value: '9000.00' }],
  movers: { best: [{ ticker: 'NVDA', name: 'NVIDIA', pnl_pct: 112.3, pnl: '6949.50', value: '13131.00' }], worst: [] },
  contributors: [{ ticker: 'NVDA', pnl: '6949.50', contribution_pp: 42.1, share_of_gain_pct: 100 }],
  attention: [{ kind: 'single_name', severity: 'warn', text: 'NVDA alone is 60% of the portfolio.' }],
  upcoming_earnings: [],
}

const positions = [{
  ticker: 'NVDA', name: 'NVIDIA', color: '#76b900', currency: 'USD', price_source: 'live',
  current_price: '875.40', value: '13131.00', pnl: '6949.50', weight: '100.0',
}]

function stub(over = {}) {
  queries.usePortfolioInsights.mockReturnValue({ ...idle, data: over.insights ?? insights })
  queries.usePositions.mockReturnValue({ ...idle, data: positions })
  queries.usePortfolioSummary.mockReturnValue({ ...idle, data: { total_value: '13131.00', allocation: [{ ticker: 'NVDA', value: '13131.00', color: '#76b900' }] } })
  queries.useTransactions.mockReturnValue({ ...idle, data: [] })
}

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stub()
  })

  it('leads with the net-worth hero and a delta', () => {
    renderWithProviders(<Dashboard />)
    expect(screen.getByText('€10,000.00')).toBeInTheDocument()
    expect(screen.getByText(/\+0\.56%/)).toBeInTheDocument()
  })

  it('shows an attention chip', () => {
    renderWithProviders(<Dashboard />)
    expect(screen.getByText(/NVDA alone is 60%/)).toBeInTheDocument()
  })

  it('shows movers with a linked ticker', () => {
    renderWithProviders(<Dashboard />)
    expect(screen.getAllByRole('link', { name: /NVDA/ }).length).toBeGreaterThan(0)
  })

  it('renders skeletons while insights load', () => {
    queries.usePortfolioInsights.mockReturnValue({ ...idle, data: undefined })
    const { container } = renderWithProviders(<Dashboard />)
    expect(container.querySelector('.animate-pulse')).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run, verify fail**

Run: `cd frontend && npx vitest run src/pages/Dashboard.test.jsx`
Expected: FAIL — the current Dashboard renders `StatStrip`, has no hero / attention / movers, and does not call `usePortfolioInsights`.

- [ ] **Step 3: Rewire `pages/Dashboard.jsx`**

Replace the imports block's query hooks and `ui` import, and the top of the
component + the render tree. Concretely:

- Imports:

```jsx
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { usePortfolioInsights, usePortfolioSummary, usePositions, useTransactions } from '../api/queries'
import { fmtEur, fmtMoney, fmtNum } from '../lib/format'
import { priceBasis } from '../lib/pricing'
import { researchHref } from '../lib/research'
import PriceBasisNote from '../components/PriceBasisNote'
import { Card, CardHeader, PageHeader, Skeleton, Badge } from '../components/ui'
import { chartTooltipProps } from '../lib/charts'
import NetWorthChart from '../components/NetWorthChart'
import HeroValue from '../components/dashboard/HeroValue'
import AttentionBand from '../components/dashboard/AttentionBand'
import MoversCard from '../components/dashboard/MoversCard'
import ContributorsCard from '../components/dashboard/ContributorsCard'
import UpcomingEarnings from '../components/dashboard/UpcomingEarnings'
import ExposureCard from '../components/dashboard/ExposureCard'
```

(`fmtPct` is no longer used in this file — drop it from the `format` import if lint flags it; keep `fmtMoney`/`fmtNum` for the tables.)

- Component head:

```jsx
export default function Dashboard() {
  const insightsQuery = usePortfolioInsights()
  const summaryQuery = usePortfolioSummary()
  const positionsQuery = usePositions()
  const recentTxQuery = useTransactions('?page_size=5')

  const failed = insightsQuery.error || positionsQuery.error || summaryQuery.error || recentTxQuery.error
  if (failed) return <div className="text-red-400 text-sm">Failed to load dashboard data</div>

  if (!insightsQuery.data || !summaryQuery.data)
    return (
      <div className="space-y-5">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-10 w-2/3" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    )

  const insights = insightsQuery.data
  const summary = summaryQuery.data
  const positions = positionsQuery.data ?? []
  const recentTx = recentTxQuery.data ?? []
  const top5 = positions.slice().sort((a, b) => Number(b.value) - Number(a.value)).slice(0, 5)
```

- Render tree — keep the existing `txTone`, the "Top positions" `Card`/table
  (unchanged, still `researchHref` links), the allocation `Card` with its
  `PieChart` (unchanged — it reads `summary.allocation` / `summary.total_value`),
  and the "Recent transactions" `Card` (unchanged). Reorder to:

```jsx
  return (
    <div className="space-y-5">
      <PageHeader title="Dashboard" subtitle="Overview of your investments and bank accounts" />

      <HeroValue value={insights.value} change={insights.change} spark={insights.spark} />
      <AttentionBand items={insights.attention} />

      <div className="grid gap-4 lg:grid-cols-2">
        <MoversCard movers={insights.movers} />
        <ContributorsCard contributors={insights.contributors} />
      </div>

      <UpcomingEarnings items={insights.upcoming_earnings} />

      <NetWorthChart />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* existing "Top positions" Card + table — unchanged */}
        {/* existing "Allocation" Card + PieChart — unchanged */}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ExposureCard
          sector={insights.sector_exposure}
          currency={insights.currency_exposure}
          concentration={insights.concentration}
        />
        {/* leave the second column empty or move "Recent transactions" here;
            simplest: keep Recent transactions full-width below */}
      </div>

      {/* existing "Recent transactions" Card — unchanged, full width */}
    </div>
  )
```

Keep the Top-positions table and Allocation pie exactly as they are today
(same JSX, same `top5` / `summary.allocation`). The only structural change is
order + the three new rows (hero, attention, movers/contributors,
upcoming-earnings, exposure). `ExposureCard` sits in its own full-width row
below the Top-positions/Allocation grid; Recent transactions stays last.

- [ ] **Step 4: Run, verify pass**

Run: `cd frontend && npx vitest run src/pages/Dashboard.test.jsx`
Expected: PASS.

- [ ] **Step 5: Full frontend suite + lint + build**

Run: `cd frontend && npm test && npm run lint && npm run build`
Expected: PASS; build emits no errors (the pre-existing chunk-size warning is fine).

- [ ] **Step 6: Full backend suite**

Run: `cd backend && .venv/bin/python manage.py test`
Expected: PASS.

- [ ] **Step 7: Manual smoke (recommended)**

`scripts/dev.sh`, open the Dashboard: hero value + deltas + sparkline, an
attention chip that links to Portfolio / Research, movers + contributors
charts, upcoming-earnings list, the allocation pie still present, the new
exposure donut, no layout collapse at ~800px width. Switch to a fresh DB
(`seed_demo_data`) to confirm the `no_history` / empty states.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/Dashboard.jsx frontend/src/pages/Dashboard.test.jsx
git commit -m "feat: reorganise the Dashboard around a value hero and intelligence cards

$(printf 'Claude-Session: https://claude.ai/code/session_01PybJQDy4bPtNvqd9tzRJ4v')"
```

---

## Final verification

- [ ] `cd backend && .venv/bin/python manage.py test` — green.
- [ ] `cd frontend && npm test` — green.
- [ ] `cd frontend && npm run lint && npm run build` — clean.
- [ ] Dashboard leads with hero + deltas (labelled end-of-day) + sparkline; attention band links out; movers + contributors render as charts/rows; upcoming earnings link to the Research earnings tab; allocation pie preserved; exposure donut added; empty/`no_history`/feed-down states all render cleanly.
- [ ] Then `superpowers:finishing-a-development-branch`; on merge, the branch is `dashboard-command-center` off `main`.

---

## Self-review notes

- **Spec coverage:** endpoint + `insights.py` blocks → Tasks 1–4; client/hook → Task 5; `SECTOR_PALETTE` lift + hero + attention → Task 6; movers/contributors/upcoming/exposure → Task 7; Dashboard reorg + test → Task 8. Every spec section maps to a task.
- **Type consistency:** delta shape `{abs, pct}` (Tasks 1, 6, 8); `movers` row `{ticker,name,pnl_pct,pnl,value}` (Tasks 2, 7, 8); `attention` item `{kind,severity,text,ticker?}` with `ticker` only on `earnings_soon` (Tasks 3, 6, 8); `concentration` `{top1,top3_pct,hhi,positions}` (Tasks 2, 7, 8); `_exposure` output key is `name` for sector / `currency` for currency (Tasks 2, 7). `_window_earnings` is the single patch seam for the earnings call (Tasks 3, 4).
- **Placeholder scan:** none — every code step has literal code; the Dashboard reorg (Task 8 Step 3) keeps the existing Top-positions/Allocation/Recent-transactions JSX verbatim and only changes order + adds rows, so it is described rather than re-pasted, with the exact new wrapper tree given.
- **Known soft spot:** Task 8's `fmtPct` may become an unused import — drop it if lint flags it. `usePortfolioSummary` is retained solely for the allocation pie; if a later slice moves that pie onto insights, the hook goes too.
