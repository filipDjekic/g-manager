# ADR-003: Location and physical-resource scheduling

## Status

Accepted.

## Decision

`resource` is the canonical module for `Location`, `Area`, `PhysicalResource` and user-to-location assignments. Cross-module links remain UUID references, following the modular-monolith boundary rules. A physical resource references an existing `SERVICE` catalog item; price and duration therefore remain owned by `catalog` and are not duplicated.

Reservations may reference one location and one physical resource. Historical employee-only reservations remain valid. When a resource is selected, `ReservationService` locks that resource row, validates that it is active/bookable and mapped to the requested service, then checks the half-open interval `[start, end)` against blocking reservations. This makes the database transaction authoritative; the visual map is only a projection of the same rule.

OWNER and ADMIN receive `RESOURCE_MANAGE`; all existing roles receive `RESOURCE_READ`. No new role or tenant model is introduced. Employees remain users with the existing `EMPLOYEE` role and may be assigned to locations through `user_location_assignments`.

## API

- `GET/POST /api/v1/resources/locations`
- `PUT /api/v1/resources/locations/{id}`
- `GET/POST /api/v1/resources/locations/{locationId}/areas`
- `PUT /api/v1/resources/areas/{id}`
- `GET/POST /api/v1/resources/areas/{areaId}`
- `PUT /api/v1/resources/{id}`
- `GET /api/v1/resources/areas/{areaId}/availability?serviceId=&start=&end=`

`POST /api/v1/reservations` additionally accepts optional `resourceId`. The backend derives `locationId` from the selected resource and never trusts a client-provided location.

## Operational notes

Flyway migration `V28` is forward-only. The development seed extends the existing playground data with two locations, three areas, PC/PS5/simulator/VIP resources and employee-location assignments. Run it only after migrations have reached V28. The seed remains guarded by `@gmanager_allow_dev_seed` and is still started with `scripts/seed-development.ps1` after the user has started MySQL.
