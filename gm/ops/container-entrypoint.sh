#!/bin/sh
set -eu
read_secret() { var="$1"; file="$2"; eval "value=\${$var:-}"; [ -n "$value" ] && return; [ -r "$file" ] || { echo "Required secret $var or readable secret file $file is missing" >&2; exit 1; }; value=$(cat "$file"); [ -n "$value" ] || { echo "Required secret is empty: $var" >&2; exit 1; }; export "$var=$value"; }
read_secret JWT_SECRET "${JWT_SECRET_FILE:-/run/secrets/jwt_secret}"
read_secret DB_USERNAME "${DB_USERNAME_FILE:-/run/secrets/db_username}"
read_secret DB_PASSWORD "${DB_PASSWORD_FILE:-/run/secrets/db_password}"
read_secret STATION_POLICY_SIGNING_PRIVATE_KEY "${STATION_POLICY_SIGNING_PRIVATE_KEY_FILE:-/run/secrets/station_policy_signing_private_key}"
[ -n "${DB_URL:-}" ] && [ -n "${CANONICAL_ORIGIN:-}" ] && [ -n "${APP_RELEASE:-}" ] || { echo "DB_URL, CANONICAL_ORIGIN and APP_RELEASE are required" >&2; exit 1; }
if [ "${DOCUMENT_STORAGE_BACKEND:-}" = "s3" ]; then
  read_secret DOCUMENT_S3_ACCESS_KEY "${DOCUMENT_S3_ACCESS_KEY_FILE:-/run/secrets/document_s3_access_key}"
  read_secret DOCUMENT_S3_SECRET_KEY "${DOCUMENT_S3_SECRET_KEY_FILE:-/run/secrets/document_s3_secret_key}"
fi
if [ "${AI_PROVIDER:-disabled}" = "http" ]; then
  read_secret AI_API_KEY "${AI_API_KEY_FILE:-/run/secrets/ai_api_key}"
fi
exec java -jar /app/app.jar
