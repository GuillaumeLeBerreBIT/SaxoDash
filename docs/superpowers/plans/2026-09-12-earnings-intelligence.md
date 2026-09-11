# Earnings intelligence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface Finnhub's already-fetched `series.quarterly` block as a plain-language "what changed" insight card on the Research Earnings tab, and mark past earnings dates directly on the Research price chart — all from data already in the app, no new provider.

**Architecture:** Backend adds one shaping function (`_quarterly_trends`) to `research/finnhub.py`, additive to the existing fundamentals payload, cache key bumped. Frontend derivation is pure and tested standalone (`lib/earningsInsights.js`, `lib/research.js::earningsMarkersForBars`), consumed by a new `EarningsInsights` component and by `TVChart`'s existing hand-rolled SVG renderer.

**Tech Stack:** Django REST Framework, Finnhub free tier, Redis cache; Vite + React 19 (JS, not TS), Recharts (unused in this slice — `TVChart` is hand-rolled SVG), Lucide, Tailwind v4; vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-12-earnings-intelligence-design.md` — read alongside this plan.

## Global Constraints

- **No new data provider, no new endpoint.** Everything comes from the existing `/stock/metric` fundamentals payload and the existing per-symbol earnings endpoint.
- **`revenue_per_share` is a per-share proxy from `salesPerShare`, never called "revenue" in any UI string.** Real reported ratios (EPS, margins) are used directly.
- **Insufficient data renders a plain "not enough history" line, never a computed sentence from too few points.** `_quarterly_trends` returns `None` below `QUARTERLY_MIN_POINTS`; `buildEarningsInsights` returns `[]` below the same floor.
- **Derivation is pure and frontend-side** (mirrors `lib/snapshot.js`): the backend only shapes raw numbers.
- **Testing:** backend `manage.py test`, frontend `npm test` + `npm run lint` + `npm run build` all green at the end of every task. Commit style: `type: summary` (no attribution footer, per current instruction). Branch `earnings-intelligence` (already created).

---

## File Structure

**Backend (`backend/`):**
- `research/finnhub.py` — MODIFY: `QUARTERLY_TREND_KEYS`, `QUARTERLY_MIN_POINTS`, `QUARTERLY_TREND_POINTS` constants; `_quarterly_trends`; wire into `to_fundamentals`; bump `CACHE_V` to `'v3'`.
- `research/tests.py` — MODIFY: extend `SAMPLE_SERIES` with a `'quarterly'` key; new `QuarterlyTrendsTest`; update the cache-key assertion to `v3`.

**Frontend (`frontend/src/`):**
- `lib/earningsInsights.js` — CREATE: `yoyGrowthSeries`, `buildEarningsInsights`.
- `lib/earningsInsights.test.js` — CREATE.
- `lib/research.js` — MODIFY: `earningsMarkersForBars`.
- `lib/research.test.js` — MODIFY: extend.
- `components/research/EarningsInsights.jsx` — CREATE.
- `components/research/EarningsInsights.test.jsx` — CREATE.
- `components/research/EarningsTab.jsx` — MODIFY: accept `fundamentals`, render `EarningsInsights`.
- `components/research/EarningsTab.test.jsx` — MODIFY: pass a `fundamentals` prop.
- `components/research/TVChart.jsx` — MODIFY: `earningsMarkers` prop + rendering.
- `components/research/TVChart.test.jsx` — MODIFY: extend.
- `components/research/ChartPanel.jsx` — MODIFY: forward `earningsMarkers`.
- `pages/Research.jsx` — MODIFY: pass `fundamentals` to `EarningsTab`; compute and pass `earningsMarkers` to `ChartPanel`.

---

## Task 1: Backend — `_quarterly_trends` + `to_fundamentals` wiring + cache bump

**Files:**
- Modify: `backend/research/finnhub.py`
- Test: `backend/research/tests.py`

**Interfaces:**
- Produces: `finnhub.QUARTERLY_MIN_POINTS = 8`, `finnhub.QUARTERLY_TREND_POINTS = 12`.
- Produces: `finnhub._quarterly_trends(financials: dict) -> list[dict] | None`, each row `{'period': str, 'eps': float, 'revenue_per_share': float, 'gross_margin': float | None, 'net_margin': float | None, 'operating_margin': float | None}`, oldest-first.
- Produces: `to_fundamentals(...)` gains `'quarterly_trends'` in its return dict only when `_quarterly_trends` is truthy.
- Produces: `finnhub.CACHE_V = 'v3'`.

- [ ] **Step 1: Extend the shared series fixture**

In `backend/research/tests.py`, add a `'quarterly'` key to `SAMPLE_SERIES` (the fixture already has `'annual'`). Build 10 aligned quarters, oldest-first conceptually but **written newest-first** (matching Finnhub's real ordering — `_series_stats`/`_valuation_history` already rely on this):

```python
SAMPLE_SERIES['quarterly'] = {
    'eps': [
        {'period': '2026-06-30', 'v': 1.65}, {'period': '2026-03-31', 'v': 1.52},
        {'period': '2025-12-31', 'v': 1.48}, {'period': '2025-09-30', 'v': 1.40},
        {'period': '2025-06-30', 'v': 1.30}, {'period': '2025-03-31', 'v': 1.20},
        {'period': '2024-12-31', 'v': 1.15}, {'period': '2024-09-30', 'v': 1.10},
        {'period': '2024-06-30', 'v': 1.00}, {'period': '2024-03-31', 'v': 0.95},
    ],
    'salesPerShare': [
        {'period': '2026-06-30', 'v': 12.0}, {'period': '2026-03-31', 'v': 11.4},
        {'period': '2025-12-31', 'v': 11.0}, {'period': '2025-09-30', 'v': 10.6},
        {'period': '2025-06-30', 'v': 10.0}, {'period': '2025-03-31', 'v': 9.6},
        {'period': '2024-12-31', 'v': 9.3}, {'period': '2024-09-30', 'v': 9.0},
        {'period': '2024-06-30', 'v': 8.5}, {'period': '2024-03-31', 'v': 8.2},
    ],
    'grossMargin': [
        {'period': '2026-06-30', 'v': 46.0}, {'period': '2026-03-31', 'v': 45.5},
        {'period': '2025-06-30', 'v': 44.0},
    ],
    'netMargin': [
        {'period': '2026-06-30', 'v': 26.0}, {'period': '2026-03-31', 'v': 25.0},
    ],
    'operatingMargin': [
        {'period': '2026-06-30', 'v': 31.0}, {'period': '2026-03-31', 'v': 30.0},
        {'period': '2025-06-30', 'v': 28.5},
    ],
}
```

(Note: `grossMargin`/`netMargin`/`operatingMargin` deliberately carry gaps — the test data must exercise "margin present at this period" vs. "margin absent, row still kept.")

- [ ] **Step 2: Write the failing tests**

Add to `backend/research/tests.py`:

```python
class QuarterlyTrendsTest(TestCase):
    def test_builds_oldest_first_rows_aligned_on_eps_and_revenue_proxy(self):
        financials = {**SAMPLE_FINANCIALS, 'series': SAMPLE_SERIES}
        rows = finnhub._quarterly_trends(financials)
        self.assertEqual(rows[0]['period'], '2024-03-31')
        self.assertEqual(rows[-1]['period'], '2026-06-30')
        self.assertEqual(rows[-1]['eps'], 1.65)
        self.assertEqual(rows[-1]['revenue_per_share'], 12.0)

    def test_keeps_the_row_when_a_margin_is_missing_at_that_period(self):
        financials = {**SAMPLE_FINANCIALS, 'series': SAMPLE_SERIES}
        rows = finnhub._quarterly_trends(financials)
        by_period = {r['period']: r for r in rows}
        self.assertIsNone(by_period['2024-03-31']['gross_margin'])
        self.assertEqual(by_period['2026-06-30']['gross_margin'], 46.0)

    def test_drops_a_period_missing_either_eps_or_revenue_proxy(self):
        series = {
            'quarterly': {
                'eps': SAMPLE_SERIES['quarterly']['eps'] + [{'period': '2023-12-31', 'v': 0.9}],
                'salesPerShare': SAMPLE_SERIES['quarterly']['salesPerShare'],  # no 2023-12-31 entry
            }
        }
        financials = {**SAMPLE_FINANCIALS, 'series': series}
        rows = finnhub._quarterly_trends(financials)
        self.assertNotIn('2023-12-31', [r['period'] for r in rows])

    def test_caps_at_the_trend_point_limit(self):
        eps = [{'period': f'{2020 + i // 4}-{["03","06","09","12"][i % 4]}-28', 'v': 1.0 + i * 0.01}
               for i in range(20)]
        sales = [{'period': row['period'], 'v': 8.0 + i * 0.1} for i, row in enumerate(eps)]
        financials = {**SAMPLE_FINANCIALS, 'series': {'quarterly': {'eps': eps, 'salesPerShare': sales}}}
        rows = finnhub._quarterly_trends(financials)
        self.assertEqual(len(rows), finnhub.QUARTERLY_TREND_POINTS)

    def test_none_below_the_minimum_point_count(self):
        financials = {
            **SAMPLE_FINANCIALS,
            'series': {'quarterly': {
                'eps': SAMPLE_SERIES['quarterly']['eps'][:5],
                'salesPerShare': SAMPLE_SERIES['quarterly']['salesPerShare'][:5],
            }},
        }
        self.assertIsNone(finnhub._quarterly_trends(financials))

    def test_none_without_a_quarterly_series_block(self):
        self.assertIsNone(finnhub._quarterly_trends(SAMPLE_FINANCIALS))

    def test_to_fundamentals_includes_quarterly_trends_when_available(self):
        financials = {**SAMPLE_FINANCIALS, 'series': SAMPLE_SERIES}
        result = finnhub.to_fundamentals(SAMPLE_PROFILE, financials, [], [])
        self.assertEqual(len(result['quarterly_trends']), 10)

    def test_to_fundamentals_omits_quarterly_trends_when_absent(self):
        result = finnhub.to_fundamentals(SAMPLE_PROFILE, SAMPLE_FINANCIALS, [], [])
        self.assertNotIn('quarterly_trends', result)
