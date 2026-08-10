#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKIP_MYSQL="${SKIP_MYSQL:-false}"
SKIP_E2E="${SKIP_E2E:-false}"

(cd "$ROOT/gm" && ./mvnw clean verify)
if [[ "$SKIP_MYSQL" != "true" ]]; then (cd "$ROOT/gm" && ./mvnw verify -Pmysql-it); fi

cd "$ROOT/frontend/g-manager"
npm ci
npm run ci:validate
npm run ci:validate:self-test
npm run test:coverage
npm run lint
npm run typecheck
npm run build
npm run sbom
if [[ "$SKIP_E2E" != "true" ]]; then
  npx playwright install chromium
  npm run test:e2e
fi
npm audit
