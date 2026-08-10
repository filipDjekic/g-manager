#!/usr/bin/env bash
set -euo pipefail
origin=${1:?HTTPS canonical origin is required}
case "$origin" in https://*) ;; *) echo "Smoke requires HTTPS" >&2; exit 1;; esac
retry(){ for _ in $(seq 1 30); do if "$@"; then return 0; fi; sleep 2; done; return 1; }
retry curl --fail --silent --show-error "$origin/healthz"
curl --fail --silent --show-error "$origin/" | grep -q 'G-Manager'
headers=$(mktemp); trap 'rm -f "$headers"' EXIT
curl --fail --silent --show-error -D "$headers" -o /dev/null "$origin/"
grep -qi '^strict-transport-security:.*max-age=' "$headers"
grep -qi '^content-security-policy:' "$headers"
curl --silent --show-error "$origin/api/v1/catalog" | grep -q 'Authentication is required'
echo "Staging smoke passed for $origin"
