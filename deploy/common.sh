# shellcheck shell=bash disable=SC2034
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${SAXODASH_ENV_FILE:-/srv/saxodash/.env}"
STATE_DIR="${SAXODASH_STATE_DIR:-/var/lib/saxodash-deploy}"
GITHUB_REPO="${SAXODASH_GITHUB_REPO:-GuillaumeLeBerreBIT/SaxoDash}"
HEALTH_TRIES="${SAXODASH_HEALTH_TRIES:-40}"
HEALTH_INTERVAL="${SAXODASH_HEALTH_INTERVAL:-3}"
KEEP_RELEASES=5

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "error: $*" >&2; exit 1; }

compose() { docker compose --env-file "$ENV_FILE" -f "$REPO_DIR/deploy/compose.yaml" "$@"; }

state_get() { cat "$STATE_DIR/$1" 2>/dev/null || true; }
state_set() { printf '%s\n' "$2" > "$STATE_DIR/$1.tmp" && mv "$STATE_DIR/$1.tmp" "$STATE_DIR/$1"; }
state_clear() { rm -f "$STATE_DIR/$1"; }

take_lock() {
  [ -n "${SAXODASH_LOCK_HELD:-}" ] && return 0
  mkdir -p "$STATE_DIR"
  exec 9>"$STATE_DIR/lock"
  flock -n 9 || die "another deploy is running"
  export SAXODASH_LOCK_HELD=1
}

site_host() {
  sed -n 's/^ALLOWED_HOSTS=//p' "$ENV_FILE" | tail -1 | cut -d, -f1 | tr -d '"'"'"' \r'
}
