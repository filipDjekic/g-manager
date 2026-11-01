# System audit — implementation and verification (2026-10-24)


> **Istorijski dokument.** Sačuvan radi projektantskog konteksta i ranijih nalaza. Opisi, komande i rezultati u nastavku nisu potvrda trenutnog ponašanja niti važeće operativno uputstvo. Koristite [aktuelnu dokumentaciju](../../README.md) i [nalaze pregleda od 1. novembra 2026.](../../MAINTENANCE_AUDIT.md).

This record distinguishes implemented source changes from checks actually performed. Production Windows operations are reserved for a dedicated test station. Existing user changes in ClientState, ClientRuntime, ClientWorker, Shell, Dashboard/Views/Resources and GAMING_DASHBOARD.md have been preserved. Existing tracked build outputs were already dirty; they were not restored.

## Implemented web changes

- Shared fluid workspace width and page spacing, with a deliberate reading-width variant for profile, account sessions and notification preferences. Removed competing calendar and gaming page width caps and calendar theme overrides. Retained the existing dark/light palette and density controls.
- Shared primary/secondary/outline/danger/ghost/icon buttons, safe default button type, form labels linked to controls, accessible names for selects and fields, DOM-order modal focus trapping, Escape and focus restoration. Existing card/table/status primitives remain the common foundations.
- One pagination component across catalog, customer/employee/user lists, orders, reservations, resources, stations, gaming board, waitlist and audit. Page-size options 10/20/50/100, range/total, busy/disabled states, numbered navigation and empty/out-of-range correction. Existing server pagination and URL semantics are retained. Live board/map collections still use their existing complete APIs, because their availability/map projection needs the full station set.
- Weekly calendar replaced agenda cards with a seven-day vertical time grid: 15-minute intervals, overlapping lanes, exact event intervals, cross-midnight clipping, statuses, business hours and absences, current-time marker, details and authorized interval creation. Narrow screens scroll the grid. Europe/Belgrade spring gaps and repeated autumn hours are explicitly modeled and tested. Day/month/list views and filters are retained.
- Frontend role defaults match the backend permission matrix. React Query data clears on actor/role/permission changes. Employee creation capability is shown only when granted. Fixed customer booking reopening after successful submission while Router navigation was still committing.
- Presentation helpers/constants split from React component exports into shared model modules. Navigation-scoped drafts/selections reset before commit; image previews share object-URL lifecycle management. Local clocks use the existing monotonic server clock. Deliberate external-request/deep-link synchronization effects retain narrowly documented lint exceptions; lint rules were not disabled globally.

## Implemented backend changes

- Employees can create/manage their own reservations for services without physical resources. The same narrow rule is used by manageable lists, privacy/search, edit-resource options and waitlist access. Other employees remain redacted/read-only and physical station grants remain mandatory. Regression assertions cover positive and negative cases.
- Repaired module dependency cycles using scheduling ports and adapters for station state, client state, gaming runtime and resource availability. Security configuration is in the composition root; customer activation accepts primitive account inputs. HTTP contracts and authorization rules are preserved.
- H2 test-only migration adapter handles compound MySQL ALTER clauses without changing any released Flyway migration. MySQL/production migrations remain unchanged.
- Public registration remains intentionally disabled by the existing security model. README now describes staff-created customer accounts and one-time activation correctly.

## Implemented Windows changes

- `publish.ps1` includes a clear `GManager-Setup.cmd` entry and signs/includes the separate WPF `GManager-Management.ps1` panel. Setup accepts interactive public deployment inputs and keeps hidden enrollment stdin, TLS, publisher pinning, CMS/file manifest checks, CA confirmation, recovery and rollback.
- Separate elevated Windows administrator panel reports version, service, observed backend connectivity, identity presence, maintenance lease and update status. Fixed actions call the existing trusted CLI asynchronously: update, restart, exit, maintenance, diagnostics and uninstall.
- Exit uses a bounded maintenance lease and closes the Shell through the existing local authorization path. Normal service/recovery continue. Uninstall preserves identity/configuration by default; purge needs explicit selection, typed OBRISI and confirmation.
- Update rejects architecture changes relative to the installed signed manifest. First-install rollback restores owned policies before removing recovery tasks, allowing retry if policy restoration fails.
- No private keys or passwords are embedded. Web OWNER/ADMIN roles do not grant Windows elevation. No production Windows policies, enrollment, install, update or uninstall have been executed on this development laptop.

## Verified results

