# Deploying SaxoDash to the homelab

A merge into `main` reaches `https://saxodash.uniroo.dev` by itself, a few minutes later,
once CI has passed on it. Nothing on GitHub can start anything on the server: **the server
pulls**. This file covers how that works, the one-time setup, and what to do when a deploy
fails.

```
develop ──PR──► main ──push──► CI on GitHub (tests, images)
                                   │
          every 2 minutes          ▼
homelab ── saxodash-deploy.timer ── poll.sh: new commit on main? CI green on it?
                                   │  yes
                                   ▼
                              deploy.sh <sha>
          build ─► backup ─► migrate ─► start ─► health check ─┬─► done
            │         │          │                              └─► roll back to the previous release
            └─────────┴──────────┴──► any failure: the running release is left untouched
```

## Why the server pulls

The repository is public. A GitHub Actions runner on the server would be reachable by any
fork pull request a maintainer approves, because a pull request brings its own workflow
files, and the runner's user can drive Docker, which is as good as root. Polling removes
that path entirely: the server only ever reads `main` and asks GitHub's public API whether
CI passed on that exact commit. There is no inbound connection, no GitHub token on the
server, and no secret on GitHub.

## One deploy, step by step (`deploy/deploy.sh <sha>`)

1. **Check out the commit**, then re-run itself from it, so the deploy logic is always the
   version being deployed.
2. **Start Postgres and Redis** if they are not running.
3. **Build** `saxodash-backend:<sha12>` and `saxodash-proxy:<sha12>` on the server. There is
   no registry; nothing is published.
4. **Back up the database** with the image that is running now (`manage.py backup_database`
   into `/srv/saxodash/backups`). If the backup fails, nothing else happens.
5. **Migrate** with the new image, then rewrite the Celery schedule (`sync_periodic_tasks`).
   If either fails, the old release is still running, untouched.
6. **Start the new release** (`docker compose up -d`).
7. **Health check:** `web` must report healthy, and `/healthz` must answer through the
   `proxy`, the same path the edge Caddy uses. 40 tries, 3 seconds apart.
8. **If it fails**, the previous release's images are started again and the commit is
   marked *refused*, so it is not retried every two minutes. A new commit on `main` is tried
   normally.
9. **If it passes**, the commit is recorded as *deployed*, and images older than the last
   five releases are removed.

Steps 4–5 run while the old release still serves requests. A rollback in step 8 does **not**
undo a migration. Undoing one means restoring the backup from step 4 (see below).

## Deploy state (`/var/lib/saxodash-deploy/`)

| File | Means |
|---|---|
| `deployed` | The commit running now |
| `history` | Every commit deployed, oldest first; `rollback.sh` only accepts these |
| `status` | The last outcome: `ok <sha>`, `deploying <sha>`, `failed <sha>: …`, `refused <sha>: CI failure` |
| `refused` | A commit that will not be tried again (CI failed, or its deploy failed) |
| `pinned` | Set by `rollback.sh`: automatic deploys are paused |
| `lock` | Held while a deploy, rollback or restore runs, so two never overlap |

At a glance: `sudo -u saxodash-deploy /opt/saxodash/deploy/status.sh`.

## First-time setup on the server

Prerequisites: Docker with the compose plugin, the homelab edge running (`docker network
inspect edge` answers), and `python3`, `git`, `curl`.

```sh
curl -fsSL https://raw.githubusercontent.com/GuillaumeLeBerreBIT/SaxoDash/main/deploy/install.sh -o /tmp/saxodash-install.sh
less /tmp/saxodash-install.sh
sudo bash /tmp/saxodash-install.sh
```

Read the script before running it as root. It:

- creates the system user `saxodash-deploy`, in the `docker` group, with its state in
  `/var/lib/saxodash-deploy`;
- clones the repository into `/opt/saxodash` over HTTPS. It is public, so no key or token
  is needed, and the server never pushes;
- creates `/srv/saxodash/postgres` and `/srv/saxodash/backups`;
- creates `/srv/saxodash/.env` from `deploy/.env.example`, with a fresh random
  `SECRET_KEY` and `POSTGRES_PASSWORD` (`root:saxodash-deploy`, mode 640);
