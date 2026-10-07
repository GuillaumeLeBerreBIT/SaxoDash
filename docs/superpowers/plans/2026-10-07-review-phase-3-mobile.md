# Review Phase 3 — Mobile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every route usable at 390px: no horizontal page scroll, a real mobile navigation, tables that keep their key figures visible, and a repeatable overflow check (roadmap 3.1-3.6).

**Architecture:** Mobile behaviour is CSS-first (Tailwind `md:` breakpoint = 768px), with no JS breakpoint state. The shell hides the sidebar rail below 768px and shows a top bar plus a bottom tab bar with a "More" sheet. One shared priority-column mechanism (`hideBelow` on `Th`/`Td`) serves every data table. Per-page fixes wrap or shrink what overflows. A Playwright script measures overflow on every route and is the phase gate.

**Tech Stack:** React 19, Tailwind (v4, `md:` = 768px), React Router, vitest + Testing Library, Playwright (not a project dependency; resolved from an existing `_npx` install).

**Spec:** `docs/superpowers/plans/2026-10-04-app-review-roadmap.md` Phase 3 rows 3.1-3.6. Phase 2 (A, B, C) is merged into `main`; this branch is cut from `main` at `b1ea53e`.

## Baseline (measured 2026-10-07 at 390px, worktree on ports 8100/5273)

`documentElement.scrollWidth - innerWidth` per route. `<main>` sits 64px from the left on every shell route (collapsed sidebar rail).

| Route | Overflow px | Culprit |
|---|---|---|
| `/` | 414 | recent-transactions table (804px wide) |
| `/portfolio` | 39 | range/period pill row |
| `/analytics` | 116 | benchmark selector in `PageHeader` right slot, returns table (490px) |
| `/research` | 195 | tab buttons row |
| `/earnings` | 175 | InfoTip/header controls at right edge |
| `/accounts` | 34 | connection badges in header, pill row |
| `/spending` | 81 | period selector button |
| `/analytics` Projection tab | 368 | 4-column tile row, control rows |
| `/research/chart`, `/discover`, `/discover/:key`, `/investors`, `/investors/:slug`, `/transactions`, `/accounts/:id` | 0 | (`/research/chart` main left is 48) |

## Global Constraints

- Zero code comments (AGENTS.md); rationale goes in the PR description.
- Test-first; vitest specs next to the component or helper. jsdom has no layout and does not evaluate media queries, so specs assert classes, roles, labels and behaviour, not geometry. Geometry is verified by the overflow script (Task 7) and screenshots.
- Breakpoint rule: mobile is below Tailwind `md` (768px). Desktop (>= 768px) must render exactly as it does today; every mobile change is expressed as a base class overridden by an `md:` class, or `md:hidden` / `hidden md:*`.
- `Card` is the one container language; check `components/ui.jsx` first; one green, one red from `lib/charts.js`; no financial state by colour alone.
- Touch targets: interactive controls added or reshaped in this phase are at least 40px tall on mobile (Phase 4 does the rest of the app).
- No backend change, no migration.
- Work only in the worktree `../SaxoDash-review-3-wt` on `fix/review-mobile`. `frontend/node_modules` is symlinked; `backend/.venv`, `backend/.env` and a COPY of `db.sqlite3` are in place for screenshots only (all gitignored; never commit them).
- Gate: `cd frontend && npx vitest run && npx eslint src && npm run build`, then the overflow script on every route at 390px (all `0`), then 1440px + 390px screenshots of every touched page.

## Review Focus

- A route with its own header controls (Research, Earnings, Analytics) at 390px: the controls wrap or scroll inside their own container; the page never scrolls sideways.
- The "More" sheet: reachable by keyboard, closes on route change, Escape and backdrop click; the active route inside More marks the More tab active.
- A desktop viewport (>= 768px): no bottom bar, no top bar, sidebar rail and margins unchanged.
- A table with all priority columns hidden by mistake: row identity (name/date) and the headline figure (value/total/amount) must always remain at 390px.
- Safe-area inset on iOS: the bottom bar does not sit under the home indicator and page content is not hidden behind the bar.

