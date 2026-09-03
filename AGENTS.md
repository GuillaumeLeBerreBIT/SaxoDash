# AGENTS.md — SaxoDash

Full design context: `docs/superpowers/specs/2026-07-13-saxodash-design.md`.
Read it before starting implementation work if you haven't already.

## What this is

A personal finance dashboard (Django REST Framework backend, Vite + React
frontend) rebuilding the SaxoDash Claude Design mockup into a real app.
Current milestone: Dashboard, Portfolio, Transactions, Accounts and
Research, against the live Saxo OpenAPI. Earnings, Analytics and
bank-aggregation are future milestones — do not pull them forward mid-task.

Research shipped as v1 = everything Saxo can power. Company fundamentals
and macro series (P/E, market cap, dividend yield, analyst ratings, Buffett
indicator) wait on a second data provider and render as ComingSoon panels
until one is chosen.

## Running the stack

`scripts/dev.sh` starts redis, the celery worker, celery beat, Django and
Vite in one terminal, prefixed and colour-coded per service, each gated on a
readiness probe so "stack up" means it. Ctrl-C (or SIGHUP) stops everything
it started; an already-running redis is reused and left alone.

Services are declared in one table near the top of the script — adding a
sixth is one `service` line, and `--no-<name>` works for it automatically.
Flags: `--no-redis|worker|beat|web|ui` (`--no-frontend` aliases `--no-ui`)
and `--reclaim`, which clears leftovers from a killed run instead of dying
on a held port. Ports come from `backend/.env` so they can't drift from the
backend's own config; override per-run with `WEB_PORT` / `UI_PORT` /
`REDIS_PORT`. Per-service logs land in `.dev/logs/` (gitignored).

Full reference — flags, troubleshooting, adding a service:
`docs/running-the-stack.md`.

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

## Learning workspace (`learning/`, gitignored)

A `/teach` workspace. Two different costs, so two different triggers:

**Learning records — write these unprompted.** After work that surfaced
something non-obvious (a bug whose cause wasn't where you'd look, a framework
behaviour that contradicts the obvious reading, a rejected approach and why),
append `learning/learning-records/NNNN-<slug>.md`. Cheap markdown, no design
pass. Capture the surprise and the reasoning, not a changelog — git already has
the changelog. Skip it when the change was routine.

**Lessons — only when asked.** A lesson is a designed HTML document and it only
pays off when the topic is genuinely the next thing worth learning. Auto-firing
one after every sizable feature produces material on things already known,
which trains the habit of not reading them. Wait for an explicit `/teach`; the
accumulated learning records are what make choosing the right topic possible.

Applies to backend-and-frontend features, infrastructure, and deploy work
alike — the trigger is "was anything surprising here", not the size of the diff.

## Decided

Research page's candlestick source: **Saxo `/chart/v3/charts`**, proxied
and cached by the `research` app, not a TradingView embed and not mock
data. It reuses the OAuth token the portfolio sync already holds, so the
chart, the quotes, the instrument search and "Your position" all come from
one connection.

## Open decision (not yet made)

The fundamentals provider behind the ComingSoon panels — FMP, Finnhub,
EODHD or similar. Criteria and the v2 outline are in the Research plan.
