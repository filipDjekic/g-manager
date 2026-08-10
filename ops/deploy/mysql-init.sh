#!/bin/bash
set -euo pipefail
root_password=$(cat /run/secrets/db_root_password)
migration_password=${MIGRATION_DB_PASSWORD:?MIGRATION_DB_PASSWORD is required during first initialization}
escaped=${migration_password//\'/\'\'}
mysql --protocol=socket -uroot -p"${root_password}" <<SQL
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'gmanager'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE, SHOW VIEW, TRIGGER, EVENT ON gmanager.* TO 'gmanager'@'%';
CREATE USER IF NOT EXISTS 'gmanager_migrator'@'%' IDENTIFIED BY '${escaped}';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES ON gmanager.* TO 'gmanager_migrator'@'%';
FLUSH PRIVILEGES;
SQL
