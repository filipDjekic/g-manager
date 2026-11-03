#!/usr/bin/env bash
set -euo pipefail
: "${DB_HOST:?}" "${DB_NAME:?}" "${DB_PASSWORD_FILE:?}" "${BACKUP_KEY_FILE:?}"
DB_USER=${DB_USER:-$(cat "${DB_USER_FILE:?}")}
umask 077
output=${BACKUP_OUTPUT_DIR:-/backup/output}; retention=${BACKUP_RETENTION_DAYS:-30}
[[ "$DB_NAME" =~ ^[a-zA-Z0-9_]+$ && "$retention" =~ ^[0-9]+$ ]] || exit 2
mkdir -p "$output"; output=$(cd "$output" && pwd)
password=$(cat "$DB_PASSWORD_FILE"); [ -n "$password" ] && [ "$(wc -c < "$BACKUP_KEY_FILE")" -ge 32 ]
stamp=$(date -u +%Y%m%dT%H%M%SZ); work=$(mktemp -d "$output/.backup-XXXXXXXX")
encrypted="$output/${DB_NAME}-${stamp}-${work##*-}.sql.gz.enc"
trap 'rm -rf -- "$work"' EXIT
# A logical application restore must not modify the host's global GTID/replication state.
dump_timeout=${BACKUP_DUMP_TIMEOUT_SECONDS:-300}
[[ "$dump_timeout" =~ ^[0-9]+$ && "$dump_timeout" -ge 30 && "$dump_timeout" -le 540 ]] || exit 2
# Restore runs in an isolated schema. Omit restore-time LOCK TABLES statements so
# the restricted verifier needs no extra locking privilege.
MYSQL_PWD="$password" timeout --kill-after=10 "$dump_timeout" mysqldump -h "$DB_HOST" -u "$DB_USER" --single-transaction --skip-add-locks --no-tablespaces --set-gtid-purged=OFF --routines --triggers --events "$DB_NAME" | gzip -9 > "$work/dump.gz"
gzip -t "$work/dump.gz"
openssl enc -aes-256-cbc -pbkdf2 -salt -in "$work/dump.gz" -out "$work/encrypted" -pass "file:$BACKUP_KEY_FILE"
mv "$work/encrypted" "$encrypted"
# Relative sidecar survives copying the pair to another protected backup directory.
(cd "$output" && sha256sum "${encrypted##*/}") > "$work/checksum"
mv "$work/checksum" "$encrypted.sha256"
find "$output" -maxdepth 1 -type f -mtime "+$retention" \( -name "$DB_NAME-*.sql.gz.enc" -o -name "$DB_NAME-*.sql.gz.enc.sha256" \) -delete
date -u +%s > "$work/last-success"; mv "$work/last-success" "$output/last-success"
echo "$encrypted"
