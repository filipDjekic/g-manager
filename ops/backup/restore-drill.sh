#!/usr/bin/env bash
set -euo pipefail
: "${DB_HOST:?}" "${BACKUP_KEY_FILE:?}" "${BACKUP_FILE:?}"
password_file=${RESTORE_PASSWORD_FILE:-${DB_ROOT_PASSWORD_FILE:-}}
: "${password_file:?Restore password file is required}"
admin=${RESTORE_ADMIN_USER:-root};[[ "$admin" =~ ^[a-zA-Z0-9_]+$ ]] || exit 2
umask 077
target=${RESTORE_DB_NAME:-gmanager_restore_drill}; admin_password=$(cat "$password_file")
[[ "${RESTORE_ISOLATED:-}" == true && "$target" =~ ^gmanager_restore_drill(_[a-z0-9_]+)?$ ]] || { echo 'Restore requires RESTORE_ISOLATED=true and a dedicated gmanager_restore_drill schema' >&2; exit 2; }
grantee=${RESTORE_DB_USER:-$(if [ -n "${RESTORE_DB_USER_FILE:-}" ];then cat "$RESTORE_DB_USER_FILE";else printf gmanager;fi)}; [[ "$grantee" =~ ^[a-zA-Z0-9_]+$ ]] || exit 2
BACKUP_FILE=$(realpath "$BACKUP_FILE"); work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
# Verify only this file; never execute arbitrary paths read from an untrusted checksum manifest.
expected=$(awk 'NR==1 {print $1}' "$BACKUP_FILE.sha256")
[[ "$expected" =~ ^[a-fA-F0-9]{64}$ ]] && [ "$expected" = "$(sha256sum "$BACKUP_FILE" | awk '{print $1}')" ] || { echo 'Backup checksum failed' >&2; exit 1; }
# Finish decrypting and validating BEFORE dropping even the disposable target schema.
openssl enc -d -aes-256-cbc -pbkdf2 -in "$BACKUP_FILE" -out "$work/dump.gz" -pass "file:$BACKUP_KEY_FILE"
gzip -t "$work/dump.gz"; gunzip -c "$work/dump.gz" > "$work/dump.sql"
MYSQL_PWD="$admin_password" mysql --connect-timeout=10 -h "$DB_HOST" -u"$admin" -e "DROP DATABASE IF EXISTS \`$target\`; CREATE DATABASE \`$target\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
MYSQL_PWD="$admin_password" mysql --connect-timeout=10 -h "$DB_HOST" -u"$admin" "$target" < "$work/dump.sql"
if [ "${RESTORE_SKIP_GRANT:-false}" != true ]; then
 MYSQL_PWD="$admin_password" mysql --connect-timeout=10 -h "$DB_HOST" -u"$admin" -e "GRANT SELECT, INSERT, UPDATE, DELETE, SHOW VIEW, TRIGGER, EVENT, EXECUTE ON \`$target\`.* TO '$grantee'@'%';"
fi
tables=$(MYSQL_PWD="$admin_password" mysql -N -h "$DB_HOST" -u"$admin" "$target" -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$target'")
flyway=$(MYSQL_PWD="$admin_password" mysql -N -h "$DB_HOST" -u"$admin" "$target" -e "SELECT version FROM flyway_schema_history WHERE success=1 ORDER BY installed_rank DESC LIMIT 1")
machine_tables=$(MYSQL_PWD="$admin_password" mysql -N -h "$DB_HOST" -u"$admin" "$target" -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$target' AND table_name IN ('gaming_sessions','station_commands','station_enrollment_tokens','station_machine_identities','station_auth_challenges','station_heartbeats','station_session_login_attempts','station_client_enforcement','station_reconciliation_audit')")
[ "$tables" -gt 20 ] && [ -n "$flyway" ] && [ "$machine_tables" -eq 9 ] || { echo "Restore data smoke failed" >&2; exit 1; }
violations=$(MYSQL_PWD="$admin_password" mysql -N -h "$DB_HOST" -u"$admin" "$target" < "$(dirname "$0")/ledger-check.sql")
[ "$violations" = 0 ] || { echo 'Restored financial ledger invariants failed' >&2; exit 1; }
echo "Restore drill passed: database=$target tables=$tables flyway=$flyway"
