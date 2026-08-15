# ADR-004: Gaming session is a runtime aggregate

## Status

Accepted for future implementation. Stage 1 defines the contract; it does not create the runtime module.

## Context

G-Manager reservations describe planned intervals and currently own booking conflicts. Web authentication sessions describe refresh-token/device lifetime. Neither is the authoritative runtime state of a customer using one gaming station.

## Decision

The future `GamingSession` is a separate aggregate that references the existing `User(CUSTOMER)` and `PhysicalResource(GAMING_PC)` identities. It may reference a reservation, but does not replace or mutate reservation semantics.

The minimal lifecycle is:

```text
ACTIVE -- endsAt reached --> EXPIRED
ACTIVE -- authorized manual action --> TERMINATED
```

Start is an atomic command that immediately creates `ACTIVE`; therefore `CREATED`, `PENDING`, `CANCELLED` and `COMPLETED` are not introduced without a later concrete pre-start workflow. Natural expiry uses `EXPIRED`; manual or security termination uses `TERMINATED` with a reason.

The backend clock is authoritative. APIs serving countdown state include `endsAt` and `serverTime`; clients may interpolate between synchronizations but may not extend time locally.

The implementation must enforce, under deterministic row locking and in one transaction:

- one active session per station;
- one active session per customer;
- positive duration within typed configuration limits;
- active customer and active/bookable gaming PC;
- authorization and location scope revalidation at every state-changing command.

Runtime events use the `GAMING_SESSION_*` prefix. Existing refresh-token/device events use `AUTH_SESSION_*`; the unqualified word `SESSION` is not used for new event types.

## Consequences

Reservation, authentication and gaming runtime histories remain independently understandable. The system pays for one additional aggregate and projection joins, but avoids overloading reservation status and prevents ambiguous event/audit terminology.
