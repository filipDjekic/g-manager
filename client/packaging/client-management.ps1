# Shared implementation. This file and all production scripts must be Authenticode signed at release.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$script:ClientRoot=Join-Path ([Environment]::GetFolderPath('ProgramFiles')) 'GManager Client'
$script:ClientState=Join-Path ([Environment]::GetFolderPath('CommonApplicationData')) 'GManager\Client'
$script:PowerShell=Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
function Assert-Administrator {
    if(!([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Otvorite CMD ili PowerShell kao administrator (Run as administrator / UAC).'}
}
function Enter-ClientMutex($Mutex,[int]$Timeout=0) {
    try{return $Mutex.WaitOne($Timeout)}catch [Threading.AbandonedMutexException]{return $true}
}
function Assert-NoReparse([string]$Path) {
    $item=[IO.Path]::GetFullPath($Path)
    while($item){if(Test-Path -LiteralPath $item){if((Get-Item -LiteralPath $item -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw "Reparse putanja nije dozvoljena: $item"}};$parent=Split-Path -Path $item -Parent;if($parent -eq $item){break};$item=$parent}
}
function New-ProtectedDirectory([string]$Path,[switch]$Readable) {
    Assert-NoReparse $Path
    $acl=New-Object Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true,$false)
    foreach($sid in @('S-1-5-18','S-1-5-32-544')){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))}
    if($Readable){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-32-545'),'ReadAndExecute','ContainerInherit,ObjectInherit','None','Allow'))}
    $acl.SetOwner([Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'))
    if(!(Test-Path -LiteralPath $Path)){[IO.DirectoryInfo]::new($Path).Create($acl)}else{Set-Acl -LiteralPath $Path -AclObject $acl}
}
function Write-AtomicJson([string]$Path,$Value) {
    Assert-NoReparse $Path
    $bytes=[Text.UTF8Encoding]::new($false).GetBytes((ConvertTo-Json -InputObject $Value -Depth 30))
    $stream=[IO.FileStream]::new($Path+'.tmp',[IO.FileMode]::Create,[IO.FileAccess]::Write,[IO.FileShare]::None,4096,[IO.FileOptions]::WriteThrough)
    try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
    for($attempt=0;;$attempt++){
        try{if(Test-Path -LiteralPath $Path){[IO.File]::Replace($Path+'.tmp',$Path,$null)}else{[IO.File]::Move($Path+'.tmp',$Path)};break}
        catch [IO.IOException]{if($attempt -ge 9){throw};Start-Sleep -Milliseconds 25}
    }
}
function Read-ClientConfig { Get-Content -LiteralPath (Join-Path $script:ClientState 'client.json') -Raw|ConvertFrom-Json }
function Write-Operation([string]$Operation,[string]$Result) {
    $record=@{timestamp=[DateTimeOffset]::UtcNow.ToString('o');eventCode=$Operation;state=$Result;actor=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value}|ConvertTo-Json -Compress
    Add-Content -LiteralPath (Join-Path $script:ClientState 'management.jsonl') -Value $record -Encoding UTF8
}
function Invoke-Native([string]$File,[string[]]$Arguments) { & $File @Arguments | Out-Host;if($LASTEXITCODE -ne 0){throw "Windows komanda nije uspela: $File (kod $LASTEXITCODE)"} }
function Invoke-ClientPipe([string]$Type,[switch]$Admin) {
    $name='GManager.Client';if($Admin){$name+='.Admin'}
    $pipe=[IO.Pipes.NamedPipeClientStream]::new('.',$name,[IO.Pipes.PipeDirection]::InOut,[IO.Pipes.PipeOptions]::Asynchronous,[Security.Principal.TokenImpersonationLevel]::Impersonation)
    $reader=$null;$writer=$null
    try{
        $pipe.Connect(3000)
        if(-not ('GManager.PipePeer' -as [type])){
            Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; namespace GManager { public static class PipePeer { [DllImport("kernel32.dll",SetLastError=true)] public static extern bool GetNamedPipeServerProcessId(IntPtr pipe,out uint pid); } }'
        }
        [uint32]$serverPid=0
        $service=Get-CimInstance Win32_Service -Filter "Name='GManagerClient'"
        if(!$service -or ![GManager.PipePeer]::GetNamedPipeServerProcessId($pipe.SafePipeHandle.DangerousGetHandle(),[ref]$serverPid) -or $service.ProcessId -ne $serverPid -or $service.State -ne 'Running'){throw 'Lokalni IPC server nije instalirani G-Manager Windows servis.'}
        $reader=[IO.StreamReader]::new($pipe,[Text.UTF8Encoding]::new($false),$false,4096,$true)
        $writer=[IO.StreamWriter]::new($pipe,[Text.UTF8Encoding]::new($false),4096,$true);$writer.AutoFlush=$true
        $writer.WriteLine((@{Type=$Type;RequestId=[guid]::NewGuid().ToString('N')}|ConvertTo-Json -Compress))
        $read=$reader.ReadLineAsync();if(!$read.Wait(15000)){throw 'Lokalni servis nije odgovorio na vreme.'}
        $result=$read.Result|ConvertFrom-Json
        if(!$result.Success){throw $result.Error}
        return $result
    }finally{if($reader){$reader.Dispose()};if($writer){$writer.Dispose()};$pipe.Dispose()}
}
function Assert-Https([string]$Url) {
    $uri=[uri]$Url
    if(!$uri.IsAbsoluteUri -or $uri.Scheme -ne 'https' -or $uri.UserInfo -or $uri.Fragment){throw 'Adresa mora biti apsolutni HTTPS URL bez kredencijala.'}
    return $uri
}
function Get-HttpsJson([string]$Url) {
    [void](Assert-Https $Url)
    Invoke-RestMethod -Uri $Url -UseBasicParsing -MaximumRedirection 0 -TimeoutSec 20
}
function Get-HttpsFile([string]$Url,[string]$Output) {
    [void](Assert-Https $Url)
    Invoke-WebRequest -Uri $Url -OutFile $Output -UseBasicParsing -MaximumRedirection 0 -TimeoutSec 120
}
function Assert-Signature([string]$Path,[string]$Subject,[string]$Thumbprint) {
    $sig=Get-AuthenticodeSignature -LiteralPath $Path
    if($sig.Status -ne 'Valid' -or !$sig.SignerCertificate -or $sig.SignerCertificate.Subject -cne $Subject -or $sig.SignerCertificate.Thumbprint -ine $Thumbprint){throw "Nevažeći ili nepouzdan digitalni potpis: $([IO.Path]::GetFileName($Path))"}
}
function Assert-Package([string]$Directory,[string]$Subject,[string]$Thumbprint) {
    Assert-NoReparse $Directory
    $manifestPath=Join-Path $Directory 'release.json'
    $signaturePath=Join-Path $Directory 'release.p7s'
    Add-Type -AssemblyName System.Security
    $cms=[Security.Cryptography.Pkcs.SignedCms]::new([Security.Cryptography.Pkcs.ContentInfo]::new([IO.File]::ReadAllBytes($manifestPath)),$true)
    $cms.Decode([IO.File]::ReadAllBytes($signaturePath));$cms.CheckSignature($false)
    if($cms.SignerInfos.Count -ne 1 -or $cms.SignerInfos[0].Certificate.Subject -cne $Subject -or $cms.SignerInfos[0].Certificate.Thumbprint -ine $Thumbprint){throw 'Release manifest nema očekivani potpis izdavača.'}
    $manifest=Get-Content -LiteralPath $manifestPath -Raw|ConvertFrom-Json
    if($manifest.mode -ne 'Production' -or $manifest.version -notmatch '^\d+\.\d+\.\d+(\.\d+)?$'){throw 'Produkcioni paket ne sme sadržati development konfiguraciju.'}
    $expected=@('release.json','release.p7s')
    foreach($item in Get-ChildItem -LiteralPath $Directory -Recurse -Force){Assert-NoReparse $item.FullName}
    foreach($entry in $manifest.files){
        if([IO.Path]::IsPathRooted($entry.path) -or $entry.path -match '(^|[\\/])\.\.([\\/]|$)|:'){throw 'Neispravna putanja u manifestu.'}
        $path=Join-Path $Directory $entry.path;Assert-NoReparse $path
        if((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ine $entry.sha256){throw "SHA-256 se ne podudara: $($entry.path)"}
        if([IO.Path]::GetExtension($path) -in @('.exe','.ps1') -or [IO.Path]::GetFileName($path) -like 'GManager.*.dll'){Assert-Signature $path $Subject $Thumbprint}
        if($entry.path.Replace('/','\') -in $expected){throw 'Manifest sadrži dupliranu putanju.'}
        $expected+= $entry.path.Replace('/','\')
    }
    foreach($file in Get-ChildItem -LiteralPath $Directory -Recurse -File){Assert-NoReparse $file.FullName;$relative=$file.FullName.Substring($Directory.TrimEnd('\').Length+1);if($relative -notin $expected){throw "Datoteka nije navedena u potpisanom manifestu: $relative"}}
    foreach($required in @('service\GManager.Client.Service.exe','shell\GManager.Client.Shell.exe','service\apply-policy.ps1','gmanagerctl.ps1','client-management.ps1','update-client.ps1','uninstall-service.ps1','GManager-Setup.ps1','gmanagerctl.cmd')){if($required -notin $expected){throw "Nedostaje obavezna datoteka: $required"}}
    $settings=Get-Content -LiteralPath (Join-Path $Directory 'service\appsettings.json') -Raw|ConvertFrom-Json
    if($settings.Client.Mode -ne 'Production' -or $settings.Client.Version -ne $manifest.version){throw 'Release konfiguracija nije produkciona.'}
    return $manifest
}
function Expand-ClientPackage([string]$Archive,[string]$Directory) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip=[IO.Compression.ZipFile]::OpenRead($Archive)
    try{
        $seen=@{};[long]$size=0
        foreach($entry in $zip.Entries){$name=$entry.FullName.Replace('/','\');$size+=$entry.Length
            if($name -match '(^|\\)\.\.($|\\)|:|^[\\/]|[. ]($|\\)' -or $seen.ContainsKey($name.ToLowerInvariant()) -or $size -gt 4GB -or (($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000){throw 'Paket sadrži nedozvoljene putanje, linkove ili je prevelik.'};$seen[$name.ToLowerInvariant()]=$true
        }
    }finally{$zip.Dispose()}
    Expand-Archive -LiteralPath $Archive -DestinationPath $Directory
}
function Remove-ClientTree([string]$Path) {
    $full=[IO.Path]::GetFullPath($Path).TrimEnd('\')
    $allowed=@($script:ClientRoot,($script:ClientRoot+'.candidate'),($script:ClientRoot+'.previous'),(Join-Path $script:ClientState 'downloads'),(Join-Path $script:ClientState 'repair-source'))
    if($full -notin $allowed){throw "Brisanje nije dozvoljeno izvan instalacionih direktorijuma: $full"}
    Assert-NoReparse $full
    if(Test-Path -LiteralPath $full){foreach($item in Get-ChildItem -LiteralPath $full -Recurse -Force){Assert-NoReparse $item.FullName};Remove-Item -LiteralPath $full -Recurse -Force}
}
function Stop-ClientShell {
    foreach($process in Get-Process -Name 'GManager.Client.Shell' -ErrorAction SilentlyContinue){if($process.Path -eq (Join-Path $script:ClientRoot 'shell\GManager.Client.Shell.exe')){Stop-Process -Id $process.Id -Force -ErrorAction Stop;if(!$process.WaitForExit(10000)){throw 'Shell se nije zaustavio na vreme.'}}}
}
function Stop-ClientService([switch]$Force) {
    $service=Get-Service GManagerClient -ErrorAction SilentlyContinue
    if(!$service){return}
    if($Force){Set-Service GManagerClient -StartupType Disabled}
    if($service.Status -eq 'Stopped'){return}
    $record=Get-CimInstance Win32_Service -Filter "Name='GManagerClient'"
    & sc.exe stop GManagerClient|Out-Null
    try{$service.WaitForStatus([ServiceProcess.ServiceControllerStatus]::Stopped,[TimeSpan]::FromSeconds(20))}
    catch{
        if(!$Force){throw 'Servis se nije zaustavio. Koristite administratorski repair -Recovery.'}
        $process=Get-Process -Id $record.ProcessId -ErrorAction SilentlyContinue
        if($process){if($process.Path -ne (Join-Path $script:ClientRoot 'service\GManager.Client.Service.exe')){throw 'Recovery odbija zaustavljanje nepoznatog SYSTEM procesa.'};Stop-Process -Id $process.Id -Force;if(!$process.WaitForExit(10000)){throw 'Client proces ne može biti bezbedno zaustavljen.'}}
        $service.Refresh()
        $service.WaitForStatus([ServiceProcess.ServiceControllerStatus]::Stopped,[TimeSpan]::FromSeconds(10))
        Write-Operation 'SERVICE_FORCE_STOP' 'LOCAL_RECOVERY'
    }
}
function Start-ClientService {
    Set-Service GManagerClient -StartupType Automatic
    Start-Service GManagerClient
}
function Invoke-Policy([string]$Action) {
    $scriptPath=Join-Path $script:ClientState 'recovery\apply-policy.ps1'
    Invoke-Native $script:PowerShell @('-NoProfile','-NonInteractive','-ExecutionPolicy','AllSigned','-File',$scriptPath,'-Action',$Action,'-StateDirectory',$script:ClientState)
}
function Get-Maintenance {
    $path=Join-Path $script:ClientState 'maintenance.json'
    if(!(Test-Path -LiteralPath $path)){return $false}
    return [DateTimeOffset]::Parse((Get-Content -LiteralPath $path -Raw|ConvertFrom-Json).ExpiresAt) -gt [DateTimeOffset]::UtcNow
}
function Register-RecoveryTasks {
    $cli=Join-Path $script:ClientState 'recovery\gmanagerctl.ps1'
    $action=New-ScheduledTaskAction -Execute $script:PowerShell -Argument "-NoProfile -NonInteractive -ExecutionPolicy AllSigned -File `"$cli`" watchdog"
    $trigger=New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
    $boot=New-ScheduledTaskTrigger -AtStartup
    $settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
    Register-ScheduledTask -TaskName 'GManagerClientRecovery' -Action $action -Trigger @($trigger,$boot) -Settings $settings -User 'SYSTEM' -RunLevel Highest -Force|Out-Null
}
function Register-MaintenanceExpiry([DateTimeOffset]$Expiry) {
    $action=New-ScheduledTaskAction -Execute $script:PowerShell -Argument "-NoProfile -NonInteractive -ExecutionPolicy AllSigned -File `"$(Join-Path $script:ClientState 'recovery\gmanagerctl.ps1')`" watchdog"
    $trigger=New-ScheduledTaskTrigger -Once -At $Expiry.LocalDateTime
    $settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName 'GManagerClientMaintenanceExpiry' -Action $action -Trigger $trigger -Settings $settings -User SYSTEM -RunLevel Highest -Force|Out-Null
}
function Save-RecoveryTools([string]$PackageDirectory,[string]$Subject,[string]$Thumbprint) {
    $recovery=Join-Path $script:ClientState 'recovery';New-ProtectedDirectory $recovery
    foreach($name in @('client-management.ps1','gmanagerctl.ps1','update-client.ps1','uninstall-service.ps1','support-bundle.ps1')){Copy-Item -LiteralPath (Join-Path $PackageDirectory $name) -Destination $recovery -Force}
    Copy-Item -LiteralPath (Join-Path $PackageDirectory 'service\apply-policy.ps1') -Destination $recovery -Force
    foreach($file in Get-ChildItem -LiteralPath $recovery -Filter '*.ps1'){Assert-Signature $file.FullName $Subject $Thumbprint}
}
function Resolve-ClientTransaction {
    $path=Join-Path $script:ClientState 'deployment.json'
    if(!(Test-Path -LiteralPath $path)){return}
    $journal=Get-Content -LiteralPath $path -Raw|ConvertFrom-Json
    if($journal.phase -in @('Complete','RolledBack')){return}
    Write-Operation 'DEPLOYMENT_RECOVERY' $journal.phase
    Stop-ClientShell
    Stop-ClientService -Force
    $previous=$script:ClientRoot+'.previous';$candidate=$script:ClientRoot+'.candidate'
    Assert-NoReparse $previous;Assert-NoReparse $candidate;Assert-NoReparse $script:ClientRoot
    if(Test-Path -LiteralPath $previous){Remove-ClientTree $script:ClientRoot;Move-Item -LiteralPath $previous -Destination $script:ClientRoot}
    elseif(!$journal.hadInstallation){
        Remove-ClientTree $script:ClientRoot
        foreach($name in @('GManagerClientShell','GManagerClientUpdate','GManagerClientRecovery','GManagerClientMaintenanceExpiry')){Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue}
        if(Get-Service GManagerClient -ErrorAction SilentlyContinue){Invoke-Native 'sc.exe' @('delete','GManagerClient')}
        if(Test-Path -LiteralPath (Join-Path $script:ClientState 'policy-journal.json')){Invoke-Policy 'Remove'}
    }
    Remove-ClientTree $candidate
    if($journal.previousConfig){Write-AtomicJson (Join-Path $script:ClientState 'client.json') $journal.previousConfig}
    foreach($entry in $journal.tasks.PSObject.Properties){Register-ScheduledTask -TaskName $entry.Name -Xml $entry.Value -Force|Out-Null}
    $journal.phase='RolledBack';Write-AtomicJson $path $journal
    if($journal.hadInstallation){Start-ClientService}
    Write-AtomicJson (Join-Path $script:ClientState 'update-status.json') @{status='ROLLED_BACK';timestamp=[DateTimeOffset]::UtcNow.ToString('o')}
}
function Assert-Healthy {
    $until=[DateTime]::UtcNow.AddSeconds(45)
    $expectedVersion=(Read-ClientConfig).Client.Version
    do{
        $healthPath=Join-Path $script:ClientState 'health.json'
        if((Get-Service GManagerClient -ErrorAction SilentlyContinue).Status -eq 'Running' -and (Test-Path -LiteralPath $healthPath)){
            $health=Get-Content -LiteralPath $healthPath -Raw|ConvertFrom-Json
            if([DateTimeOffset]::Parse($health.timestamp) -gt [DateTimeOffset]::UtcNow.AddSeconds(-5) -and $health.initialized -and $health.version -eq $expectedVersion -and !$health.development -and $health.errorCode -in @($null,'BACKEND_UNAVAILABLE','BACKEND_TIMEOUT','SESSION_RECONCILIATION_REQUIRED')){return}
        }
        Start-Sleep -Seconds 1
    }while([DateTime]::UtcNow -lt $until)
    throw 'Servis nema svež, ispravan health signal. Pokrenut je rollback.'
}
function Install-ClientFiles([string]$PackageDirectory,$Config,[switch]$Recovery) {
    Resolve-ClientTransaction
    $candidate=$script:ClientRoot+'.candidate';$previous=$script:ClientRoot+'.previous'
    Remove-ClientTree $candidate;Remove-ClientTree $previous
    New-ProtectedDirectory $candidate -Readable
    Copy-Item -Path (Join-Path $PackageDirectory '*') -Destination $candidate -Recurse -Force
    [void](Assert-Package $candidate $Config.Package.SigningSubject $Config.Package.SigningThumbprint)
    $tasks=@{}
    foreach($name in @('GManagerClientShell','GManagerClientUpdate')){if(Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue){$tasks[$name]=Export-ScheduledTask -TaskName $name}}
    $journal=@{phase='Prepared';hadInstallation=(Test-Path -LiteralPath $script:ClientRoot);previousConfig=$null;tasks=$tasks}
    $configPath=Join-Path $script:ClientState 'client.json'
    if(Test-Path -LiteralPath $configPath){$journal.previousConfig=Read-ClientConfig}
    Write-AtomicJson (Join-Path $script:ClientState 'deployment.json') $journal
    try{
        if($Recovery){Stop-ClientService -Force;Stop-PlayerSessions $Config.Client.PlayerSid}
        elseif(Get-Service GManagerClient -ErrorAction SilentlyContinue){[void](Invoke-ClientPipe 'prepare-update' -Admin);Stop-ClientService}
        else{Stop-PlayerSessions $Config.Client.PlayerSid}
        Stop-ClientShell
        $journal.phase='Replacing';Write-AtomicJson (Join-Path $script:ClientState 'deployment.json') $journal
        Assert-NoReparse $script:ClientRoot;Assert-NoReparse $previous;Assert-NoReparse $candidate
        if(Test-Path -LiteralPath $script:ClientRoot){Move-Item -LiteralPath $script:ClientRoot -Destination $previous}
        Move-Item -LiteralPath $candidate -Destination $script:ClientRoot
        Write-AtomicJson $configPath $Config
        $journal.phase='Installed';Write-AtomicJson (Join-Path $script:ClientState 'deployment.json') $journal
    }catch{Resolve-ClientTransaction;throw}
}

function Stop-PlayerSessions([string]$PlayerSid) {
    if(!$PlayerSid){throw 'SID naloga igrača nije konfigurisan.'}
    if(-not ('GManager.NativeSessions' -as [type])){
        Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
namespace GManager {
 public static class NativeSessions {
  [DllImport("wtsapi32.dll",SetLastError=true)] public static extern bool WTSLogoffSession(IntPtr server,int session,bool wait);
 }
}
"@
    }
    $sessionIds=@()
    foreach($process in Get-CimInstance Win32_Process){
        if($process.SessionId -le 0){continue}
        $owner=Invoke-CimMethod -InputObject $process -MethodName GetOwnerSid -ErrorAction SilentlyContinue
        if($owner -and $owner.Sid -eq $PlayerSid){$sessionIds+=[int]$process.SessionId}
    }
    foreach($id in @($sessionIds|Select-Object -Unique)){
        if(![GManager.NativeSessions]::WTSLogoffSession([IntPtr]::Zero,$id,$true)){throw "Odjava Windows sesije igrača nije uspela (Win32 $([Runtime.InteropServices.Marshal]::GetLastWin32Error()))."}
    }
}

function Suspend-LocalSession {
    $path=Join-Path $script:ClientState 'snapshot.json'
    if(Test-Path -LiteralPath $path){
        $snapshot=Get-Content -LiteralPath $path -Raw|ConvertFrom-Json
        if($snapshot.Lease.SessionId){
            $snapshot|Add-Member -MemberType NoteProperty -Name BlockedSessionId -Value $snapshot.Lease.SessionId -Force
            $snapshot|Add-Member -MemberType NoteProperty -Name LocallyLocked -Value $true -Force
            Write-AtomicJson $path $snapshot
            Write-Operation 'SESSION_RECONCILIATION_REQUIRED' 'LOCAL_ADMIN'
        }
    }
}
function Remove-OwnedCa {
    $recordPath=Join-Path $script:ClientState 'installed-ca.json'
    if(!(Test-Path -LiteralPath $recordPath)){return}
    $record=Get-Content -LiteralPath $recordPath -Raw|ConvertFrom-Json
    if($record.phase -eq 'Removed'){return}
    if($record.thumbprint -notmatch '^[A-Fa-f0-9]{40}$'){throw 'Neispravna evidencija CA sertifikata.'}
    $path="Cert:\LocalMachine\Root\$($record.thumbprint)"
    if(Test-Path -LiteralPath $path){
        $cert=Get-Item -LiteralPath $path;$sha=[Security.Cryptography.SHA256]::Create()
        try{$hash=([BitConverter]::ToString($sha.ComputeHash($cert.RawData))).Replace('-','')}finally{$sha.Dispose()}
        if($hash -ine $record.sha256.Replace(':','')){throw 'CA sertifikat je promenjen nakon instalacije; zahteva administratorsko razrešenje.'}
        Remove-Item -LiteralPath $path -Force
    }
    $record.phase='Removed';Write-AtomicJson $recordPath $record
    Write-Operation 'LOCAL_CA_REMOVED' 'OWNED_CERTIFICATE_ONLY'
}
function Trust-PackagePublisher([string]$PackageDirectory,[string]$Subject,[string]$Thumbprint) {
    $file=Join-Path $PackageDirectory 'gmanagerctl.ps1';Assert-Signature $file $Subject $Thumbprint
    $certificate=(Get-AuthenticodeSignature -LiteralPath $file).SignerCertificate
    $store=[Security.Cryptography.X509Certificates.X509Store]::new('TrustedPublisher','LocalMachine')
    $store.Open([Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
    try{
        if($store.Certificates.Find([Security.Cryptography.X509Certificates.X509FindType]::FindByThumbprint,$Thumbprint,$false).Count -eq 0){
            Write-AtomicJson (Join-Path $script:ClientState 'publisher.json') @{thumbprint=$Thumbprint;phase='Pending'}
            $store.Add($certificate)
            Write-Operation 'PUBLISHER_TRUSTED' $Thumbprint
        }
    }finally{$store.Close()}
}
function Remove-OwnedPublisher {
    $path=Join-Path $script:ClientState 'publisher.json'
    if(!(Test-Path -LiteralPath $path)){return}
    $record=Get-Content -LiteralPath $path -Raw|ConvertFrom-Json
    if($record.phase -eq 'Removed'){return}
    if($record.thumbprint -notmatch '^[a-fA-F0-9]{40}$'){throw 'Neispravna evidencija izdavača.'}
    $cert="Cert:\LocalMachine\TrustedPublisher\$($record.thumbprint)"
    if(Test-Path -LiteralPath $cert){Remove-Item -LiteralPath $cert -Force}
    $record.phase='Removed';Write-AtomicJson $path $record
    Write-Operation 'PUBLISHER_REMOVED' 'OWNED_CERTIFICATE_ONLY'
}
function Repair-ClientFiles($Config) {
    try{[void](Assert-Package $script:ClientRoot $Config.Package.SigningSubject $Config.Package.SigningThumbprint);return}
    catch{Write-Operation 'REPAIR_FILES_REQUIRED' 'INTEGRITY_FAILED'}
    foreach($source in @(($script:ClientRoot+'.previous'),(Join-Path $script:ClientState 'downloads\package'))){
        if(!(Test-Path -LiteralPath $source)){continue}
        try{$manifest=Assert-Package $source $Config.Package.SigningSubject $Config.Package.SigningThumbprint}catch{continue}
        $repair=Join-Path $script:ClientState 'repair-source';Remove-ClientTree $repair;New-ProtectedDirectory $repair
        Copy-Item -Path (Join-Path $source '*') -Destination $repair -Recurse -Force
        [void](Assert-Package $repair $Config.Package.SigningSubject $Config.Package.SigningThumbprint)
        $Config.Client.Version=$manifest.version
        Install-ClientFiles $repair $Config -Recovery
        Write-Operation 'REPAIR_FILES_RESTORED' $manifest.version
        return
    }
    throw 'Nema potpune lokalne kopije sa pouzdanim potpisom. Pokrenite novi potpisani GManager-Setup paket; sačuvani identitet i administratorski recovery ostaju dostupni.'
}