| Check | Actual result |
| --- | --- |
| Backend `mvnw verify` | **196 passed**, 0 failed/errors/skipped, 82 suites; includes architecture, authorization, reservations, orders, gaming lifecycle and machine protocol tests. |
| Frontend `vitest run` | **96 passed**, 44 files; includes backend/frontend permission parity, pagination, weekly overlaps/DST, dialogs, cart, booking and query cache isolation. |
| Playwright complete desktop/mobile suite | **39 passed**, 5 deliberately skipped duplicate mobile viewport-matrix cases; all five requested desktop resolutions passed with expanded/collapsed navigation. |
| Playwright final customer rerun | **4 passed** after repairing the customer order-detail API fixture and requiring its rendered items before navigating to reservations. |
| Frontend strict ESLint | Passed with `--max-warnings 0`; the Node fixture type-reference file also passed its final targeted lint check. |
| Frontend production build/bundle budget | Passed after all source changes, including TypeScript checks and the repository permission-contract fixture types. |
| .NET client tests | **16 passed**, 0 failed/skipped. |
| .NET Release solution build | Passed, **0 warnings, 0 errors**. |
| Windows packaging validation | All PowerShell scripts parsed; management WPF XAML loaded. Offscreen management markup rendered and visually inspected without privileged handlers. |
| Whitespace validation | `git diff --check` passed, excluding existing tracked client bin/obj outputs. |

Browser checks cover 1280×720, 1366×768, 1600×900, 1920×1080 and 2560×1440. They visit 18 management workspaces in both sidebar modes and five customer workspaces. Weekly screenshots at the smallest and largest resolutions were visually inspected. UI evidence and the complete browser report are in ignored local `frontend/g-manager/artifacts/audit/`; management preview is in `client/artifacts/audit/management-preview.png`.

Playwright uses synthetic isolated API fixtures. Spring MockMvc integration tests separately exercise actual backend services, authorization and an isolated H2 database. This is not a claim of a live full-stack or physical Windows installation test. Earlier failures from stale fixtures/selectors, a denied raw Java fixture import, H2 syntax and architecture cycles were investigated and corrected; final results above come from executed reruns.

## Role coverage

- **OWNER:** browser authentication/navigation, dashboard drill-downs, reports, list deep links/saved views and management page accessibility/layout; backend management operations and permission boundaries.
- **ADMIN:** browser authentication/navigation and capability matrix parity; backend user creation/management with explicit rejection of protected OWNER operations and role escalation.
- **EMPLOYEE:** calendar navigation/details, today-work status changes, order takeover and station-scoped gaming start in browser; reservation create/status/edit-option/search regressions, physical resource scope denials and gaming transitions in backend tests. Component tests cover extension idempotency and ambiguous-command retry.
- **CUSTOMER:** browser order submission/detail, booking creation/detail/cancellation and concurrent slot conflict; component tests cover recoverable cart and waitlist/recurrence flows. Backend tests cover account activation, own-data scope, idempotency and rejection of access to other customers. Open public registration is intentionally disabled; it was not enabled to make a smoke test pass.
- Machine tests cover enrollment/replay/login scopes and existing ACK/lease behavior. Physical Windows lock and real restart/offline behavior remain dedicated-station checks, as detailed below.

## Environment / release limits

- Docker daemon is unavailable, so MySQL Testcontainers and Compose deployment cannot be exercised here. H2 integration is not a substitute for reporting an actual MySQL run.
- No release signing certificate or dedicated station was provided. The source packaging workflow is updated; the existing ZIP has not been replaced with an unsigned package. Release administrator must generate and sign the release with approved credentials.
- Actual Setup/enrollment, reboot/autostart, AppLocker ownership rollback, physical LOCK_ACK, service restart, network-loss recovery, update/rollback and uninstall/reinstall require the dedicated Windows test station and configured backend. Unit/integration protocol tests do not certify physical lock behavior.

## Release administrator actions

1. Make the approved backend/HTTPS and policy-signing public configuration available; prepare the separate Windows administrator and standard player accounts.
2. Generate the release through `client/packaging/publish.ps1` using the approved code-signing certificate, publish the signed package and trusted backend release metadata.
3. On the dedicated station, run Setup as administrator, confirm any explicitly required CA trust and enter the authorized one-time enrollment token.
4. Run the real station acceptance checks: login/countdown/allowed applications, physical lock acknowledgement, disconnect/reconnect, reboot/autostart, maintenance expiry, update/rollback and uninstall/reinstall with identity preservation.
5. Run the existing MySQL/Testcontainers and Compose deployment checks in an environment with a working Docker engine.
