# Discover Polish (Phase A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Discover page's polish issues found in the 2026-10-04 review: cut-off cards, link-coloured reasons, a stale "Updated" label, phone header wrapping, contrast/fallbacks, the See-all page, and loading skeletons.

**Architecture:** Mostly frontend (`pages/Discover*.jsx`, `components/discover/*`, `lib/discover.js`). Two small backend additions feed it: scan progress carries `started_at` (so the UI can estimate time left from the observed rate), and the shelf detail endpoint carries `as_of`.

**Tech Stack:** React 19 (JS), Tailwind v4, vitest + Testing Library; Django + DRF `APITestCase`.

**Spec:** the review prompt's Phase A (`docs/superpowers/specs/2026-10-02-discover-lenses-design.md` and `2026-09-30-discover-shelves-design.md` remain the product spec).

## Global Constraints

- Zero code comments in new or edited code (AGENTS.md "Code style").
- Use the existing primitives from `frontend/src/components/ui.jsx` (`Card`, `EmptyState`, `Skeleton`, `InstrumentLogo`) rather than hand-rolled containers (`docs/design-system.md`).
- Blue (`text-blue-*`) is reserved for links/accent; data is zinc.
- Discover is a filter on the last scan, not a recommendation. No copy may imply ranking or advice.
- Leave `frontend/src/pages/Transactions.jsx` alone: it has unrelated uncommitted changes.

## Review Focus

1. The scan progress cached by a worker started before this change has no `started_at`. The UI must show no ETA rather than `NaN`/a crash (Task 2 test).
2. `done === 0` or `total == null`: there is no rate to extrapolate yet, so no ETA (Task 2 test).
3. The container width is 0 or unmeasured (jsdom, hidden tab): the shelf must still render cards, not an empty row (Task 2 `cardsThatFit` test).
4. A ticker that is an empty string or lowercase: the logo fallback must not crash and must show an uppercase initial (Task 3 test).
5. A shelf whose total is smaller than the cards that fit: no phantom tiles, and "See all" still reads the total (Task 4 test).

---

### Task 1: Backend — progress `started_at` and shelf `as_of`

**Files:**
- Modify: `backend/research/scan_progress.py`
- Modify: `backend/research/scan.py:99-110`
- Modify: `backend/research/views.py` (`DiscoverShelfView`)
- Test: `backend/research/test_scan_progress.py`, `backend/research/test_scan.py`, `backend/research/test_discover_views.py`

