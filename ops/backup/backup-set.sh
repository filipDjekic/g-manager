#!/usr/bin/env bash
# Explicit operator tool: immutable document snapshot paired with a DB backup during a write pause.
set -euo pipefail
: "${DOCUMENT_BACKUP_ROOT:?Mount the local document volume read-only}" "${BACKUP_KEY_FILE:?}"
[ "${BACKUP_WRITES_QUIESCED:-}" = true ] || { echo 'Pause application writes and document garbage collection first; set BACKUP_WRITES_QUIESCED=true' >&2; exit 2; }
[ -d "$DOCUMENT_BACKUP_ROOT" ] || exit 2
umask 077
database=$(/backup/backup.sh)
output=$(dirname "$database"); work=$(mktemp -d "$output/.objects-XXXXXXXX");trap 'rm -rf -- "$work"' EXIT
objects="${database%.sql.gz.enc}.documents.tar.gz.enc"
tar -C "$DOCUMENT_BACKUP_ROOT" -czf "$work/documents.tar.gz" .
gzip -t "$work/documents.tar.gz"
openssl enc -aes-256-cbc -pbkdf2 -salt -in "$work/documents.tar.gz" -out "$work/objects" -pass "file:$BACKUP_KEY_FILE"
mv "$work/objects" "$objects"
(cd "$output" && sha256sum "${objects##*/}") > "$objects.sha256"
printf 'database=%s\ndocuments=%s\nwritesQuiesced=true\n' "${database##*/}" "${objects##*/}" > "$work/manifest"
mv "$work/manifest" "${database%.sql.gz.enc}.manifest"
echo "${database%.sql.gz.enc}.manifest"
