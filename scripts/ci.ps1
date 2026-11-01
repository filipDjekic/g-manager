param([switch]$SkipMySql, [switch]$SkipE2E)
$ErrorActionPreference = 'Stop'
function Invoke-Checked([scriptblock]$Command) {
    & $Command
    if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code $LASTEXITCODE" }
}

$expectedNpm = (Get-Content -LiteralPath "$PSScriptRoot\..\frontend\g-manager\package.json" -Raw | ConvertFrom-Json).packageManager
$actualNpm = 'npm@' + (& npm.cmd --version)
if ($LASTEXITCODE -ne 0 -or $actualNpm -ne $expectedNpm) {
    throw "Install the repository npm version before verification: npm install --global $expectedNpm"
}

Push-Location "$PSScriptRoot\..\client"
try {
    Invoke-Checked { dotnet restore GManager.Client.slnx }
    Invoke-Checked { dotnet build GManager.Client.slnx -c Release --no-restore -warnaserror }
    Invoke-Checked { dotnet test GManager.Client.slnx -c Release --no-build }
    $nugetJson = dotnet list GManager.Client.slnx package --vulnerable --include-transitive --format json --no-restore
    if ($LASTEXITCODE -ne 0) { throw 'NuGet vulnerability query failed.' }
    $nugetReport = ($nugetJson -join "`n") | ConvertFrom-Json
    foreach ($project in $nugetReport.projects) {
        foreach ($framework in $project.frameworks) {
            foreach ($package in @($framework.topLevelPackages) + @($framework.transitivePackages)) {
                if ($package -and $package.vulnerabilities) {
                    throw "Vulnerable NuGet package: $($project.path): $($package.id) $($package.resolvedVersion)"
                }
            }
        }
    }
} finally { Pop-Location }

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
    Invoke-Checked { npm.cmd run build:budget }
    Invoke-Checked { npm.cmd run sbom }
    if (-not $SkipE2E) {
        Invoke-Checked { npx.cmd playwright install chromium }
        Invoke-Checked { npm.cmd run test:e2e }
        Invoke-Checked { npm.cmd run test:e2e:pwa }
    }
    Invoke-Checked { npm.cmd audit }
} finally { Pop-Location }
