#!/bin/bash
set -euo pipefail
root_password=$(cat /run/secrets/db_root_password)
migration_password=$(cat /run/secrets/migration_db_password)
restore_password=$(cat /run/secrets/restore_verifier_password)
backup_password=$(cat /run/secrets/backup_db_password)
app_user=$(cat /run/secrets/db_username)
[[ "$app_user" =~ ^[a-zA-Z0-9_]{1,32}$ && "$app_user" != root && "$app_user" != gmanager_backup && "$app_user" != gmanager_migrator && "$app_user" != gmanager_restore_verifier ]] || exit 2
escaped=${migration_password//\'/\'\'}
restore_escaped=${restore_password//\'/\'\'}
backup_escaped=${backup_password//\'/\'\'}
MYSQL_PWD="$root_password" mysql --protocol=socket -uroot <<SQL
SET SESSION sql_mode='NO_BACKSLASH_ESCAPES';
REVOKE ALL PRIVILEGES, GRANT OPTION FROM '$app_user'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE, SHOW VIEW ON gmanager.* TO '$app_user'@'%';
CREATE USER IF NOT EXISTS 'gmanager_backup'@'%' IDENTIFIED BY '${backup_escaped}';
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'gmanager_backup'@'%';
GRANT SELECT, EXECUTE, SHOW VIEW, TRIGGER, EVENT ON gmanager.* TO 'gmanager_backup'@'%';
CREATE USER IF NOT EXISTS 'gmanager_migrator'@'%' IDENTIFIED BY '${escaped}';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES ON gmanager.* TO 'gmanager_migrator'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES ON gmanager_restore_drill.* TO 'gmanager_migrator'@'%';
CREATE DATABASE IF NOT EXISTS gmanager_restore_drill_scheduled;
CREATE USER IF NOT EXISTS 'gmanager_restore_verifier'@'%' IDENTIFIED BY '${restore_escaped}';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES, SHOW VIEW, TRIGGER, EVENT, EXECUTE ON gmanager_restore_drill_scheduled.* TO 'gmanager_restore_verifier'@'%';
FLUSH PRIVILEGES;
SQL
