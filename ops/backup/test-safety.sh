#!/usr/bin/env bash
# Isolated shell contract tests with a spy mysql executable. No server is contacted.
set -euo pipefail
work=$(mktemp -d); trap 'rm -rf -- "$work"' EXIT
mkdir "$work/bin" "$work/output"
export DB_HOST=unused DB_NAME=pilot DB_USER=pilot DB_PASSWORD_FILE="$work/password" DB_ROOT_PASSWORD_FILE="$work/password" BACKUP_KEY_FILE="$work/key" BACKUP_OUTPUT_DIR="$work/output" SPY="$work/sql"
printf 'disposable-password' > "$DB_PASSWORD_FILE";printf 'disposable-encryption-key-at-least-32-bytes' > "$BACKUP_KEY_FILE"
cat > "$work/bin/mysql" <<'SPY'
#!/usr/bin/env bash
echo called >> "$SPY"
exit 91
SPY
cat > "$work/bin/mysqldump" <<'SPY'
#!/usr/bin/env bash
printf 'partial dump'
exit 92
SPY
chmod +x "$work/bin/"*; export PATH="$work/bin:$PATH"
export BACKUP_FILE="$work/bad.sql.gz.enc";printf 'bad' > "$BACKUP_FILE";printf '%s\n' "$(sha256sum "$BACKUP_FILE")" > "$BACKUP_FILE.sha256"
reject(){ if "$@" > "$work/stdout" 2> "$work/stderr";then echo 'Expected rejection' >&2;exit 1;fi;[ ! -e "$SPY" ] || { echo 'Unsafe database access' >&2;exit 1; }; }
export RESTORE_ISOLATED=true RESTORE_DB_NAME=gmanager
reject /backup/restore-drill.sh
export RESTORE_DB_NAME='gmanager_restore_drill`;DROP DATABASE gmanager;--'
reject /backup/restore-drill.sh
export RESTORE_DB_NAME=gmanager_restore_drill RESTORE_ISOLATED=false
reject /backup/restore-drill.sh
export RESTORE_ISOLATED=true
reject /backup/restore-drill.sh # correct checksum, invalid ciphertext; no DROP
printf 'wrong checksum' > "$BACKUP_FILE.sha256"
reject /backup/restore-drill.sh
reject /backup/backup.sh # failed dump cannot publish a successful backup
[ -z "$(find "$work/output" -type f -name '*.enc')" ]
[ ! -e "$work/output/last-success" ]
echo 'Backup safety: 6 rejection cases passed; no database accessed'
