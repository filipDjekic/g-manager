# Stage 20 - Unified notifications and real-time delivery

## Scope and outcome

Stage 20 introduces one durable notification pipeline for security, reservation and order events. The existing transactional outbox remains the source of business events; the notification projector turns each event into recipient-scoped notifications and independent delivery attempts. No business transaction waits for SSE or email delivery.

## Architecture

```text
business transaction -> outbox event -> notification-projector-v1
                                      -> notification + preference decision
                                      -> after-commit SSE
                                      -> durable email attempt -> retry -> DEAD
```

The database uniqueness key `(source_event_id, recipient_id, type)` is the stable deduplication boundary. Recipient data is resolved from the current aggregate through module service contracts, rather than trusting event payloads or importing another module's repository.

Supported catalogue:

| Event | Recipient | Type | Mandatory | Deep link |
|---|---|---|---|---|
| Session started | User | `SECURITY_SESSION_STARTED` | Yes | `/profile` |
| Password changed | User | `SECURITY_PASSWORD_CHANGED` | Yes | `/profile` |
| Reservation created | Assigned employee | `RESERVATION_CREATED` | No | Reservation |
| Reservation status changed | Customer and employee | `RESERVATION_STATUS_CHANGED` | No | Reservation |
| Order created | Customer | `ORDER_CREATED` | No | Order |
| Order status changed | Customer | `ORDER_STATUS_CHANGED` | No | Order |

Templates are stored by type and locale. Stage 20 seeds Serbian templates. Placeholder values are escaped and control characters are filtered before rendering, so event data cannot inject markup into an email or in-app message.

## Persistence and lifecycle

Flyway migration `V18__create_notifications.sql` creates:

- `notification_templates` for localized title/body templates;
- `notification_preferences` for per-user, per-type channel choices;
- `notifications` for the durable inbox and replay cursor;
- `notification_delivery_attempts` for email status, retry history and terminal `DEAD` state.

Read notifications older than `NOTIFICATION_RETENTION_DAYS` are removed by the scheduled retention job. Delivery records follow their notification through the foreign-key cascade.

## API and security

- `GET /api/v1/notifications`
- `PATCH /api/v1/notifications/{id}/read`
- `PATCH /api/v1/notifications/read-all`
- `GET /api/v1/notifications/{id}/open`
- `GET /api/v1/notifications/preferences`
- `PUT /api/v1/notifications/preferences`
- `GET /api/v1/notifications/stream`

Every operation derives the recipient from the authenticated principal. An unknown or foreign notification is returned as not found. Opening a deep link performs a fresh resource permission check; possession of a notification never grants access. SSE uses the normal bearer header and never places a token in the URL.

Security notifications are mandatory and their in-app/email preferences cannot be disabled. Optional event types honor the stored channel preferences. The global email feature flag can suspend all outbound email operationally without changing user preferences.

## Real-time and frontend behavior

The application shell displays an accessible notification bell, unread count and grouped notification center. It supports keyboard activation, relative time with an absolute timestamp, priority indication, empty/error states, optimistic read/read-all with rollback, and polite live announcements.

The browser uses a fetch-based SSE client so it can send `Authorization` and `Last-Event-ID` headers. The last cursor is persisted locally, reconnects use exponential backoff, replay is ordered and bounded, and IDs are deduplicated before changing the inbox or unread count. While offline or reconnecting, the center polls the list endpoint every 30 seconds.

## Email delivery and operations

Email is disabled by default and the built-in adapter is a sandbox adapter. It deliberately logs neither recipient address nor message content. A production mail transport can implement `EmailDeliveryAdapter` without changing the projector or retry state machine.

Configuration:

- `NOTIFICATION_EMAIL_ENABLED` (default `false`)
- `NOTIFICATION_DELIVERY_BATCH_SIZE` (default `25`)
- `NOTIFICATION_MAX_DELIVERY_ATTEMPTS` (default `5`)
- `NOTIFICATION_INITIAL_BACKOFF_SECONDS` (default `10`)
- `NOTIFICATION_RETENTION_DAYS` (default `90`)
- `NOTIFICATION_SSE_TIMEOUT_SECONDS` (default `1800`)

Failed delivery uses exponential backoff and becomes `DEAD` after the configured attempt count. Operators should alert on `gm.notification.delivery.dead`, inspect sanitized `last_error` and delivery history, correct the adapter/configuration, and explicitly move selected `DEAD` rows back to `PENDING` with `attempts = 0` and `available_at = CURRENT_TIMESTAMP`. This is an intentional privileged database runbook; no public replay endpoint is exposed.

Metrics include notification creation by type, delivered/failed email outcomes, dead-delivery count, active SSE connections, reconnect activity, and age of the oldest unread notification. Secrets, full email addresses and notification bodies are excluded from logs and metric labels.

## Tests and acceptance evidence

Automated coverage verifies event/recipient/type deduplication, preference enforcement, mandatory security channels, escaped template values, recipient and resource authorization, authenticated SSE, email independence, retry and terminal `DEAD`, optimistic UI rollback, accessibility, SSE cursor persistence and absence of tokens in URLs.

MySQL migration execution remains covered by the existing `flyway-it` profile and `MySqlSchemaIT`; it requires a working Docker daemon. H2 is used for the standard application-context and integration suite.

## Invariants for the next stage

- Keep the outbox event ID as the deduplication source; do not derive identity from mutable payload text.
- Add new notification types through the catalogue, template seed, recipient resolver and authorization-aware deep-link policy together.
- Do not send a channel before the notification transaction commits.
- Do not expose SSE tokens in query parameters.
- Mandatory security notifications must remain non-disableable.
- Replace the sandbox adapter only behind `EmailDeliveryAdapter`, retaining delivery history and retry semantics.
