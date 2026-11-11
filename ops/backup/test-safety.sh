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

# Exercise the actual restore script with a valid encrypted fixture and a SQL spy.
# Both pre-cutover and post-cutover backups must select the right financial check.
printf 'SELECT 1;\n' | gzip > "$work/dump.gz"
openssl enc -aes-256-cbc -pbkdf2 -in "$work/dump.gz" -out "$BACKUP_FILE" -pass "file:$BACKUP_KEY_FILE"
sha256sum "$BACKUP_FILE" > "$BACKUP_FILE.sha256"
cat > "$work/bin/mysql" <<'SPY'
#!/usr/bin/env bash
set -euo pipefail
sql=''
while [ "$#" -gt 0 ]; do
 if [ "$1" = -e ]; then sql=$2; break; fi
 shift
done
if [ -z "$sql" ]; then sql=$(cat); fi
printf '%s\n' "$sql" >> "$SPY"
case "$sql" in
 *"SELECT version FROM flyway_schema_history"*) echo "$SPY_VERSION" ;;
 *"table_name IN ('gaming_sessions'"*) echo 9 ;;
 *"table_name IN ('gaming_time_accounts'"*) echo 3 ;;
 *"table_name IN ('gaming_history_wallet_entries'"*) echo "${SPY_HISTORY_TABLES:-8}" ;;
 *"SELECT COUNT(*) FROM information_schema.tables"*) echo 70 ;;
 *"negative_wallets"*) echo "${SPY_FINANCIAL_VIOLATIONS:-0}" ;;
 *"FROM gaming_time_accounts a"*) echo "${SPY_TIME_VIOLATIONS:-0}" ;;
esac
SPY
export RESTORE_SKIP_GRANT=true SPY_VERSION=50
for SPY_VERSION in 47 50 51; do
 : > "$SPY"
 /backup/restore-drill.sh > "$work/stdout" 2> "$work/stderr"
 if [ "$SPY_VERSION" -ge 51 ]; then
  grep -q 'FROM gaming_history_wallet_entries' "$SPY"
  if grep -q 'FROM gaming_wallet_ledger' "$SPY"; then echo 'Retired table queried after V51' >&2; exit 1; fi
 else
  grep -q 'FROM gaming_wallet_ledger' "$SPY"
 fi
 if [ "$SPY_VERSION" -ge 48 ]; then grep -q 'FROM gaming_time_accounts a' "$SPY"; fi
done
export SPY_VERSION=51 SPY_HISTORY_TABLES=7
if /backup/restore-drill.sh > "$work/stdout" 2> "$work/stderr"; then echo 'Missing historical table accepted' >&2; exit 1; fi
grep -q 'history or minute price tables are missing' "$work/stderr"
export SPY_HISTORY_TABLES=8 SPY_FINANCIAL_VIOLATIONS=1
if /backup/restore-drill.sh > "$work/stdout" 2> "$work/stderr"; then echo 'Corrupt financial ledger accepted' >&2; exit 1; fi
grep -q 'financial ledger invariants failed' "$work/stderr"
export SPY_FINANCIAL_VIOLATIONS=0 SPY_TIME_VIOLATIONS=1
if /backup/restore-drill.sh > "$work/stdout" 2> "$work/stderr"; then echo 'Corrupt gaming time ledger accepted' >&2; exit 1; fi
grep -q 'gaming time ledger invariants failed' "$work/stderr"
echo 'Restore safety: V47/V50/V51 checks, missing archive and both corrupt-ledger rejections passed'