**Interfaces:**
- Produces: `scan_progress.report(done, total, started_at)` caches `{'done', 'total', 'started_at'}`; `started_at` is an ISO-8601 string. `GET /api/research/discover/shelves/<key>/` adds `as_of` (same value as the Discover endpoint's `as_of`).

- [ ] **Step 1: Write the failing tests**

In `test_scan_progress.py`, replace `test_a_running_scan_cannot_be_claimed`:

```python
    def test_a_running_scan_cannot_be_claimed(self):
        scan_progress.report(3, 10, '2026-10-04T07:23:45+00:00')
        self.assertFalse(scan_progress.claim())
        self.assertEqual(scan_progress.current(), {'done': 3, 'total': 10, 'started_at': '2026-10-04T07:23:45+00:00'})
```

and change `test_clear_ends_the_run`'s report call to `scan_progress.report(3, 10, '2026-10-04T07:23:45+00:00')`.

In `test_scan.py`, replace `test_reports_progress_after_each_symbol_and_clears_it_at_the_end`:

```python
    def test_reports_progress_after_each_symbol_and_clears_it_at_the_end(self, search, chart, financials):
        self.search_for(search, {'AAPL': 211, 'BRK.B': 212})
        seen = []
        self.run_scan(pause=lambda _seconds: seen.append(scan_progress.current()))
        self.assertEqual([(p['done'], p['total']) for p in seen], [(1, 2), (2, 2)])
        self.assertIsNone(scan_progress.current())

    def test_every_progress_report_carries_when_the_run_started(self, search, chart, financials):
        self.search_for(search, {'AAPL': 211, 'BRK.B': 212})
        seen = []
        self.run_scan(pause=lambda _seconds: seen.append(scan_progress.current()))
        started = {p['started_at'] for p in seen}
        self.assertEqual(len(started), 1)
        self.assertIsNotNone(datetime.fromisoformat(started.pop()))
```

Add `from datetime import datetime` to `test_scan.py`'s imports if absent.

In `test_discover_views.py`, change the two `scan_progress.report(...)` calls and their assertions:

```python
        scan_progress.report(144, 518, '2026-10-04T07:23:45+00:00')
        ...
        self.assertEqual(response.data['health']['progress'], {'done': 144, 'total': 518, 'started_at': '2026-10-04T07:23:45+00:00'})
```

```python
        scan_progress.report(10, 518, '2026-10-04T07:23:45+00:00')
        ...
        self.assertEqual(response.data['health']['progress'], {'done': 10, 'total': 518, 'started_at': '2026-10-04T07:23:45+00:00'})
```

and add:

```python
    def test_shelf_detail_says_how_fresh_its_data_is(self):
        self.run_at('ok', 1)
        self.stock('AAA', rsi14=80.0)
        detail = self.client.get(reverse('research-discover-shelf', args=['overbought'])).data
        overview = self.client.get(reverse('research-discover')).data
        self.assertIsNotNone(detail['as_of'])
        self.assertEqual(detail['as_of'], overview['as_of'])
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test research.test_scan_progress research.test_scan research.test_discover_views`
Expected: FAIL (`report()` takes 2 positional arguments; `KeyError: 'started_at'`; `KeyError: 'as_of'`).

- [ ] **Step 3: Implement**

`scan_progress.py`:

```python
def report(done, total, started_at):
    cache.set(PROGRESS_KEY, {'done': done, 'total': total, 'started_at': started_at}, RUNNING_TTL)
```

`scan.py` `scan_universe`:

```python
def scan_universe(pause=time.sleep, universe=UNIVERSE_CSV):
    load_universe(universe)
    rows = list(ScreenerRow.objects.order_by('ticker'))
    started_at = timezone.now().isoformat()
    with_fundamentals = True
    try:
        for done, row in enumerate(rows, start=1):
            with_fundamentals = scan_row(row, with_fundamentals=with_fundamentals)
            scan_progress.report(done, len(rows), started_at)
            pause(PAUSE_SECONDS)
    finally:
        scan_progress.clear()
    return ScreenerRow.objects.filter(status=ScreenerRow.OK).count()
```

`views.py` `DiscoverShelfView.get`:

```python
        return Response({**shelves.payload(shelf), 'as_of': discover.as_of()})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python manage.py test research`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/research/scan_progress.py backend/research/scan.py backend/research/views.py backend/research/test_scan_progress.py backend/research/test_scan.py backend/research/test_discover_views.py
git commit -m "feat: scan progress says when the run started and shelf detail says how fresh it is"
```

---

### Task 2: `lib/discover.js` helpers and `useNow`

**Files:**
- Modify: `frontend/src/lib/discover.js`
- Create: `frontend/src/lib/useNow.js`
- Test: `frontend/src/lib/discover.test.js`, `frontend/src/lib/useNow.test.js`

**Interfaces:**
- Produces:
  - `scanEtaLabel(progress, now = new Date()) → string | null`: `'About 9 min left'`, `'Less than a minute left'`, or `null` when there is no rate yet.
  - `cardsThatFit(width) → number | null`: `null` below `GRID_MIN_WIDTH` (640 px, which means "use the phone scroller"), otherwise `max(1, floor((width + 12) / (224 + 12)))`.
  - `reasonParts({label, value, format}) → {label, value}` (value already formatted).
  - `SPARKLINE_PERIOD = '3M'`.
  - `REFRESH_HINT`, the Refresh button's title string.
  - `useNow(intervalMs) → Date` (in `lib/useNow.js`), which re-renders the caller every `intervalMs`.

- [ ] **Step 1: Write the failing tests**

Append to `discover.test.js` (and extend its import list with `cardsThatFit, reasonParts, scanEtaLabel`):

```js
describe('scanEtaLabel', () => {
  const now = new Date('2026-10-04T07:33:45Z')
  const started_at = '2026-10-04T07:23:45Z'

  it('extrapolates the time left from the pace so far', () => {
    expect(scanEtaLabel({ done: 100, total: 518, started_at }, now)).toBe('About 42 min left')
  })

  it('says less than a minute near the end', () => {
    expect(scanEtaLabel({ done: 517, total: 518, started_at }, now)).toBe('Less than a minute left')
  })

  it('has no estimate before there is a pace to measure', () => {
    expect(scanEtaLabel({ done: 0, total: 518, started_at }, now)).toBeNull()
    expect(scanEtaLabel({ done: 0, total: null }, now)).toBeNull()
  })

  it('has no estimate for progress reported without a start time', () => {
    expect(scanEtaLabel({ done: 100, total: 518 }, now)).toBeNull()
  })
})

describe('cardsThatFit', () => {
  it('leaves narrow rows to the scroller', () => {
    expect(cardsThatFit(390)).toBeNull()
  })

  it('counts whole cards with their gaps', () => {
    expect(cardsThatFit(944)).toBe(4)
    expect(cardsThatFit(1100)).toBe(4)
    expect(cardsThatFit(1168)).toBe(5)
  })

  it('treats an unmeasured row as narrow rather than empty', () => {
    expect(cardsThatFit(0)).toBeNull()
    expect(cardsThatFit(undefined)).toBeNull()
  })
})

describe('reasonParts', () => {
  it('splits a reason into its label and formatted value', () => {
    expect(reasonParts({ label: 'vs 200D', value: -6.4, format: 'signed_pct' })).toEqual({ label: 'vs 200D', value: '-6.4%' })
  })
})
```

Check: 100 done in 600 s means 6 s each, and 418 left × 6 = 2508 s ≈ 41.8 min, which rounds up to 42. For 517 done, 1 left × 1.16 s is under a minute.

Create `useNow.test.js`:

```js
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import { useNow } from './useNow'

describe('useNow', () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date('2026-10-04T07:00:00Z') }))
  afterEach(() => vi.useRealTimers())

  it('moves forward on its interval', () => {
    const { result } = renderHook(() => useNow(60_000))
    expect(result.current.toISOString()).toBe('2026-10-04T07:00:00.000Z')
    act(() => vi.advanceTimersByTime(60_000))
    expect(result.current.toISOString()).toBe('2026-10-04T07:01:00.000Z')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/discover.test.js src/lib/useNow.test.js`
Expected: FAIL (`scanEtaLabel is not a function`, cannot resolve `./useNow`).

- [ ] **Step 3: Implement**

Append to `lib/discover.js`:

```js
export const reasonParts = ({ label, value, format }) => ({ label, value: formatFieldValue(format, value) })

export const SPARKLINE_PERIOD = '3M'

export const REFRESH_HINT = 'Rescans every stock in the S&P 500 and Nasdaq-100. Takes several minutes.'

export function scanEtaLabel(progress, now = new Date()) {
  const { done, total, started_at: startedAt } = progress ?? {}
  if (!startedAt || !done || total == null) return null
  const perStock = (now - new Date(startedAt)) / done
  const remaining = perStock * (total - done)
  if (!Number.isFinite(remaining)) return null
  if (remaining < MINUTE_MS) return 'Less than a minute left'
  return `About ${Math.ceil(remaining / MINUTE_MS)} min left`
}

const CARD_WIDTH = 224
const CARD_GAP = 12
export const GRID_MIN_WIDTH = 640

export function cardsThatFit(width) {
  if (!width || width < GRID_MIN_WIDTH) return null
  return Math.max(1, Math.floor((width + CARD_GAP) / (CARD_WIDTH + CARD_GAP)))
}
```

(`MINUTE_MS` is already defined in that file, above `updatedLabel`. Place the new code after it.)

Create `lib/useNow.js`:

```js
import { useEffect, useState } from 'react'

export function useNow(intervalMs) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/discover.test.js src/lib/useNow.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/discover.js frontend/src/lib/discover.test.js frontend/src/lib/useNow.js frontend/src/lib/useNow.test.js
git commit -m "feat: Discover helpers for scan ETA, cards that fit a row and reason parts"
```

---

### Task 3: `DiscoverCard`: Card primitive, data-coloured reasons, letter fallback, sparkline period

**Files:**
- Create: `frontend/src/components/discover/TickerInitial.jsx`
- Modify: `frontend/src/components/discover/DiscoverCard.jsx`
- Test: `frontend/src/components/discover/DiscoverCard.test.jsx`

**Interfaces:**
- Consumes: `reasonParts`, `SPARKLINE_PERIOD` (Task 2).
- Produces: `<TickerInitial ticker size />`, a square showing the ticker's uppercase first letter with `aria-hidden`, sized in px. Task 5 reuses it.
- `DiscoverCard` accepts an optional `className` (Task 4 passes `w-56 shrink-0 snap-start` for the scroller and `w-full` for the grid). The card itself no longer hard-codes its width.

- [ ] **Step 1: Write the failing tests**

Add to `DiscoverCard.test.jsx` (import `fireEvent` from Testing Library):

```js
  it('styles the reasons as data, not as links', () => {
    renderCard()
    const reasons = screen.getByRole('list', { name: 'Why AAPL is here' })
    expect(reasons.className).not.toMatch(/text-blue/)
  })

  it('falls back to the ticker initial when the logo cannot load', () => {
    const { container } = renderCard()
    fireEvent.error(container.querySelector('img'))
    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('names the period its sparkline covers', () => {
    renderCard()
    expect(screen.getByText('3M')).toBeInTheDocument()
  })
```

Create `TickerInitial.test.jsx` next to it:

```js
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'

import TickerInitial from './TickerInitial'

describe('TickerInitial', () => {
  it('shows the ticker initial in capitals', () => {
    const { container } = render(<TickerInitial ticker="brk.b" size={24} />)
    expect(container).toHaveTextContent('B')
  })

  it('renders an empty tile for a missing ticker', () => {
    const { container } = render(<TickerInitial ticker="" size={24} />)
    expect(container.firstChild).toBeEmptyDOMElement()
  })
})
```

The existing test `'shows every value that put the stock in the lens, each kept whole'` must keep passing unchanged (list item text `'ROE 31%'`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/discover/`
Expected: FAIL (reasons class contains `text-blue-300`; no `A`; no `3M`; `TickerInitial` missing).

- [ ] **Step 3: Implement**

`TickerInitial.jsx`:

```jsx
export default function TickerInitial({ ticker, size }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="shrink-0 rounded bg-zinc-800 flex items-center justify-center text-[var(--fig-2xs)] font-semibold text-zinc-400"
    >
      {ticker ? ticker[0].toUpperCase() : null}
    </span>
  )
}
```

`DiscoverCard.jsx`:

```jsx
import { Link } from 'react-router-dom'

import { SPARKLINE_PERIOD, reasonParts } from '../../lib/discover'
import { fmtMoney } from '../../lib/format'
import { researchHref } from '../../lib/research'
import { Card, DayChange, InstrumentLogo } from '../ui'
import Sparkline from './Sparkline'
import TickerInitial from './TickerInitial'
import WatchlistStar from './WatchlistStar'

export default function DiscoverCard({ item, className = '' }) {
  return (
    <Card padding={false} interactive className={`relative ${className}`}>
      <Link
        to={researchHref(item.ticker, 'overview', { uic: item.uic, assetType: item.asset_type })}
        className="block p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 rounded-lg"
      >
        <div className="flex items-center gap-2 pr-7">
          <InstrumentLogo symbol={item.ticker} size={24} className="rounded" fallback={<TickerInitial ticker={item.ticker} size={24} />} />
          <div className="min-w-0">
            <div className="text-[var(--fig-sm)] font-semibold text-zinc-100">{item.ticker}</div>
            <div className="text-[var(--fig-2xs)] text-zinc-500 truncate">{item.name}</div>
          </div>
        </div>
        <div className="mt-3 flex items-baseline justify-between">
          <span className="num font-mono text-[var(--fig-sm)] text-zinc-200">{fmtMoney(item.last_close, 'USD')}</span>
          <DayChange value={item.change_1d} className="text-[var(--fig-xs)]" />
        </div>
        <ul aria-label={`Why ${item.ticker} is here`} className="mt-1 flex flex-wrap gap-x-2 text-[var(--fig-xs)]">
          {item.reasons.map((reason) => {
            const { label, value } = reasonParts(reason)
            return (
              <li key={reason.field} className="whitespace-nowrap">
                <span className="text-zinc-500">{label}</span> <span className="num font-mono text-zinc-200">{value}</span>
              </li>
            )
          })}
        </ul>
        <div className="mt-2 flex items-end gap-1.5">
          <div className="min-w-0 flex-1">
            <Sparkline values={item.sparkline} />
          </div>
          <span className="text-[var(--fig-2xs)] text-zinc-500">{SPARKLINE_PERIOD}</span>
        </div>
      </Link>
      <div className="absolute top-2 right-2">
        <WatchlistStar ticker={item.ticker} name={item.name} uic={item.uic} assetType={item.asset_type} />
      </div>
    </Card>
  )
}
```

`Card` merges `className` last, so `relative` and the caller's width apply. Check `formatReason` is still imported elsewhere (`reasonsLine` uses it). It is still exported, so leave it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/discover/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/discover/TickerInitial.jsx frontend/src/components/discover/TickerInitial.test.jsx frontend/src/components/discover/DiscoverCard.jsx frontend/src/components/discover/DiscoverCard.test.jsx
git commit -m "feat: Discover cards use the Card primitive, show reasons as data and name their sparkline period"
```

---

### Task 4: `ShelfRow`: whole cards only, See-all count, phone header, accessible empty state

**Files:**
- Modify: `frontend/src/components/discover/ShelfRow.jsx`
- Test: `frontend/src/components/discover/ShelfRow.test.jsx` (create), `frontend/src/pages/Discover.test.jsx` (update See-all expectations)

**Interfaces:**
- Consumes: `cardsThatFit` (Task 2), `DiscoverCard` `className` prop (Task 3), `useWidth` from `lib/chartGeometry.js` (returns `[ref, width]`; width falls back to 760 when unmeasured, as in jsdom).
- Produces: `ShelfRow` renders a phone scroller (all items) when `cardsThatFit(width)` is `null`, else a CSS grid of `min(fit, items.length)` cards with `gridTemplateColumns: repeat(fit, minmax(0, 1fr))`. Its "See all" link reads `See all {total}`.

- [ ] **Step 1: Write the failing tests**

Create `ShelfRow.test.jsx`:

```js
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import ShelfRow from './ShelfRow'

vi.mock('../research/useWatchlistToggle', () => ({
  useWatchlistToggle: () => ({ watchlists: [], toggleList: vi.fn() }),
}))

const item = (i) => ({
  ticker: `T${i}`, name: `Stock ${i}`, uic: i, asset_type: 'Stock', last_close: 10, change_1d: 1, sparkline: [],
  reasons: [{ field: 'rsi14', label: 'RSI', value: 81, format: 'number' }],
})
const shelf = (total, count) => ({
  key: 'overbought', title: 'Overbought', subtitle: 'RSI 14 ≥ 70', order: 'Ordered by RSI 14, highest first',
  empty: 'No stocks match these criteria in the last session.', total, items: Array.from({ length: count }, (_, i) => item(i)),
})
const renderRow = (s) => render(<MemoryRouter><ShelfRow shelf={s} /></MemoryRouter>)

describe('ShelfRow', () => {
  it('shows only the cards that fit whole on a wide row', () => {
    renderRow(shelf(20, 20))
    expect(screen.getAllByRole('link', { name: /^T\d+/ })).toHaveLength(3)
  })

  it('does not pad a short shelf', () => {
    renderRow(shelf(2, 2))
    expect(screen.getAllByRole('link', { name: /^T\d+/ })).toHaveLength(2)
  })

  it('tells how many stocks See all opens', () => {
    renderRow(shelf(99, 20))
    expect(screen.getByRole('link', { name: 'See all 99' })).toHaveAttribute('href', '/discover/overbought')
  })

  it('keeps the count on one line', () => {
    renderRow(shelf(102, 20))
    expect(screen.getByText('102 stocks')).toHaveClass('whitespace-nowrap')
  })

  it('says a shelf is empty in readable contrast', () => {
    renderRow(shelf(0, 0))
    expect(screen.getByText('No stocks match these criteria in the last session.')).not.toHaveClass('text-zinc-600')
  })
})
```

(jsdom width falls back to 760 px. `cardsThatFit(760)` = floor(772/236) = 3.)

In `Discover.test.jsx`, change `screen.getByRole('link', { name: 'See all' })` to `screen.getByRole('link', { name: 'See all 7' })`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/discover/ShelfRow.test.jsx src/pages/Discover.test.jsx`
Expected: FAIL (20 links rendered; link name `See all`; no `whitespace-nowrap`; `text-zinc-600`).

- [ ] **Step 3: Implement**

`ShelfRow.jsx`:

```jsx
import { Link } from 'react-router-dom'

import { useWidth } from '../../lib/chartGeometry'
import { cardsThatFit, shelfNote, stockCount } from '../../lib/discover'
import { EmptyState, InfoTip } from '../ui'
import DiscoverCard from './DiscoverCard'

const cardKey = (item) => `${item.uic}:${item.asset_type}`

function Cards({ items, fit }) {
  if (fit == null) {
    return (
      <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4">
        {items.map((item) => <DiscoverCard key={cardKey(item)} item={item} className="w-56 shrink-0 snap-start" />)}
      </div>
    )
  }
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${fit}, minmax(0, 1fr))` }}>
      {items.slice(0, fit).map((item) => <DiscoverCard key={cardKey(item)} item={item} />)}
    </div>
  )
}

