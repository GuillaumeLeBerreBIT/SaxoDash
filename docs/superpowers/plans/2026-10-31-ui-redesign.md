# SaxoDash UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin and re-frame the whole frontend to the agreed design: the Republic palette with three switchable themes, top-tab navigation, panel anatomy, Boards (Chart workspace plus custom boards) and a single Money tab. No existing feature is dropped.

**Architecture:** Colour moves to one JS source (`lib/theme.js`). A `ThemeProvider` writes it onto `<html>` as CSS variables, Tailwind 4 `@theme` turns the variables into utilities (`bg-pane`, `text-ink-3`, …), and charts read resolved hex values through `useChartColors()`.

To avoid touching 143 files at once, a temporary **bridge** remaps Tailwind's `zinc`/`emerald`/`red`/`amber`/`blue` variables onto the new tokens, so the whole app re-themes on day one. The page tasks then move each page to the semantic utilities, and the last task deletes the bridge and adds a test that forbids palette classes.

**Tech Stack:** React 19, Vite 8, Tailwind 4, Recharts 3, TanStack Query 5, React Router 7, vitest + Testing Library; adds `@radix-ui/react-{dialog,dropdown-menu,popover,tooltip}`.

**Spec:**
- `DESIGN.md` at the repo root (tokens, components, layout, routes). Every task reads it.
- Visual reference: the prototype at https://claude.ai/artifact/YAFabdj3qWKZbXiBfVPGZz. Its source is in the main checkout's git-ignored `design-review/prototype/`; `research.js`, `boards.js` and `pages.js` show the target markup for each page.

## Global Constraints

- **Branch and working tree:**
  - Work on branch `feat/ui-redesign` in worktree `.worktrees/ui-redesign`, branched from `main` at `6249915`.
  - It does **not** contain `fix/analytics-returns`. Do not merge either branch into the other.
  - Do not merge or push without the user's confirmation.
- **Zero comments** in generated code, new or edited (AGENTS.md). Leave existing comments alone and write none beside them.
- **No feature removal:**
  - Every route, tab, card, filter and action that exists today still exists afterwards. Research keeps all 10 tabs and `?tab=valuation` → Statistics.
  - Every existing test keeps passing, or is updated to assert the same behaviour through the new markup. A deleted test needs a replacement covering the same behaviour.
- **Colour comes only from `lib/theme.js`.**
  - No hex literal and no `zinc|emerald|red|amber|blue|sky|green|rose` Tailwind class in any file the task touches, once that task is done.
  - Charts take colours from `useChartColors()`.
- **Typography:** Inter, plus IBM Plex Mono for keys and codes only. Use the 12-size scale in DESIGN.md §4 and add nothing outside it.
- **Data honesty** (DESIGN.md §9): absent renders as "—" or "not returned", never 0; stale data names its date; example data carries an `Example` tag.
- **Appearance and boards storage:**
  - Appearance is stored per browser under `saxodash:appearance` = `{theme, moves, density}`, and boards under `saxodash:boards`.
  - Every `localStorage` read and write is wrapped so a throwing or blocked storage falls back to defaults.
- **Accessibility:**
  - Ink 3 reaches 4.5:1 on Pane in every theme.
  - A visible 2 px focus ring uses `--sd-focus`.
  - Every move shows ▲/▼ and a sign.
  - `prefers-reduced-motion` disables transitions.
- **Commands** (run from `frontend/`):

  | What | Command |
  |---|---|
  | One spec | `npx vitest run <path>` |
  | All tests | `npm test` |
  | Lint | `npm run lint` |
  | Build | `npm run build` |

- **Visual check** after each page task:
  - Run `design-review/take-screenshots.sh` from the **main checkout**. It mints a `demo` JWT inside the script and never prints it.
  - Point its `B` at the worktree's Vite port.
  - Compare against the matching prototype page. Do not print or log tokens.

## Review Focus

1. **Blocked or corrupt storage.** With `localStorage` throwing, or holding `{"theme":"neon"}`, the app renders in Republic, green/red, comfortable, with no crash. Pinned in Task 1 (`readAppearance`) and Task 2.
2. **Theme switch without reload.** Switching theme in Settings recolours already-mounted Recharts charts and heatmaps immediately. Pinned in Task 3 (`useChartColors re-renders on theme change`) and checked again in Task 18.
3. **Old deep links.** Each of these lands on the same content with its query string intact:
   - `/research/chart?symbol=NVDA` → the Chart board showing NVDA;
   - `/transactions` → Portfolio's Transactions view;
   - `/accounts/7` → the Money account page;
   - `/spending?period=3m` → Money · Spending · 3 months.

   Pinned in Task 6.
4. **Saved boards from an older version.** A saved board may hold an unknown panel type, overlapping rectangles, or `w` larger than the column count. It must load with the unknown panel dropped, overlaps resolved, and widths clamped, and must never throw. Pinned in Task 12 (`normaliseBoard`).
5. **Absent and stale data under the new skin.** A null `total_pnl`, an unusable Saxo connection and a stale Discover scan still render "—", the reconnect message and the stale label, now in the new context rows. Pinned in Tasks 8, 9 and 13.

---

## File structure

