#!/usr/bin/env bash
set -uo pipefail

SOURCE_DEPLOY="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASSED=0
FAILED=0

fail() { printf '  FAIL: %s\n' "$1"; CASE_OK=0; }
assert_eq() { [ "$1" = "$2" ] || fail "$3: expected '$2', got '$1'"; }
assert_log_has() { grep -qF -- "$1" "$STUB_LOG" || fail "docker was never called with: $1"; }
assert_log_lacks() { ! grep -qF -- "$1" "$STUB_LOG" || fail "docker was called with: $1"; }
state() { cat "$SAXODASH_STATE_DIR/$1" 2>/dev/null || true; }

write_stubs() {
  mkdir -p "$T/bin"
  cat > "$T/bin/docker" <<'STUB'
#!/usr/bin/env bash
args="$*"
printf 'TAG=%s %s\n' "${SAXODASH_TAG:-}" "$args" >> "$STUB_LOG"
if [ -n "${STUB_FAIL:-}" ] && [[ "$args" == *"$STUB_FAIL"* ]]; then exit 1; fi
case "$args" in
  *" up -d --remove-orphans"*) printf '%s\n' "${SAXODASH_TAG:-}" > "$STUB_DIR/running" ;;
  *" ps -q web"*) echo web-1 ;;
  inspect*)
    running="$(cat "$STUB_DIR/running" 2>/dev/null || true)"
    if [ -n "${STUB_UNHEALTHY_TAG:-}" ] && [ "$running" = "$STUB_UNHEALTHY_TAG" ]; then echo unhealthy; else echo healthy; fi
    ;;
esac
exit 0
STUB
  cat > "$T/bin/curl" <<'STUB'
#!/usr/bin/env bash
echo "$*" >> "$STUB_DIR/curl.log"
case "${STUB_CI:-success}" in
  error) exit 22 ;;
  none) echo '{"workflow_runs": []}' ;;
  pending) echo '{"workflow_runs": [{"run_number": 1, "status": "in_progress", "conclusion": null}]}' ;;
  *) printf '{"workflow_runs": [{"run_number": 1, "status": "completed", "conclusion": "%s"}]}\n' "$STUB_CI" ;;
esac
STUB
  chmod +x "$T/bin/docker" "$T/bin/curl"
}

setup() {
  T="$(mktemp -d)"
  export STUB_DIR="$T/stub" STUB_LOG="$T/stub/docker.log"
  export SAXODASH_STATE_DIR="$T/state" SAXODASH_ENV_FILE="$T/env"
  export SAXODASH_HEALTH_TRIES=2 SAXODASH_HEALTH_INTERVAL=0
  export STUB_CI=success STUB_FAIL="" STUB_UNHEALTHY_TAG=""
  export PATH="$T/bin:$ORIGINAL_PATH"
  unset SAXODASH_LOCK_HELD SAXODASH_DEPLOY_REEXEC
  mkdir -p "$STUB_DIR" "$SAXODASH_STATE_DIR"
  : > "$STUB_LOG"
  printf 'ALLOWED_HOSTS=saxodash.example\nPOSTGRES_PASSWORD=x\n' > "$SAXODASH_ENV_FILE"
  write_stubs

  git init --quiet --bare -b main "$T/origin.git"
  git init --quiet -b main "$T/src"
  cp -R "$SOURCE_DEPLOY" "$T/src/deploy"
  rm -rf "$T/src/deploy/tests"
  git -C "$T/src" add -A
  git -C "$T/src" -c user.email=t@t -c user.name=t commit --quiet -m one
  A="$(git -C "$T/src" rev-parse HEAD)"
  echo two > "$T/src/CHANGE"
  git -C "$T/src" add -A
  git -C "$T/src" -c user.email=t@t -c user.name=t commit --quiet -m two
  B="$(git -C "$T/src" rev-parse HEAD)"
  git -C "$T/src" -c push.negotiate=false push --quiet "$T/origin.git" main 2>/dev/null
  git clone --quiet "$T/origin.git" "$T/app"
  git -C "$T/app" checkout --quiet --detach "$A"
  APP="$T/app"
}

running_as() {
  printf '%s\n' "$1" > "$SAXODASH_STATE_DIR/deployed"
  printf '%s\n' "$1" >> "$SAXODASH_STATE_DIR/history"
}

