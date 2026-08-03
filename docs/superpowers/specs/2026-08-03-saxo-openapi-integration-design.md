# Saxo OpenAPI Integration — Design Spec

**Date:** 2026-08-03
**Status:** Approved (design)
**Scope:** Backend (`backend/saxo/` new app) + minimal frontend touch points

## Context

The founding spec (`docs/superpowers/specs/2026-07-13-saxodash-design.md`) explicitly
deferred "Real Saxo OpenAPI integration (brokerage data)" as a future milestone,
keeping the MVP on seeded mock data. The per-page chart pass (Dashboard, Portfolio,
Accounts) is now complete and committed. This spec covers the next milestone: wiring
real Saxo OpenAPI data into `portfolio.Position` and `transactions.Transaction`,
replacing the seeded data as the source of truth.

Enable Banking (bank account aggregation) is a separate, later milestone — different
provider, different auth model (PSD2 consent vs Saxo's OAuth2). Not addressed here.

**Working agreement carried forward from `AGENTS.md`:** backend work stays **coach
mode** — Claude explains patterns and flags gotchas; the user writes the actual
models/serializers/views/tasks/tests themselves. This applies to this milestone too,
including the OAuth and Celery code, which is more security- and infra-sensitive than
prior milestones, not less.

## Goal

Connect to Saxo's **SIM (simulation) environment** via OAuth2, and keep
`portfolio.Position` and `transactions.Transaction` continuously synced from real
(simulated) Saxo account data via a scheduled Celery job, replacing the seeded demo
data as the live source of truth.

## Non-goals (YAGNI)

- **Live environment.** SIM only for this milestone; Live requires Saxo's app-review
  process and is a separate future step once SIM works end-to-end.
- **Enable Banking / bank aggregation.** Separate milestone, separate app, later.
- **Trading (placing orders).** Read-only sync (positions, balances, activity) only —
  no order placement, no write access to the Saxo account.
- **Multi-user support.** Single `SaxoCredential` row; no per-user OAuth, matching the
  app's existing single-user design (session auth, no multi-tenancy anywhere else).
- **Frontend redesign.** Existing Portfolio/Transactions/Dashboard pages and charts
  already consume `Position`/`Transaction` — they don't change. Only a small
  "Connect Saxo" / connection-status touch point is added.
- **Deployment considerations for Celery/Redis.** Local dev only, per the founding
  spec's "local dev only for now" constraint — no production process management,
  no supervisord/systemd units.

## Prerequisite (manual, user-side)

Before any code can be exercised end-to-end, the user registers an app at
developer.saxo (SIM environment) to obtain an **App Key**, **App Secret**, and
register a **redirect URI** (e.g. `http://localhost:8000/api/saxo/callback/`). This
is an external account-creation step outside the codebase — not something Claude can
do — and should be called out as an explicit first step in the implementation plan.

## Architecture

New Django app: **`backend/saxo/`** — mirrors the existing one-app-per-concern
pattern (`accounts`, `portfolio`, `transactions`, `core`). Houses everything specific
to the Saxo integration; `portfolio`/`transactions` remain plain data apps that don't
know where their rows came from.

New infrastructure: **Redis** (Celery broker + result backend), **`celery`**, and
**`django-celery-beat`** (periodic schedule stored in the DB / editable via Django
admin, rather than hardcoded `crontab()` schedules in code).

### Components

| File | Responsibility |
|---|---|
| `saxo/models.py` → `SaxoCredential` | Single-row table (one user, no FK yet): `access_token` (encrypted), `refresh_token` (encrypted), `expires_at`, `environment` (`sim`/`live`, default `sim`), `needs_reauth` (bool, default `False`), `last_synced_at`. |
| `saxo/fields.py` | Small custom encrypted text field (Fernet-based) used by the two token columns — not a full third-party encrypted-fields package, since it's only two columns. |
| `saxo/client.py` | Thin wrapper over Saxo OpenAPI REST calls: `build_authorize_url(state)`, `exchange_code_for_token(code)`, `refresh_token(refresh_token)`, `get_positions()`, `get_account_balance()`, `get_closed_positions()` (or equivalent activity endpoint for historical trades). Raises typed exceptions (`SaxoAuthError`, `SaxoAPIError`) on HTTP/auth failures — no bare `requests` exceptions leaking upward. |
| `saxo/views.py` | `GET /api/saxo/connect/` → redirects to Saxo's SIM authorize URL with `client_id`, `redirect_uri`, and a CSRF `state` value stored server-side. `GET /api/saxo/callback/` → validates `state`, exchanges `code` for tokens, saves/updates the single `SaxoCredential` row. `GET /api/saxo/status/` → `{ connected, environment, needs_reauth, last_synced_at }` for the frontend. |
| `saxo/mapping.py` | Pure functions, no I/O: `to_position_fields(saxo_position_json) -> dict` and `to_transaction_fields(saxo_activity_json) -> dict`, mapping Saxo's response shape onto `Position`/`Transaction` model fields. Isolated specifically so they're unit-testable without mocking HTTP. |
| `saxo/tasks.py` (Celery) | `refresh_saxo_token` — checks `expires_at`, refreshes ahead of expiry, rotates the stored refresh token (Saxo issues a new one per refresh), sets `needs_reauth=True` on failure instead of raising. `sync_positions` — fetches positions, upserts into `portfolio.Position` keyed on `ticker`, deletes positions no longer present at Saxo. `sync_transactions` — fetches activity, upserts into `transactions.Transaction` keyed on `saxo_trade_id` (new field, see below). Both sync tasks update `SaxoCredential.last_synced_at` on success. |

### Model changes outside `saxo/`

- `transactions.Transaction` gains `saxo_trade_id` (nullable, unique when set) so
  `sync_transactions` can upsert idempotently instead of guessing identity from
  date/instrument/qty/price. Seeded demo transactions leave this `null`.

### Data flow

**OAuth connect (one-time, manual, via browser):**

1. User clicks "Connect Saxo" in the frontend → `GET /api/saxo/connect/`.
2. Backend redirects to Saxo's SIM authorize URL with `state`.
3. User logs into Saxo SIM, approves access.
4. Saxo redirects to `/api/saxo/callback/?code=...&state=...`.
5. Backend verifies `state`, exchanges `code` for tokens, encrypts and upserts the
   single `SaxoCredential` row.

**Background sync (Celery beat, recurring — intervals configurable via
`django-celery-beat`, not hardcoded, so they're easy to tune after the fact):**

1. `refresh_saxo_token` runs on a short interval, keeps the access token valid ahead
   of expiry.
2. `sync_positions` runs on its own interval, upserts `portfolio.Position` from live
   Saxo data.
3. `sync_transactions` runs on its own interval, upserts `transactions.Transaction`
   from live Saxo activity, keyed on `saxo_trade_id`.

**Seed data relationship:** once Saxo sync is connected, it becomes the source of
truth for `Position`/`Transaction`. `seed_demo_data.py` stays in the repo unchanged,
as an offline fixture for frontend-only work — the two are not mixed at the same
time (no `source` tagging; this is a single-user dev app, not a multi-tenant one).

## Error Handling

- **Token refresh failure** (revoked consent, SIM session expired): `refresh_saxo_token`
  catches the failure, sets `SaxoCredential.needs_reauth = True`, logs, and returns —
  does not raise/crash-loop. `/api/saxo/status/` surfaces this so the frontend can
  show "Reconnect Saxo" instead of silently going stale.
- **Sync task API errors** (rate limit, transient 5xx): Celery's built-in retry with
  backoff (`autoretry_for`, `retry_backoff=True`), capped at a small number of
  attempts, then log and let the next scheduled run pick it back up.
- **Per-row mapping failures** (unexpected/missing fields in a single Saxo position
  or trade): caught per-item inside the sync loop so one malformed row doesn't abort
  the whole batch; logged with enough context (ticker/trade id) to debug.

## Testing

Backend-only (per `AGENTS.md`'s current testing scope), written by the user under
coach mode, following the same `APITestCase`-per-app pattern already used for
`NetWorthSnapshot`/`Transaction`:

- `saxo/mapping.py` — pure functions, fully unit-tested against fixture Saxo JSON
  payloads, no network involved.
- `saxo/client.py` — tested with mocked HTTP responses against fixture payloads for
  token exchange, refresh, positions, and activity endpoints.
- `saxo/tasks.py` — tested with `CELERY_TASK_ALWAYS_EAGER=True` so tasks run
  synchronously in tests; assert DB state (`Position`/`Transaction`/`SaxoCredential`)
  after a mocked client response.
- `saxo/views.py` — `state` validation and token-persistence behavior tested via DRF
  `APITestCase`, with Saxo endpoints mocked (no real OAuth round-trip in tests).
- **Manual/in-browser verification** (since real end-to-end testing needs an actual
  SIM account): connect flow completes and shows "connected" status; triggering a
  sync run populates real SIM positions/transactions into the existing Portfolio and
  Transactions pages/charts with no frontend code changes needed.

## Constraints (carried from the codebase / working agreement)

- Backend code is written by the user (coach mode) — this spec and its implementation
  plan describe *what* to build; Claude does not edit `backend/` files directly.
- Local dev only — no deployment/process-management concerns for Celery/Redis in this
  milestone.
- SIM environment only; Live is out of scope until a dedicated future step.
- Token columns must be encrypted at rest (`SAXO_TOKEN_ENCRYPTION_KEY` in
  `backend/.env.example`, new entry).
- No multi-user/tenancy scaffolding — single `SaxoCredential` row, consistent with
  the app's existing single-user, session-auth design.