| File | Responsibility |
|---|---|
| `frontend/src/lib/theme.js` (new) | `THEMES`, `MOVES`, `DENSITY`, `ROLES`, `themeVars(theme, moves)`, `contrastRatio(a, b)`, `readAppearance(raw)` |
| `frontend/src/theme/ThemeProvider.jsx` (new) | Context `{theme, moves, density, setAppearance}`, persistence, writes vars and data attributes on `<html>` |
| `frontend/src/theme/useChartColors.js` (new) | Resolved chart palette for the active theme and moves |
| `frontend/src/index.css` | `@theme` semantic colours, the temporary bridge, fonts, base styles |
| `frontend/index.html` | Inter + IBM Plex Mono font link |
| `frontend/src/lib/charts.js` | Keeps formatting helpers. Colour constants are replaced by `chartPalette(vars)` and removed in Task 18 |
| `frontend/src/components/ui.jsx` | Re-skinned primitives (Card = panel, Segmented, Chip, Tag, Tile, Button, table bits, InstrumentLogo circle) |
| `frontend/src/components/overlays.jsx` (new) | Radix-based `Dialog`, `Menu`, `Popover`, `Tooltip` |
| `frontend/src/components/TopBar.jsx` (new) | Tabs, Search pill, value pill, cash pill, account menu |
| `frontend/src/components/Layout.jsx`, `MobileNav.jsx` | New frame; `Sidebar.jsx`, `MobileTopBar.jsx` are deleted once nothing imports them |
| `frontend/src/lib/navigation.js` | New `NAV_ITEMS`, `MOBILE_PRIMARY`, `LEGACY_REDIRECTS` |
| `frontend/src/pages/Settings.jsx` (new) | Appearance, Connections, Sync health |
| `frontend/src/pages/Boards.jsx` (new) | Board tabs, Chart workspace host, custom board host |
| `frontend/src/lib/boards.js` (new) | Board model: `defaultBoards()`, `normaliseBoard()`, `settle()`, `moveTo()`, `resizeTo()`, `loadBoards()`, `saveBoards()` |
| `frontend/src/components/boards/` (new) | `BoardGrid.jsx`, `BoardPanel.jsx`, `PanelLibrary.jsx`, `panels.jsx` (registry) |
| `frontend/src/pages/Money.jsx` (new) | Section host for Accounts / Spending / Budgets / Transactions |
| `frontend/src/test/noPaletteClasses.test.js` (new, Task 18) | Fails on palette classes or hex literals outside `theme.js` |
| `DESIGN.md`, `docs/design-system.md`, `.claude/skills/saxodash-design-system/SKILL.md`, `AGENTS.md` | Docs point at DESIGN.md |

---

### Task 0: Workspace

**Files:** none

- [ ] **Step 1:** In `.worktrees/ui-redesign/frontend` run `npm ci`. Expected: it installs without errors.
- [ ] **Step 2:** Run `npm test && npm run lint && npm run build`. Expected: all green. Record the test count in the PR description as the baseline.
- [ ] **Step 3:** Commit `DESIGN.md` and this plan.

```bash
git add DESIGN.md docs/superpowers/plans/2026-10-31-ui-redesign.md
git commit -m "docs: DESIGN.md and the UI redesign plan"
```

### Task 1: Theme tokens

**Files:**
- Create: `frontend/src/lib/theme.js`, `frontend/src/lib/theme.test.js`

**Interfaces:**
- Produces:
  - `THEMES: { republic, blue, light }`, each a map from role key to hex, with keys exactly equal to `ROLES`.
  - `ROLES: string[]` covering every DESIGN.md §3 role: surfaces, text, lines, accent, up/down/subtle/flat, status, earn, held, chart chrome, `s1…s8`, `heatD3…heatU3`.
  - `MOVES: { 'green-red': {}, cvd: { dark: {...}, light: {...} } }`, holding the overrides for `up`, `down`, `upSubtle`, `downSubtle` and the six heat steps.
  - `DENSITY: { comfortable: { rowH: 46, gap: 12 }, compact: { rowH: 38, gap: 8 } }`.
  - `themeVars(theme, moves) -> { '--sd-pane': '#12100E', … }`, applying the moves override.
  - `contrastRatio(hexA, hexB) -> number` (WCAG 2.x).
  - `readAppearance(raw: string|null) -> { theme, moves, density }`. It validates each field and falls back to `republic` / `green-red` / `comfortable`.
  - `DEFAULT_APPEARANCE`.

- [ ] **Step 1: Write failing tests** in `theme.test.js`:
  - `every theme defines every role`: for each theme, `Object.keys(THEMES[t]).sort()` equals `[...ROLES].sort()`.
  - `values are DESIGN.md's`:
    - `THEMES.republic.pane === '#12100E'`, `.ink3 === '#7E7B78'`, `.up === '#5BC860'`, `.down === '#EB503F'`;
    - `THEMES.blue.accent === '#7FB2FF'`;
    - `THEMES.light.accent === '#1F5FD1'`.
  - `faint text passes AA on every pane`: `contrastRatio(THEMES[t].ink3, THEMES[t].pane) >= 4.5` for all three themes.
  - `cvd swaps gain and loss`: `themeVars('republic','cvd')['--sd-up'] === '#4C9AFF'` and `themeVars('light','cvd')['--sd-down'] === '#C2570C'`.
  - `readAppearance falls back`:
    - `readAppearance(null)`, `readAppearance('not json')` and `readAppearance('{"theme":"neon","moves":"x","density":9}')` all equal `DEFAULT_APPEARANCE`;
    - `readAppearance('{"theme":"blue"}')` gives `{theme:'blue', moves:'green-red', density:'comfortable'}`.
