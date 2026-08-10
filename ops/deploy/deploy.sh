#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
: "${BACKEND_IMAGE:?}" "${FRONTEND_IMAGE:?}" "${CANONICAL_ORIGIN:?}" "${APP_RELEASE:?}" "${MIGRATION_DB_PASSWORD:?}"
[[ "$BACKEND_IMAGE" == *@sha256:* && "$FRONTEND_IMAGE" == *@sha256:* ]] || { echo "Deployment requires immutable image digests" >&2; exit 1; }
mkdir -p releases ../backup/output
current=releases/current.env; previous=releases/previous.env; candidate=releases/"$APP_RELEASE.env"
env | grep -E '^(DEPLOY_ENV|APP_RELEASE|BACKEND_IMAGE|FRONTEND_IMAGE|CANONICAL_ORIGIN|APP_PORT|DOCUMENT_|AI_PROVIDER|AI_ENDPOINT|AI_MODEL|BACKUP_RETENTION_DAYS)=' > "$candidate"
docker compose --env-file "$candidate" pull backend frontend mysql
docker compose --env-file "$candidate" up -d mysql
if [ -f "$current" ]; then
  docker compose --env-file "$candidate" --profile operations run --rm backup
  latest=$(ls -1t ../backup/output/*.sql.gz.enc | head -1); export BACKUP_FILE="/backup/output/$(basename "$latest")"
  docker compose --env-file "$candidate" --profile operations run --rm restore-drill
  docker compose --env-file "$candidate" --profile operations up -d --wait restore-backend
  docker compose --env-file "$candidate" --profile operations exec -T restore-backend curl --fail --silent http://127.0.0.1:9091/actuator/health/readiness
  docker compose --env-file "$candidate" --profile operations rm -sf restore-backend
fi
docker compose --env-file "$candidate" --profile migration run --rm migrate
if [ ! -f "$current" ]; then
  docker compose --env-file "$candidate" --profile operations run --rm backup
  latest=$(ls -1t ../backup/output/*.sql.gz.enc | head -1); export BACKUP_FILE="/backup/output/$(basename "$latest")"
  docker compose --env-file "$candidate" --profile operations run --rm restore-drill
  docker compose --env-file "$candidate" --profile operations up -d --wait restore-backend
  docker compose --env-file "$candidate" --profile operations exec -T restore-backend curl --fail --silent http://127.0.0.1:9091/actuator/health/readiness
  docker compose --env-file "$candidate" --profile operations rm -sf restore-backend
fi
docker compose --env-file "$candidate" up -d --remove-orphans backend frontend
"$(dirname "$0")/smoke.sh" "$CANONICAL_ORIGIN"
[ ! -f "$current" ] || cp "$current" "$previous"; cp "$candidate" "$current"
echo "Release $APP_RELEASE deployed and restore/smoke gates passed"
