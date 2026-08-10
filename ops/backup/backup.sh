#!/usr/bin/env bash
set -euo pipefail
: "${DB_HOST:?}" "${DB_NAME:?}" "${DB_USER:?}" "${DB_PASSWORD_FILE:?}" "${BACKUP_KEY_FILE:?}"
output=${BACKUP_OUTPUT_DIR:-/backup/output}; retention=${BACKUP_RETENTION_DAYS:-30}; mkdir -p "$output"
password=$(cat "$DB_PASSWORD_FILE"); key=$(cat "$BACKUP_KEY_FILE"); [ -n "$password" ] && [ ${#key} -ge 32 ]
stamp=$(date -u +%Y%m%dT%H%M%SZ); plain=$(mktemp); encrypted="$output/${DB_NAME}-${stamp}.sql.gz.enc"
trap 'rm -f "$plain"' EXIT
MYSQL_PWD="$password" mysqldump -h "$DB_HOST" -u "$DB_USER" --single-transaction --routines --triggers "$DB_NAME" | gzip -9 > "$plain"
openssl enc -aes-256-cbc -pbkdf2 -salt -in "$plain" -out "$encrypted" -pass "pass:$key"
sha256sum "$encrypted" > "$encrypted.sha256"
find "$output" -type f -mtime "+$retention" \( -name '*.sql.gz.enc' -o -name '*.sha256' \) -delete
echo "$encrypted"
