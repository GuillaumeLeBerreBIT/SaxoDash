# AGENTS.md — SaxoDash

Full design context: `docs/superpowers/specs/2026-07-13-saxodash-design.md`.
Read it before starting implementation work if you haven't already.

## What this is

A personal finance dashboard (Django REST Framework backend, Vite + React
frontend) rebuilding the SaxoDash Claude Design mockup into a real app.
Shipped: Overview, Portfolio (with transactions), Research, Boards, Discover,
Earnings, Investors (13F and House trades), Analytics and Money, against the
live Saxo OpenAPI plus Finnhub for company fundamentals. Money includes bank
aggregation through Enable Banking (`enablebanking`, owner only), beside the
hand-entered/Saxo-cash accounts in `accounts`; further banking work is paused.

Research fundamentals (P/E, market cap, dividend yield, growth/valuation
ratios) come from Finnhub's free tier — see "Company fundamentals come from
Finnhub" below. Macro series (Buffett indicator and similar) are still
deferred; they need an unrelated data source (FRED) and were deliberately
kept out of scope.

## Running the stack

`scripts/dev.sh` starts Postgres (Docker), redis, the celery worker, celery
beat, Django and Vite in one terminal, prefixed and colour-coded per service,
each gated on a readiness probe so "stack up" means it. Ctrl-C (or SIGHUP)
stops everything it started; an already-running Postgres or redis is reused
and left alone.

Services are declared in one table near the top of the script — adding a
sixth is one `service` line, and `--no-<name>` works for it automatically.
Flags: `--no-ngrok|postgres|redis|worker|beat|web|ui` (`--no-frontend` aliases `--no-ui`)
and `--reclaim`, which clears leftovers from a killed run instead of dying
on a held port. Ports come from `backend/.env` so they can't drift from the
backend's own config; override per-run with `WEB_PORT` / `UI_PORT` /
`REDIS_PORT`, and the database with `DATABASE_URL`. Per-service logs land in `.dev/logs/` (gitignored).

Full reference — flags, troubleshooting, adding a service:
`docs/running-the-stack.md`.

## Working agreement (read this before writing any code)

**Branches: feature → `develop` → `main`.** Branch from `develop` and open pull requests
into `develop`; only `develop` merges into `main`, and a commit on `main` that passed CI
deploys itself to the homelab: the server pulls (`deploy/poll.sh` on a timer), so no GitHub
workflow ever runs there (`docs/deploying.md`). CI (`.github/workflows/ci.yml`) must be green on both. `docs/branching.md` has the
flow, the checks and the GitHub ruleset. GitHub proposes `main` as a PR's base by default,
so set `develop` explicitly.

**Direct implementation, backend and frontend.** Coach mode is retired — write
the models/serializers/views/tests and the React components directly, test-first.
Keep changes scoped to what was asked and explain what changed in the chat / PR.

**Testing**: backend is the primary coverage (DRF `APITestCase` per app).
The frontend has a small vitest suite too — `lib/` helpers, the API client,
and a few components — so add/adjust specs alongside frontend changes.

**A new migration isn't done until `manage.py migrate` has run against the
dev database, not just the test suite.** `manage.py test` builds its own
fresh, fully-migrated database every run, so it stays green even when the
persistent dev Postgres the live dev server reads is missing the column —
which then 500s on every request touching that model. `scripts/dev.sh`
guards this on stack restart (`migrate --check`, then `migrate`), but mid-session
against an already-running server it's a manual step, easy to forget in the
run-tests-then-move-on rhythm.

**Frontend design/polish**: read `DESIGN.md` (repo root) first — themes,
colour roles, type scale, panel anatomy and the pages are all there. Colour
comes only from `frontend/src/lib/theme.js`: semantic utilities (`bg-pane`,
`text-ink-3`, `text-up`, …) in markup, `useChartColors()` in charts;
`src/test/noPaletteClasses.test.js` fails on any Tailwind palette class or
hex literal. The `saxodash-design-system` skill (this repo's own
`.claude/skills/`) is the compact version plus the screenshot-review
harness recipe; `ui-ux-pro-max`, `frontend-design` and `dataviz` cover the
rest.

## Stack

- Backend: Django + DRF, Postgres 17 (dev, CI and production alike), JWT auth
  (SimpleJWT), many users with one owner.
- Frontend: Vite + React 19 (JavaScript, not TS), React Router, Recharts,
  Lucide icons, Tailwind. Components are the mockup's own bespoke
  primitives ported as-is — no MUI. `shadcn/ui` may be introduced in a
  later milestone when Research/Banking need dropdowns/modals/comboboxes.

## Smallest complete change

Before writing, list everything the change must reach: callers, tests, fixtures, config,
exports. Then take the first option that fully works: skip what was not asked (and name
it in one line); reuse a helper, component or pattern already in the repo; use the
platform or an installed dependency before adding one. Never add an abstraction, option or
"for later" code nobody asked for. Finish every part the task needs, including the
callers and tests the change breaks. Fixing a bug means grepping every caller of the
function and fixing the shared code once. New non-trivial logic (a branch, a parser,
money, security) gets one test that fails when it breaks. End the reply with what was
skipped or not checked, and any risk.

## Code style

Generated code carries zero comments. Say it through names, structure and
tests; the "why" goes in the chat or PR description, not the source. This
covers new code and edits alike: when touching a function, leave its existing
comments as they are and write none beside them.

Exceptions: tool directives that change behaviour (`# noqa`, `# type: ignore`,
`// eslint-disable-next-line`) and a comment the user asks for by name.

Existing comments are legacy, not a template.

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

The reasoning behind the architecture (Saxo as the source of portfolio value, money carrying
its currency, one module per question, rate limits, per-user rows, the verdict and signal
rules, and more) lives in `docs/decisions.md`. Read the entry for a module before changing it.
