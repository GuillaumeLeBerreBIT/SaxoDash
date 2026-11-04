#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

ci_conclusion() {
  local body
  body="$(curl -fsS --max-time 20 -H 'Accept: application/vnd.github+json' \
    "https://api.github.com/repos/$GITHUB_REPO/actions/workflows/ci.yml/runs?head_sha=$1&event=push&branch=main&per_page=5")" \
    || { echo unknown; return 0; }
  python3 -c '
import json, sys
runs = json.load(sys.stdin).get("workflow_runs", [])
if not runs:
    print("pending")
else:
    run = max(runs, key=lambda r: (r.get("run_number", 0), r.get("run_attempt", 0)))
    print(run.get("conclusion") or "pending" if run.get("status") == "completed" else "pending")
' <<<"$body" 2>/dev/null || echo unknown
}

take_lock
cd "$REPO_DIR"

if [ -n "$(state_get pinned)" ]; then
  exit 0
fi

if ! git fetch --quiet origin main; then
  log "could not fetch main from GitHub; trying again at the next check"
  exit 0
fi

target="$(git rev-parse origin/main)"
[ "$target" = "$(state_get deployed)" ] && exit 0
[ "$target" = "$(state_get refused)" ] && exit 0

conclusion="$(ci_conclusion "$target")"
case "$conclusion" in
  success)
    exec "$REPO_DIR/deploy/deploy.sh" "$target"
    ;;
  pending)
    log "waiting for CI on ${target:0:12}"
    ;;
  unknown)
    log "could not read CI's result for ${target:0:12} from GitHub; trying again at the next check"
    ;;
  *)
    log "CI ended '$conclusion' on ${target:0:12}; not deploying it"
    state_set refused "$target"
    state_set status "refused $target: CI $conclusion"
    ;;
esac
