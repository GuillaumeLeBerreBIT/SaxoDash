# Multi-user Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn single-user SaxoDash into a multi-user app: open signup, login by email or username, password reset by Gmail SMTP, account settings, and every per-person row owned by and filtered to its user, with the existing data attached to the owner.

**Architecture:** A new `users` app owns accounts, the owner flag (`Profile.is_owner`), auth endpoints and the request-scoped "acting user". Each domain app gains a `user` foreign key on its per-person models via a three-step migration (add nullable, backfill to the owner, make non-null), and its views/services filter by `request.user`. Saxo work is per user: market-data calls take an explicit `user`, sync tasks loop over users, and global background jobs run on the owner's credential.

**Tech Stack:** Django 5 + DRF + SimpleJWT (token blacklist already installed), Postgres 17, Celery; Vite + React 19, TanStack Query, vitest.

**Spec:** `docs/superpowers/specs/2026-11-07-multi-user-accounts-design.md`

## Global Constraints

- Branch `feat/multi-user-accounts` (worktree `.worktrees/multi-user`), PR into `develop`.
- Zero code comments in new or edited code (AGENTS.md). Test-first.
- Backend tests: `cd backend && ../../../backend/.venv/bin/python manage.py test <app>` (the worktree has no venv; copy `backend/.env` from the main checkout for the run and delete it after).
- Frontend checks: `cd frontend && npm test && npm run lint && npm run build`. Semantic colour utilities only; `noPaletteClasses.test.js` must pass.
- Per-person FKs: `user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='+')` unless a reverse name is needed; non-null after backfill.
- Throttle rates: `signup` `5/hour`, `password_reset` `5/hour`, `login` stays `10/min`. `PASSWORD_RESET_TIMEOUT = 3600`.
- Finnhub: owner reserve `FINNHUB_OWNER_RESERVE = 20` (env-overridable) on top of the existing `FINNHUB_CALLS_PER_MINUTE = 58` and `FINNHUB_BACKGROUND_RESERVE = 15`.
- Every anonymous auth endpoint answers identically whether or not an email/username exists.
- A new migration is not done until `manage.py migrate` has run against the dev database.

## Review Focus

1. **A view that still reads `.objects.all()` / `.first()` on a per-person model.** Expected: user B sees none of user A's rows. Pinned by Task 10's enumerating isolation test.
2. **Two users sharing one ticker or one Saxo trade id.** Expected: both can hold NVDA, both get their own note on NVDA, both sync without an IntegrityError. Pinned in Tasks 5 and 6 (`test_two_users_hold_same_ticker`, `test_two_users_note_same_symbol`).
3. **Case and whitespace in email/username.** `Alice@Example.com ` at signup and `alice@example.com` at login are one account; a second signup with `ALICE@example.com` is refused. Pinned in Task 2.
4. **One user's expired Saxo token during a sync tick.** Expected: their run is `skipped`, the other user's sync still writes rows. Pinned in Task 4 (`test_one_expired_user_does_not_stop_another`).
5. **Re-connecting Saxo as user B while user A is connected.** Expected: A's credential survives. Pinned in Task 4 (`test_callback_replaces_only_own_credential`).

---

### Task 0: Production facts (no code)

- [ ] **Step 1:** Over SSH on the homelab, list production users: `docker compose -f /opt/saxodash/deploy/compose.yaml exec web python manage.py shell -c "from django.contrib.auth import get_user_model as g; print(list(g().objects.values_list('username','email','is_superuser','date_joined')))"`. Record the answer in the PR description. Expected: one user, `demo`. If there are several, the owner's username must be set as `SAXODASH_OWNER` in `/srv/saxodash/.env` before the deploy that carries Task 1.
- [ ] **Step 2:** Ask the owner to check in the Saxo developer portal whether the live app allows users other than the app owner to authorise. Record the answer; it gates only the girlfriend's connection, not this plan.

### Task 1: `users` app, owner flag, test helper

