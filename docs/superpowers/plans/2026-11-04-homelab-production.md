# SaxoDash on the homelab — implementation plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. One phase is
> one pull request; do not start a phase before the previous one is merged.

**Goal:** SaxoDash runs on the homelab at `https://saxodash.uniroo.dev` (tailnet-only),
on Postgres, deployed automatically on every push to `main` after CI passes, with
nightly and pre-deploy backups. The real history moves from the Mac's SQLite once.

**Spec:** `docs/superpowers/specs/2026-11-02-cicd-homelab-design.md` (approved). The edge
proxy that fronts it already runs on the server: `GuillaumeLeBerreBIT/homelab`,
`edge/` and `docs/adding-an-app.md`.

**Architecture:**

```
edge Caddy (homelab repo) ──edge network, alias "saxodash"──► proxy (Caddy: built SPA + /api/ → web)
                                                                │
                                         saxodash default network: web (gunicorn) · worker · beat
                                                                    postgres (/srv/saxodash/postgres) · redis
```

## Global constraints

- **AGENTS.md applies**: zero comments in generated code; backend test-first with
  `APITestCase`; frontend specs alongside frontend changes; a learning record when
  something surprising turns up.
- **Secrets never in GitHub.** No repository or environment secrets for app keys.
  Production reads `/srv/saxodash/.env` (root, 600) on the server only.
- **No script contains `down -v`** or anything else that removes a volume or `/srv`.
- **The Mac keeps working throughout** with `scripts/dev.sh`. After Phase 1 it needs
  Docker for the local Postgres; nothing else changes for daily development.
- **The Mac's `backend/db.sqlite3` and `backend/backups/` are not touched** until the user
  confirms the server's data is right (Phase 5).
- **Versions:** Python 3.13, Node 22, Postgres 17, Redis 7, Caddy 2.10.2, each pinned in
  images and CI.
- **Only a commit on `main` that passed CI is deployed**, and the server pulls it. Nothing on
  GitHub, pull requests included, can start anything on the homelab.

---

## Phase 1 — Postgres (PR 1)

Riskiest change, landed alone, so a test failing on Postgres is fixed before anything
else depends on it.

- [x] Add `psycopg[binary]` to `backend/requirements.txt` (and the root copy, which the
      last sync kept identical).
- [x] `DATABASES` from `DATABASE_URL` (parsed with `urllib.parse`; no new dependency),
      default `postgres://saxodash:saxodash@localhost:5432/saxodash`, with
      `CONN_MAX_AGE=60` and `CONN_HEALTH_CHECKS=True`. Remove the SQLite block and its
      WAL / `transaction_mode` options. Test: settings parse a URL with user, password,
      host, port and name, and reject a non-postgres scheme.
- [x] `scripts/dev.sh`: a `postgres` service (Docker `postgres:17`, port from
      `backend/.env` `POSTGRES_PORT`, data in a named volume `saxodash-dev-pg`), gated on
      `pg_isready`, started before `web`/`worker`/`beat`, reused when already running like
      redis is. `--no-postgres` falls out of the service table. Update
      `docs/running-the-stack.md` and `backend/.env.example`.
- [x] Run the full suite on Postgres; fix what SQLite let through. Expected kinds:
      case-sensitive `LIKE`/`contains`, `CharField` max length now enforced, unordered
      querysets whose order tests relied on, `saxo/test_models.py`'s raw cursor,
      `IntegrityError` inside a test without `atomic()`, sequences after explicit-pk
      inserts. Each fix is the code's fault or the test's, decided case by case, never
      `skip`.
- [x] `makemigrations --check` clean on Postgres.
- [x] Backups for Postgres, moved here from Phase 2: the SQLite backup could no longer
      work, and its tests only passed because they faked an SQLite database.
      `core/backup.py` runs `pg_dump --format=custom` into `DB_BACKUP_DIR` as
      `db-<stamp>.dump.partial`, renamed on success. It keeps every dump from the newest
      `DB_BACKUP_RETAIN` (14) days plus the first of each of the newest
      `DB_BACKUP_MONTHLY` (6) months, and never touches the old `db-*.sqlite3` files.
- [x] AGENTS.md: replace "SQLite runs in WAL with `transaction_mode=IMMEDIATE`" with what
      replaced it (Postgres, row-level locking, why the WAL/IMMEDIATE workaround is gone) and
      update the Stack line.
- [x] Learning record for whatever Postgres caught that SQLite hid.

**Done when:** `manage.py test` is green against Postgres locally, `scripts/dev.sh` brings
the stack up on Postgres from a clean machine, and the Mac's real data is still in
`db.sqlite3` untouched (dev starts from an empty Postgres; Phase 5 is the copy).

## Phase 2 — Production images and stack (PR 2)