- [ ] **Step 2:** Run `npx vitest run src/lib/theme.test.js`. Expected: FAIL, "Cannot find module".
- [ ] **Step 3:** Implement `theme.js` with the values from DESIGN.md §3. The role keys are camelCase (`pageTop`, `ink2`, `upSubtle`, `heatD3`, …), and `themeVars` maps `pageTop` → `--sd-page-top`.
- [ ] **Step 4:** Run the spec. Expected: PASS.
- [ ] **Step 5:** `git commit -m "feat(theme): one source of colour for three themes and colour-blind moves"`

### Task 2: ThemeProvider, CSS utilities, fonts, bridge

**Files:**
- Create:
  - `frontend/src/theme/ThemeProvider.jsx`
  - `frontend/src/theme/ThemeProvider.test.jsx`
- Modify:
  - `frontend/src/index.css`
  - `frontend/index.html`
  - `frontend/src/main.jsx` (wrap `<App/>`)

**Interfaces:**
- Consumes: `themeVars`, `readAppearance`, `DEFAULT_APPEARANCE`, `DENSITY` (Task 1).
- Produces:
  - `ThemeProvider({children})`.
  - `useAppearance() -> { theme, moves, density, setAppearance(patch) }`.
  - On `<html>`: `data-theme`, `data-moves`, `data-density`, every `--sd-*` var, `--sd-row-h`, `--sd-gap`, and `color-scheme` (`light` for Porcelain).
  - Tailwind utilities from `@theme`:
    - `bg-page`, `bg-pane`, `bg-raised`, `bg-hover`, `bg-selected`, `bg-tile`, `bg-pill`, `bg-track`, `bg-bar`;
    - `text-ink`, `text-ink-2`, `text-ink-3`, `text-on-accent`;
    - `text-up`, `text-down`, `text-flat`, `text-warn`, `text-earn`, `text-held`;
    - `bg-up-subtle`, `bg-down-subtle`, `bg-earn-subtle`, `bg-accent`, `bg-accent-subtle`;
    - `border-line`, `border-line-input`;
    - `ring-focus`, `outline-focus`.

- [ ] **Step 1: Write failing tests** in `ThemeProvider.test.jsx`:
  - `applies stored appearance`: seed `localStorage['saxodash:appearance']='{"theme":"light","moves":"cvd"}'` and render. Then `document.documentElement.dataset.theme === 'light'`, and `getPropertyValue('--sd-up') === '#1F5FD1'`.
  - `survives storage that throws`: stub `Storage.prototype.getItem` to throw and render. `dataset.theme === 'republic'`.
  - `setAppearance persists and re-applies`: call `setAppearance({theme:'blue'})` from a test consumer. Then `localStorage` holds `"theme":"blue"` and `--sd-accent` is `#7FB2FF`.
- [ ] **Step 2:** Run the spec. Expected: FAIL.
- [ ] **Step 3: Implement the provider.** It writes vars with `document.documentElement.style.setProperty` inside a `useLayoutEffect`.
- [ ] **Step 4: Rewrite `index.css`:**
  - `@theme { --color-pane: var(--sd-pane); … }` for every utility listed above;
  - `--font-sans: Inter, …` and `--font-mono: "IBM Plex Mono", …`;
  - `html, body` background is `var(--sd-page)`, with the page gradient `linear-gradient(180deg, var(--sd-page-top) 0, var(--sd-page) 560px)` on `body`;
  - delete the blue radial glow;
  - focus ring `0 0 0 2px var(--sd-focus)`;
  - scrollbar thumb `var(--sd-pill)`.
- [ ] **Step 5: Add the bridge.** Add a block, `@theme` overrides of Tailwind's palette variables, that maps:

  | Tailwind variables | Token |
  |---|---|
  | `--color-zinc-950` | page |
  | `--color-zinc-900` | pane |
  | `--color-zinc-800` | raised |
  | `--color-zinc-700` | pill |
  | `--color-zinc-600`, `--color-zinc-500` | ink-3 |
  | `--color-zinc-400` | ink-2 |
  | `--color-zinc-300` … `--color-zinc-50` | ink |
  | `--color-emerald-300` … `--color-emerald-500` | up |
  | `--color-red-300` … `--color-red-500` | down |
  | `--color-amber-300` … `--color-amber-500` | warn |
  | `--color-blue-300` … `--color-blue-600` | accent |

  Give the block one heading line naming it the bridge removed in Task 18. That heading is the only exception to the zero-comment rule: it is a tool directive for the Task 18 grep, so word it as `/* BRIDGE: remove in Task 18 */`.
- [ ] **Step 6:** In `index.html`, replace the Geist font link with Inter 400/500/600/700 and IBM Plex Mono 400/500.
- [ ] **Step 7:** Run `npm test`. Expected: PASS. Fix any test that asserted a literal hex or class from the old palette, keeping what it checks.
- [ ] **Step 8:** Run `npm run dev`, open `/`, and confirm by eye that the app is already Republic-coloured.
- [ ] **Step 9:** `git commit -m "feat(theme): ThemeProvider, semantic Tailwind colours, Inter, palette bridge"`

### Task 3: Chart colours follow the theme

**Files:**
- Create: `frontend/src/theme/useChartColors.js`, `frontend/src/theme/useChartColors.test.jsx`
- Modify: `frontend/src/lib/charts.js`, `frontend/src/lib/charts.test.js`

