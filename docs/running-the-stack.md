# Running the Dev Stack

Reference for `scripts/dev.sh`, which starts Postgres, redis, the celery worker,
celery beat, Django and Vite in one terminal and stops them all together.

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
>> starting postgres (port 5432)
>> starting redis (port 6379)
>> starting worker
>> starting beat
>> starting web (port 8000)
>> starting ui (port 5173)
>> stack up (postgres redis worker beat web ui) — Ctrl-C to stop everything
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

`--no-<service>` accepts any of `ngrok postgres redis worker beat web ui`, and they combine.
A name that isn't a service is rejected with the valid list rather than
silently skipping nothing:

```
$ ./scripts/dev.sh --no-uii
error: unknown service 'uii' — known services: ngrok postgres redis worker beat web ui
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
| `DATABASE_URL` | Postgres's port, user, password and database | `postgres://saxodash:saxodash@localhost:5432/saxodash` |

The fallbacks match `settings.py`'s own defaults, so an absent key behaves
exactly like the backend expects. Change `FRONTEND_URL` and the script follows
— no second place to edit.

Override for a single run with environment variables:

```bash
UI_PORT=5200 ./scripts/dev.sh
WEB_PORT=8080 UI_PORT=5200 ./scripts/dev.sh
```

### Postgres

The dev database is Postgres 17 in Docker, the same major version as production and CI,
so a query that works on the Mac works on the server. It needs **Docker Desktop running**;
the first run pulls the image.

| | |
| --- | --- |
| Container | `saxodash-dev-postgres`, started by the script and removed again on Ctrl-C |
| Data | Docker volume `saxodash-dev-pg`, which survives every restart |
| Credentials | Taken from `DATABASE_URL`, so the container and Django can't disagree |
| Already running? | If something already answers on `DATABASE_URL` (a Postgres from Homebrew, or a container left by a killed run), it is reused and left alone |

Useful by hand:

```bash
docker exec -it saxodash-dev-postgres psql -U saxodash saxodash
docker volume rm saxodash-dev-pg
```

The first opens a SQL prompt. The second **deletes the dev database**: the next start
creates an empty one and migrates it. Only run it with the stack stopped.

Running your own Postgres instead: point `DATABASE_URL` at it and start with
`--no-postgres`.

### Bringing over the old SQLite data

`backend/db.sqlite3` is no longer read by the app, but its rows can be copied into
Postgres once:

```bash
./scripts/dev.sh --no-worker --no-beat --no-web --no-ui --no-ngrok
cd backend && .venv/bin/python manage.py import_sqlite --flush
```

Run the first line in one terminal; it keeps only Postgres and redis up, so no sync task
writes while the copy runs. Run the second in another terminal.

- The SQLite file is **only read**. The command works on a temporary copy, brings that
  up to the current migrations, and copies every row with its original id.
- `--flush` empties Postgres first, including any user made with `createsuperuser`;
  you then log in with your old account. Without it, a database that already holds
  data is refused.
- It prints source and target row counts per table and fails if any differ.
- Skipped on purpose: sessions, JWT blacklist entries, admin history, content types and
  permissions (Postgres has its own, matched by name), and the Celery schedule
  (rewritten from `core/scheduling.py`).
- Stored Saxo and Enable Banking tokens come along, readable as long as
  `SAXO_TOKEN_ENCRYPTION_KEY` in `backend/.env` is the one they were saved with.

A different file: `manage.py import_sqlite path/to/other.sqlite3 --flush`.

### Mail in development

Password reset mail goes to the console backend whenever `EMAIL_HOST` is unset: the
message, link included, is printed in the `web` and `worker` logs under `.dev/logs/`. Set
the `EMAIL_*` variables in `backend/.env` to send real mail; production's are in
`docs/deploying.md`.

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
`postgres.log`, `redis.log`, `worker.log`, `beat.log`, `web.log`, `ui.log`, plus
`shutdown.log` for the noisy job-control messages during teardown.

### Preflight failures

These stop the run before anything starts:

| Message | Fix |
| --- | --- |
| `no virtualenv at .../backend/.venv` | Create it, `pip install -r backend/requirements.txt` |
| `backend/.env is missing` | `cp backend/.env.example backend/.env` and fill it in |
| `redis-server not found` | `brew install redis` |
| `docker not found` | Install Docker Desktop: `brew install --cask docker` |
| `Docker is not running` | Start Docker Desktop and wait for it to say it is running |
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
| `adopt` | `yes` = if the probe already passes, reuse what's running and leave it alone on exit. Postgres, redis and ngrok use this |
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
cannot start before redis answers `PONG`, and nothing Django-based starts
before Postgres accepts a connection. Migrations are checked (and applied)
right before the first Django service, once the database is up.

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

**Adopted services.** If Postgres or redis is already up (say under `brew services`),
the script reuses it and says so on exit:

```
>> redis already running — reusing it
...
>> redis left running (it was not started by this script)
```

---

## The MCP server

