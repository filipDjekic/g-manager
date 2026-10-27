param(
    [ValidateSet('status','manage','exit','maintenance','update','repair','restart','uninstall','diagnostics','watchdog')][string]$Command='status',
    [ValidateSet('enable','disable')][string]$Action,
    [ValidateRange(1,60)][int]$Minutes=15,
    [switch]$Recovery,
    [switch]$PurgeData,
    [string]$PurgeConfirmation
)
. (Join-Path $PSScriptRoot 'client-management.ps1')
try {
    if($Command -eq 'status'){
        try{$status=Invoke-ClientPipe 'status';$labels=@('Zaključano','Prijava','Aktivna sesija','Offline','Održavanje');[pscustomobject]@{Stanje=$labels[[int]$status.State.Mode];Poruka=$status.State.Heading;Veza=$status.State.Connectivity}|Format-List}
        catch{$service=Get-Service GManagerClient -ErrorAction SilentlyContinue;if($service){Write-Output "Lokalni servis nije dostupan. Windows servis: $($service.Status). Administrator može pokrenuti repair -Recovery."}else{Write-Output 'G-Manager Windows servis nije instaliran.'}}
        return
    }
    if($Command -eq 'diagnostics'){
        Get-CimInstance Win32_Service -Filter "Name='GManagerClient'"|Select-Object Name,State,StartMode,ExitCode|Format-List
        Get-ScheduledTask -TaskName 'GManagerClient*' -ErrorAction SilentlyContinue|Select-Object TaskName,State|Format-Table
        try{[void](Invoke-ClientPipe 'status');Write-Output 'Lokalna komunikacija: dostupna'}catch{Write-Output 'Lokalna komunikacija: nije dostupna'}
        return
    }
    Assert-Administrator
    if($Command -eq 'manage'){& (Join-Path $PSScriptRoot 'GManager-Management.ps1');return}
    if($Command -eq 'update'){& (Join-Path $PSScriptRoot 'update-client.ps1');return}
    if($Command -eq 'uninstall'){& (Join-Path $PSScriptRoot 'uninstall-service.ps1') -PurgeData:$PurgeData -PurgeConfirmation $PurgeConfirmation;return}
    $mutex=[Threading.Mutex]::new($false,'Global\GManager.Client.Deployment')
    if(!(Enter-ClientMutex $mutex)){if($Command -eq 'watchdog'){return};throw 'Druga administratorska operacija je u toku.'}
    try{
        $config=Read-ClientConfig
        if($config.Client.Mode -ne 'Production'){throw 'Produkcioni CLI odbija development konfiguraciju.'}
        $leasePath=Join-Path $script:ClientState 'maintenance.json'
        if($Command -eq 'watchdog'){
            Resolve-ClientTransaction
            $uninstall=Join-Path $script:ClientState 'uninstall.json'
            if((Test-Path -LiteralPath $uninstall) -and (Get-Content -LiteralPath $uninstall -Raw|ConvertFrom-Json).phase -eq 'Restoring'){
                & (Join-Path $PSScriptRoot 'uninstall-service.ps1') -Resume;return
            }
            if(Get-Maintenance){return}
            if(Test-Path -LiteralPath $leasePath){
                Stop-PlayerSessions $config.Client.PlayerSid
                Suspend-LocalSession
                Write-AtomicJson $leasePath @{ExpiresAt=[DateTimeOffset]::MinValue.ToString('o')}
                Write-AtomicJson (Join-Path $script:ClientState 'allowed-paths.json') @()
                Invoke-Policy 'Apply'
                Remove-Item -LiteralPath $leasePath -Force
                Write-Operation 'MAINTENANCE_EXPIRED' 'LOCKED'
            }
            $healthPath=Join-Path $script:ClientState 'health.json'
            $stale=$true
            if(Test-Path -LiteralPath $healthPath){$health=Get-Content -LiteralPath $healthPath -Raw|ConvertFrom-Json;$stale=[DateTimeOffset]::Parse($health.timestamp) -lt [DateTimeOffset]::UtcNow.AddSeconds(-30)}
            if($stale){
                Stop-ClientService -Force
                Stop-PlayerSessions $config.Client.PlayerSid
                Suspend-LocalSession
                Write-AtomicJson (Join-Path $script:ClientState 'allowed-paths.json') @()
                Invoke-Policy 'Apply'
                Start-ClientService
                Write-Operation 'WATCHDOG_RECOVERY' 'LOCKED'
            }
            return
        }
        Write-Operation ($Command.ToUpperInvariant()+'_BEGIN') 'LOCAL_ADMIN'
        if($Command -eq 'exit'){
            if([Security.Principal.WindowsIdentity]::GetCurrent().User.Value -eq $config.Client.PlayerSid){throw 'Exit zahteva zasebnu Windows administratorsku sesiju.'}
            $Action='enable'
        }
        if($Command -in @('maintenance','exit')){
            if(!$Action){throw 'Navedite maintenance enable ili maintenance disable.'}
            if($Action -eq 'enable'){
                try{[void](Invoke-ClientPipe 'prepare-maintenance' -Admin)}catch{if(!$Recovery){throw 'Servis nije spreman. Za nezavisni recovery upotrebite maintenance enable -Recovery.'};Stop-ClientService -Force}
                # Resolve every player process/session before releasing OS restrictions. Admin sessions remain intact.
                Stop-PlayerSessions $config.Client.PlayerSid
                Suspend-LocalSession
                $expiry=[DateTimeOffset]::UtcNow.AddMinutes($Minutes)
                Register-RecoveryTasks
                Register-MaintenanceExpiry $expiry
                Write-AtomicJson $leasePath @{ExpiresAt=$expiry.ToString('o');Actor=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value}
                try{Invoke-Policy 'Suspend'}catch{Write-AtomicJson $leasePath @{ExpiresAt=[DateTimeOffset]::MinValue.ToString('o')};Write-AtomicJson (Join-Path $script:ClientState 'allowed-paths.json') @();Invoke-Policy 'Apply';throw}
                Write-Operation 'MAINTENANCE_ENABLED' $expiry.ToString('o')
                if($Command -eq 'exit'){Stop-ClientShell;Write-Operation 'SHELL_EXIT_COMPLETE' 'SERVICE_RUNNING_MAINTENANCE'}
                Write-Host "Održavanje je uključeno do $($expiry.LocalDateTime). Za rad koristite zaseban Windows administratorski nalog."
            }else{
                Stop-PlayerSessions $config.Client.PlayerSid
                Write-AtomicJson $leasePath @{ExpiresAt=[DateTimeOffset]::MinValue.ToString('o')}
                Write-AtomicJson (Join-Path $script:ClientState 'allowed-paths.json') @()
                Invoke-Policy 'Apply'
                Remove-Item -LiteralPath $leasePath -Force
                Start-ClientService
                Write-Operation 'MAINTENANCE_DISABLED' 'LOCKED'
                Write-Host 'Održavanje je završeno. Zaštita je ponovo aktivna.'
            }
        }
        if($Command -in @('repair','restart')){
            Resolve-ClientTransaction
            try{[void](Invoke-ClientPipe 'prepare-maintenance' -Admin)}catch{if(!$Recovery){throw 'Servis nije dostupan. Navedite -Recovery za nezavisni oporavak.'}}
            Stop-ClientService -Force
            Stop-PlayerSessions $config.Client.PlayerSid
            Suspend-LocalSession
            if($Command -eq 'repair'){Repair-ClientFiles $config}
            Write-AtomicJson (Join-Path $script:ClientState 'allowed-paths.json') @()
            Invoke-Policy 'Apply'
            Register-RecoveryTasks
            Start-ClientService
            Assert-Healthy
            if($Command -eq 'repair'){$deployment=Get-Content -LiteralPath (Join-Path $script:ClientState 'deployment.json') -Raw|ConvertFrom-Json;$deployment.phase='Complete';Write-AtomicJson (Join-Path $script:ClientState 'deployment.json') $deployment}
            Write-Operation ($Command.ToUpperInvariant()+'_COMPLETE') 'HEALTHY'
            Write-Host 'Servis je pokrenut. Identitet stanice je sačuvan.'
        }
    }finally{$mutex.ReleaseMutex();$mutex.Dispose()}
}catch{$failure=$_;if($Command -notin @('status','diagnostics') -and (Test-Path -LiteralPath $script:ClientState)){try{Write-Operation ($Command.ToUpperInvariant()+'_FAILED') $failure.Exception.GetType().Name}catch{}};Write-Error ("G-Manager: "+$failure.Exception.Message);exit 1}
