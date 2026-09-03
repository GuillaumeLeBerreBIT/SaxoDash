#!/usr/bin/env bash
#
# Start the whole SaxoDash dev stack in one terminal.
# See usage() for the user-facing help.

set -euo pipefail
set -m  # own process group per job, so we can kill child trees (runserver, vite)

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
VENV="$BACKEND/.venv"
LOG_DIR="$ROOT/.dev/logs"
REDIS_DIR="$ROOT/.dev/redis"
ENV_FILE="$BACKEND/.env"

C_RESET=$'\033[0m'; C_DIM=$'\033[2m'; C_RED=$'\033[31m'; C_AMBER=$'\033[33m'
C_REDIS=$'\033[35m'; C_WORKER=$'\033[33m'; C_BEAT=$'\033[36m'
C_WEB=$'\033[32m'; C_UI=$'\033[34m'

note() { printf '%s>>%s %s\n' "$C_DIM" "$C_RESET" "$1"; }
warn() { printf '%swarn:%s %s\n' "$C_AMBER" "$C_RESET" "$1"; }
die()  { printf '%serror:%s %s\n' "$C_RED" "$C_RESET" "$1" >&2; exit 1; }

# wait_for <tries> <delay> <cmd...> — poll until cmd succeeds or tries run out.
wait_for() {
  local tries="$1" delay="$2"; shift 2
  while [ "$tries" -gt 0 ]; do
    "$@" >/dev/null 2>&1 && return 0
    sleep "$delay"
    tries=$((tries - 1))
  done
  return 1
}

# --- ports come from backend/.env, not from copies kept here -----------------

# Last non-comment assignment wins, quotes stripped.
env_get() {
  [ -f "$ENV_FILE" ] || return 0
  sed -n "s/^[[:space:]]*$1=//p" "$ENV_FILE" 2>/dev/null \
    | tail -1 | tr -d '\r' | sed 's/^["'"'"']//;s/["'"'"']$//' || true
}

# Port out of a URL, or the given fallback when absent.
url_port() {
  local url="$1" fallback="$2" port
  port=$(printf '%s' "$url" | sed -n 's#^[a-zA-Z][a-zA-Z0-9+.-]*://[^/]*:\([0-9]\{1,5\}\).*#\1#p')
  printf '%s' "${port:-$fallback}"
}

# The .env keys are authoritative; these defaults mirror settings.py's own.
WEB_PORT="${WEB_PORT:-$(url_port "$(env_get SAXO_REDIRECT_URI)" 8000)}"
UI_PORT="${UI_PORT:-$(url_port "$(env_get FRONTEND_URL)" 5173)}"
REDIS_PORT="${REDIS_PORT:-$(url_port "$(env_get CELERY_BROKER_URL)" 6379)}"

