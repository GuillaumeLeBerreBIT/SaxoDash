# Multi-user accounts

Date: 2026-11-07. Status: agreed in conversation, ready for a plan.

## Why

SaxoDash runs on the homelab at `https://saxodash.uniroo.dev`, reachable only over Tailscale,
with one login (`demo`) that owns everything. The owner's girlfriend is about to start using
it with her own Saxo account, and the owner wants the site open: anyone who finds it may
create an account. Today none of the 35 tables has an owner; the Saxo sync takes
`SaxoCredential.objects.first()` and the portfolio views read `Position.objects.all()`. A second
person would see, and overwrite, the first person's money.

## Goals

1. **Real accounts.** Sign up, log in, log out, change username, email and password, and reset a
   forgotten password through an emailed link.
2. **Each person sees only their own data.** Every per-person record has an owner and every read
   and write is filtered by the requesting user. Two Saxo users never see each other's
   positions, history, watchlists, notes, chart lines, journal or follows.
3. **The owner's existing data stays the owner's.** The current `demo` account becomes the
   owner's real account (they will rename it), with all existing rows attached to it.
4. **Free and low-hassle.** No paid service and no new third-party account. Email goes through
   a Gmail account's SMTP with an app password.

## Non-goals

- **Excel/CSV upload, and users without Saxo.** Deferred. A user without a Saxo connection gets
  an account and the shared pages (Investors, Congress, Discover, Earnings calendar) but an
  empty portfolio, exactly as the app behaves today when Saxo is disconnected.
- **Banking for anyone but the owner.** Enable Banking's free mode links only the owner's own
  banks. Banking stays the owner's (see "Owner").
- **Shared or combined portfolios** between users.
- **A second price-data provider.** Closed decision; do not propose one.
- **Account deletion, social login, two-factor auth, admin UI for managing users.** Later, if
  ever. (Account deletion: builder's note, my call to leave out; the owner can delete a user
  from the Django shell.)

## Anti-goals (a failure even if it works)

- Any endpoint that returns or modifies another user's per-person row. One missed `.all()` is the
  bug this whole project exists to prevent.
- A stranger's activity draining the shared Finnhub key or Saxo app limits enough to break the
  owner's own use.
- The password-reset endpoint, or login's response time, telling an anonymous caller whether
  an email or username is registered.
- **Amended (accepted):** signup does name a taken email ("That email is already registered.")
  or username ("That username is taken."). Hiding it is impossible without email
  verification, which this spec rules out: a signup that succeeds silently for a taken email
  either creates a second account or tells the caller nothing useful. Signup is throttled to
  5 an hour per IP, which bounds how fast anyone can test addresses through it.
- A migration that leaves the production database's existing rows without an owner, or
  attaches them to the wrong user.

## Constraints

- Django REST Framework + SimpleJWT stay. JWT access 1 day, refresh 30 days, rotation with
  blacklist, as now (`backend/settings.py` `SIMPLE_JWT`).
- Postgres everywhere; migrations run on deploy (`deploy/deploy.sh`), after a backup.
- Branch from `develop`, PR into `develop`.
- AGENTS.md rules apply: zero code comments, test-first, semantic colours only, DESIGN.md
  panel anatomy for new screens.
- **Saxo third-party access is unverified.** The owner's Saxo developer app may need Saxo's
  approval before someone other than the owner can authorise through it. This must be checked
  first (the girlfriend connecting is the test). If Saxo refuses, the accounts work still ships;
  only the second Saxo connection waits.

## What is per person and what is shared

**Per person (gets a `user` foreign key, non-null, `on_delete=CASCADE`):**

| App | Models |
|---|---|
| saxo | `SaxoCredential` (one per user), `SyncRun` (nullable user: global tasks have none) |
| portfolio | `Position`, `PortfolioValuation` |
| transactions | `Transaction` |
| core | `NetWorthSnapshot` |
| accounts | `BankAccount` |
| research | `Watchlist` (items follow through it), `SymbolNote`, `PriceLine`, `TrendLine`, `TextAnnotation` |
| advisor | `Recommendation` |
| investors | following and alert read state (see below) |

Every unique constraint that identifies a per-person row gains `user` (a note per symbol becomes a
note per user and symbol; a snapshot per date becomes per user and date; and so on).

**Investors.** `Investor.followed` is a global boolean and `FilingAlert.read_at` is global. Both
move to per-user tables: `InvestorFollow(user, investor)` and `FilingAlertRead(user, alert)`.
`FilingAlert` rows themselves stay shared (an alert is a fact about a filing); the inbox shows
alerts for investors the requesting user follows, unread unless that user has a read row.
Investors added by search stay shared for everyone.

