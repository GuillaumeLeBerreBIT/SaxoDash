# Pre-deployment security gate

**Created:** 2026-09-02
**Status:** Open — blocking any deployment beyond localhost

Two findings from the 2026-09-01 code quality pass are tolerable only while
SaxoDash runs on `localhost`. Both stop being theoretical the moment the
backend is reachable from another machine. Neither is a cleanup; together they
are the condition for deploying at all.

Two sibling findings from the same pass were **closed on 2026-09-02** and are
recorded at the bottom for context.

---

## 1. `/api/saxo/connect/` accepts unauthenticated requests

**Severity:** high once deployed — account takeover of the Saxo link.

### The problem

`SaxoConnectView.permission_classes = [AllowAny]`. Anyone who can reach the
backend can hit `/api/saxo/connect/`, complete the OAuth flow against *their*
Saxo login, and land on the callback. The callback then deletes every stored
credential and writes theirs. Your dashboard subsequently renders their
positions, and your sync tasks authenticate as them.

The `state` parameter does not help. It defends against CSRF — an attacker
forcing *your* browser through the flow — not against an attacker running the
whole flow themselves in their own browser, where they legitimately hold the
matching session cookie.

### Why it is `AllowAny` today

The connect step is a full-page browser redirect (`window.location.href` in
`connectSaxo`). A redirect cannot carry an `Authorization: Bearer` header, so
the view has no JWT to authenticate against. Requiring `IsAuthenticated` would
simply break the flow.

### Approach — short-lived signed connect ticket

1. New authenticated endpoint `POST /api/saxo/connect-ticket/`
   (`IsAuthenticated`). Returns a signed, single-use token with a short TTL —
   `django.core.signing.TimestampSigner` is enough; no new dependency.
2. `connectSaxo()` in `frontend/src/api/client.js` calls that endpoint via
   `apiFetch` (so it carries the JWT), then redirects to
   `/api/saxo/connect/?ticket=<token>`.
3. `SaxoConnectView` stays `AllowAny` at the DRF level but validates the ticket
   (`max_age` ~120s) and 403s without a valid one. Only then does it mint the
   OAuth `state` and redirect to Saxo.
4. Burn the ticket — store the used value briefly, or bind it to the session —
   so a leaked URL cannot be replayed.

**Touches:** `backend/saxo/views.py`, `backend/saxo/urls.py`,
`frontend/src/api/client.js`, `frontend/src/components/SaxoConnectionStatus.jsx`.

### Tests to write

- No ticket → 403, and no OAuth redirect issued.
- Expired ticket (freeze time past `max_age`) → 403.
- Ticket replayed after use → 403.
- Valid ticket → 302 to the Saxo authorize URL, `state` stored in session.

---

## 2. JWTs are stored in `localStorage`

**Severity:** medium once deployed — full session theft via any XSS.

### The problem

`login()` writes `access` and `refresh` into `localStorage`. Any script running
on the origin can read both. The refresh token is valid for 30 days, so a
single successful XSS yields a long-lived credential usable from anywhere.

Be honest about the threat model: React escapes the Saxo-sourced strings the
app renders, and there is no user-generated content, so the realistic vector is
a compromised npm dependency rather than reflected input. httpOnly cookies stop
an attacker *exfiltrating* the token for later use elsewhere; they do not stop
one acting through the page while it is open. It is a real improvement, not a
complete fix.

### Approach — httpOnly refresh cookie

Move the refresh token to an httpOnly, `Secure`, `SameSite=Lax` cookie and keep
the short-lived access token in memory only (a module variable, not
`localStorage`).

1. Custom `TokenObtainPairView` that sets the refresh cookie instead of
   returning it in the body.
2. `TokenRefreshView` reads the refresh token from the cookie.
3. `TokenLogoutView` (already exists) reads from the cookie and clears it.
4. Frontend drops both `localStorage` token entries; `apiFetch` keeps the
   access token in a closure and calls refresh with `credentials: 'include'`.
5. CORS: `CORS_ALLOW_CREDENTIALS = True`, and the origin list must be exact —
   no wildcard.
6. Add CSRF protection to the cookie-authenticated endpoints, since cookie auth
   reintroduces CSRF that bearer tokens avoided.

**Watch out:** an access token held only in memory is lost on refresh (F5), so
the app must attempt a silent refresh on mount. `isAuthenticated()` can no
longer read `localStorage` — `RequireAuth` needs rethinking, probably an
auth-state context seeded by that silent refresh.

**Touches:** `backend/backend/auth_views.py`, `backend/backend/urls.py`,
`backend/backend/settings.py`, `frontend/src/api/client.js`,
`frontend/src/components/RequireAuth.jsx`, `frontend/src/pages/Login.jsx`.

### Tests to write

- Login sets an httpOnly cookie and does **not** return `refresh` in the body.
- Refresh succeeds with only the cookie present.
- Logout clears the cookie and blacklists the token.
- A page reload with a valid cookie restores an authenticated session.

---

## Suggested order

Do **1** first. It is the smaller change, it has the higher severity, and it
does not touch the auth flow the whole app depends on. **2** is a genuine
refactor of authentication and deserves its own branch.

Also run `manage.py check --deploy` before the first deploy — the
`DEBUG=False` settings block added on 2026-09-01 covers HSTS, SSL redirect and
secure cookies, but the check will flag anything still missing.

---

## Closed on 2026-09-02

| Finding | Resolution |
|---|---|
| Refresh tokens rotated but were never blacklisted, so logout revoked nothing | Added `token_blacklist` app + `BLACKLIST_AFTER_ROTATION`, plus `POST /api/token/logout/` and a frontend `logout()` that calls it. 6 tests, including one proving a rotated-away token is rejected. |
| `BankAccount.bank` was the sync key, so a duplicate or case mismatch crashed `sync_account_balance` with `MultipleObjectsReturned` | Added `BankAccount.external_id` (unique, nullable), mirroring `Transaction.saxo_trade_id`. Sync upserts on `'saxo:cash'`. Data migration `0004` folds pre-existing duplicates onto one row. |