```

Update the existing cache-key test:

```python
    def test_cache_key_carries_the_shape_version(self):
        self.assertEqual(finnhub._cache_key('AAPL'), 'research:fundamentals:v3:AAPL')
```

- [ ] **Step 3: Run, verify fail**

Run: `cd backend && .venv/bin/python manage.py test research.tests.QuarterlyTrendsTest research.tests.FundamentalsShapingTest -v 2`
Expected: FAIL — `_quarterly_trends` missing; cache-key test expects `v3`, code still says `v2`.

- [ ] **Step 4: Implement `_quarterly_trends`**

In `backend/research/finnhub.py`, near `_valuation_history`:

```python
QUARTERLY_TREND_KEYS = {
    'eps': 'eps',
    'revenue_per_share': 'salesPerShare',
    'gross_margin': 'grossMargin',
    'net_margin': 'netMargin',
    'operating_margin': 'operatingMargin',
}
QUARTERLY_MIN_POINTS = 8    # two YoY comparisons need index-5..index-1 to exist
QUARTERLY_TREND_POINTS = 12  # ~3 years, oldest-first


def _quarterly_points(quarterly, key):
    return {p['period']: p['v'] for p in (quarterly.get(key) or []) if p.get('v') is not None}


def _quarterly_trends(financials):
    """Per-quarter eps / revenue-per-share proxy / margins, oldest-first,
    aligned on periods where both eps and salesPerShare exist. `None` when
    the series is missing or too shallow for the two-YoY-comparison the
    frontend's insight math needs."""
    quarterly = (financials.get('series') or {}).get('quarterly') or {}
    if not quarterly:
        return None

    eps_by_period = _quarterly_points(quarterly, QUARTERLY_TREND_KEYS['eps'])
    rev_by_period = _quarterly_points(quarterly, QUARTERLY_TREND_KEYS['revenue_per_share'])
    margin_maps = {
        field: _quarterly_points(quarterly, key)
        for field, key in QUARTERLY_TREND_KEYS.items()
        if field not in ('eps', 'revenue_per_share')
    }

    periods = sorted(set(eps_by_period) & set(rev_by_period))
    if len(periods) < QUARTERLY_MIN_POINTS:
        return None

    periods = periods[-QUARTERLY_TREND_POINTS:]
    return [
        {
            'period': period,
            'eps': eps_by_period[period],
            'revenue_per_share': rev_by_period[period],
            **{field: margin_maps[field].get(period) for field in margin_maps},
        }
        for period in periods
    ]
