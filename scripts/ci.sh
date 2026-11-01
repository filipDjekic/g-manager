#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKIP_MYSQL="${SKIP_MYSQL:-false}"
SKIP_E2E="${SKIP_E2E:-false}"

expected_npm=$(node -p "require(process.argv[1]).packageManager" "$ROOT/frontend/g-manager/package.json")
if [[ "npm@$(npm --version)" != "$expected_npm" ]]; then
  echo "Install the repository npm version before verification: npm install --global $expected_npm" >&2
  exit 1
fi

(cd "$ROOT/gm" && ./mvnw clean verify)
if [[ "$SKIP_MYSQL" != "true" ]]; then (cd "$ROOT/gm" && ./mvnw verify -Pmysql-it); fi

cd "$ROOT/frontend/g-manager"
npm ci
npm run ci:validate
npm run ci:validate:self-test
npm run test:coverage
npm run lint
npm run typecheck
npm run build:budget
npm run sbom
if [[ "$SKIP_E2E" != "true" ]]; then
  npx playwright install chromium
  npm run test:e2e
  npm run test:e2e:pwa
fi
npm audit