- installs `saxodash-deploy.service` and `saxodash-deploy.timer`;
- switches the timer on, but only once nothing required in `.env` is blank. Otherwise it
  lists what to fill in.

Then fill in the rest of `/srv/saxodash/.env` (`sudo nano /srv/saxodash/.env`) and switch
deploys on:

```sh
sudo systemctl enable --now saxodash-deploy.timer
journalctl -u saxodash-deploy -f
```

The first check deploys the current `main`. Re-running the install script is safe; it never
overwrites an existing `.env`.

## Password reset email (Gmail)

Password reset sends a link by email. Without `EMAIL_HOST` the message is printed to the
server log instead, which is what development uses.

1. On the Google account that will send the mail, turn on 2-Step Verification.
2. Create an app password (Google Account, Security, App passwords) and copy the 16
   characters.
3. Add these to `/srv/saxodash/.env`, then redeploy:

```sh
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=true
EMAIL_HOST_USER=<the sending Gmail address>
EMAIL_HOST_PASSWORD=<the app password>
DEFAULT_FROM_EMAIL=<the sending Gmail address>
```

A failed send is logged by `users.reset` and the request still answers the same way, so the
page never reveals whether an address has an account.

## Going public

Signup is open, so these are settings and checks to do before sharing the address. The
email variables are in "Password reset email (Gmail)" above.

1. **`NUM_PROXIES`.** Throttles key on the visitor's address, read from `X-Forwarded-For`
   only as far as `NUM_PROXIES` says: 0 ignores the header, N takes the Nth address from the
   right. `deploy/compose.yaml` sets it to `2` for every app container, because two proxies
   append to the header before gunicorn sees it: the homelab's edge Caddy adds the visitor,
   and the compose `proxy` Caddy (`frontend/Caddyfile` trusts private ranges, so it keeps the
   edge's header and appends the edge's address) adds the edge. Gunicorn receives
   `<anything the client sent>, <visitor>, <edge>`, and the second from the right is the
   visitor. It lives in the compose file rather than in `/srv/saxodash/.env` because it
   describes the shape of the stack, not a per-deploy secret; change it there if a hop is
   added or removed. `2` is the expected value, not a measured one: the check in step 2
   decides the final value.
2. **Verify it on the server.** Send a throttled request through the public address with a
   forged header, then read which address the throttle counted. From any machine outside
   the homelab:

   ```sh
   curl -s https://saxodash.uniroo.dev/api/auth/password-reset/ \
     -H 'Content-Type: application/json' -H 'X-Forwarded-For: 1.2.3.4' \
     -d '{"email": "nobody@example.com"}'
   curl -s https://api.ipify.org; echo
   ```

   The second command prints your public address. Then, on the server:

   ```sh
   cd /opt/saxodash && docker compose --env-file /srv/saxodash/.env -f deploy/compose.yaml \
     exec redis redis-cli -n 1 --scan --pattern '*throttle_password_reset_*'
   ```

   Each key ends in the address the throttle used (`:1:throttle_password_reset_<address>`):
   - your public address: `NUM_PROXIES` is right;
   - a `172.x` / `10.x` / `192.168.x` address: too low, every visitor shares the proxy's
     bucket (signup and reset limited for the whole site, the owner lockable by strangers);
   - `1.2.3.4`: too high, anyone can pick their own bucket by forging the header.

   Change the value in `deploy/compose.yaml`, redeploy and repeat until the key shows your
   address. Clear the probe's bucket afterwards with
   `… exec redis redis-cli -n 1 del ':1:throttle_password_reset_<address>'`.
3. **Email.** Set the six `EMAIL_*` / `DEFAULT_FROM_EMAIL` lines and send yourself a
   password reset.
4. **`ADMIN_ENABLED`.** The Django admin is routed only when `ADMIN_ENABLED=True`, which
   defaults to the value of `DEBUG`, so production has no `/admin/`. Leave it unset.
5. **`SAXODASH_OWNER` on the first migrate.** The migration that introduces accounts makes
   the only existing user the owner. With more than one user it stops and asks for
   `SAXODASH_OWNER=<username>` in `/srv/saxodash/.env`; the owner can be left set.