```

- [ ] **Step 5: Wire into `to_fundamentals` and bump the cache version**

```python
    trends = _quarterly_trends(financials)
    if trends:
        shaped['quarterly_trends'] = trends
    return shaped
```

(add right after the existing `history = _valuation_history(financials)` block, before `return shaped`).

```python
CACHE_V = 'v3'  # bump when the shaped fundamentals payload changes shape
```

- [ ] **Step 6: Run, verify pass**

Run: `cd backend && .venv/bin/python manage.py test research.tests.QuarterlyTrendsTest research.tests.FundamentalsShapingTest research.tests.FundamentalsCacheTest research.tests.FundamentalsNoDataTest -v 2`
Expected: PASS.

- [ ] **Step 7: Full backend suite**

Run: `cd backend && .venv/bin/python manage.py test`
Expected: PASS — no regression.

- [ ] **Step 8: Commit**

```bash
git add backend/research/finnhub.py backend/research/tests.py
git commit -m "feat: derive quarterly EPS/margin/revenue-per-share trends from Finnhub's series block"
```

---

## Task 2: Frontend — `lib/earningsInsights.js`

**Files:**
- Create: `frontend/src/lib/earningsInsights.js`, `frontend/src/lib/earningsInsights.test.js`

**Interfaces:**
- Produces: `yoyGrowthSeries(values: Array<number|null>) -> Array<number|null>` — same length; entry `i` is `% change` vs `values[i-4]`, `null` when `i<4` or either endpoint is `null`/`0`.
- Produces: `buildEarningsInsights(trends: Array<Row>|null|undefined) -> Array<{tone: 'pos'|'neutral'|'caution', text: string}>` — `[]` when `trends` is falsy or `trends.length < 8`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/earningsInsights.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { yoyGrowthSeries, buildEarningsInsights } from './earningsInsights'

describe('yoyGrowthSeries', () => {
  it('is null for the first four entries', () => {
    const out = yoyGrowthSeries([1, 2, 3, 4, 5])
    expect(out.slice(0, 4)).toEqual([null, null, null, null])
  })

  it('computes percent change against the same index four back', () => {
    const out = yoyGrowthSeries([10, 0, 0, 0, 11])
    expect(out[4]).toBeCloseTo(10, 5)
  })

  it('is null when the anchor is zero or null', () => {
    expect(yoyGrowthSeries([0, 0, 0, 0, 5])[4]).toBeNull()
    expect(yoyGrowthSeries([null, 0, 0, 0, 5])[4]).toBeNull()
  })
})

function row(period, eps, revPerShare, margins = {}) {
  return {
    period, eps, revenue_per_share: revPerShare,
    gross_margin: margins.gross ?? null, net_margin: margins.net ?? null,
    operating_margin: margins.operating ?? null,
  }
}

// 10 quarters, index 0-9. The margin YoY comparison reads index 9 (latest)
// against index 5 (latest - 4), so operating_margin is set at exactly those
// two indices - 27 -> 31, a +4pp expansion.
const ACCEL_TRENDS = [
  row('2024-Q1', 1.0, 8.0), row('2024-Q2', 1.0, 8.0), row('2024-Q3', 1.0, 8.0), row('2024-Q4', 1.0, 8.0),
  row('2025-Q1', 1.1, 10.0), row('2025-Q2', 1.1, 10.0, { operating: 27 }), row('2025-Q3', 1.1, 10.0), row('2025-Q4', 1.1, 10.0),
  row('2026-Q1', 1.3, 11.0),
  row('2026-Q2', 1.6, 12.5, { operating: 31 }),
]

describe('buildEarningsInsights', () => {
  it('returns [] when there are fewer than 8 quarters', () => {
    expect(buildEarningsInsights(ACCEL_TRENDS.slice(0, 5))).toEqual([])
  })

  it('returns [] without a trends array', () => {
    expect(buildEarningsInsights(null)).toEqual([])
    expect(buildEarningsInsights(undefined)).toEqual([])
  })

  it('reports acceleration when the YoY rate rises enough', () => {
    const insights = buildEarningsInsights(ACCEL_TRENDS)
    const accel = insights.find((i) => i.text.includes('accelerated'))
    expect(accel).toBeTruthy()
    expect(accel.tone).toBe('pos')
  })

  it('reports deceleration when the YoY rate falls enough', () => {
    const decel = [...ACCEL_TRENDS]
    decel[9] = row('2026-Q2', 1.15, 10.2, { operating: 29 })   // YoY drops back toward ~2%
    const insights = buildEarningsInsights(decel)
    const found = insights.find((i) => i.text.includes('decelerated'))
    expect(found).toBeTruthy()
    expect(found.tone).toBe('caution')
  })

  it('reports EPS outrunning revenue-per-share as margin expansion', () => {
    const insights = buildEarningsInsights(ACCEL_TRENDS)
    // EPS YoY at index 9: (1.6-1.1)/1.1 ≈ 45%; revenue-per-share YoY ≈ 13.6% -> gap > 5pp
    const gap = insights.find((i) => i.text.includes('margin expansion'))
    expect(gap).toBeTruthy()
    expect(gap.tone).toBe('pos')
  })

  it('reports an operating-margin expansion year over year', () => {
    const insights = buildEarningsInsights(ACCEL_TRENDS)
    const margin = insights.find((i) => i.text.includes('Operating margin expanded'))
    expect(margin).toBeTruthy()
  })

  it('falls back to net margin when operating margin is unavailable at both endpoints', () => {
    const noOperating = ACCEL_TRENDS.map((r) => ({ ...r, operating_margin: null }))
    noOperating[5] = { ...noOperating[5], net_margin: 20 }   // latest - 4
    noOperating[9] = { ...noOperating[9], net_margin: 24 }   // latest
    const insights = buildEarningsInsights(noOperating)
    expect(insights.some((i) => i.text.includes('Net margin expanded'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run, verify fail**

Run: `cd frontend && npx vitest run src/lib/earningsInsights.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `frontend/src/lib/earningsInsights.js`:

