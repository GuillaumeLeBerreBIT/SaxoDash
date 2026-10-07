# Review Phase 2B — Analytics, Accounts, Account Detail and Spending Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Analytics, Accounts, the account detail page and Spending honest about missing data, sync state and partial periods, using the payloads Phase 1 already ships (roadmap findings 2.4–2.7).

**Architecture:** Small pure helper modules under `frontend/src/lib/` own the decisions (needs-days wording, chart domains and ticks, sync badge, transaction filtering and paging, spending shaping). Pages and components only call them. No backend change: Phase 1 already ships `needs_days`, `history_days`, `comparison_label`, `partial` and `bank_only_total`.

**Tech Stack:** React 19, vitest + Testing Library, Recharts, Tailwind.

**Spec:** `docs/superpowers/plans/2026-10-04-app-review-roadmap.md` rows 2.4–2.7. Phase 1 contract: `docs/superpowers/plans/2026-10-04-review-phase-1-backend.md`.

## Payload facts this plan relies on (verified in `backend/`)

- `GET risk metrics`: `has_data`, `history_days`, `inputs_reliable`, `needs_days: {expected_return, volatility, sharpe, sortino, monthly_stats}` (days still missing, `0` when satisfied, `monthly_stats` may be `null`); each gated metric is `null` when history is too short; `best_month`, `worst_month`, `positive_months_pct` are `null` until two complete months exist; `benchmark` carries its own `needs_days: {tracking_error, beta, information_ratio, jensen_alpha}`.
- `GET performance`: `periods[]` each with `portfolio_pct`, `benchmark_pct`, `alpha_pct` (all `null` when the window is unmet), `needs_days` (a number, or `null` for Year to date when the portfolio started after 1 Jan); `calendar_years[]` with `partial`.
- `GET spending summary`: `previous_period` and `comparison_label` (e.g. `"same days last month"`, `"previous month"`).
- `GET spending trend`: `[{month: 'YYYY-MM', total: string|null, partial: bool}]`, six continuous months; `total: null` = before the first transaction.
- `GET bank transactions?account=<id>`: unpaginated list; fields `id, bank_account, booking_date, counterparty_name, description, amount, currency, category, category_override, effective_category`.
- `GET enablebanking status`: per bank `{connected, needs_reauth, usable, unusable_reason, last_synced_at, last_sync_outcome ('ok'|'skipped'|'failed'|null), failing_syncs: string[]}`.
- Accounts' "Bank balance" chart already uses `dataKey="bank_only_total"` (roadmap 1.6 is done); Task 4 only verifies it.

## Global Constraints

- Zero code comments (AGENTS.md); rationale goes in the PR description.
- Test-first; vitest specs next to the component or helper. Existing page specs `vi.mock('../api/queries')`; follow that pattern.
- `fmtMoney(value, currency)` for an instrument price, `fmtEur` for converted figures. An absent figure is `null` and renders `—`, never zero, never `—%`.
- No financial state by colour alone. `Card` is the one container language; check `components/ui.jsx` first.
- No backend change and no migration in this plan.
- Work in the worktree `../SaxoDash-review-2b-wt` on `fix/review-frontend-2b-impl`. Do not touch files outside `frontend/src` and this plan.
- Gate: `cd frontend && npx vitest run && npx eslint src && npm run build`, `cd backend && python manage.py test`, then 1440px + 390px screenshots of Analytics (3 tabs), Accounts, an account detail page and Spending.

## Review Focus

- Fewer than 30 days of history: every Risk/Return metric shows `—` with a "needs N more days" hint, never `—%`, `NaN` or `0.0`.
- A one-month history: Best/Worst/Positive months show `—`, not a month repeated as both best and worst.
- A tiny negative return rounding to zero: renders `0.0%`, never `-0.0%` or `+0.0%`.
- An account id that does not exist, and an account with 0 rows and with 1000+ rows (page and filter must not crash or render all rows).
- A Spending month with `total: null` and a partial current month; a period whose biggest category is `OTHER`.
- A bank with `last_sync_outcome: 'failed'` and `last_synced_at: null`: one badge, says why, never "connected" in green.

## Order and dependencies

