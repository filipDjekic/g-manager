# Operations product upgrade — 2026-10-05

The implementation follows the existing React/Query/Zustand UI, Spring modules,
Flyway schema and signed Windows client protocol. No new framework, infrastructure,
environment variable or database migration is required.

## Decisions and priorities

- **P0:** Match the six hash/fingerprint entity mappings to existing Flyway `CHAR(64)` columns; return 403 for method-security denials; filter gaming SSE events by the employee's current assigned locations. Machine authentication and signing remain authoritative.
- **P0:** Reservation availability and recurrence now retain the selected resource, check its overlapping reservations and use its location's working hours. Final creation still uses the existing server-side conflict checks.
- **P0:** Restore .NET 10 client compilation with the missing HTTP factory dependency and current NSec/certificate APIs; keep local pipe operations bounded and prevent overlapping shell actions.
- **P1:** Centralize dark, blue, pink and semantic status tokens; apply them through the shared components and shell. Navigation is grouped by role, has icons and a persisted desktop collapse preference.
- **P1:** Use one shared gaming board query, existing SSE invalidation and visible-page 15-second polling. The board exposes server-derived actions, heartbeat, profile, enforcement, command acknowledgement, countdown, attention filters and history.
- **P1:** Share the start-session dialog between the board and customer detail. Ambiguous start/extend/terminate failures retain the original payload, version and idempotency key for an explicit retry. New board mutations are disabled while that retry is unresolved.
- **P1:** Add a customer home, enrich customer 360 with scoped gaming visits and waitlist, and expose operational waitlist rows with joined names and current offer expiry. Staff waitlist follows the existing employee reservation scope.
- **P1:** Expose management of existing employee-location assignments from the resource map. Individual updates require `RESOURCE_MANAGE`, use version compare-and-set and write an audit event. Revocation applies to subsequent gaming board/history/SSE access checks.
- **P2:** Add customer/resource global-search sources with visibility checks and direct detail URLs. Calendar and board filters retain URL context; calendar rows include resource names. Resource editing and the setup checklist reuse existing endpoints and models.

## Contracts and runtime behavior

- `/gaming-sessions/me` returns only the authenticated customer's latest 20 visits. `/gaming-sessions/customer/{id}` requires staff gaming read permission and filters employee visits by assigned locations.
- `GET /waitlist` is a bounded, paginated operational projection of future waiting/offered entries; employee scope cannot be overridden by a request parameter.
- `GET /resources/locations/{id}/employees` and `PUT /resources/locations/{id}/employees/{employeeId}` manage the table introduced by V28. Existing assignments require their current version; a first assignment uses no version.
- `resourceId` is optional in availability and recurrence requests, preserving callers that do not select a physical resource.
- The board fetches latest session/command candidates instead of full histories and batches assignment/location/area lookups. History remains on demand. Server status and allowed actions drive UI decisions.
- Dashboard metrics reuse existing financial/booking data. There is no invented wallet, gaming billing, revenue calculation or utilization model. The checklist is informational and checks the first active location's areas; each location still needs readiness review.

## Validation and remaining work

- Frontend: TypeScript, ESLint, all 72 Vitest tests, production build and bundle budget passed. All 34 Playwright scenarios passed across the main run and targeted reruns, on desktop Chromium and Pixel 7 with mocked API contracts, including axe checks on operational routes.
- Backend: 31 focused H2 integration/unit tests passed for availability, recurrence, resource access/CAS, waitlist, search privacy, gaming sessions/SSE, machine enrollment/replay/scopes, signing, readiness and production configuration. Three architecture rules passed; the cycle rule failed. The final resource/waitlist rerun passed all seven tests and Checkstyle reported zero violations.
- Client: solution build including WPF passed with zero warnings/errors; all 16 existing domain/protocol tests passed.
- The architecture cycle rule still fails. A demonstrable pre-existing cycle is `auth.AuthController -> customer.CustomerAccountService -> auth.dto.ActivateCustomerRequest` in the original revision. The rule is preserved; unwinding feature-module cycles requires a separate bounded architecture change.
- The checked-in Maven wrapper fails locally before invoking Maven. Validation used cached Maven 3.9.14 with Java 21 and the normal dependency repository.
- Browser checks use synthetic data, and backend integration checks use H2. A production MySQL/Flyway startup, Docker deployment, installed Windows service/kiosk and physical force-lock/reconciliation remain deployment acceptance checks.