export default function ShelfRow({ shelf }) {
  const [ref, width] = useWidth()
  return (
    <section ref={ref} aria-labelledby={`shelf-${shelf.key}`} className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`shelf-${shelf.key}`} className="text-[var(--fig-md)] font-semibold text-zinc-100">{shelf.title}</h2>
          <p className="flex flex-wrap items-center gap-x-2 text-[var(--fig-xs)] text-zinc-500">
            <span className="num whitespace-nowrap">{stockCount(shelf.total)}</span>
            <span aria-hidden="true">·</span>
            <span>{shelf.subtitle}</span>
            <InfoTip label={`About ${shelf.title}`}>{shelfNote(shelf)}</InfoTip>
          </p>
        </div>
        {shelf.total > 0 ? (
          <Link to={`/discover/${shelf.key}`} className="shrink-0 whitespace-nowrap text-[var(--fig-xs)] text-blue-400 hover:text-blue-300">
            See all <span className="num">{shelf.total}</span>
          </Link>
        ) : null}
      </div>
      {shelf.total === 0 ? (
        <EmptyState title={shelf.empty} className="py-4" />
      ) : (
        <Cards items={shelf.items} fit={cardsThatFit(width)} />
      )}
    </section>
  )
}
```

Accessible name check: the link text "See all " + "99" gives the name `See all 99`.

The existing Discover test `'renders each shelf with its criteria, count and a See all link'` uses `getByText('RSI 14 ≥ 70')` and `getByText('7 stocks')`. Both are still separate spans, so they pass.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/discover/ src/pages/Discover.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/discover/ShelfRow.jsx frontend/src/components/discover/ShelfRow.test.jsx frontend/src/pages/Discover.test.jsx
git commit -m "feat: Discover shelves show whole cards only and say how many stocks See all opens"
```