Task 1 first (shared helpers). Tasks 2 and 3 use Task 1. Task 4 produces `lib/spendingDelta.js`, which Task 6 consumes. Tasks 5 independent. Task 7 last. Execute in numeric order.

---

### Task 1: Percent formatting and `lib/analytics.js` helpers

**Files:**
- Modify: `frontend/src/lib/format.js` (`fmtPct`)
- Modify: `frontend/src/lib/format.test.js`
- Create: `frontend/src/lib/analytics.js`
- Create: `frontend/src/lib/analytics.test.js`

**Interfaces:**
- Produces: `needsDaysNote(days: number|null|undefined): string|null`; `pctOrDash(value, decimals = 1): string`; `drawdownDomain(series: {dd:number}[], minSpan = 5): [number, number]`; `yearTicks(rows: {month:number}[]): number[]`.

- [ ] **Step 1: Write failing tests**

In `format.test.js` add:

```js
it('renders a value that rounds to zero without a sign', () => {
  expect(fmtPct(-0.04, { decimals: 1 })).toBe('0.0%')
  expect(fmtPct(0.04, { decimals: 1 })).toBe('0.0%')
  expect(fmtPct(-0.04, { decimals: 1, sign: false })).toBe('0.0%')
})
```

Create `analytics.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { drawdownDomain, needsDaysNote, pctOrDash, yearTicks } from './analytics'

describe('needsDaysNote', () => {
  it('is null when nothing is missing or unknown', () => {
    expect(needsDaysNote(0)).toBeNull()
    expect(needsDaysNote(null)).toBeNull()
    expect(needsDaysNote(undefined)).toBeNull()
  })
  it('pluralises', () => {
    expect(needsDaysNote(1)).toBe('needs 1 more day')
    expect(needsDaysNote(23)).toBe('needs 23 more days')
  })
})

describe('pctOrDash', () => {
  it('never renders a bare unit', () => {
    expect(pctOrDash(null)).toBe('—')
    expect(pctOrDash(12.34)).toBe('12.3%')
    expect(pctOrDash(12.34, 0)).toBe('12%')
  })
})

describe('drawdownDomain', () => {
  it('keeps a minimum span for a flat series', () => {
    expect(drawdownDomain([{ dd: 0 }, { dd: 0 }])).toEqual([-5, 0])
  })
  it('floors a deep drawdown to a whole number', () => {
    expect(drawdownDomain([{ dd: -1 }, { dd: -23.4 }])).toEqual([-24, 0])
  })
  it('survives an empty series', () => {
    expect(drawdownDomain([])).toEqual([-5, 0])
  })
})

describe('yearTicks', () => {
  it('keeps one tick per whole year', () => {
    expect(yearTicks([{ month: 0 }, { month: 6 }, { month: 12 }, { month: 24 }])).toEqual([0, 12, 24])
  })
  it('is empty with no rows', () => {
    expect(yearTicks([])).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run src/lib/format.test.js src/lib/analytics.test.js`
Expected: FAIL (`-0.0%` mismatch; module `./analytics` missing).

- [ ] **Step 3: Implement**

`fmtPct` in `format.js`:

```js
export function fmtPct(value, { sign = true, decimals = 2 } = {}) {
    if (value == null || Number.isNaN(Number(value))) return UNKNOWN
    const n = Number(value)
    const text = n.toFixed(decimals)
    if (Number(text) === 0) return `${(0).toFixed(decimals)}%`
    const prefix = n < 0 ? '' : sign ? '+' : ''
    return `${prefix}${text}%`
}
```

`analytics.js`:

```js
import { UNKNOWN, fmtNum } from './format'

export function needsDaysNote(days) {
  if (days == null || days <= 0) return null
  return days === 1 ? 'needs 1 more day' : `needs ${days} more days`
}

export function pctOrDash(value, decimals = 1) {
  return value == null ? UNKNOWN : `${fmtNum(value, decimals)}%`
}

export function drawdownDomain(series, minSpan = 5) {
  const lowest = series.reduce((low, point) => Math.min(low, point.dd), 0)
  return [Math.floor(Math.min(lowest, -minSpan)), 0]
}

export function yearTicks(rows) {
  return rows.map((row) => row.month).filter((month) => month % 12 === 0)
}
```

