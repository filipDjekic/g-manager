# G-Manager Gaming Client

Stage 8 Windows vertical slice targets .NET 10 LTS. `GManager.Client.Service` owns the DPAPI-protected Ed25519 identity, HTTPS machine protocol, safe snapshot and current-user-only named pipe. `GManager.Client.Shell` is an unprivileged fullscreen WPF process and never references the Protocol or Service project.

Build from `client`: `dotnet build GManager.Client.slnx`. Publish/sign from an elevated PowerShell in `client/packaging`: `.\publish.ps1 -CertificateThumbprint <code-signing-thumbprint>`. Before install, pipe the one-time enrollment code over stdin: `$code = Read-Host; $code | ..\artifacts\service\GManager.Client.Service.exe --enroll-stdin`. Install Service plus Shell startup: `.\install-service.ps1 -PackageDirectory ..\artifacts -BackendUrl https://host:8080/ -PolicySigningPublicKey <Base64-SPKI-public-key> -PolicySigningKeyId <key-id>`; uninstall: `.\uninstall-service.ps1`. The service is configured for three delayed automatic recovery attempts.

Runtime state and logs live under `%ProgramData%\GManager\Client`; Event Viewer also contains Windows Service lifecycle events. Identity material is DPAPI LocalMachine encrypted; customer passwords exist only in Shell/Service process memory for one request and are never serialized to disk or logged. A development HTTPS certificate must be trusted in Local Computer Trusted Root; production must use a publicly or enterprise-CA trusted certificate. Enrollment is performed once with the short-lived code issued by the Stations web page; deployment tooling passes it directly to the Service enrollment operation and must not persist it.

The downloadable artifact URL, version, status and SHA-256 are supplied by `GAMING_CLIENT_DOWNLOAD_URL`, `GAMING_CLIENT_VERSION`, `GAMING_CLIENT_STATUS` and `GAMING_CLIENT_SHA256`.

Application-control authoring, supported Windows editions, signing-key separation and rollback are defined in `POLICY.md`.
