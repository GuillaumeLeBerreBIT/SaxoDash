# Review Phase 4: Polish and Accessibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the roadmap's Phase 4 list (accessibility semantics, touch targets, consistent states, unified dates, logo fallback, axis ticks, empty chart panes) without changing any figure the app shows.

**Architecture:** Fix shared primitives in `frontend/src/components/ui.jsx` first so page edits become one-line adoptions, then sweep pages cluster by cluster. Frontend only; no backend or migration changes.

**Tech Stack:** React 19, React Router, Tailwind, Recharts, vitest + Testing Library.

**Spec:** `docs/superpowers/plans/2026-10-04-app-review-roadmap.md` (Phase 4 section) and `docs/design-system.md`.

## Global Constraints

- Generated code carries zero comments (AGENTS.md). Rationale goes in commit messages and the PR.
- Test-first: every behaviour change gets a failing vitest spec before the change.
- Baseline: 143 test files, 1405 tests, all passing. Never end a task with fewer passing than that plus the task's new specs.
- Reuse `Card`, `Alert`, `Button`, `Select`, `TBtn`, `TabList`/`TabButton`, `EmptyState` from `components/ui.jsx`; do not hand-roll new variants.
- Touch targets: interactive elements are at least 44x44 CSS px below `md`; desktop sizing is unchanged.
- No new colours; use existing tokens (`docs/design-system.md`).
- Money and percent rendering stays on `fmtMoney` / `fmtEur` / `fmtPct`.
- Run from `frontend/`: `npx vitest run`, `npm run build`. Overflow gate: see `docs/` mobile overflow check doc.
- Commit after each task, branch `fix/review-polish`, never push without being asked.

## Review Focus

- A keyboard user tabbing the Research tabs should land on the active tab and move with arrow keys; the panel must be labelled by its tab.
- A screen reader reading Transactions pagination must hear "Previous page", "Next page", "Page 3, current".
- A failed load on Accounts, Portfolio or Transactions must offer a working Retry, not a dead red line.
- A date must read the same in every table (Transactions, Accounts, Recent transactions, Earnings).
- A logo that 404s in the donut or table must degrade to a letter avatar, never a blank white circle.
- Filtering Transactions to zero rows must show a "Clear filters" action that restores the list and page 1.
- A page with the type filter falling back to All must reset the page number (open 2A follow-up).

---

### Task 1: Shared primitives (tabs, chips, states, hit areas)

**Files:**
- Modify: `frontend/src/components/ui.jsx` (`TabList`, `TabButton`, `TBtn`, add `Chip`, `QueryState`)
- Test: `frontend/src/components/ui.test.jsx`

**Interfaces:**
- Produces: `TabList({ children, label, className })` renders `role="tablist"` with `aria-label={label}`; `TabButton({ active, onClick, children, id, controls })` renders `role="tab"`, `aria-selected={active}`, `tabIndex={active ? 0 : -1}`, ArrowLeft/ArrowRight/Home/End moving focus and calling the sibling's click.
- Produces: `Chip({ active, onClick, children, className })` a `<button aria-pressed>` with `h-11 md:h-8` sizing.
- Produces: `QueryState({ isLoading, error, onRetry, label, children })` returns `<Card>` with `Skeleton` while loading, `Alert` plus `Button` "Retry" on error (`role="alert"`), otherwise `children`.
- `TBtn` keeps `aria-pressed` and gains `min-h-11 md:min-h-0` hit area (use `h-7` visual with an `after:` pseudo-element extending the hit box to 44px under `md`).

- [ ] **Step 1: Write failing specs** in `ui.test.jsx`: tablist role and label; `aria-selected` flips; ArrowRight moves focus and fires the next tab's onClick; `Chip` exposes `aria-pressed`; `QueryState` shows skeleton while loading, an alert with a Retry button that calls `onRetry` on error, children otherwise.
- [ ] **Step 2: Run** `npx vitest run src/components/ui.test.jsx`. Expect new specs FAIL.
- [ ] **Step 3: Implement** the primitives above in `ui.jsx`.
- [ ] **Step 4: Run** the file again plus the whole suite. Expect PASS (existing `aria-current` assertions on `TabButton` move to `aria-selected`; update those specs in `Analytics.test.jsx` and `Investor.test.jsx` in this same task).
- [ ] **Step 5: Commit** `feat(ui): tablist semantics, Chip, QueryState and 44px hit areas`.

### Task 2: Adopt tabs and chips

**Files:**
- Modify: `frontend/src/pages/Research.jsx` (the hand-rolled tab strip at the `visibleTabs.map` becomes `TabList`/`TabButton`, preserving horizontal scroll classes and the 8-high size via a `className` prop), `frontend/src/pages/Transactions.jsx` (type filter buttons become `Chip`), `frontend/src/pages/Analytics.jsx`, `frontend/src/pages/Investor.jsx` (pass `label`)
- Test: `Research.test.jsx`, `Transactions.test.jsx`, `Analytics.test.jsx`, `Investor.test.jsx`

