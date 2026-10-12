# Research Symbol Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a symbol panel under the watchlist on `/research/chart` showing key stats, performance, earnings dots, an analyst rating gauge, a technicals gauge and seasonals for the active symbol.

**Architecture:** Four pure modules in `frontend/src/lib/` hold all the arithmetic (trailing returns, seasonals, technical rating, analyst rating) and are tested without React. Five small components in `frontend/src/components/research/` draw them as hand-rolled SVG/HTML, matching the existing `SurpriseBars` style rather than Recharts. `SymbolPanel` composes them from data the chart page already fetches, plus `useFundamentals`. No backend change.

**Tech Stack:** React 19 (JavaScript), Tailwind, vitest + @testing-library/react, TanStack Query (mocked in page tests through `vi.mock('../api/queries')`).

**Spec:** `docs/superpowers/specs/2026-10-12-research-depth-design.md` (Phase 1 only).

## Global Constraints

- Work in the worktree `.worktrees/research-depth` on branch `feat/research-symbol-panel`. Run every command from `frontend/` inside that worktree.
- Generated code carries zero comments (`AGENTS.md`, "Code style"). Leave existing comments untouched.
- Chart colours come only from `frontend/src/lib/charts.js` (`POSITIVE`, `NEGATIVE`, `ESTIMATE`, `SERIES_TOTAL`, `AXIS_TEXT`, `withAlpha`, `surpriseColor`, `performanceFill`). No hex literal in a `fill`/`stroke`/`style`.
- Type sizes come from the `--fig-*` scale: `text-[var(--fig-2xs)]`, `text-[var(--fig-xs)]`, `text-[var(--fig-sm)]`, `text-[var(--fig-md)]`.
- A gain/loss state is never colour-only: every tinted figure prints its sign, every gauge prints its label.
- A block with no data is omitted, not rendered empty. An absent figure is `—` or left out, never `0`.
- An ETF (`isEtf(instrument)`) gets no earnings dots, no analyst rating, no market cap and no "Next earnings" row.
- The panel adds exactly one request the page does not already make: `useFundamentals(symbol)`.
- No new dependency.
- Test command for one file: `npx vitest run <path>`. Full gate at the end: `npx vitest run`, `npx eslint .`, `npm run build`.

## Review Focus

1. A symbol with fewer than 200 daily bars (a recent listing): the SMA 200 has no value, and must be skipped by the technical rating, not counted as a sell. Pinned in Task 3.
2. Bars with zero volume (Saxo returns `Volume` absent for some instruments, shaped to `0`): Volume and Average volume rows are left out, not shown as `0`. Pinned in Task 9.
3. Earnings where every EPS value is equal, or negative: the dot scale must not divide by zero and must keep dots inside the plot. Pinned in Task 7.
4. Price history that starts mid-year, and a year whose first close is `0`: that year is dropped from seasonals, so no line starts in March at 0% and nothing divides by zero. Pinned in Task 2.
5. Fundamentals unavailable (`{ available: false }`, the international-listing gap) or no bars at all (unresolved symbol): the panel still shows whatever it can and never throws; with nothing to show it renders nothing. Pinned in Tasks 9 and 10.

---

## File Structure

| File | Responsibility |
|---|---|
| `frontend/src/lib/performance.js` (modify) | Gains `RETURN_WINDOWS`, `trailingReturns(bars)` |
| `frontend/src/lib/seasonals.js` (create) | `seasonalSeries(bars)`: one cumulative-return line per full calendar year |
| `frontend/src/lib/technicalRating.js` (create) | `technicalRating(bars)`: indicator votes and their balance |
| `frontend/src/lib/analystRating.js` (create) | `analystRating(recommendation)`: weighted mean, label, counts |
| `frontend/src/lib/format.js` (modify) | Gains `fmtShares(count)` |
| `frontend/src/lib/earnings.js` (modify) | Gains `SESSION_LABEL`, used by `EarningsTab` and the panel |
| `frontend/src/components/research/RatingGauge.jsx` (create) | Half-circle gauge with needle and label |
| `frontend/src/components/research/PerformanceTiles.jsx` (create) | Six tinted return tiles |
| `frontend/src/components/research/EarningsDots.jsx` (create) | Actual-vs-estimate EPS dots |
| `frontend/src/components/research/SeasonalsChart.jsx` (create) | Year-over-year return lines |
| `frontend/src/components/research/SymbolPanel.jsx` (create) | Composes the blocks, owns key stats |
| `frontend/src/pages/ResearchChart.jsx` (modify) | Right column scrolls; renders `SymbolPanel` |

Bar shape everywhere: `{ date: 'YYYY-MM-DD', open, high, low, close, volume }`, oldest first.

---

### Task 1: Trailing returns

**Files:**
- Modify: `frontend/src/lib/performance.js`
- Test: `frontend/src/lib/performance.test.js` (exists; append)

**Interfaces:**
- Produces: `RETURN_WINDOWS: Array<{ key: '1W'|'1M'|'3M'|'6M'|'YTD'|'1Y' }>` and `trailingReturns(bars): Array<{ key: string, pct: number | null }>` in `RETURN_WINDOWS` order.

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/lib/performance.test.js` (add `trailingReturns` to the existing import from `./performance`):

```js
const bar = (date, close) => ({ date, open: close, high: close, low: close, close, volume: 1 })
const byKey = (rows) => Object.fromEntries(rows.map((row) => [row.key, row.pct]))

describe('trailingReturns', () => {
  const bars = [
    bar('2025-10-10', 80),
    bar('2025-12-31', 100),
    bar('2026-04-09', 50),
    bar('2026-07-09', 160),
    bar('2026-09-09', 125),
    bar('2026-10-02', 190),
    bar('2026-10-09', 200),
  ]

  it('measures each window from the close on or before its start date', () => {
    const result = byKey(trailingReturns(bars))
    expect(result['1W']).toBeCloseTo(5.263, 2)
    expect(result['1M']).toBeCloseTo(60, 5)
    expect(result['3M']).toBeCloseTo(25, 5)
    expect(result['6M']).toBeCloseTo(300, 5)
    expect(result.YTD).toBeCloseTo(100, 5)
    expect(result['1Y']).toBeNull()
  })

  it('keeps the window order', () => {
    expect(trailingReturns(bars).map((row) => row.key)).toEqual(['1W', '1M', '3M', '6M', 'YTD', '1Y'])
  })

  it('answers null for every window without bars', () => {
    expect(trailingReturns([]).every((row) => row.pct === null)).toBe(true)
  })

  it('clamps a month shift to the last day of a shorter month', () => {
    const result = byKey(trailingReturns([bar('2026-02-27', 100), bar('2026-03-02', 400), bar('2026-03-31', 200)]))
    expect(result['1M']).toBeCloseTo(100, 5)
  })
})
```

`1Y` is null because the 1Y start date (2025-10-09) is before the first bar. In the last test, 31 March minus one month must be 28 February (close 100), not 3 March (close 400).

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/lib/performance.test.js`
Expected: FAIL, `trailingReturns is not a function` (or not exported).

- [ ] **Step 3: Implement**

Append to `frontend/src/lib/performance.js`:

