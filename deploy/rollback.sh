#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

usage() {
  cat <<USAGE
Run an earlier release, and stay on it until released.

Run it as the deploy user: sudo -u saxodash-deploy /opt/saxodash/deploy/rollback.sh ...

Usage: deploy/rollback.sh <sha or prefix>   deploy that earlier release and pin it
       deploy/rollback.sh --release         stop pinning; the next check deploys main again
       deploy/rollback.sh --list            the releases deployed so far, newest last

Only a commit that has been deployed before is accepted. A rollback does not undo
migrations; to return the database too, restore the backup taken before the deploy
you are undoing (deploy/restore.sh).
USAGE
}

case "${1:-}" in
  ""|-h|--help) usage; exit 0 ;;
  --list) cat "$STATE_DIR/history" 2>/dev/null || true; exit 0 ;;
  --release)
    state_clear pinned
    log "no longer pinned; the next check deploys main if it differs"
    exit 0
    ;;
esac

[[ "$1" =~ ^[0-9a-f]{4,40}$ ]] || die "give a commit sha or at least its first 4 characters"
matches="$(grep -E "^$1" "$STATE_DIR/history" 2>/dev/null | sort -u || true)"
[ -n "$matches" ] || die "$1 has never been deployed here (deploy/rollback.sh --list shows what has)"
[ "$(printf '%s\n' "$matches" | wc -l)" -eq 1 ] || die "$1 matches more than one release; give more characters"

take_lock
state_set pinned "$matches"
log "pinned to ${matches:0:12}; automatic deploys are paused until deploy/rollback.sh --release"
exec "$REPO_DIR/deploy/deploy.sh" "$matches"