run_case() {
  local name="$1"
  CASE_OK=1
  setup
  "$name" > "$T/output" 2>&1
  if [ "$CASE_OK" = 1 ]; then
    PASSED=$((PASSED + 1)); printf 'ok    %s\n' "$name"
  else
    FAILED=$((FAILED + 1)); printf 'FAIL  %s\n' "$name"; sed 's/^/      /' "$T/output"
  fi
  rm -rf "$T"
}

deploys_a_commit_that_passed_ci() {
  running_as "$A"
  "$APP/deploy/poll.sh" || fail "poll exited non-zero"
  assert_eq "$(state deployed)" "$B" "deployed"
  assert_eq "$(git -C "$APP" rev-parse HEAD)" "$B" "checkout"
  assert_log_has "TAG=${A:0:12} compose --env-file $SAXODASH_ENV_FILE -f $APP/deploy/compose.yaml run --rm --no-deps web python manage.py backup_database"
  assert_log_has "TAG=${B:0:12} compose --env-file $SAXODASH_ENV_FILE -f $APP/deploy/compose.yaml build web proxy"
  assert_log_has "TAG=${B:0:12} compose --env-file $SAXODASH_ENV_FILE -f $APP/deploy/compose.yaml run --rm --no-deps web python manage.py migrate --noinput"
  assert_log_has "TAG=${B:0:12} compose --env-file $SAXODASH_ENV_FILE -f $APP/deploy/compose.yaml up -d --remove-orphans"
  assert_log_has "--header Host: saxodash.example http://127.0.0.1/healthz"
  assert_eq "$(state status)" "ok $B" "status"
}

backs_up_before_migrating_and_migrates_before_starting() {
  running_as "$A"
  "$APP/deploy/poll.sh" || fail "poll exited non-zero"
  local order
  order="$(grep -nE 'backup_database|migrate --noinput|up -d --remove-orphans' "$STUB_LOG" | cut -d: -f1 | tr '\n' ' ')"
  local backup migrate up
  backup="$(grep -n backup_database "$STUB_LOG" | head -1 | cut -d: -f1)"
  migrate="$(grep -n 'migrate --noinput' "$STUB_LOG" | head -1 | cut -d: -f1)"
  up="$(grep -n 'up -d --remove-orphans' "$STUB_LOG" | head -1 | cut -d: -f1)"
  { [ "$backup" -lt "$migrate" ] && [ "$migrate" -lt "$up" ]; } || fail "order was backup=$backup migrate=$migrate up=$up ($order)"
}

waits_while_ci_is_still_running() {
  running_as "$A"
  STUB_CI=pending "$APP/deploy/poll.sh" || fail "poll exited non-zero"
  assert_eq "$(state deployed)" "$A" "deployed"
  assert_log_lacks "build web proxy"
  assert_eq "$(state refused)" "" "refused"
}

waits_when_ci_has_not_started() {
  running_as "$A"
  STUB_CI=none "$APP/deploy/poll.sh" || fail "poll exited non-zero"
  assert_log_lacks "build web proxy"
}

waits_when_github_cannot_be_reached() {
  running_as "$A"
  STUB_CI=error "$APP/deploy/poll.sh" || fail "poll exited non-zero"
  assert_log_lacks "build web proxy"
  assert_eq "$(state refused)" "" "refused"
}

refuses_a_commit_whose_ci_failed_and_asks_only_once() {
  running_as "$A"
  STUB_CI=failure "$APP/deploy/poll.sh" || fail "poll exited non-zero"
  assert_eq "$(state refused)" "$B" "refused"
  assert_log_lacks "build web proxy"
  STUB_CI=failure "$APP/deploy/poll.sh" || fail "second poll exited non-zero"
  assert_eq "$(wc -l < "$STUB_DIR/curl.log" | tr -d ' ')" "1" "GitHub API calls"
}

does_nothing_when_main_is_already_running() {
  running_as "$B"
  git -C "$APP" checkout --quiet --detach "$B"
  "$APP/deploy/poll.sh" || fail "poll exited non-zero"
  assert_eq "$(cat "$STUB_DIR/curl.log" 2>/dev/null)" "" "GitHub API calls"
  assert_eq "$(cat "$STUB_LOG")" "" "docker calls"
}

