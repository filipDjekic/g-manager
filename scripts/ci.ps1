param([switch]$SkipMySql, [switch]$SkipE2E)
$ErrorActionPreference = 'Stop'
function Invoke-Checked([scriptblock]$Command) {
    & $Command
    if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code $LASTEXITCODE" }
}

Push-Location "$PSScriptRoot\..\gm"
try {
    Invoke-Checked { .\mvnw.cmd clean verify }
    if (-not $SkipMySql) { Invoke-Checked { .\mvnw.cmd verify -Pmysql-it } }
} finally { Pop-Location }

Push-Location "$PSScriptRoot\..\frontend\g-manager"
try {
    Invoke-Checked { npm.cmd ci }
    Invoke-Checked { npm.cmd run ci:validate }
    Invoke-Checked { npm.cmd run ci:validate:self-test }
    Invoke-Checked { npm.cmd run test:coverage }
    Invoke-Checked { npm.cmd run lint }
    Invoke-Checked { npm.cmd run typecheck }
    Invoke-Checked { npm.cmd run build }
    Invoke-Checked { npm.cmd run sbom }
    if (-not $SkipE2E) {
        Invoke-Checked { npx.cmd playwright install chromium }
        Invoke-Checked { npm.cmd run test:e2e }
    }
    Invoke-Checked { npm.cmd audit }
} finally { Pop-Location }
