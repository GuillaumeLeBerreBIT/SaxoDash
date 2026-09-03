# Running the Dev Stack

Reference for `scripts/dev.sh`, which starts redis, the celery worker, celery
beat, Django and Vite in one terminal and stops them all together.

This is a living reference, not a dated note — it is expected to change
whenever the script does.

---

## Quickstart

```bash
./scripts/dev.sh
```

Works from any directory; the script resolves its own paths. **Ctrl-C stops
everything it started.**

```
>> starting redis (port 6379)
>> starting worker
>> starting beat
>> starting web (port 8000)
>> starting ui (port 5173)
>> stack up (redis worker beat web ui) — Ctrl-C to stop everything
[worker] celery@MacBook-Pro.local ready.
[ui]     ➜  Local:   http://localhost:5173/
```

Each `>> starting` line only prints once that service has passed its readiness
probe, so when you see `stack up`, the app really is reachable. Open
<http://localhost:5173>.

---

## Why this exists

Starting these five by hand in five tabs is what produced the states recorded
earlier in this project: *"celery worker running but not connected to broker"*
and *"redis not running while celery workers are active."* Those are ordering
bugs — a worker started before its broker never recovers on its own.

The script exists to make the ordering impossible to get wrong and to
guarantee cleanup. Saved keystrokes are a side effect, not the point.

---

## Flags

| Command | When you want it |
| --- | --- |
| `./scripts/dev.sh` | Everything |
| `./scripts/dev.sh --no-ui` | Backend only — working via curl or tests |
| `./scripts/dev.sh --no-worker --no-beat` | No background jobs; skips Saxo syncing |
| `./scripts/dev.sh --reclaim` | A previous run was killed and still holds a port |
| `./scripts/dev.sh --help` | Full usage, plus the ports it resolved from `.env` |

`--no-<service>` accepts any of `redis worker beat web ui`, and they combine.
A name that isn't a service is rejected with the valid list rather than
silently skipping nothing:

```
$ ./scripts/dev.sh --no-uii
error: unknown service 'uii' — known services: redis worker beat web ui
```

`--no-frontend` is kept as an alias for `--no-ui`.

---

## Ports and configuration

**Ports come from `backend/.env`, not from the script.** The script reads:

| Key in `backend/.env` | Gives | Fallback |
| --- | --- | --- |
| `SAXO_REDIRECT_URI` | Django's port | 8000 |
| `FRONTEND_URL` | Vite's port | 5173 |
| `CELERY_BROKER_URL` | redis's port | 6379 |

The fallbacks match `settings.py`'s own defaults, so an absent key behaves
exactly like the backend expects. Change `FRONTEND_URL` and the script follows
— no second place to edit.

Override for a single run with environment variables:

```bash
UI_PORT=5200 ./scripts/dev.sh
WEB_PORT=8080 UI_PORT=5200 ./scripts/dev.sh
```

### The CORS warning

If `CORS_ALLOWED_ORIGINS` doesn't list the frontend origin, you get this at
startup:

```
warn: CORS_ALLOWED_ORIGINS (http://localhost:5173) does not list
      http://localhost:5200 — browser calls to the API will be blocked
```

Worth reading. Without it, the symptom appears much later as requests failing
in the browser with nothing obviously wrong in either log.

---

## Troubleshooting

### A port is stuck after a crash

Don't reach for `pkill`. Run again with `--reclaim`:

```
>> port 8000 (web) held by a leftover from a previous run — pid 55749
>> reclaimed port 8000
```

Without the flag the script names the holder and stops, so you can decide.

It will **never** kill a process it doesn't recognise as this project's:

```
error: port 8000 (web) is held by an unrelated process (pid 55596):
       .../Python -m http.server 8000
```

In an interactive terminal it prompts `stop it? [y/N]`; non-interactively it
tells you to rerun with `--reclaim`.

### A service won't start

The script dies with the log to read:

```
error: worker did not become ready — see .dev/logs/worker.log
```

Per-service logs live in `.dev/logs/` (gitignored, truncated each run):
`redis.log`, `worker.log`, `beat.log`, `web.log`, `ui.log`, plus
`shutdown.log` for the noisy job-control messages during teardown.

### Preflight failures

These stop the run before anything starts:

| Message | Fix |
| --- | --- |
| `no virtualenv at .../backend/.venv` | Create it, `pip install -r backend/requirements.txt` |
| `backend/.env is missing` | `cp backend/.env.example backend/.env` and fill it in |
| `redis-server not found` | `brew install redis` |
| `frontend/node_modules is missing` | `npm install` in `frontend/` |

Unapplied migrations are applied automatically. If `migrate` itself fails, the
script surfaces what `migrate --check` reported rather than guessing a cause —
`--check` exits 1 for both unapplied migrations *and* a broken settings module,
so its exit code alone can't name the problem.

### Something survived a kill

Only possible if the script was `SIGKILL`ed (`kill -9`), which no handler can
intercept. `INT`, `TERM` and `HUP` all clean up, so Ctrl-C and closing the
terminal are both safe. To recover:

```bash
./scripts/dev.sh --reclaim
```

---

## Adding a sixth service

One line in the service table near the top of the script. The flag, preflight,
start order and readiness gate all follow from it.

```bash
#       name    colour      workdir     port  adopt  probe                      command
service flower  "$C_FLOWER" "$BACKEND"  5555  no     -                          '"$VENV/bin/celery" -A backend flower'
```

| Field | Meaning |
| --- | --- |
| `port` | Checked before start, and used as the default readiness probe. `-` for services that bind nothing |
| `adopt` | `yes` = if the probe already passes, reuse what's running and leave it alone on exit. Only redis uses this |
| `probe` | Readiness test, eval'd. `-` means "derive from `port`" |
| command | Single-quoted — expanded at spawn time, not at table-definition time |

`--no-flower` then works with no parser change. Add a colour constant next to
the others if you want a distinct one.

Services with no port need an explicit probe. The existing ones watch their own
log for a startup marker:

```bash
'log_has worker "ready\."'
'log_has beat "beat: Starting"'
```

---

## How it works, in the parts worth knowing

**Readiness gating.** Every service has a probe, and the script waits for it
before starting the next one. This is what makes the ordering safe: celery
cannot start before redis answers `PONG`.

**Process groups.** Each service runs as a brace group, so `$!` *is* its
process-group leader and one `kill -TERM -- -$pid` reaches the whole child
tree — Django's autoreloader, celery's ten prefork children, vite's node
process. Without the braces, `$!` is the pipeline's last member and the group
has to be looked up with `ps`, which forks per service and races a
fast-dying one.

**`set -m`.** Gives each job its own process group, which is why Ctrl-C hits
only the script — the terminal signals just the foreground group — and lets
the cleanup handler tear services down in order rather than having them all
die at once mid-write.

**Liveness.** Tracked via each service's log pump, which exits when its pipe
closes, i.e. when the service exits. A proxy, and a deliberate one: a service
that closed stdout but kept running would be missed, and none of these five
do that.

**Adopted redis.** If redis is already up (say under `brew services`), the
script reuses it and says so on exit:

```
>> redis already running — reusing it
...
>> redis left running (it was not started by this script)
```

---

## Platform note

macOS ships **bash 3.2** (the last GPLv2 release) and there is no newer bash
installed here, so the script avoids `wait -n`, associative arrays, `readarray`
and `${var^^}`. Service death is detected by a one-second poll loop rather than
`wait -n`. Anything added to this script has to stay inside 3.2.

---

## Related

- `scripts/dev.sh` — the script itself
- `AGENTS.md` → "Running the stack" — the short version
- `learning/learning-records/0004-*` — the shell gotchas found while building
  it (`set -e`/`pipefail` interactions, signal traps that never install)
