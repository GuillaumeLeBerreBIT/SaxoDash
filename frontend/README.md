# SaxoDash frontend

Vite + React 19 (JavaScript, not TS) single-page app for the SaxoDash
personal-finance dashboard. Talks to the Django/DRF backend in `../backend`.

## Setup

```bash
npm install
cp .env.example .env   # sets VITE_API_BASE_URL (defaults to http://localhost:8000)
```

## Scripts

| Command           | What it does                          |
| ----------------- | ------------------------------------- |
| `npm run dev`     | Dev server with HMR (localhost:5173)  |
| `npm run build`   | Production build to `dist/`           |
| `npm run preview` | Serve the production build locally    |
| `npm run lint`    | ESLint                                |
| `npm run test`    | Vitest (`lib/` helpers, API client, some components) |

## Layout

- `src/pages/` — Dashboard, Portfolio, Transactions, Accounts, Login, NotFound
- `src/components/` — charts and bespoke UI primitives ported from the mockup
- `src/api/` — `client.js` (fetch wrapper) and `queries.js` (TanStack Query hooks)
- `src/lib/` — formatting, chart, and account helpers

See the repo-root `AGENTS.md` for the working agreement and stack notes.
