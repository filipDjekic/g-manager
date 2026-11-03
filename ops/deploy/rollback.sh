#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")"
state=$(python3 release_config.py state)
exec 9>"$state/deployment.lock"
flock -n 9 || { echo 'Another deployment/rollback is running' >&2; exit 1; }
previous="$state/previous.json";[ -f "$previous" ] || { echo 'No previous successful release' >&2;exit 1; }
python3 release_config.py validate "$previous"
bash preflight.sh "$previous"
python3 release_config.py compose "$previous" pull backend frontend
python3 release_config.py compose "$previous" stop backup-scheduler
python3 release_config.py compose "$previous" up -d --wait backend frontend
bash smoke.sh "$(python3 release_config.py get "$previous" CANONICAL_ORIGIN)"
cp "$state/current.json" "$state/rolled-back.json"
cp "$previous" "$state/current.tmp";mv "$state/current.tmp" "$state/current.json"
cp "$state/rolled-back.json" "$previous"
python3 release_config.py compose "$state/current.json" up -d backup-scheduler
echo 'Application rollback completed; database and object volumes were not rolled back'