- [ ] **Step 4: Run to verify pass, plus every spec that renders a percent**

Run: `cd frontend && npx vitest run`
Expected: PASS. If an existing spec asserted `+0.00%`/`+0.0%` for a zero value, update it to the unsigned zero (the new rule) and say so in the report.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/format.js frontend/src/lib/format.test.js frontend/src/lib/analytics.js frontend/src/lib/analytics.test.js
git commit -m "feat(analytics): zero percent is unsigned, helpers for needs-days, drawdown span and year ticks"
```

---

### Task 2: Analytics page — null-safe Risk tab and header strip (roadmap 2.4)

**Files:**
- Modify: `frontend/src/pages/Analytics.jsx`
- Modify: `frontend/src/pages/Analytics.test.jsx`

**Interfaces:**
- Consumes: `needsDaysNote`, `pctOrDash` from `../lib/analytics`.

Behaviour:
1. Header `StatStrip`: `Avg. return`, `Volatility`, `Sharpe`, `Max drawdown` render `—` (via `pctOrDash` / `fmtNum`) when `null`; the "Avg. return" note becomes the needs-days note when the value is `null` and `needs_days.expected_return > 0`. The Sharpe badge is omitted when `sharpe` is `null`.
2. Risk tab tiles: `Volatility`, `Sharpe`, `Sortino`, `Positive months`, `Max drawdown`, `Current drawdown` use `pctOrDash`/`fmtNum`; a `null` metric's tile `hint` is `needsDaysNote(data.needs_days[metric])`. `Best/Worst/Positive months` hint is `needsDaysNote(data.needs_days.monthly_stats)` when their value is `null`.
3. Benchmark tiles (`Beta`, `Tracking error`, `Information ratio`, `Jensen alpha`) show `—` when `bench.has_data` is false **or** the metric is `null`; hint = `bench.reason` if no data, else `needsDaysNote(bench.needs_days[metric])`.
4. `monthLabel(null)` stays `—`; a month tile shows its month hint only when it has a value.
5. The "Not enough history yet" placeholder text becomes `Not enough history yet — risk metrics need at least two days of portfolio value (${data?.history_days ?? 0} so far).`

- [ ] **Step 1: Write failing tests** in `Analytics.test.jsx`, following the file's existing mock setup. Add a `shortHistory` fixture: `has_data: true`, `history_days: 8`, `data_quality: 'low'`, `sample_size: 8`, `volatility: null`, `sharpe: null`, `sortino: null`, `expected_return: null`, `max_drawdown: -1.2`, `current_drawdown: -0.4`, `positive_months_pct: null`, `best_month: null`, `worst_month: null`, `needs_days: {expected_return: 357, volatility: 22, sharpe: 357, sortino: 357, monthly_stats: 23}`, `benchmark: {has_data: true, name: 'World', beta: null, tracking_error: null, information_ratio: null, jensen_alpha: null, needs_days: {tracking_error: 22, beta: 82, information_ratio: 357, jensen_alpha: 357}}`, `drawdown_series: []`, `monthly_returns: []`, `risk_free_annual: 0.03`, `available_benchmarks: [{key:'world', name:'World'}]`. Tests:

```js
it('shows dashes and a needs-days hint instead of a bare unit when history is short', async () => {
  mockRisk(shortHistory)
  renderWithProviders(<Analytics />)
  await userEvent.click(screen.getByRole('button', { name: 'Risk' }))
  expect(screen.queryByText('—%')).not.toBeInTheDocument()
  expect(screen.getAllByText('needs 22 more days').length).toBeGreaterThan(0)
  expect(screen.getByText('needs 23 more days')).toBeInTheDocument()
})

