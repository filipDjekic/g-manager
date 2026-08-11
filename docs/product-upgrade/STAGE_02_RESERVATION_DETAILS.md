# Product upgrade Stage 2 — reservation details and reusable action dialogs

## Existing mechanisms reused

Stage 2 reuses the existing reservation transition service and authorization policy, role permissions, optimistic version checks, audit events, TanStack Query, central Axios client, URL query state, Drawer/Modal focus management and common Button/Error/Skeleton components. No new lifecycle state, authorization model or parallel dialog system was introduced.

## Implemented

- `GET /api/v1/reservations/{id}` returns a permission-scoped detail projection. CUSTOMER can read only an owned reservation, EMPLOYEE only an assigned reservation, and OWNER/ADMIN any reservation; foreign records are hidden as `404`.
- Detail data contains human-readable customer, employee and service names, duration, date/time, status, note, timestamps, server-authoritative currently allowed actions and real audit history where the caller has `AUDIT_READ`.
- Customer email is present only when the caller has `USER_LIST`; it is not returned to CUSTOMER or EMPLOYEE.
- Existing transition validation remains authoritative. The detail action list additionally removes completion before the appointment ends and customer cancellation after the configured cutoff.
- A centralized `ReservationDetailsDrawer` is opened through a deep-linkable `reservationId` query parameter from both reservation lists without losing list/filter context.
- Native reservation `prompt` and `confirm` calls were replaced with a reusable accessible `ActionDialog`, including an optional reason field for reject/cancel actions.
- Reservation list cards no longer expose customer UUID values as primary content.
- Existing Drawer/Modal focus trap and focus-return behavior is retained; the action dialog close callback is stable while a reason is typed.

## Database, API and compatibility

No migration was required. Existing reservation, user, catalog and audit tables contain every field used by the projection. The only new API is `GET /api/v1/reservations/{id}`; existing list, create and status-transition contracts remain compatible.

## Verification

- `ReservationIntegrationTest`: 5/5 passed, including ownership isolation, readable projections, contact visibility, allowed actions and audit history.
- Targeted frontend component/UI tests: 4/4 passed.
- Frontend ESLint and TypeScript checks passed.
- Customer reservation/details/action Playwright flow: 2/2 passed on desktop and mobile Chromium.

## Scope boundary and next prerequisite

The Drawer is reusable by future Calendar, Employee Today and Dashboard surfaces, but those surfaces were not implemented in Stage 2. Availability calculation and slot selection remain Stage 3/4 work. The existing reservation lifecycle was not extended; that remains Stage 11.
