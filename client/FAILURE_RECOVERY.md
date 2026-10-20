# Failure and recovery runbook

| Failure | Client behavior | Backend/operator behavior |
|---|---|---|
| Short network loss | Continue only until the signed lease `graceEndsAt`, never beyond `sessionEndsAt`. Countdown uses monotonic time and persisted trusted UTC floor. | Station becomes stale/OFFLINE after heartbeat grace. |
| Network loss beyond grace | Stop the process tree and show the locked screen. No local extension exists. | Keep station unavailable until reconnect delivers `LOCK_ACK` or an operator verifies the physical lock. |
| Delayed or duplicate command | Apply only the next sequence; ignore an already-applied sequence and retry a pending acknowledgement. | Ack endpoints and projection updates are idempotent and never move the cursor backwards. |
| Out-of-order command | Stop at the sequence gap and remain on the last safe state. | Reconnect/poll supplies the missing ordered commands. Do not manually advance the cursor. |
| Backend restart | Use the last verified lease only until its finite deadline, then fail closed. | After recovery issue a fresh signed lease and reconcile the persisted command cursor. |
| Service/Windows restart | Reload the signed envelope, applied cursor, pending lock ack and trusted UTC floor; enforce expiry before showing login/active state. | Enrolled identity remains DPAPI-protected and the next heartbeat reconciles projection state. |
| Clock rollback | Monotonic elapsed time and the persisted UTC floor prevent the countdown or lease from gaining time. | No action unless repeated rollback indicates host compromise. |
| Policy/lease signature failure | Lock immediately; do not apply the payload. | Verify signing-key deployment and key ID. Never bypass verification. |

Operator recovery is available on the Gaming operations board. “Ponovo pošalji force-lock” creates a new ordered command but does not make the station available. “Potvrdi fizički lock” is a privileged break-glass action: use it only after direct verification that the customer desktop and all customer processes are locked. Both transitions are written to `station_reconciliation_audit`.

Production configuration must provide `STATION_POLICY_SIGNING_PRIVATE_KEY`, `STATION_POLICY_SIGNING_KEY_ID`, `STATION_LEASE_DURATION_SECONDS` and `STATION_OFFLINE_GRACE_SECONDS`. The private key stays only in the backend secret store; Client installations contain only the pinned SPKI public key.

Local Windows maintenance is independent of backend access and requires an elevated administrator token. It quiesces/logs off only the selected player, suspends only owned rules, and expires after 15 minutes by default. A dedicated expiry task and startup/minute recovery task provide a fallback when the Service is unavailable. A session interrupted by maintenance/recovery remains locally blocked until staff reconcile the server session through existing authorized operations; the local tool does not invent a billing adjustment.

Binary replacement has a write-through deployment journal and candidate/previous directories. Identity, configuration and signed recovery state are outside the replaced directory. Incomplete transactions restore the previous binaries/configuration on startup. Incomplete uninstall retries the owned-policy restoration before completing removal. Recovery scripts remain in `%ProgramData%\GManager\Client\recovery`; use the elevated commands in [CLIENT_MANAGEMENT.md](docs/CLIENT_MANAGEMENT.md). Administrator desktops are never targeted by customer-SID rules or customer-process termination.

Development reports virtual state, does not terminate external programs and never claims physical LOCK_ACK. Physical Windows service/AppLocker/NTFS/reboot/network/power-cut behavior still requires validation on representative hardware after release publication.

Expired commands remain in the ordered poll response with an additive `expired` marker. The current Client persists/acknowledges their sequence without replaying side effects, and does not admit login until it reaches the signed lease command cursor. This prevents a long outage from creating a permanent cursor gap when command TTL has elapsed.
