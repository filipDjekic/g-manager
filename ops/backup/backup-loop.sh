#!/usr/bin/env bash
set -euo pipefail
interval=${BACKUP_INTERVAL_SECONDS:-86400}
[[ "$interval" =~ ^[0-9]+$ && "$interval" -ge 60 ]] || exit 2
while true; do
  if ! /backup/backup.sh; then echo 'Scheduled backup failed; check storage and database access' >&2; fi
  sleep "$interval" & wait $!
done
