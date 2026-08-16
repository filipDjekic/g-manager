# Gaming Client production rollout

This is the Stage 11 release gate. A release is pilot-approved only after every item below has dated evidence from the target MySQL environment and a representative managed Windows 10/11 Enterprise or Education station. Source implementation alone is not approval.

## Infrastructure and secrets

- Publish backend/frontend by immutable image digest. Set `STATION_POLICY_SIGNING_KEY_ID`; provide the Base64 PKCS#8 Ed25519 private key only through `secrets/station_policy_signing_private_key`.
- Publish the Authenticode-signed Client ZIP over HTTPS and set `GAMING_CLIENT_VERSION`, `GAMING_CLIENT_MINIMUM_VERSION`, `GAMING_CLIENT_DOWNLOAD_URL`, `GAMING_CLIENT_SHA256` and the exact certificate subject in `GAMING_CLIENT_PACKAGE_SIGNING_SUBJECT`.
- DNS and TLS must resolve from each station. Expose only HTTPS application traffic; keep MySQL, the management port and Prometheus on private networks. Permit outbound station traffic only to the backend/download origin and required game services.
- Use a standard local customer account. The Service uses its virtual service account and has modify access only to `%ProgramData%\GManager\Client`; administrators/SYSTEM own installation and policy paths.

## Provision and recovery

Run `client/packaging/publish.ps1` with the CI-held code-signing certificate, transfer the one-time enrollment value over stdin, then run `install-service.ps1`. The installer creates recovery actions, restricted ACLs and a 15-minute signed update task. Update accepts only the configured signer and SHA-256; it preserves one local rollback copy and automatically restores it if the new Service does not remain healthy. Run `support-bundle.ps1` for support evidence: it exports only service state, file versions/hashes and event metadata, never identity DPAPI data, session snapshots, credentials, emails or log messages.

For command lag, offline or lock-pending alarms, use Gaming operativa station history and record its Support ID. Confirm physical lock only after an employee inspects the machine. Backup uses the complete schema; `restore-drill.sh` explicitly requires all nine session/machine tables after restore. Retention removes expired nonces/tokens, stale heartbeat rows and old machine audit metadata according to `STATION_*_RETENTION_DAYS`.

## Security and release evidence

- Review trust boundaries: browser/operator is untrusted for authorization; machine JWT is station-scoped; enrollment is single-use; commands are durable and monotonic; lease/policy signatures are verified client-side; OS application control remains the execution boundary.
- Archive backend, frontend and Client dependency reports/SBOMs from CI. Run `ops/security/machine-api-check.ps1` against staging and complete an authenticated rate-limit, replay, wrong-station, expired-token and malformed-payload penetration review without production customer data.
- Rotate the policy signing key with overlap: install the new public key/key ID, publish with the new private key, prove all clients accept it, then revoke the old key. Separately rotate one machine identity using the enrollment rotation flow and verify the previous identity stops authenticating after overlap.
- Exercise Client upgrade and automatic rollback on the representative station. Review Assigned Access and AppLocker/WDAC first in audit mode, then enforced mode, including every real game, launcher, helper and anti-cheat executable.

## Pilot checklist

- [ ] MySQL previous-release-to-latest and empty-schema migrations passed.
- [ ] Employee customer lookup/create -> station start -> Client login/snapshot -> countdown -> extension -> update -> expiry -> lock acknowledgement -> AVAILABLE passed.
- [ ] Parallel-start/extension conflict, command replay, offline grace, restart, soak and upgrade/rollback scenarios passed.
- [ ] Prometheus test injection proved command-lag, offline, lock-pending, expired-unacknowledged, enrollment and authentication alerts and routing.
- [ ] Encrypted backup restore includes machine tables and the restored backend is ready.
- [ ] Code signature, SBOM/vulnerability policy, threat-model and machine API review are approved.
- [ ] Signing-key/certificate rotation and rollback drills have dated evidence.
- [ ] Owner, operations and security approvers signed the controlled-pilot decision.
