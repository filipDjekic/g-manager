# Product upgrade Stage 3 — availability backend foundation

## Existing mechanisms reused

Stage 3 reuses the catalog active-service validation, active employee model, `Europe/Belgrade` business zone, weekly and date-specific working-hours rules, overnight support, reservation status semantics, strict overlap boundaries and the existing employee pessimistic lock during reservation creation. Availability does not replace create-time validation.

## Implemented

- `GET /api/v1/availability` accepts typed `serviceId`, optional `employeeId`, and inclusive `from`/`to` local dates.
- Queries are limited to 1–31 calendar days and require the existing `CATALOG_READ` capability.
- The response identifies the business timezone, service and duration, 15-minute slot increment, requested range and human-readable employee groups with UTC slot instants.
- Only active SERVICE catalog items and active EMPLOYEE users are accepted. Omitting `employeeId` returns all active employees in stable name/id order.
- Slot windows come from the same weekly/exception/overnight implementation used by create validation. Full-day closures return no slots.
- Blocking reservations are loaded once for the requested employee/range and use the same non-blocking statuses and strict interval overlap rule as create/confirm.
- Reservation create/confirm now delegate their final conflict check to the shared `ReservationAvailabilityPolicy`; the existing employee row lock remains unchanged.
- Past starts are not emitted. Service duration must fit completely inside the effective working window.

## Database and API

No migration was added. The existing `idx_reservation_employee_time (employee_id, status, start_time, end_time)` index matches the bounded blocking-interval query, so an additional index or availability shadow table would be redundant without contrary MySQL measurements.

Example:

`GET /api/v1/availability?serviceId={uuid}&employeeId={uuid}&from=2026-09-01&to=2026-09-07`

`employeeId` may be omitted. Dates are interpreted in the configured business timezone; returned `startTime` and `endTime` values are ISO-8601 instants.

## Verification

- Final relevant backend pass: 12/12 passed (`AvailabilityIntegrationTest`, `ReservationIntegrationTest`, `ModuleArchitectureTest`).
- Covered working-hours and holiday exclusion, strict overlap boundaries, DST transition, overnight close on the following date, inactive service/employee rejection, and stale-slot create-time rejection.

## Scope boundary

No booking/calendar frontend was added. Consuming this endpoint in the customer booking flow is Stage 4; calendar rendering is Stage 5. Employee time-off is not modeled until Stage 14.
