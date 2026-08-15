$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$seedPath = Join-Path $repositoryRoot 'gm\src\main\resources\db\dev\seed_playground.sql'

if (-not (Test-Path -LiteralPath $seedPath)) {
    throw "Development seed not found: $seedPath"
}

Push-Location $repositoryRoot
try {
    docker compose ps --status running mysql | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw 'MySQL Compose service is not running. Run docker compose up --build -d first.'
    }
    $guard = "SET @gmanager_allow_dev_seed = 1;`n"
    ($guard + (Get-Content -Raw -Encoding utf8 -LiteralPath $seedPath)) |
        docker compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --default-character-set=utf8mb4 -uroot gmanager'
    if ($LASTEXITCODE -ne 0) {
        throw 'Development seed failed; MySQL rolled back the seed transaction.'
    }
}
finally {
    Pop-Location
}