**Files:**
- Create: `backend/users/{__init__,apps,models,owner,testing}.py`, `backend/users/migrations/0001_initial.py`, `backend/users/migrations/0002_pick_owner.py`, `backend/users/test_owner.py`
- Modify: `backend/backend/settings.py` (`INSTALLED_APPS`)

**Interfaces:**
- Produces: `users.models.Profile(user: OneToOne(related_name='profile'), is_owner: bool)` with `UniqueConstraint(fields=['is_owner'], condition=Q(is_owner=True), name='one_owner')`.
- Produces: `users.owner.owner() -> User | None`, `users.owner.is_owner(user) -> bool` (False for anonymous / no profile).
- Produces: `users.testing.make_user(username='u', *, email=None, password='pw-Strong-123', owner=False) -> User` (creates the Profile; `owner=True` sets `is_owner`).
- Produces: migration `users.0002_pick_owner`, which every per-person backfill migration depends on.

- [ ] **Step 1: Write failing tests** in `users/test_owner.py`:
  - `test_owner_is_none_without_profiles`: `owner()` is `None`.
  - `test_owner_returns_flagged_user`: `make_user('a', owner=True)`; `owner().username == 'a'`; `is_owner(that) is True`; `is_owner(make_user('b')) is False`; `is_owner(AnonymousUser()) is False`.
  - `test_second_owner_is_refused`: a second `owner=True` raises `IntegrityError`.
  - `test_pick_owner_single_user` / `test_pick_owner_uses_env` / `test_pick_owner_fails_without_env`: call the migration's `pick_owner(apps, schema_editor)` function directly (import it from the migration module via `importlib`) against users created in the test: one user → that user gets a Profile with `is_owner=True` and `is_superuser=True`; two users with `SAXODASH_OWNER=b` (patch `os.environ`) → `b`; two users without the env → raises `RuntimeError` naming `SAXODASH_OWNER`; zero users → no Profile, no error.
- [ ] **Step 2:** Run `manage.py test users`. Expected: fails, no module `users`.
- [ ] **Step 3:** Implement the model, `owner.py`, `testing.py`, `0001_initial`, and `0002_pick_owner` (`RunPython(pick_owner, noop)`; it also creates a non-owner Profile for every other existing user).
- [ ] **Step 4:** Add a `post_save` signal on the user model (in `users/apps.py` `ready`) that creates a Profile for each new user; test `test_new_user_gets_profile`.
- [ ] **Step 5:** Run `manage.py test users`, then the full suite. Expected: all pass.
- [ ] **Step 6:** Run `manage.py migrate` against the dev database; check `Profile.objects.get(is_owner=True).user.username == 'demo'`.
- [ ] **Step 7:** Commit `feat(users): profiles and the owner flag`.

### Task 2: Signup, login by email or username, me, account changes

**Files:**
- Create: `backend/users/{serializers,views,urls,authentication,test_accounts}.py`
- Modify: `backend/backend/auth_views.py` (login view uses the new serializer), `backend/backend/urls.py` (`path('api/auth/', include('users.urls'))`), `backend/backend/settings.py` (throttle rates, `REST_FRAMEWORK['NUM_PROXIES']` = `int(os.environ['NUM_PROXIES'])` when set, else `None`, `AUTHENTICATION_BACKENDS`)

**Interfaces:**
- Produces endpoints (all JSON):
  - `POST /api/auth/signup/` (anonymous, scope `signup`) `{email, username, password, website}` → 201 `{access, refresh, user: {username, email, is_owner}}`. `website` is the honeypot: non-empty → 400 with the same generic message as a validation failure.
  - `POST /api/token/` accepts `{username, password}` where `username` may be an email; same `login` throttle; error text `No account matches that login and password.`
  - `GET /api/auth/me/` → `{username, email, is_owner}`.
  - `PATCH /api/auth/me/` `{username}` → 200 me; `{email, current_password}` → 200 me.
  - `POST /api/auth/password/` `{current_password, new_password}` → 200 `{access, refresh}`; every other outstanding refresh token of the user is blacklisted.
  - `POST /api/auth/sign-out-everywhere/` → 205; all the user's outstanding refresh tokens blacklisted.