---

### Task 5: Discover page — live "Updated" label, Refresh hint, scan ETA, shelf skeletons

**Files:**
- Modify: `frontend/src/pages/Discover.jsx`
- Modify: `frontend/src/components/discover/ScanProgress.jsx`
- Test: `frontend/src/pages/Discover.test.jsx`, `frontend/src/components/discover/ScanProgress.test.jsx`

**Interfaces:**
- Consumes: `useNow` and `scanEtaLabel` (Task 2), `REFRESH_HINT` (Task 2).
- Produces: `ScanProgress` takes `{ progress, now }` and renders the ETA after the label when `scanEtaLabel` returns one.

- [ ] **Step 1: Write the failing tests**

`ScanProgress.test.jsx` adds:

```js
  it('estimates the time left from the pace so far', () => {
    render(<ScanProgress progress={{ done: 100, total: 518, started_at: '2026-10-04T07:23:45Z' }} now={new Date('2026-10-04T07:33:45Z')} />)
    expect(screen.getByText('About 42 min left')).toBeInTheDocument()
  })
```

`Discover.test.jsx` adds (import `act` from Testing Library and `afterEach` from vitest):

```js
  it('keeps the updated label current while the page stays open', () => {
    vi.useFakeTimers({ now: new Date('2026-10-04T08:00:30Z') })
    try {
      useDiscover.mockReturnValue({ data: { as_of: '2026-10-04T08:00:00Z', health: { state: 'ok', last_ok_at: '2026-10-04T08:00:00Z', progress: null }, shelves: [] } })
      renderPage()
      expect(screen.getByText('Updated just now')).toBeInTheDocument()
      act(() => vi.advanceTimersByTime(5 * 60_000))
      expect(screen.getByText('Updated 5 min ago')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('says what a refresh does before it is started', () => {
    useDiscover.mockReturnValue({ data: { as_of: '2026-10-04T08:00:00Z', health: { state: 'ok', progress: null }, shelves: [] } })
    renderPage()
    expect(screen.getByRole('button', { name: 'Refresh' })).toHaveAttribute('title', expect.stringMatching(/several minutes/))
  })

  it('loads with shelf-shaped placeholders', () => {
    useDiscover.mockReturnValue({ data: undefined, isLoading: true })
    renderPage()
    expect(screen.getAllByTestId('shelf-skeleton')).toHaveLength(3)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/pages/Discover.test.jsx src/components/discover/ScanProgress.test.jsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`ScanProgress.jsx`: change the signature to `export default function ScanProgress({ progress, now })`. Import `scanEtaLabel` alongside `scanProgressLabel`, compute `const eta = scanEtaLabel(progress, now)`, and render the label line as:

```jsx
      <div className="flex flex-wrap justify-between gap-x-3 text-[var(--fig-xs)] text-zinc-400 num">
        <span>{label}</span>
        {eta ? <span className="text-zinc-500">{eta}</span> : null}
      </div>
