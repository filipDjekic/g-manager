#!/usr/bin/env bash
set -euo pipefail
release=${1:?public release JSON required}
python3 "$(dirname "$0")/release_config.py" validate "$release"
secrets=$(python3 "$(dirname "$0")/release_config.py" get "$release" DEPLOY_SECRETS_DIR)
[[ "$secrets" = /* && -d "$secrets" && ! -L "$secrets" ]] || { echo 'Protected host secret directory required' >&2;exit 2; }
[[ $(stat -c '%a' "$secrets") = 700 ]] || { echo 'Secret directory requires mode 0700' >&2;exit 2; }
required=(jwt_secret db_username db_password db_root_password backup_db_password migration_db_password backup_encryption_key station_policy_signing_private_key backup_coordination_key restic_password restore_verifier_password)
get(){ python3 "$(dirname "$0")/release_config.py" get "$release" "$1"; }
releases=$(get CLIENT_RELEASES_DIR)
[[ -d "$releases" && ! -L "$releases" ]] || { echo 'Existing Client release directory required; symlinks are forbidden' >&2;exit 2; }
if [ "$(get DOCUMENT_STORAGE_BACKEND)" = s3 ];then required+=(document_s3_access_key document_s3_secret_key);fi
if [ "$(get AI_PROVIDER)" = http ];then required+=(ai_api_key);fi
if [ "$(get ENABLE_MONITORING)" != false ];then required+=(alert_webhook_url alert_webhook_token grafana_admin_password);fi
if [ -n "$(get SMTP_HOST)" ];then required+=(smtp_username smtp_password smtp_from);fi
if [ -n "$(get INITIAL_OWNER_EMAIL)" ];then required+=(initial_owner_password);fi
if [[ "$(get RESTIC_REPOSITORY)" = s3:* ]];then required+=(restic_access_key restic_secret_key);fi
for name in "${required[@]}"; do
  [[ -s "$secrets/$name" && ! -L "$secrets/$name" ]] || { echo "Missing protected secret: $name" >&2;exit 2; }
  [[ $(stat -c '%a' "$secrets/$name") = 440 && $(stat -c '%g' "$secrets/$name") = 10001 ]] || { echo "Secret $name requires mode 0440 and group 10001" >&2;exit 2; }
done
db_user=$(cat "$secrets/db_username")
[[ "$db_user" =~ ^[a-zA-Z0-9_]{1,32}$ && "$db_user" != root && "$db_user" != gmanager_backup && "$db_user" != gmanager_migrator && "$db_user" != gmanager_restore_verifier ]] || { echo 'A dedicated runtime database username is required' >&2;exit 2; }
[ "$(wc -c < "$secrets/jwt_secret")" -ge 32 ] && [ "$(wc -c < "$secrets/backup_encryption_key")" -ge 32 ]
python3 "$(dirname "$0")/release_config.py" compose "$release" config --quiet
echo 'Deployment preflight passed'
