#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
previous=releases/previous.env; [ -f "$previous" ] || { echo "No previous successful release" >&2; exit 1; }
set -a; source "$previous"; set +a
[[ "$BACKEND_IMAGE" == *@sha256:* && "$FRONTEND_IMAGE" == *@sha256:* ]]
docker compose --env-file "$previous" pull backend frontend
docker compose --env-file "$previous" up -d backend frontend
./smoke.sh "$CANONICAL_ORIGIN"
cp "$previous" releases/current.env
echo "Rollback to $APP_RELEASE completed; database was not rolled back"
