# Stage 16 - Recurring reservations

Customers explicitly preview and then create a bounded weekly or monthly recurrence through `/api/v1/reservations/recurrence/preview` and `/api/v1/reservations/recurrence`. Rules allow 2-20 occurrences, an interval of 1-4 and a maximum 366-day horizon. Dates are generated from the original local time in `Europe/Belgrade`, preserving the intended wall-clock time across DST and month boundaries.

The caller chooses `ALL_OR_NOTHING` or `SKIP_CONFLICTS`. Preview reports availability per occurrence. Creation repeats every working-hours, active-employee, approved-time-off and reservation-conflict check through the existing reservation creation path. `ALL_OR_NOTHING` rolls back the full series on conflict; `SKIP_CONFLICTS` returns both created and skipped occurrences. The mutation requires an `Idempotency-Key` and uses the existing scoped request replay mechanism.

Migration `V26__create_reservation_recurrence_series.sql` stores only recurrence proposal metadata and adds a nullable series link to each reservation. Individual reservations remain the source of truth and retain independent lifecycle/version state; cancelling one occurrence does not cascade to siblings.

The customer booking flow exposes recurrence only for an explicitly selected employee and slot. Submission remains disabled until the bounded preview has been reviewed.
