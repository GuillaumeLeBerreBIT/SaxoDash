#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/GuillaumeLeBerreBIT/SaxoDash.git"
DEPLOY_USER="saxodash-deploy"
APP_DIR="/opt/saxodash"
DATA_DIR="/srv/saxodash"
STATE_DIR="/var/lib/saxodash-deploy"
APP_UID=1000
REQUIRED=(SECRET_KEY POSTGRES_PASSWORD ALLOWED_HOSTS SAXO_TOKEN_ENCRYPTION_KEY ENABLE_BANKING_APPLICATION_ID ENABLE_BANKING_PRIVATE_KEY)

say() { printf '>> %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "run it with sudo"
for tool in docker git curl python3 flock openssl; do
  command -v "$tool" >/dev/null || die "$tool is not installed"
done
docker compose version >/dev/null 2>&1 || die "the docker compose plugin is missing (apt install docker-compose-plugin)"
docker network inspect edge >/dev/null 2>&1 \
  || die "the 'edge' network does not exist; set up the homelab edge first (docker network create edge)"

if ! id -u "$DEPLOY_USER" >/dev/null 2>&1; then
  say "creating the $DEPLOY_USER user"
  useradd --system --home-dir "$STATE_DIR" --create-home --shell /usr/sbin/nologin "$DEPLOY_USER"
fi
usermod -aG docker "$DEPLOY_USER"
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 755 "$STATE_DIR"
[ -e "$STATE_DIR/lock" ] || install -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 644 /dev/null "$STATE_DIR/lock"

if [ -d "$APP_DIR/.git" ]; then
  say "$APP_DIR is already a clone; handing it to $DEPLOY_USER"
  chown -R "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR"
else
  [ -z "$(ls -A "$APP_DIR" 2>/dev/null)" ] || die "$APP_DIR exists and is not a clone of SaxoDash; move it aside first"
  install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 755 "$APP_DIR"
  say "cloning SaxoDash into $APP_DIR"
  runuser -u "$DEPLOY_USER" -- git clone --quiet "$REPO_URL" "$APP_DIR"
fi

install -d -m 755 "$DATA_DIR" "$DATA_DIR/postgres"
install -d -o "$APP_UID" -g "$DEPLOY_USER" -m 750 "$DATA_DIR/backups"

ENV_FILE="$DATA_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  say "creating $ENV_FILE with a fresh SECRET_KEY and POSTGRES_PASSWORD"
  sed -e "s/^SECRET_KEY=\$/SECRET_KEY=$(openssl rand -hex 32)/" \
      -e "s/^POSTGRES_PASSWORD=\$/POSTGRES_PASSWORD=$(openssl rand -hex 32)/" \
      "$APP_DIR/deploy/.env.example" > "$ENV_FILE"
fi
chown "root:$DEPLOY_USER" "$ENV_FILE"
chmod 640 "$ENV_FILE"

install -m 644 "$APP_DIR/deploy/systemd/saxodash-deploy.service" /etc/systemd/system/
install -m 644 "$APP_DIR/deploy/systemd/saxodash-deploy.timer" /etc/systemd/system/
systemctl daemon-reload

blank=()
for key in "${REQUIRED[@]}"; do
  grep -qE "^$key=.+" "$ENV_FILE" || blank+=("$key")
done

if [ "${#blank[@]}" -gt 0 ]; then
  say "almost done. Fill these in $ENV_FILE (sudo nano $ENV_FILE):"
  printf '     %s\n' "${blank[@]}"
  say "then switch automatic deploys on:"
  printf '     sudo systemctl enable --now saxodash-deploy.timer\n'
  exit 0
fi

systemctl enable --now saxodash-deploy.timer
say "automatic deploys are on; the first check runs within two minutes"
say "follow it with: journalctl -u saxodash-deploy -f"
