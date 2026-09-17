# Enable Banking Integration — Design Spec

**Date:** 2026-09-17
**Status:** Approved (design)
**Scope:** Backend (`backend/enablebanking/` new app) + a small frontend touch point

## Context

The founding spec explicitly deferred Enable Banking (bank account aggregation) as
"a separate, later milestone — different provider, different auth model (PSD2
consent vs Saxo's OAuth2)." The Saxo OpenAPI integration (positions, closed
positions, cash balance) is now done end to end (Tasks 1-11,
`docs/superpowers/plans/2026-08-03-saxo-openapi-integration.md`). This spec covers
that deferred milestone: wiring real bank balances into `accounts.BankAccount`,
replacing the seeded demo data as the source of truth for banking, the same way
Saxo replaced seeded data for positions/transactions.

`accounts.BankAccount` was already built with this in mind — it has an
`external_id` field with an explicit comment: *"Stable key for synced accounts;
null for ones entered by hand."* This spec is the first thing to actually use that
field for a bank (Saxo's own cash balance already uses the equivalent pattern via
`SAXO_CASH_ACCOUNT_ID`).

**Real banks in scope: KBC and Argenta**, both Belgian, both confirmed present in
Enable Banking's ASPSP list. The existing seeded `BankAccount` row ("BNP Paribas
Fortis") was placeholder demo data with no real bank behind it — it is removed as
part of this work, not migrated into.

**Feasibility, verified live against Enable Banking's own docs/ToS before this spec
was written** (not assumed): a **restricted-mode production application** — free of
charge, no signed contract, no KYB — is explicitly permitted by their Terms of
Service for *"the personal use of private individuals."* You register a production
application, then activate it in restricted mode by linking your own account(s)
through their Control Panel; a restricted application can only ever fetch data from
accounts you've explicitly linked. PSD2 consent (SCA) needs renewal roughly every
90-180 days per bank — a recurring reconnect step, same shape as the `needs_reauth`
flow Saxo already has, just on a much longer clock.

## Goal

Connect to Enable Banking's production API in **restricted mode**, for **KBC** and
**Argenta** specifically, and keep `accounts.BankAccount` continuously synced with
real balances from both banks via a scheduled Celery job — replacing the seeded
demo bank account as the live source of truth, exactly as Saxo did for positions.

## Non-goals (YAGNI)

- **Transaction history.** Balance-only sync for this milestone (user's explicit
  choice during brainstorming) — `transactions.Transaction` has no FK to
  `BankAccount` today (only a free-text `account` label), and adding one is a
  separate, larger data-model decision deferred until balance sync is proven out.
- **A bank-picker UI / arbitrary ASPSP support.** Enable Banking covers 2,700+
  banks, but only KBC and Argenta are real accounts here. Both are hardcoded
  (ASPSP name + country per bank); adding a third bank later means adding one more
  hardcoded entry, not building a search UI.
- **Payment initiation (PIS).** Read-only account information (AIS) only — no
  payment initiation capability requested or used.
- **Sandbox environment.** Goes straight to a **production** application in
  restricted mode, per Enable Banking's own documented path for personal,
  non-commercial use — there is no real balance data to sync from their sandbox.
- **Multi-user support.** One `EnableBankingCredential` row per bank (two rows
  total), no per-user OAuth — matches the app's existing single-user design and
  the same simplification already made for `SaxoCredential`.
- **Frontend redesign.** `Accounts.jsx` already renders whatever's in
  `BankAccount` generically (via `useBankAccounts`) — it does not change. Only a
  small connection-status touch point is added, mirroring `SaxoConnectionStatus`.
- **Deployment considerations for the new Celery task.** Local dev only, same as
  every other sync task in this app.

## Prerequisite (manual, user-side)

Before any code can be exercised end-to-end:

1. Sign up at Enable Banking's Control Panel (`enablebanking.com/sign-in`).
2. Register a **production** application (not sandbox) — this generates an
   **Application ID** and downloads a **private key** (`.pem` file) to sign API
   requests with. Whitelist a redirect URL (e.g.
   `http://localhost:8000/api/enablebanking/callback/`).