6. **Rehearse the migration** on a restored copy of the newest backup (`deploy/restore.sh`
   into a throwaway database): row counts unchanged, every row's `user` the owner.
7. **Take a backup right before deploying this release**, and note its file name
   (`ls -l /srv/saxodash/backups`). The deploy takes one too, but this one is yours to keep:

   ```sh
   cd /opt/saxodash && docker compose --env-file /srv/saxodash/.env -f deploy/compose.yaml \
     run --rm --no-deps web python manage.py backup_database
   ```

   This release cannot be undone by rolling back the image alone. Its migrations drop
   `Investor.followed` and add `user` columns that are `NOT NULL`, so the previous release's
   code fails on the new schema (every investors query, every new position, transaction and
   Saxo credential) while `/healthz` still passes, and `rollback.sh` reports success over a
   broken app. Undoing it means `rollback.sh <previous sha>` and then
   `restore.sh /srv/saxodash/backups/db-<stamp>.dump` with the pre-deploy dump (both as in
   "Day to day" below).
8. **Give the owner account an email address**, or a password reset has nowhere to go. Either
   Settings → Account in the app, or on the server:

   ```sh
   cd /opt/saxodash && docker compose --env-file /srv/saxodash/.env -f deploy/compose.yaml \
     exec web python manage.py shell -c "from users.owner import owner; u = owner(); u.email = 'you@example.com'; u.save(update_fields=['email'])"
   ```

## Day to day

Run the deploy scripts as `saxodash-deploy`, so the files they write stay readable by the timer:

```sh
D="sudo -u saxodash-deploy /opt/saxodash/deploy"
```

| Want to … | Command |
|---|---|
| See what is running and the last outcome | `$D/status.sh` |
| Follow deploys live | `journalctl -u saxodash-deploy -f` |
| Check right now instead of waiting | `sudo systemctl start saxodash-deploy.service` |
| Go back to an earlier release | `$D/rollback.sh <sha or prefix>` (`--list` shows them) |
| Return to following `main` | `$D/rollback.sh --release` |
| Pause automatic deploys | `sudo systemctl stop saxodash-deploy.timer` (`start` resumes) |
| Restore a backup | `$D/restore.sh /srv/saxodash/backups/db-<stamp>.dump` |
| Retry a refused commit | `sudo -u saxodash-deploy rm /var/lib/saxodash-deploy/refused` |

## When a deploy fails

`status.sh` names the step. The journal has each step's output.

| Status says | What happened | What to do |
|---|---|---|
| `refused <sha>: CI failure` | CI failed on that commit, so it was never deployed | Fix it through `develop` as usual; the next commit on `main` is tried |
| `…building the images failed…` / `…backup failed…` / `…migrate failed…` | Stopped before starting anything; the old release keeps running | Read the journal, fix, merge again |
| `…did not pass its health check; rolled back to <sha>` | The new release started but `/healthz` failed; the previous one is running again | `docker compose … logs web` for the cause. If it migrated, the old code is running on the new schema: usually fine, otherwise restore the pre-deploy backup. Not fine for the accounts release (see "Going public" step 7): restore the pre-deploy backup |
| `…rolling back … failed too, the site is down` | Neither release is healthy | `status.sh`, then the web logs. `rollback.sh` to an older release, or `restore.sh` |
| `waiting for CI` in the journal | CI is still running on the new commit | Nothing; it deploys when CI finishes |
| `could not fetch main` / `could not read CI's result` | GitHub was unreachable | Nothing; the next check retries |

Failure email is not wired yet (it arrives with the SMTP step). Until then, `status.sh` and
`systemctl --failed` are where a failed deploy shows.

## Undoing a release completely

1. `$D/rollback.sh <previous sha>` pins the previous release and deploys it.
2. If the release you are undoing changed the database,
   `$D/restore.sh /srv/saxodash/backups/db-<stamp>.dump` with the dump taken just before
   it (`ls -l /srv/saxodash/backups`).
3. Fix the problem through `develop` → `main`, then `$D/rollback.sh --release`.
