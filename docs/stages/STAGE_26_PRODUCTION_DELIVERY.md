# Stage 26 - Production delivery and release safety

## Implemented architecture

Backend and frontend are built as immutable, digest-addressed OCI images. Both runtime images use non-root users, health checks, read-only filesystems, dropped Linux capabilities and `no-new-privileges`. Nginx serves immutable hashed assets, prevents caching of the service worker, provides SPA fallback, security headers and a maintenance response while proxying `/api` and `/media`.

Production startup requires HTTPS `CANONICAL_ORIGIN`, `APP_RELEASE`, database credentials and a valid JWT secret. S3 mode additionally requires region, bucket and credentials. There are no production secret defaults. The application process does not run Flyway; a dedicated least-privileged migration job validates and applies migrations.

`ops/deploy/deploy.sh` only accepts image digests. Existing installations must pass an encrypted pre-migration backup and clean-database restore drill. First installation migrates first, then proves backup and restore. The restored database is also opened by a temporary production-profile backend before deployment continues. Application rollback changes only images and never performs a destructive database downgrade.

The protected Release workflow publishes provenance and SBOM attestations, rejects unapproved high/critical image findings, deploys through restore/migration/smoke gates, rehearses rollback in staging, then runs k6 and passive ZAP checks.

## Required protected environment configuration

Variables: `CANONICAL_ORIGIN`, `DOCUMENT_S3_ENDPOINT`, `DOCUMENT_S3_REGION`, `DOCUMENT_S3_BUCKET`.

Secrets: `JWT_SECRET`, `DB_USERNAME`, `DB_PASSWORD`, `DB_ROOT_PASSWORD`, `MIGRATION_DB_PASSWORD`, `DOCUMENT_S3_ACCESS_KEY`, `DOCUMENT_S3_SECRET_KEY`, `BACKUP_ENCRYPTION_KEY`, plus dedicated staging smoke credentials. JWT and backup secrets must be randomly generated and at least 32 characters. The deployment runner persists none of these values in release metadata.

The edge load balancer terminates valid TLS and forwards only to the loopback-bound frontend port. The management port stays on internal networks. Rotate secrets through the protected environment and restart the affected service; never add a secret to `.env.example` or a release file.

## Operations and disaster recovery

Deploy from a protected runner with Docker Compose v2 by exporting the values from `ops/deploy/.env.example`, injecting the required secrets, and running `./ops/deploy/deploy.sh`. Run `./ops/deploy/rollback.sh` to return to the previous successful image pair. Rollback is allowed only when forward-compatible migrations have been used.

Encrypted backups and checksums are written below `ops/backup/output` and retained for `BACKUP_RETENTION_DAYS` (30 by default). A deployment is blocked if checksum verification, decryption, clean schema restore, Flyway-history validation or restored-backend readiness fails. Copy backups to encrypted off-host storage and test recovery on every release. In an incident: stop writes, preserve logs and the current release files, assess database compatibility, restore the last verified backup into a new database, validate with the restore backend, switch traffic, and record recovery time/data loss.

## Release checklist

1. CI backend, MySQL migration, frontend, E2E/accessibility, CodeQL, secret and dependency checks are green.
2. Release image SBOM/provenance and Trivy gates are green with no unapproved high/critical finding.
3. Protected staging deployment, encrypted restore drill, application smoke, TLS/security headers, rollback rehearsal, redeploy, k6 and ZAP pass.
4. Confirm dashboards, readiness and SLO alerts; annotate the release SHA and retain the deployment logs.
5. Approve the production environment, deploy the exact tested digests, run smoke, and monitor error rate/readiness. Roll back images immediately if the SLO or smoke gate regresses.