it('shows no Sharpe badge and a dash for average return when they are null', () => {
  mockRisk(shortHistory)
  renderWithProviders(<Analytics />)
  expect(screen.queryByText(/Sharpe —/)).not.toBeInTheDocument()
  expect(screen.getByText('needs 357 more days')).toBeInTheDocument()
})
```

Reuse whatever `mockRisk`/`renderWithProviders` helper the file already has; if it has none, mock `usePerformance`, `usePortfolioSummary`, `usePositions`, `useRiskMetrics` with `vi.mocked(...).mockReturnValue`.

- [ ] **Step 2: Run** `cd frontend && npx vitest run src/pages/Analytics.test.jsx` — Expected: FAIL.
- [ ] **Step 3: Implement** the five behaviours in `Analytics.jsx`. `MetricTile` already takes `hint`.
- [ ] **Step 4: Run** the same command plus `npx eslint src/pages/Analytics.jsx` — Expected: PASS, clean.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Analytics.jsx frontend/src/pages/Analytics.test.jsx
git commit -m "fix(analytics): missing metrics render as dashes with a needs-days note"
```

---

### Task 3: Analytics tab components (roadmap 2.4)

**Files:**
- Modify: `frontend/src/components/analytics/ReturnsTable.jsx`, `ReturnsTable.test.jsx`
- Modify: `frontend/src/components/analytics/CalendarYears.jsx` (create `CalendarYears.test.jsx`)
- Modify: `frontend/src/components/analytics/DrawdownChart.jsx` (create `DrawdownChart.test.jsx`)
- Modify: `frontend/src/components/analytics/Projection.jsx`, `Projection.test.jsx`

**Interfaces:**
- Consumes: `needsDaysNote`, `drawdownDomain`, `yearTicks` from `../../lib/analytics`.

Behaviour:
1. `ReturnsTable`: when `portfolio_pct` is `null`, the Portfolio cell shows `—` and, beneath it in `text-[var(--fig-2xs)] text-zinc-600`, `needsDaysNote(row.needs_days)` when that is non-null. Alpha stays `—` unless both sides exist (already true). A column header note is not needed.
2. `CalendarYears`: when `years` is empty, render the Card with `EmptyState` (from `../ui`, `title="No full calendar year yet"`, `hint="A year appears once it has at least two data points."`) instead of the chart. A year with `partial: true` gets its x tick label as `${year}*` via the `XAxis` `tickFormatter` looking the year up in `years`, and the subtitle gains `· * year to date` only when a partial year is present.
3. `DrawdownChart`: `YAxis` gets `domain={drawdownDomain(series)}`; an empty `series` shows `EmptyState title="No drawdown yet"` instead of an empty chart.
4. `Projection`: `XAxis` gets `ticks={yearTicks(rows)}` and `interval={0}`; tick formatter unchanged (`${Math.round(m / 12)}y`).

- [ ] **Step 1: Write failing tests**

```js
it('explains why a period is blank', () => {
  render(<ReturnsTable periods={[{ label: '1 year', portfolio_pct: null, benchmark_pct: null, alpha_pct: null, annualised: false, needs_days: 340 }]} benchmarkName="World" />)
  expect(screen.getByText('needs 340 more days')).toBeInTheDocument()
})
```

```js
it('shows an empty state instead of an empty chart when there are no years', () => {
  render(<CalendarYears years={[]} benchmarkName="World" />)
  expect(screen.getByText('No full calendar year yet')).toBeInTheDocument()
})
```

```js
it('shows an empty state for an empty drawdown series', () => {
  render(<DrawdownChart series={[]} maxDrawdown={null} />)
  expect(screen.getByText('No drawdown yet')).toBeInTheDocument()
})
```

For Projection add a test that renders with `start: 10000, expectedReturnPct: 6, volatilityPct: 12` and asserts the component still renders its title (tick behaviour is covered by `yearTicks` in Task 1; jsdom has no layout for Recharts axes).