**Interfaces:**
- Consumes: `useAppearance`, `THEMES`, `MOVES` (Tasks 1–2).
- Produces:
  - `chartPalette({theme, moves}) -> { up, down, flat, warn, earn, grid, axis, axisCategory, crosshair, bench, primary, estimate, track, series: [8], heat: [7], tooltip: {bg, text, border} }`, pure and in `lib/charts.js`.
  - `useChartColors()` returns `chartPalette(useAppearance())`.
  - `gridProps(c)`, `axisProps(c)`, `dateAxisProps(c)`, `moneyAxisProps(c)`, `chartTooltipProps(c)` become functions of the palette.
  - The old constants (`BEAT`, `MISS`, `POSITIVE`, …) stay exported until Task 18, so pages not yet migrated keep compiling.

- [ ] **Step 1: Write failing tests:**
  - `chartPalette maps roles`: `chartPalette({theme:'republic',moves:'green-red'}).up === '#5BC860'`, and `.series[0] === '#3987e5'`.
  - `cvd palette`: the `cvd` `.down` is `'#FF9A3C'`.
  - `useChartColors re-renders on theme change`: a probe component prints `useChartColors().primary`. After `setAppearance({theme:'blue'})` the text is `#7FB2FF`, with no remount.
- [ ] **Step 2:** Run the specs. Expected: FAIL.
- [ ] **Step 3:** Implement. `performanceFill(pct, {cap, flat}, c)` takes the palette as a third argument, and `colorForTicker` / `colorForRank` draw from `c.series`.
- [ ] **Step 4:** Migrate the shared chart components that every page uses to the hook: `HistoryAreaChart`, `NetWorthChart`, `components/heatmap/HeatTile`, `components/heatmap/ScaleLegend`, `components/discover/Sparkline`, `AllocationDonut`, `GainersLosersChart`.
- [ ] **Step 5:** Run `npm test`. Expected: PASS.
- [ ] **Step 6:** `git commit -m "feat(theme): charts read the active theme through useChartColors"`

### Task 4: Primitives

**Files:**
- Modify: `frontend/src/components/ui.jsx`, `frontend/src/components/ui.test.jsx`

**Interfaces:**
- Produces, keeping existing names and props so callers keep working:
  - `Card({ context, dot, title, right, menu, flush, className, children })`. Without `context`/`title` it is a bare panel, so old callers that compose `CardHeader` still render.
  - `CardHeader({ title, subtitle, right })` renders the context row from `subtitle` plus the 17/700 title.
  - New: `Segmented({ options:[{value,label}], value, onChange, label })`, `Tag({ tone: 'held'|'earn'|'warn'|'up'|'down'|'example'|undefined })`, `Tile({ label, value, sub, tone })`, `StatusDot({ tone: 'ok'|'warn'|'error'|'earn'|'off' })`, `Move({ value, digits })` (▲/▼ with a sign).
  - `Chip`, `TBtn`, `Button` (`primary|secondary|ghost|danger`, sizes `sm|md`), `Badge`, `Th`, `Td`, `SortableTh`, `Tr`, `Input`, `Select`, `Skeleton`, `EmptyState`, `Alert`, `MetricTile`, `StatRow`, `StatStrip`, `DayChange` (now wraps `Move`), all re-skinned per DESIGN.md §5.5–5.6.
  - `InstrumentLogo` renders the 28/36 px white disc with a ring, and falls back to initials on `bg-pill`.

- [ ] **Step 1: Write failing tests** in `ui.test.jsx`:
  - `Card renders context row, title and menu button`: `getByText('Saxo · 30 Oct')`, `getByRole('heading', {name: 'Positions'})`, and `getByRole('button', {name: 'Positions options'})`.
  - `Segmented reports the picked value and marks it pressed`: clicking `3M` calls `onChange('3M')`, and `getByRole('button', {name:'6M'})` has `aria-pressed="true"` when `value='6M'`.
  - `Move shows arrow and sign`: `render(<Move value={-1.4}/>)` contains `▼ 1.40%`, and the classes include `text-down`.
  - `Move renders absent as a dash`: `value={null}` shows `—`.
  - `Tag example`: `<Tag tone="example">Example</Tag>` has class `text-warn`.
- [ ] **Step 2:** Run the spec. Expected: FAIL.
- [ ] **Step 3:** Implement using only the semantic utilities from Task 2. Card is `bg-pane rounded-xl` with padding 14/18/18. `flush` removes the side padding for tables.
- [ ] **Step 4:** Run `npm test`. Expected: PASS, with existing snapshot-free tests unchanged.
- [ ] **Step 5:** `git commit -m "feat(ui): primitives on the panel anatomy and semantic colours"`

### Task 5: Overlays on Radix

**Files:**
- Create: `frontend/src/components/overlays.jsx`, `frontend/src/components/overlays.test.jsx`
- Modify:
  - `frontend/package.json`
  - `ui.jsx` (`Modal` and `InfoTip` delegate to overlays)
  - `components/research/menu.jsx`, `components/research/chartMenus.jsx`
  - `CommandPalette.jsx`
  - `components/investors/AddInvestorDialog.jsx`, `components/investors/FilingAlerts.jsx`
  - delete `usePortalMenuRect.js` when unused

**Interfaces:**
- Produces:
  - `Dialog({ open, onOpenChange, title, children, width })`;
  - `Menu({ trigger, items:[{label, onSelect, icon?, danger?}] })`;
  - `Popover({ trigger, children })`;
  - `Tooltip({ content, children })`.

