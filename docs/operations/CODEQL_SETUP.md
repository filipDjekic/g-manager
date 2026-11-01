# CodeQL repository prerequisite

CI run [41292277731](https://github.com/filipDjekic/g-manager/actions/runs/41292277731)
on commit `79325380d24e6712331fe10355694620dcc85069` completed Java compilation,
Java/Kotlin and JavaScript/TypeScript analysis, and SARIF generation. GitHub rejected
the SARIF upload with `Code scanning is not enabled for this repository`.
The resulting `configuration error` is a repository feature prerequisite, not a
compiler failure. The job log confirms `actions: read`, `contents: read`,
`packages: read`, and `security-events: write` were granted on this push run.

The repository owner must open
[Settings → Advanced Security](https://github.com/filipDjekic/g-manager/settings/security_analysis),
enable **GitHub Code Security**, and use **Advanced setup** with the existing
`.github/workflows/ci.yml`. Do not create a competing default-setup workflow.
Then rerun CodeQL. Changing token permissions cannot enable this feature.

This repository is private and owned by a personal account. If Code Security
cannot be enabled under its current ownership/plan, GitHub requires an eligible
organization on GitHub Team or Enterprise with GitHub Code Security enabled.
The owner must arrange the organization/license and repository transfer; this
repair does not change visibility, purchase a plan, or transfer the repository.
See GitHub's [private repository requirements](https://docs.github.com/en/code-security/reference/code-scanning/troubleshoot-analysis-errors/private-repository-enablement)
and [advanced setup prerequisites](https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/configure-code-scanning/configuring-advanced-setup-for-code-scanning).

Both `push` and `pull_request` still run CodeQL with upload enabled. Fork and
Dependabot pull requests have different token restrictions; do not switch to
`pull_request_target` to give untrusted code a write token. The current failure
occurred on an ordinary push and is unrelated to fork permissions.

CI preserves generated `codeql-results/*.sarif` as a private Actions artifact,
including when GitHub rejects the upload. Inspect those results for findings
while arranging enablement. A failed upload remains a failed required job.

The first preserved report from PR #17 contained one Java finding,
`java/spring-disabled-csrf-protection`, and no JavaScript/TypeScript findings.
The repair enables Spring CSRF protection for the refresh/logout endpoints that
authenticate with a cookie. The frontend obtains a masked token from
`GET /api/v1/auth/csrf` before those POSTs. The backing cookie stays HttpOnly,
SameSite Strict, scoped to auth, and Secure in production; the token response is
not cacheable. Explicit bearer user/machine APIs retain their stateless contract.
