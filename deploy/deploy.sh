#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

sha="${1:-}"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || die "usage: deploy/deploy.sh <full 40-character commit sha>"

if [ "${SAXODASH_DEPLOY_REEXEC:-}" != "$sha" ]; then
  take_lock
  cd "$REPO_DIR"
  git cat-file -e "$sha^{commit}" 2>/dev/null || git fetch --quiet origin "$sha" || die "commit $sha is not available"
  git checkout --quiet --force --detach "$sha"
  SAXODASH_DEPLOY_REEXEC="$sha" exec "$REPO_DIR/deploy/deploy.sh" "$sha"
fi

cd "$REPO_DIR"
tag="${sha:0:12}"
previous="$(state_get deployed)"
previous_tag="${previous:0:12}"

healthy() {
  local tries="$HEALTH_TRIES" id health host
  host="$(site_host)"
  while [ "$tries" -gt 0 ]; do
    id="$(compose ps -q web 2>/dev/null || true)"
    health="$(docker inspect -f '{{.State.Health.Status}}' "$id" 2>/dev/null || echo missing)"
    if [ "$health" = healthy ] \
      && compose exec -T proxy wget -q -O /dev/null --header "Host: $host" http://127.0.0.1/healthz; then
      return 0
    fi
    [ "$health" = unhealthy ] && return 1
    sleep "$HEALTH_INTERVAL"
    tries=$((tries - 1))
  done
  return 1
}

refuse() {
  state_set refused "$sha"
  state_set status "failed $sha: $1"
  log "error: $1"
  exit 1
}

abort_unchanged() {
  [ -n "$previous" ] && git checkout --quiet --force --detach "$previous"
  refuse "$1; the running version was not touched"
}

roll_back() {
  local reason="$1"
  if [ -z "$previous" ]; then
    refuse "$reason; there is no earlier release to roll back to"
  fi
  log "rolling back to $previous_tag"
  git checkout --quiet --force --detach "$previous"
  if SAXODASH_TAG="$previous_tag" compose up -d --remove-orphans && healthy; then
    refuse "$reason; rolled back to $previous_tag"
  fi
  refuse "$reason; rolling back to $previous_tag failed too, the site is down"
}

prune_images() {
  local keep repo image_tag
  keep=" $(tail -n "$KEEP_RELEASES" "$STATE_DIR/history" 2>/dev/null | cut -c1-12 | tr '\n' ' ') "
  for repo in saxodash-backend saxodash-proxy; do
    for image_tag in $(docker image ls "$repo" --format '{{.Tag}}' 2>/dev/null); do
      case "$keep" in *" $image_tag "*) ;; *) docker image rm "$repo:$image_tag" >/dev/null 2>&1 || true ;; esac
    done
  done
  docker image prune -f >/dev/null 2>&1 || true
}

[ -r "$ENV_FILE" ] || refuse "cannot read $ENV_FILE"
log "deploying $tag (running now: ${previous_tag:-nothing})"
state_set status "deploying $sha"

compose up -d postgres redis || abort_unchanged "postgres or redis did not start"
SAXODASH_TAG="$tag" compose build web proxy || abort_unchanged "building the images failed"

log "backing up the database"
SAXODASH_TAG="${previous_tag:-$tag}" compose run --rm --no-deps web python manage.py backup_database \
  || abort_unchanged "the pre-deploy backup failed"

log "migrating"
SAXODASH_TAG="$tag" compose run --rm --no-deps web python manage.py migrate --noinput \
  || abort_unchanged "migrate failed"
SAXODASH_TAG="$tag" compose run --rm --no-deps web python manage.py sync_periodic_tasks \
  || abort_unchanged "updating the Celery schedule failed"

log "starting $tag"
SAXODASH_TAG="$tag" compose up -d --remove-orphans || roll_back "starting the new release failed"
healthy || roll_back "the new release did not pass its health check"

state_set deployed "$sha"
printf '%s\n' "$sha" >> "$STATE_DIR/history"
state_clear refused
state_set status "ok $sha"
prune_images
log "deployed $tag"