```js
/** Rule-based "what changed" reads from quarterly EPS/margin/revenue-per-share
 *  trends. Pure and tested in isolation - the component only renders what
 *  these return. `revenue_per_share` is a per-share proxy (Finnhub's
 *  salesPerShare); every sentence says so, never bare "revenue". */

const YOY_LOOKBACK = 4
const ACCEL_THRESHOLD_PP = 3
const EPS_GAP_THRESHOLD_PP = 5
const MARGIN_MOVE_THRESHOLD_PP = 1
export const QUARTERLY_MIN_POINTS = 8

export function yoyGrowthSeries(values) {
  return values.map((value, i) => {
    if (i < YOY_LOOKBACK) return null
    const anchor = values[i - YOY_LOOKBACK]
    if (value == null || !anchor) return null
    return ((value - anchor) / Math.abs(anchor)) * 100
  })
}

const pct = (v) => Math.round(v * 10) / 10

export function buildEarningsInsights(trends) {
  if (!trends || trends.length < QUARTERLY_MIN_POINTS) return []

  const revGrowth = yoyGrowthSeries(trends.map((t) => t.revenue_per_share))
  const epsGrowth = yoyGrowthSeries(trends.map((t) => t.eps))
  const latest = trends.length - 1
  const prior = latest - 1

  const insights = []

  if (revGrowth[latest] != null && revGrowth[prior] != null) {
    const diff = revGrowth[latest] - revGrowth[prior]
    if (diff > ACCEL_THRESHOLD_PP) {
      insights.push({
        tone: 'pos',
        text: `Revenue per share growth accelerated from ${pct(revGrowth[prior])}% to ${pct(revGrowth[latest])}% year over year.`,
      })
    } else if (diff < -ACCEL_THRESHOLD_PP) {
      insights.push({
        tone: 'caution',
        text: `Revenue per share growth decelerated from ${pct(revGrowth[prior])}% to ${pct(revGrowth[latest])}% year over year.`,
      })
    } else {
      insights.push({
        tone: 'neutral',
        text: `Revenue per share growth held steady around ${pct(revGrowth[latest])}% year over year.`,
      })
    }
  }

  if (epsGrowth[latest] != null && revGrowth[latest] != null) {
    const gap = epsGrowth[latest] - revGrowth[latest]
    if (gap > EPS_GAP_THRESHOLD_PP) {
      insights.push({ tone: 'pos', text: 'EPS grew faster than revenue per share, consistent with margin expansion.' })
    } else if (gap < -EPS_GAP_THRESHOLD_PP) {
      insights.push({ tone: 'caution', text: 'EPS grew slower than revenue per share, consistent with margin pressure.' })
    }
  }

  const marginField = trends[latest].operating_margin != null && trends[latest - YOY_LOOKBACK]?.operating_margin != null
    ? ['operating_margin', 'Operating']
    : trends[latest].net_margin != null && trends[latest - YOY_LOOKBACK]?.net_margin != null
      ? ['net_margin', 'Net']
      : null
  if (marginField) {
    const [key, label] = marginField
    const before = trends[latest - YOY_LOOKBACK][key]
    const after = trends[latest][key]
    const delta = after - before
    if (delta > MARGIN_MOVE_THRESHOLD_PP) {
      insights.push({ tone: 'pos', text: `${label} margin expanded from ${pct(before)}% to ${pct(after)}% year over year.` })
    } else if (delta < -MARGIN_MOVE_THRESHOLD_PP) {
      insights.push({ tone: 'caution', text: `${label} margin contracted from ${pct(before)}% to ${pct(after)}% year over year.` })
    }
  }

  return insights.slice(0, 3)
}
```