```js
export const RETURN_WINDOWS = [
  { key: '1W', days: 7 },
  { key: '1M', months: 1 },
  { key: '3M', months: 3 },
  { key: '6M', months: 6 },
  { key: 'YTD', yearStart: true },
  { key: '1Y', months: 12 },
]

const toIso = (date) => date.toISOString().slice(0, 10)

function startDate(latestIso, { days, months, yearStart }) {
  const [year, month, day] = latestIso.split('-').map(Number)
  if (yearStart) return `${year - 1}-12-31`
  if (days) return toIso(new Date(Date.UTC(year, month - 1, day - days)))
  const target = new Date(Date.UTC(year, month - 1 - months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(day, lastDay))
  return toIso(target)
}

function closeOnOrBefore(bars, iso) {
  for (let i = bars.length - 1; i >= 0; i -= 1) {
    if (bars[i].date <= iso) return bars[i].close
  }
  return null
}

export function trailingReturns(bars) {
  const latest = bars[bars.length - 1]
  return RETURN_WINDOWS.map(({ key, ...shift }) => {
    if (!latest) return { key, pct: null }
    const start = closeOnOrBefore(bars, startDate(latest.date, shift))
    return { key, pct: start ? (latest.close / start - 1) * 100 : null }
  })
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `npx vitest run src/lib/performance.test.js`
Expected: PASS, including the pre-existing tests in that file.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/performance.js frontend/src/lib/performance.test.js
git commit -m "feat(research): trailing returns over fixed windows"
```

---

### Task 2: Seasonal series

**Files:**
- Create: `frontend/src/lib/seasonals.js`
- Test: `frontend/src/lib/seasonals.test.js`

**Interfaces:**
- Produces: `seasonalSeries(bars): Array<{ year: number, points: Array<{ day: number, pct: number }> }>`, oldest year first. `day` is the day of the year (1 to 366), `pct` the percent change from that year's first close.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/seasonals.test.js`:

```js
import { describe, expect, it } from 'vitest'

import { seasonalSeries } from './seasonals'

const bar = (date, close) => ({ date, close })

describe('seasonalSeries', () => {
  it('draws each full year from its own first close', () => {
    const series = seasonalSeries([
      bar('2025-01-02', 100),
      bar('2025-06-30', 150),
      bar('2026-01-02', 200),
      bar('2026-02-01', 180),
    ])

    expect(series.map((row) => row.year)).toEqual([2025, 2026])
    expect(series[0].points).toEqual([
      { day: 2, pct: 0 },
      { day: 181, pct: 50 },
    ])
    expect(series[1].points[1].day).toBe(32)
    expect(series[1].points[1].pct).toBeCloseTo(-10, 5)
  })

  it('drops a year whose history starts after January', () => {
    const series = seasonalSeries([bar('2024-03-15', 50), bar('2024-12-30', 60), bar('2025-01-02', 100)])
    expect(series.map((row) => row.year)).toEqual([2025])
  })

  it('drops a year whose first close is zero', () => {
    const series = seasonalSeries([bar('2025-01-02', 0), bar('2025-02-02', 10), bar('2026-01-05', 20)])
    expect(series.map((row) => row.year)).toEqual([2026])
  })

  it('answers an empty list without bars', () => {
    expect(seasonalSeries([])).toEqual([])
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/lib/seasonals.test.js`
Expected: FAIL, cannot resolve `./seasonals`.

- [ ] **Step 3: Implement**

Create `frontend/src/lib/seasonals.js`:

```js
const DAY_MS = 86_400_000

function dayOfYear(iso) {
  const [year, month, day] = iso.split('-').map(Number)
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 0)) / DAY_MS)
}

const startsInJanuary = (rows) => rows[0].date.slice(5, 7) === '01'

export function seasonalSeries(bars) {
  const byYear = new Map()
  for (const bar of bars) {
    const year = Number(bar.date.slice(0, 4))
    if (!byYear.has(year)) byYear.set(year, [])
    byYear.get(year).push(bar)
  }

  return [...byYear.entries()]
    .filter(([, rows]) => startsInJanuary(rows) && rows[0].close > 0)
    .map(([year, rows]) => ({
      year,
      points: rows.map((bar) => ({ day: dayOfYear(bar.date), pct: (bar.close / rows[0].close - 1) * 100 })),
    }))
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `npx vitest run src/lib/seasonals.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/seasonals.js frontend/src/lib/seasonals.test.js
git commit -m "feat(research): seasonal return series per calendar year"
```

---

### Task 3: Technical rating

**Files:**
- Create: `frontend/src/lib/technicalRating.js`
- Test: `frontend/src/lib/technicalRating.test.js`

**Interfaces:**
- Consumes: `sma(values, period)`, `ema(values, period)`, `rsi(values, period = 14)`, `macd(values)` → `{ line, signal, hist }` from `frontend/src/lib/indicators.js`. Each series is as long as its input, with `null` where the indicator has no value yet.
- Produces: `technicalRating(bars): null | { votes: Array<{ key: string, label: string, vote: 'buy'|'neutral'|'sell' }>, buy: number, neutral: number, sell: number, score: number, fraction: number, label: 'Strong sell'|'Sell'|'Neutral'|'Buy'|'Strong buy' }`. `score` is `(buy - sell) / votes.length` in [-1, 1]; `fraction` is `(score + 1) / 2` in [0, 1]. `ratingLabel(score)` is exported too.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/technicalRating.test.js`:

```js
import { describe, expect, it } from 'vitest'

import { ratingLabel, technicalRating } from './technicalRating'

const series = (length, closeAt) =>
  Array.from({ length }, (_, i) => ({ date: `d${i}`, open: closeAt(i), high: closeAt(i), low: closeAt(i), close: closeAt(i), volume: 1 }))

describe('technicalRating', () => {
  it('reads a steady climb as price above every average', () => {
    const rating = technicalRating(series(260, (i) => 100 + i))
    const votes = Object.fromEntries(rating.votes.map((vote) => [vote.key, vote.vote]))

    expect(votes.sma20).toBe('buy')
    expect(votes.sma50).toBe('buy')
    expect(votes.sma200).toBe('buy')
    expect(votes.ema9).toBe('buy')
    expect(votes.rsi).toBe('sell')
    expect(rating.buy + rating.neutral + rating.sell).toBe(rating.votes.length)
  })

  it('reads a steady decline as price below every average and RSI oversold', () => {
    const rating = technicalRating(series(260, (i) => 400 - i))
    const votes = Object.fromEntries(rating.votes.map((vote) => [vote.key, vote.vote]))

    expect(votes.sma200).toBe('sell')
    expect(votes.rsi).toBe('buy')
    expect(rating.score).toBeLessThan(0)
  })

  it('skips an indicator that has no value yet instead of counting it', () => {
    const rating = technicalRating(series(60, (i) => 100 + i))
    expect(rating.votes.map((vote) => vote.key)).not.toContain('sma200')
    expect(rating.votes.map((vote) => vote.key)).toContain('sma50')
  })

  it('answers null when nothing can vote', () => {
    expect(technicalRating([])).toBeNull()
    expect(technicalRating(series(3, () => 10))).toBeNull()
  })

  it('maps the score onto a 0 to 1 fraction', () => {
    const rating = technicalRating(series(260, (i) => 100 + i))
    expect(rating.fraction).toBeCloseTo((rating.score + 1) / 2, 10)
  })
})

describe('ratingLabel', () => {
  it('names the five bands', () => {
    expect(ratingLabel(0.8)).toBe('Strong buy')
    expect(ratingLabel(0.3)).toBe('Buy')
    expect(ratingLabel(0)).toBe('Neutral')
    expect(ratingLabel(-0.3)).toBe('Sell')
    expect(ratingLabel(-0.8)).toBe('Strong sell')
  })

  it('keeps the band edges neutral-side', () => {
    expect(ratingLabel(0.1)).toBe('Neutral')
    expect(ratingLabel(0.5)).toBe('Buy')
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/lib/technicalRating.test.js`
Expected: FAIL, cannot resolve `./technicalRating`.

- [ ] **Step 3: Implement**

Create `frontend/src/lib/technicalRating.js`:

