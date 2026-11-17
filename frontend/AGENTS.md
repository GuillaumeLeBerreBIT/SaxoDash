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
  literal.
- JavaScript, not TypeScript. Components are bespoke primitives; no MUI.
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
