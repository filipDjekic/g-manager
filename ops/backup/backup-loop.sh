#!/usr/bin/env bash
set -euo pipefail
interval=${BACKUP_INTERVAL_SECONDS:-86400}
[[ "$interval" =~ ^[0-9]+$ && "$interval" -ge 60 ]] || exit 2
child=
terminate(){
  if [ -n "$child" ];then kill -TERM -- "-$child" 2>/dev/null || true;wait "$child" || true;fi
  exit 0
}
trap terminate TERM INT
while true; do
  setsid /backup/scheduled-backup.sh & child=$!
  delay=$interval
  if ! wait "$child"; then
    echo 'Scheduled backup failed; retrying within five minutes; check monitoring status and protected diagnostics' >&2
    if ((delay>300));then delay=300;fi
  fi
  child=
  setsid sleep "$delay" & child=$!;wait "$child";child=
done