```js
import { ema, macd, rsi, sma } from './indicators'

const RSI_OVERSOLD = 30
const RSI_OVERBOUGHT = 70
const STRONG = 0.5
const MILD = 0.1

const last = (series) => series[series.length - 1]

function against(value, reference) {
  if (value > reference) return 'buy'
  if (value < reference) return 'sell'
  return 'neutral'
}

function rsiVote(value) {
  if (value < RSI_OVERSOLD) return 'buy'
  if (value > RSI_OVERBOUGHT) return 'sell'
  return 'neutral'
}

export function ratingLabel(score) {
  if (score > STRONG) return 'Strong buy'
  if (score > MILD) return 'Buy'
  if (score < -STRONG) return 'Strong sell'
  if (score < -MILD) return 'Sell'
  return 'Neutral'
}

export function technicalRating(bars) {
  if (!bars.length) return null
  const closes = bars.map((bar) => bar.close)
  const price = last(closes)
  const macdSeries = macd(closes)
  const macdLine = last(macdSeries.line)
  const macdSignal = last(macdSeries.signal)
  const rsiValue = last(rsi(closes))

  const candidates = [
    ['rsi', 'RSI (14)', rsiValue == null ? null : rsiVote(rsiValue)],
    ['macd', 'MACD (12, 26)', macdLine == null || macdSignal == null ? null : against(macdLine, macdSignal)],
    ...[
      ['ema9', 'EMA 9', last(ema(closes, 9))],
      ['sma20', 'SMA 20', last(sma(closes, 20))],
      ['sma50', 'SMA 50', last(sma(closes, 50))],
      ['sma200', 'SMA 200', last(sma(closes, 200))],
    ].map(([key, label, average]) => [key, label, average == null ? null : against(price, average)]),
  ]

  const votes = candidates.filter(([, , vote]) => vote != null).map(([key, label, vote]) => ({ key, label, vote }))
  if (!votes.length) return null

  const count = (kind) => votes.filter((vote) => vote.vote === kind).length
  const buy = count('buy')
  const sell = count('sell')
  const score = (buy - sell) / votes.length

  return { votes, buy, neutral: count('neutral'), sell, score, fraction: (score + 1) / 2, label: ratingLabel(score) }
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `npx vitest run src/lib/technicalRating.test.js`
Expected: PASS, 7 tests. If the "nothing can vote" case fails because `ema(closes, 9)` has no value for 3 bars but `rsi`/`macd` unexpectedly do, print `technicalRating(series(3, () => 10))` and fix the implementation, not the test: three bars must yield `null`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/technicalRating.js frontend/src/lib/technicalRating.test.js
git commit -m "feat(research): daily technical rating from existing indicators"
```

---

### Task 4: Analyst rating

**Files:**
- Create: `frontend/src/lib/analystRating.js`
- Test: `frontend/src/lib/analystRating.test.js`

**Interfaces:**
- Consumes: the `recommendation` object on the fundamentals payload: `{ period: 'YYYY-MM-DD', strong_buy, buy, hold, sell, strong_sell }` (any count may be missing), or `null`.
- Produces: `analystRating(recommendation): null | { total: number, mean: number, fraction: number, label: string, period: string, counts: Array<{ key: string, label: string, count: number }> }`. `counts` runs strong sell → strong buy. `mean` is 1 (strong sell) to 5 (strong buy); `fraction` is `(mean - 1) / 4`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/analystRating.test.js`:

```js
import { describe, expect, it } from 'vitest'

import { analystRating } from './analystRating'