usage() {
  cat <<EOF
Start the whole SaxoDash dev stack in one terminal:
  redis -> celery worker -> celery beat -> django -> vite

Ctrl-C stops everything this script started. Redis is left alone if it was
already running (e.g. under \`brew services\`).

Usage: scripts/dev.sh [--no-<service>]... [--reclaim]

  --no-<service>  skip one service: $(printf '%s ' redis worker beat web ui)
                  (--no-frontend is accepted as an alias for --no-ui)
  --reclaim       stop leftover processes from a previous run without asking

Ports are read from backend/.env (SAXO_REDIRECT_URI, FRONTEND_URL,
CELERY_BROKER_URL) so they cannot drift from the backend's own config.
Override per-run with WEB_PORT / UI_PORT / REDIS_PORT.
  web=$WEB_PORT  ui=$UI_PORT  redis=$REDIS_PORT
EOF
}

# --- the service table -------------------------------------------------------

# One row per service. Adding a service is one `service` line — the flags, the
# preflight, the start order and the readiness gate all follow from it.
#
#   service <name> <colour> <workdir> <port|-> <adopt> <probe|-> <command>
#
# port   the port it listens on, checked before start and used as the default
#        readiness probe ('-' for services that bind nothing)
# adopt  yes = if the probe already passes, reuse what's running instead of
#        starting our own (and leave it alone on exit)
# probe  readiness test, eval'd; '-' means "derive from <port>"
# Commands are single-quoted: they are expanded at spawn time, not here.

SVC_NAME=(); SVC_COLOR=(); SVC_DIR=(); SVC_PORT=(); SVC_ADOPT=(); SVC_PROBE=(); SVC_CMD=()
service() {
  SVC_NAME+=("$1"); SVC_COLOR+=("$2"); SVC_DIR+=("$3"); SVC_PORT+=("$4")
  SVC_ADOPT+=("$5"); SVC_PROBE+=("$6"); SVC_CMD+=("$7")
}

log_has() { grep -q "$2" "$LOG_DIR/$1.log" 2>/dev/null; }

service redis  "$C_REDIS"  "$REDIS_DIR" "$REDIS_PORT" yes 'redis-cli -p $REDIS_PORT ping' \
  'redis-server --dir "$REDIS_DIR" --save "" --appendonly no --port $REDIS_PORT'

service worker "$C_WORKER" "$BACKEND"   -             no  'log_has worker "ready\."' \
  '"$VENV/bin/celery" -A backend worker -l info'

service beat   "$C_BEAT"   "$BACKEND"   -             no  'log_has beat "beat: Starting"' \
  '"$VENV/bin/celery" -A backend beat -l info --scheduler django_celery_beat.schedulers:DatabaseScheduler'

service web    "$C_WEB"    "$BACKEND"   "$WEB_PORT"   no  - \
  '"$VENV/bin/python" manage.py runserver "$WEB_PORT"'

service ui     "$C_UI"     "$FRONTEND"  "$UI_PORT"    no  - \
  'npm run dev -- --port $UI_PORT --strictPort'

svc_index() {
  local i
  for i in "${!SVC_NAME[@]}"; do
    if [ "${SVC_NAME[$i]}" = "$1" ]; then printf '%s' "$i"; return 0; fi
  done
  return 1
}

# --- flags -------------------------------------------------------------------

SKIP=" "
RECLAIM=0
for arg in "$@"; do
  case "$arg" in
    --reclaim) RECLAIM=1 ;;
    -h|--help) usage; exit 0 ;;
    --no-*)
      want="${arg#--no-}"
      [ "$want" = frontend ] && want=ui  # dev.sh's original spelling
      if ! svc_index "$want" >/dev/null; then
        die "unknown service '$want' — known services: ${SVC_NAME[*]}"
      fi
      SKIP="$SKIP$want "
      ;;
    *) echo "unknown option: $arg" >&2; usage >&2; exit 2 ;;
  esac
done

enabled() { case "$SKIP" in *" $1 "*) return 1 ;; esac; return 0; }

# --- preflight ---------------------------------------------------------------

[ -x "$VENV/bin/python" ] || die "no virtualenv at $VENV — create it and pip install -r backend/requirements.txt"
[ -f "$ENV_FILE" ]        || die "backend/.env is missing — copy backend/.env.example and fill it in"

# Per-service prerequisites, driven by what is actually enabled.
preflight_service() {
  case "$1" in
    redis) command -v redis-server >/dev/null || die "redis-server not found — brew install redis" ;;
    ui)    [ -d "$FRONTEND/node_modules" ] || die "frontend/node_modules is missing — run 'npm install' in frontend/" ;;
  esac
}

port_busy()     { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
port_free()     { ! port_busy "$1"; }
# Both return empty (not failure) when there is no match: lsof and ps exit
# non-zero then, and under `set -o pipefail` that would abort the caller's
# command substitution.
port_pid()      { lsof -nP -iTCP:"$1" -sTCP:LISTEN -Fp 2>/dev/null | sed -n 's/^p//p' | head -1 || true; }
proc_cmd()      { ps -o command= -p "$1" 2>/dev/null || true; }

# Only ever reclaim something recognisably from this project.
ours() {
  case "$(proc_cmd "$1")" in
    *"manage.py runserver"*|*"celery -A backend"*|*"$ROOT"*|*redis-server*) return 0 ;;
  esac
  return 1
}

# A previous run that was SIGKILLed (or whose terminal closed) leaves the port
# held. Name the holder and offer to clear it instead of just refusing to start.
reclaim_port() {
  local port="$1" name="$2" pid holder pgid ours_pgid reply
  pid="$(port_pid "$port")"
  [ -n "$pid" ] || return 0
  holder="$(proc_cmd "$pid")"
  if ! ours "$pid"; then
    die "port $port ($name) is held by an unrelated process (pid $pid): ${holder}"
  fi
  note "port $port ($name) held by a leftover from a previous run — pid $pid"
  if [ "$RECLAIM" != 1 ]; then
    if [ -t 0 ]; then
      printf '   stop it? [y/N] '
      read -r reply || reply=n
      case "$reply" in
        y|Y|yes|YES) ;;
        *) die "left alone — stop it yourself, or rerun with --reclaim" ;;
      esac
    else
      die "rerun with --reclaim to stop it automatically"
    fi
  fi
  pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ' || true)"
  ours_pgid="$(ps -o pgid= -p $$ 2>/dev/null | tr -d ' ' || true)"
  if [ -n "$pgid" ] && [ "$pgid" != "$ours_pgid" ]; then
    kill -TERM -- "-$pgid" 2>/dev/null || true
  else
    kill -TERM "$pid" 2>/dev/null || true
  fi
  wait_for 20 0.25 port_free "$port" || die "could not free port $port (pid $pid)"
  note "reclaimed port $port"
}

for i in "${!SVC_NAME[@]}"; do
  enabled "${SVC_NAME[$i]}" || continue
  preflight_service "${SVC_NAME[$i]}"
  # Adoptable services are allowed to be up already; that is the reuse path.
  if [ "${SVC_PORT[$i]}" != "-" ] && [ "${SVC_ADOPT[$i]}" != yes ]; then
    reclaim_port "${SVC_PORT[$i]}" "${SVC_NAME[$i]}"
  fi
done

# CORS is the one setting that fails silently when the frontend port moves.
if enabled ui; then
  cors="$(env_get CORS_ALLOWED_ORIGINS)"
  cors="${cors:-http://localhost:5173}"
  case "$cors" in
    *"http://localhost:$UI_PORT"*) ;;
    *) warn "CORS_ALLOWED_ORIGINS ($cors) does not list http://localhost:$UI_PORT — browser calls to the API will be blocked" ;;
  esac
fi

mkdir -p "$LOG_DIR" "$REDIS_DIR"

# --- process bookkeeping -----------------------------------------------------

# Each service runs as a brace group, so $! *is* the process-group leader and a
# group kill reaches the child tree. Without the braces $! is the pipeline's
# last member and the group has to be looked up via ps.
PIDS=()
NAMES=()
ADOPTED=" "

# Liveness is observed through the log pump, not the service itself: the pump
# exits when its pipe closes, which is when the service exits. Deliberate — a
# service that closed stdout but kept running would be missed, and none of
# these five do that.
pumps_dead() {
  local pid
  for pid in "${PIDS[@]:-}"; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then return 1; fi
  done
  return 0
}

CLEANED=0
cleanup() {
  [ "$CLEANED" = 1 ] && return 0
  CLEANED=1
  trap - INT TERM HUP EXIT
  echo
  note "shutting down…"
  # Job-control notices ("[3]+ Terminated ...") are noise; park them in a log.
  : > "$LOG_DIR/shutdown.log"
  exec 2>>"$LOG_DIR/shutdown.log"
  for pid in "${PIDS[@]:-}"; do
    [ -n "$pid" ] && kill -TERM -- "-$pid" 2>/dev/null || true
  done
  wait_for 10 0.3 pumps_dead || true
  for pid in "${PIDS[@]:-}"; do
    [ -n "$pid" ] && kill -KILL -- "-$pid" 2>/dev/null || true
  done
  local n
  for n in $ADOPTED; do
    note "$n left running (it was not started by this script)"
  done
  note "all stopped. logs in ${LOG_DIR#$ROOT/}/"
}
on_signal() { cleanup; exit 130; }
trap on_signal INT TERM HUP
trap cleanup EXIT

# run_service <name> <colour> <workdir> <command-string>
run_service() {
  local name="$1" color="$2" dir="$3" cmd="$4"
  : > "$LOG_DIR/$name.log"
  { ( cd "$dir" && eval "exec $cmd" 2>&1 ) \
      | while IFS= read -r line; do
          printf '%s[%s]%s %s\n' "$color" "$name" "$C_RESET" "$line"
          printf '%s\n' "$line" >> "$LOG_DIR/$name.log"
        done
  } &
  PIDS+=("$!")
  NAMES+=("$name")
}

# --- migrations sanity -------------------------------------------------------

# `migrate --check` exits 1 for unapplied migrations *and* for a broken
# settings/env, so the exit code alone can't name the cause — keep its output
# and surface it if the follow-up migrate also fails.
if check_out=$("$VENV/bin/python" "$BACKEND/manage.py" migrate --check 2>&1); then
  :
else
  note "migrate --check failed — attempting to apply migrations"
  if ! (cd "$BACKEND" && "$VENV/bin/python" manage.py migrate); then
    die "migrate failed. 'migrate --check' had reported:
$check_out"
  fi
fi

# --- start -------------------------------------------------------------------

for i in "${!SVC_NAME[@]}"; do
  name="${SVC_NAME[$i]}"
  enabled "$name" || continue

  probe="${SVC_PROBE[$i]}"
  [ "$probe" = "-" ] && probe="port_busy ${SVC_PORT[$i]}"

  if [ "${SVC_ADOPT[$i]}" = yes ] && eval "$probe" >/dev/null 2>&1; then
    note "$name already running — reusing it"
    ADOPTED="$ADOPTED$name "
    continue
  fi

  # Not every service speaks HTTP; each one prints its own URL when it has one.
  if [ "${SVC_PORT[$i]}" != "-" ]; then
    note "starting $name (port ${SVC_PORT[$i]})"
  else
    note "starting $name"
  fi
  run_service "$name" "${SVC_COLOR[$i]}" "${SVC_DIR[$i]}" "${SVC_CMD[$i]}"

  # "stack up" should be a true statement, so gate on readiness before moving on.
  wait_for 60 0.25 eval "$probe" \
    || die "$name did not become ready — see $LOG_DIR/$name.log"
done

echo
note "stack up (${NAMES[*]:-none}) — Ctrl-C to stop everything"
echo

# If any service dies, bring the whole stack down rather than limping on.
# (bash 3.2 on macOS has no `wait -n`, so poll.)
while :; do
  for i in "${!PIDS[@]}"; do
    if ! kill -0 "${PIDS[$i]}" 2>/dev/null; then
      note "${NAMES[$i]} exited — stopping the rest"
      exit 1
    fi
  done
  sleep 1
done
