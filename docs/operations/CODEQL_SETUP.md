# CodeQL analysis and SARIF gate

CI run [#103](https://github.com/filipDjekic/g-manager/actions/runs/41300006772)
completed Java/Kotlin and JavaScript/TypeScript analysis but failed when GitHub
rejected the SARIF upload: `Code scanning is not enabled for this repository`.

The CodeQL job now uses `github/codeql-action/analyze` with `upload: never` and
`output: codeql-results`. Both language analyses and the Java compilation remain
enabled on pushes and pull requests. Results are checked locally and retained as
the `codeql-results-<commit>` Actions artifact for 14 days, including on failures.
Analysis and artifact retention work without enabling GitHub Code Scanning.
Repository visibility and the other security jobs are unchanged.

## Blocking criterion

`scripts/check_codeql_sarif.py` requires both `java.sarif` and `javascript.sarif`
and checks every run in every generated SARIF file. It fails for any result with
`kind: fail` (also the default when omitted) and effective level `error`.
Following [SARIF 2.1.0 section 3.27.10](https://docs.oasis-open.org/sarif/sarif/v2.1.0/os/sarif-v2.1.0-os.html),
the level is resolved in this order:

1. Explicit `result.level`.
2. The matching rule configuration override in the invocation identified by
   `result.provenance.invocationIndex`, if present.
3. The referenced rule's `defaultConfiguration.level`, including rules in
   CodeQL query-pack extensions (`result.rule.toolComponent`).
4. `warning` when none of these specifies a level.

This catches findings such as `java/spring-disabled-csrf-protection`, which
CodeQL reports with an extension rule default of `error` and no `result.level`.
Suppressed findings and unchanged baseline findings are still checked. Numeric
`security-severity` does not replace the SARIF level. Warnings, notes, and results
whose kind is not `fail` do not trigger the finding threshold.

Exit code `1` means error-level findings were found. Exit code `2` means missing,
malformed, unsupported or incomplete reports, unsuccessful tool invocations, or
error-level tool execution notifications. CodeQL initialization, compilation,
analysis and the gate all remain blocking steps, without `continue-on-error`.
The artifact upload runs with `always()` after the gate.

## Local verification

No Python packages need to be installed. From the repository root:

```sh
python3 -B -m unittest discover -s scripts -p 'test_check_codeql_sarif.py'
python3 -B scripts/check_codeql_sarif.py path/to/extracted/codeql-results
```

The CI contract also verifies both languages, `upload: never`, the blocking
analysis/gate sequence, and SARIF retention:

```sh
cd frontend/g-manager
npm run ci:validate
npm run ci:validate:self-test
```

Use the repository's pinned Node 22.23.3 and npm 11.19.1 for these npm commands.
