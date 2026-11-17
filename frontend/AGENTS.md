# frontend/AGENTS.md

Rules for work under `frontend/`. The repo-wide rules are in `../AGENTS.md`, the reasoning
behind each module is in `../docs/decisions.md`, and the look of the app is in `../DESIGN.md`.

## Commands

Run from `frontend/`:

- `npx vitest run` runs the suite (a path narrows it).
- `npx eslint .` lints.
- `npm run build` builds, as CI does.

## Conventions

- Read `../DESIGN.md` before UI work. Colour comes only from `src/lib/theme.js`: semantic
  utilities (`bg-pane`, `text-ink-3`, `text-up`, ...) in markup, `useChartColors()` in
  charts. `src/test/noPaletteClasses.test.js` fails on any Tailwind palette class or hex
  literal. The `saxodash-design-system` skill is the compact version plus the
  screenshot-review harness recipe; `ui-ux-pro-max`, `frontend-design` and `dataviz` cover
  the rest.
- JavaScript, not TypeScript. Components are bespoke primitives; no MUI.
- Reuse the shared building blocks rather than copying their markup: `Tile` for a stat,
  `Segmented` for a choose-one strip, `DataTable` with `Th`/`SortableTh`/`Tr`/`Td` for a table,
  `ChartFrame` around a Recharts chart, the menus in `components/overlays.jsx`.
- Add or adjust a vitest spec beside every change to `lib/`, the API client or a component.
- A price is `fmtMoney(value, currency)`; anything already converted is `fmtEur`. A null
  figure renders as a dash, never zero.
- An instrument is a uic and an asset type: build market-data cache keys with
  `lib/research.js::instrumentKey`.
- Who may ask Finnhub or the SEC about a ticker is decided only in
  `lib/companyData.js::companyDataStatus`.
- Pages are loaded with `lazy` in `App.jsx`; in tests, wait for the page (`findBy...`)
  before reading the location.
- No comments in generated code (see the root file).