- [ ] **Step 1:** Failing specs: Research exposes `getByRole('tablist')` and `getByRole('tab', { name: 'Valuation' })` with `aria-selected`; Transactions type buttons are `aria-pressed`; the active chip is `aria-pressed="true"`.
- [ ] **Step 2:** Run those files; expect FAIL.
- [ ] **Step 3:** Implement. Give each Research panel `role="tabpanel"` and `aria-labelledby` its tab id.
- [ ] **Step 4:** Run full suite; expect PASS.
- [ ] **Step 5:** Commit `fix(a11y): tab and chip semantics on Research, Transactions, Analytics, Investor`.

### Task 3: Pagination, per-row controls, Clear filters, Transactions page reset

**Files:**
- Modify: `frontend/src/pages/Transactions.jsx`, `frontend/src/pages/Earnings.jsx` (week arrows already labelled; only enlarge `w-6 h-6` to a 44px hit area under `md`), `frontend/src/pages/AccountTransactions.jsx` (already labels the category select; verify and enlarge)
- Test: `Transactions.test.jsx`, `Earnings.test.jsx`

- [ ] **Step 1:** Failing specs: Transactions arrows have names "Previous page" / "Next page"; each page-number button is named `Page N` and the current one has `aria-current="page"`; with a search that matches nothing, a "Clear filters" button is shown and clicking it empties the search, sets the filter to All, resets to page 1; when `typeFilter` is no longer in `types` the page resets to 1.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement. Derive the reset in the handlers and via a `useEffect` keyed on `effectiveFilter !== typeFilter`. Page buttons and arrows become `h-11 w-11 md:h-8 md:w-8`.
- [ ] **Step 4:** Full suite PASS.
- [ ] **Step 5:** Commit `fix(a11y): labelled pagination, Clear filters on Transactions, page reset on filter fallback`.

### Task 4: Login form

**Files:**
- Modify: `frontend/src/pages/Login.jsx`
- Test: `frontend/src/pages/Login.test.jsx` (create; none exists)

- [ ] **Step 1:** Failing specs: `getByLabelText('Username')` and `getByLabelText('Password')` resolve; a failed login renders an element with `role="alert"` and the text "Invalid username or password"; inputs have `aria-invalid` after failure.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement visible labels (keep placeholders), `id`/`htmlFor` pairs, `role="alert"` on the error paragraph, `h-11` inputs and submit button.
- [ ] **Step 4:** Full suite PASS.
- [ ] **Step 5:** Commit `fix(a11y): Login labels and alert role`.

### Task 5: Loading and error states become Cards with retry

**Files:**
- Modify: `pages/Accounts.jsx`, `pages/Portfolio.jsx`, `pages/Transactions.jsx` (bare `text-red-400` / `text-zinc-500` branches), `components/investors/SnapshotPanel.jsx`, `components/investors/ChangesTab.jsx`, `pages/Investors.jsx` (their `Alert` gains Retry through `QueryState`), `lib/chartState.jsx` (chart error placeholder gains a retry when `onRetry` is passed)
- Test: the matching `*.test.jsx` files

**Interfaces:**
- Consumes: `QueryState` from Task 1. Each page passes `onRetry={query.refetch}`.

- [ ] **Step 1:** Failing specs per page: mock the query to error, assert `role="alert"` and a Retry button that calls `refetch`; mock loading, assert no bare "Loading…" text node outside a card.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement by wrapping each page body in `QueryState`.
- [ ] **Step 4:** Full suite PASS.
- [ ] **Step 5:** Commit `fix(ux): loading and error states as Cards with retry`.

### Task 6: One date format

**Files:**
- Modify: `frontend/src/lib/format.js` (add `fmtDate(iso)` returning `04 Oct 2026` and `fmtDayMonth(iso)` returning `04 Oct`, both UTC-safe for date-only strings), `pages/Transactions.jsx`, `components/RecentTransactionsPanel.jsx`, `pages/Accounts.jsx` and `pages/AccountTransactions.jsx` date cells, `components/research/NewsTab.jsx`, `lib/discover.js`, `lib/investors.js` (`FILED`), `lib/charts.js` and `lib/chartGeometry.js` (axis labels use `fmtDayMonth`)
- Test: `lib/format.test.js` plus each touched component spec

**Decision:** tables show `04 Oct 2026`; chart axes and compact labels show `04 Oct`. Locale is fixed to `en-GB` so output does not depend on the browser.

