param([switch]$Automatic)
. (Join-Path $PSScriptRoot 'client-management.ps1')
Assert-Administrator
$mutex=[Threading.Mutex]::new($false,'Global\GManager.Client.Deployment')
if(!(Enter-ClientMutex $mutex)){if($Automatic){exit 0};throw 'Druga instalacija ili administratorska operacija je u toku.'}
$request=$null
try{
    Resolve-ClientTransaction
    $config=Read-ClientConfig
    if($config.Client.Mode -ne 'Production'){throw 'Produkcioni updater odbija development konfiguraciju.'}
    $request=$null
    $requestPath=Join-Path $script:ClientState 'update-request.json'
    if(Test-Path -LiteralPath $requestPath){$request=Get-Content -Encoding UTF8 -LiteralPath $requestPath -Raw|ConvertFrom-Json}
    if($Automatic){
        if(!$request -or [DateTimeOffset]::Parse($request.expiresAt) -le [DateTimeOffset]::UtcNow -or [DateTimeOffset]::Parse($request.notBefore) -gt [DateTimeOffset]::UtcNow){return}
        if(Test-Path -LiteralPath (Join-Path $script:ClientState 'update-status.json')){
            $last=Get-Content -Encoding UTF8 -LiteralPath (Join-Path $script:ClientState 'update-status.json') -Raw|ConvertFrom-Json
            if($last.PSObject.Properties.Name -contains 'requestId' -and $last.requestId -eq $request.id -and $last.status -in @('FAILED','ROLLED_BACK')){return}
        }
    }
    $status=Invoke-ClientPipe 'status'
    if($status.State.Mode -eq 2 -or $status.State.Mode -eq 1){if($Automatic){Write-AtomicJson (Join-Path $script:ClientState 'update-status.json') @{status='DEFERRED';requestId=$request.id;timestamp=[DateTimeOffset]::UtcNow.ToString('o')};return};throw 'Stanica ima aktivnu sesiju. Završite je ili lokalno aktivirajte maintenance.'}
    $backend=Assert-Https $config.Backend.BaseUrl
    $metadata=Get-HttpsJson ([uri]::new($backend,'api/v1/stations/client-package').AbsoluteUri)
    if($Automatic -and $metadata.version -ne $request.version){return}
    if($metadata.status -ne 'RELEASED'){if(!$Automatic){Write-Host 'Server trenutno nema objavljeno produkciono izdanje.'};return}
    if($metadata.version -notmatch '^\d+\.\d+\.\d+(\.\d+)?$' -or $metadata.sha256 -notmatch '^[a-fA-F0-9]{64}$'){throw 'Neispravni release metapodaci.'}
    if([version]$metadata.version -le [version]$config.Client.Version){if(!$Automatic){Write-Host 'Instalirana je aktuelna ili novija verzija Client-a.'};return}
    if($metadata.signingSubject -cne $config.Package.SigningSubject){throw 'Izdavač paketa nije lokalno odobren.'}
    Write-Operation 'UPDATE_BEGIN' $metadata.version
    Write-AtomicJson (Join-Path $script:ClientState 'update-status.json') @{status='DOWNLOADING';requestId=$(if($request){$request.id}else{$null});timestamp=[DateTimeOffset]::UtcNow.ToString('o')}
    $work=Join-Path $script:ClientState 'downloads';Remove-ClientTree $work;New-ProtectedDirectory $work
    $archive=Join-Path $work 'client.zip';$candidate=Join-Path $work 'package'
    Get-HttpsFile ([uri]::new($backend,$metadata.downloadUrl).AbsoluteUri) $archive
    if((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ine $metadata.sha256){throw 'SHA-256 preuzetog paketa se ne podudara.'}
    Expand-ClientPackage $archive $candidate
    $manifest=Assert-Package $candidate $config.Package.SigningSubject $config.Package.SigningThumbprint
    Assert-ReleaseCompatibility $manifest ([int](Get-CimInstance Win32_OperatingSystem).BuildNumber)
    $installedManifest=Get-Content -LiteralPath (Join-Path $script:ClientRoot 'release.json') -Raw|ConvertFrom-Json
    if($manifest.runtime -ne $installedManifest.runtime){throw 'Arhitektura novog paketa ne odgovara instaliranom Client-u. Koristite odgovarajući potpisani release.'}
    if($manifest.version -ne $metadata.version){throw 'Verzija potpisanog paketa i servera se ne podudara.'}
    # Recheck after download: never interrupt a newly started customer session.
    $status=Invoke-ClientPipe 'status'
    if($status.State.Mode -in @(1,2)){Write-AtomicJson (Join-Path $script:ClientState 'update-status.json') @{status='DEFERRED';requestId=$(if($request){$request.id}else{$null});timestamp=[DateTimeOffset]::UtcNow.ToString('o')};Write-Operation 'UPDATE_DEFERRED' 'SESSION';return}
    $config.Client.Version=$manifest.version
    Install-ClientFiles $candidate $config
    Write-AtomicJson (Join-Path $script:ClientState 'allowed-paths.json') @()
    Start-ClientService
    Assert-Healthy
    # Recovery tooling is outside the binary swap and remains usable during a power-loss rollback.
    Save-RecoveryTools $script:ClientRoot $config.Package.SigningSubject $config.Package.SigningThumbprint
    Write-AtomicJson (Join-Path $script:ClientState 'update-status.json') @{status='CURRENT';requestId=$(if($request){$request.id}else{$null});timestamp=[DateTimeOffset]::UtcNow.ToString('o')}
    Write-Operation 'UPDATE_COMPLETE' $manifest.version
    $journal=Get-Content -LiteralPath (Join-Path $script:ClientState 'deployment.json') -Raw|ConvertFrom-Json;$journal.phase='Complete';Write-AtomicJson (Join-Path $script:ClientState 'deployment.json') $journal
    if(!(Get-Maintenance)){Start-ScheduledTask -TaskName 'GManagerClientShell' -ErrorAction SilentlyContinue}
}catch{
    $failure=$_
    try{Resolve-ClientTransaction}catch{Write-Warning 'Automatski rollback nije završen; administrator treba da pokrene repair -Recovery.'}
    Write-AtomicJson (Join-Path $script:ClientState 'update-status.json') @{status='FAILED';requestId=$(if($request){$request.id}else{$null});errorCode='UPDATE_FAILED';timestamp=[DateTimeOffset]::UtcNow.ToString('o')}
    Write-Operation 'UPDATE_FAILED' $failure.Exception.GetType().Name
    throw $failure
}finally{$mutex.ReleaseMutex();$mutex.Dispose()}