describe('analystRating', () => {
  it('weights the five counts into a mean and a label', () => {
    const rating = analystRating({ period: '2026-09-01', strong_buy: 16, buy: 34, hold: 3, sell: 2, strong_sell: 0 })

    expect(rating.total).toBe(55)
    expect(rating.mean).toBeCloseTo(4.1636, 3)
    expect(rating.fraction).toBeCloseTo(0.7909, 3)
    expect(rating.label).toBe('Buy')
    expect(rating.period).toBe('2026-09-01')
    expect(rating.counts.map((row) => [row.label, row.count])).toEqual([
      ['Strong sell', 0],
      ['Sell', 2],
      ['Hold', 3],
      ['Buy', 34],
      ['Strong buy', 16],
    ])
  })

  it('reads a missing count as none', () => {
    const rating = analystRating({ period: '2026-09-01', hold: 4 })
    expect(rating.total).toBe(4)
    expect(rating.label).toBe('Hold')
    expect(rating.fraction).toBe(0.5)
  })

  it('answers null without a recommendation or without analysts', () => {
    expect(analystRating(null)).toBeNull()
    expect(analystRating(undefined)).toBeNull()
    expect(analystRating({ period: '2026-09-01', strong_buy: 0, buy: 0, hold: 0, sell: 0, strong_sell: 0 })).toBeNull()
  })

  it('labels the extremes', () => {
    expect(analystRating({ strong_buy: 9, buy: 1 }).label).toBe('Strong buy')
    expect(analystRating({ strong_sell: 9, sell: 1 }).label).toBe('Strong sell')
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/lib/analystRating.test.js`
Expected: FAIL, cannot resolve `./analystRating`.

- [ ] **Step 3: Implement**

Create `frontend/src/lib/analystRating.js`:

```js
const GRADES = [
  ['strong_sell', 'Strong sell'],
  ['sell', 'Sell'],
  ['hold', 'Hold'],
  ['buy', 'Buy'],
  ['strong_buy', 'Strong buy'],
]

export function analystRating(recommendation) {
  if (!recommendation) return null
  const counts = GRADES.map(([key, label]) => ({ key, label, count: Number(recommendation[key]) || 0 }))
  const total = counts.reduce((sum, row) => sum + row.count, 0)
  if (total === 0) return null

  const mean = counts.reduce((sum, row, index) => sum + row.count * (index + 1), 0) / total
  return {
    total,
    mean,
    fraction: (mean - 1) / 4,
    label: GRADES[Math.round(mean) - 1][1],
    period: recommendation.period ?? '',
    counts,
  }
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `npx vitest run src/lib/analystRating.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/analystRating.js frontend/src/lib/analystRating.test.js
git commit -m "feat(research): analyst rating mean and label from recommendation counts"
```

---

### Task 5: RatingGauge component

**Files:**
- Create: `frontend/src/components/research/RatingGauge.jsx`
- Test: `frontend/src/components/research/RatingGauge.test.jsx`

**Interfaces:**
- Consumes: `ESTIMATE`, `NEGATIVE`, `POSITIVE`, `withAlpha(hex, alpha)` from `frontend/src/lib/charts.js`.
- Produces: default export `RatingGauge({ title: string, fraction: number, label: string })`. `fraction` 0 points fully left (strong sell), 1 fully right (strong buy); out-of-range values are clamped. Renders an `<svg role="img" aria-label="{title}: {label}">` and the label as text.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/research/RatingGauge.test.jsx`:

```jsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import RatingGauge from './RatingGauge'

const needleX = (container) => Number(container.querySelector('line').getAttribute('x2'))

describe('RatingGauge', () => {
  it('names itself and prints its label', () => {
    render(<RatingGauge title="Analyst rating" fraction={0.79} label="Buy" />)

    expect(screen.getByRole('img', { name: 'Analyst rating: Buy' })).toBeInTheDocument()
    expect(screen.getByText('Buy')).toBeInTheDocument()
  })

  it('points right for a high fraction and left for a low one', () => {
    const high = render(<RatingGauge title="t" fraction={0.9} label="Strong buy" />)
    const low = render(<RatingGauge title="t" fraction={0.1} label="Strong sell" />)

    expect(needleX(high.container)).toBeGreaterThan(100)
    expect(needleX(low.container)).toBeLessThan(100)
  })

  it('clamps a fraction outside 0 to 1', () => {
    const over = render(<RatingGauge title="t" fraction={1.4} label="x" />)
    const full = render(<RatingGauge title="t" fraction={1} label="x" />)

    expect(needleX(over.container)).toBe(needleX(full.container))
  })

  it('draws five segments', () => {
    const { container } = render(<RatingGauge title="t" fraction={0.5} label="Hold" />)
    expect(container.querySelectorAll('path')).toHaveLength(5)
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/components/research/RatingGauge.test.jsx`
Expected: FAIL, cannot resolve `./RatingGauge`.

- [ ] **Step 3: Implement**

Create `frontend/src/components/research/RatingGauge.jsx`:

```jsx
import { ESTIMATE, NEGATIVE, POSITIVE, withAlpha } from '../../lib/charts'

const SEGMENTS = [
  withAlpha(NEGATIVE, 0.75),
  withAlpha(NEGATIVE, 0.35),
  ESTIMATE,
  withAlpha(POSITIVE, 0.4),
  withAlpha(POSITIVE, 0.85),
]
const CENTER_X = 100
const CENTER_Y = 96
const RADIUS = 80
const NEEDLE = 62
const SWEEP = 180 / SEGMENTS.length
const GAP = 1.5

function pointAt(degrees, radius) {
  const radians = (degrees * Math.PI) / 180
  return [CENTER_X + radius * Math.cos(radians), CENTER_Y - radius * Math.sin(radians)].map((n) => n.toFixed(1))
}

const clamp = (value) => Math.min(1, Math.max(0, Number(value) || 0))

function toneClass(fraction) {
  if (fraction >= 0.6) return 'text-emerald-400'
  if (fraction <= 0.4) return 'text-red-400'
  return 'text-zinc-300'
}

export default function RatingGauge({ title, fraction, label }) {
  const position = clamp(fraction)
  const [needleX, needleY] = pointAt(180 - position * 180, NEEDLE)

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 104" className="w-full max-w-[210px]" role="img" aria-label={`${title}: ${label}`}>
        {SEGMENTS.map((color, index) => {
          const from = pointAt(180 - index * SWEEP - GAP, RADIUS)
          const to = pointAt(180 - (index + 1) * SWEEP + GAP, RADIUS)
          return (
            <path
              key={index}
              d={`M${from.join(' ')} A${RADIUS} ${RADIUS} 0 0 1 ${to.join(' ')}`}
              fill="none"
              stroke={color}
              strokeWidth="11"
            />
          )
        })}
        <line
          x1={CENTER_X}
          y1={CENTER_Y}
          x2={needleX}
          y2={needleY}
          className="stroke-zinc-100"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx={CENTER_X} cy={CENTER_Y} r="5" className="fill-zinc-100" />
      </svg>
      <div className={`text-[var(--fig-md)] font-medium ${toneClass(position)}`}>{label}</div>
    </div>
  )
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `npx vitest run src/components/research/RatingGauge.test.jsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/research/RatingGauge.jsx frontend/src/components/research/RatingGauge.test.jsx
git commit -m "feat(research): half-circle rating gauge"
```

---

### Task 6: PerformanceTiles component

**Files:**
- Create: `frontend/src/components/research/PerformanceTiles.jsx`
- Test: `frontend/src/components/research/PerformanceTiles.test.jsx`

**Interfaces:**
- Consumes: `Array<{ key: string, pct: number | null }>` as produced by `trailingReturns` (Task 1); `fmtPct(value)` from `frontend/src/lib/format.js` (prints the sign, renders `null` as `—`); `performanceFill(pct, { cap })` from `frontend/src/lib/charts.js` (returns a CSS colour, or `null` for a null pct).
- Produces: default export `PerformanceTiles({ returns })`. Renders nothing when every `pct` is null.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/research/PerformanceTiles.test.jsx`:

```jsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import PerformanceTiles from './PerformanceTiles'

const returns = [
  { key: '1W', pct: 4.2 },
  { key: '1M', pct: 7.97 },
  { key: '3M', pct: 35.83 },
  { key: '6M', pct: 56.22 },
  { key: 'YTD', pct: -7.95 },
  { key: '1Y', pct: null },
]

describe('PerformanceTiles', () => {
  it('prints each window with its sign', () => {
    render(<PerformanceTiles returns={returns} />)

    expect(screen.getByText('+4.20%')).toBeInTheDocument()
    expect(screen.getByText('-7.95%')).toBeInTheDocument()
    expect(screen.getByText('YTD')).toBeInTheDocument()
  })

  it('shows a dash for a window the history does not reach', () => {
    render(<PerformanceTiles returns={returns} />)

    const tile = screen.getByText('1Y').closest('li')
    expect(tile).toHaveTextContent('—')
  })

  it('renders nothing when no window has a figure', () => {
    const { container } = render(<PerformanceTiles returns={returns.map((row) => ({ ...row, pct: null }))} />)
    expect(container.firstChild).toBeNull()
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/components/research/PerformanceTiles.test.jsx`
Expected: FAIL, cannot resolve `./PerformanceTiles`.

- [ ] **Step 3: Implement**

Create `frontend/src/components/research/PerformanceTiles.jsx`:

```jsx
import { performanceFill } from '../../lib/charts'
import { fmtPct, pctToneClass } from '../../lib/format'

const TINT_CAP = 40

export default function PerformanceTiles({ returns }) {
  if (!returns.some((row) => row.pct != null)) return null

  return (
    <ul className="grid grid-cols-3 gap-1">
      {returns.map(({ key, pct }) => (
        <li
          key={key}
          className="rounded px-1 py-1.5 text-center"
          style={{ backgroundColor: performanceFill(pct, { cap: TINT_CAP }) ?? undefined }}
        >
          <div className={`num font-mono text-[var(--fig-sm)] ${pctToneClass(pct)}`}>{fmtPct(pct)}</div>
          <div className="text-[var(--fig-2xs)] text-zinc-400">{key}</div>
        </li>
      ))}
    </ul>
  )
}
```

`pctToneClass(value, decimals = 2, neutral = 'text-zinc-500')` already exists in `lib/format.js` and returns the emerald/red/neutral text class.

- [ ] **Step 4: Run and confirm pass**

Run: `npx vitest run src/components/research/PerformanceTiles.test.jsx`
Expected: PASS, 3 tests. If `-7.95%` is not found because `fmtPct` prints a true minus sign (`−`), read `fmtPct` in `lib/format.js` and match the test to what it prints.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/research/PerformanceTiles.jsx frontend/src/components/research/PerformanceTiles.test.jsx
git commit -m "feat(research): performance tiles for trailing returns"
```

---

### Task 7: EarningsDots component

**Files:**
- Create: `frontend/src/components/research/EarningsDots.jsx`
- Test: `frontend/src/components/research/EarningsDots.test.jsx`

**Interfaces:**
- Consumes: `history: Array<{ date: 'YYYY-MM-DD', eps_actual: number|null, eps_estimate: number|null, eps_surprise_pct: number|null }>` oldest first, and `next: null | { date, eps_estimate: number|null }` (the symbol earnings payload). `surpriseColor(value)` and `AXIS_TEXT`, `CATEGORY_AXIS_TEXT` from `frontend/src/lib/charts.js`.
- Produces: default export `EarningsDots({ history, next })`. Shows the last four reported quarters plus the next one. Renders nothing with no column to draw.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/research/EarningsDots.test.jsx`:

```jsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import EarningsDots from './EarningsDots'

const quarter = (date, actual, estimate) => ({
  date,
  eps_actual: actual,
  eps_estimate: estimate,
  eps_surprise_pct: estimate ? ((actual - estimate) / Math.abs(estimate)) * 100 : null,
})

const history = [
  quarter('2025-06-30', 0.7, 0.72),
  quarter('2025-09-30', 0.83, 0.79),
  quarter('2025-12-31', 0.88, 0.85),
  quarter('2026-03-31', 0.91, 0.96),
  quarter('2026-06-30', 0.99, 0.96),
]

const cy = (node) => Number(node.getAttribute('cy'))

describe('EarningsDots', () => {
  it('draws the last four reported quarters and the next one', () => {
    const { container } = render(<EarningsDots history={history} next={{ date: '2026-10-28', eps_estimate: 1.02 }} />)

    expect(container.querySelectorAll('[data-dot="actual"]')).toHaveLength(4)
    expect(container.querySelectorAll('[data-dot="estimate"]')).toHaveLength(5)
    expect(screen.getByText("Q3 '25")).toBeInTheDocument()
    expect(screen.queryByText("Q2 '25")).not.toBeInTheDocument()
    expect(screen.getByText('Next')).toBeInTheDocument()
  })

  it('places a higher figure higher up', () => {
    const { container } = render(<EarningsDots history={history} next={null} />)
    const actuals = [...container.querySelectorAll('[data-dot="actual"]')]

    expect(cy(actuals[3])).toBeLessThan(cy(actuals[0]))
  })

  it('keeps every dot inside the plot when all figures are equal or negative', () => {
    const flat = [quarter('2026-03-31', -0.5, -0.5), quarter('2026-06-30', -0.5, -0.5)]
    const { container } = render(<EarningsDots history={flat} next={null} />)

    for (const dot of container.querySelectorAll('circle')) {
      expect(Number.isFinite(cy(dot))).toBe(true)
      expect(cy(dot)).toBeGreaterThanOrEqual(0)
      expect(cy(dot)).toBeLessThanOrEqual(72)
    }
  })

  it('renders nothing without a reported quarter or an upcoming estimate', () => {
    const { container } = render(<EarningsDots history={[]} next={{ date: '2026-10-28', eps_estimate: null }} />)
    expect(container.firstChild).toBeNull()
  })

  it('says what it shows to a screen reader', () => {
    render(<EarningsDots history={history} next={null} />)
    expect(screen.getByRole('img', { name: /EPS, actual against estimate/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/components/research/EarningsDots.test.jsx`
Expected: FAIL, cannot resolve `./EarningsDots`.

- [ ] **Step 3: Implement**

Create `frontend/src/components/research/EarningsDots.jsx`:

```jsx
import { AXIS_TEXT, CATEGORY_AXIS_TEXT, surpriseColor } from '../../lib/charts'

const WIDTH = 300
const PLOT_TOP = 10
const PLOT_HEIGHT = 52
const LABEL_Y = 88
const RADIUS = 6
const QUARTERS_SHOWN = 4

function quarterLabel(iso) {
  const [year, month] = iso.split('-').map(Number)
  return `Q${Math.ceil(month / 3)} '${String(year).slice(2)}`
}

function columnsFor(history, next) {
  const reported = history
    .filter((row) => row.eps_actual != null)
    .slice(-QUARTERS_SHOWN)
    .map((row) => ({
      label: quarterLabel(row.date),
      actual: row.eps_actual,
      estimate: row.eps_estimate,
      surprise: row.eps_surprise_pct,
    }))
  const upcoming =
    next?.eps_estimate == null ? [] : [{ label: 'Next', actual: null, estimate: next.eps_estimate, surprise: null }]
  return [...reported, ...upcoming]
}

export default function EarningsDots({ history, next }) {
  const columns = columnsFor(history ?? [], next)
  if (!columns.length) return null

  const figures = columns.flatMap((column) => [column.actual, column.estimate]).filter((value) => value != null)
  const high = Math.max(...figures)
  const span = high - Math.min(...figures)
  const yFor = (value) => (span === 0 ? PLOT_TOP + PLOT_HEIGHT / 2 : PLOT_TOP + ((high - value) / span) * PLOT_HEIGHT)
  const step = WIDTH / columns.length

  return (
    <svg viewBox={`0 0 ${WIDTH} 92`} className="w-full" role="img" aria-label="EPS, actual against estimate, by quarter">
      {columns.map((column, index) => {
        const x = step * (index + 0.5)
        return (
          <g key={column.label}>
            {column.estimate != null && (
              <circle
                data-dot="estimate"
                cx={x}
                cy={yFor(column.estimate)}
                r={RADIUS}
                fill="none"
                stroke={CATEGORY_AXIS_TEXT}
                strokeWidth="1.5"
              >
                <title>{`${column.label} estimate ${column.estimate.toFixed(2)}`}</title>
              </circle>
            )}
            {column.actual != null && (
              <circle data-dot="actual" cx={x} cy={yFor(column.actual)} r={RADIUS} fill={surpriseColor(column.surprise)}>
                <title>{`${column.label} actual ${column.actual.toFixed(2)}`}</title>
              </circle>
            )}
            <text x={x} y={LABEL_Y} textAnchor="middle" fill={AXIS_TEXT} fontSize="10">
              {column.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `npx vitest run src/components/research/EarningsDots.test.jsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/research/EarningsDots.jsx frontend/src/components/research/EarningsDots.test.jsx
git commit -m "feat(research): earnings dots, actual against estimate"
```

---

### Task 8: SeasonalsChart component

**Files:**
- Create: `frontend/src/components/research/SeasonalsChart.jsx`
- Test: `frontend/src/components/research/SeasonalsChart.test.jsx`

**Interfaces:**
- Consumes: `series` as produced by `seasonalSeries` (Task 2): `Array<{ year, points: Array<{ day, pct }> }>`, oldest first. `AXIS_TEXT`, `SERIES_TOTAL`, `withAlpha` from `frontend/src/lib/charts.js`; `fmtPct` from `frontend/src/lib/format.js`.
- Produces: default export `SeasonalsChart({ series })`. The last entry is the current year, drawn in `SERIES_TOTAL` and thicker. Renders nothing for an empty series.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/research/SeasonalsChart.test.jsx`:

```jsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import SeasonalsChart from './SeasonalsChart'

const series = [
  { year: 2024, points: [{ day: 2, pct: 0 }, { day: 180, pct: 20 }, { day: 364, pct: 54 }] },
  { year: 2025, points: [{ day: 2, pct: 0 }, { day: 180, pct: -10 }, { day: 364, pct: -27 }] },
  { year: 2026, points: [{ day: 2, pct: 0 }, { day: 180, pct: -12 }, { day: 282, pct: -4.84 }] },
]

describe('SeasonalsChart', () => {
  it('draws one line per year and lists the years with their return', () => {
    const { container } = render(<SeasonalsChart series={series} />)

    expect(container.querySelectorAll('polyline')).toHaveLength(3)
    expect(screen.getByText('2024')).toBeInTheDocument()
    expect(screen.getByText('+54.00%')).toBeInTheDocument()
    expect(screen.getByText('-4.84%')).toBeInTheDocument()
  })

  it('draws the latest year thicker than the others', () => {
    const { container } = render(<SeasonalsChart series={series} />)
    const widths = [...container.querySelectorAll('polyline')].map((line) => Number(line.getAttribute('stroke-width')))

    expect(widths[2]).toBeGreaterThan(widths[0])
  })

  it('keeps a single flat year drawable', () => {
    const { container } = render(<SeasonalsChart series={[{ year: 2026, points: [{ day: 2, pct: 0 }, { day: 9, pct: 0 }] }]} />)
    const points = container.querySelector('polyline').getAttribute('points')

    expect(points).not.toMatch(/NaN|Infinity/)
  })

  it('renders nothing without a full year', () => {
    const { container } = render(<SeasonalsChart series={[]} />)
    expect(container.firstChild).toBeNull()
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/components/research/SeasonalsChart.test.jsx`
Expected: FAIL, cannot resolve `./SeasonalsChart`.

- [ ] **Step 3: Implement**

Create `frontend/src/components/research/SeasonalsChart.jsx`:

```jsx
import { AXIS_TEXT, SERIES_TOTAL, withAlpha } from '../../lib/charts'
import { fmtPct, pctToneClass } from '../../lib/format'

const WIDTH = 300
const HEIGHT = 110
const TOP = 6
const PLOT = 86
const DAYS = 366
const MONTH_TICKS = [
  ['Jan', 1],
  ['Apr', 91],
  ['Jul', 182],
  ['Oct', 274],
]

const xFor = (day) => (day / DAYS) * WIDTH

export default function SeasonalsChart({ series }) {
  if (!series.length) return null

  const values = series.flatMap((row) => row.points.map((point) => point.pct))
  const high = Math.max(0, ...values)
  const low = Math.min(0, ...values)
  const span = high - low || 1
  const yFor = (pct) => TOP + ((high - pct) / span) * PLOT
  const latestIndex = series.length - 1

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label="Return by calendar year, from January">
        <line x1="0" x2={WIDTH} y1={yFor(0)} y2={yFor(0)} stroke={withAlpha(AXIS_TEXT, 0.4)} />
        {series.map((row, index) => (
          <polyline
            key={row.year}
            points={row.points.map((point) => `${xFor(point.day).toFixed(1)},${yFor(point.pct).toFixed(1)}`).join(' ')}
            fill="none"
            stroke={index === latestIndex ? SERIES_TOTAL : withAlpha(AXIS_TEXT, 0.35 + (0.5 * index) / series.length)}
            strokeWidth={index === latestIndex ? 2 : 1}
          />
        ))}
        {MONTH_TICKS.map(([label, day]) => (
          <text key={label} x={xFor(day)} y={HEIGHT - 2} fill={AXIS_TEXT} fontSize="10">
            {label}
          </text>
        ))}
      </svg>
      <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[var(--fig-2xs)]">
        {series.map((row) => {
          const closing = row.points[row.points.length - 1].pct
          return (
            <li key={row.year} className="flex justify-between">
              <span className="text-zinc-400">{row.year}</span>
              <span className={`num font-mono ${pctToneClass(closing)}`}>{fmtPct(closing)}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `npx vitest run src/components/research/SeasonalsChart.test.jsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/research/SeasonalsChart.jsx frontend/src/components/research/SeasonalsChart.test.jsx
git commit -m "feat(research): seasonals chart, one line per year"
```

---

### Task 9: SymbolPanel

**Files:**
- Modify: `frontend/src/lib/format.js` (add `fmtShares`)
- Modify: `frontend/src/lib/format.test.js` (append)
- Modify: `frontend/src/lib/earnings.js` (add `SESSION_LABEL`)
- Modify: `frontend/src/components/research/EarningsTab.jsx` (import `SESSION_LABEL`, delete the local constant on line 9)
- Create: `frontend/src/components/research/SymbolPanel.jsx`
- Test: `frontend/src/components/research/SymbolPanel.test.jsx`

**Interfaces:**
- Consumes:
  - `trailingReturns(bars)` (Task 1), `seasonalSeries(bars)` (Task 2), `technicalRating(bars)` (Task 3), `analystRating(recommendation)` (Task 4).
  - `RatingGauge({ title, fraction, label })`, `PerformanceTiles({ returns })`, `EarningsDots({ history, next })`, `SeasonalsChart({ series })` (Tasks 5 to 8).
  - `useFundamentals(symbol)` from `frontend/src/api/queries` → `{ data, isLoading }`, where `data` is `{ available: false, reason }` or `{ available: true, market_cap (millions), recommendation, ... }`. It is disabled for an empty symbol.
  - `isEtf(instrument)` from `frontend/src/lib/research.js`; `daysUntil(iso)` from `frontend/src/lib/earnings.js` (returns `'in 16 days'`, `'tomorrow'`, `'today'`, `'past'`); `fmtCompact(millions)` from `frontend/src/lib/format.js`.
- Produces: default export `SymbolPanel({ symbol, instrument, bars, earnings, href })`. `bars` is every fetched daily bar, oldest first. `earnings` is the `useSymbolEarnings` query result (`{ data: { available, history, next, score } }`). `href` is the Research page link for this instrument. Also `fmtShares(count)` and `SESSION_LABEL`.

- [ ] **Step 1: Write the failing helper tests**

Append to `frontend/src/lib/format.test.js` (add `fmtShares` to its import from `./format`):

```js
describe('fmtShares', () => {
  it('scales a share count to K, M and B', () => {
    expect(fmtShares(9_580_000)).toBe('9.58M')
    expect(fmtShares(1_030_000_000)).toBe('1.03B')
    expect(fmtShares(45_200)).toBe('45.2K')
    expect(fmtShares(812)).toBe('812')
  })

  it('shows a dash for a missing or zero count', () => {
    expect(fmtShares(null)).toBe('—')
    expect(fmtShares(0)).toBe('—')
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/lib/format.test.js`
Expected: FAIL, `fmtShares is not a function`.

- [ ] **Step 3: Implement the helpers**

Append to `frontend/src/lib/format.js`:

```js
export function fmtShares(count) {
  const n = Number(count)
  if (!n) return UNKNOWN
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return String(Math.round(n))
}
```

In `frontend/src/lib/earnings.js`, directly after the `SESSIONS` array, add:

```js
export const SESSION_LABEL = Object.fromEntries(SESSIONS)
```

In `frontend/src/components/research/EarningsTab.jsx`, change the first import to `import { SESSION_LABEL, daysUntil } from '../../lib/earnings'` and delete the line `const SESSION_LABEL = { bmo: 'Before open', amc: 'After close', dmh: 'During hours' }`.

Run: `npx vitest run src/lib/format.test.js src/components/research/EarningsTab.test.jsx`
Expected: PASS.

- [ ] **Step 4: Write the failing panel tests**

Create `frontend/src/components/research/SymbolPanel.test.jsx`:

```jsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'

import { renderWithProviders } from '../../test/renderWithProviders'
import SymbolPanel from './SymbolPanel'

vi.mock('../../api/queries')
import * as queries from '../../api/queries'

const iso = (date) => date.toISOString().slice(0, 10)

function dailyBars(count, { volume = 2_000_000 } = {}) {
  const end = Date.UTC(2026, 9, 9)
  return Array.from({ length: count }, (_, i) => {
    const close = 100 + i * 0.1
    return { date: iso(new Date(end - (count - 1 - i) * 86_400_000)), open: close, high: close, low: close, close, volume }
  })
}

const fundamentals = {
  available: true,
  market_cap: 145_090,
  recommendation: { period: '2026-09-01', strong_buy: 16, buy: 34, hold: 3, sell: 2, strong_sell: 0 },
}

const earnings = {
  data: {
    available: true,
    history: [{ date: '2026-06-30', eps_actual: 0.99, eps_estimate: 0.96, eps_surprise_pct: 3.1 }],
    next: { date: '2099-01-01', session: 'amc', eps_estimate: 1.02 },
    score: null,
  },
}

const stock = { uic: 1, assetType: 'Stock' }
const panel = (props) => (
  <SymbolPanel symbol="NOW" instrument={stock} bars={dailyBars(700)} earnings={earnings} href="/research?symbol=NOW" {...props} />
)

beforeEach(() => {
  vi.resetAllMocks()
  queries.useFundamentals.mockReturnValue({ data: fundamentals, isLoading: false })
})

describe('SymbolPanel', () => {
  it('shows every block for a stock with full data', () => {
    renderWithProviders(panel())

    expect(screen.getByRole('heading', { name: 'NOW' })).toBeInTheDocument()
    expect(screen.getByText('145.09B')).toBeInTheDocument()
    expect(screen.getByText('2.00M', { selector: '[data-stat="volume"]' })).toBeInTheDocument()
    expect(screen.getByText(/After close/)).toBeInTheDocument()
    for (const name of ['Performance', 'Earnings', 'Analyst rating', 'Technicals', 'Seasonals']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument()
    }
    expect(screen.getByText('55 analysts · as of 2026-09-01')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open in research/i })).toHaveAttribute('href', '/research?symbol=NOW')
  })

  it('leaves company blocks out for an ETF and does not ask for fundamentals', () => {
    renderWithProviders(panel({ instrument: { uic: 2, assetType: 'Etf' } }))

    expect(queries.useFundamentals).toHaveBeenCalledWith('')
    expect(screen.getByRole('heading', { name: 'Performance' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Technicals' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Earnings' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Analyst rating' })).not.toBeInTheDocument()
    expect(screen.queryByText(/After close/)).not.toBeInTheDocument()
  })

  it('still shows the price blocks when fundamentals are unavailable', () => {
    queries.useFundamentals.mockReturnValue({ data: { available: false, reason: 'x' }, isLoading: false })
    renderWithProviders(panel())

    expect(screen.getByRole('heading', { name: 'Performance' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Analyst rating' })).not.toBeInTheDocument()
    expect(screen.queryByText('Market cap')).not.toBeInTheDocument()
  })

  it('leaves volume rows out when the bars carry no volume', () => {
    renderWithProviders(panel({ bars: dailyBars(700, { volume: 0 }) }))

    expect(screen.queryByText('Volume')).not.toBeInTheDocument()
    expect(screen.queryByText('Average volume (30D)')).not.toBeInTheDocument()
  })

  it('renders nothing when there is nothing to show', () => {
    queries.useFundamentals.mockReturnValue({ data: { available: false }, isLoading: false })
    const { container } = renderWithProviders(
      panel({ bars: [], earnings: { data: { available: false } } }),
    )

    expect(container.firstChild).toBeNull()
  })

  it('holds a place for the analyst block while fundamentals load', () => {
    queries.useFundamentals.mockReturnValue({ data: undefined, isLoading: true })
    renderWithProviders(panel())

    expect(screen.getByTestId('symbol-panel-loading')).toBeInTheDocument()
  })
})
```

- [ ] **Step 5: Run and confirm failure**

Run: `npx vitest run src/components/research/SymbolPanel.test.jsx`
Expected: FAIL, cannot resolve `./SymbolPanel`.

- [ ] **Step 6: Implement the panel**

Create `frontend/src/components/research/SymbolPanel.jsx`:

```jsx
import { useMemo } from 'react'
import { Link } from 'react-router-dom'

import { useFundamentals } from '../../api/queries'
import { analystRating } from '../../lib/analystRating'
import { SESSION_LABEL, daysUntil } from '../../lib/earnings'
import { fmtCompact, fmtShares } from '../../lib/format'
import { trailingReturns } from '../../lib/performance'
import { isEtf } from '../../lib/research'
import { seasonalSeries } from '../../lib/seasonals'
import { technicalRating } from '../../lib/technicalRating'
import { Card, Skeleton } from '../ui'
import EarningsDots from './EarningsDots'
import PerformanceTiles from './PerformanceTiles'
import RatingGauge from './RatingGauge'
import SeasonalsChart from './SeasonalsChart'

const AVERAGE_VOLUME_SESSIONS = 30

function averageVolume(bars) {
  const recent = bars.slice(-AVERAGE_VOLUME_SESSIONS)
  if (!recent.length) return 0
  return recent.reduce((sum, bar) => sum + (bar.volume || 0), 0) / recent.length
}

function nextEarningsText(next) {
  if (!next?.date) return null
  const when = daysUntil(next.date)
  const session = SESSION_LABEL[next.session]
  const sentence = when.charAt(0).toUpperCase() + when.slice(1)
  return session ? `${sentence} · ${session}` : sentence
}

function Section({ title, note, children }) {
  return (
    <section className="border-t border-white/[0.06] pt-3 mt-3 first:border-t-0 first:pt-0 first:mt-0">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h2 className="text-[var(--fig-sm)] font-medium text-zinc-200">{title}</h2>
        {note && <span className="text-[var(--fig-2xs)] text-zinc-500">{note}</span>}
      </div>
      {children}
    </section>
  )
}

function Counts({ rows }) {
  return (
    <dl className="mt-1 grid gap-1 text-center" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>
      {rows.map(([label, count]) => (
        <div key={label}>
          <dd className="num font-mono text-[var(--fig-sm)] text-zinc-100">{count}</dd>
          <dt className="text-[var(--fig-2xs)] text-zinc-500">{label}</dt>
        </div>
      ))}
    </dl>
  )
}

export default function SymbolPanel({ symbol, instrument, bars, earnings, href }) {
  const etf = isEtf(instrument)
  const fundamentals = useFundamentals(etf ? '' : symbol)
  const company = !etf && fundamentals.data?.available ? fundamentals.data : null
  const reported = !etf && earnings.data?.available ? earnings.data : null

  const returns = useMemo(() => trailingReturns(bars), [bars])
  const seasons = useMemo(() => seasonalSeries(bars), [bars])
  const technical = useMemo(() => technicalRating(bars), [bars])
  const analyst = analystRating(company?.recommendation)
  const loadingCompany = !etf && fundamentals.isLoading

  const latestVolume = bars.length ? bars[bars.length - 1].volume : 0
  const typicalVolume = averageVolume(bars)
  const stats = [
    ['next-earnings', 'Next earnings', nextEarningsText(reported?.next)],
    ['volume', 'Volume', latestVolume > 0 ? fmtShares(latestVolume) : null],
    ['average-volume', 'Average volume (30D)', typicalVolume > 0 ? fmtShares(typicalVolume) : null],
    ['market-cap', 'Market cap', company?.market_cap == null ? null : fmtCompact(company.market_cap)],
  ].filter(([, , value]) => value != null)

  const hasReturns = returns.some((row) => row.pct != null)
  const hasEarnings = Boolean(reported?.history?.some((row) => row.eps_actual != null) || reported?.next?.eps_estimate != null)
  const hasAnything =
    stats.length > 0 || hasReturns || hasEarnings || analyst || technical || seasons.length > 0 || loadingCompany
  if (!hasAnything) return null

  return (
    <Card>
      <Section title={symbol} note={<Link to={href} className="hover:text-zinc-300">Open in Research →</Link>}>
        {stats.length > 0 && (
          <dl className="text-[var(--fig-xs)]">
            {stats.map(([key, label, value]) => (
              <div key={key} className="flex justify-between gap-3 py-1">
                <dt className="text-zinc-400">{label}</dt>
                <dd data-stat={key} className="num font-mono text-zinc-100 text-right">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </Section>

      {hasReturns && (
        <Section title="Performance">
          <PerformanceTiles returns={returns} />
        </Section>
      )}

      {hasEarnings && (
        <Section title="Earnings" note="EPS, actual against estimate">
          <EarningsDots history={reported.history} next={reported.next} />
        </Section>
      )}

      {loadingCompany && <Skeleton className="h-24 w-full mt-3" data-testid="symbol-panel-loading" />}

      {analyst && (
        <Section title="Analyst rating">
          <RatingGauge title="Analyst rating" fraction={analyst.fraction} label={analyst.label} />
          <Counts rows={analyst.counts.map((row) => [row.label, row.count])} />
          <p className="mt-1 text-center text-[var(--fig-2xs)] text-zinc-500">
            {`${analyst.total} analysts · as of ${analyst.period}`}
          </p>
        </Section>
      )}

      {technical && (
        <Section title="Technicals" note="Daily">
          <RatingGauge title="Technicals" fraction={technical.fraction} label={technical.label} />
          <Counts
            rows={[
              ['Sell', technical.sell],
              ['Neutral', technical.neutral],
              ['Buy', technical.buy],
            ]}
          />
          <p className="mt-1 text-center text-[var(--fig-2xs)] text-zinc-500">
            {technical.votes.map((vote) => vote.label).join(', ')}
          </p>
        </Section>
      )}

      {seasons.length > 0 && (
        <Section title="Seasonals" note="Return from January">
          <SeasonalsChart series={seasons} />
        </Section>
      )}
    </Card>
  )
}
```

`Skeleton` in `frontend/src/components/ui.jsx` takes only `className` today. Open it (around line 383): if it does not spread extra props onto its element, change its signature to `export function Skeleton({ className = '', ...props })` and spread `{...props}` on the root element, so `data-testid` reaches the DOM.

- [ ] **Step 7: Run and confirm pass**

Run: `npx vitest run src/components/research/SymbolPanel.test.jsx src/components/research/EarningsTab.test.jsx src/lib/format.test.js`
Expected: PASS. The "Open in Research" link's accessible name is `Open in Research →`, matched by `/open in research/i`.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/format.js frontend/src/lib/format.test.js frontend/src/lib/earnings.js \
  frontend/src/components/ui.jsx frontend/src/components/research/EarningsTab.jsx \
  frontend/src/components/research/SymbolPanel.jsx frontend/src/components/research/SymbolPanel.test.jsx
git commit -m "feat(research): symbol panel composing stats, ratings and seasonals"
```

---

### Task 10: Mount the panel on the chart page and verify

**Files:**
- Modify: `frontend/src/pages/ResearchChart.jsx` (imports; the `useChartData` destructure near line 68; the `<aside>` near line 139)
- Modify: `frontend/src/pages/ResearchChart.test.jsx` (`stubQueries`, new tests)
- Modify: `AGENTS.md` (one "Decided" paragraph)

**Interfaces:**
- Consumes: `SymbolPanel({ symbol, instrument, bars, earnings, href })` (Task 9). `useChartData(...)` already returns `allBars` (every fetched bar) and `earnings` (the `useSymbolEarnings` result). `researchHref(symbol, tab, instrument)` is already imported in the page.

- [ ] **Step 1: Write the failing page tests**

In `frontend/src/pages/ResearchChart.test.jsx`, inside `stubQueries()`, add after the `useSymbolEarnings` line:

```js
  queries.useFundamentals.mockReturnValue({ ...idle, data: { available: false, reason: 'x' } })
```

Then add these tests inside the file's top-level `describe`:

```jsx
  it('shows the symbol panel under the watchlist', () => {
    renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })

    expect(screen.getByRole('heading', { name: 'Technicals' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open in research/i })).toHaveAttribute(
      'href',
      '/research?symbol=NVDA&uic=211&assetType=Stock',
    )
  })

  it('shows analyst and earnings blocks when the company data is there', () => {
    queries.useFundamentals.mockReturnValue({
      ...idle,
      data: { available: true, market_cap: 3_105_000, recommendation: { period: '2026-09-01', buy: 30, hold: 5 } },
    })
    queries.useSymbolEarnings.mockReturnValue({
      ...idle,
      data: {
        available: true,
        history: [{ date: '2026-06-30', eps_actual: 0.99, eps_estimate: 0.96, eps_surprise_pct: 3.1 }],
        next: null,
        score: null,
      },
    })
    renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })

    expect(screen.getByRole('heading', { name: 'Analyst rating' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Earnings' })).toBeInTheDocument()
  })

  it('keeps the heading outline valid with the panel mounted', () => {
    const { container } = renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })
    expectValidHeadingOutline(container)
  })

  it('renders without a panel when the symbol resolves to nothing', () => {
    queries.usePositions.mockReturnValue({ ...idle, data: [] })
    queries.useInstrumentSearch.mockImplementation(() => ({ ...idle, data: [], isError: false }))
    queries.useInstrumentDetails.mockReturnValue({ ...idle, data: undefined })
    queries.useChart.mockReturnValue({ data: [], isLoading: false, error: null })

    renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=ZZZZ' })

    expect(screen.queryByRole('heading', { name: 'Technicals' })).not.toBeInTheDocument()
  })
```

Check how `expectValidHeadingOutline` is called elsewhere in this file and match its argument (`container` or none). If the existing back-link assertions in this file show a different href shape for NVDA, copy that shape.

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/pages/ResearchChart.test.jsx`
Expected: the four new tests FAIL (no "Technicals" heading); every pre-existing test still passes.

- [ ] **Step 3: Mount the panel**

In `frontend/src/pages/ResearchChart.jsx`:

Add the import beside the other `components/research` imports:

```jsx
import SymbolPanel from '../components/research/SymbolPanel'
```

Change the `useChartData` destructure to take the two extra fields:

```jsx
  const { allBars, rangeBars, priceLines, quote, details, earnings } = useChartData({ symbol, instrument, range: controls.range })
```

Replace the `<aside>` block with:

```jsx
      <aside className="hidden lg:flex flex-col gap-2 p-2 pl-0 min-h-0 overflow-y-auto">
        <InstrumentSearchBar hrefFor={chartResultHref} />
        <div className="h-[340px] shrink-0">
          <WatchlistRail fill gridView symbol={symbol} onSelectSymbol={selectSymbol} heldSymbols={heldSymbols} />
        </div>
        <SymbolPanel
          symbol={symbol}
          instrument={instrument}
          bars={allBars}
          earnings={earnings}
          href={researchHref(symbol, undefined, instrument)}
        />
      </aside>
```

- [ ] **Step 4: Run and confirm pass**

Run: `npx vitest run src/pages/ResearchChart.test.jsx`
Expected: PASS, all tests. If a pre-existing test asserted the watchlist fills the column, update it to the new bounded height.

- [ ] **Step 5: Record the decision**

Append to the "Decided" section of `AGENTS.md`:

```markdown
**The chart page's symbol panel computes from what the page already fetched.**
`SymbolPanel` sits under the watchlist on `/research/chart` and follows the URL's
symbol. Performance, seasonals and the technicals gauge are arithmetic over the one
1,200-bar fetch (`lib/performance.js::trailingReturns`, `lib/seasonals.js`,
`lib/technicalRating.js`); earnings dots reuse the page's `useSymbolEarnings`; only
the analyst gauge and market cap add a request, the 24h-cached `useFundamentals`.
The technicals rating is ours, a daily vote of six indicators, and names its inputs
under the gauge so it is not read as TradingView's. An ETF gets no company blocks,
and a block without data is left out. Analyst price targets and estimates beyond two
quarters are refused by the free Finnhub key, so there is no forecast cone.
```

- [ ] **Step 6: Full gate**

Run, from `frontend/`:

```bash
npx vitest run
npx eslint .
npm run build
```

Expected: all tests pass (1,783 before this plan, plus the new ones), eslint reports nothing, the build succeeds.

- [ ] **Step 7: Screenshot review**

Follow the harness recipe in the `saxodash-design-system` skill (`.claude/skills/`) at 1440px on `/research/chart?symbol=NVDA` with the stack running (`scripts/dev.sh`, dev login `demo`). Check:
- the right column scrolls as one and the watchlist keeps its 340px;
- the instrument search dropdown is not clipped by the column's scroll container;
- both gauges, the tiles and the seasonals fit the 300px column with no horizontal scroll;
- an ETF from the watchlist drops the Earnings and Analyst blocks;
- a split layout (2 or 4 panes): the panel follows the active pane.

Fix what the screenshots show, re-run Step 6, then commit.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/ResearchChart.jsx frontend/src/pages/ResearchChart.test.jsx AGENTS.md
git commit -m "feat(research): symbol panel under the watchlist on the chart page"
```

---

## After this plan

Phase 2 (tab regroup, Financials tab, statements endpoint, the panel's mini financials block) and phase 3 are described in the spec and get their own plans.