3. Call `GET /aspsps?country=BE` (once the app exists) to get the **exact**
   `aspsp.name` strings Enable Banking uses for KBC and Argenta — do not guess
   these; Task 1 of the implementation plan captures the real values, the same way
   Saxo's field names were verified against a real response before being trusted.
4. Activate the application in **restricted mode** by linking your own KBC and
   Argenta accounts through the Control Panel's "Activate by linking accounts"
   flow (one bank at a time — each requires its own SCA/consent at that bank).

This is an external account-creation step outside the codebase, same as Saxo's
`developer.saxo` app registration.

## Architecture

New Django app: **`backend/enablebanking/`** — mirrors the existing
`saxo/` app's shape and the one-app-per-concern pattern.

### Components

| File | Responsibility |
|---|---|
| `enablebanking/models.py` → `EnableBankingCredential` | One row per bank: `bank` (`kbc` / `argenta`, unique), `session_id`, `valid_until` (the PSD2 consent expiry we requested), `linked_account_ids` (JSON list — one consent typically covers several accounts, e.g. checking + savings, in one grant), `needs_reauth` (bool, default `False`). No access/refresh token pair — Enable Banking's auth model doesn't have one (see below). |
| `enablebanking/client.py` | Thin wrapper over Enable Banking's REST API, same shape as `saxo/client.py`: `_jwt()` (signs a fresh short-lived RS256 JWT per request using the stored private key — this *is* the app-level auth, not a client secret), `build_authorize_url(bank, state)` (starts the consent flow for the given hardcoded ASPSP), `exchange_code_for_session(code)`, `get_balances(session_id, account_id)`. Raises typed exceptions (`EnableBankingAuthError`, `EnableBankingAPIError`), same pattern as `SaxoAuthError`/`SaxoAPIError`. |
| `enablebanking/views.py` | `GET /api/enablebanking/connect/<bank>/` → redirects to that bank's Enable Banking consent URL, `state` encodes both a CSRF token and which bank this is for (the callback is shared across both banks). `GET /api/enablebanking/callback/` → validates `state`, exchanges `code` for a session, upserts the `EnableBankingCredential` row for that bank. `GET /api/enablebanking/status/` → `{ kbc: {...}, argenta: {...} }`, each shaped like Saxo's status payload (`connected`, `needs_reauth`, `last_synced_at`). |
| `enablebanking/mapping.py` | Pure functions, no I/O: `to_account_fields(bank, eb_account_json) -> dict`, mapping one Enable Banking account/balance response onto `BankAccount` fields. Isolated the same way `saxo/mapping.py` is, for unit testing without mocking HTTP. |
| `enablebanking/tasks.py` (Celery) | `sync_enablebanking_balances` — for each of the two `EnableBankingCredential` rows not already `needs_reauth`: if `valid_until` has passed, set `needs_reauth=True` and skip (no refresh token to silently renew with — this *is* the reconnect signal, same role `needs_reauth` plays for Saxo); otherwise fetch balances for each linked account id and upsert into `accounts.BankAccount` keyed on `external_id=f'enablebanking:{bank}:{account_id}'`. |

### Model changes outside `enablebanking/`

- None. `accounts.BankAccount` already has everything needed (`external_id`).
- `core/management/commands/seed_demo_data.py`: remove the fake "BNP Paribas
  Fortis" entry from `BANK_ACCOUNTS` — real KBC/Argenta rows replace it as the
  source of truth for banking, same relationship Saxo already has with seeded
  positions/transactions.

### Data flow

**Consent (one-time per bank, manual, via browser):**

1. User clicks "Connect KBC" (or "Connect Argenta") in the frontend →
   `GET /api/enablebanking/connect/<bank>/`.
