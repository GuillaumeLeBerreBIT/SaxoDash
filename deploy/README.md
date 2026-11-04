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
| `restore.sh` | Replace the database with a backup |
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
/opt/saxodash/            this repo                   put there by the deploy runner (Phase 4)
```

`compose.yaml` takes `DATABASE_URL`, `CACHE_URL`, `CELERY_BROKER_URL` and `DB_BACKUP_DIR`
from the stack itself. Only `POSTGRES_PASSWORD` connects the database and the app, and it
is set once, in `.env`.

## Starting it by hand

Automatic deploys come in Phase 4. Until then, this is how to bring the stack up yourself,
for example to see `https://saxodash.uniroo.dev` answer. **Leave the `SAXO_*` keys empty
for a trial like this**: the Mac is still connected to Saxo LIVE, and the two must never
both sync it.

```sh
sudo mkdir -p /srv/saxodash/postgres /srv/saxodash/backups
sudo chown 1000:1000 /srv/saxodash/backups
sudo cp deploy/.env.example /srv/saxodash/.env
sudo nano /srv/saxodash/.env
sudo chmod 600 /srv/saxodash/.env

cd deploy
C="sudo docker compose --env-file /srv/saxodash/.env"
$C build
$C up -d postgres redis
$C run --rm web python manage.py migrate
$C up -d
$C ps
```

When filling in `.env`, set `SECRET_KEY` and `POSTGRES_PASSWORD` to two different values
from `openssl rand -hex 32`.

`--env-file` is needed on every command: compose reads `POSTGRES_PASSWORD` from it to build
the database URL. `sudo` is needed because the file is root-only.

## Day to day

| Want to … | Command (in `deploy/`) |
|---|---|
| See what runs | `$C ps` |
| Follow the logs | `$C logs -f web worker beat` |
| Open a Django shell | `$C exec web python manage.py shell` |
| Back up now | `$C exec web python manage.py backup_database` |
| Restore a backup | `sudo ./restore.sh /srv/saxodash/backups/db-<stamp>.dump` |
| Stop / start | `$C stop` / `$C up -d` |

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
