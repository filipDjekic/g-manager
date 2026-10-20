param([switch]$PurgeData,[switch]$Resume)
. (Join-Path $PSScriptRoot 'client-management.ps1')
Assert-Administrator
$mutex=[Threading.Mutex]::new($false,'Global\GManager.Client.Deployment')
if(!(Enter-ClientMutex $mutex)){throw 'Druga administratorska operacija je u toku.'}
try{
    $journalPath=Join-Path $script:ClientState 'uninstall.json'
    if($Resume){
        $plan=Get-Content -LiteralPath $journalPath -Raw|ConvertFrom-Json
        if($plan.phase -eq 'Complete'){return}
        $PurgeData=[bool]$plan.purgeData
    }else{
        if($PurgeData -and (Read-Host 'Brisanje lokalnog identiteta i podataka zahteva novi enrollment. Unesite OBRISI') -cne 'OBRISI'){throw 'Brisanje podataka nije potvrđeno.'}
        $plan=@{phase='Restoring';purgeData=[bool]$PurgeData;timestamp=[DateTimeOffset]::UtcNow.ToString('o')}
        Write-AtomicJson $journalPath $plan
    }
    Write-Operation 'UNINSTALL_BEGIN' 'LOCAL_ADMIN'
    $config=Read-ClientConfig
    # This authorization and recovery path do not depend on the backend or Service.
    Stop-ClientService -Force
    Stop-PlayerSessions $config.Client.PlayerSid
    Suspend-LocalSession
    Stop-ClientShell
    Invoke-Policy 'Remove'
    foreach($name in @('GManagerClientShell','GManagerClientUpdate','GManagerClientMaintenanceExpiry')){Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue}
    if(Get-Service GManagerClient -ErrorAction SilentlyContinue){Invoke-Native 'sc.exe' @('delete','GManagerClient')}
    $deadline=[DateTime]::UtcNow.AddSeconds(15)
    while((Get-Service GManagerClient -ErrorAction SilentlyContinue) -and [DateTime]::UtcNow -lt $deadline){Start-Sleep -Milliseconds 500}
    if(Get-Service GManagerClient -ErrorAction SilentlyContinue){throw 'Windows još drži servis otvoren. Zatvorite Services prozor i ponovite uninstall.'}
    Remove-ClientTree $script:ClientRoot
    Remove-ClientTree ($script:ClientRoot+'.candidate')
    Remove-ClientTree ($script:ClientRoot+'.previous')
    Remove-ClientTree (Join-Path $script:ClientState 'downloads')
    Remove-ClientTree (Join-Path $script:ClientState 'repair-source')
    if(Test-Path -LiteralPath (Join-Path $script:ClientState 'maintenance.json')){Remove-Item -LiteralPath (Join-Path $script:ClientState 'maintenance.json') -Force}
    Remove-OwnedCa
    $plan.phase='Complete';Write-AtomicJson $journalPath $plan
    Write-Operation 'UNINSTALL_COMPLETE' 'WINDOWS_POLICY_RESTORED'
    Unregister-ScheduledTask -TaskName 'GManagerClientRecovery' -Confirm:$false -ErrorAction SilentlyContinue
    Remove-OwnedPublisher
    if($PurgeData){
        # Only our recorded files are removed. Audit and policy ownership journal remain for review/recovery.
        foreach($name in @('identity.dpapi','snapshot.json','station-policy.json','client.json','health.json','allowed-paths.json','deployment.json','update-status.json')){
            $path=Join-Path $script:ClientState $name;Assert-NoReparse $path;if(Test-Path -LiteralPath $path){Remove-Item -LiteralPath $path -Force}
        }
    }
    Write-Host 'G-Manager servis, zadaci, instalacija i sopstvena Windows pravila su uklonjeni. Backend podaci stanice nisu menjani.'
    if(!$PurgeData){Write-Host 'DPAPI identitet i lokalni podaci su sačuvani za ponovnu instalaciju.'}
}catch{Write-Operation 'UNINSTALL_FAILED' $_.Exception.GetType().Name;throw}
finally{$mutex.ReleaseMutex();$mutex.Dispose()}