- [ ] **Step 2: Run** `cd frontend && npx vitest run src/components/analytics` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command and `npx eslint src/components/analytics` — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/analytics
git commit -m "fix(analytics): blank periods say why, empty chart states, drawdown span and yearly projection ticks"
```

---

### Task 4: Accounts — one sync badge per bank and honest spending delta (roadmap 2.5)

**Files:**
- Create: `frontend/src/lib/bankSync.js`, `frontend/src/lib/bankSync.test.js`
- Create: `frontend/src/lib/spendingDelta.js`, `frontend/src/lib/spendingDelta.test.js`
- Modify: `frontend/src/components/EnableBankingConnectionStatus.jsx`, `EnableBankingConnectionStatus.test.jsx`
- Modify: `frontend/src/pages/Accounts.jsx`, `Accounts.test.jsx`

**Interfaces:**
- Produces: `bankSyncBadge(state): {tone: 'emerald'|'amber'|'red', text: string, title: string}` for a connected, non-reauth, usable bank (`text` is the status word only; the component prefixes the bank label);
  `spendingDelta({total, previousTotal, comparisonLabel}): {pct: number|null, direction: 'up'|'down'|'flat'|null, badge: string|undefined, tone: 'red'|'emerald'|'zinc', note: string|undefined}`.

Rules:
- `bankSyncBadge`: outcome `ok` → emerald, `text: 'connected'`, title `Last synced <last_synced_at>` or `Never synced`. Outcome `skipped` → amber, `text: 'sync skipped'`, title `The last sync could not run, so this data may be stale`. `failed` → amber, `text: 'sync failed'`, title `The last sync failed, so this data may be stale`. Any non-`ok` title also appends ` · last good sync <last_synced_at>` or ` · never synced`. `last_sync_outcome: null` is treated like `ok` with no sync yet → emerald, `connected`, title `Never synced`. When `failing_syncs` is non-empty the title ends with ` (failing: <kinds joined by ", ">)`.
- `spendingDelta`: `previousTotal` falsy (null/0) → `{pct: null, direction: null, badge: undefined, tone: 'zinc', note: undefined}` (no division by zero, no note without a baseline). Else `pct = (total - previousTotal) / previousTotal * 100`; direction `up`/`down`, or `flat` when `Math.abs(pct) < 0.05`; badge `▲ x.xx%`/`▼ x.xx%` (via `fmtPct(Math.abs(pct), {sign: false})`), `flat` → badge `0.00%`; tone red for up, emerald for down, zinc for flat; note `vs ${fmtEur(previousTotal)} ${comparisonLabel ?? 'last period'}`.

- [ ] **Step 1: Write failing tests**

```js
describe('bankSyncBadge', () => {
  it('is green only for an ok sync', () => {
    expect(bankSyncBadge({ last_sync_outcome: 'ok', last_synced_at: '2026-10-05T08:00:00Z', failing_syncs: [] })).toMatchObject({ tone: 'emerald', text: 'connected' })
  })
  it('says why when a sync failed and there has never been a good one', () => {
    const badge = bankSyncBadge({ last_sync_outcome: 'failed', last_synced_at: null, failing_syncs: ['balances'] })
    expect(badge).toMatchObject({ tone: 'amber', text: 'sync failed' })
    expect(badge.title).toContain('never synced')
    expect(badge.title).toContain('failing: balances')
  })
  it('treats a bank that has not synced yet as connected', () => {
    expect(bankSyncBadge({ last_sync_outcome: null, last_synced_at: null, failing_syncs: [] })).toMatchObject({ tone: 'emerald', title: 'Never synced' })
  })
})

