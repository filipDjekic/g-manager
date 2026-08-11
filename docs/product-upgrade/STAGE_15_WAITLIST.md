# Stage 15 - Waitlist

Customers can join `/api/v1/waitlist` for a concrete service, employee and occupied start time. Joining an available slot is rejected because it should be reserved directly. Active entry keys prevent duplicate opt-ins while customer-scoped reads prevent disclosure of another customer's waitlist state.

The ordered matcher processes `WAITING` entries by creation time. It creates at most one active 15-minute offer for an employee/start combination, emits one idempotent in-app notification, expires stale offers and returns their entries to the queue. Migration `V25__create_waitlist.sql` stores entries and offers with active uniqueness keys, expiry/matching indexes, foreign keys and optimistic versions.

Accepting an offer locks it and is idempotent after success. The offer itself never reserves a slot: acceptance delegates to the existing `ReservationService.create`, so working-hours, employee time-off and reservation-conflict rules are validated again inside the final transaction. A competing reservation therefore produces `409 Conflict` and no waitlist reservation is created.

The customer booking page exposes opt-in only after an exact employee and unavailable date are selected, lists the customer's entries and allows an active offer to be accepted.