- [ ] **Step 4: Run, verify pass**

Run: `cd frontend && npx vitest run src/lib/earningsInsights.test.js`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
cd frontend && npm run lint && cd ..
git add frontend/src/lib/earningsInsights.js frontend/src/lib/earningsInsights.test.js
git commit -m "feat: add rule-based quarterly earnings-trend insight derivation"
```

---

## Task 3: Frontend — `EarningsInsights` component + wiring

**Files:**
- Create: `frontend/src/components/research/EarningsInsights.jsx`, `.test.jsx`
- Modify: `frontend/src/components/research/EarningsTab.jsx`, `.test.jsx`, `frontend/src/pages/Research.jsx`

**Interfaces:**
- Produces: `EarningsInsights` default export — `props: { fundamentals }` (the raw `useFundamentals` result: `{ data, isLoading }`).
- Consumes: `buildEarningsInsights` from `../../lib/earningsInsights`; `FundamentalsGate`, `Card`, `CardHeader` from existing modules.

- [ ] **Step 1: Write the failing component tests**

Create `frontend/src/components/research/EarningsInsights.test.jsx`:

```js
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import EarningsInsights from './EarningsInsights'

function row(period, eps, revPerShare, operating = null) {
  return { period, eps, revenue_per_share: revPerShare, gross_margin: null, net_margin: null, operating_margin: operating }
}