## Order and dependencies

Task 1 (shell) first, since it changes `<main>` width. Task 2 (header wrapping) next. Task 3 (table primitive) before Task 4 (tables). Tasks 5 and 6 are independent of 3-4 and of each other but run after them to keep reviews focused. Task 7 (overflow script) then Task 8 (status dot). Task 9 is the gate (controller).

---

### Task 1: Mobile shell — top bar, bottom tab bar, More sheet, no rail margin (roadmap 3.1)

**Files:**
- Create: `frontend/src/components/MobileNav.jsx`, `frontend/src/components/MobileNav.test.jsx`
- Create: `frontend/src/components/MobileTopBar.jsx`, `frontend/src/components/MobileTopBar.test.jsx`
- Modify: `frontend/src/lib/navigation.js` (add `MOBILE_PRIMARY` and `mobileOverflow` helper), `frontend/src/lib/navigation.test.js` (create if absent)
- Modify: `frontend/src/components/Layout.jsx`, `frontend/src/components/Sidebar.jsx`, and their specs if present (`Layout.test.jsx`, `Sidebar.test.jsx`)

**Interfaces:**
- Produces in `lib/navigation.js`:
  `export const MOBILE_PRIMARY = ['/', '/portfolio', '/research', '/spending']`
  `export function mobileOverflow(items = NAV_ITEMS) { return items.filter((item) => !MOBILE_PRIMARY.includes(item.to)) }`
- `MobileNav` props: `{ onOpenPalette }`. `MobileTopBar` props: `{ onOpenPalette }`.

Behaviour:
1. `Layout`: `<main>` stops using the inline `marginLeft`. Set `style={{ '--rail': `${collapsed ? 64 : 220}px` }}` and class `md:ml-[var(--rail)]` so below 768px there is no left margin. Content gutter becomes `clamp(16px, 4vw, 96px)` (16px floor), and the inner wrapper gets bottom padding `pb-24 md:pb-6` (and keep `2xl:py-8`) so the bottom bar never covers content. Render `<MobileTopBar>` and `<MobileNav>` inside the layout. Keep the existing `collapsed` auto-collapse behaviour for desktop.
2. `Sidebar`: add `hidden md:flex` to the `<aside>` root (it is currently `flex`); nothing else changes.
3. `MobileTopBar`: `md:hidden sticky top-0 z-20 h-12` bar with the SaxoDash logo mark + wordmark on the left and a search button (`aria-label="Search"`, calls `onOpenPalette`, at least 40px square) on the right. Same surface treatment as the sidebar (`border-b border-white/[0.06]`, dark background). Task 8 adds the status dot to its right cluster.
4. `MobileNav`: `<nav aria-label="Primary" className="md:hidden fixed inset-x-0 bottom-0 z-30 ...">` with a `pb-[env(safe-area-inset-bottom)]` safe-area allowance and 56px (`h-14`) content row. Four `NavLink`s built from `NAV_ITEMS` filtered by `MOBILE_PRIMARY` (in that order: Dashboard, Portfolio, Research, Spending), each with the lucide icon over a `--fig-2xs` label, active colour `text-blue-400` plus a 2px top indicator (not colour alone), min 44px touch target. A fifth `button` "More" (`aria-haspopup="dialog"`, `aria-expanded`) opens the sheet.
5. More sheet: a bottom sheet (`role="dialog"`, `aria-modal="true"`, `aria-label="More"`) listing `mobileOverflow()` items as `NavLink`s (icon + label, 48px rows), plus a "Search" row (calls `onOpenPalette`, closes the sheet), and the username with a Log out button (reuse `getUsername`/`logout` from `../api/client` and `useNavigate` like `Sidebar`). Closes on: Escape, backdrop click, and any navigation (route change). When the current route is one of the overflow routes the More tab shows the active treatment. Do not trap the app in a sheet on desktop (`md:hidden` on the whole component).
6. If `components/ui.jsx` `Modal` can be restyled without changing its desktop behaviour, you may reuse it; otherwise build the sheet in `MobileNav.jsx`. Do not alter `Modal` for existing callers.