describe('spendingDelta', () => {
  it('has no delta without a baseline', () => {
    expect(spendingDelta({ total: 100, previousTotal: null })).toMatchObject({ pct: null, badge: undefined, note: undefined })
    expect(spendingDelta({ total: 100, previousTotal: 0 }).pct).toBeNull()
  })
  it('names what it is compared with', () => {
    const d = spendingDelta({ total: 150, previousTotal: 100, comparisonLabel: 'same days last month' })
    expect(d).toMatchObject({ direction: 'up', tone: 'red', badge: '▲ 50.00%' })
    expect(d.note).toBe('vs €100.00 same days last month')
  })
  it('is not red or green for no change', () => {
    expect(spendingDelta({ total: 100, previousTotal: 100 })).toMatchObject({ direction: 'flat', tone: 'zinc', badge: '0.00%' })
  })
})
```

`EnableBankingConnectionStatus.test.jsx`: a connected bank with `last_sync_outcome: 'failed'` renders exactly one badge containing `KBC sync failed` and no `KBC connected`. `Accounts.test.jsx`: with `summary.comparison_label = 'same days last month'` the strip shows `vs €187.50 same days last month`; with no `previous_period` no `vs` text; the Bank balance chart is rendered with `dataKey="bank_only_total"` (assert via the existing `HistoryAreaChart` mock/props if the file mocks it, otherwise skip this assertion and state so in the report).

- [ ] **Step 2: Run** `cd frontend && npx vitest run src/lib/bankSync.test.js src/lib/spendingDelta.test.js src/components/EnableBankingConnectionStatus.test.jsx src/pages/Accounts.test.jsx` — Expected: FAIL.
- [ ] **Step 3: Implement.** In `OneBank`'s final branch replace the two badges with one `Badge tone={badge.tone}` wrapping `<span title={badge.title}>{label} {badge.text}</span>`. In `Accounts.jsx` use `spendingDelta` for the "This month's spending" `StatRow` (`badge`, `badgeTone`, `note`) and pass `comparisonLabel={summary?.comparison_label}`.
- [ ] **Step 4: Run** the same command plus `npx eslint` on the touched files — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/bankSync.js frontend/src/lib/bankSync.test.js frontend/src/lib/spendingDelta.js frontend/src/lib/spendingDelta.test.js frontend/src/components/EnableBankingConnectionStatus.jsx frontend/src/components/EnableBankingConnectionStatus.test.jsx frontend/src/pages/Accounts.jsx frontend/src/pages/Accounts.test.jsx
git commit -m "fix(accounts): one sync badge per bank with reason and last sync, spending delta names its baseline"
```

---

### Task 5: Account detail — not-found, search, category filter, paging, signed amounts (roadmap 2.6)

**Files:**
- Create: `frontend/src/lib/accountTransactions.js`, `frontend/src/lib/accountTransactions.test.js`
- Modify: `frontend/src/pages/AccountTransactions.jsx`, `AccountTransactions.test.jsx`

**Interfaces:**
- Produces: `filterTransactions(rows, {search, category}): rows` (case-insensitive substring over `counterparty_name` and `description`; `category` `'ALL'` or an `effective_category`; either filter empty = no-op); `paginate(rows, page, pageSize = 25): {rows, page, pageCount, total}` (page clamped to `[1, pageCount]`, `pageCount` at least 1).
- Consumes: `fmtEur(value, {sign: true})`, `CATEGORY_LABELS`, `Input`, `Select`, `EmptyState`, `Button` from `../components/ui`.

Behaviour:
1. Not found: once `useBankAccounts` has data and no account has `String(id) === accountId`, render `PageHeader title="Account not found"` with the Back link and an `EmptyState title="No account with this id"` — and do not render the table or fetch-driven stat strip.
2. Toolbar above the table: search `Input` (`aria-label="Search transactions"`), category `Select` (`aria-label="Filter by category"`, `All categories` plus the categories present in the rows, labelled via `CATEGORY_LABELS`). Changing either resets to page 1.
3. Table shows `description` under the counterparty name in `text-[var(--fig-2xs)] text-zinc-500` when it is non-empty and differs from the name; amount via `fmtEur(tx.amount, {sign: true})`, class `text-emerald-400` when positive and `text-zinc-100` when negative (the sign carries the meaning, not the colour).
4. Pagination footer: `Showing a–b of N`, Previous/Next `Button`s with `aria-label="Previous page"` / `"Next page"`, disabled at the ends; hidden when `pageCount === 1`.
5. Empty states: no rows at all → `No transactions yet.`; filters match nothing → `No transactions match your filters.` with a `Clear filters` button that resets both.

- [ ] **Step 1: Write failing tests**

