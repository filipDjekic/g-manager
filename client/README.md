# G-Manager Gaming Client

.NET 10 Windows Client uses the existing machine enrollment, signed configuration and finite session-lease protocol. The SYSTEM Service owns the DPAPI LocalMachine identity and OS policy; the standard-account WPF Shell starts approved applications in its own Windows session. Local IPC checks Windows identities, separates administrator operations and verifies the installed Service peer before sending customer credentials.

Use [CLIENT_MANAGEMENT.md](docs/CLIENT_MANAGEMENT.md) for development, signed publication, installation, enrollment, maintenance, updates, removal and offline recovery commands. Production configuration is stored in ACL-protected `%ProgramData%\GManager\Client\client.json`; environment variables and command-line configuration cannot override it. The install retains a recovery copy outside the swapped binary directory.

Development runs both processes manually with a separate current-user pipe, DPAPI CurrentUser identity and `%LOCALAPPDATA%\GManager\Development` state. It never applies Windows restrictions, locks Windows or stops other applications. Development is refused while a production Client is installed.

Publish/sign with `packaging/publish.ps1 -CertificateThumbprint <thumbprint> -Version <release-version>`. The package has an Authenticode-signed executable/script surface and detached CMS-signed complete SHA-256 manifest. Supply real `GAMING_CLIENT_DOWNLOAD_URL`, `GAMING_CLIENT_VERSION`, `GAMING_CLIENT_STATUS`, `GAMING_CLIENT_SHA256` and signing subject metadata to the existing server distribution configuration. Publishing requires a separate release operation; repository source changes do not regenerate an existing artifact.

Application policy and signing-key separation: [POLICY.md](POLICY.md). Failure behavior and operator reconciliation: [FAILURE_RECOVERY.md](FAILURE_RECOVERY.md).
