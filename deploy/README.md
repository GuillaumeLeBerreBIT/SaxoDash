# SaxoDash production stack

How SaxoDash runs on the homelab at `https://saxodash.uniroo.dev`. Design:
`docs/superpowers/specs/2026-11-02-cicd-homelab-design.md`. The edge Caddy in front of it
lives in the `homelab` repo (`edge/`).

## What runs

```
edge Caddy (homelab repo) ──network "edge", alias "saxodash"──► proxy  (Caddy: the built React app, /api /admin /static /healthz → web)
                                                                 │
                                       project network "saxodash_default":
                                         web     gunicorn, Django          (image saxodash-backend)
                                         worker  Celery worker, 2 processes (same image)
                                         beat    Celery beat, schedule in the database (same image)
                                         postgres 17   data in /srv/saxodash/postgres
                                         redis 7       cache + broker, nothing kept on disk
```

| File | What it is |
|---|---|
| `compose.yaml` | The stack. Project name `saxodash`; images are tagged `${SAXODASH_TAG:-local}` |
| `.env.example` | Every production setting. Filled in, it lives at `/srv/saxodash/.env`, never in git |
| `deploy.sh`, `poll.sh` | One release, and the timer's check for a new one (`docs/deploying.md`) |
| `rollback.sh`, `status.sh` | Go back to an earlier release; show what runs and the last outcome |
| `install.sh`, `systemd/` | One-time server setup: the deploy user, the clone, `/srv/saxodash`, the timer |
| `restore.sh` | Replace the database with a backup |
| `tests/run.sh` | The deploy scripts against a fake `docker` and GitHub (run in CI) |
| `../backend/Dockerfile` | Python 3.13 + `pg_dump` 17; collects static files at build time |
| `../frontend/Dockerfile` | Builds the app with `VITE_API_BASE_URL=""` (same origin), then serves it with Caddy |
| `../frontend/Caddyfile` | The `proxy` container's routes and caching rules |

Only `proxy` is on the `edge` network, and nothing publishes a port on the host. Postgres,
Redis and gunicorn can only be reached from inside the stack, which is also what makes it
safe for Django to trust the `X-Forwarded-Proto` header the edge sets.

## Server folders

```
/srv/saxodash/.env        secrets and settings        root:root, mode 600
/srv/saxodash/postgres/   the database                owned by the postgres container
/srv/saxodash/backups/    pg_dump files, nightly      owned by uid 1000 (the app user in the image)
/opt/saxodash/            this repo                   owned by saxodash-deploy, checked out at the running commit
/var/lib/saxodash-deploy/ deploy state               what runs, history, last outcome (docs/deploying.md)
```

`compose.yaml` takes `DATABASE_URL`, `CACHE_URL`, `CELERY_BROKER_URL` and `DB_BACKUP_DIR`
from the stack itself. Only `POSTGRES_PASSWORD` connects the database and the app, and it
is set once, in `.env`.

## Setting it up

`deploy/install.sh` does the whole server side once, and from then on every commit that
reaches `main` with green CI deploys itself. See `docs/deploying.md`, which also covers
rollbacks, failed deploys and the deploy state.

## Day to day

Run these as the deploy user, which can read `.env` and drive Docker:
`C="sudo -u saxodash-deploy docker compose --env-file /srv/saxodash/.env -f /opt/saxodash/deploy/compose.yaml"`.
Don't use `up` by hand: it needs the running release's tag, and the deploy scripts handle that.
`stop` and `start` reuse the containers that are already there.

| Want to … | Command |
|---|---|
| See what runs | `$C ps` |
| Follow the logs | `$C logs -f web worker beat` |
| Open a Django shell | `$C exec web python manage.py shell` |
| Back up now | `$C exec web python manage.py backup_database` |
| Restore a backup | `sudo -u saxodash-deploy /opt/saxodash/deploy/restore.sh /srv/saxodash/backups/db-<stamp>.dump` |
| Stop / start the existing containers | `$C stop` / `$C start` |

Never `down -v`: `-v` deletes volumes. The database is a host folder rather than a volume,
so it would survive, but no command in this project ever uses `-v` either way.

## Backups

The nightly Celery task writes `db-<stamp>.dump` (`pg_dump --format=custom`) into
`/srv/saxodash/backups`. It keeps every dump from the newest 14 days plus the first of each
of the newest 6 months. When the second disk arrives, moving `/srv/saxodash/backups` there
is a mount change only.

`restore.sh` stops the app, replaces the database in a single transaction (a failed restore
changes nothing), and starts the app again. Restore with the app version that made the
backup, because tables added by a later migration are not part of the backup.