```js
describe('filterTransactions', () => {
  const rows = [
    { id: 1, counterparty_name: 'Colruyt', description: 'Groceries Ghent', effective_category: 'GROCERIES' },
    { id: 2, counterparty_name: 'NMBS', description: '', effective_category: 'TRANSPORT' },
  ]
  it('matches name or description case-insensitively', () => {
    expect(filterTransactions(rows, { search: 'ghent', category: 'ALL' }).map((r) => r.id)).toEqual([1])
    expect(filterTransactions(rows, { search: 'nmbs', category: 'ALL' }).map((r) => r.id)).toEqual([2])
  })
  it('filters by category and combines with search', () => {
    expect(filterTransactions(rows, { search: '', category: 'TRANSPORT' }).map((r) => r.id)).toEqual([2])
    expect(filterTransactions(rows, { search: 'colruyt', category: 'TRANSPORT' })).toEqual([])
  })
  it('tolerates a null description', () => {
    expect(filterTransactions([{ id: 3, counterparty_name: 'X', description: null, effective_category: 'OTHER' }], { search: 'x', category: 'ALL' })).toHaveLength(1)
  })
})

describe('paginate', () => {
  const rows = Array.from({ length: 60 }, (_, i) => ({ id: i }))
  it('slices a page and counts pages', () => {
    expect(paginate(rows, 2)).toMatchObject({ page: 2, pageCount: 3, total: 60 })
    expect(paginate(rows, 2).rows[0].id).toBe(25)
  })
  it('clamps an out-of-range page', () => {
    expect(paginate(rows, 99).page).toBe(3)
    expect(paginate(rows, 0).page).toBe(1)
  })
  it('has one empty page for no rows', () => {
    expect(paginate([], 1)).toMatchObject({ rows: [], page: 1, pageCount: 1, total: 0 })
  })
})
```

