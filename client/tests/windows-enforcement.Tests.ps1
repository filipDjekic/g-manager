# Isolated contract tests: no AppLocker, account, service, task or system-registry mutations.
# Windows APIs are mocked below; these results do NOT certify physical enforcement.
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$client=Split-Path $PSScriptRoot -Parent
. (Join-Path $client 'src\GManager.Client.Service\windows-enforcement.ps1')
$script:passed=0
function Check([bool]$Condition,[string]$Message){if(!$Condition){throw $Message};$script:passed++}
function Reject([scriptblock]$Code,[string]$Message){$threw=$false;try{& $Code}catch{$threw=$true};Check $threw $Message}
foreach($file in Get-ChildItem -LiteralPath $client -Filter '*.ps1' -Recurse|Where-Object {$_.FullName -notmatch '\\(bin|obj|artifacts)\\'}){
    $tokens=$null;$parseErrors=$null
    $null=[Management.Automation.Language.Parser]::ParseFile($file.FullName,[ref]$tokens,[ref]$parseErrors)
    Check (@($parseErrors).Count -eq 0) ("Windows PowerShell 5.1 syntax: "+$file.Name+': '+($parseErrors -join '; '))
}
function Capabilities([string]$Edition='Core',[int]$Build=19045){
    return [pscustomobject]@{Edition=$Edition;Build=$Build;Revision=4046;BootTime='2026-11-02T00:00:00Z';ProductType=1;Is64Bit=$true;PowerShellMajor=5;MissingCommands=@();ApplicationIdentityAvailable=$true;PolicyReadable=$true;EventLogEnabled=$true;EnforcementVerified=$false}
}
foreach($edition in @('Core','CoreSingleLanguage','Professional','ProfessionalN','Enterprise','EnterpriseS','Education','IoTEnterprise')){
    foreach($build in @(19041,19045,22000,22631,26100)){
        $cap=Capabilities $edition $build;Assert-GManagerWindowsCapabilities $cap
        Check (!$cap.EnforcementVerified) "Edition/build must not imply physical enforcement: $edition/$build"
    }
}
foreach($property in @('ApplicationIdentityAvailable','PolicyReadable','EventLogEnabled','Is64Bit')){
    $cap=Capabilities;$cap.$property=$false
    Reject {Assert-GManagerWindowsCapabilities $cap} "Missing $property must fail closed"
}
$cap=Capabilities 'Enterprise' 18363;Reject {Assert-GManagerWindowsCapabilities $cap} 'Old Enterprise must fail'
$cap=Capabilities;$cap.MissingCommands=@('Set-AppLockerPolicy');Reject {Assert-GManagerWindowsCapabilities $cap} 'Missing policy writer must fail'
$cap=Capabilities;$cap.ProductType=3;Reject {Assert-GManagerWindowsCapabilities $cap} 'Server is not a supported workstation target'
$cap=Capabilities;$cap.PowerShellMajor=7;Reject {Assert-GManagerWindowsCapabilities $cap} 'Require native Windows PowerShell'
$cap=Capabilities
$config=[pscustomobject]@{Client=[pscustomobject]@{PlayerSid='S-1-5-21-1-2-3-1001';Version='1.2.3';InstallRoot='C:\Program Files\GManager Client'}}
$evidence=@{verified=$true;schema=1;playerSid=$config.Client.PlayerSid;clientVersion='1.2.3';bootTime=$cap.BootTime;build=$cap.Build;revision=$cap.Revision}
Assert-GManagerEnforcementEvidence $evidence $cap $config
foreach($field in @('verified','schema','playerSid','clientVersion','bootTime','build','revision')){
    $bad=$evidence.Clone();$bad[$field]=if($field -eq 'verified'){$false}else{'different'}
    Reject {Assert-GManagerEnforcementEvidence $bad $cap $config} "Stale or mismatched $field must not authorize session transitions"
}