2. Backend calls Enable Banking's authorization endpoint with the hardcoded
   `aspsp.name`/`country` for that bank, `psu_type: "personal"`, `access.valid_until`
   requesting 180 days out (PSD2's current maximum SCA-exemption window — the bank
   may grant less, it's a request not a guarantee), and a `state` encoding `bank` +
   a CSRF token. Redirects the user to the URL Enable Banking returns.
3. User authenticates and consents at their bank's own site (KBC's or Argenta's
   SCA flow, not Enable Banking's).
4. Bank/Enable Banking redirects to `/api/enablebanking/callback/?code=...&state=...`.
5. Backend verifies `state`, extracts which bank it was for, exchanges `code` for
   a `session_id` (which comes back with the list of authorized account ids),
   upserts that bank's `EnableBankingCredential` row.

**Background sync (Celery beat, recurring interval via `django-celery-beat`,
same pattern as `sync_positions`/`sync_account_balance`):**

1. `sync_enablebanking_balances` runs on its own interval (balances change slowly
   compared to Saxo positions — a longer interval than the 30-minute Saxo tasks is
   reasonable, e.g. every few hours; finalized in the implementation plan).
2. For each bank not flagged `needs_reauth`, fetches balances for its linked
   accounts and upserts `BankAccount` rows keyed on `external_id` — idempotent on
   repeat syncs, same as every other sync task in this app. No pre-existing manual
   row to claim by name this time (unlike Saxo's cash sync): the fake BNP row is
   deleted outright as part of this work, so KBC/Argenta rows are created fresh.

**Seed data relationship:** once connected, Enable Banking becomes the source of
truth for `BankAccount`, the same relationship Saxo already has with
`Position`/`Transaction`. `seed_demo_data.py` stays in the repo (minus the fake
BNP row) as an offline fixture for frontend-only work.

## Error Handling

- **Consent expiry** (PSD2's 90-180 day SCA window lapses): `sync_enablebanking_balances`
  catches this via the stored `valid_until`, sets that bank's
  `EnableBankingCredential.needs_reauth = True`, logs, and returns — does not
  raise/crash-loop. `/api/enablebanking/status/` surfaces this per-bank so the
  frontend can show "Reconnect KBC" / "Reconnect Argenta" independently (one bank
  lapsing does not affect the other).
- **Sync task API errors** (rate limit, transient 5xx): Celery's built-in retry
  with backoff (`autoretry_for`, `retry_backoff=True`), capped at a small number
  of attempts, same as every other sync task in this app.
- **Per-account mapping failures** (unexpected/missing fields in a single Enable
  Banking balance response): caught per-item inside the sync loop so one
  malformed account doesn't abort the whole run for that bank; logged with enough
  context (bank, account id) to debug.

## Testing

Mirrors the Saxo integration's testing shape exactly:

- `enablebanking/mapping.py` — pure functions, unit-tested against fixture Enable
  Banking JSON payloads, no network involved.
- `enablebanking/client.py` — tested with mocked HTTP responses, including JWT
  generation tested against a throwaway test keypair (never a real private key in
  test fixtures).
- `enablebanking/tasks.py` — tested with `CELERY_TASK_ALWAYS_EAGER=True`; assert
  DB state (`BankAccount`/`EnableBankingCredential`) after a mocked client
  response, including the two-bank-independent-reauth case.
- `enablebanking/views.py` — `state` validation (including the encoded bank) and
  credential-persistence behavior tested via DRF `APITestCase`, Enable Banking
  endpoints mocked, no real consent round-trip in tests.
- **Manual/in-browser verification** (real end-to-end testing needs actual KBC and
  Argenta accounts, per the Prerequisite section): both connect flows complete and
  show "connected" status independently; triggering a sync run populates real
  KBC/Argenta balances into the existing Accounts page with no frontend code
  changes beyond the new connection-status component.

## Constraints (carried from the codebase / working agreement)

- Local dev only — no deployment/process-management concerns for the new Celery
  task, consistent with the rest of the app.
- Restricted-mode production application only; no commercial contract, no KYB —
  matches Enable Banking's own documented "personal use of private individuals"
  path, verified against their live ToS before this spec was written.
- No multi-user/tenancy scaffolding — one `EnableBankingCredential` row per bank,
  consistent with `SaxoCredential`'s single-row, single-user design.
- The **working agreement note carried in the original Saxo spec** ("backend work
  stays coach mode") is stale in practice — coach mode has been lifted per-session
  multiple times since, including for direct backend implementation. This spec
  does not assume coach mode; confirm with the user at plan-execution time if that
  matters.