```

`Discover.jsx` changes:
- `import { useNow } from '../lib/useNow'`; extend the `lib/discover` import with `REFRESH_HINT`.
- `const SKELETON_SHELVES = 3`, and add a `ShelfSkeleton` component:

```jsx
function ShelfSkeleton() {
  return (
    <div data-testid="shelf-skeleton" className="space-y-2">
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-3 w-72 max-w-full" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-40 hidden sm:block" />
        <Skeleton className="h-40 hidden sm:block" />
      </div>
    </div>
  )
}
```

- `ScanControls({ health, startScan, now })`: render `{updatedLabel(health?.last_ok_at, now)}` and give the `Button` `title={REFRESH_HINT}`.
- In `Discover()`: `const now = useNow(60_000)`, pass `now` to `ScanControls` and `ScanProgress`, and replace `{isLoading ? <Skeleton className="h-48" /> : null}` with `{isLoading ? Array.from({ length: SKELETON_SHELVES }, (_, i) => <ShelfSkeleton key={i} />) : null}`.
- Check `Button` forwards `title`. If `Button` in `components/ui.jsx` does not spread unknown props, add `title` to its props and pass it to `<button>`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/Discover.test.jsx src/components/discover/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Discover.jsx frontend/src/pages/Discover.test.jsx frontend/src/components/discover/ScanProgress.jsx frontend/src/components/discover/ScanProgress.test.jsx frontend/src/components/ui.jsx
git commit -m "feat: Discover keeps its updated label current, estimates scan time left and loads with shelf placeholders"
```