# Check real ACL evaluation using raw SIDs, including unresolved/localized names,
# InheritOnly ACEs and the different replacement rights needed on ancestors.
$script:fileAcl=[Security.AccessControl.DirectorySecurity]::new()
$script:fileAcl.SetOwner([Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'))
$script:parentAcl=[Security.AccessControl.DirectorySecurity]::new()
$script:parentAcl.SetOwner([Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'))
$script:reparse=$false
function Get-Item {param($LiteralPath,[switch]$Force) return [pscustomobject]@{FullName=$LiteralPath;Attributes=$(if($script:reparse){[IO.FileAttributes]::ReparsePoint}else{[IO.FileAttributes]::Normal})}}
function Get-Acl {param($LiteralPath) if($LiteralPath.EndsWith('.exe')){return $script:fileAcl};return $script:parentAcl}
function Test-Path {param($LiteralPath) return $true}
try{
    Assert-GManagerProtectedPath 'C:\Games\game.exe'
    $user=[Security.Principal.SecurityIdentifier]::new('S-1-5-21-999-888-777-1001')
    $write=[Security.AccessControl.FileSystemAccessRule]::new($user,'WriteData','Allow')
    $script:fileAcl.AddAccessRule($write)
    Reject {Assert-GManagerProtectedPath 'C:\Games\game.exe'} 'Unresolvable user SID with write access must still be rejected'
    $script:fileAcl.RemoveAccessRuleSpecific($write)
    $inherited=[Security.AccessControl.FileSystemAccessRule]::new($user,'Modify','ContainerInherit,ObjectInherit','InheritOnly','Allow')
    $script:fileAcl.AddAccessRule($inherited)
    Assert-GManagerProtectedPath 'C:\Games\game.exe'
    $create=[Security.AccessControl.FileSystemAccessRule]::new($user,'CreateFiles','Allow')
    $script:parentAcl.AddAccessRule($create)
    Assert-GManagerProtectedPath 'C:\Games\game.exe'
    Reject {Assert-GManagerProtectedPath 'C:\Games' -Directory} 'A directory used as an application root must not be writable'
    $delete=[Security.AccessControl.FileSystemAccessRule]::new($user,'DeleteSubdirectoriesAndFiles','Allow')
    $script:parentAcl.AddAccessRule($delete)
    Reject {Assert-GManagerProtectedPath 'C:\Games\game.exe'} 'Ancestor replacement permission must be rejected'
    $script:parentAcl.RemoveAccessRuleSpecific($delete)
    $script:reparse=$true
    Reject {Assert-GManagerProtectedPath 'C:\Games\game.exe'} 'Reparse paths must be rejected'
}finally{Remove-Item Function:\Get-Item;Remove-Item Function:\Get-Acl;Remove-Item Function:\Test-Path}

$sid=$config.Client.PlayerSid
[xml]$policy='<AppLockerPolicy Version="1" />'
$artifact=Add-GManagerRestrictions $policy $sid @('C:\Games\game.exe') @('C:\Games\engine.dll')
Check ($policy.AppLockerPolicy.RuleCollection.Count -eq 5) 'All five collections must be enforced'
Assert-GManagerEffectivePolicy $policy $artifact.rules
foreach($type in @('Exe','Script','Msi','Dll','Appx')){
    $collection=$policy.SelectSingleNode("/AppLockerPolicy/RuleCollection[@Type='$type']")
    Check ($collection.EnforcementMode -eq 'Enabled') "Enabled $type"
    $deny=$collection.SelectSingleNode("*[@Action='Deny' and @UserOrGroupSid='$sid']")
    Check ($null -ne $deny) "Player deny required for $type"
    if($type -in @('Script','Msi','Appx')){Check ($null -eq $deny.SelectSingleNode('Exceptions')) "$type must not have escape exceptions"}
}
Check (!$policy.OuterXml.Contains('*.exe')) 'No wildcard executable exception'
$journal=@{owned=@($artifact.rules.Keys);pending=@();modes=$artifact.modes;ruleXml=$artifact.rules}
Remove-GManagerOwnedRules $policy $journal
Check ($policy.AppLockerPolicy.ChildNodes.Count -eq 0) 'Uninstall must remove newly created empty collections'
Remove-GManagerOwnedRules $policy $journal # Restore after interrupted uninstall must be idempotent.

# Foreign rules survive apply, maintenance suspend, reinstall, update rollback and uninstall.
$foreignId=[guid]::NewGuid().ToString()
$foreign="<AppLockerPolicy Version='1'><RuleCollection Type='Exe' EnforcementMode='Enabled'><FilePathRule Id='$foreignId' Name='Foreign' Description='' UserOrGroupSid='S-1-1-0' Action='Allow'><Conditions><FilePathCondition Path='*'/></Conditions></FilePathRule></RuleCollection></AppLockerPolicy>"
foreach($scenario in @('Install','Reinstall','Maintenance','Recovery','UpdateRollback','Uninstall')){
    [xml]$policy=$foreign
    $artifact=Add-GManagerRestrictions $policy $sid @('C:\Games\game.exe') @('C:\Games\engine.dll')
    $journal=@{owned=@($artifact.rules.Keys);pending=@();modes=$artifact.modes;ruleXml=$artifact.rules}
    # A broad foreign Allow cannot remove our explicit player Deny.
    Check ($null -ne $policy.SelectSingleNode("/AppLockerPolicy/RuleCollection[@Type='Exe']/*[@Action='Deny' and @UserOrGroupSid='$sid']")) "$scenario deny precedence"
    Remove-GManagerOwnedRules $policy $journal
    Check ((ConvertTo-GManagerCanonicalRule $policy.OuterXml) -eq (ConvertTo-GManagerCanonicalRule $foreign)) "$scenario must restore only owned changes"
}
foreach($mode in @('AuditOnly','NotConfigured')){
    [xml]$policy=$foreign.Replace("EnforcementMode='Enabled'","EnforcementMode='$mode'")
    Reject {Add-GManagerRestrictions $policy $sid @() @()} 'Do not enable foreign inactive rules'
}
[xml]$policy=$foreign
$artifact=Add-GManagerRestrictions $policy $sid @('C:\Games\game.exe') @()
$journal=@{owned=@();pending=@($artifact.rules.Keys);modes=$artifact.modes;ruleXml=$artifact.rules}
# Power loss between Set-AppLockerPolicy and committing owned IDs.
Remove-GManagerOwnedRules $policy $journal
Check ((ConvertTo-GManagerCanonicalRule $policy.OuterXml) -eq (ConvertTo-GManagerCanonicalRule $foreign)) 'Pending rule recovery'
[xml]$policy=$foreign
$artifact=Add-GManagerRestrictions $policy $sid @('C:\Games\game.exe') @()
$journal=@{owned=@($artifact.rules.Keys);pending=@();modes=$artifact.modes;ruleXml=$artifact.rules}
$id=@($artifact.rules.Keys)[0]
$node=$policy.SelectSingleNode("/AppLockerPolicy/RuleCollection/*[@Id='$id']")
$node.SetAttribute('Name','Changed by another administrator')
Reject {Remove-GManagerOwnedRules $policy $journal} 'Do not delete externally changed owned rules'
Reject {Assert-GManagerEffectivePolicy $policy $artifact.rules} 'Effective rule tampering must fail'
[xml]$policy=$foreign
$artifact=Add-GManagerRestrictions $policy $sid @() @()
$policy.AppLockerPolicy.RuleCollection[0].SetAttribute('EnforcementMode','AuditOnly')
Reject {Assert-GManagerEffectivePolicy $policy $artifact.rules} 'AuditOnly effective policy must fail'
Reject {Assert-GManagerEffectivePolicy ([xml]$foreign) $artifact.rules} 'Local success without effective rules must fail'

# The physical probe orchestration must distinguish a denied start, a successful probe,
# an unrelated launch error, and audit/no-event results. Every path cleans up its task.
function New-ScheduledTaskAction {param($Execute,$Argument) return @{Execute=$Execute;Argument=$Argument}}
function New-ScheduledTaskPrincipal {param($UserId,$LogonType,$RunLevel) Check ($LogonType -eq 'S4U' -and $RunLevel -eq 'Limited') 'Probe must run without elevated player token';return @{UserId=$UserId}}
function New-ScheduledTaskSettingsSet {param($ExecutionTimeLimit,[switch]$AllowStartIfOnBatteries,[switch]$DontStopIfGoingOnBatteries) return @{}}
function Register-ScheduledTask {param($TaskName,$Action,$Principal,$Settings,$Xml,[switch]$Force) $script:registered=$TaskName}
function Export-ScheduledTask {param($TaskName) return '<Task />'}
function Start-ScheduledTask {param($TaskName)}
function Stop-ScheduledTask {param($TaskName,$ErrorAction)}
function Unregister-ScheduledTask {param($TaskName,$Confirm,$ErrorAction) $script:removed=$TaskName}
function Get-ScheduledTask {param($TaskName) return @{State=$script:taskState}}
function Get-ScheduledTaskInfo {param($TaskName) return @{LastRunTime=(Get-Date);LastTaskResult=$script:probeResult}}
function Start-Sleep {param($Milliseconds,$Seconds)}
function Get-WinEvent {
    param($FilterHashtable,$ErrorAction)
    foreach($suffix in $script:eventSuffixes){
        $path=$script:nonce+$suffix;if($script:upperEvents){$path=$path.ToUpperInvariant()}
        $value="<Event><UserData><FilePath>$path</FilePath><TargetUser>$sid</TargetUser></UserData></Event>"
        $event=[pscustomobject]@{Value=$value};$event|Add-Member -MemberType ScriptMethod -Name ToXml -Value {$this.Value};$event
    }
}
$script:nonce=[guid]::NewGuid().ToString('N');$script:probeResult=0;$script:eventSuffixes=@('.exe','.dll');$script:taskState='Ready';$script:upperEvents=$false
Invoke-GManagerEnforcementProbe $config $script:nonce
Check ($script:registered -eq $script:removed) 'Successful probe task cleanup'
$script:upperEvents=$true;Invoke-GManagerEnforcementProbe $config $script:nonce;$script:upperEvents=$false
foreach($result in @(1260,2,1)){
    $script:probeResult=$result;Reject {Invoke-GManagerEnforcementProbe $config $script:nonce} 'A task start failure is not proof of enforcement'
    Check ($script:registered -eq $script:removed) 'Failed probe task cleanup'
}
$script:probeResult=267009;$script:taskState='Running'
Reject {Invoke-GManagerEnforcementProbe $config $script:nonce -TimeoutSeconds 0} 'Hung probe times out and fails closed'
$script:taskState='Ready'
$script:probeResult=0;$script:eventSuffixes=@('.exe')
Reject {Invoke-GManagerEnforcementProbe $config $script:nonce} 'Missing DLL block event must fail'

# Exercise the real deployment journal/filesystem implementation in a private temp tree.
. (Join-Path $client 'packaging\client-management.ps1')
$work=Join-Path ([IO.Path]::GetTempPath()) ('GManager-Contracts-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work|Out-Null
$script:ClientRoot=Join-Path $work 'install';$script:ClientState=Join-Path $work 'state'
New-Item -ItemType Directory -Path $script:ClientState|Out-Null
function New-ProtectedDirectory {param($Path,[switch]$Readable) New-Item -ItemType Directory -Path $Path -Force|Out-Null}
function Assert-Package {param($Directory,$Subject,$Thumbprint) if(!(Test-Path (Join-Path $Directory 'version.txt'))){throw 'Incomplete package'};return @{version='1.2.3'}}
function Write-Operation {param($Operation,$Result) $script:lastOperation=$Operation}
function Stop-ClientShell {}
function Stop-ClientService {param([switch]$Force) if($script:failStop){throw 'Simulated service failure'}}
function Stop-PlayerSessions {param($PlayerSid) $script:loggedOff=$true}
function Start-ClientService {$script:restarted=$true}
function Invoke-ClientPipe {param($Type,[switch]$Admin) return @{Success=$true}}
function Get-Service {param($Name,$ErrorAction) if($script:hasService){return @{Status='Running'}}}
function Invoke-Native {param($File,$Arguments)}
function Invoke-Policy {param($Action) if($script:failPolicy){throw 'Simulated policy failure'};$script:policyAction=$Action}
$script:failStop=$false;$script:hasService=$false;$script:loggedOff=$false;$script:restarted=$false
$script:failPolicy=$false
try{
    $package=Join-Path $work 'package';New-Item -ItemType Directory -Path $package|Out-Null
    Set-Content -LiteralPath (Join-Path $package 'version.txt') -Value 'first'
    $configuration=@{Client=@{Mode='Production';Version='1.2.3';PlayerSid=$sid};Package=@{SigningSubject='test';SigningThumbprint='test'}}
    Install-ClientFiles $package $configuration
    Check $script:loggedOff 'Fresh install must log off player before changing files'
    Check ((Get-Content (Join-Path $script:ClientRoot 'version.txt')) -eq 'first') 'Fresh install files'
    $deployment=Get-Content (Join-Path $script:ClientState 'deployment.json') -Raw|ConvertFrom-Json
    $deployment.phase='Complete';Write-AtomicJson (Join-Path $script:ClientState 'deployment.json') $deployment
    $script:hasService=$true
    Set-Content -LiteralPath (Join-Path $package 'version.txt') -Value 'second'
    Install-ClientFiles $package $configuration
    Check ((Get-Content (Join-Path $script:ClientRoot 'version.txt')) -eq 'second') 'Reinstall/update binary swap'
    Resolve-ClientTransaction
    Check ((Get-Content (Join-Path $script:ClientRoot 'version.txt')) -eq 'first') 'Interrupted update rolls back binaries'
    Check $script:restarted 'Rollback restarts previous service'
    Check ((Get-Content (Join-Path $script:ClientState 'deployment.json') -Raw|ConvertFrom-Json).phase -eq 'RolledBack') 'Recovery journal commit'
    $script:failStop=$true
    Reject {Install-ClientFiles $package $configuration} 'Failed service stop aborts deployment'
    $script:failStop=$false;Resolve-ClientTransaction
    Check ((Get-Content (Join-Path $script:ClientRoot 'version.txt')) -eq 'first') 'Pre-swap failure preserves installation'
    $lease=Join-Path $script:ClientState 'maintenance.json'
    Write-AtomicJson $lease @{ExpiresAt=[DateTimeOffset]::UtcNow.AddMinutes(1).ToString('o')}
    Check (Get-Maintenance) 'Unexpired maintenance is active'
    Write-AtomicJson $lease @{ExpiresAt=[DateTimeOffset]::UtcNow.AddMinutes(-1).ToString('o')}
    Check (!(Get-Maintenance)) 'Expired maintenance after restart is inactive'
    $session=[guid]::NewGuid().ToString()
    Write-AtomicJson (Join-Path $script:ClientState 'snapshot.json') @{Lease=@{SessionId=$session};LocallyLocked=$false}
    $script:loggedOff=$false
    Restore-ExpiredClientMaintenance $sid
    Check ($script:loggedOff -and $script:policyAction -eq 'Apply') 'Maintenance expiry logs off player and reapplies enforced policy'
    Check (!(Test-Path -LiteralPath $lease)) 'Expiry removes lease only after enforcement succeeds'
    $snapshot=Get-Content (Join-Path $script:ClientState 'snapshot.json') -Raw|ConvertFrom-Json
    Check ($snapshot.LocallyLocked -and $snapshot.BlockedSessionId -eq $session) 'Expired maintenance prevents silent session reuse'
    Write-AtomicJson $lease @{ExpiresAt=[DateTimeOffset]::UtcNow.AddMinutes(-1).ToString('o')}
    $script:failPolicy=$true
    Reject {Restore-ExpiredClientMaintenance $sid} 'Failed expiry enforcement must remain retryable'
    Check ((Test-Path -LiteralPath $lease) -and !(Get-Maintenance)) 'Failed enforcement cannot extend maintenance'
    $script:failPolicy=$false;Restore-ExpiredClientMaintenance $sid
    $health=@{timestamp=[DateTimeOffset]::UtcNow.ToString('o');initialized=$true;version='1.2.3';development=$false;errorCode=$null;enforcementVerified=$false}
    Write-AtomicJson (Join-Path $script:ClientState 'health.json') $health
    Reject {Assert-Healthy -TimeoutSeconds 0} 'Running service without enforcement proof must not complete installation/update'
    $health.enforcementVerified=$true;Write-AtomicJson (Join-Path $script:ClientState 'health.json') $health
    Assert-Healthy -TimeoutSeconds 0
    Reject {Assert-Healthy -TimeoutSeconds 0 -RequireConnected} 'First installation must prove backend communication'
    $health.serverConnected=$true
    Write-AtomicJson (Join-Path $script:ClientState 'health.json') $health
    Assert-Healthy -TimeoutSeconds 0 -RequireConnected
    $release=[pscustomobject]@{minimumWindowsBuild=19041;enforcementProtocol=1}
    Assert-ReleaseCompatibility $release 19045
    Reject {Assert-ReleaseCompatibility $release 18363} 'Update must reject an unsupported Windows build before replacing files'
    $release.enforcementProtocol=2
    Reject {Assert-ReleaseCompatibility $release 19045} 'Update must reject an unknown enforcement protocol'
    $health.version='9.9.9';Write-AtomicJson (Join-Path $script:ClientState 'health.json') $health
    Reject {Assert-Healthy -TimeoutSeconds 0} 'Stale version health must fail'
}finally{
    $resolved=[IO.Path]::GetFullPath($work)
    if(!$resolved.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()),[StringComparison]::OrdinalIgnoreCase) -or (Split-Path $resolved -Leaf) -notlike 'GManager-Contracts-*'){throw 'Unsafe test cleanup'}
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
. (Join-Path $PSScriptRoot 'windows-policy-transaction.Tests.ps1')
Write-Output "PASS: $script:passed isolated Windows capability, policy, probe and deployment contract assertions. Physical Windows enforcement NOT tested."
