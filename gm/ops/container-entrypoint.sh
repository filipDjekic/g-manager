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
if [ -n "${INITIAL_OWNER_EMAIL:-}" ]; then
  read_secret INITIAL_OWNER_PASSWORD "${INITIAL_OWNER_PASSWORD_FILE:-/run/secrets/initial_owner_password}"
fi
if [ -r "${BACKUP_COORDINATION_KEY_FILE:-/run/secrets/backup_coordination_key}" ]; then
  read_secret BACKUP_COORDINATION_KEY "${BACKUP_COORDINATION_KEY_FILE:-/run/secrets/backup_coordination_key}"
fi
if [ -n "${SMTP_HOST:-}" ]; then
  read_secret SMTP_USERNAME /run/secrets/smtp_username
  read_secret SMTP_PASSWORD /run/secrets/smtp_password
  read_secret SMTP_FROM /run/secrets/smtp_from
fi
exec java -jar /app/app.jar