- [x] `backend/Dockerfile`: `python:3.13-slim`, non-root user, `requirements.txt`, the app,
      `postgresql-client-17` (for `pg_dump`/`pg_restore`), `collectstatic`, default command
      gunicorn on `0.0.0.0:8000`. The same image runs `web`, `worker`, `beat` and one-off
      `migrate` with a different command.
- [x] `gunicorn` added to requirements.
- [x] `frontend/Dockerfile` (multi-stage): `node:22` builds with `VITE_API_BASE_URL=""`
      (same origin; `http.js` uses `??`, so the empty string is kept), then
      `caddy:2.10.2` serves `dist/` with SPA fallback and proxies `/api/`, `/admin/` and
      `/static/` to `web:8000`. Its Caddyfile sets `trusted_proxies static private_ranges`
      so the edge's `X-Forwarded-Proto` survives. This image is the `proxy` service.
- [x] Production settings, each test-first:
  - [x] `SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')` when `DEBUG` is
        off. Test: a request with the header over plain HTTP is not redirected; one
        without it is.
  - [x] `SECURE_SSL_REDIRECT` exempts `/healthz` so the deploy can probe `web` directly.
  - [x] WhiteNoise serves Django's own static files (admin, DRF) from `STATIC_ROOT`, so
        `proxy` forwards `/static/` to `web` instead of sharing a volume.
  - [x] `STATIC_ROOT` for `collectstatic` (admin and DRF assets).
  - [x] `DEBUG=False` refuses to start without `ALLOWED_HOSTS` and a real
        `SAXO_TOKEN_ENCRYPTION_KEY`.
- [x] `GET /healthz`: 200 when a `SELECT 1` and a cache round-trip succeed, 503 otherwise,
      `AllowAny`, no data in the body. Tests for both.
- [x] `deploy/compose.yaml` (project `saxodash`): `postgres` (bind `/srv/saxodash/postgres`,
      healthcheck), `redis` (named volume), `web`, `worker` (`--concurrency=2`), `beat`,
      `proxy` (no `ports:`; networks `default` + external `edge` with alias `saxodash`).
      `env_file: /srv/saxodash/.env` for the app services; images tagged `${SAXODASH_TAG}`.
- [x] `deploy/.env.example`: every production variable with its production value or a
      blank for a secret (`DEBUG=False`, `ALLOWED_HOSTS=saxodash.uniroo.dev`,
      `CSRF_TRUSTED_ORIGINS`/`FRONTEND_URL=https://saxodash.uniroo.dev`,
      `SAXO_ENVIRONMENT=live`, `SAXO_REDIRECT_URI=https://saxodash.uniroo.dev/api/saxo/callback/`,
      `DATABASE_URL`, `CACHE_URL`, `CELERY_BROKER_URL`, `DB_BACKUP_DIR=/backups`, …).
- [x] Backups in the stack: the image carries `postgresql-client-17` (Phase 1 already
      rewrote `core/backup.py` for `pg_dump`). `/srv/saxodash/backups` is mounted at
      `/backups` in `web` and `worker`, and `manage.py backup_database` is what the deploy
      calls.
- [x] `deploy/restore.sh <file>`: refuses without an explicit file, stops `web`/`worker`/`beat`,
      `pg_restore --clean --if-exists` into the running `postgres`, starts them again.
- [x] Local check, without a Docker daemon in the build environment. `docker compose config`
      validates and resolves the stack. The frontend built with an empty `VITE_API_BASE_URL`
      calls `/api/...` with no `localhost:8000` left. gunicorn with `DEBUG=False`: `/healthz`
      200 over HTTP; proxied HTTPS passes; plain HTTP is redirected; HSTS is set; static
      files are served; a wrong host gets 400. `restore.sh`'s `pg_restore` flags restore a
      populated database. **The images themselves are first built by CI (Phase 3).**

**Done when:** the stack starts from the images alone, `/healthz` is 200, login works,
the SPA loads with no request to `localhost:8000`, and a backup restores into a scratch
database.

## Phase 3 — CI and branch model (PR 3)

- [x] `.github/workflows/ci.yml` on `pull_request` and `push` to `main`/`develop`:
  - `backend`: Python 3.13, `postgres:17` and `redis:7` services, `pip install`,
    `manage.py test`, `manage.py makemigrations --check`.
  - `frontend`: Node 22, `npm ci`, `npx vitest run`, `npx eslint .`, `npm run build`.
  - `images`: `docker build` both Dockerfiles, no push.
  - `source-branch`: on PRs into `main` only, fails unless `github.head_ref == 'develop'`.
  - `permissions: contents: read`; actions pinned by major version.
- [x] Create `develop` from `main`.
- [ ] Rulesets on `main` and `develop` (user, in GitHub settings; exact clicks in the PR):
      require a PR, require the four checks, block force-push and deletion, no required
      approvals. "Require up to date" stays **off**: every develop → main merge commit would
      otherwise leave develop permanently behind, and updating it would mean a push the
      ruleset forbids. Steps in `docs/branching.md`. Settings → Actions: require approval for all
      outside collaborators.
