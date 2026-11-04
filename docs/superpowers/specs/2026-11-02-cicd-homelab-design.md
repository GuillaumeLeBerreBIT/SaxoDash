# CI/CD and homelab production — design

Date: 2026-11-02. Status: approved in conversation, not yet planned. Amended 2026-11-04:
HTTPS and hostnames now come from the shared edge proxy on `uniroo.dev`
(`2026-11-04-homelab-edge-proxy-design.md`) instead of `tailscale serve`.

## Intent

SaxoDash has only ever run on the Mac through `scripts/dev.sh`. It should run for real on the
homelab server, and a change should reach it one way only: a pull request into `develop`, then a
pull request from `develop` into `main`, both gated by automated checks, and a push to `main`
deploying itself. The point is that production is never touched by hand and never runs code that
did not pass the checks, while the real data (net-worth history, advisor journal, notes, 13F and
Congress imports) is safe across restarts, updates and bad migrations.

## Goals

- Protected `main` and `develop`: no direct pushes, no force-pushes, no deletion; merging only by
  pull request with green checks. `develop` → `main` is the only way into `main`.
- CI on every pull request into either branch and on every push to them: backend tests (on
  Postgres), frontend vitest, eslint, frontend build, production image build.
- Automatic deploy to the homelab on every push to `main`. `develop` is never deployed; it is a
  checkpoint only (user decision: a second stack would double Saxo/Finnhub calls and nightly scans).
- Production on Postgres, in a container, with data on a host folder that survives any container
  operation.
- Nightly database backups, plus one before every deploy, with retention, and a restore that has
  been tested at least once.
- Failure alerts by email (deploy failed, backup failed).

## Non-goals

- A staging environment or a second server stack.
- Any port open to the internet. The domain `uniroo.dev` names private, tailnet-only
  addresses (see the edge proxy design); it does not make anything public.
- Banking aggregation work, Navidrome setup, or CasaOS management of SaxoDash.
- Monitoring dashboards beyond email alerts (user will research server tooling separately).

## Anti-goals (failure even if it "works")

- A pull request from a stranger (the repo is **public**) able to run code on the homelab.
- Any app secret (Saxo LIVE keys, Finnhub key, Django secret, token encryption key, Enable Banking
  key, Cloudflare API token) stored in GitHub.
- A deploy that serves code against an unmigrated schema, or a migration that runs without a fresh
  backup taken first.
- Any script that can delete the database volume (`docker compose down -v` or equivalent).
- The Mac and the server both connected to the LIVE Saxo account.

## Current state (facts from the repo)

- No `.github/workflows`, no Dockerfiles, no compose file. `main` is unprotected.
- Django 6.0.7, DRF, SimpleJWT, Celery 5.6.3 with `django_celery_beat` DatabaseScheduler, Redis
  (DB 0 broker, DB 1 cache). No `psycopg`, no WSGI server in `requirements.txt`.
- `DATABASES` is SQLite with WAL / `transaction_mode=IMMEDIATE` (AGENTS.md "SQLite runs in WAL").
- `core/backup.py` + `core.tasks.backup_database_task` back up SQLite via its online backup API into
  `DB_BACKUP_DIR`, as a Celery task so a failure shows as a failed task.
- Settings already read from env: `DEBUG`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`,
  `CSRF_TRUSTED_ORIGINS`, `FRONTEND_URL`, `CACHE_URL`, `CELERY_BROKER_URL`, `SAXO_ENVIRONMENT`,
  `SAXO_KEY`, `SAXO_SECRET`, `SAXO_REDIRECT_URI`, `SAXO_TOKEN_ENCRYPTION_KEY`,
  `ENABLE_BANKING_REDIRECT_URI`. `DEBUG=False` already turns on SSL redirect and HSTS, but sets
  no `SECURE_PROXY_SSL_HEADER`, so behind a proxy it would redirect forever.
- Frontend reads `VITE_API_BASE_URL` at build time, default `http://localhost:8000`.
- The live dev database is `backend/db.sqlite3` (~84 MB) on the Mac and is the only copy of the
  real history.

## Server (from the user)