- Produces: `users.throttling.LoginThrottle` (replaces the `login` scope throttle on `/api/token/`): cache key is client IP **and** the lower-cased submitted login, rate `10/min`, so hammering one login from one address does not block the owner logging in from theirs.
- Produces: `users.backends.EmailOrUsernameBackend` (case-insensitive `iexact` on username or email, after `strip()`), `users.tokens.blacklist_all(user, except_jti=None)`, `users.tokens.issue(user) -> {access, refresh}`.

- [ ] **Step 1: Write failing tests** in `users/test_accounts.py` (APITestCase, `cache.clear()` in `setUp` for throttles):
  - `test_signup_creates_user_and_logs_in`: 201, tokens present, `user.is_owner is False`.
  - `test_signup_normalises_email`: `' Alice@Example.com '` stored as `alice@example.com`; then `ALICE@example.com` with another username → 400 `{'email': [...]}`.
  - `test_signup_refuses_duplicate_username_case_insensitive`.
  - `test_signup_runs_password_validators`: `'123'` → 400 `password`.
  - `test_signup_honeypot`: `website='x'` → 400, no user created.
  - `test_signup_throttled`: sixth signup from one IP in an hour → 429.
  - `test_login_with_email_and_with_username`: both return tokens; wrong password → 401 with the exact message above for both an unknown and a known login.
  - `test_me_get_and_change_username`; `test_change_username_to_taken_is_refused`.
  - `test_change_email_needs_current_password`: missing/wrong → 400, right → 200.
  - `test_change_password_keeps_this_session_and_ends_others`: issue two refresh tokens; change password using one; the returned refresh works at `/api/token/refresh/`; the other old one → 401.
  - `test_sign_out_everywhere`: both refresh tokens then → 401.
  - `test_login_throttle_is_per_ip_and_login`: eleven bad logins for `a` from one IP → 429; a login for `b` from the same IP still answers 401, and `a` from another IP still answers 401.
  - `test_client_ip_ignores_spoofed_forwarded_for_without_proxies`: with `NUM_PROXIES=None`, six signups with different `HTTP_X_FORWARDED_FOR` from one `REMOTE_ADDR` → sixth is 429.
- [ ] **Step 2:** Run `manage.py test users`. Expected: the new tests fail (404s).
- [ ] **Step 3:** Implement backend, serializers, views, token helpers and URLs.
- [ ] **Step 4:** Run `manage.py test users backend`. Expected: pass.
- [ ] **Step 5:** Commit `feat(users): signup, login by email, account settings`.

### Task 3: Password reset by email