rolls_back_when_the_new_release_is_unhealthy() {
  running_as "$A"
  STUB_UNHEALTHY_TAG="${B:0:12}" "$APP/deploy/poll.sh" && fail "poll should have failed"
  assert_eq "$(state deployed)" "$A" "deployed"
  assert_eq "$(state refused)" "$B" "refused"
  assert_eq "$(git -C "$APP" rev-parse HEAD)" "$A" "checkout"
  assert_eq "$(cat "$STUB_DIR/running")" "${A:0:12}" "running images"
  case "$(state status)" in *"rolled back to ${A:0:12}"*) ;; *) fail "status: $(state status)" ;; esac
}

a_failed_migration_leaves_the_running_release_alone() {
  running_as "$A"
  STUB_FAIL="migrate --noinput" "$APP/deploy/poll.sh" && fail "poll should have failed"
  assert_log_lacks "TAG=${B:0:12} compose --env-file $SAXODASH_ENV_FILE -f $APP/deploy/compose.yaml up -d --remove-orphans"
  assert_eq "$(state deployed)" "$A" "deployed"
  assert_eq "$(state refused)" "$B" "refused"
  assert_eq "$(git -C "$APP" rev-parse HEAD)" "$A" "checkout"
}

a_failed_backup_stops_before_migrating() {
  running_as "$A"
  STUB_FAIL="backup_database" "$APP/deploy/poll.sh" && fail "poll should have failed"
  assert_log_lacks "migrate --noinput"
  assert_eq "$(state deployed)" "$A" "deployed"
}

a_first_deploy_backs_up_with_its_own_image() {
  "$APP/deploy/poll.sh" || fail "poll exited non-zero"
  assert_log_has "TAG=${B:0:12} compose --env-file $SAXODASH_ENV_FILE -f $APP/deploy/compose.yaml run --rm --no-deps web python manage.py backup_database"
  assert_eq "$(state deployed)" "$B" "deployed"
}

a_pinned_release_is_not_replaced() {
  running_as "$A"
  printf '%s\n' "$A" > "$SAXODASH_STATE_DIR/pinned"
  "$APP/deploy/poll.sh" || fail "poll exited non-zero"
  assert_eq "$(state deployed)" "$A" "deployed"
  assert_eq "$(cat "$STUB_LOG")" "" "docker calls"
}

rollback_pins_and_deploys_an_earlier_release() {
  running_as "$A"
  "$APP/deploy/poll.sh" || fail "deploying B failed"
  : > "$STUB_LOG"
  "$APP/deploy/rollback.sh" "${A:0:8}" || fail "rollback exited non-zero"
  assert_eq "$(state pinned)" "$A" "pinned"
  assert_eq "$(state deployed)" "$A" "deployed"
  assert_eq "$(cat "$STUB_DIR/running")" "${A:0:12}" "running images"
  "$APP/deploy/rollback.sh" --release || fail "release exited non-zero"
  assert_eq "$(state pinned)" "" "pinned after release"
}

rollback_refuses_a_commit_never_deployed() {
  running_as "$A"
  "$APP/deploy/rollback.sh" "${B:0:8}" && fail "rollback should have refused"
  assert_eq "$(state pinned)" "" "pinned"
  assert_eq "$(cat "$STUB_LOG")" "" "docker calls"
}

ORIGINAL_PATH="$PATH"
for name in \
  deploys_a_commit_that_passed_ci \
  backs_up_before_migrating_and_migrates_before_starting \
  waits_while_ci_is_still_running \
  waits_when_ci_has_not_started \
  waits_when_github_cannot_be_reached \
  refuses_a_commit_whose_ci_failed_and_asks_only_once \
  does_nothing_when_main_is_already_running \
  rolls_back_when_the_new_release_is_unhealthy \
  a_failed_migration_leaves_the_running_release_alone \
  a_failed_backup_stops_before_migrating \
  a_first_deploy_backs_up_with_its_own_image \
  a_pinned_release_is_not_replaced \
  rollback_pins_and_deploys_an_earlier_release \
  rollback_refuses_a_commit_never_deployed
do
  run_case "$name"
done

printf '\n%d passed, %d failed\n' "$PASSED" "$FAILED"
[ "$FAILED" = 0 ]