- [ ] **Step 1: Write failing tests**

`navigation.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { MOBILE_PRIMARY, NAV_ITEMS, mobileOverflow } from './navigation'

describe('mobile navigation split', () => {
  it('keeps the four primary destinations in tab order', () => {
    expect(MOBILE_PRIMARY).toEqual(['/', '/portfolio', '/research', '/spending'])
  })
  it('puts every other destination in the overflow, each exactly once', () => {
    const overflow = mobileOverflow().map((item) => item.to)
    const primary = NAV_ITEMS.filter((item) => MOBILE_PRIMARY.includes(item.to)).map((item) => item.to)
    expect([...primary, ...overflow].sort()).toEqual(NAV_ITEMS.map((item) => item.to).sort())
    expect(overflow).not.toContain('/portfolio')
  })
})
```

`MobileNav.test.jsx` (use `renderWithProviders` from `../test/renderWithProviders`, which supplies the router): renders four primary links by accessible name (Dashboard, Portfolio, Research, Spending) inside `navigation` "Primary"; does NOT render Analytics etc. until More is opened; clicking "More" shows a `dialog` named "More" with Analytics, Discover, Earnings, Investors, Transactions, Accounts links; Escape closes it; clicking Accounts navigates and closes it; at route `/accounts` (use `renderWithProviders(ui, { route: '/accounts' })`) the More button reports the active state (assert via `aria-current="page"` on the More button or a documented `data-active`); "Search" row calls the `onOpenPalette` spy. `MobileTopBar.test.jsx`: the search button has accessible name "Search" and calls `onOpenPalette`; the root carries `md:hidden`. Layout spec (add or extend): the `<aside>` carries `hidden` and `md:flex`; `<main>` has class `md:ml-[var(--rail)]` and no inline `margin-left` style.

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run src/lib/navigation.test.js src/components/MobileNav.test.jsx src/components/MobileTopBar.test.jsx`
Expected: FAIL (modules and exports missing).

- [ ] **Step 3: Implement** the behaviours above.
- [ ] **Step 4: Run** the three specs plus `npx vitest run src/components/Sidebar.test.jsx src/components/Layout.test.jsx` (if they exist), `npx eslint` on touched files. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/navigation.js frontend/src/lib/navigation.test.js frontend/src/components
git commit -m "feat(shell): mobile top bar, bottom tab bar with More sheet, no rail margin below 768px"
```

---

### Task 2: `PageHeader` and `CardHeader` right slots wrap on small screens (roadmap 3.2)

**Files:**
- Modify: `frontend/src/components/ui.jsx` (`PageHeader`, `CardHeader`), `frontend/src/components/ui.test.jsx`

Behaviour:
1. `PageHeader`: outer row becomes `flex flex-wrap items-end justify-between gap-x-4 gap-y-3 mb-5 2xl:mb-6`; the title block gets `min-w-0`; the right slot is wrapped in `<div className="min-w-0 max-w-full">` so a wide control (pill row, selector, badge group) drops below the title instead of overflowing, and its own content can wrap or scroll. Desktop appearance is unchanged because the title and right slot fit one line.
2. `CardHeader`: same treatment (`flex-wrap`, `min-w-0` on the text block, `max-w-full` wrapper on `right`), keeping `gap-3 2xl:gap-4`.
3. Do not touch the heading elements or text classes.

- [ ] **Step 1: Write failing tests** in `ui.test.jsx`:

```js
it('PageHeader lets a wide right slot wrap below the title', () => {
  const { container } = render(<PageHeader title="Analytics" subtitle="s" right={<button>Right</button>} />)
  expect(container.firstChild).toHaveClass('flex-wrap')
  expect(screen.getByRole('button', { name: 'Right' }).parentElement).toHaveClass('max-w-full')
  expect(screen.getByRole('heading', { level: 1, name: 'Analytics' })).toBeInTheDocument()
})

it('CardHeader lets its right slot wrap and keeps the h2 heading', () => {
  const { container } = render(<CardHeader title="Chart" right={<span>Tools</span>} />)
  expect(container.firstChild).toHaveClass('flex-wrap')
  expect(screen.getByRole('heading', { level: 2, name: 'Chart' })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run** `cd frontend && npx vitest run src/components/ui.test.jsx` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command and the full `npx vitest run` (headers are used everywhere) and `npx eslint src/components/ui.jsx` — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui.jsx frontend/src/components/ui.test.jsx
git commit -m "fix(ui): page and card header right slots wrap below the title on small screens"
```

---

### Task 3: One shared priority-column mechanism for tables (roadmap 3.3, primitive)

**Files:**
- Modify: `frontend/src/components/ui.jsx` (`Th`, `Td`), `frontend/src/components/ui.test.jsx`

**Interfaces:**
- Produces: `Th` and `Td` accept `hideBelow` (`'md'` or `undefined`). `hideBelow="md"` adds `hidden md:table-cell` to the cell. Nothing else about `Th`/`Td` changes.
- Callers pass the string literal `'md'`; there is no exported constant.

Design note for the PR description: a priority-column table keeps identity and the headline figure at 390px and reveals the rest from 768px, with no second DOM per row, no JS breakpoint and no horizontal scrolling for the common case. Tables that are intentionally wide (investor holdings, discover shelves) keep scrolling inside `overflow-x-auto` and are out of scope.

- [ ] **Step 1: Write failing tests**:

```js
describe('Th / Td hideBelow', () => {
  it('hides a cell below md and shows it from md up', () => {
    render(
      <table><thead><tr><Th hideBelow="md">Qty</Th></tr></thead><tbody><tr><Td hideBelow="md">10</Td></tr></tbody></table>,
    )
    expect(screen.getByText('Qty')).toHaveClass('hidden', 'md:table-cell')
    expect(screen.getByText('10')).toHaveClass('hidden', 'md:table-cell')
  })
  it('leaves a cell without hideBelow visible', () => {
    render(<table><tbody><tr><Td>Name</Td></tr></tbody></table>)
    expect(screen.getByText('Name')).not.toHaveClass('hidden')
  })
})
```