---

### Task 6: See-all page: breadcrumb, freshness and count, left-aligned reasons, touch targets

**Files:**
- Modify: `frontend/src/pages/DiscoverShelf.jsx`
- Modify: `frontend/src/components/discover/WatchlistStar.jsx:69` (button size)
- Test: `frontend/src/pages/DiscoverShelf.test.jsx`

**Interfaces:**
- Consumes: `as_of` on the shelf payload (Task 1), `TickerInitial` (Task 3), `stockCount` and `updatedLabel` from `lib/discover`.

- [ ] **Step 1: Write the failing tests**

In `DiscoverShelf.test.jsx`, add `as_of: '2026-10-04T07:00:00Z'` to the `shelf` fixture, then add:

```js
  it('leads back to Discover above the title', () => {
    renderPage()
    expect(screen.getByRole('link', { name: '← Discover' })).toHaveAttribute('href', '/discover')
  })

  it('says how many stocks match and how fresh the data is', () => {
    renderPage()
    expect(screen.getByText(/1 stock/)).toBeInTheDocument()
    expect(screen.getByText(/^Updated /)).toBeInTheDocument()
  })

  it('reads why a stock is here from the left', () => {
    renderPage()
    expect(screen.getByRole('columnheader', { name: 'Why it is here' })).not.toHaveClass('text-right')
  })

  it('gives the row actions a finger-sized target on phones', () => {
    renderPage()
    expect(screen.getByRole('link', { name: 'Open FICO chart' })).toHaveClass('w-10', 'h-10')
  })
```