- [x] AGENTS.md: the branch flow (feature → `develop` → `main`) and that `main` deploys.

- [x] Running the suite with no `backend/.env` (CI's conditions) found
      `EnableBankingAPIErrorClassificationTest` signing with the developer's real Enable
      Banking key; it now uses the throwaway test key like its neighbours. WhiteNoise is
      added only when `DEBUG` is off, so tests no longer warn about a missing
      `staticfiles/`.

**Done when:** a PR into `develop` shows the four checks green, and a PR into `main` from
any branch but `develop` is red.

## Phase 4 — Deploy (PR 4, into `develop`, then `main`)

The design's self-hosted runner was replaced before building (user decision, 2026-11-04): the
repository is public, and a runner is reachable by any approved fork pull request. **The
server pulls.**

- [x] `deploy/poll.sh`, run every 2 minutes by `deploy/systemd/saxodash-deploy.{service,timer}`
      as `saxodash-deploy`: fetch `main`. If it differs from the deployed commit and is not
      refused or pinned, read the `CI` workflow's push run for that SHA from GitHub's public
      API. Success means deploy; pending or unreachable means try again; any other result
      refuses the commit once.
- [x] `deploy/deploy.sh <sha>` (one `flock`, so nothing overlaps):
  1. Check out the commit and re-run from it.
  2. Start `postgres`/`redis`, then build both images tagged `<sha12>`.
  3. Back up with the **running** image. Stop on failure; the old release is untouched.
  4. Migrate and `sync_periodic_tasks` with the **new** image. Stop on failure; still untouched.
  5. `up -d`, then the health check: `web` healthy and `/healthz` through `proxy`.
  6. On failure, re-up the previous release's images and refuse the commit.
  7. Record `deployed` and `history`, and keep images for the last 5 releases.
- [x] `deploy/rollback.sh <sha>` pins an earlier deployed release and deploys it; `--release`
      unpins; `--list` shows the history. `deploy/status.sh` shows the state.
- [x] `deploy/install.sh` (run once with sudo):
  - creates the `saxodash-deploy` user, in `docker`;
  - clones over HTTPS into `/opt/saxodash` (public, no key);
  - creates `/srv/saxodash/{postgres,backups}`;
  - writes `.env` with a random `SECRET_KEY` / `POSTGRES_PASSWORD` (`root:saxodash-deploy` 640);
  - installs the units, and enables the timer only once nothing required is blank.
- [x] `restore.sh` shares the lock and reads the running tag from the deploy state.
- [x] `deploy/tests/run.sh`: 14 cases against fake `docker`/`curl` in a throwaway git repo,
      run in CI with shellcheck.
- [x] `docs/deploying.md`: the path from merge to live, failures, rollback, restore.

**Done when:** a merge into `main` deploys by itself, a deliberately broken health check
rolls back to the previous release, and nothing on GitHub can start a process on the server.
The first two are proven against fakes in CI. On the real server they are proven at the first
deploy (Phase 5).

## Phase 5 — Go live (together, no PR)

- [ ] Server: `sudo bash deploy/install.sh` (user), then `/srv/saxodash/.env` filled (user).
- [ ] First deploy from `main` brings up an empty stack; `/healthz` 200 through
      `https://saxodash.uniroo.dev`.
- [ ] Data copy with `manage.py import_sqlite` (built early, 2026-11-04, so the Mac's
      Postgres could carry the real history; see `docs/running-the-stack.md`). Copy the
      Mac's `db.sqlite3` to the server, run it once in a one-off `web` container with the
      file mounted, `--flush`. It verifies row counts per model itself; then click through
      Portfolio, Analytics, Investors and Congress.
- [ ] `restore.sh` tried once against a scratch database on the server.
- [ ] Saxo: add `https://saxodash.uniroo.dev/api/saxo/callback/` to the LIVE app (user),
      connect LIVE on the server, and switch the Mac to SIM.
- [ ] User confirms the data; only then may the Mac's `db.sqlite3` be retired.

## Things only the user does

| When | What |
|---|---|
| Phase 1 | Docker Desktop on the Mac (for the dev Postgres) |
| Phase 3 | Rulesets on `main` / `develop`, outside-collaborator approval setting |
| Phase 4 | Run `deploy/install.sh` once on the server and fill in `/srv/saxodash/.env` |
| Phase 5 | Fill `/srv/saxodash/.env`; Saxo LIVE callback URL; confirm the copied data |

## Open, decided when reached

- **MCP server** (`mcp_serve`, stdio): it runs on the Mac against the Mac's database, which
  after Phase 5 is the SIM one. Whether production data should be reachable from Claude
  on the Mac (and how, safely over the tailnet) is a separate decision after go-live.
- **SMTP for failure mail** (backup task): until a provider is chosen, a failed backup is
  a failed Celery task and a `SyncRun` row. GitHub already emails a failed deploy.