// The margin YoY comparison reads index 9 (latest) against index 5
// (latest - 4), so operating_margin is set at exactly those two indices.
const TRENDS = [
  row('2024-Q1', 1.0, 8.0), row('2024-Q2', 1.0, 8.0), row('2024-Q3', 1.0, 8.0), row('2024-Q4', 1.0, 8.0),
  row('2025-Q1', 1.1, 10.0), row('2025-Q2', 1.1, 10.0, 27), row('2025-Q3', 1.1, 10.0), row('2025-Q4', 1.1, 10.0),
  row('2026-Q1', 1.3, 11.0), row('2026-Q2', 1.6, 12.5, 31),
]

describe('EarningsInsights', () => {
  it('renders derived sentences when quarterly_trends is available', () => {
    render(<EarningsInsights fundamentals={{ data: { available: true, quarterly_trends: TRENDS }, isLoading: false }} />)
    expect(screen.getByText(/accelerated|decelerated|held steady/)).toBeInTheDocument()
  })

  it('shows a not-enough-history line when quarterly_trends is absent', () => {
    render(<EarningsInsights fundamentals={{ data: { available: true }, isLoading: false }} />)
    expect(screen.getByText(/Not enough quarterly history/)).toBeInTheDocument()
  })

  it('defers to FundamentalsGate when fundamentals are unavailable', () => {
    render(<EarningsInsights fundamentals={{ data: { available: false, reason: 'no coverage' }, isLoading: false }} />)
    expect(screen.getByText(/no coverage/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run, verify fail**

Run: `cd frontend && npx vitest run src/components/research/EarningsInsights.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `frontend/src/components/research/EarningsInsights.jsx`:

```jsx
import { buildEarningsInsights } from '../../lib/earningsInsights'
import { Card, CardHeader } from '../ui'
import FundamentalsGate from './FundamentalsGate'

const TONE_DOT = { pos: 'bg-emerald-400', neutral: 'bg-zinc-500', caution: 'bg-amber-400' }

export default function EarningsInsights({ fundamentals }) {
  return (
    <FundamentalsGate
      fundamentals={fundamentals}
      title="What changed"
      fallback="Earnings trend data is unavailable for this symbol."
    >
      {(data) => {
        const insights = buildEarningsInsights(data.quarterly_trends)
        return (
          <Card>
            <CardHeader title="What changed" subtitle="Quarterly trend, from Finnhub" />
            {insights.length === 0 ? (
              <p className="mt-3 text-[12px] text-zinc-500">
                Not enough quarterly history yet for trend commentary.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {insights.map((insight) => (
                  <li key={insight.text} className="flex items-start gap-2 text-[12.5px] text-zinc-300">
                    <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${TONE_DOT[insight.tone]}`} />
                    {insight.text}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )
      }}
    </FundamentalsGate>
  )
}
```

- [ ] **Step 4: Run, verify pass**

Run: `cd frontend && npx vitest run src/components/research/EarningsInsights.test.jsx`
Expected: PASS.

- [ ] **Step 5: Wire into `EarningsTab.jsx`**

In `frontend/src/components/research/EarningsTab.jsx`:
- add `import EarningsInsights from './EarningsInsights'`.
- change the default export signature to `export default function EarningsTab({ symbol, earnings, fundamentals }) {`.
- in the returned JSX (the `available` branch, after `<NextEarningsCard next={data.next} />`), insert `<EarningsInsights fundamentals={fundamentals} />` immediately before the `<EpsBarChart .../>`.

- [ ] **Step 6: Update `EarningsTab.test.jsx`**

Read the file first (it mocks `earnings` only). Add a `fundamentals` prop to every `render(<EarningsTab .../>)` call, using an unavailable stub so the new card renders its fallback without needing new fixture data:

```js
fundamentals={{ data: { available: false, reason: 'x' }, isLoading: false }}
```

Add one new case:

```js
it('shows the What changed card once fundamentals carry quarterly trends', () => {
  render(
    <EarningsTab
      symbol="AAPL"
      earnings={{ data: { available: true, history: [], next: null, score: null }, isLoading: false }}
      fundamentals={{ data: { available: true, quarterly_trends: null }, isLoading: false }}
    />,
  )
  expect(screen.getByText('What changed')).toBeInTheDocument()
})
```

(Match the file's existing `earnings` fixture shape rather than retyping it if one already exists in the file — read it first.)

- [ ] **Step 7: Wire `fundamentals` through `Research.jsx`**

In `frontend/src/pages/Research.jsx`, change:

```jsx
{tab === 'earnings' ? <EarningsTab symbol={symbol} earnings={earnings} /> : null}
```

to:

```jsx
{tab === 'earnings' ? <EarningsTab symbol={symbol} earnings={earnings} fundamentals={fundamentals} /> : null}
```

(`fundamentals` is already computed in this component for the Overview/Valuation tabs.)

- [ ] **Step 8: Run the affected suites + full suite + lint**

Run: `cd frontend && npx vitest run src/components/research/EarningsInsights.test.jsx src/components/research/EarningsTab.test.jsx src/pages/Research.test.jsx && npm test && npm run lint`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/research/EarningsInsights.jsx frontend/src/components/research/EarningsInsights.test.jsx frontend/src/components/research/EarningsTab.jsx frontend/src/components/research/EarningsTab.test.jsx frontend/src/pages/Research.jsx
git commit -m "feat: show a What changed insight card on the Research Earnings tab"
```

---

## Task 4: Frontend — earnings markers on the price chart

**Files:**
- Modify: `frontend/src/lib/research.js`, `.test.js`
- Modify: `frontend/src/components/research/TVChart.jsx`, `.test.jsx`
- Modify: `frontend/src/components/research/ChartPanel.jsx`
- Modify: `frontend/src/pages/Research.jsx`

**Interfaces:**
- Produces: `earningsMarkersForBars(bars, history) -> Array<{index: number, date: string, sign: -1|0|1, actual: number|null, estimate: number|null}>`.
- `TVChart` gains prop `earningsMarkers = []`; `ChartPanel` forwards a same-named prop.

- [ ] **Step 1: Write the failing `earningsMarkersForBars` tests**

Add to `frontend/src/lib/research.test.js` (import `earningsMarkersForBars` alongside the existing named imports from `./research`):

```js
describe('earningsMarkersForBars', () => {
  const testBars = [
    { date: '2026-08-01', close: 10 }, { date: '2026-08-02', close: 11 }, { date: '2026-08-03', close: 12 },
  ]

  it('maps a history row onto its matching bar index and beat/miss sign', () => {
    const markers = earningsMarkersForBars(testBars, [
      { date: '2026-08-02', eps_actual: 1.1, eps_estimate: 1.0, eps_surprise_pct: 10 },
    ])
    expect(markers).toEqual([{ index: 1, date: '2026-08-02', sign: 1, actual: 1.1, estimate: 1.0 }])
  })

  it('skips a history date absent from the bars', () => {
    const markers = earningsMarkersForBars(testBars, [
      { date: '2026-09-01', eps_actual: 1.1, eps_estimate: 1.0, eps_surprise_pct: 10 },
    ])
    expect(markers).toEqual([])
  })

  it('is empty with no history', () => {
    expect(earningsMarkersForBars(testBars, [])).toEqual([])
  })
})
```

- [ ] **Step 2: Run, verify fail**

Run: `cd frontend && npx vitest run src/lib/research.test.js`
Expected: FAIL — `earningsMarkersForBars is not a function`.

- [ ] **Step 3: Implement**

In `frontend/src/lib/research.js`, add the import and the function:

```js
import { surpriseSign } from './charts'
```

```js
/** Past earnings dates mapped onto the currently-loaded bars, for the
 *  price-chart markers. A history date absent from `bars` (a provider date
 *  landing on a non-trading day) is skipped, not fuzzy-matched. */
export function earningsMarkersForBars(bars = [], history = []) {
  const indexByDate = new Map(bars.map((b, i) => [b.date, i]))
  const markers = []
  for (const e of history) {
    const index = indexByDate.get(e.date)
    if (index == null) continue
    markers.push({
      index, date: e.date, sign: surpriseSign(e.eps_surprise_pct),
      actual: e.eps_actual, estimate: e.eps_estimate,
    })
  }
  return markers
}
```

- [ ] **Step 4: Run, verify pass**

Run: `cd frontend && npx vitest run src/lib/research.test.js`
Expected: PASS.

- [ ] **Step 5: Write the failing `TVChart` marker tests**

Add to `frontend/src/components/research/TVChart.test.jsx`:

```js
describe('earnings markers', () => {
  it('draws a beat marker in the beat colour', () => {
    const { container } = renderChart({
      earningsMarkers: [{ index: 10, date: bars[10].date, sign: 1, actual: 1.1, estimate: 1.0 }],
    })
    expect(container.querySelector('polygon[fill="#34d399"]')).not.toBeNull()
  })

  it('draws a miss marker in the miss colour', () => {
    const { container } = renderChart({
      earningsMarkers: [{ index: 10, date: bars[10].date, sign: -1, actual: 0.9, estimate: 1.0 }],
    })
    expect(container.querySelector('polygon[fill="#f87171"]')).not.toBeNull()
  })

  it('renders none when no markers are given', () => {
    const { container } = renderChart()
    expect(container.querySelector('polygon[fill="#34d399"], polygon[fill="#f87171"], polygon[fill="#3b82f6"]')).toBeNull()
  })
})
```

- [ ] **Step 6: Run, verify fail**

Run: `cd frontend && npx vitest run src/components/research/TVChart.test.jsx`
Expected: FAIL — no `polygon` elements render.

- [ ] **Step 7: Implement marker rendering in `TVChart.jsx`**

In `frontend/src/components/research/TVChart.jsx`:
- add the import: `import { BEAT, MISS, REPORTED } from '../../lib/charts'`.
- add an `EarningsMarkers` renderer near `Candles`/`Bars`:

```jsx
const MARKER_COLOR = [MISS, REPORTED, BEAT]

function EarningsMarkers({ markers, geometry }) {
  const { xAt, chartH } = geometry
  const y = PAD_T + chartH - 6
  return markers.map((marker) => {
    const x = xAt(marker.index)
    const title = marker.actual != null
      ? `${marker.date}: ${marker.actual} vs est ${marker.estimate}`
      : marker.date
    return (
      <polygon
        key={marker.date}
        points={`${x - 4},${y + 4} ${x + 4},${y + 4} ${x},${y - 4}`}
        fill={MARKER_COLOR[marker.sign + 1]}
      >
        <title>{title}</title>
      </polygon>
    )
  })
}
```

- add `earningsMarkers` to `ChartBody`'s prop list and render it inside the `<g>` returned by `ChartBody`, after the overlays block and before the last-price tag `<g>`:

```jsx
const ChartBody = memo(function ChartBody({ data, ind, type, overlays, geometry, width, earningsMarkers }) {
  ...
      {earningsMarkers.length > 0 ? (
        <EarningsMarkers markers={earningsMarkers} geometry={geometry} />
      ) : null}

      <g>
        {/* existing last-price tag, unchanged */}
```

- in `export function TVChart({ data, ind, type, overlays, hover, setHover, height = 360, earningsMarkers = [] })`, forward it: `<ChartBody ... earningsMarkers={earningsMarkers} />`.

- [ ] **Step 8: Run, verify pass**

Run: `cd frontend && npx vitest run src/components/research/TVChart.test.jsx`
Expected: PASS.

- [ ] **Step 9: Forward the prop through `ChartPanel.jsx`**

In `frontend/src/components/research/ChartPanel.jsx`:
- change the export signature to accept `earningsMarkers = []` in the destructured props.
- pass it to `<TVChart ... earningsMarkers={earningsMarkers} />`.

- [ ] **Step 10: Wire it in `pages/Research.jsx`**

- add `earningsMarkersForBars` to the existing `from '../lib/research'` import.
- after the existing `const ind = useMemo(...)` block, add:

```js
const earningsMarkers = useMemo(
  () => earningsMarkersForBars(bars, earnings.data?.available ? earnings.data.history : []),
  [bars, earnings.data],
)
```

- pass `earningsMarkers={earningsMarkers}` to `<ChartPanel ... />`.

- [ ] **Step 11: Full suite + lint + build**

Run: `cd frontend && npm test && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 12: Full backend suite (no backend change this task, confirm no drift)**

Run: `cd backend && .venv/bin/python manage.py test`
Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add frontend/src/lib/research.js frontend/src/lib/research.test.js frontend/src/components/research/TVChart.jsx frontend/src/components/research/TVChart.test.jsx frontend/src/components/research/ChartPanel.jsx frontend/src/pages/Research.jsx
git commit -m "feat: mark past earnings beats/misses on the Research price chart"
```

---

## Final verification

- [ ] `cd backend && .venv/bin/python manage.py test` — green.
- [ ] `cd frontend && npm test` — green.
- [ ] `cd frontend && npm run lint && npm run build` — clean.
- [ ] Manual spot-check (optional): open Research on a symbol with enough quarterly history, confirm the "What changed" card reads sensibly and the chart shows beat/miss ticks at past earnings dates.
- [ ] Then `superpowers:finishing-a-development-branch` for the merge.

---

## Self-review notes

- **Spec coverage:** backend shaping + cache bump → Task 1; pure derivation → Task 2; insight card + wiring → Task 3; chart markers → Task 4. Every spec section has a task.
- **Type consistency:** `quarterly_trends` row shape identical across Task 1 (backend), Task 2 (`buildEarningsInsights` input), Task 3 (component fixture). `earningsMarkersForBars` output shape identical across Task 4's helper, `TVChart`'s renderer, and `Research.jsx`'s wiring.
- **Known soft spot for the executor:** Task 3 Step 6 asks to read `EarningsTab.test.jsx` before editing — its existing `earnings` fixture shape must be reused verbatim, not re-invented, since the file already has working tests that must keep passing once every call site gains a `fundamentals` prop.