- [ ] **Step 1:** Failing specs: `fmtDate('2026-10-04') === '04 Oct 2026'`, `fmtDayMonth('2026-10-04') === '04 Oct'`, `fmtDate(null) === '—'`; Transactions row shows `04 Oct 2026` not `2026-10-04`.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement helpers and replace each ad hoc formatter listed. CSV export keeps ISO (data, not display).
- [ ] **Step 4:** Full suite PASS; update specs that asserted the old strings.
- [ ] **Step 5:** Commit `fix(ux): one date format across tables and axes`.

### Task 7: Logo fallback

**Files:**
- Modify: `components/AllocationDonut.jsx` (SVG `<image>` gets `onError` to hide the white circle and render a letter), `pages/Transactions.jsx` and other `InstrumentLogo` callers passing a blank `fallback` (replace with a shared `LetterAvatar`), `components/ui.jsx` (add `LetterAvatar({ symbol, size })`)
- Test: `AllocationDonut.test.jsx`, `ui.test.jsx`

- [ ] **Step 1:** Failing specs: a failed `<img>` in `InstrumentLogo` renders the letter avatar; the donut label shows the first letter after an image error event.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Full suite PASS.
- [ ] **Step 5:** Commit `fix(ux): letter-avatar fallback for missing logos`.

### Task 8: Axis ticks and 4-pane empty headers

**Files:**
- Create: `frontend/src/lib/niceTicks.js` (`niceTicks(min, max, count)` returning round values at 1/2/5 x 10^n steps)
- Modify: the Recharts charts whose axes show raw floats (find with `grep -rn "<YAxis" frontend/src --include=*.jsx`; at minimum `HistoryAreaChart`, `NetWorthChart`, `SpendingTrendChart`, `components/analytics/*`), `components/research/ChartPane.jsx` (empty pane shows a header with "Empty pane" and a hint to pick a symbol, consistent height with filled panes)
- Test: `lib/niceTicks.test.js` (create), `ChartPane.test.jsx`

- [ ] **Step 1:** Failing specs: `niceTicks(0, 97, 5)` returns `[0, 20, 40, 60, 80, 100]`; `niceTicks(-3, 3, 4)` includes 0; equal min and max returns a single tick; an empty pane renders a header region with an accessible name.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement and pass `ticks` / `domain` to each `YAxis`.
- [ ] **Step 4:** Full suite PASS.
- [ ] **Step 5:** Commit `fix(charts): round axis ticks and headed empty chart panes`.

### Task 9: Heading hierarchy and header spacing

**Files:**
- Modify: `pages/ResearchChart.jsx` (no `h1`; add a visually hidden `h1` "Chart workspace"), `pages/Discover.jsx` (group `h2` under the page `h1`; confirm card titles below are `h3`), `components/ui.jsx` (`CardHeader` default stays `h2`; add `as="h3"` use where a card sits under a section `h2`), `PageHeader` / `CardHeader` margins unified to one scale
- Test: `ResearchChart.test.jsx`, `Discover.test.jsx`, a new `lib/headings.test.jsx`-style spec per page asserting exactly one `h1`

- [ ] **Step 1:** Failing specs: every routed page renders exactly one `h1` and no heading level is skipped (h1 then h2 then h3).
- [ ] **Step 2:** Run; expect FAIL on ResearchChart at least.
- [ ] **Step 3:** Implement; screenshot each page at 1440 to confirm the margin scale did not shift layouts.
- [ ] **Step 4:** Full suite PASS.
- [ ] **Step 5:** Commit `fix(a11y): heading hierarchy and consistent header spacing`.

### Task 10: Open 2A follow-ups (verify first)

**Files:**
- Modify: Portfolio sector donut palette (`components/AllocationDonut.jsx` / `lib/charts.js`), Dashboard heatmap legend in "Since purchase" mode (`lib/heatmap.js`)
- Test: matching specs

- [ ] **Step 1:** Reproduce each claim first. Donut: assert adjacent slices differ by a minimum colour distance. Heatmap: assert the legend range matches the data range in "Since purchase" mode. If a claim does not reproduce, record that in the commit message and make no change.
- [ ] **Step 2:** Run; expect FAIL only for confirmed defects.
- [ ] **Step 3:** Implement fixes for the confirmed ones.
- [ ] **Step 4:** Full suite PASS.
- [ ] **Step 5:** Commit `fix(charts): distinguishable donut palette, heatmap legend range` (adjust to what was confirmed).

### Task 11: Phase gate

- [ ] `npx vitest run` and `npm run build` in `frontend/` pass.
- [ ] Run the 390px overflow check from the mobile docs; zero overflowing pages.
- [ ] Screenshot every page at 1440 and 390 against a COPY of `db.sqlite3` on ports 8100/5273 (worktree code, never the real DB); review for regressions, including the 2C pages never screenshotted.
- [ ] Keyboard pass on Research tabs, Transactions pagination and Login.
- [ ] No migrations in this phase; confirm with `git diff --stat origin/main -- backend`.
- [ ] Open the PR with `gh pr create`; description lists the Review Focus lines and what each task did.