Before writing the third test, check how `Th` applies `align` in `components/ui.jsx`. If it uses a class other than `text-right`, assert on that class instead. Update any existing test that looks for the `'Back to Discover'` link to use `'← Discover'`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/pages/DiscoverShelf.test.jsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`DiscoverShelf.jsx`:
- Above `PageHeader`, add `<Link to="/discover" className="inline-block text-[var(--fig-xs)] text-blue-400 hover:text-blue-300">← Discover</Link>` and drop the `right` prop's "Back to Discover" link.
- Set `subtitle={data ? `${stockCount(data.total)} · ${data.subtitle} · ${data.order}` : undefined}` and `right={data ? <span className="text-[var(--fig-xs)] text-zinc-500 whitespace-nowrap">{updatedLabel(data.as_of)}</span> : null}`.
- The "Why it is here" `Th` and its `Td` lose `align="right"`.
- Change the logo fallback to `<TickerInitial ticker={item.ticker} size={20} />`.
- Chart link classes: replace `w-6 h-6` with `w-10 h-10 sm:w-6 sm:h-6`.

`WatchlistStar.jsx` button: replace `w-6 h-6` with `w-10 h-10 sm:w-6 sm:h-6`.

The "Why it is here" cell renders `reasonsLine(item.reasons)`; keep it, so the table stays compact.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run`
Expected: the full frontend suite passes.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/DiscoverShelf.jsx frontend/src/pages/DiscoverShelf.test.jsx frontend/src/components/discover/WatchlistStar.jsx
git commit -m "feat: Discover See-all page leads back above its title, says count and freshness, and has finger-sized actions"
```

---

### Task 7: Visual verification

- [ ] Screenshot `/discover` at 1440px and 390px and `/discover/oversold` at 1440px with the `saxodash-design-system` skill's harness. Compare against the 2026-10-04 baselines in the session scratchpad (`discover-desktop.png`, `discover-phone.png`, `shelf-desktop.png`).
- [ ] Confirm: no sliced fifth card; reasons in zinc; the "102 stocks" count is unbroken on phone; the empty shelf is readable; the star is still placed inside the card at desktop width.
- [ ] Run `cd frontend && npm run lint` and `cd backend && .venv/bin/python manage.py test`. Both must be clean.
