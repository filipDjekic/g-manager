# Stage 14 - Employee time off and availability

Employee time off is managed through `/api/v1/time-off` by users with the existing `WORKING_HOURS_MANAGE` permission. Requests start as `PENDING`; managers can approve, reject, or cancel them. Pending and approved requests cannot overlap for the same employee, lifecycle updates use optimistic version checks, and every create/decision operation writes a management audit event.

Migration `V24__create_employee_time_off.sql` adds the scoped employee/range/status data, foreign key, overlap-oriented indexes, timestamps, and optimistic `version`. Instants are stored in UTC; availability continues to construct local working windows in `Europe/Belgrade`, so DST transitions are resolved by the established working-hours mechanism.

Only `APPROVED` intervals exclude generated availability slots and prevent reservation creation. `PENDING`, `REJECTED`, and `CANCELLED` records remain visible in Settings but do not block slots. The Settings page reuses the employee list and existing management layout to create and process requests.
