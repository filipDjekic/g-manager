# Invoked by windows-enforcement.Tests.ps1 in the same isolated test process.
# All OS policy/service/account/task entry points are mocked; only a private temp tree is written.
Add-Type -AssemblyName System.ServiceProcess
function Get-GManagerWindowsCapabilities {return (Capabilities)}
function Assert-GManagerProtectedPath {param($Path,[switch]$Directory) if($script:unsafePath){throw 'Unsafe test application'}}
function Get-GManagerDllPaths {param($Applications,$InstallRoot,$StateDirectory) return @(Join-Path $env:WINDIR 'System32\version.dll')}
function Get-LocalUser {param($SID) return @{Enabled=$true}}
function Get-LocalGroupMember {param($SID) return @{SID=@{Value='S-1-5-21-1-2-3-500'}}}
function Get-ItemProperty {param($Path,$LiteralPath) $settings=@{Start=$script:appIdStart};if($script:delayedPresent){$settings.DelayedAutoStart=$script:delayed};return [pscustomobject]$settings}
$script:startupImplementation=${function:Set-GManagerApplicationIdentityStartup}
function Invoke-GManagerApplicationIdentitySc {param($Start) return 5}
function Set-ItemProperty {param($LiteralPath,$Name,$Value) Check ($LiteralPath -eq 'HKLM:\SYSTEM\CurrentControlSet\Services\AppIDSvc') 'Only owned AppIDSvc startup values may be restored';switch($Name){'Start'{$script:appIdStart=$Value}'DelayedAutoStart'{$script:delayed=$Value}default{throw 'Unexpected registry mutation'}}}
function New-ItemProperty {param($LiteralPath,$Name,$PropertyType,$Value,[switch]$Force) Check ($Name -eq 'DelayedAutoStart') 'Only delayed startup may be created during restore';$script:delayedPresent=$true;$script:delayed=$Value}
function Set-GManagerApplicationIdentityStartup {param($Start,[switch]$Restore) $script:appIdStart=switch($Start){'auto'{2}'delayed-auto'{2}'demand'{3}'disabled'{4}};$script:delayed=if($Start -eq 'delayed-auto'){1}else{0};$script:delayedPresent=$true;return $false}
function Remove-ItemProperty {param($LiteralPath,$Name) Check ($LiteralPath -eq 'HKLM:\SYSTEM\CurrentControlSet\Services\AppIDSvc' -and $Name -eq 'DelayedAutoStart') 'Restore only owned AppIDSvc delayed-start value';$script:delayedPresent=$false}
function Start-Service {param($Name)}
function Get-Service {
    param($Name,$ErrorAction)
    $service=[pscustomobject]@{Status='Running'}
    $service|Add-Member -MemberType ScriptMethod -Name WaitForStatus -Value {param($Status,$Timeout)}
    return $service
}
function Get-AppLockerPolicy {
    param([switch]$Local,[switch]$Effective,[switch]$Xml)
    $policy=$script:localPolicy
    if($Effective -and $script:auditEffective){[xml]$policy=$policy.OuterXml;foreach($node in $policy.AppLockerPolicy.RuleCollection){$node.SetAttribute('EnforcementMode','AuditOnly')}}
    if($Xml){return $policy.OuterXml}
    return $policy
}
function Set-AppLockerPolicy {
    param($XmlPolicy)
    $script:policyWrites++
    if($script:failWriteAt -eq $script:policyWrites){throw 'Simulated policy store failure'}
    [xml]$script:localPolicy=Get-Content -Encoding UTF8 -LiteralPath $XmlPolicy -Raw
}
function Test-AppLockerPolicy {
    param($PolicyObject,$Path,$User)
    $type=if([IO.Path]::GetExtension($Path) -eq '.dll'){'Dll'}else{'Exe'}
    $node=$PolicyObject.SelectSingleNode("/AppLockerPolicy/RuleCollection[@Type='$type']/*[@Action='Deny' and @UserOrGroupSid='$User']")
    $exceptions=@($node.SelectNodes('Exceptions/FilePathCondition')|ForEach-Object {$_.Path})
    return @{PolicyDecision=$(if($Path -in $exceptions){'Allowed'}else{'Denied'})}
}
function Invoke-GManagerEnforcementProbe {
    param($Config,$Nonce)
    $script:probeCalls++
    if($script:probeFails){throw 'Simulated missing physical enforcement'}
}
function Disconnect-GManagerPlayerSessions {param($Sid) $script:disconnected=$Sid}