`manage.py mcp_serve` serves SaxoDash's read tools to Claude Desktop over stdio, so
the assistant answers from the same database, Redis cache and Saxo credential as the
app. It is not a service in `scripts/dev.sh`: Claude Desktop starts it as a child
process and stops it with the chat. It needs Redis running (the caches and the
Finnhub call budget live there; with Redis down a tool that needs the cache answers with a warning and
`data: null` instead of an error, while tools that read only the database still
answer) and the Celery stack for a fresh Saxo token. It listens on no port.

Add this to `~/Library/Application Support/Claude/claude_desktop_config.json` and
restart Claude Desktop:

```json
{
  "mcpServers": {
    "saxodash": {
      "command": "/absolute/path/to/SaxoDash/backend/.venv/bin/python",
      "args": [
        "/absolute/path/to/SaxoDash/backend/manage.py",
        "mcp_serve"
      ],
      "env": { "MCP_USER": "demo" }
    }
  }
}
```

`env` is optional. The server acts as the owner; `MCP_USER` names another
username to act as instead.

Cowork: not yet verified whether Cowork tasks see local stdio servers. Claude Desktop
chat does. If Cowork does not, the route is a desktop extension (`.mcpb`) packaging
the same command.

33 tools, by group (each description names the page it mirrors):

- **Portfolio**: `get_portfolio`, `get_performance`, `get_transactions`, `get_tax_year`
- **Research**: `search_instruments`, `get_quotes`, `get_price_history`,
  `get_company`, `get_financial_statements`, `get_filings_and_insiders`, `get_news`,
  `get_valuation_history`, `get_my_notes`, `get_watchlists`, `compare_companies`
- **Market**: `screen_universe`, `get_discover_shelves`, `get_earnings_calendar`
- **Smart money**: `list_investors`, `get_investor`, `get_fund_signals`,
  `get_fund_stocks`, `get_ticker_ownership`, `list_congress_members`,
  `get_congress_member`, `get_filing_alerts`
- **Verdicts**: `get_verdict`, `get_verdict_track_record`
- **Journal**: `log_recommendation`, `set_decision`, `close_recommendation`,
  `list_recommendations`
- **System**: `get_data_health`

Every tool answers an envelope with `warnings`; a disconnected Saxo, a lapsed token or
a busy provider is a warning with `data: null`, never an error. Banking data is not
exposed and no tool places an order or starts a sync. The only writes are
`advisor.Recommendation` rows (visible in Django admin), whose entry price the server
fills.

How it is built: `mcp_server` is a thin adapter. One `@tool(description, sources=…,
saxo=…)` decorator owns the envelope (Saxo warnings, refusals, Redis down, money as JSON
numbers); a tool returns data or raises `Unavailable`. The rules live in the apps that own
them: `research/listings.py` (what a symbol is and whether US company data may be asked
for), `research/daily.py` (one 1,200-bar daily fetch per instrument), `research/price_summary.py`
(moving averages, RSI, 52-week range and the playbook zone), `research/valuation.py`
(trailing P/E and 5-year medians), `portfolio/tax_year.py::report` and `advisor/journal.py`
(log, decide, close, review; it reads the entry price from the Saxo chart itself).
`advisor` never imports `mcp_server`. The domain modules' Saxo calls take a port, and the MCP
server passes `mcp_server/throttled.py::PAGES`, which goes through the pages' own views, so
the per-minute throttles protect the Saxo token the syncs use.

`get_tax_year` is an estimate: 10% on gains above the EUR 10,000 exemption, with
carry-over and a 31 December 2025 basis for older holdings, always ending "Check with
a Belgian tax adviser." It refuses years before 2026. A holding with no recorded
purchase has an unknown basis rather than its average cost. Realised gains come from
Saxo's closed-positions report (`/cs/v1/reports/closedPositions`), which covers the whole year
in account currency; see `docs/notes/2026-10-21-mcp-probes.md`.

### Verdicts

`Compute verdicts` (`verdicts.tasks.compute_verdicts`, `core/scheduling.py`) runs at 00:15,
after the 22:30 Discover scan, and turns the scan's stored rows into each stock's quality and
valuation grade. The scan also covers the US stocks you hold or watch, beyond the index universe.
The `get_verdict` and `get_verdict_track_record` MCP tools read the result.

The verdict feature adds two migration chains, `research` 0015-0016 and `verdicts` 0001-0002;
run `manage.py migrate` on any existing database before starting. Verdicts appear only after one
full nightly scan followed by `compute_verdicts` (`manage.py shell -c "from verdicts.tasks import
compute_verdicts; compute_verdicts()"` runs it by hand); until then the card and badges show
nothing and the track record is empty.

---

## Platform note

macOS ships **bash 3.2** (the last GPLv2 release) and there is no newer bash
installed here, so the script avoids `wait -n`, associative arrays, `readarray`
and `${var^^}`. Service death is detected by a one-second poll loop rather than
`wait -n`. Anything added to this script has to stay inside 3.2.

---

## Related

- `scripts/dev.sh` — the script itself
- `docs/superpowers/specs/2026-10-21-mcp-server-design.md` — the MCP server's design
- `AGENTS.md` → "Running the stack" — the short version
- `learning/learning-records/0004-*` — the shell gotchas found while building
  it (`set -e`/`pipefail` interactions, signal traps that never install)