Ubuntu Server with CasaOS, Docker installed, one disk for now (a second, large disk for database
and music is planned within a month). Tailscale to be configured. Navidrome also runs there,
installed through CasaOS. Domain `uniroo.dev`, registered and DNS-hosted at Cloudflare.

## Decisions the user made

1. Branch model: feature branches → PR into `develop` → PR into `main`. Both protected.
2. `develop` is not deployed anywhere.
3. Postgres, in a container, data kept outside the container.
4. Daily backups; on the one disk for now, moved to the new disk when it arrives.
5. Mac goes back to Saxo **SIM**; the server alone holds the **LIVE** connection.
6. No backups needed for the Mac's development database.
7. Secrets live only on the server, never in GitHub (proposed by Claude, accepted).
8. Deploy is executed from the server side by a self-hosted runner that only handles pushes to
   `main` (proposed by Claude, accepted).
9. Failures are reported by email.
10. Existing SQLite data is carried over into Postgres once (stated as an assumption; user did not
    object).
11. SaxoDash is served as `saxo.uniroo.dev` through one shared edge Caddy (2026-11-04).

## The design

### Branches and protection

- Create `develop` from `main`. Make it the default branch for new pull requests? **No** — keep
  `main` as default so the README and clones show production; PRs target `develop` by convention.
- Branch protection (or a ruleset) on both `main` and `develop`: require a pull request, require
  the CI status checks to pass, require branches to be up to date, block force-push and deletion.
  No required approving review (single developer; GitHub forbids approving your own PR).
- `main` additionally: only accept PRs whose head is `develop` (enforced by a small CI job that
  fails a PR into `main` from any other head, since rulesets cannot express "source branch").

### CI (GitHub-hosted runners)

One workflow, triggered on `pull_request` to `main`/`develop` and `push` to them:

- **backend**: Python matching the project, Postgres service container, Redis service container,
  `manage.py test` against Postgres, `manage.py makemigrations --check`.
- **frontend**: `npm ci`, vitest, eslint, `vite build`.
- **image**: build the production image(s) without pushing, to prove the Dockerfile works.
- **source-branch guard** (PRs into `main` only): fail unless head is `develop`.

These run on GitHub's machines, never on the homelab, so a stranger's PR runs nowhere near it.

### Deploy (self-hosted runner on the homelab)

- A GitHub Actions self-hosted runner installed on the server under its own unprivileged user in the
  `docker` group, with a label such as `homelab`.
- A separate deploy workflow triggered **only** by `push` to `main` (never `pull_request`), with
  `runs-on: [self-hosted, homelab]`, and gated on the CI workflow having passed for that commit.
  Use a GitHub **environment** named `production` restricted to the `main` branch so no other ref
  can target the runner's jobs.
- Repository setting: "require approval for all outside collaborators" on fork PR workflows, as a
  second fence.
- The deploy touches the `saxodash` compose project only, never `edge`.
- Deploy steps, in order:
  1. Check out the pushed commit into the deploy directory.
  2. Build the images locally on the server, tagged with the commit SHA (no registry; nothing is
     published, which suits a public repo).
  3. Take a pre-deploy database backup. Abort if it fails.
  4. Run `migrate` in a one-off container from the new image. Abort if it fails (old stack still
     running, untouched).
  5. `docker compose up -d` with the new tag.
  6. Health check the web container (an HTTP endpoint that touches the DB). If it fails, re-up the
     previous SHA's images and fail the job.
  7. Keep the last few SHA tags for rollback; prune older images.
- Rollback by hand: `deploy/rollback.sh <sha>` re-ups an older tag (schema permitting; restoring the
  pre-deploy backup is the escape hatch when a migration must be undone).

### Production stack (docker compose on the server)

Services: `postgres`, `redis`, `web` (Django under gunicorn), `worker` (Celery worker,
`--concurrency=2` as today), `beat` (Celery beat), `proxy` (serving the built frontend and
proxying `/api/` to `web`).

- Same origin for frontend and API, so CORS is not needed in production; `VITE_API_BASE_URL` is
  built empty-relative.
- HTTPS comes from the shared edge Caddy (`deploy/edge/`, own compose project). `proxy`
  publishes **no host port**; it joins the external `edge` network with alias `saxodash`.
  Every other service stays on the stack's private network. The inner proxy passes
  `X-Forwarded-Proto` through, and settings add `SECURE_PROXY_SSL_HEADER` (details in the
  edge design).
