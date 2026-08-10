# Stage 22 - Asynchronous reports and exports

## Outcome

Stage 22 introduces a permission-safe report engine for orders, reservations, revenue and employee workload. Requests capture an immutable filter, locale, business timezone, snapshot timestamp and permission snapshot, then execute through the Stage 12 durable job framework. Generated files are private Stage 21 documents and every download repeats current owner/permission checks.

## Formats and metric definitions

- `orders`: orders created in `[from,to)`, status and gross total.
- `reservations`: reservations starting in `[from,to)`, employee, interval and status.
- `revenue`: order count and gross total grouped by status.
- `workload`: reservation count and booked minutes grouped by employee.
- CSV is UTF-8 with BOM and RFC-style quoted cells; XLSX uses POI streaming rows; PDF uses paginated A4 output.
- CSV/XLSX cells beginning with `=`, `+`, `-`, `@`, tab or carriage return are prefixed with an apostrophe to prevent spreadsheet formula execution.
- A request range must be positive and no longer than 366 days. Output retention is 30 days.

## Lifecycle and security

Successful completion creates an idempotent in-app notification linked to `/reports`.

Statuses are `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED` and `EXPIRED`. Only `REPORT_READ` can create/read/download reports; schedules require `REPORT_MANAGE`. Ownership is deliberately returned as 404 to other users. Query scope is derived from the captured domain permissions and report download delegates to the private document authorization layer. A scheduled execution rereads the current user role and disables itself if report-management permission was removed.

The JDBC renderer uses fetch size 200 and the XLSX writer retains 100 rows in memory. Report contents and filenames are not logged. Metrics expose request format/definition, duration, result, rows and output bytes.

## API

- `GET /api/v1/reports/definitions`
- `POST /api/v1/reports`, `GET /api/v1/reports`, `GET /api/v1/reports/{id}`
- `POST /api/v1/reports/{id}/cancel`, `GET /api/v1/reports/{id}/download`
- schedules: `GET/POST /api/v1/reports/schedules`, `PUT/DELETE /api/v1/reports/schedules/{id}`
- templates: `GET/POST /api/v1/reports/templates`, `DELETE /api/v1/reports/templates/{id}`

## Scheduling and operations

Schedules store an IANA timezone, local wall-clock time and optional ISO weekday. The next instant is calculated in that timezone; Java zone rules move nonexistent spring-forward times to the first valid local time and retain a deterministic instant during overlaps.

Operational response:

1. Inspect `gmanager.report.outcomes`, job attempts and report error status; contents are intentionally absent from logs.
2. Retry by submitting a new report request after correcting the data/storage dependency.
3. Cancel queued/running work through the API. Cooperative checks run before query/render storage transitions.
4. Expired reports cannot be downloaded; Stage 21 retention owns physical object cleanup.
5. If queue age grows, inspect Stage 12 worker capacity before increasing `app.jobs.worker-count`.

## Validation

Golden tests open CSV, XLSX and PDF output; security tests cover missing permission and cross-owner metadata access; formula-injection and Europe/Belgrade DST behavior are explicit tests. The frontend covers accessible empty state and report submission. Flyway V20 adds request, schedule and template metadata with owner/status/next-run indexes.