**Shared (unchanged, no owner):** `investors` filings, holdings, securities, moves, price history
and copy performance; all of `congress`; `ScreenerRow`; every Finnhub/EDGAR provider cache.

**Banking (`enablebanking`):** no schema change. Every Enable Banking endpoint requires the
owner; everyone else gets 403 and the frontend hides the Enable Banking parts (bank connections,
bank transactions, subscriptions, budgets, IBAN labels). The accounts view itself stays for
everyone: `BankAccount` is per person, and a Saxo user's `saxo:cash` account belongs on it. (My
call.)

**Who may change shared data.** (My calls.)
- Starting a Discover scan (`StartDiscoverScanView`) is owner only; everyone else reads the
  nightly snapshot. The scan runs on the owner's Saxo connection and Finnhub's background budget.
- Adding an investor by search (`POST /api/investors/`) stays open to every user, under its
  existing `investors.search` throttle: an added investor is useful to all and only reads EDGAR.
  The new investor records who added it.
- Removing a non-curated investor is allowed for the owner, or for the user who added it when no
  other user follows it. Everyone else gets 403.

## Owner

The owner is a user flagged as such, decided once by the data migration and stored, not
re-derived by guessing (my call):
- if the database has exactly one user, that user becomes the owner and a superuser;
- otherwise the migration reads the username from the `SAXODASH_OWNER` environment variable and
  fails loudly if it is missing or names no user.
The plan checks which users the production database holds (over SSH) before the migration is
written; the expectation is that `demo` is the only one. Later code asks "is this the owner" in
one place (e.g. `core.owner.owner()` / `is_owner(user)`), backed by a boolean on a per-user
profile or by `is_superuser` with exactly one superuser enforced. The owner is the only user who:

- sees banking;
- supplies the Saxo connection for **global background work**: the Discover scan
  (`research.tasks.scan_universe`), the copy-performance price feed, congress ticker prices, and
  anything else that today uses "the" credential without serving one person's portfolio. The
  Earnings page's closes for a user's own names are not background work: they are fetched at
  request time and use the **requesting** user's credential like any market-data request; a user
  without one sees universe names' moves from `ScreenerRow.recent_closes` and `—` for the rest. If the owner is not connected, those jobs record `skipped`, as today.

`MCP_USER` keeps naming whose data the advisor reads; nothing changes there.

## Saxo per user

- The OAuth connect ticket already signs `request.user.pk`; the callback attaches the new
  credential to that user and replaces **only that user's** credential (it currently deletes all
  of them).
- `saxo.credentials.connection_state()` and `active_credential()` take a user. "Is Saxo
  connected", the header health badge and `worst_recent_outcome()` are per user.
- The per-portfolio syncs (`sync_positions`, `sync_closed_positions`, `sync_account_balance`,
  token refresh, `research.tasks.sync_watchlists`) run once per tick and loop over every user with
  a usable credential, each user in its own transaction with its own `SyncRun`. One user's
  failure or expired token never stops another's sync.
- Market-data requests (charts, quotes, instrument search, details) use the **requesting user's**
  credential; a user with no usable credential gets the existing 409, checked before the cache.
  The chart/quote caches stay keyed on the instrument and shared between connected users. (My
  call: both users are Saxo clients with their own entitlement, the bars are identical, and a
  shared cache halves Saxo calls. A user without a connection never reads it.)

## Accounts

**Sign up** (`POST`, anonymous): email, username, password.
- Email is unique case-insensitively; username is unique case-insensitively; password goes
  through `AUTH_PASSWORD_VALIDATORS`.
- On success the user is logged in (tokens returned) and lands on the dashboard with the
  existing "connect Saxo" empty states.
- Bot protection without a third-party service: a signup throttle per IP (e.g. 5 per hour) and a
  hidden honeypot field that must stay empty. (My call; Cloudflare Turnstile would need a
  Cloudflare account, which the owner wants to avoid.)
- No email verification step. (My call: it would add a second mail flow and a pending state for
  a site with a handful of users. The consequence: a mistyped email means that user cannot reset
  their password, and the signup form says so next to the field.)

**Log in** with email **or** username plus password, same `login` throttle as today. Error
message never says which part was wrong.

**Forgot password** (`POST`, anonymous): takes an email; always answers the same 200 ("if an
account exists for that address, a link is on its way"), throttled per IP. If the account exists
it sends a plain-text email with a link to the frontend's reset page carrying `uid` and a token
from Django's `PasswordResetTokenGenerator` (valid `PASSWORD_RESET_TIMEOUT`, set to 1 hour; it
stops working once the password changes or the link is used).

