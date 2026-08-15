# ADR-005: Machine trust, durable polling and Windows enforcement boundary

## Status

Accepted as the protocol and trust contract for later stages. No machine endpoint or Windows executable is introduced in Stage 1.

## Principal boundaries

Three principals are distinct:

1. Browser principal — existing user JWT/refresh-token flow and role permissions.
2. Customer-session principal — future short-lived proof limited to one customer and one active gaming session; it is not an employee/admin token.
3. Machine principal — one enrolled station identity with narrow machine scopes; it never uses employee credentials.

Enrollment uses a short-lived, one-time random token whose database representation is a hash. The station generates an asymmetric key pair locally. The backend stores only the public key, key version and revocation state. The private key is held by a Windows cryptographic provider (Certificate Store/DPAPI, TPM-backed where available), never committed or returned by the backend.

Authentication uses a server nonce/challenge signed by the active station key and returns a short-lived machine access token with station ID, key version, audience and scopes. Nonces expire and cannot be replayed. Key rotation and revocation are audited.

## Real-time decision

- Employee browser updates reuse the existing transactional outbox and SSE infrastructure.
- Machine communication uses authenticated HTTPS snapshot plus durable long-poll/poll from a monotonically increasing command cursor and idempotent acknowledgments.
- WebSocket is not introduced in the first implementation because persisted commands, reconnect and acknowledgment are required even when a transient connection is absent. A later transport may deliver the same durable command contract without changing its semantics.

Every machine command has station scope, sequence, payload schema version and correlation ID. Duplicate, delayed and out-of-order delivery must converge through the cursor/state reducer.

## Windows trust boundary

The planned Client has two processes:

- a privileged .NET Windows Service that owns machine identity, backend synchronization and enforcement actions;
- a WPF fullscreen Shell under a restricted customer account, connected through an ACL-protected named pipe.

The Shell has no machine private key. Neither process is the sole isolation boundary: Assigned Access/restricted-user configuration and WDAC/AppLocker provide OS application control. Browser UI hiding and process blacklists are not security controls.

## Threat decisions

| Threat | Required control |
|---|---|
| Stolen enrollment token | Short TTL, station scope, hash-at-rest, one-time consume |
| Cloned machine identity | Non-exportable/TPM key where possible, key version, revoke/rotate |
| Replay | Expiring one-time challenge and signed request binding |
| Offline extension | Signed bounded lease; client cannot change `endsAt` |
| Local clock rollback | Server offset plus monotonic elapsed time and bounded resync rules |
| Duplicate/out-of-order command | Station sequence cursor and idempotent acknowledgment |
| Local administrator | Explicitly outside app trust boundary; operational controls required |

Production TLS, signing keys and code-signing certificates are external secrets and are never stored in the repository.
