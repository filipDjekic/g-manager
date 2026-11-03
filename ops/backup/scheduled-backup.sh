#!/usr/bin/env bash
# A bounded coordinated snapshot, encrypted locally, uploaded and periodically restored from off-site.
set -euo pipefail
umask 077
: "${BACKUP_COORDINATION_URL:?}" "${BACKUP_COORDINATION_KEY_FILE:?}" "${RESTIC_REPOSITORY:?}" "${RESTIC_PASSWORD_FILE:?}"
output=${BACKUP_OUTPUT_DIR:-/backup/output};mkdir -p "$output/sets"
exec 9>"$output/.scheduled.lock"
flock -n 9 || { echo 'A coordinated backup is already running' >&2;exit 75; }
work=$(mktemp -d "$output/.scheduled-XXXXXXXX");lease=;stage=COORDINATION
status(){
  python3 - "$output/status.json" "$1" "$stage" <<'PY'
import json,os,sys,time
path,state,stage=sys.argv[1:];now=int(time.time())
try:
    with open(path) as source: value=json.load(source)
except (OSError,ValueError): value={}
value.update(lastAttemptAt=now,status=state,stage=stage)
if state=='SUCCESS': value.update(lastSuccessAt=now,lastOffsiteSuccessAt=now)
if state=='RESTORED': value.update(lastRestoreSuccessAt=now)
with open(path+'.tmp','w') as target: json.dump(value,target)
os.replace(path+'.tmp',path)
PY
}
cleanup(){
  code=$?
  if [ -n "$lease" ]; then curl --silent --config "$work/curl.conf" --max-time 10 -X DELETE "$BACKUP_COORDINATION_URL/$lease" >/dev/null || true; fi
  if [ "$code" -ne 0 ]; then status FAILED;echo "Scheduled backup failed at $stage" >&2;fi
  rm -rf -- "$work"
}
trap cleanup EXIT
trap 'exit 143' TERM
trap 'exit 130' INT
key=$(cat "$BACKUP_COORDINATION_KEY_FILE");[[ "$key" =~ ^[a-zA-Z0-9_-]{32,256}$ ]] || { echo 'Backup coordination key must be a 32+ character URL-safe random secret' >&2;exit 2; }
printf 'header = "X-GManager-Backup-Key: %s"\nfail\nsilent\nshow-error\n' "$key" > "$work/curl.conf";unset key
curl --config "$work/curl.conf" --max-time 40 -X POST "$BACKUP_COORDINATION_URL" > "$work/lease.json"
lease=$(python3 -c 'import json,sys,uuid;print(uuid.UUID(json.load(open(sys.argv[1]))["id"]))' "$work/lease.json")
mkdir "$work/set"
curl --config "$work/curl.conf" --max-time 10 "$BACKUP_COORDINATION_URL/$lease/metadata" -o "$work/set/release.json"
python3 -c 'import json,sys;v=json.load(open(sys.argv[1]));assert v["formatVersion"]=="1" and v["appRelease"]' "$work/set/release.json"
stage=DOCUMENTS
curl --config "$work/curl.conf" --max-time 500 "$BACKUP_COORDINATION_URL/$lease/documents" -o "$work/documents.zip"
python3 -c 'import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None' "$work/documents.zip"
openssl enc -aes-256-cbc -pbkdf2 -salt -in "$work/documents.zip" -out "$work/set/documents.zip.enc" -pass "file:$BACKUP_KEY_FILE"
stage=DATABASE
database=$(BACKUP_OUTPUT_DIR="$work/set" /backup/backup.sh)
curl --config "$work/curl.conf" --max-time 10 "$BACKUP_COORDINATION_URL/$lease" >/dev/null
curl --config "$work/curl.conf" --max-time 10 -X DELETE "$BACKUP_COORDINATION_URL/$lease" >/dev/null;lease=
(cd "$work/set";sha256sum documents.zip.enc > documents.zip.enc.sha256;sha256sum release.json > release.json.sha256)
printf 'database=%s\ndocuments=documents.zip.enc\nrecovery=release.json\ncoordinated=true\n' "${database##*/}" > "$work/set/manifest"
setdir="$output/sets/set-$(date -u +%Y%m%dT%H%M%SZ)-${work##*-}";mv "$work/set" "$setdir"
export RESTIC_CACHE_DIR="$work/restic-cache"
if [ -s "${AWS_ACCESS_KEY_ID_FILE:-/nonexistent}" ]; then export AWS_ACCESS_KEY_ID=$(cat "$AWS_ACCESS_KEY_ID_FILE");fi
if [ -s "${AWS_SECRET_ACCESS_KEY_FILE:-/nonexistent}" ]; then export AWS_SECRET_ACCESS_KEY=$(cat "$AWS_SECRET_ACCESS_KEY_FILE");fi
host=${BACKUP_HOST:-gmanager};stage=OFFSITE
restic backup --host "$host" --tag gmanager "$setdir" > "$work/upload.log"
countfile="$output/scheduled-count";count=0;[ ! -f "$countfile" ] || read -r count < "$countfile"
[[ "$count" =~ ^[0-9]+$ ]] || count=0
interval=${BACKUP_RESTORE_INTERVAL:-7};[[ "$interval" =~ ^[1-9][0-9]*$ ]] || exit 2
if (( count % interval == 0 )); then
  stage=OFFSITE_RESTORE
  restic restore latest --host "$host" --tag gmanager --path "$setdir" --verify --target "$work/restored" > "$work/restore.log"
  restored="$work/restored$setdir"
  (cd "$restored";sha256sum --check documents.zip.enc.sha256 >/dev/null)
  (cd "$restored";sha256sum --check release.json.sha256 >/dev/null)
  openssl enc -d -aes-256-cbc -pbkdf2 -in "$restored/documents.zip.enc" -out "$work/restored-documents.zip" -pass "file:$BACKUP_KEY_FILE"
  python3 -c 'import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None' "$work/restored-documents.zip"
  RESTORE_ISOLATED=true RESTORE_DB_NAME=gmanager_restore_drill_scheduled BACKUP_FILE="$restored/${database##*/}" /backup/restore-drill.sh
  status RESTORED
fi
stage=RETENTION
retention=${BACKUP_RETENTION_DAYS:-30};[[ "$retention" =~ ^[1-9][0-9]*$ ]] || exit 2
restic forget --host "$host" --tag gmanager --group-by host,tags --keep-within "${retention}d" --prune > "$work/retention.log"
python3 - "$output/sets" "$retention" <<'PY'
import pathlib,shutil,sys,time
root=pathlib.Path(sys.argv[1]).resolve();cutoff=time.time()-int(sys.argv[2])*86400
for path in root.glob('set-*'):
    if path.is_dir() and not path.is_symlink() and path.resolve().parent==root and path.stat().st_mtime<cutoff: shutil.rmtree(path)
PY
printf '%s\n' "$((count+1))" > "$countfile.tmp";mv "$countfile.tmp" "$countfile"
date -u +%s > "$output/scheduled-success.tmp";mv "$output/scheduled-success.tmp" "$output/scheduled-success"
stage=COMPLETE;status SUCCESS
echo 'Coordinated database/document backup, off-site copy and required recovery checks passed'