**Reset password** (`POST`, anonymous): `uid`, token, new password. Success logs out every other
session (blacklists the user's outstanding refresh tokens) and logs the user in.

**Account settings** (authenticated), a new "Account" section on the Settings page:
- change username (unique check);
- change email (requires current password);
- change password (requires current password; logs out other sessions, keeps this one);
- "Sign out everywhere" (blacklist all refresh tokens).
The header's displayed username updates after a change without a reload.

**Email delivery.** Django's SMTP backend configured from env: `EMAIL_HOST=smtp.gmail.com`,
`EMAIL_PORT=587`, `EMAIL_USE_TLS=1`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD` (a Gmail app
password), `DEFAULT_FROM_EMAIL`. Dev and tests use the console/locmem backend. If SMTP fails, the
forgot-password endpoint still answers 200 and logs the error. The owner's one-time setup
(2-step verification, app password, the server's `.env`) goes in `docs/deploying.md`.

## Migration of existing data

For each per-person model: add `user` nullable, backfill every existing row to the owner (as
decided in "Owner"), then make it non-null and swap the unique constraints. If a table has rows
and there are no users, the migration fails loudly.
`Investor.followed=True` rows become `InvestorFollow` rows for the owner; alerts with `read_at`
set become `FilingAlertRead` rows for the owner. The old fields are then removed.

The deploy's pre-migrate backup is the rollback path. Before merging, the plan runs the
migrations against a copy of the production database (a restored backup) and checks row counts
per user.

## Frontend

- Login page: "Email or username", plus "Create account" and "Forgot password?" links.
- New public routes: `/signup`, `/forgot-password`, `/reset-password` (reads `uid` and `token`
  from the query string). Same visual language as the login page.
- Settings → Account section as above.
- Banking navigation and pages hidden unless the current user is the owner. The backend tells
  the frontend through a `me` endpoint (`username`, `email`, `is_owner`), which also replaces
  reading the username from `localStorage`.

## Going public

The last step, done by the owner on the homelab, after everything above is deployed: route
`saxodash.uniroo.dev` through the public edge instead of Tailscale only. Before that:
- Django admin is disabled in production (`ADMIN_ENABLED`, default on in dev). (My call: its
  login is not throttled and nothing in production needs it; the shell covers user management.)
- A per-user isolation test exists (below) and passes.
- **The owner keeps Finnhub capacity strangers cannot take.** `finnhub._get` splits today's
  interactive share: a slice reserved for the owner's requests (my call: 20 of the ~43 a minute),
  and the rest shared by every other user combined. Background work keeps its own reserve. A
  non-owner who runs out gets the existing "try again in a minute" answer. Per-user DRF throttles
  stay as they are on top of this.
- **Anonymous throttles see the real client address.** Signup, login and forgot-password throttle
  per IP, so Django must read the client IP correctly behind the proxies (edge Caddy → compose
  `proxy` Caddy → gunicorn, plus anything added when going public). The number of trusted hops is
  configured from the environment (DRF `NUM_PROXIES`), and the plan verifies on the server that a
  request's recorded IP is the visitor's, and that a client-supplied `X-Forwarded-For` cannot
  change it. Login lockout is per IP and username, so a stranger hammering one address does not
  lock the owner out from theirs.
- **Any account may connect Saxo.** (The owner's answer: strangers may use the app to view their
  own Saxo portfolio.) Their syncs run against the owner's Saxo app limits; per-user syncs are
  paced like today's, and if that becomes a problem an allowlist can be added later.

## Testing

- Backend: for every per-person endpoint, a test that user B gets an empty list or 404 for user
  A's rows and cannot write to them. A single test that enumerates every model with a `user`
  field and fails when a new per-person model has no isolation test is welcome but not required.
- Sync: two users with credentials both sync; one with an expired token is marked and the other
  still syncs.
- Accounts: signup (duplicates, honeypot, throttle), login by email and by username, forgot
  password (same answer for unknown email, mail sent for a known one, token single-use and
  expiring), change username/email/password, sign out everywhere.
- Migration: a test that builds pre-migration rows and checks they end up on the owner.
- Frontend: vitest specs for the new pages and the Settings section.

## Left to the builder

Endpoint paths and serializer shapes; how the per-user filtering is factored (a queryset mixin,
a manager, or explicit filters, as long as it is hard to forget); the order of migrations per
app; email wording; page layout within DESIGN.md.