- [ ] **Step 1:** Install pinned majors and commit the lockfile changes:

  ```bash
  npm i @radix-ui/react-dialog@1 @radix-ui/react-dropdown-menu@2 @radix-ui/react-popover@1 @radix-ui/react-tooltip@1
  ```

- [ ] **Step 2: Write failing tests:**
  - `Dialog traps focus and closes on Escape`: when open, focus is inside; after Escape, `onOpenChange(false)` is called.
  - `Menu opens on click and runs onSelect`.
  - `CommandPalette still opens with Meta+K and lists pages`: keep the existing `CommandPalette.test.jsx` assertions and run them against the new markup.
- [ ] **Step 3:** Implement. The skin is `bg-raised rounded-[10px] p-1.5`, with a large soft shadow in dark themes and `ring-1 ring-line` in Porcelain. The palette dialog is 620 px wide at `12vh` over a 55% scrim.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** `git commit -m "feat(ui): dialogs, menus, popovers and tooltips on Radix"`

### Task 6: App frame, navigation and routes

**Files:**
- Create: `frontend/src/components/TopBar.jsx`, `frontend/src/components/TopBar.test.jsx`
- Modify:
  - `Layout.jsx`, `MobileNav.jsx`, `lib/navigation.js`, `lib/navigation.test.js`, `lib/commands.js`;
  - `App.jsx` and `App`-level tests;
  - `Layout.test.jsx`, `MobileNav.test.jsx`.
