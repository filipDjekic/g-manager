#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")"
: "${APP_RELEASE:?}" "${DEPLOY_SECRETS_DIR:?}" "${CLIENT_RELEASES_DIR:?}"
[[ "$APP_RELEASE" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$ ]] || exit 2
state=$(python3 release_config.py state)
exec 9>"$state/deployment.lock"
flock -n 9 || { echo 'Another deployment/rollback is running' >&2; exit 1; }
current="$state/current.json"; previous="$state/previous.json"; candidate="$state/$APP_RELEASE.json"
if [ -f releases/current.env ] && [ ! -f "$current" ];then echo 'Import and validate legacy public release metadata before deployment; no migration was executed' >&2;exit 2;fi
if [ ! -f "$current" ]; then
  : "${INITIAL_OWNER_EMAIL:?First release requires the initial OWNER email}"
  test -s "$DEPLOY_SECRETS_DIR/initial_owner_password"
fi
python3 release_config.py write "$candidate"
bash preflight.sh "$candidate"
compose(){ python3 release_config.py compose "$candidate" "$@"; }
cleanup(){ compose --profile operations rm -sf restore-backend >/dev/null 2>&1 || true; }
trap cleanup EXIT
compose pull backend frontend mysql
compose stop backup-scheduler
compose up -d --wait mysql
backup_and_restore(){
  backup=$(compose --profile operations run --rm -T backup | tail -n 1)
  [[ "$backup" =~ ^/backup/output/[a-zA-Z0-9_.-]+\.sql\.gz\.enc$ ]] || { echo 'Invalid backup result' >&2; exit 1; }
  export BACKUP_FILE="$backup"
  compose --profile operations run --rm -T restore-drill
  compose --profile operations run --rm -T migrate-restored
  compose --profile operations up -d --wait restore-backend
  compose --profile operations exec -T restore-backend curl --fail --silent http://127.0.0.1:9091/actuator/health/readiness
  compose --profile operations rm -sf restore-backend
}
if [ -f "$current" ]; then backup_and_restore; fi
compose --profile migration run --rm -T migrate
if [ ! -f "$current" ]; then backup_and_restore; fi
compose up -d --wait --wait-timeout 600 clamav backend frontend
if [ "$(python3 release_config.py get "$candidate" ENABLE_TLS)" != false ]; then compose up -d --wait tls; fi
if [ "$(python3 release_config.py get "$candidate" ENABLE_MONITORING)" != false ]; then compose up -d prometheus alertmanager grafana blackbox; fi
bash smoke.sh "$(python3 release_config.py get "$candidate" CANONICAL_ORIGIN)"
url=$(python3 release_config.py get "$candidate" GAMING_CLIENT_DOWNLOAD_URL)
expected=$(python3 release_config.py get "$candidate" GAMING_CLIENT_SHA256)
download=$(mktemp);trap 'rm -f -- "$download"; cleanup' EXIT
http_status=$(curl --fail --silent --show-error --proto '=https' --max-time 180 --write-out '%{http_code}' "$url" -o "$download")
[ "$http_status" = 200 ] || { echo 'Published package must return HTTP 200 without redirects' >&2;exit 1; }
printf '%s  %s\n' "$expected" "$download" | sha256sum --check --status
compose run --rm -T --no-deps backup-scheduler /backup/scheduled-backup.sh
compose up -d backup-scheduler
[ ! -f "$current" ] || cp "$current" "$previous"
cp "$candidate" "$current.tmp";mv "$current.tmp" "$current"
echo "Release $APP_RELEASE deployed; migration, restore, HTTPS package hash and smoke gates passed"