Page spec additions (use the file's existing `renderAt` and mocks): unknown account id with `useBankAccounts` returning `[KBC]` and id `99` → `Account not found` shown, no table; typing in the search box narrows rows; a credit renders `+€…` and a debit `-€…`; 30 rows show `Showing 1–25 of 30` and Next advances to `26–30`; a filter with no match shows `No transactions match your filters.`.

- [ ] **Step 2: Run** `cd frontend && npx vitest run src/lib/accountTransactions.test.js src/pages/AccountTransactions.test.jsx` — Expected: FAIL.
- [ ] **Step 3: Implement.** Keep the existing `CategoryCell`. State: `search`, `category`, `page` via `useState`; compute `filtered` then `paginate`. Add `aria-label="Category for <counterparty>"` to each row's select.
- [ ] **Step 4: Run** the same command plus `npx eslint src/pages/AccountTransactions.jsx src/lib/accountTransactions.js` — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/accountTransactions.js frontend/src/lib/accountTransactions.test.js frontend/src/pages/AccountTransactions.jsx frontend/src/pages/AccountTransactions.test.jsx
git commit -m "feat(accounts): account detail gets not-found state, search, category filter, paging and signed amounts"
```

---

### Task 6: Spending — month labels, partial marker, honest top category, folded donut slices (roadmap 2.7)

**Files:**
- Create: `frontend/src/lib/spending.js`, `frontend/src/lib/spending.test.js`
- Modify: `frontend/src/components/SpendingTrendChart.jsx`, `SpendingTrendChart.test.jsx`
- Modify: `frontend/src/components/SpendingCategoryChart.jsx`, `SpendingCategoryChart.test.jsx`
- Modify: `frontend/src/pages/Spending.jsx` (create `Spending.test.jsx` if absent)

**Interfaces:**
- Consumes: `spendingDelta` from `../lib/spendingDelta` (Task 4).
- Produces: `monthLabel('2026-06'): "Jun '26"` (invalid or empty input returns the input unchanged); `topCategory(categories): {category, amount}|undefined` — highest `Number(amount)` excluding `category === 'OTHER'`, `undefined` when nothing else remains; `foldSmallSlices(items: {name,value,color}[], {threshold = 0.03, otherName = 'Other', otherColor = OTHER_SLICE}): items` — slices below `threshold` of the total are merged into one `Other` slice (summed with any existing `Other`), appended last, omitted when empty, and nothing folds if the total is 0; `trendBars(rows): {month, label, total: number|null, partial: boolean}[]` (`label` from `monthLabel`, `total` converted with `Number` or kept `null`).

Behaviour:
1. `SpendingTrendChart`: x axis uses `label`; a `partial` bar is drawn with `fillOpacity={0.45}` via `Cell`, and the tooltip label reads `Jun '26 (so far)` for it; the card subtitle gains `· current month to date` when the last bar is partial; a `null` total bar is not drawn and its tooltip shows `No data`.
2. `SpendingCategoryChart`: `items` go through `foldSmallSlices` before the donut.
3. `Spending.jsx`: `Top category` uses `topCategory`; the Total row's delta uses `spendingDelta({total, previousTotal, comparisonLabel: summary?.comparison_label})` so `note` reads `vs €… <label>`; the Transfers `StatRow` label becomes `Transfers` with an `InfoTip` (from `../components/ui`) reading `Money moved between your own accounts. It is left out of the totals above.` — check `StatRow`'s props first; if `label` accepts only a string, render the InfoTip in `note` instead.

- [ ] **Step 1: Write failing tests**

```js
describe('monthLabel', () => {
  it('formats a year-month', () => {
    expect(monthLabel('2026-06')).toBe("Jun '26")
    expect(monthLabel('2026-12')).toBe("Dec '26")
  })
  it('passes through what it cannot parse', () => {
    expect(monthLabel('')).toBe('')
    expect(monthLabel(undefined)).toBeUndefined()
  })
})

describe('topCategory', () => {
  it('never crowns Other', () => {
    const cats = [{ category: 'OTHER', amount: '900' }, { category: 'GROCERIES', amount: '120' }, { category: 'DINING', amount: '80' }]
    expect(topCategory(cats).category).toBe('GROCERIES')
  })
  it('is undefined when only Other remains or nothing exists', () => {
    expect(topCategory([{ category: 'OTHER', amount: '5' }])).toBeUndefined()
    expect(topCategory([])).toBeUndefined()
    expect(topCategory(undefined)).toBeUndefined()
  })
})

describe('foldSmallSlices', () => {
  const item = (name, value) => ({ name, value, color: '#fff' })
  it('merges slices under the threshold into one Other, last', () => {
    const out = foldSmallSlices([item('A', 90), item('B', 8), item('C', 1), item('D', 1)])
    expect(out.map((i) => i.name)).toEqual(['A', 'B', 'Other'])
    expect(out[2].value).toBe(2)
  })
  it('adds to an existing Other instead of duplicating it', () => {
    const out = foldSmallSlices([item('A', 90), item('Other', 8), item('C', 2)])
    expect(out.filter((i) => i.name === 'Other')).toHaveLength(1)
    expect(out.at(-1).value).toBe(10)
  })
  it('leaves a zero total alone', () => {
    expect(foldSmallSlices([item('A', 0)])).toHaveLength(1)
  })
})

describe('trendBars', () => {
  it('labels months and keeps null totals null', () => {
    expect(trendBars([{ month: '2026-05', total: null, partial: false }, { month: '2026-06', total: '120.00', partial: true }]))
      .toEqual([
        { month: '2026-05', label: "May '26", total: null, partial: false },
        { month: '2026-06', label: "Jun '26", total: 120, partial: true },
      ])
  })
})
```

Component/page specs: trend subtitle contains `current month to date` when the last row is partial; `Spending` shows `Groceries` (not `Other`) as top category for the first fixture above; the Total row note reads `vs €187.50 same days last month`; the Transfers explanation is reachable by its InfoTip.

- [ ] **Step 2: Run** `cd frontend && npx vitest run src/lib/spending.test.js src/components/SpendingTrendChart.test.jsx src/components/SpendingCategoryChart.test.jsx src/pages/Spending.test.jsx` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command plus `npx eslint` on touched files — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/spending.js frontend/src/lib/spending.test.js frontend/src/components/SpendingTrendChart.jsx frontend/src/components/SpendingTrendChart.test.jsx frontend/src/components/SpendingCategoryChart.jsx frontend/src/components/SpendingCategoryChart.test.jsx frontend/src/pages/Spending.jsx frontend/src/pages/Spending.test.jsx
git commit -m "fix(spending): month labels, partial-month marker, Other never top category, small slices folded"
```

---

### Task 7: Gate (controller runs this, no implementer)

- [ ] `cd frontend && npx vitest run && npx eslint src && npm run build`
- [ ] `cd backend && python manage.py test`
- [ ] Screenshot pass at 1440px and 390px of Analytics (Performance, Risk, Projection), Accounts, an account detail page, an unknown account id, and Spending, using the `saxodash-design-system` skill's harness against a COPY of `db.sqlite3` on ports 8100/5273, never the real DB.
- [ ] Record findings that are mobile-layout only for Phase 3; fix anything else.