- Delete: `Sidebar.jsx`, `Sidebar.test.jsx`, `MobileTopBar.jsx`, `MobileTopBar.test.jsx` (their behaviour moves to TopBar's tests).

**Interfaces:**
- Produces:
  - `NAV_ITEMS = [{to:'/',label:'Overview',end:true}, {to:'/portfolio',label:'Portfolio'}, {to:'/research',label:'Research'}, {to:'/boards',label:'Boards'}, {to:'/discover',label:'Discover'}, {to:'/earnings',label:'Earnings'}, {to:'/investors',label:'Investors'}, {to:'/analytics',label:'Analytics'}, {to:'/money',label:'Money'}]`.
  - `MOBILE_PRIMARY = ['/', '/portfolio', '/research', '/discover']`, with More holding the rest plus `/settings`.
  - `LEGACY_REDIRECTS`, as in DESIGN.md §6.1. A `<LegacyRedirect to=… />` keeps `location.search` and maps params:
    - `/research/chart?symbol=X` → `/boards?symbol=X`;
    - `/transactions` → `/portfolio?view=transactions`;
    - `/accounts/:id` → `/money/accounts/:id`;
    - `/spending?…` → `/money?section=spending&…`;
    - `/spending/transactions` → `/money?section=transactions`.
  - Route placeholders for `/boards`, `/boards/:id`, `/money`, `/money/accounts/:accountId` and `/settings`.
    - Until Tasks 7, 11, 12 and 17 land, `/boards` renders the existing `ResearchChart` inside the new frame, and `/money` renders the existing `Spending`.
    - `/research/chart` no longer sits outside the Layout.
- **TopBar:**
  - The tabs from `NAV_ITEMS`, at 17/700 with `aria-current="page"` on the active one.
  - The Search pill opens the palette.
  - The value pill (`usePortfolioSummary` plus Saxo cash, with the day move) links to `/portfolio`.
  - The cash pill (`useNetWorth` cash) links to `/money` and hides below 1420 px.
  - The account `Menu`: Saxo status from `SaxoConnectionStatus` data, Theme and colours → `/settings`, Sync health → `/settings?section=sync`, Filing alerts (the existing `FilingAlerts`), Sign out.

- [ ] **Step 1: Write failing tests:**
  - `TopBar marks the active tab`: at `/discover`, `getByRole('link',{name:'Discover'})` has `aria-current="page"`.
  - `legacy routes redirect with their query`: render `App` in a `MemoryRouter` at each old URL from Review Focus #3 and assert on `location.pathname + location.search`.
  - `account menu shows reconnect when Saxo needs re-auth`: with status `{connected:true, needs_reauth:true}` the menu contains "Reconnect".
  - `phone bar has Overview, Portfolio, Research, Discover, More`.
  - `navigation.test.js`: update it to the new `NAV_ITEMS`. `PAGE_COMMANDS` still equals `NAV_ITEMS` plus `/settings`.
- [ ] **Step 2:** Run the specs. Expected: FAIL.
- [ ] **Step 3:** Implement. The header is sticky at `top: env(safe-area-inset-top)`, with the body `::before` band painted `--sd-page-top`. The page gutter is `max(24px, env(safe-area-inset-left))`, or 16 px below 760 px.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Screenshot `/` and `/discover` at 1440 and 390 px.
- [ ] **Step 6:** `git commit -m "feat(frame): top tabs, header pills, account menu, phone bar, legacy redirects"`

### Task 7: Settings

**Files:**
- Create: `frontend/src/pages/Settings.jsx`, `frontend/src/pages/Settings.test.jsx`

**Interfaces:**
- Consumes: `useAppearance`, the Saxo status query, `useEnableBankingStatus`.
- Produces: sections `Appearance | Connections | Sync health`, chosen by `?section=appearance|connections|sync`.

- [ ] **Step 1: Write failing tests:**
  - `theme cards switch the theme`: clicking "Graphite Blue" makes `document.documentElement.dataset.theme === 'blue'`, and the card has `aria-pressed="true"`.
  - `gain and loss colours toggle cvd` and `density toggles compact`.
  - `sync health lists failing tasks`: with status `failing_syncs: ['sync_positions']` the list shows `sync_positions` with a warning dot and the text "failing".
  - `connections show Saxo needs re-authentication with a Reconnect button` that starts the existing connect-ticket flow.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement as the prototype's Settings page: a 3-column section list plus a 9-column body. Theme cards show mini previews drawn from `THEMES[t]` values.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** `git commit -m "feat(settings): appearance, connections and sync health"`

### Task 8: Overview

**Files:**
- Modify:
  - `pages/Dashboard.jsx`, `pages/Dashboard.test.jsx`
  - `components/dashboard/*`, `NetWorthChart.jsx`, `PortfolioHeatmap.jsx`

**Interfaces:**
- Consumes: Tasks 2–6.
- Layout (DESIGN.md §5.2; prototype Overview):

  | Width | Panel |
  |---|---|
  | 8 | Net worth: hero figure, breakdown, history with "Since Aug / Saxo since Feb 2025" |
  | 4 | This week: `AttentionBand` items, upcoming earnings, cap breaches |
  | 8 | Positions, compact |
  | 4 | Today heatmap |
  | 4 + 4 + 4 | Vs the US 500 · Smart money · Allocation |

  The existing `MoversCard`, `ExposureCard` and `UpcomingEarnings` content all stays and is placed into these panels.

- [ ] **Step 1:** Extend `Dashboard.test.jsx`:
  - `null total_pnl still renders a dash in the hero`;
  - `cap breach appears in This week when a weight exceeds 15%`;
  - `every existing card heading is still present`: list the current headings in the test and assert on each.
- [ ] **Step 2:** Run. Expected: FAIL on the new layout assertions.
- [ ] **Step 3:** Implement. Replace palette classes with semantic ones and chart constants with `useChartColors()`.
- [ ] **Step 4:** Run `npm test`, then screenshot and compare to the prototype.
- [ ] **Step 5:** `git commit -m "feat(overview): Overview board on the new design"`

### Task 9: Portfolio, with Transactions as a view

**Files:**
- Modify:
  - `pages/Portfolio.jsx`, `pages/Portfolio.test.jsx`
  - `pages/Transactions.jsx`: becomes `components/portfolio/TransactionsView.jsx`, and its test moves with it
  - `AllocationDonut.jsx`, `GainersLosersChart.jsx`, `PriceBasisNote.jsx`

**Interfaces:**
- `?view=positions|transactions` drives a `Segmented` in the summary panel. Closed and Tax year are **out of scope**: they need endpoints the frontend does not have, so leave them out of the control (see Follow-ups).
- Positions table columns, all existing ones kept: Instrument, Qty, Avg cost, Last, Today, Value, Return, P/L, Weight (bar with the 15% cap tick), Funds, Congress, and the existing sort.
- Below the table: Sectors · Concentration · Currency, built from the existing allocation data.

- [ ] **Step 1: Tests:**
  - `view=transactions shows the trades grouped by day`;
  - `weight above 15% renders in warning with the cap tick`;
  - `sorting by Return toggles direction` (existing assertions kept);
  - `Funds and Congress columns still hidden below 1440px` (`hideBelow="wide"`).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test`, then take screenshots.
- [ ] **Step 5:** `git commit -m "feat(portfolio): summary tiles, positions and transactions as one page"`

### Task 10: Research, part 1 (shell, Overview, Financials, Statistics)

**Files:**
- Modify:
  - `pages/Research.jsx`
  - `components/research/{OverviewTab,FinancialsTab,StatisticsTab,SnapshotSection,KeyFactsStrip,PerformanceTiles,AnalystRatingCard,CapitalStructureCard,OwnershipCard,SymbolNotesCard,ProfitWaterfall,QuarterlyTrendsChart,CashAndDebtChart,AssetsLiabilitiesChart,FinancialsChart,StatementTable,RatioHistoryChart,RatioHistoryTable,VerdictBadge}.jsx`
  - their tests

**Interfaces:**
- The header panel follows DESIGN.md §6.2.
  - The tab row keeps the `TABS` array, the gating (`tabGate`) and `TAB_ALIASES` untouched.
  - The held-symbol chips and "Any instrument" (palette) are added.
  - "Open in Chart" links to `/boards?symbol=…`.
- Overview uses the two-column `.col` layout from DESIGN.md §6.2, with every current Overview card present. That includes the foreign, ETF and unverified listing notes.

- [ ] **Step 1: Tests:**
  - `all ten tabs render for an eligible US stock`;
  - `?tab=valuation opens Statistics`;
  - `a foreign listing still shows the company-data note and hides company tabs` (existing behaviour, new markup);
  - `Overview keeps Thesis and risks, Range statistics, Capital structure, Ownership, Analysts` (one heading each).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Charts use `useChartColors()`, and verdict tones map to `Tag` tones (pos → up, caution → warn, neutral → none).
- [ ] **Step 4:** Run `npm test`, then screenshot GOOGL Overview, Financials and Statistics.
- [ ] **Step 5:** `git commit -m "feat(research): header, Overview, Financials and Statistics on the new design"`

### Task 11: Research, part 2 (Peers, Earnings, Funds, Congress, Filings, News, Guide)

**Files:**
- Modify:
  - `components/research/{PeersTab,QualityValuationQuadrant,EarningsTab,EarningsInsights,EpsBarChart,FundsTab,CongressTab,FilingsTab,FilingsList,InsiderSentimentChart,InsiderTransactions,NewsTab,GuideTab}.jsx`
  - their tests

- [ ] **Step 1: Tests:**
  - `quadrant leaves out a peer that cannot be scored` (existing, re-pointed);
  - `insider totals count open-market trades only` (existing);
  - `filings links leave only for sec.gov` (existing);
  - `Funds tab summary shows owners, net share change and new/added/trimmed/sold out`.
- [ ] **Step 2:** Run. Expected: FAIL where markup changed.
- [ ] **Step 3:** Implement per the prototype tabs.
- [ ] **Step 4:** Run `npm test`, then screenshot every tab.
- [ ] **Step 5:** `git commit -m "feat(research): remaining tabs on the new design"`

### Task 12: Board model

**Files:**
- Create: `frontend/src/lib/boards.js`, `frontend/src/lib/boards.test.js`

**Interfaces:**
- Produces:
  - `PANEL_TYPES` (keys: `watchlist, chart, heatmap, earnings, news, symbol, positions, allocation, shelf, funds, performance, networth`, each with `{name, blurb, w, h}` from the prototype's `boards.js`).
  - `defaultBoards()`, which returns "Morning check" and "Semiconductors" with the prototype's layouts.
  - `normaliseBoard(raw) -> board`: drops unknown types, clamps `x,w` to 12 columns and `h ≥ 3`, `w ≥ 2`, then `settle`s.
  - `settle(panels, moved?) -> panels`: places `moved` first, pushes overlapping panels down, then compacts upward, all immutably.
  - `moveTo(board, id, x, y)`, `resizeTo(board, id, w, h)`, `addPanel(board, type)` (at the bottom, `x=0`), `removePanel(board, id)`, `followSymbol(board, sym)`.
  - `loadBoards()` and `saveBoards(boards)` using `saxodash:boards`, wrapped against storage errors.

- [ ] **Step 1: Write failing tests:**
  - `settle pushes a dropped-on panel below and compacts`: from the Morning check layout, moving the heatmap to `(6,5)` gives chart `y >= 11`, and no two panels overlap.
  - `normaliseBoard drops unknown types and clamps width`: `{type:'radar'}` is removed, and `{x:10,w:6}` becomes `x:6` (or `w` clamped so `x+w ≤ 12`).
  - `loadBoards falls back to defaults on bad JSON or throwing storage`.
  - `addPanel puts the panel under the lowest one`.
  - No two panels overlap after any operation: property-style, by looping 50 random `moveTo` calls with a seeded generator.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement as pure functions. Port `settle` from the prototype.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** `git commit -m "feat(boards): board model with settle, normalise and storage"`

### Task 13: Boards page, Chart board and custom boards

**Files:**
- Create:
  - `pages/Boards.jsx`, `pages/Boards.test.jsx`
  - `components/boards/{BoardGrid,BoardPanel,PanelLibrary,panels}.jsx`, `components/boards/BoardGrid.test.jsx`
- Modify:
  - `pages/ResearchChart.jsx`: becomes the Chart board body; keep `useChartWorkspace` and `saxodash:chart-workspace`
  - `components/research/{WatchlistRail,SymbolPanel,ChartToolRail,panes,chartHeader}.jsx`
  - `App.jsx` (routes from Task 6)

**Interfaces:**
- Consumes: `lib/boards.js` (Task 12); existing `WatchlistRail`, `PortfolioHeatmap`, `UpcomingEarnings`, `NewsTab` body, `SymbolPanel`, `Sparkline`/`ShelfRow`, `PerformanceTiles`.
- `/boards` shows the board tabs and the Chart workspace. `?symbol=` keeps working as the active pane, exactly as `/research/chart` did.
- `/boards/:id` shows a custom board.
- `panels.jsx` maps each `PANEL_TYPES` key to `({board, panel, onFollow}) => JSX`, built from existing components only (no new data fetching).
- Edit mode follows DESIGN.md §6.3:
  - pointer drag on the grip, and corner resize;
  - snap to column width plus gap and to 64 px rows plus gap;
  - a drop zone;
  - Cancel restores the snapshot, and Save persists;
  - delete asks for a second click;
  - editing is disabled below 760 px.

- [ ] **Step 1: Tests:**
  - `Boards shows Chart first and the saved boards`;
  - `/boards?symbol=NVDA opens NVDA in the active pane`;
  - `picking a symbol in a board watchlist updates the followed symbol` (the context row reads "Follows watchlist · NVDA");
  - `edit, remove a panel, cancel restores it`;
  - `edit, add Discover shelf, save persists to saxodash:boards`;
  - `keyboard: Enter on a watchlist row follows it`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Pointer handling follows `startDrag` in the prototype's `boards.js`, using pointer capture.
- [ ] **Step 4:** Run `npm test`, then screenshot the Chart board at 1 and 4 panes, Morning check, and edit mode with the library open.
- [ ] **Step 5:** `git commit -m "feat(boards): Chart board and editable custom boards"`

### Task 14: Discover

**Files:**
- Modify: `pages/Discover.jsx`, `pages/DiscoverShelf.jsx`, `components/discover/*`, their tests

- [ ] **Step 1: Tests:**
  - `stale scan shows its date and the reason` (existing `DiscoverHealth`, new markup);
  - `lens chips show counts and open the shelf`;
  - `shelf sector chips filter rows`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement: a lens panel with chips, shelves as 6 + 6 panels showing 5 rows each with "See all N →", and the shelf page as a table with sector chips.
- [ ] **Step 4:** Run `npm test`, then take screenshots.
- [ ] **Step 5:** `git commit -m "feat(discover): lenses and shelves on the new design"`

### Task 15: Earnings

**Files:**
- Modify: `pages/Earnings.jsx`, `components/earnings/*`, their tests

- [ ] **Step 1: Tests:**
  - `your cell in the week grid is marked in the earnings colour with words` ("Vistra, yours");
  - `a picked cell lists that day and session`;
  - `move says which window it measured` (existing).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement: the Your week table, the market week grid (day × session) and the day list.
- [ ] **Step 4:** Run `npm test`, then take screenshots.
- [ ] **Step 5:** `git commit -m "feat(earnings): your week, market grid and day list on the new design"`

### Task 16: Investors

**Files:**
- Modify:
  - `pages/{Investors,Investor,InvestorStocks,CongressMember}.jsx`
  - `components/investors/*`, `components/congress/*`
  - their tests

- [ ] **Step 1: Tests:**
  - `Funds/Congress switch keeps its tab in the URL`;
  - `investor profile tiles show value, positions, top 5/10, new/exited, shared with you`;
  - `congress copy performance shows clone vs S&P and what was left out` (existing values);
  - `ChangeBadge caps absurd percentages` (if already fixed; otherwise keep the existing behaviour).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement per the prototype's Investors, Berkshire and Pelosi pages.
- [ ] **Step 4:** Run `npm test`, then take screenshots.
- [ ] **Step 5:** `git commit -m "feat(investors): hub, fund and Congress pages on the new design"`

### Task 17: Analytics and Money

**Files:**
- Modify:
  - `pages/Analytics.jsx`, `components/analytics/*`
- Create:
  - `pages/Money.jsx`, `pages/Money.test.jsx`
- Move:
  - `pages/Accounts.jsx` → `components/money/AccountsSection.jsx`
  - `pages/Spending.jsx` → `components/money/SpendingSection.jsx`
  - `pages/SpendingTransactions.jsx` → `components/money/TransactionsSection.jsx`
  - `pages/AccountTransactions.jsx` stays as the `/money/accounts/:accountId` page
- Move the tests with their sources.

**Interfaces:**
- Money sections `overview | accounts | spending | budgets | transactions`, chosen by `?section=`. Overview composes cash, spent this month, budgets, review queue, subscriptions and the category chart from the existing components.
- Analytics keeps every existing tab and panel (performance, risk, projection, attribution, calendar years, monthly heatmap, drawdown, returns table), re-skinned.
  - This branch is based on `main`, so it keeps `main`'s analytics numbers.
  - Do not port anything from `fix/analytics-returns`.

- [ ] **Step 1: Tests:**
  - `Money sections route by query` (each section renders its existing heading);
  - `/spending?period=3m lands on Money · Spending with 3 months picked`;
  - `Analytics benchmark switch still changes the series` (existing).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test`, then take screenshots (Money with no banking details visible in anything shared).
- [ ] **Step 5:** `git commit -m "feat(money,analytics): Money tab and Analytics on the new design"`

### Task 18: Remove the bridge and guard it

**Files:**
- Create: `frontend/src/test/noPaletteClasses.test.js`
- Modify:
  - `index.css` (delete the `BRIDGE` block)
  - `lib/charts.js` (delete the old colour constants)
  - every file the guard flags
  - `docs/design-system.md` (a 3-line pointer to DESIGN.md)
  - `.claude/skills/saxodash-design-system/SKILL.md` (tokens and primitives from DESIGN.md)
  - `AGENTS.md` ("Frontend design/polish": read DESIGN.md)

- [ ] **Step 1: Write the guard test.**
  - It globs `src/**/*.{js,jsx}` except `lib/theme.js` and test fixtures.
  - It fails listing `file:line` for any match of `/\b(bg|text|border|ring|fill|stroke|from|to|via|divide|outline|shadow)-(zinc|emerald|red|amber|blue|sky|green|rose|slate|gray)-\d{2,3}\b/`, or of a hex literal `/#[0-9a-fA-F]{6}\b/` in non-test source.
- [ ] **Step 2:** Run it. Expected: FAIL, listing every leftover.
- [ ] **Step 3:** Fix each leftover with semantic utilities and `useChartColors()`. Delete the bridge and the old constants.
- [ ] **Step 4:** Run `npm test && npm run lint && npm run build`. Expected: all green.
- [ ] **Step 5: Final visual pass.**
  - Screenshot every page at 1440 and 390 px in Republic, Graphite Blue and Porcelain, and once with blue/orange moves.
  - Check text contrast and that charts recolour on switch without a reload.
  - Fix what is off.
- [ ] **Step 6:** `git commit -m "chore(theme): remove the palette bridge and forbid palette colours"`

---

## Follow-ups (not in this plan)

- **Portfolio Closed and Tax year views.** They need `GET` endpoints over `portfolio/closed_positions.py` and `portfolio/tax_year.py::report`, which today only the MCP server uses.
- **Settings audit log.** There is no backend record of settings changes yet.
- **Server-side storage for boards.** Today boards are per browser, like the chart workspace.
