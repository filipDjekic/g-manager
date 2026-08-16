#!/usr/bin/env bash
set -euo pipefail
: "${DB_HOST:?}" "${DB_ROOT_PASSWORD_FILE:?}" "${BACKUP_KEY_FILE:?}" "${BACKUP_FILE:?}"
target=${RESTORE_DB_NAME:-gmanager_restore_drill}; root_password=$(cat "$DB_ROOT_PASSWORD_FILE"); key=$(cat "$BACKUP_KEY_FILE")
sha256sum -c "$BACKUP_FILE.sha256"
MYSQL_PWD="$root_password" mysql -h "$DB_HOST" -uroot -e "DROP DATABASE IF EXISTS \`$target\`; CREATE DATABASE \`$target\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
openssl enc -d -aes-256-cbc -pbkdf2 -in "$BACKUP_FILE" -pass "pass:$key" | gunzip | MYSQL_PWD="$root_password" mysql -h "$DB_HOST" -uroot "$target"
MYSQL_PWD="$root_password" mysql -h "$DB_HOST" -uroot -e "GRANT SELECT, INSERT, UPDATE, DELETE, SHOW VIEW, TRIGGER, EVENT, EXECUTE ON \`$target\`.* TO 'gmanager'@'%'; FLUSH PRIVILEGES;"
tables=$(MYSQL_PWD="$root_password" mysql -N -h "$DB_HOST" -uroot "$target" -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$target'")
flyway=$(MYSQL_PWD="$root_password" mysql -N -h "$DB_HOST" -uroot "$target" -e "SELECT version FROM flyway_schema_history WHERE success=1 ORDER BY installed_rank DESC LIMIT 1")
machine_tables=$(MYSQL_PWD="$root_password" mysql -N -h "$DB_HOST" -uroot "$target" -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$target' AND table_name IN ('gaming_sessions','station_commands','station_enrollment_tokens','station_machine_identities','station_auth_challenges','station_heartbeats','station_session_login_attempts','station_client_enforcement','station_reconciliation_audit')")
[ "$tables" -gt 20 ] && [ -n "$flyway" ] && [ "$machine_tables" -eq 9 ] || { echo "Restore data smoke failed" >&2; exit 1; }
echo "Restore drill passed: database=$target tables=$tables flyway=$flyway"
