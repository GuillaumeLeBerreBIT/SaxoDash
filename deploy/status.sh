#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

show() { printf '%-10s %s\n' "$1" "${2:-—}"; }
show running "$(state_get deployed)"
show last "$(state_get status)"
show pinned "$(state_get pinned)"
show refused "$(state_get refused)"
if command -v systemctl >/dev/null; then
  show timer "$(systemctl is-active saxodash-deploy.timer 2>/dev/null || true)"
  echo
  journalctl -u saxodash-deploy --no-pager -n 15 -o cat 2>/dev/null || true
fi
