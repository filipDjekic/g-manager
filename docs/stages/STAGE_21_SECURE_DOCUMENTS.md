# Stage 21 - Secure documents and object-storage readiness

## Outcome

Stage 21 replaces immediate public media writes with a private document aggregate. Each document has resource ownership, immutable versions, SHA-256 checksums, scan state and an internal object key. Object bytes are never stored in the database and are unavailable until the scan state is `CLEAN`.

Existing avatar and catalog upload endpoints remain compatible, but return an authenticated `/api/v1/documents/{id}/content?preview=true` URL for new files. `/media/**` remains temporarily available only for legacy rows discovered by the migration inventory; the migration job checksum-verifies and switches those rows to secure URLs.

## Data and lifecycle

`V19__create_secure_documents.sql` adds `documents`, `document_versions` and `legacy_media_inventory`. The inventory is the durable migration ledger: source and migrated SHA-256 must match before status becomes `VERIFIED`. Failed or missing source files remain visible as `FAILED`; they are never silently dropped.

Uploads are streamed to an internal random object key under `quarantine/`. Metadata is committed with `PENDING`, then the document module's scheduled scanner claims pending versions. The database scan state is the durable queue and survives process restarts. A clean scan unlocks content; rejected/error objects remain private. Soft-deleted documents are retained for `DOCUMENT_DELETE_RETENTION_DAYS`, then their objects and metadata are removed. The reconciliation worker re-hashes every stored object and moves mismatches/missing objects to `ERROR`.

Optimistic document version plus a pessimistic upload lock prevents two concurrent version uploads from receiving the same version number. Clients must pass the aggregate version and refresh on HTTP 409.

## Formats and limits

- PNG: `image/png`, matching PNG signature.
- JPEG: `image/jpeg`, matching JPEG signature.
- PDF: `application/pdf`, matching `%PDF-` signature.
- UTF-8 text: `text/plain`.
- Default maximum: 5 MiB per file.
- Default quota: 20 active documents per resource.

Original names are metadata only. Directory components and control characters are removed. Object keys are generated internally; supplied paths are never used. Preview is available for supported image, PDF and text types, otherwise the frontend uses download fallback.

## API

- `POST /api/v1/documents` multipart: `resourceType`, `resourceId`, `file`.
- `GET /api/v1/documents?resourceType=...&resourceId=...`.
- `POST /api/v1/documents/{id}/versions` multipart: `version`, `file`.
- `GET /api/v1/documents/{id}/content?versionId=...&preview=false`.
- `DELETE /api/v1/documents/{id}?version=...`.
- `POST /api/v1/documents/{id}/restore`.

Every metadata and content request performs backend resource authorization. Foreign resources return 404 to avoid an existence side channel. Downloads use bearer authentication, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff` and RFC-compatible content disposition. Each successful download and lifecycle change is audited without storing object content.

## Storage backends

Local development is the default:

```text
DOCUMENT_STORAGE_BACKEND=local
UPLOAD_ROOT=data/uploads
```

S3-compatible production configuration:

```text
DOCUMENT_STORAGE_BACKEND=s3
DOCUMENT_S3_ENDPOINT=https://object-storage.example
DOCUMENT_S3_REGION=us-east-1
DOCUMENT_S3_BUCKET=gmanager-private-documents
DOCUMENT_S3_ACCESS_KEY=<secret-manager-value>
DOCUMENT_S3_SECRET_KEY=<secret-manager-value>
```

The bucket must be private and block public ACLs. Credentials must come from the deployment secret manager. The adapter uses path-style addressing for MinIO and other S3-compatible stores. To migrate storage backends, stop new writes, run reconciliation, copy keys preserving bytes, compare SHA-256 with `document_versions.checksum_sha256`, switch `DOCUMENT_STORAGE_BACKEND`, run reconciliation again, then resume writes.

## Operations and incident runbook

Metrics cover upload bytes/duration/results, scan results and pending age, reconciliation match/mismatch and storage failures. Filenames, object contents and user identifiers are not metric labels.

For scanner outage, keep objects quarantined, restore the scanner worker, move reviewed `ERROR` versions back to `PENDING`, and alert on pending age. For suspected malware, disable downloads if necessary, preserve metadata/audit evidence, quarantine the object-store prefix, replace the scanner rule set and rescan. For checksum mismatch, never overwrite the expected checksum: isolate the object, restore from a verified backup and rerun reconciliation.

Restore is allowed only during the retention window. After physical cleanup, recovery requires an object-store/database backup pair with matching checksums.

## Frontend

The Documents page provides keyboard-accessible file selection, progress, cancellation, retry, responsive cards, scan state, version history, permission-aware preview/download and clear empty/error states. Download controls remain disabled until a version is clean.

## Validation coverage

Automated tests cover local and S3 storage contracts, traversal rejection, genuine/fake MIME, non-active malware test signature, quarantine lock, foreign metadata/content denial, private download headers, checksum integrity, existing avatar/catalog compatibility and frontend accessibility/retry behavior. MySQL/MinIO runtime integration is executed by the Docker-backed environment when available; standard tests validate V19 on H2 MySQL mode.

## Invariants for later stages

- Report and workflow attachments must use `DocumentStorage` and document links, never database blobs or public paths.
- Do not make a `PENDING`, `REJECTED` or `ERROR` version downloadable.
- Never authorize based only on possession of a document ID or legacy URL.
- Preserve version/checksum history; corrections create a new version.
- Public sharing, OCR and document editing remain outside this stage.
