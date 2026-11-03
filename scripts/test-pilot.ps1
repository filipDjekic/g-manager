param([switch]$SkipMySql,[switch]$SkipPerformance,[switch]$SkipBackupContainer,[switch]$SkipBrowser)
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$resultDir=Join-Path $repo ('artifacts\pilot\'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ'))
New-Item -Path $resultDir -ItemType Directory -Force|Out-Null
$results=[Collections.Generic.List[object]]::new()
function Invoke-Check([string]$Name,[string]$Directory,[scriptblock]$Run){
    Write-Host "Running $Name"
    $started=[DateTimeOffset]::UtcNow;Push-Location (Join-Path $repo $Directory)
    $previousPreference=$ErrorActionPreference
    # Windows PowerShell 5 wraps native stderr as NativeCommandError even on exit 0.
    # Judge native tools by their exit code, preserving their diagnostic output.
    try{$ErrorActionPreference='Continue';$global:LASTEXITCODE=$null;& $Run *> (Join-Path $resultDir ($Name+'.log'));$code=$LASTEXITCODE;if($null -eq $code){$code=1}}
    catch{$code=1;$_|Out-String|Add-Content -LiteralPath (Join-Path $resultDir ($Name+'.log'))}
    finally{$ErrorActionPreference=$previousPreference;Pop-Location}
    $results.Add([pscustomobject]@{Name=$Name;Status=$(if($code -eq 0){'PASSED'}else{'FAILED'});ExitCode=$code;StartedAt=$started;Seconds=([DateTimeOffset]::UtcNow-$started).TotalSeconds})
    $results|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $resultDir 'results.json') -Encoding UTF8
    if($code -ne 0){throw "$Name failed ($code). See $resultDir"}
}
function Record-Skipped([string]$Name){
    $results.Add([pscustomobject]@{Name=$Name;Status='SKIPPED';ExitCode=$null;StartedAt=[DateTimeOffset]::UtcNow;Seconds=0})
    $results|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $resultDir 'results.json') -Encoding UTF8
}
Invoke-Check 'backend' 'gm' { & .\mvnw.cmd verify }
if(!$SkipMySql){Invoke-Check 'mysql-pilot' 'gm' { & .\mvnw.cmd verify -Pmysql-it '-Dit.test=PilotGamingCenterIT,PilotBackendRestartIT,GamingBillingConcurrencyIT,GamingSessionConcurrencyIT,ResourceConcurrencyIT,MySqlSchemaIT' '-Dtest=Machine*Test,Station*Test,Gaming*Test' }}else{Record-Skipped 'mysql-pilot'}
if(!$SkipPerformance){
    Invoke-Check 'performance' 'gm' { & .\mvnw.cmd verify -Pmysql-it '-Dit.test=BackendPerformanceIT' '-Dtest=MachineProtocolScopeTest' '-Daudit.label=pilot' }
    Copy-Item -LiteralPath (Join-Path $repo 'gm\target\backend-performance-pilot.json') -Destination $resultDir
}else{Record-Skipped 'performance'}
Invoke-Check 'frontend-tests' 'frontend\g-manager' { & npm.cmd test -- --run }
Invoke-Check 'frontend-lint' 'frontend\g-manager' { & npm.cmd run lint }
Invoke-Check 'frontend-build' 'frontend\g-manager' { & npm.cmd run build }
if(!$SkipBrowser){
    Invoke-Check 'browser' 'frontend\g-manager' { & npm.cmd run test:e2e -- --workers=1 }
    Invoke-Check 'pwa-offline' 'frontend\g-manager' { & npm.cmd run test:e2e:pwa -- --workers=1 }
}else{Record-Skipped 'browser';Record-Skipped 'pwa-offline'}
Invoke-Check 'client' 'client' { & dotnet test GManager.Client.slnx -c Release }
Invoke-Check 'client-build' 'client' { & dotnet build GManager.Client.slnx -c Release --no-restore -warnaserror }
Invoke-Check 'windows-isolated' 'client' { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests\windows-enforcement.Tests.ps1 }
if(!$SkipBackupContainer){
    Invoke-Check 'backup-build' '.' { & docker build -t gmanager-pilot-backup-test ops/backup }
    Invoke-Check 'backup-safety' '.' { & docker run --rm --mount "type=bind,source=$repo\ops\backup\test-safety.sh,target=/tmp/test-safety.sh,readonly" gmanager-pilot-backup-test bash /tmp/test-safety.sh }
}else{Record-Skipped 'backup-build';Record-Skipped 'backup-safety'}
if($SkipMySql -or $SkipPerformance -or $SkipBackupContainer -or $SkipBrowser){
    Write-Host "Partial verification passed; skipped groups remain unverified. Physical acceptance remains required. Results: $resultDir"
}else{Write-Host "Automated pilot checks passed. Physical acceptance remains required. Results: $resultDir"}
