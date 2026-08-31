# AGENTS.md — SaxoDash

Full design context: `docs/superpowers/specs/2026-07-13-saxodash-design.md`.
Read it before starting implementation work if you haven't already.

## What this is

A personal finance dashboard (Django REST Framework backend, Vite + React
frontend) rebuilding the SaxoDash Claude Design mockup into a real app.
Current milestone: Dashboard, Portfolio, Transactions pages on seeded mock
data. Research, Earnings, Banking, and real Saxo OpenAPI / bank-aggregation
integrations are future milestones — do not pull them forward mid-task.

## Working agreement (read this before writing any code)

**Backend (`backend/`, Django/DRF): coach mode.**
Explain the pattern, show a short snippet or pseudocode if useful, flag
gotchas — do not edit backend files directly. The user writes the actual
models/serializers/views/tests themselves. This is a deliberate learning
constraint, not a capability gap — don't "helpfully" write the file anyway.

**Frontend (`frontend/`, Vite/React): propose-then-choose.**
For each component or page, show a snippet or worked example with an
explanation of what it does and why, then ask whether the user wants to
write it themselves from the example or have you apply it directly.
Don't default silently to one or the other.

**Testing**: backend is the primary coverage (DRF `APITestCase` per app).
The frontend has a small vitest suite too — `lib/` helpers, the API client,
and a few components — so add/adjust specs alongside frontend changes.

**Frontend design/polish**: use the `ui-ux-pro-max`, `frontend-design`,
and `dataviz` skills when doing visual/UX work rather than improvising —
they already cover this project's needs.

## Stack

- Backend: Django + DRF, SQLite (dev), JWT auth (SimpleJWT), single user.
- Frontend: Vite + React 19 (JavaScript, not TS), React Router, Recharts,
  Lucide icons, Tailwind. Components are the mockup's own bespoke
  primitives ported as-is — no MUI. `shadcn/ui` may be introduced in a
  later milestone when Research/Banking need dropdowns/modals/comboboxes.

## Code style

Keep inline comments short. Add one only when the code genuinely can't say it
itself — a non-obvious "why", a gotcha, a reference. Don't narrate what the
code does, and don't paste multi-line rationale into a comment: that
explanation belongs in the chat or PR description, not the source. (Some
existing comments are more verbose than this — don't treat them as a
template.)

## Open decision (not yet made)

Research page's candlestick chart data source: TradingView widget embed
vs. Saxo OpenAPI real OHLC vs. continued synthetic mock. Deferred until
the Research milestone — don't decide this in passing.
