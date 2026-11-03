param(
    [string]$PackageDirectory=$PSScriptRoot,
    [string]$BackendUrl,
    [string]$PolicySigningPublicKey,
    [string]$PolicySigningKeyId,
    [string]$SigningSubject,
    [string]$SigningThumbprint,
    [string]$PlayerAccount,
    [string]$LocalCaCertificate,
    [string]$ExpectedCaSha256,
    [Security.SecureString]$EnrollmentToken
)
$ErrorActionPreference='Stop'
if(!([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Pokrenite GManager-Setup.cmd kroz Run as administrator iz zasebnog Windows administratorskog naloga.'}
Write-Host 'G-MANAGER · Welcome / System Check'
Write-Host 'Pripremite odobrene javne deployment podatke. Lozinke i privatni ključevi se ne unose u paket.'
if(!$SigningSubject){$SigningSubject=Read-Host 'Očekivani code-signing subject izdavača'}
if(!$SigningThumbprint){$SigningThumbprint=Read-Host 'Očekivani code-signing thumbprint izdavača'}
$SigningThumbprint=$SigningThumbprint.Replace(' ','').Trim()
if(!$SigningSubject -or $SigningThumbprint -notmatch '^[a-fA-F0-9]{40}$'){throw 'Unesite odobreni subject i SHA-1 thumbprint code-signing sertifikata.'}
$bootstrap=Get-AuthenticodeSignature -LiteralPath (Join-Path $PSScriptRoot 'client-management.ps1')
if($bootstrap.Status -ne 'Valid' -or $bootstrap.SignerCertificate.Subject -cne $SigningSubject -or $bootstrap.SignerCertificate.Thumbprint -ine $SigningThumbprint){throw 'Installer modul nema očekivani potpis izdavača.'}
. (Join-Path $PSScriptRoot 'client-management.ps1')
Assert-Administrator
$mutex=[Threading.Mutex]::new($false,'Global\GManager.Client.Deployment')
if(!(Enter-ClientMutex $mutex)){throw 'Instalacija ili ažuriranje je već u toku.'}
$addedCertificate=$null
try {
    if(!(Test-Path -LiteralPath (Join-Path $script:ClientState 'client.json')) -and (Get-Service GManagerClient -ErrorAction SilentlyContinue)){
        throw 'Zatečena je legacy instalacija bez originalnog policy journal-a. Administrator prvo mora vratiti prethodne lokalne AppLocker/Chrome/NTFS postavke iz sopstvene rezervne kopije; identitet.dpapi sačuvajte. Installer neće nagađati originalnu Windows politiku.'
    }
    # Load only the capability module covered by the expected publisher signature.
    $capabilityModule=Join-Path $PackageDirectory 'service\windows-enforcement.ps1'
    Assert-Signature $capabilityModule $SigningSubject $SigningThumbprint
    . $capabilityModule
    $capabilities=Get-GManagerWindowsCapabilities
    Write-Host "Windows $($capabilities.Edition), build $($capabilities.Build).$($capabilities.Revision)"
    Assert-GManagerWindowsCapabilities $capabilities
    if(!$PlayerAccount){$PlayerAccount=Read-Host 'Postojeći standardni lokalni Windows nalog igrača'}
    $player=Get-LocalUser -Name $PlayerAccount
    if(!$player.Enabled){throw 'Windows nalog igrača mora biti aktivan.'}
    $admins=Get-LocalGroupMember -SID 'S-1-5-32-544'
    if($player.SID.Value -in @($admins.SID.Value)){throw 'Nalog igrača ne sme biti lokalni administrator.'}
    if([Security.Principal.WindowsIdentity]::GetCurrent().User.Value -eq $player.SID.Value){throw 'Instalaciju pokrenite iz zasebnog administratorskog naloga.'}
    Write-Host 'G-MANAGER · Server Configuration'
    if(!$PolicySigningPublicKey){$PolicySigningPublicKey=Read-Host 'Odobreni javni Ed25519 policy ključ (Base64)'}
    if(!$PolicySigningKeyId){$PolicySigningKeyId=Read-Host 'Policy signing key ID'}
    if(!$PolicySigningKeyId){throw 'Policy key ID je obavezan.'}
    if(([Convert]::FromBase64String($PolicySigningPublicKey)).Length -ne 44){
    	throw 'Ed25519 X.509/SPKI javni ključ mora imati 44 bajta.'
	}
    $PackageDirectory=(Resolve-Path -LiteralPath $PackageDirectory).Path
    $manifest=Assert-Package $PackageDirectory $SigningSubject $SigningThumbprint
    Assert-ReleaseCompatibility $manifest $capabilities.Build
    $existingConfigPath=Join-Path $script:ClientState 'client.json'
    if(Test-Path -LiteralPath $existingConfigPath){
        $installedConfig=Read-ClientConfig
        if($installedConfig.Package.SigningThumbprint -ine $SigningThumbprint){
            $uninstallPath=Join-Path $script:ClientState 'uninstall.json'
            if((Get-Service GManagerClient -ErrorAction SilentlyContinue) -or !(Test-Path -LiteralPath $uninstallPath) -or (Get-Content -Encoding UTF8 -LiteralPath $uninstallPath -Raw|ConvertFrom-Json).phase -ne 'Complete'){throw 'Promena signing sertifikata zahteva uninstall bez -PurgeData, zatim instalaciju novog pouzdanog izdanja. Identitet ostaje sačuvan.'}
        }
    }
    $architecture=(Get-CimInstance Win32_Processor|Select-Object -First 1).Architecture
    if(![Environment]::Is64BitProcess -or ($manifest.runtime -eq 'win-x64' -and $architecture -ne 9) -or ($manifest.runtime -eq 'win-arm64' -and $architecture -ne 12) -or $manifest.runtime -notin @('win-x64','win-arm64')){throw 'Arhitektura paketa ne odgovara Windows-u. Koristite 64-bitni PowerShell i odgovarajući win-x64/win-arm64 release.'}
    New-ProtectedDirectory (Split-Path $script:ClientState -Parent)
    New-ProtectedDirectory $script:ClientState
    Write-AtomicJson (Join-Path $script:ClientState 'windows-capabilities.json') $capabilities
    Write-Operation 'INSTALL_BEGIN' 'LOCAL_ADMIN'
    if(!$BackendUrl){$BackendUrl=Read-Host 'HTTPS adresa G-Manager servera'}
    $backend=Assert-Https $BackendUrl
    if(!$backend.AbsoluteUri.EndsWith('/')){$backend=[uri]($backend.AbsoluteUri+'/')}
    if($LocalCaCertificate){
        if([Security.Cryptography.X509Certificates.X509Certificate2]::GetCertContentType([IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $LocalCaCertificate).Path)) -ne [Security.Cryptography.X509Certificates.X509ContentType]::Cert){throw 'Dozvoljen je samo javni CA sertifikat; PFX i privatni ključevi nisu dozvoljeni.'}
        $certificate=[Security.Cryptography.X509Certificates.X509Certificate2]::new((Resolve-Path -LiteralPath $LocalCaCertificate).Path)
        $ownedCaPath=Join-Path $script:ClientState 'installed-ca.json'
        if(Test-Path -LiteralPath $ownedCaPath){$ownedCa=Get-Content -Encoding UTF8 -LiteralPath $ownedCaPath -Raw|ConvertFrom-Json;if($ownedCa.phase -ne 'Removed' -and $ownedCa.thumbprint -ine $certificate.Thumbprint){throw 'Rotacija lokalnog CA zahteva prethodnu deinstalaciju bez brisanja identiteta, pa novu instalaciju.'}}
        $sha=[Security.Cryptography.SHA256]::Create();try{$actual=([BitConverter]::ToString($sha.ComputeHash($certificate.RawData))).Replace('-','')}finally{$sha.Dispose()}
        if(!$ExpectedCaSha256 -or $actual -ine $ExpectedCaSha256.Replace(':','')){throw 'SHA-256 fingerprint lokalnog CA sertifikata se ne podudara.'}
        $constraints=$certificate.Extensions|Where-Object { $_.Oid.Value -eq '2.5.29.19' }
        if(!$constraints -or !$constraints.CertificateAuthority -or $certificate.Subject -ne $certificate.Issuer -or $certificate.NotAfter -lt (Get-Date)){throw 'Datoteka nije važeći root CA sertifikat.'}
        if(!(Test-Path -LiteralPath "Cert:\LocalMachine\Root\$($certificate.Thumbprint)")){
            $confirmation=Read-Host "Uvoz CA '$($certificate.Subject)' omogućava poverenje svim sertifikatima koje izdaje. Za potvrdu unesite SHA-256 $actual"
            if($confirmation.Replace(':','') -ine $actual){throw 'Administratorska potvrda uvoza CA nije data.'}
            $addedCertificate=$certificate.Thumbprint
            Write-AtomicJson (Join-Path $script:ClientState 'installed-ca.json') @{thumbprint=$addedCertificate;sha256=$ExpectedCaSha256;phase='Pending'}
            Import-Certificate -FilePath $LocalCaCertificate -CertStoreLocation Cert:\LocalMachine\Root|Out-Null
        }
    }
    # This request uses normal OS TLS validation, without redirects or callback bypasses.
    [void](Get-HttpsJson ([uri]::new($backend,'api/v1/stations/client-package').AbsoluteUri))
    Trust-PackagePublisher $PackageDirectory $SigningSubject $SigningThumbprint
    Resolve-ClientTransaction
    $config=@{Client=@{Mode='Production';Version=$manifest.version;PlayerSid=$player.SID.Value;PlayerAccount=$PlayerAccount;InstallRoot=$script:ClientRoot};Backend=@{BaseUrl=$backend.AbsoluteUri};Policy=@{SigningKeyId=$PolicySigningKeyId;SigningPublicKey=$PolicySigningPublicKey};Package=@{SigningSubject=$SigningSubject;SigningThumbprint=$SigningThumbprint};Logging=@{LogLevel=@{Default='Warning'}}}
    if(Test-Path -LiteralPath (Join-Path $script:ClientState 'client.json')){
        $previous=Read-ClientConfig
        if($previous.Client.PlayerSid -ne $player.SID.Value -or $previous.Backend.BaseUrl -ne $backend.AbsoluteUri){throw 'Promena naloga ili servera zahteva zasebnu administratorsku migraciju identiteta.'}
    }
    Save-RecoveryTools $PackageDirectory $SigningSubject $SigningThumbprint
    Register-RecoveryTasks
    Write-Host 'G-MANAGER · Installation'
    Install-ClientFiles $PackageDirectory $config
    if(!(Get-Service GManagerClient -ErrorAction SilentlyContinue)){
        New-Service -Name GManagerClient -BinaryPathName ('"'+(Join-Path $script:ClientRoot 'service\GManager.Client.Service.exe')+'"') -StartupType Automatic -DisplayName 'G-Manager Gaming Client'|Out-Null
    }
    # The system policy broker runs as SYSTEM. Games are launched only by the standard-account Shell.
    Invoke-Native 'sc.exe' @('config','GManagerClient','obj=','LocalSystem','start=','auto')
    Invoke-Native 'sc.exe' @('failure','GManagerClient','reset=','86400','actions=','restart/5000/restart/15000/restart/60000')
    Invoke-Native 'sc.exe' @('sdset','GManagerClient','D:(A;;CCLCSWRPWPDTLOCRRC;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)(A;;CCLCSWLOCRRC;;;BU)')
    if(!(Test-Path -LiteralPath (Join-Path $script:ClientState 'identity.dpapi'))){
        Write-Host 'G-MANAGER · Station Enrollment'
        $secret=$EnrollmentToken;if(!$secret){$secret=Read-Host 'Jednokratni enrollment token' -AsSecureString}
        $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
        try{
            $info=[Diagnostics.ProcessStartInfo]::new((Join-Path $script:ClientRoot 'service\GManager.Client.Service.exe'),'--enroll-stdin');$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true
            $process=[Diagnostics.Process]::Start($info)
            try{$process.StandardInput.WriteLine([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr));$process.StandardInput.Close();if(!$process.WaitForExit(30000)){$process.Kill();throw 'Enrollment nije završen na vreme.'};if($process.ExitCode -ne 0){throw 'Enrollment nije uspeo; proverite server, token i signing konfiguraciju.'}}finally{$process.Dispose()}
        }finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr);$secret.Dispose()}
    }
    Write-AtomicJson (Join-Path $script:ClientState 'allowed-paths.json') @()
    Invoke-Policy 'Apply'
    $shellAction=New-ScheduledTaskAction -Execute (Join-Path $script:ClientRoot 'shell\GManager.Client.Shell.exe')
    $shellTrigger=New-ScheduledTaskTrigger -AtLogOn -User "$env:COMPUTERNAME\$PlayerAccount"
    $shellPrincipal=New-ScheduledTaskPrincipal -UserId $player.SID.Value -LogonType Interactive -RunLevel Limited
    $shellSettings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName 'GManagerClientShell' -Action $shellAction -Trigger $shellTrigger -Principal $shellPrincipal -Settings $shellSettings -Force|Out-Null
    $updateAction=New-ScheduledTaskAction -Execute $script:PowerShell -Argument "-NoProfile -NonInteractive -ExecutionPolicy AllSigned -File `"$(Join-Path $script:ClientState 'recovery\update-client.ps1')`" -Automatic"
    $updateTrigger=New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Minutes 15)
    Register-ScheduledTask -TaskName 'GManagerClientUpdate' -Action $updateAction -Trigger $updateTrigger -User SYSTEM -RunLevel Highest -Force|Out-Null
    Start-ClientService
    Write-Host 'G-MANAGER · Verification'
    Assert-Healthy -RequireConnected
    Write-AtomicJson (Join-Path $script:ClientState 'update-status.json') @{status='CURRENT';timestamp=[DateTimeOffset]::UtcNow.ToString('o')}
    $caRecord=Join-Path $script:ClientState 'installed-ca.json'
    if(Test-Path -LiteralPath $caRecord){$ownedCa=Get-Content -Encoding UTF8 -LiteralPath $caRecord -Raw|ConvertFrom-Json;if($ownedCa.phase -eq 'Pending'){$ownedCa.phase='Added';Write-AtomicJson $caRecord $ownedCa}}
    $publisherPath=Join-Path $script:ClientState 'publisher.json'
    if(Test-Path -LiteralPath $publisherPath){$publisher=Get-Content -Encoding UTF8 -LiteralPath $publisherPath -Raw|ConvertFrom-Json;if($publisher.phase -eq 'Pending'){$publisher.phase='Added';Write-AtomicJson $publisherPath $publisher}}
    Write-Operation 'INSTALL_COMPLETE' $manifest.version
    $journal=Get-Content -Encoding UTF8 -LiteralPath (Join-Path $script:ClientState 'deployment.json') -Raw|ConvertFrom-Json;$journal.phase='Complete';Write-AtomicJson (Join-Path $script:ClientState 'deployment.json') $journal
    Start-ScheduledTask -TaskName 'GManagerClientShell' -ErrorAction SilentlyContinue
    Write-Host "G-MANAGER · Finish. Instalacija je završena. Za upravljanje: `"$script:ClientRoot\gmanagerctl.cmd`" status"
}catch{
    $failure=$_
    if(Test-Path -LiteralPath (Join-Path $script:ClientState 'deployment.json')){try{Resolve-ClientTransaction}catch{Write-Warning 'Rollback nije završen. Koristite ProgramData\GManager\Client\recovery\gmanagerctl.ps1 repair -Recovery.'}}
    $caRecord=Join-Path $script:ClientState 'installed-ca.json'
    if(Test-Path -LiteralPath $caRecord){$ownedCa=Get-Content -Encoding UTF8 -LiteralPath $caRecord -Raw|ConvertFrom-Json;if($ownedCa.phase -eq 'Pending'){Remove-OwnedCa}}
    $publisherPath=Join-Path $script:ClientState 'publisher.json'
    if(Test-Path -LiteralPath $publisherPath){$publisher=Get-Content -Encoding UTF8 -LiteralPath $publisherPath -Raw|ConvertFrom-Json;if($publisher.phase -eq 'Pending'){Remove-OwnedPublisher}}
    if(Test-Path -LiteralPath $script:ClientState){Write-Operation 'INSTALL_FAILED' $failure.Exception.GetType().Name}
    throw $failure
}finally{$mutex.ReleaseMutex();$mutex.Dispose()}