$transactionRoot=Join-Path ([IO.Path]::GetTempPath()) ('GManager-PolicyContracts-'+[guid]::NewGuid().ToString('N'))
$state=Join-Path $transactionRoot 'state';$install=Join-Path $transactionRoot 'install'
foreach($directory in @($state,(Join-Path $install 'service'),(Join-Path $install 'shell'))){New-Item -ItemType Directory -Path $directory -Force|Out-Null}
$script:appIdStart=3;$script:delayedPresent=$false;$script:delayed=0;$script:policyWrites=0;$script:failWriteAt=-1;$script:probeCalls=0;$script:probeFails=$false;$script:unsafePath=$false;$script:auditEffective=$false;$script:disconnected=$null
$config=@{Client=@{Mode='Production';Version='1.2.3';PlayerSid=$sid;InstallRoot=$install}}
Write-AtomicJson (Join-Path $state 'client.json') $config
Write-AtomicJson (Join-Path $state 'allowed-paths.json') @()
[xml]$script:localPolicy=$foreign
try{
    Reject {& $script:startupImplementation -Start auto} 'SCM failure during installation must not use Registry enforcement fallback'
    $script:appIdStart=2
    Check ([bool](& $script:startupImplementation -Start demand -Restore)) 'Protected service restore records reboot requirement'
    Check ($script:appIdStart -eq 3) 'Protected service restore persists only original startup'
    Invoke-GManagerPolicyTransaction -Action Apply -StateDirectory $state -VerifyEnforcement
    $proof=Get-Content (Join-Path $state 'enforcement-verification.json') -Raw|ConvertFrom-Json
    Check ($proof.verified -and $script:probeCalls -eq 1) 'Transaction requires actual probe before accepting enforcement'
    Check ($script:appIdStart -eq 2) 'Application Identity becomes automatic'
    $journal=Get-Content (Join-Path $state 'policy-journal.json') -Raw|ConvertFrom-Json
    Check ($journal.phase -eq 'Applied' -and $journal.pending.Count -eq 0) 'Policy transaction commits ownership'
    $exeDeny=$script:localPolicy.SelectSingleNode("/AppLockerPolicy/RuleCollection[@Type='Exe']/*[@Action='Deny' and @UserOrGroupSid='$sid']")
    Check (!$exeDeny.OuterXml.Contains('whoami.exe') -and !$exeDeny.OuterXml.Contains('GManager.Client.Service.exe')) 'Probe executable exceptions must be revoked'
    Check (@(Get-ChildItem (Join-Path $install 'service\enforcement-probe') -File).Count -eq 0) 'Canary cleanup'
    Invoke-GManagerPolicyTransaction -Action Apply -StateDirectory $state
    Check ($script:probeCalls -eq 1) 'Session transitions reuse verified current-boot evidence and revalidate effective policy'
    $unicodeGame='C:\Games\'+[char]0x010d+'game.exe'
    Write-AtomicJson (Join-Path $state 'allowed-paths.json') @('C:\Games\game.exe',$unicodeGame)
    Invoke-GManagerPolicyTransaction -Action Apply -StateDirectory $state
    $exeDeny=$script:localPolicy.SelectSingleNode("/AppLockerPolicy/RuleCollection[@Type='Exe']/*[@Action='Deny' and @UserOrGroupSid='$sid']")
    Check ($exeDeny.OuterXml.Contains('C:\Games\game.exe')) 'Active policy includes authorized concrete game'
    Check ($exeDeny.OuterXml.Contains($unicodeGame)) 'Windows PowerShell 5.1 reads UTF-8 allow paths without corrupting Unicode'
    Write-AtomicJson (Join-Path $state 'maintenance.json') @{ExpiresAt=[DateTimeOffset]::UtcNow.AddMinutes(5).ToString('o')}
    Invoke-GManagerPolicyTransaction -Action Suspend -StateDirectory $state -VerifyEnforcement
    $exeDeny=$script:localPolicy.SelectSingleNode("/AppLockerPolicy/RuleCollection[@Type='Exe']/*[@Action='Deny' and @UserOrGroupSid='$sid']")
    Check (!$exeDeny.OuterXml.Contains('C:\Games\game.exe')) 'Maintenance keeps player locked; admin rules are unaffected'
    Check ($null -ne $script:localPolicy.SelectSingleNode("/AppLockerPolicy/RuleCollection/*[@Id='$foreignId']")) 'Maintenance preserves foreign rules'
    Write-AtomicJson (Join-Path $state 'maintenance.json') @{ExpiresAt=[DateTimeOffset]::MinValue.ToString('o')}
    Write-AtomicJson (Join-Path $state 'allowed-paths.json') @()
    Invoke-GManagerPolicyTransaction -Action Apply -StateDirectory $state -VerifyEnforcement

    # Fault after Set-AppLockerPolicy leaves a retryable journal and an explicit failed proof.
    $script:probeFails=$true
    Reject {Invoke-GManagerPolicyTransaction -Action Apply -StateDirectory $state -VerifyEnforcement} 'Failed physical enforcement rejects the whole transaction'
    Check (!(Get-Content (Join-Path $state 'enforcement-verification.json') -Raw|ConvertFrom-Json).verified) 'No success evidence after failed probe'
    Check ($script:disconnected -eq $sid) 'Enforcement failure logs off only the player'
    $script:probeFails=$false
    Invoke-GManagerPolicyTransaction -Action Remove -StateDirectory $state
    Check ((ConvertTo-GManagerCanonicalRule $script:localPolicy.OuterXml) -eq (ConvertTo-GManagerCanonicalRule $foreign)) 'Uninstall after interrupted probe restores original local policy'
    Check ($script:appIdStart -eq 3) 'Uninstall restores owned AppIDSvc startup change'
    Check (!$script:delayedPresent) 'Uninstall restores absent delayed-start value'
    Invoke-GManagerPolicyTransaction -Action Remove -StateDirectory $state
    Check ($script:appIdStart -eq 3) 'Repeated uninstall is idempotent'

    # Failures on each side of the two policy writes retain the union of old/pending IDs.
    foreach($offset in @(1,2)){
        Invoke-GManagerPolicyTransaction -Action Apply -StateDirectory $state -VerifyEnforcement
        $script:failWriteAt=$script:policyWrites+$offset
        Reject {Invoke-GManagerPolicyTransaction -Action Apply -StateDirectory $state -VerifyEnforcement} "Write $offset failure must reject installation"
        $script:failWriteAt=-1
        Invoke-GManagerPolicyTransaction -Action Remove -StateDirectory $state
        Check ((ConvertTo-GManagerCanonicalRule $script:localPolicy.OuterXml) -eq (ConvertTo-GManagerCanonicalRule $foreign)) "Write $offset failure must not lose previous/pending ownership"
    }
    $script:auditEffective=$true
    Reject {Invoke-GManagerPolicyTransaction -Action Apply -StateDirectory $state -VerifyEnforcement} 'Effective AuditOnly refuses installation even when local store accepted rules'
    $script:auditEffective=$false
    Invoke-GManagerPolicyTransaction -Action Remove -StateDirectory $state
    $script:appIdStart=2;$script:delayedPresent=$true;$script:delayed=1
    Invoke-GManagerPolicyTransaction -Action Apply -StateDirectory $state -VerifyEnforcement
    Check ($script:delayed -eq 0) 'AppIDSvc automatic enforcement removes delayed startup while installed'
    $script:appIdStart=4
    Reject {Invoke-GManagerPolicyTransaction -Action Remove -StateDirectory $state} 'External service startup changes are not overwritten'
    $script:appIdStart=2
    Invoke-GManagerPolicyTransaction -Action Remove -StateDirectory $state
    Check ($script:appIdStart -eq 2 -and $script:delayed -eq 1) 'Uninstall preserves original delayed-auto startup'
    $script:unsafePath=$true
    Reject {Invoke-GManagerPolicyTransaction -Action Apply -StateDirectory $state -VerifyEnforcement} 'Unsafe paths must fail before policy mutation'
    Check ((ConvertTo-GManagerCanonicalRule $script:localPolicy.OuterXml) -eq (ConvertTo-GManagerCanonicalRule $foreign)) 'Unsafe path failure preserves foreign policy'
}finally{
    $resolved=[IO.Path]::GetFullPath($transactionRoot)
    if(!$resolved.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()),[StringComparison]::OrdinalIgnoreCase) -or (Split-Path $resolved -Leaf) -notlike 'GManager-PolicyContracts-*'){throw 'Unsafe transaction test cleanup'}
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
