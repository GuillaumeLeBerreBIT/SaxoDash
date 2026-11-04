#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SAXODASH_ENV_FILE:-/srv/saxodash/.env}"
TAG_FILE="$DEPLOY_DIR/../.deployed"
APP_SERVICES=(proxy web worker beat)

die() { printf 'error: %s\n' "$1" >&2; exit 1; }

usage() {
  cat <<USAGE
Restore the SaxoDash database from a backup made by core/backup.py.

Usage: deploy/restore.sh <backup.dump> [--yes]

Stops the app (proxy, web, worker, beat), replaces the whole database with the
backup in one transaction, and starts the app again. Postgres keeps running and
its data folder is never removed. Without --yes it asks before replacing anything.

Restore with the app version that made the backup: tables a later migration added
are not part of the backup and stay behind.
USAGE
}

dump="" assume_yes=0
for arg in "$@"; do
  case "$arg" in
    --yes) assume_yes=1 ;;
    -h|--help) usage; exit 0 ;;
    -*) usage >&2; exit 2 ;;
    *) [ -z "$dump" ] || die "one backup file at a time"; dump="$arg" ;;
  esac
done

[ -n "$dump" ] || { usage >&2; exit 2; }
[ -f "$dump" ] || die "no such file: $dump"
case "$dump" in *.dump) ;; *) die "expected a .dump file written by the backup task, got: $dump" ;; esac
[ -r "$ENV_FILE" ] || die "cannot read $ENV_FILE (run with sudo)"

tag="${SAXODASH_TAG:-}"
if [ -z "$tag" ] && [ -f "$TAG_FILE" ]; then tag="$(cat "$TAG_FILE")"; fi
export SAXODASH_TAG="${tag:-local}"

compose() { docker compose --env-file "$ENV_FILE" -f "$DEPLOY_DIR/compose.yaml" "$@"; }

compose ps --status running --services | grep -qx postgres \
  || die "postgres is not running; start it with: docker compose --env-file $ENV_FILE -f $DEPLOY_DIR/compose.yaml up -d postgres"

if [ "$assume_yes" != 1 ]; then
  printf 'This replaces the entire SaxoDash database with %s.\nType "restore" to continue: ' "$dump"
  read -r answer
  [ "$answer" = restore ] || die "nothing changed"
fi

printf '>> stopping %s\n' "${APP_SERVICES[*]}"
compose stop "${APP_SERVICES[@]}"

printf '>> restoring %s\n' "$dump"
if ! compose exec -T postgres pg_restore --clean --if-exists --no-owner --single-transaction --exit-on-error \
    -U saxodash -d saxodash < "$dump"; then
  printf 'error: restore failed; the database is unchanged (single transaction)\n' >&2
  printf '>> starting %s again\n' "${APP_SERVICES[*]}"
  compose up -d "${APP_SERVICES[@]}"
  exit 1
fi

printf '>> starting %s (tag %s)\n' "${APP_SERVICES[*]}" "$SAXODASH_TAG"
compose up -d "${APP_SERVICES[@]}"
printf '>> restored from %s\n' "$dump"