- Postgres data: bind mount `/srv/saxodash/postgres`. Redis: a volume (cache and broker only,
  loss is harmless). Secrets: `/srv/saxodash/.env`, mode 600, root-owned, read by compose.
- The compose file and deploy scripts live in the repo under `deploy/`; no script ever uses
  `down -v`.
- `DEBUG=False`, `ALLOWED_HOSTS=saxo.uniroo.dev`,
  `CSRF_TRUSTED_ORIGINS`/`FRONTEND_URL=https://saxo.uniroo.dev`, `SAXO_ENVIRONMENT=live`,
  `SAXO_REDIRECT_URI=https://saxo.uniroo.dev/api/saxo/callback/`.

### Postgres migration of the app

- Add `psycopg` and `gunicorn` to requirements. `DATABASES` from a `DATABASE_URL`-style env (or
  discrete vars); the SQLite block and its WAL/IMMEDIATE options go away, and AGENTS.md's SQLite
  section is rewritten to say what replaced it.
- The full backend suite must pass on Postgres (CI enforces it). Expect small fixes where SQLite was
  lenient: case-sensitive `LIKE`, string length enforcement on `CharField`, ordering of ties,
  transaction/locking behaviour in the Celery tasks.
- Local development switches to Postgres too: one Postgres container started by `scripts/dev.sh`
  (it already owns Redis the same way), so dev and prod never differ on the database.

### Moving the data

- One-time, scripted, re-runnable into an empty database: load the current `db.sqlite3` into the
  new Postgres (Django `dumpdata`/`loaddata` with natural keys, or `pgloader` — builder's choice,
  verified by row counts per table and a click-through of Portfolio, Analytics, Investors).
- Carry `SAXO_TOKEN_ENCRYPTION_KEY` to the server's env so stored credentials stay readable, or
  simply reconnect Saxo LIVE on the server afterwards (low stakes, per `core/backup.py`).
- The Mac's `db.sqlite3` and `backend/backups/` are left untouched until the user confirms the
  server's data is right.

### Backups

- `core/backup.py` is rewritten for Postgres: `pg_dump --format=custom` into `DB_BACKUP_DIR`,
  written to a partial name and renamed on success, so a half-written file is never mistaken for a
  backup. Stays a Celery task on the nightly beat schedule so a failure is a failed task; the image
  carries the Postgres client.
- Retention: 14 daily + 6 monthly.
- `DB_BACKUP_DIR` on the server: `/srv/saxodash/backups` (same disk for now; one setting to move to
  the new disk).
- The deploy's pre-migration backup calls the same function.
- `deploy/restore.sh <file>` documented and tried once against a scratch database before go-live.
- Optional, user to decide later: weekly copy of the latest dump to the Mac over Tailscale.

### Alerts

- Deploy failure: GitHub's own failed-workflow email (on by default for the pusher).
- Backup failure: the backup task emails on failure via Django's mail settings (SMTP credentials in
  the server `.env`). SMTP provider to be chosen by the user; until then the failure is still a
  failed Celery task and a `SyncRun`-style record.

### Things only the user can do

- Install Tailscale on the server.
- Cloudflare: the `*.uniroo.dev` DNS-only record and the scoped API token; fill
  `/srv/edge/.env`; move CasaOS off port 80 (`deploy/edge/README.md`).
- Add `https://saxo.uniroo.dev/api/saxo/callback/` to the Saxo LIVE app in the Saxo developer
  portal, and the matching URL to the Enable Banking application whitelist.
- Register the self-hosted runner (token from the repo settings) — a guided script can do the rest.
- Fill `/srv/saxodash/.env` with the secrets.
- Pick an SMTP provider for alert mail.

## Left to the builder

Exact Python/Node versions (match the current lockfiles), Caddy vs nginx for the inner `proxy`,
`dumpdata` vs `pgloader`, health endpoint shape, how the guard job reads the PR head, and the
order of tasks — provided the Postgres switch lands and is green in CI before anything deploys.

## Open

- The user wants to check one more thing about production readiness ("a real MVP") before this
  is planned; its outcome may add to this design.
