# Phase 5A: Tables and Drill-down Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sortable Holdings and Transactions columns, date-range and account filters on Transactions (URL-synced), and spending-category click-through to a new cross-account bank transactions page.

**Architecture:** One pure sort helper (`lib/sort.js`) plus a shared `SortableTh` primitive serve both tables. Transactions filters live in a pure helper (`lib/transactionFilters.js`) and sync to the URL query string. The click-through reuses the `AccountTransactions` table and `lib/accountTransactions.js` helpers on a new `SpendingTransactions` page across all bank accounts. Frontend only, no backend change.

**Tech Stack:** React 19, React Router (`useSearchParams`), Tailwind v4, vitest + Testing Library.

**Spec:** Approved in-chat design (bounded path); roadmap Phase 5 entry in `docs/superpowers/plans/2026-10-04-app-review-roadmap.md`. Builds on Phase 4 (PR #6): `QueryState`, `Chip`, `fmtDate`, heading outline helper `src/test/headingOutline.js`.

## Global Constraints

- Generated code carries zero comments (AGENTS.md); rationale goes in commit messages.
- Test-first; pure helpers unit-tested; page behaviour via page specs.
- `npx eslint src` must report zero errors; full `npx vitest run` and `npm run build` green before the last commit of each task.
- Reuse `Card`, `Button`, `Input`, `Select`, `Chip`, `QueryState`, `EmptyState`, `PageHeader` from `components/ui.jsx`; no new colours.
- Touch targets at least 44px below `md`; desktop sizing unchanged. Headers sortable by keyboard.
- Dates display through `fmtDate`/`fmtDayMonth`; money through `fmtEur`/`fmtMoney` (AGENTS.md money rules: `value`/`cost`/`pnl` are EUR, `avg_cost`/`current_price` are instrument currency).
- Every new routed page: exactly one `h1`, no skipped heading level, loading and error states keep the h1 (use `expectValidHeadingOutline`).
- Sorting is stable, and null/undefined/NaN values always sort last in both directions.
- No new code comments anywhere; legacy comments untouched.

## Review Focus

- Sorting a column containing nulls (Holdings with an unpriced position, Transactions with `total_eur: null`) must keep the nulls at the bottom in both directions.
- Changing a sort or a filter must return to page 1; a stale `?page` or unknown URL values must not crash (unknown `type`/`account` fall back to All, bad dates are ignored).
- Date range with `from` after `to` should yield an empty list with a visible "Clear filters", not an error.
- A category with no transactions in the period, and the "Other" folded slice, must not produce a dead link.
- The click-through must carry the exact period the Spending page shows (`date_from`/`date_to`) and the category code, and the destination must show the same total spend category count as the chart.

---

### Task 1: Sort helper and SortableTh

**Files:**
- Create: `frontend/src/lib/sort.js`, `frontend/src/lib/sort.test.js`
- Modify: `frontend/src/components/ui.jsx` (add `SortableTh`), `frontend/src/components/ui.test.jsx`

**Interfaces:**
- Produces: `sortRows(rows, { key, direction }, accessors)` where `direction` is `'asc' | 'desc'`, `accessors` maps key to `(row) => value`; values may be numbers, numeric strings, strings or ISO date strings; returns a new array, stable, nulls/undefined/NaN/'' last in both directions. `nextSort(current, key)` cycles `null -> asc -> desc -> null` for the same key and starts at `asc` for a new key; `current` is `{ key, direction } | null`.
- Produces: `SortableTh({ children, sortKey, sort, onSort, align, edge, hideBelow, className })` rendering `Th` with a `<button>` inside, `aria-sort="ascending|descending|none"` on the `th`, a small direction glyph (Lucide `ArrowUp`/`ArrowDown`/`ChevronsUpDown`), `h-11 md:h-auto` friendly hit area, calling `onSort(sortKey)` on click/Enter/Space.

- [ ] **Step 1:** Write failing specs: sortRows numeric/string/date, numeric strings ("1000.00" vs "999.5" sort numerically), stability for equal keys, nulls last for asc and desc, input not mutated; nextSort cycle; SortableTh `aria-sort` values, click calls `onSort(key)`, keyboard activation, glyph reflects direction.
- [ ] **Step 2:** Run `npx vitest run src/lib/sort.test.js src/components/ui.test.jsx`; expect FAIL.
- [ ] **Step 3:** Implement `lib/sort.js` and `SortableTh`.
- [ ] **Step 4:** Run those files, then the full suite and eslint; expect PASS.
- [ ] **Step 5:** Commit `feat(ui): sort helper and SortableTh`.

### Task 2: Sortable Holdings (Portfolio)

**Files:**
- Modify: `frontend/src/pages/Portfolio.jsx` (holdings table header around the `<Th ... sticky>` row), `frontend/src/pages/Portfolio.test.jsx`

**Interfaces:**
- Consumes: `sortRows`, `nextSort`, `SortableTh` from Task 1.
- Sortable columns: Name, Qty, Value, P&L, Weight (Avg, Price and the day-change column stay unsortable). Accessors use the converted figures per AGENTS.md (`value`, `pnl` are EUR; weight is derived value share). Default order is the current order (no sort = `null`).

- [ ] **Step 1:** Failing specs: clicking Value sorts descending order of values after two clicks and restores the default on the third; P&L with a null/unpriced row keeps it last in both directions; `aria-sort` set on the active header; sticky header classes preserved.
- [ ] **Step 2:** Run `npx vitest run src/pages/Portfolio.test.jsx`; expect FAIL.
- [ ] **Step 3:** Implement with a `useState` sort and `useMemo` sorted rows; keep hooks before the early returns (Rules of Hooks).
- [ ] **Step 4:** Full suite + eslint PASS.
- [ ] **Step 5:** Commit `feat(portfolio): sortable holdings columns`.

### Task 3: Sortable Transactions

**Files:**
- Modify: `frontend/src/pages/Transactions.jsx`, `frontend/src/pages/Transactions.test.jsx`

**Interfaces:**
- Consumes: Task 1 helpers. Sortable: Date, Instrument, Total (by `total_eur`, numeric). Default order stays the API order. Sorting applies after filtering and before pagination; changing the sort resets to page 1. CSV export keeps exporting the filtered list in the displayed sort order.

- [ ] **Step 1:** Failing specs: Date header sorts ascending then descending; Total sorts numerically with `total_eur: null` last both ways; sort change resets page to 1; export CSV order follows the sort.
- [ ] **Step 2:** Run `npx vitest run src/pages/Transactions.test.jsx`; expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Full suite + eslint PASS.
- [ ] **Step 5:** Commit `feat(transactions): sortable Date, Instrument and Total`.

### Task 4: Transactions date-range and account filters, URL-synced

**Files:**
- Create: `frontend/src/lib/transactionFilters.js`, `frontend/src/lib/transactionFilters.test.js`
- Modify: `frontend/src/pages/Transactions.jsx`, `frontend/src/pages/Transactions.test.jsx`

**Interfaces:**
- Produces: `filterByDateRange(rows, { from, to })` (inclusive, ISO `YYYY-MM-DD` compare, ignores a bad/empty bound), `accountsOf(rows)` returning sorted unique account names, `rangeForPreset(preset, today)` for `'30D' | 'YTD' | '1Y'` returning `{ from, to }`, `readFilters(searchParams)` and `writeFilters(filters)` mapping `{ search, type, account, from, to }` to and from `?q=&type=&account=&from=&to=` omitting defaults; unknown/invalid values fall back to defaults.
- Transactions gets: a date-range control (two `<input type="date">` labelled "From" and "To" plus preset Chips 30D, YTD, 1Y), an account `Select` (labelled "Account", "All accounts" default) shown only when more than one account exists, URL sync via `useSearchParams` (replace, not push), page reset on any filter change, "Clear filters" resetting all, shown when any filter is active.

- [ ] **Step 1:** Failing specs for the helpers (inclusive bounds, from>to returns [], preset ranges with a fixed `today`, read/write round-trip, garbage params fall back) and for the page (filters narrow rows, URL reflects them, loading with `?type=BUY&from=...` pre-applies, unknown type falls back to All, Clear filters resets, single account hides the picker).
- [ ] **Step 2:** Run the two spec files; expect FAIL.
- [ ] **Step 3:** Implement. Keep the render-time filter-fallback pattern already in the page; no `useEffect` that sets state (eslint rule).
- [ ] **Step 4:** Full suite + eslint PASS.
- [ ] **Step 5:** Commit `feat(transactions): date-range and account filters synced to the URL`.

### Task 5: Spending click-through and cross-account bank transactions page

**Files:**
- Create: `frontend/src/pages/SpendingTransactions.jsx`, `frontend/src/pages/SpendingTransactions.test.jsx`
- Modify: `frontend/src/App.jsx` (route `spending/transactions` inside the shell, before any dynamic spending route), `frontend/src/components/SpendingCategoryChart.jsx` (category list with links), `frontend/src/pages/Spending.jsx` (pass the period), `frontend/src/lib/accountTransactions.js` (add `filterByPeriod(rows, { from, to })` if not present, tested), related specs

**Interfaces:**
- `SpendingCategoryChart` gains prop `period` (`{ date_from, date_to }`) and renders, under the donut, a compact list of categories (largest first, label + `fmtEur` amount) where each row is a `Link` to `/spending/transactions?category=<CODE>&from=<date_from>&to=<date_to>`; the folded "Other" slice gets no link.
- `SpendingTransactions` reads `category`, `from`, `to` from the URL, loads `useBankTransactions()` (all accounts), filters with `filterTransactions` plus a period filter, shows a `PageHeader` (title is the category label, subtitle with a "Back to Spending" link and the formatted period), a StatStrip with count and total, the same table, category select and inline category editing as `AccountTransactions`, pagination with the Phase 4 pager, "Clear filters", and `QueryState`-style loading/error keeping the h1. Unknown category code shows the table unfiltered with an "All categories" select. Reuse, do not copy, `AccountTransactions`'s row/table markup: extract the shared table into `frontend/src/components/BankTransactionsTable.jsx` used by both pages (move code, keep `AccountTransactions` tests green).

- [ ] **Step 1:** Failing specs: chart renders one link per category with the right href and none for "Other"; the page applies category and period from the URL, shows total and count matching the filtered rows, back link, heading outline valid in populated, loading and error states; extracted table keeps `AccountTransactions` specs passing.
- [ ] **Step 2:** Run the touched spec files; expect FAIL.
- [ ] **Step 3:** Implement and wire the route.
- [ ] **Step 4:** Full suite + eslint + `npm run build` PASS.
- [ ] **Step 5:** Commit `feat(spending): category click-through to a cross-account bank transactions page`.

### Task 6: Phase gate

- [ ] `npx vitest run`, `npx eslint src`, `npm run build` all green.
- [ ] 390px overflow gate: add `/spending/transactions` to `ROUTES` in `frontend/src/lib/mobileOverflow.js` (and its spec), run per `docs/mobile-overflow-check.md` against a COPY of the dev DB.
- [ ] Screenshots at 1440 and 390 of Portfolio holdings (sorted), Transactions (filtered, with and without Clear filters), Spending with the category list, and the new page.
- [ ] Keyboard pass on a sortable header and the date inputs.
- [ ] Push and open the PR only after PR #6 is merged (retarget to `main`), or on explicit instruction.