- [ ] **Step 2: Run** `cd frontend && npx vitest run src/components/ui.test.jsx` — Expected: FAIL.
- [ ] **Step 3: Implement** (`const hideClass = hideBelow === 'md' ? 'hidden md:table-cell' : ''`, appended to each cell's class list).
- [ ] **Step 4: Run** the same command plus `npx eslint src/components/ui.jsx` — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui.jsx frontend/src/components/ui.test.jsx
git commit -m "feat(ui): Th and Td can hide below md so tables keep their priority columns on mobile"
```

---

### Task 4: Apply priority columns to the data tables (roadmap 3.3, application)

**Files:**
- Modify: `frontend/src/pages/Dashboard.jsx` (recent transactions table, and the positions/other table if it overflows), `frontend/src/pages/Portfolio.jsx` (Holdings), `frontend/src/pages/Transactions.jsx`, `frontend/src/pages/AccountTransactions.jsx`, `frontend/src/components/analytics/ReturnsTable.jsx`
- Modify: the matching `*.test.jsx` specs

**Interfaces:**
- Consumes: `Th`/`Td` `hideBelow="md"` from Task 3.

Columns kept visible below 768px (everything else gets `hideBelow="md"` on BOTH its `Th` and every `Td` in that column):

| Table | Keep at 390px | Hide below md |
|---|---|---|
| Dashboard recent transactions | Date, Name, Total | Type, Qty, Price |
| Portfolio Holdings | Name, Value, P&L | Qty, Avg, Price, day-change column, Weight |
| Transactions | Date, Instrument, Total | Type, Ticker, Qty, Price, Account |
| Account detail | Date, Description, Amount | Category (the select stays on desktop) |
| Analytics ReturnsTable | Period, Portfolio, Alpha | the benchmark column |

Additional rules:
- Hiding Type on Dashboard/Transactions must not lose buy vs sell: the Total/amount already carries a sign (Phase 2A). Add a visually small subline to the Name/Instrument cell on mobile only (`<span className="md:hidden ...">` showing the type label) so the kind of transaction stays readable. On Account detail show the category as a mobile-only subline under the description (`md:hidden`).
- ReturnsTable: also reduce horizontal padding on mobile (`px-3 md:px-5` for edge cells, `px-2 md:px-3` for interior) and drop `whitespace-nowrap` assumptions that force width.
- Table wrappers keep `overflow-x-auto` as a safety net, but at 390px the tables must fit without scrolling.
- Do not change row identity, keys, sort or any desktop behaviour.

- [ ] **Step 1: Write failing tests**, one per table, in the existing page specs: render with representative data and assert (a) the kept headers have no `hidden` class; (b) each hidden header and one of its body cells carry `hidden` and `md:table-cell`; (c) for Dashboard/Transactions the mobile-only type subline exists (`.md\:hidden` element containing the type text, found via `getAllByText`/`closest`) so a transaction's type is still present in the DOM for small screens; (d) Account detail shows the category as a `md:hidden` subline.

```js
it('keeps date, name and total visible below md and hides the rest', () => {
  renderWithProviders(<Dashboard />)
  for (const name of ['Date', 'Name', 'Total']) {
    expect(screen.getByRole('columnheader', { name })).not.toHaveClass('hidden')
  }
  for (const name of ['Type', 'Qty', 'Price']) {
    expect(screen.getByRole('columnheader', { name })).toHaveClass('hidden', 'md:table-cell')
  }
})
```

Adapt the harness to each spec's existing mocks. If a header's accessible name collides with another table on the page, scope with `within(table)`.

- [ ] **Step 2: Run** `cd frontend && npx vitest run src/pages/Dashboard.test.jsx src/pages/Portfolio.test.jsx src/pages/Transactions.test.jsx src/pages/AccountTransactions.test.jsx src/components/analytics/ReturnsTable.test.jsx` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command, full `npx vitest run`, `npx eslint` on touched files — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages frontend/src/components/analytics
git commit -m "feat(tables): priority columns on Dashboard, Holdings, Transactions, account detail and returns table"
```

---

### Task 5: Per-page mobile fixes — Analytics, Accounts, Spending, Portfolio, Transactions (roadmap 3.4, part 1)

**Files:**
- Modify: `frontend/src/pages/Analytics.jsx`, `frontend/src/components/analytics/Projection.jsx`, `frontend/src/pages/Accounts.jsx`, `frontend/src/components/EnableBankingConnectionStatus.jsx`, `frontend/src/components/PeriodSelector.jsx`, `frontend/src/components/RangePills.jsx`, `frontend/src/pages/Portfolio.jsx`, `frontend/src/pages/Transactions.jsx`, `frontend/src/components/LabeledAccountsSection.jsx`, `frontend/src/components/BudgetSection.jsx` (budget rows)
- Modify: matching specs

Behaviour (each is a mobile-only change expressed with base + `md:` classes):
1. **Analytics:** `BenchmarkSelector` wrapper allows `flex-wrap` (it is in `PageHeader`'s right slot, which now wraps); Projection's four `MetricTile` row becomes `grid grid-cols-2 md:grid-cols-4`; Projection's header `right` controls (monthly amounts and year pills) wrap (`flex-wrap`, `gap-2`) and the amount segmented control scrolls inside its own container if still too wide (`max-w-full overflow-x-auto`); the Risk tab tiles already use `grid-cols-2 sm:grid-cols-4`, leave them.
2. **Accounts:** the connection badge group wraps (`flex-wrap justify-end`), suggestion rows in `LabeledAccountsSection` stack the "Label this" button below the text on mobile (`flex-col items-start gap-2 md:flex-row md:items-center`), `RangePills` row wraps or scrolls inside its own container (`flex-wrap`).
3. **Spending:** `PeriodSelector` fits (`max-w-full`, the select shrinks: `min-w-0`), budget rows in `BudgetSection` stack the limit input under the label/amount on mobile.
4. **Portfolio:** the range/period pill row in the page header wraps (it is the 39px culprit); `RangePills` change above covers it.
5. **Transactions:** the toolbar and type chips wrap (`flex-wrap gap-2`), the search/filter inputs go full width on mobile (`w-full md:w-auto`).

- [ ] **Step 1: Write failing tests** asserting the class contract per fix (jsdom cannot measure): e.g. Projection tiles container has `grid-cols-2` and `md:grid-cols-4`; `BenchmarkSelector` has `flex-wrap`; `RangePills` root has `flex-wrap`; `PeriodSelector` root has `max-w-full`; the connection status wrapper has `flex-wrap`; Transactions toolbar has `flex-wrap`; the Labeled accounts suggestion row has `flex-col` and `md:flex-row`. Place each next to the component's existing spec, using its existing render harness.
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/components/analytics/Projection.test.jsx src/pages/Analytics.test.jsx src/pages/Accounts.test.jsx src/components/EnableBankingConnectionStatus.test.jsx src/components/PeriodSelector.test.jsx src/components/LabeledAccountsSection.test.jsx src/components/BudgetSection.test.jsx src/pages/Transactions.test.jsx src/pages/Portfolio.test.jsx` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command and the full `npx vitest run`, `npx eslint` on touched files — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "fix(mobile): Analytics, Accounts, Spending, Portfolio and Transactions controls wrap and stack at 390px"
```

---

### Task 6: Per-page mobile fixes — Research, Research chart, Earnings (roadmap 3.4, part 2)

**Files:**
- Modify: `frontend/src/pages/Research.jsx`, `frontend/src/pages/ResearchChart.jsx`, `frontend/src/components/research/ChartPane.jsx`, `frontend/src/components/research/ChartCanvas.jsx`, `frontend/src/components/research/chartHeader.jsx` (OHLC readout), `frontend/src/pages/Earnings.jsx`
- Modify: matching specs

Behaviour:
1. **Research:** the tab row (`TabList` content) scrolls inside its own container (`overflow-x-auto`, `whitespace-nowrap`, hidden scrollbar utility already used elsewhere or `[scrollbar-width:none]`) instead of widening the page; the page layout stacks the watchlist rail under/over the main column below `md` (check how the two-column grid is declared and give it `grid-cols-1 md:grid-cols-[...]`).
2. **Research chart:** chart canvas height on mobile is `h-[320px] md:h-[var(...)]` (keep the existing desktop value); the OHLC readout wraps onto two lines (`flex-wrap gap-x-3`) instead of clipping; in the multi-pane layout (up to four panes) each pane's readout truncates to date + close on mobile (`hidden md:inline` on open/high/low). The tool rail becomes horizontally scrollable inside its own container on mobile. `main` left was 48px on this route: confirm it no longer needs an offset below `md` (Task 1 removed the rail margin; if this route renders its own fixed rail margin, make it `md:`-only).
3. **Earnings:** the header controls and InfoTip cluster wrap (`flex-wrap`), week navigation stays on one row but may shrink labels, and event cards use full width; fix whatever sits at the 401px right edge (InfoTip button / relative inline-flex span) so it stays inside the viewport.

- [ ] **Step 1: Write failing tests** asserting the class contract: Research tab container has `overflow-x-auto`; Research layout grid has `grid-cols-1` and an `md:` column template; ChartCanvas wrapper carries the mobile height class and its `md:` desktop class; the OHLC readout has `flex-wrap` and the open/high/low items carry `hidden md:inline` (close and date do not); Earnings header controls container has `flex-wrap`.
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/pages/Research.test.jsx src/pages/ResearchChart.test.jsx src/components/research src/pages/Earnings.test.jsx` — Expected: FAIL. (If a spec file named here does not exist, create it with the smallest render that reaches the element.)
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command, the full `npx vitest run`, `npx eslint` on touched files — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "fix(mobile): Research tabs scroll, chart height and OHLC readout, Earnings header wraps at 390px"
```

---

### Task 7: Overflow check script and documentation (roadmap 3.5)

**Files:**
- Create: `frontend/scripts/check-mobile-overflow.mjs`
- Create: `docs/mobile-overflow-check.md`
- Modify: `docs/design-system.md` (one line in the screenshot section linking the new doc)

**Interfaces:**
- Produces: `node check-mobile-overflow.mjs --base http://localhost:5273 --auth <path-to-auth.json> [--width 390]` exits `1` when any route's `documentElement.scrollWidth > innerWidth`, printing one line per route (`/route  over 0  OK` or `over N  FAIL  <up to 4 offending elements>`), and exits `0` when every route passes. `auth.json` is `{ "u": username, "a": access, "r": refresh }`.
- Pure helpers exported for testing: `ROUTES` (the route list below), `parseArgs(argv)`, `formatRow(route, over, offenders)`.

Routes (exactly): `/`, `/portfolio`, `/analytics`, `/research`, `/research/chart`, `/discover`, `/discover/momentum`, `/earnings`, `/investors`, `/transactions`, `/accounts`, `/spending`. The script must also visit `/accounts/<id>` where `<id>` is read from `--account-id` (default `1`), and `/investors/<slug>` from `--investor-slug` (default `berkshire-hathaway`), and the Analytics Risk and Projection tabs (click the tab buttons, then measure). Offenders are elements whose `getBoundingClientRect().right > innerWidth + 1`, excluding `position: fixed` elements and anything inside an `overflow-x-auto`/`overflow-x-scroll` container.

Playwright is not a project dependency. The script imports it with a dynamic `import('playwright')` and, on failure, prints how to run it from an existing `_npx` install (`find ~/.npm/_npx -maxdepth 3 -iname playwright -type d`) and exits `2`.

The doc `docs/mobile-overflow-check.md` covers: what it checks and why, how to start the stack on spare ports with a copied database (never the real DB), how to mint the auth JSON (reuse the shell snippet from the `saxodash-design-system` skill, using the `demo` user: the app has two users, so `get()` fails), the exact command, and how to read a FAIL row. Keep it under 60 lines.

- [ ] **Step 1: Write failing tests** `frontend/scripts/check-mobile-overflow.test.mjs`? vitest's include pattern is `src/**`; put the testable helpers in `frontend/src/lib/mobileOverflow.js` and the spec in `frontend/src/lib/mobileOverflow.test.js`, and have the `.mjs` script import from `../src/lib/mobileOverflow.js`:

```js
import { describe, expect, it } from 'vitest'
import { ROUTES, formatRow, parseArgs } from './mobileOverflow'

describe('mobile overflow helpers', () => {
  it('lists every shell route once', () => {
    expect(new Set(ROUTES).size).toBe(ROUTES.length)
    expect(ROUTES).toEqual(expect.arrayContaining(['/', '/portfolio', '/analytics', '/research', '/research/chart', '/discover', '/earnings', '/investors', '/transactions', '/accounts', '/spending']))
  })
  it('parses flags with defaults', () => {
    expect(parseArgs(['--base', 'http://x', '--auth', 'a.json'])).toEqual({ base: 'http://x', auth: 'a.json', width: 390, accountId: '1', investorSlug: 'berkshire-hathaway' })
    expect(parseArgs(['--width', '320', '--base', 'b', '--auth', 'c']).width).toBe(320)
  })
  it('formats a pass and a fail row', () => {
    expect(formatRow('/spending', 0, [])).toMatch(/\/spending\s+over\s+0\s+OK/)
    expect(formatRow('/spending', 81, ['button.x:471'])).toMatch(/FAIL.*button\.x:471/)
  })
})
```

- [ ] **Step 2: Run** `cd frontend && npx vitest run src/lib/mobileOverflow.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** `lib/mobileOverflow.js` and the script and the doc. Run the script against the stack that is ALREADY running (frontend http://localhost:5273, backend :8100, auth JSON at `/private/tmp/claude-502/-Users-guillaumeleberre-Develop-GuillaumesLab-WebDevelopment-SaxoDash/b0bce860-3a40-4d9d-a2a9-9a070bf0218d/scratchpad/auth.json`, account id `6`); copy the script next to the Playwright install to resolve the module, e.g. `/Users/guillaumeleberre/.npm/_npx/fd3bca3c548369c0/`, run it there, then delete the copy. At this point Tasks 1-6 are merged in the branch so the expectation is all rows OK; report any FAIL rows verbatim in your report (do not fix other files in this task).
- [ ] **Step 4: Run** the spec and `npx eslint src/lib/mobileOverflow.js scripts/check-mobile-overflow.mjs`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add frontend/scripts/check-mobile-overflow.mjs frontend/src/lib/mobileOverflow.js frontend/src/lib/mobileOverflow.test.js docs/mobile-overflow-check.md docs/design-system.md
git commit -m "feat(tooling): mobile overflow check script and docs, the phase gate for 390px"
```

---

### Task 8: Compact Saxo status dot in the shell (roadmap 3.6)

**Files:**
- Modify: `frontend/src/components/SaxoConnectionStatus.jsx`, `frontend/src/components/SaxoConnectionStatus.test.jsx` (create if absent)
- Modify: `frontend/src/components/MobileTopBar.jsx`, `frontend/src/components/Sidebar.jsx` (and their specs)

**Interfaces:**
- Produces: `<SaxoConnectionStatus compact />` renders only a status dot (8px, `rounded-full`) inside a `span` with `role="status"`, `aria-label` equal to the full status sentence (for example `Saxo connected`, `Saxo reconnecting…`, `Saxo needs reconnecting`, `Saxo not connected`, plus the sync-outcome sentence when degraded) and `title` set to the same text; colour is green for ok, amber for degraded/reconnecting, red for needs reauth, zinc for not connected, and the text label is present as `sr-only` so state is never colour-only. Without `compact` the component renders exactly as today.
- The compact dot links to nothing and fetches nothing new: it reuses the existing status query hook already used by the full badge.

Behaviour: read the existing component first and derive the state from the same variables it already uses, without changing the full badge's output. Render the compact dot in `MobileTopBar` (right cluster, before the search button) and in the desktop `Sidebar` footer next to the avatar (hidden when the sidebar is collapsed is NOT desired: show the dot in both collapsed and expanded states). Pages keep their full badge where they already render it.

- [ ] **Step 1: Write failing tests** mocking `../api/queries` the way the existing status spec does: for each state (connected ok, connected with a failed sync, needs reauth, not connected, reconnecting) the compact render exposes a `status` role with the expected accessible name, includes an `sr-only` text node with the same words, and applies a distinct tone class; the non-compact render is unchanged (assert the existing text still appears); `MobileTopBar` and `Sidebar` each render the compact status.
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/components/SaxoConnectionStatus.test.jsx src/components/MobileTopBar.test.jsx src/components/Sidebar.test.jsx` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command, then the full `npx vitest run`, `npx eslint` on touched files — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/components
git commit -m "feat(shell): compact Saxo status dot in the top bar and sidebar footer"
```

---

### Task 9: Gate (controller runs this, no implementer)

- [ ] `cd frontend && npx vitest run && npx eslint src && npm run build`
- [ ] Overflow script on every route at 390px: every row `over 0 OK`. Also at 320px as a stress check (record, do not block on 320).
- [ ] 1440px and 390px screenshots of Dashboard, Portfolio, Analytics (3 tabs), Research, Research chart, Earnings, Transactions, Accounts, account detail, Spending, plus the More sheet open at 390px. Read each PNG. Fix what they show via a fix subagent.
- [ ] Remove the copied `backend/db.sqlite3`, `backend/.env` and `.venv` symlink from the worktree before finishing; stop both servers.