**Files:**
- Create: `backend/users/reset.py`, `backend/users/test_reset.py`
- Modify: `backend/users/{views,urls}.py`, `backend/backend/settings.py` (`EMAIL_BACKEND` = SMTP when `EMAIL_HOST` is set, else console; `EMAIL_HOST`, `EMAIL_PORT` (587), `EMAIL_USE_TLS` (True), `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `DEFAULT_FROM_EMAIL`, `PASSWORD_RESET_TIMEOUT = 3600`), `docs/deploying.md` (Gmail app-password setup and the six env lines)

**Interfaces:**
- Produces: `POST /api/auth/password-reset/` `{email}` (anonymous, scope `password_reset`) → always 200 `{detail: 'If an account exists for that address, a link is on its way.'}`.
- Produces: `POST /api/auth/password-reset/confirm/` `{uid, token, new_password}` → 200 `{access, refresh}` or 400 `{detail: 'This reset link is invalid or has expired.'}`.
- Produces: `users.reset.send_reset_link(user) -> None`; link is `f'{settings.FRONTEND_URL}/reset-password?uid={urlsafe_base64(pk)}&token={default_token_generator.make_token(user)}'`.

- [ ] **Step 1: Write failing tests** (`locmem` email backend):
  - `test_reset_known_email_sends_one_mail`: one message to that address, body contains `/reset-password?uid=` and the token.
  - `test_reset_unknown_email_same_answer_no_mail`: same status and body as the known case; `mail.outbox == []`.
  - `test_reset_smtp_failure_still_200`: patch `send_mail` to raise `SMTPException`; 200, and the error is logged (`assertLogs('users.reset', 'ERROR')`).
  - `test_confirm_sets_password_and_ends_other_sessions`: old refresh token → 401 afterwards; login with new password works.
  - `test_confirm_token_single_use`: second confirm with the same token → 400.
  - `test_confirm_expired_token`: `override_settings(PASSWORD_RESET_TIMEOUT=0)` or patch time → 400.
  - `test_reset_throttled`: sixth request in an hour → 429.
- [ ] **Step 2:** Run; expected fail. **Step 3:** Implement. **Step 4:** Run `manage.py test users`; expected pass.
- [ ] **Step 5:** Commit `feat(users): password reset by email`.

### Task 4: Saxo per user

**Files:**
- Modify: `backend/saxo/{models,credentials,views,tasks}.py`, `backend/saxo/migrations/` (new), `backend/research/market.py`, every caller of `market.chart/search/details/quotes` (`research/views.py`, `research/calendar_enrichment.py`, `research/scan.py`, `research/daily.py`, `analytics/benchmarks.py`, `investors/price_feed.py`), `backend/portfolio/closed_positions.py`, `backend/research/tasks.py` (`_scan_with_credential`), `backend/investors/tasks.py` (`_refresh_copies`), `backend/mcp_server/{envelope,views}.py`, `backend/mcp_server/tools/system.py`, the existing saxo/research/analytics/investors tests that build credentials
- Test: `backend/saxo/test_multi_user.py`

**Interfaces:**
- Consumes: `users.owner.owner()`, `users.testing.make_user`.
- Produces: `SaxoCredential.user` (OneToOne, non-null after backfill); `SyncRun.user` (nullable FK).
- Produces: `saxo.credentials.connection_state(user) -> ConnectionState`, `active_credential(user) -> SaxoCredential` (raises `SaxoNotConnected`), `last_successful_sync(user)`, `latest_run_per_task(user)`, `worst_recent_outcome(user)`.
- Produces: `synced(fn=None, *, reports_health=True, task=None, credential='each')` where `credential` is `'each'` (run `fn(credential)` once per user who has a `SaxoCredential`, each in its own `transaction.atomic()` and its own `SyncRun(user=…)`, an exception recorded as `failed` for that user and re-raised only after every user ran), `'owner'` (the owner's credential; with no owner, or an owner without a usable credential, one `SyncRun(outcome='skipped', user=owner-or-None)`), or `None` (no credential, `SyncRun.user=None`). The old `needs_credential=False` becomes `credential=None`.
- Produces: `market.chart(uic, asset_type, horizon, count, *, user)`, `market.search(keywords, asset_types='Stock,Etf', *, user)`, `market.details(uic, asset_type, *, user)`, `market.quotes(uics, asset_type, *, user)`; `active_credential(user)` is called **before** the cache lookup, so an unconnected user gets `ProviderNotConnected` even on a cache hit. Cache keys unchanged.
- Produces: `closed_positions.for_year(year, today=None, *, user)`, cache key gains `user.pk`.

- [ ] **Step 1: Write failing tests** in `saxo/test_multi_user.py`:
  - `test_callback_attaches_credential_to_ticket_user` (ticket signed for B → credential.user is B).
  - `test_callback_replaces_only_own_credential` (A connected; B connects; A's row unchanged).
  - `test_status_is_per_user` (A connected, B not: `/api/saxo/status/` answers `connected` true for A, false for B).
  - `test_sync_positions_runs_for_every_connected_user` (two credentials, `client.get_positions` patched by token → each user's positions written to that user).
  - `test_one_expired_user_does_not_stop_another` (A's credential `needs_reauth=True`: A gets `SyncRun(outcome='skipped', user=A)`, B gets `ok` with rows).
  - `test_refresh_token_refreshes_each_credential`.
  - `test_unconnected_user_gets_409_even_when_chart_is_cached` (A fetches a chart, B not connected requests the same → 409).
  - `test_owner_tasks_use_owner_credential` (`_scan_with_credential` receives the owner's credential while a non-owner is also connected).
- [ ] **Step 2:** Run `manage.py test saxo.test_multi_user`; expected fail.
- [ ] **Step 3:** Migration: add `user` nullable to `SaxoCredential` and `SyncRun`; `RunPython` backfills `SaxoCredential` and existing `SyncRun` rows to `Profile.objects.get(is_owner=True).user_id` (depends on `users.0002_pick_owner`; if rows exist and no owner → `RuntimeError`); then `SaxoCredential.user` non-null and unique.
- [ ] **Step 4:** Implement credentials, callback (`SaxoCredential.objects.filter(user=user).delete()` then create), status view, `synced`, token refresh loop, `market` signatures and every caller (request-serving callers pass `request.user`; scan, price feed and copy refresh pass `owner()`); MCP envelope/system tools resolve the MCP user via `mcp_server.views` and pass it.
- [ ] **Step 5:** Run `manage.py test saxo research analytics investors portfolio mcp_server`, updating existing tests to create credentials with `user=make_user(...)`. Expected: all pass.
- [ ] **Step 6:** `manage.py migrate` on dev; commit `feat(saxo): one Saxo connection per user`.

### Task 5: Portfolio, transactions, net worth and accounts per user

**Files:**
- Modify: `backend/portfolio/{models,views,services,serializers,insights,tax_year,sectors,tasks}.py`, `backend/transactions/{models,views,filters}.py`, `backend/core/{models,services,views,tasks}.py`, `backend/accounts/{models,services,views}.py`, `backend/analytics/{views,report}.py`, `backend/saxo/tasks.py` (writes carry `credential.user`), `backend/enablebanking/{tasks,mapping}.py` (bank accounts created for the owner), management commands `seed_demo_data`, `purge_demo_data`, `repair_networth_history`, `backfill_position_sectors` (each takes `--user <username>`, default the owner), `backend/mcp_server/tools/portfolio.py`, migrations in `portfolio`, `transactions`, `core`, `accounts`, and the existing tests of these apps
- Test: `backend/portfolio/test_multi_user.py`

**Interfaces:**
- Consumes: Task 4's per-user `synced` (`fn(credential)`; `credential.user` is the owner of written rows).
- Produces: `user` FK on `Position`, `PortfolioValuation`, `Transaction`, `NetWorthSnapshot`, `BankAccount`. Uniques become: `Position (user, ticker)`, `PortfolioValuation (user, source)`, `Transaction (user, saxo_trade_id)` (still allowing many nulls), `NetWorthSnapshot (user, date)`, `BankAccount (user, <field at accounts/models.py:18>)`.
- Produces: `portfolio.services.get_portfolio_value(user)`, `core.services` net-worth functions take `user`; `core.tasks.snapshot_net_worth` writes one snapshot per user who has any position or bank account.

- [ ] **Step 1: Write failing tests** in `portfolio/test_multi_user.py`:
  - `test_two_users_hold_same_ticker` (two `Position(ticker='NVDA')` rows, one per user, no IntegrityError; `/api/portfolio/positions/` shows each user only theirs).
  - `test_summary_and_net_worth_are_per_user` (A's positions do not change B's summary, net worth or history).
  - `test_transactions_are_per_user`, `test_bank_accounts_are_per_user` (list, detail 404, update 404, delete 404 for the other user).
  - `test_snapshot_net_worth_writes_one_row_per_user`.
  - `test_saxo_sync_writes_cash_account_for_credential_user`.
- [ ] **Step 2:** Run; expected fail.
- [ ] **Step 3:** Migrations per app (add nullable → backfill to owner, same rule as Task 4 → non-null → swap uniques).
- [ ] **Step 4:** Scope every queryset and service by user; views use `request.user`; tasks use `credential.user`.
- [ ] **Step 5:** Run `manage.py test portfolio transactions core accounts analytics saxo enablebanking mcp_server`, updating existing tests. Expected: all pass.
- [ ] **Step 6:** `manage.py migrate` on dev; commit `feat(portfolio): positions, transactions, net worth and accounts per user`.

### Task 6: Research per user

**Files:**
- Modify: `backend/research/{models,views,serializers,watchlists,thesis,tasks,calendar_enrichment,listings}.py`, `backend/portfolio/serializers.py` (SymbolNote lookup), `backend/investors/summaries.py`, `backend/mcp_server/tools/research.py`, migration in `research`, existing research tests
- Test: `backend/research/test_multi_user.py`

**Interfaces:**
- Produces: `user` FK on `Watchlist`, `SymbolNote`, `PriceLine`, `TrendLine`, `TextAnnotation` (`WatchlistItem` follows its watchlist). Uniques: `SymbolNote (user, symbol)`; indexes `(user, uic, asset_type)` on the three line models.
- Produces: `research.tasks.sync_watchlists` reconciles each user's watchlists against that user's positions.
- Produces: `calendar_enrichment.enrich(rows, *, user)` tags held/watched for that user and fetches closes with that user's credential (no credential → only `ScreenerRow.recent_closes`).

- [ ] **Step 1: Write failing tests:** `test_two_users_note_same_symbol`; `test_watchlists_are_per_user` (list, add item, delete → 404 across users); `test_lines_are_per_user` (price, trend, text: list filtered, write to another user's line 404); `test_sync_watchlists_per_user`; `test_earnings_calendar_tags_requesting_users_holdings`.
- [ ] **Step 2:** Run; fail. **Step 3:** Migration with backfill. **Step 4:** Scope. **Step 5:** `manage.py test research portfolio investors mcp_server`; pass.
- [ ] **Step 6:** Migrate dev; commit `feat(research): watchlists, notes and chart lines per user`.

### Task 7: Advisor journal per user

**Files:** Modify `backend/advisor/{models,journal,serializers}.py`, `backend/mcp_server/tools/` journal tools, migration in `advisor`, existing advisor/MCP tests. Test: `backend/advisor/test_multi_user.py`.

**Interfaces:** `Recommendation.user` FK; `advisor.journal` functions take `user` as the first argument; MCP tools pass the MCP user.

- [ ] **Step 1:** Tests `test_journal_is_per_user` (record as A, list as B → empty) and `test_mcp_records_for_mcp_user`.
- [ ] **Step 2–5:** fail → migration with backfill → implement → `manage.py test advisor mcp_server` pass.
- [ ] **Step 6:** Migrate dev; commit `feat(advisor): journal per user`.

### Task 8: Investors: follows, alert read state, who may change shared data

**Files:**
- Modify: `backend/investors/{models,views,alerts,ownership,signals,summaries}.py`, `backend/research/views.py` (`StartDiscoverScanView` owner only), `backend/mcp_server/tools/smart_money.py`, migrations in `investors`, existing investors tests
- Test: `backend/investors/test_multi_user.py`

**Interfaces:**
- Produces: `InvestorFollow(user, investor)` unique pair; `FilingAlertRead(user, alert)` unique pair; `Investor.added_by` (nullable FK, `SET_NULL`). Removes `Investor.followed` and `FilingAlert.read_at` after copying them to the owner.
- Produces: `users.permissions.IsOwner` (DRF permission using `is_owner`).
- Produces: `alerts.record` raises an alert when **any** user follows the investor; `alerts.inbox(user)` returns alerts for investors that user follows, with `read` from `FilingAlertRead`.

- [ ] **Step 1: Write failing tests:** `test_follow_is_per_user`; `test_inbox_and_read_state_are_per_user`; `test_alert_raised_when_any_user_follows`; `test_non_owner_cannot_start_discover_scan` (403) and owner can (202 or the existing code); `test_any_user_may_add_investor_and_added_by_is_set`; `test_remove_investor_rules` (owner may; the adder may when no other user follows; the adder gets 403 when someone else follows; a third user gets 403; curated investors stay unremovable).
- [ ] **Step 2–5:** fail → migrations (create tables, copy `followed`/`read_at` to the owner, drop fields) → implement → `manage.py test investors research mcp_server` pass.
- [ ] **Step 6:** Migrate dev; commit `feat(investors): follows and alerts per user`.

### Task 9: Banking owner only, Finnhub owner reserve

**Files:**
- Create: `backend/users/acting.py`, `backend/users/test_acting.py`
- Modify: `backend/users/authentication.py` (`JWTAuthentication` subclass that sets the acting user), `backend/backend/settings.py` (`DEFAULT_AUTHENTICATION_CLASSES` → `users.authentication.JWTAuthentication`; `FINNHUB_OWNER_RESERVE`), `backend/research/finnhub.py` (`_spend_call`), every view in `backend/enablebanking/views.py` (`permission_classes = [IsAuthenticated, IsOwner]`; the OAuth callback keeps its existing guard), `backend/enablebanking` tests

**Interfaces:**
- Produces: `users.acting.current_user() -> User | None` backed by a `ContextVar`, set by `users.authentication.JWTAuthentication.authenticate` and reset by `users.acting.ActingUserMiddleware` at the end of each request.
- Produces: `_spend_call()` allows `FINNHUB_CALLS_PER_MINUTE - background_reserve` when inside `background_calls()` or when `is_owner(current_user())`; otherwise also minus `FINNHUB_OWNER_RESERVE`.

- [ ] **Step 1: Write failing tests:** `test_non_owner_is_refused_banking` (each enablebanking list endpoint → 403 for a non-owner, 200 for the owner); `test_non_owner_hits_shared_cap_first` (with the budget at `58-15-20` spent, a non-owner call raises `FinnhubBusy`, an owner call succeeds); `test_acting_user_reset_after_request`.
- [ ] **Step 2–4:** fail → implement → `manage.py test users research enablebanking` pass.
- [ ] **Step 5:** Commit `feat: banking for the owner only, a Finnhub share strangers cannot take`.

### Task 10: The isolation sweep

**Files:** Create `backend/users/test_isolation.py`.

- [ ] **Step 1:** Write `test_every_per_person_model_is_covered`: iterate `django.apps.apps.get_models()`, collect models with a field named `user` pointing at `AUTH_USER_MODEL` (plus `InvestorFollow`, `FilingAlertRead`), and assert the set equals a literal `COVERED` set in the test file; adding a per-person model without adding it there fails.
- [ ] **Step 2:** Write `test_no_endpoint_leaks_rows`: create user A with one row of every covered model (factories inline), log in as B, `GET` every list endpoint under `/api/` that is reachable by a non-owner (resolve from `backend.urls` patterns with no required args, skipping `auth/` and `token/`), and assert none of A's identifying values (ticker `ZZZA`, note text `a-secret`, etc.) appear in any response body.
- [ ] **Step 3:** Run; fix any leak in the owning app. Run the full backend suite. Expected: all pass except the two pre-existing Saxo authorize-URL failures (note them in the PR).
- [ ] **Step 4:** Commit `test: no endpoint returns another user's rows`.

### Task 11: Frontend: login, signup, forgot and reset password

**Files:**
- Create: `frontend/src/pages/{Signup,ForgotPassword,ResetPassword}.jsx` with tests, `frontend/src/api/client/auth.js`
- Modify: `frontend/src/pages/Login.jsx` (+test), `frontend/src/App.jsx` (public routes `signup`, `forgot-password`, `reset-password`), `frontend/src/api/client/{http,index}.js`

**Interfaces:**
- Produces: `signup({email, username, password, website})`, `requestPasswordReset(email)`, `confirmPasswordReset({uid, token, newPassword})` in `api/client/auth.js`; signup and confirm store tokens via the existing `setTokens`.

- [ ] **Step 1: Write failing tests:** Login shows the label "Email or username" and links to `/signup` and `/forgot-password`; Signup submits the four fields (honeypot visually hidden, `tabIndex=-1`, `autoComplete="off"`, `aria-hidden`), shows server field errors, shows the hint "We only use this to send you a password reset link. A typo means you can't reset it." under email, and navigates to `/` on success; ForgotPassword always shows the server's sentence after submit; ResetPassword reads `uid`/`token` from the query string, submits, navigates to `/` on success, shows the invalid-link message on 400 with a link back to `/forgot-password`.
- [ ] **Step 2:** `npm test -- Login Signup ForgotPassword ResetPassword`; fail.
- [ ] **Step 3:** Implement with the Login page's existing layout and primitives (`Input`, `Button`, `Card`).
- [ ] **Step 4:** `npm test && npm run lint && npm run build`; pass.
- [ ] **Step 5:** Commit `feat(frontend): signup and password reset pages`.

### Task 12: Frontend: Account settings, current user, banking hidden

**Files:**
- Create: `frontend/src/api/queries/auth.js` (`useMe`, `useUpdateMe`, `useChangePassword`, `useSignOutEverywhere`), `frontend/src/components/settings/AccountSettings.jsx` (+test)
- Modify: `frontend/src/pages/Settings.jsx` (+test; section `account` first in `SECTIONS` and `BODIES`), `frontend/src/api/client/http.js` (`getUsername` removed; callers use `useMe`), `frontend/src/components/TopBar.jsx`, `frontend/src/lib/navigation.js`, `frontend/src/components/MobileNav.jsx`, `frontend/src/components/CommandPalette.jsx`, `frontend/src/pages/Money.jsx` (+tests)

**Interfaces:**
- Consumes: `/api/auth/me/` (`{username, email, is_owner}`).
- Produces: navigation entries carry `ownerOnly`; Money's `spending` and `transactions` sections and the Enable Banking connection panel render only when `is_owner`; the `accounts` section renders for everyone.

- [ ] **Step 1: Write failing tests:** AccountSettings changes the username and the TopBar shows the new one without reload (query invalidation); email change requires the current password field; password change shows success and keeps the user logged in; "Sign out everywhere" calls the endpoint and logs out locally; a non-owner sees no Spending/Transactions tabs on Money and no banking entries in the command palette; an owner sees them.
- [ ] **Step 2:** Run; fail. **Step 3:** Implement within DESIGN.md panel anatomy. **Step 4:** `npm test && npm run lint && npm run build`; pass.
- [ ] **Step 5:** Screenshot-review Settings → Account and Signup at 1440 and 390 px in Republic and Porcelain (saxodash-design-system recipe).
- [ ] **Step 6:** Commit `feat(frontend): account settings, banking only for the owner`.

### Task 13: Production readiness and docs

**Files:**
- Modify: `backend/backend/urls.py` (admin only when `settings.ADMIN_ENABLED`), `backend/backend/settings.py` (`ADMIN_ENABLED = env bool, default DEBUG`), `backend/core/test_production.py`, `docs/deploying.md` ("Going public" checklist: `NUM_PROXIES` equal to the hops in front of gunicorn, the verification in Step 3, the email env), `AGENTS.md` ("Decided": accounts and the owner, per-user scoping rule, Finnhub owner reserve), `docs/running-the-stack.md` (dev mail goes to the console)

- [ ] **Step 1:** Test `test_admin_absent_when_disabled` (`/admin/` → 404 with `ADMIN_ENABLED=False`). Run, fail, implement, pass.
- [ ] **Step 2:** Dry-run the migrations on a copy of production: restore the newest `/srv/saxodash/backups` dump into a scratch Postgres (`deploy/restore.sh` documents the command; use a throwaway database name), run `manage.py migrate`, and record per-model row counts before and after plus `Profile.objects.get(is_owner=True)` in the PR. Expected: counts unchanged, every row's `user` is the owner.
- [ ] **Step 3:** After deploy, on the server: request `/api/auth/me/` with a forged `X-Forwarded-For: 1.2.3.4` and confirm the throttle cache key (or a temporary log line removed afterwards) shows the visitor's real address, not `1.2.3.4` and not the proxy's. Set `NUM_PROXIES` accordingly.
- [ ] **Step 4:** Write a learning record if anything surprised (`learning/learning-records/NNNN-*.md`).
- [ ] **Step 5:** Commit `docs: accounts, the owner and going public`; push; open the PR into `develop`.
