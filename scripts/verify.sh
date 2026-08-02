#!/usr/bin/env sh
set -eu

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

java_version=$(java -version 2>&1)
case "$java_version" in
  *'version "21.'*|*'version "21-'*) ;;
  *) echo "Java 21 is required." >&2; exit 1 ;;
esac

node_major=$(node --version | sed 's/^v//' | cut -d. -f1)
if [ "$node_major" -lt 22 ]; then
  echo "Node.js 22 or newer is required." >&2
  exit 1
fi

cd "$repository_root/gm"
./mvnw clean verify

cd "$repository_root/frontend/g-manager"
npm ci
npm run lint
npm run typecheck
npm test
npm run build

echo "G-Manager verification completed successfully."
