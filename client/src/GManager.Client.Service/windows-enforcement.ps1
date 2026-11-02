# Shared, signed Windows capability/policy implementation. Dot-sourcing has no side effects.
Set-StrictMode -Version Latest

function Get-GManagerWindowsCapabilities {
    $os=Get-CimInstance Win32_OperatingSystem
    $version=Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
    $missing=@()
    foreach($name in @('Get-AppLockerPolicy','Set-AppLockerPolicy','Test-AppLockerPolicy','Get-AppLockerFileInformation','Get-LocalUser','Get-LocalGroupMember','Register-ScheduledTask','Unregister-ScheduledTask','Start-ScheduledTask','Stop-ScheduledTask','Get-ScheduledTask','Get-ScheduledTaskInfo','Get-WinEvent')){
        if(!(Get-Command $name -ErrorAction SilentlyContinue)){$missing+=$name}
    }
    $policyReadable=$false;$policyError=$null
    try{[xml]$local=Get-AppLockerPolicy -Local -Xml;[xml]$effective=Get-AppLockerPolicy -Effective -Xml;$policyReadable=$null -ne $local.AppLockerPolicy -and $null -ne $effective.AppLockerPolicy}catch{$policyError=$_.Exception.Message}
    $eventLog=$false
    try{$eventLog=[bool](Get-WinEvent -ListLog 'Microsoft-Windows-AppLocker/EXE and DLL').IsEnabled}catch{}
    [pscustomobject]@{Edition=[string]$version.EditionID;Build=[int]$os.BuildNumber;Revision=[int]$version.UBR;BootTime=([DateTimeOffset]$os.LastBootUpTime).ToUniversalTime().ToString('o');ProductType=[int]$os.ProductType;Is64Bit=[Environment]::Is64BitProcess;PowerShellMajor=$PSVersionTable.PSVersion.Major;MissingCommands=$missing;ApplicationIdentityAvailable=($null -ne (Get-Service AppIDSvc -ErrorAction SilentlyContinue));PolicyReadable=$policyReadable;PolicyError=$policyError;EventLogEnabled=$eventLog;EnforcementVerified=$false}
}
function Assert-GManagerEnforcementEvidence($Evidence,$Capabilities,$Config) {
    if(!$Evidence.verified -or $Evidence.schema -ne 1 -or $Evidence.playerSid -ne $Config.Client.PlayerSid -or $Evidence.clientVersion -ne $Config.Client.Version -or $Evidence.bootTime -ne $Capabilities.BootTime -or $Evidence.build -ne $Capabilities.Build -or $Evidence.revision -ne $Capabilities.Revision){throw 'Nedostaje važeća stvarna enforcement proba za ovaj boot, Windows build, nalog i verziju Client-a. Potreban je repair/recovery.'}
}
function Assert-GManagerWindowsCapabilities($Capabilities) {
    # Edition and installed KB names are diagnostics, never evidence of enforcement.
    # KB5024351 is also superseded by cumulative updates; the live probe is authoritative.
    if($Capabilities.Build -lt 19041 -or $Capabilities.ProductType -ne 1 -or !$Capabilities.Is64Bit -or $Capabilities.PowerShellMajor -ne 5){throw 'Potreban je 64-bitni Windows 10 2004+ (cilj: 22H2/19045) ili Windows 11 i Windows PowerShell 5.1.'}
    if(@($Capabilities.MissingCommands).Count){throw ('Nedostaju ugrađene Windows komponente: '+($Capabilities.MissingCommands -join ', '))}
    if(!$Capabilities.ApplicationIdentityAvailable -or !$Capabilities.PolicyReadable -or !$Capabilities.EventLogEnabled){throw 'AppLocker/Application Identity, lokalna/efektivna policy infrastruktura i EXE and DLL event log moraju biti dostupni. Instalacija je prekinuta; fullscreen Shell nije bezbedan fallback.'}
}
function Assert-GManagerProtectedPath([string]$Path,[switch]$Directory,[hashtable]$AncestorCache) {
    if($Path -notmatch '^[A-Za-z]:\\' -or $Path.Substring(2) -match '[:*?"%]|(^|\\)\.\.?($|\\)'){throw "Nedozvoljena lokalna putanja: $Path"}
    if(!(Test-Path -LiteralPath $Path)){throw "Putanja ne postoji: $Path"}
    $trusted=@('S-1-5-18','S-1-5-32-544','S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464')
    $item=Get-Item -LiteralPath $Path -Force
    $first=$true;$checkedParents=@()
    while($item){
        if(!$first -and $null -ne $AncestorCache -and $AncestorCache.ContainsKey($item.FullName)){break}
        if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw "Reparse putanja nije dozvoljena: $($item.FullName)"}
        $acl=Get-Acl -LiteralPath $item.FullName
        if($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -notin $trusted){throw "Putanja nije u pouzdanom vlasništvu: $($item.FullName)"}
        # InheritOnly ACEs do not grant access to this object. Ancestors may allow
        # creating unrelated files, but must not allow replacing this protected child.
        $mask=if($first){0xD0156}else{0xD0040}
        foreach($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){
            if(($rule.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly) -ne 0){continue}
            if($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin $trusted -and ([int]$rule.FileSystemRights -band $mask)){throw "Putanja je upisiva neprivilegovanom nalogu: $($item.FullName)"}
        }
        if(!$first){$checkedParents+=$item.FullName}
        $first=$false;$parent=Split-Path -Path $item.FullName -Parent
        $item=if($parent){Get-Item -LiteralPath $parent -Force}else{$null}
    }
    if($null -ne $AncestorCache){foreach($parent in $checkedParents){$AncestorCache[$parent]=$true}}
}
function Get-GManagerDllPaths([string[]]$Applications,[string]$InstallRoot,[string]$StateDirectory) {
    $roots=@((Join-Path $InstallRoot 'shell'),(Join-Path $InstallRoot 'service'))+@($Applications|ForEach-Object {Split-Path -Path $_ -Parent})|Sort-Object -Unique
    $version=Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
    $clientVersion=(Get-Content -Encoding UTF8 -LiteralPath (Join-Path $StateDirectory 'client.json') -Raw|ConvertFrom-Json).Client.Version
    $appStamps=@($Applications|ForEach-Object { (Get-Item -LiteralPath $_).LastWriteTimeUtc.Ticks })
    $key=(@($roots)+@($appStamps)+@($version.CurrentBuildNumber,$version.UBR,$clientVersion) -join '|')
    $cachePath=Join-Path $StateDirectory 'dll-paths.json'
    $cache=@{}
    if(Test-Path -LiteralPath $cachePath){$loaded=Get-Content -Encoding UTF8 -LiteralPath $cachePath -Raw|ConvertFrom-Json;foreach($entry in $loaded.PSObject.Properties){$cache[$entry.Name]=@($entry.Value)}}
    if($cache.ContainsKey($key)){return $cache[$key]}
    $files=[Collections.Generic.List[string]]::new();$ancestors=@{}
    foreach($root in $roots){
        Assert-GManagerProtectedPath $root -Directory
        # Include directories in the audit: a writable subtree can supply an injected DLL.
        foreach($item in Get-ChildItem -LiteralPath $root -Recurse -Force){
            if($item.PSIsContainer -or $item.Extension -in @('.dll','.ocx') -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){
                Assert-GManagerProtectedPath $item.FullName -AncestorCache $ancestors
                if(!$item.PSIsContainer -and $item.Extension -in @('.dll','.ocx')){$files.Add($item.FullName)}
            }
        }
    }
    # Exact OS DLL paths, never %WINDIR%\*: Windows contains user-writable subdirectories.
    foreach($relative in @('System32','SysWOW64','WinSxS','Microsoft.NET','assembly')){
        $root=Join-Path $env:WINDIR $relative
        if(!(Test-Path -LiteralPath $root)){continue}
        $recurse=$relative -in @('WinSxS','Microsoft.NET','assembly')
        foreach($file in Get-ChildItem -LiteralPath $root -Recurse:$recurse -File -Force|Where-Object {$_.Extension -in @('.dll','.ocx')}){
            try{Assert-GManagerProtectedPath $file.FullName -AncestorCache $ancestors;$files.Add($file.FullName)}catch{continue} # Unsafe OS DLL locations remain denied.
        }
    }
    $files=@($files|Sort-Object -Unique)
    if($cache.Count -ge 8){$cache=@{}}
    $cache[$key]=$files
    # Caller provides atomic, ACL-protected persistence (same implementation as the policy journal).
    Write-GManagerPolicyJson $cachePath $cache
    return $files
}
function ConvertTo-GManagerCanonicalRule([string]$Xml) {
    Add-Type -AssemblyName System.Security
    [xml]$document=$Xml;$transform=[Security.Cryptography.Xml.XmlDsigC14NTransform]::new();$transform.LoadInput($document)
    $reader=[IO.StreamReader]::new($transform.GetOutput([IO.Stream]));try{$reader.ReadToEnd()}finally{$reader.Dispose()}
}
function Remove-GManagerOwnedRules([xml]$Policy,$Journal) {
    $affected=@{}
    foreach($id in @($Journal.owned)+@($Journal.pending)){
        $node=$Policy.SelectSingleNode("/AppLockerPolicy/RuleCollection/*[@Id='$id']")
        if($node){
            if(!$Journal.ruleXml.ContainsKey($id) -or (ConvertTo-GManagerCanonicalRule $node.OuterXml) -ne (ConvertTo-GManagerCanonicalRule $Journal.ruleXml[$id])){throw 'G-Manager pravilo je promenjeno; administrator mora razrešiti konflikt.'}
            $affected[$node.ParentNode.Type]=$true
            [void]$node.ParentNode.RemoveChild($node)
        }
    }
    foreach($type in @($Journal.modes.Keys)){
        if(!$affected.ContainsKey($type)){continue} # A previous restore/write may already have finished.
        $collection=$Policy.SelectSingleNode("/AppLockerPolicy/RuleCollection[@Type='$type']")
        if(!$collection -or $collection.EnforcementMode -ne 'Enabled'){throw 'AppLocker enforcement mode je promenjen; odbijen je rollback tuđih podešavanja.'}
        if($Journal.modes[$type] -eq '__Absent' -and @($collection.SelectNodes('*')).Count -eq 0){[void]$collection.ParentNode.RemoveChild($collection)}
        elseif($Journal.modes[$type] -eq '__Absent'){$collection.SetAttribute('EnforcementMode','Enabled')} # Preserve newly added foreign enforcement.
        else{$collection.SetAttribute('EnforcementMode',[string]$Journal.modes[$type])}
    }
}
function Add-GManagerRule([xml]$Policy,$Collection,[string]$Sid,[string]$Effect,[string[]]$Paths,[switch]$Publisher) {
    $rule=$Policy.CreateElement($(if($Publisher){'FilePublisherRule'}else{'FilePathRule'}))
    foreach($entry in @{Id=[guid]::NewGuid().ToString();Name='GManager.Client';Description='Owned by G-Manager Client';UserOrGroupSid=$Sid;Action=$Effect}.GetEnumerator()){$rule.SetAttribute($entry.Key,$entry.Value)}
    $conditions=$Policy.CreateElement('Conditions')
    $condition=$Policy.CreateElement($(if($Publisher){'FilePublisherCondition'}else{'FilePathCondition'}))
    if($Publisher){
        foreach($name in @('PublisherName','ProductName','BinaryName')){$condition.SetAttribute($name,'*')}
        $range=$Policy.CreateElement('BinaryVersionRange');$range.SetAttribute('LowSection','0.0.0.0');$range.SetAttribute('HighSection','*');[void]$condition.AppendChild($range)
    }else{$condition.SetAttribute('Path','*')}
    [void]$conditions.AppendChild($condition);[void]$rule.AppendChild($conditions)
    if(@($Paths).Count){$exceptions=$Policy.CreateElement('Exceptions');foreach($path in $Paths){$condition=$Policy.CreateElement('FilePathCondition');$condition.SetAttribute('Path',$path);[void]$exceptions.AppendChild($condition)};[void]$rule.AppendChild($exceptions)}
    [void]$Collection.AppendChild($rule)
}
function Add-GManagerRestrictions([xml]$Policy,[string]$Sid,[string[]]$Executables,[string[]]$Dlls) {
    $modes=@{};$rules=@{}
    foreach($type in @('Exe','Script','Msi','Dll','Appx')){
        $collection=$Policy.SelectSingleNode("/AppLockerPolicy/RuleCollection[@Type='$type']")
        if(!$collection){$modes[$type]='__Absent';$collection=$Policy.CreateElement('RuleCollection');$collection.SetAttribute('Type',$type);[void]$Policy.AppLockerPolicy.AppendChild($collection)}
        else{
            $modes[$type]=$collection.GetAttribute('EnforcementMode')
            if($collection.EnforcementMode -ne 'Enabled' -and @($collection.SelectNodes('*')).Count){throw 'Tuđa neaktivna/AuditOnly AppLocker pravila zahtevaju administratorsku pripremu. G-Manager ih neće uključiti.'}
        }
        $before=@($collection.SelectNodes('*')|ForEach-Object {$_.Id})
        if($before.Count -eq 0){Add-GManagerRule $Policy $collection 'S-1-1-0' 'Allow' @() -Publisher:($type -eq 'Appx')}
        $collection.SetAttribute('EnforcementMode','Enabled')
        $exceptions=@()
        if($type -eq 'Exe'){$exceptions=$Executables}
        if($type -eq 'Dll'){$exceptions=$Dlls}
        Add-GManagerRule $Policy $collection $Sid 'Deny' $exceptions -Publisher:($type -eq 'Appx')
        # An exception to Deny is not an Allow when foreign collections already have rules.
        # Deny wins over Allow, including foreign broad Allow rules. A scoped wildcard
        # Allow supplies the exceptions without thousands of redundant Allow rules.
        if($exceptions.Count){Add-GManagerRule $Policy $collection $Sid 'Allow' @()}
        foreach($node in $collection.SelectNodes('*')){if($node.Id -notin $before){$rules[$node.Id]=$node.OuterXml}}
    }
    return @{modes=$modes;rules=$rules}
}
function Assert-GManagerEffectivePolicy([xml]$Effective,$Rules) {
    foreach($id in $Rules.Keys){
        $node=$Effective.SelectSingleNode("/AppLockerPolicy/RuleCollection/*[@Id='$id']")
        if(!$node -or $node.ParentNode.EnforcementMode -ne 'Enabled' -or (ConvertTo-GManagerCanonicalRule $node.OuterXml) -ne (ConvertTo-GManagerCanonicalRule $Rules[$id])){throw 'Efektivna Windows politika ne sadrži aktivno, neizmenjeno G-Manager pravilo. Proverite GPO/MDM konflikte i Windows ažuriranja.'}
    }
}
function Invoke-GManagerEnforcementProbe($Config,[string]$Nonce,[int]$TimeoutSeconds=35) {
    $taskName='GManagerClientProbe-'+$Nonce
    $exe=Join-Path $Config.Client.InstallRoot 'service\GManager.Client.Service.exe'
    $action=New-ScheduledTaskAction -Execute $exe -Argument ('--enforcement-probe '+$Config.Client.PlayerSid+' '+$Nonce)
    $principal=New-ScheduledTaskPrincipal -UserId $Config.Client.PlayerSid -LogonType S4U -RunLevel Limited
    $settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    $started=Get-Date
    try{
        Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal -Settings $settings|Out-Null
        Start-ScheduledTask -TaskName $taskName
        $deadline=[DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
        do{
            Start-Sleep -Milliseconds 250
            $info=Get-ScheduledTaskInfo -TaskName $taskName
            if($info.LastRunTime -ge $started.AddSeconds(-1) -and (Get-ScheduledTask -TaskName $taskName).State -ne 'Running' -and $info.LastTaskResult -ne 267009){break}
        }while([DateTime]::UtcNow -lt $deadline)
        if($info.LastRunTime -lt $started.AddSeconds(-1) -or $info.LastTaskResult -ne 0 -or (Get-ScheduledTask -TaskName $taskName).State -eq 'Running'){throw "Stvarni AppLocker test pod nalogom igrača nije uspeo (Task result $($info.LastTaskResult)). Proverite AppIDSvc, ažuriranja uključujući KB5024351 i S4U/batch-logon prava. Instalacija nije bezbedno potvrđena."}
        $missing=@('.exe','.dll')
        for($attempt=0;$attempt -lt 10;$attempt++){
            $events=@(Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-AppLocker/EXE and DLL';Id=8004;StartTime=$started} -ErrorAction SilentlyContinue)
            $missing=@(@('.exe','.dll')|Where-Object {
                $extension=$_
                @($events|Where-Object {$xml=$_.ToXml();$xml.IndexOf($Nonce+$extension,[StringComparison]::OrdinalIgnoreCase) -ge 0 -and $xml.Contains($Config.Client.PlayerSid)}).Count -eq 0
            })
            if(!$missing.Count){break}
            Start-Sleep -Milliseconds 200
        }
        if($missing.Count){throw 'Nedostaje korelisani AppLocker 8004 dokaz za player EXE/DLL probu. Audit ili neuspešno pokretanje nisu dokaz enforcement-a.'}
    }finally{Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue;Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue}
}

function Invoke-GManagerApplicationIdentitySc([string]$Start) {
    & "$env:WINDIR\System32\sc.exe" config AppIDSvc start= $Start|Out-Null
    return $LASTEXITCODE
}
function Set-GManagerApplicationIdentityStartup {
    param([ValidateSet('auto','delayed-auto','demand','disabled')][string]$Start,[switch]$Restore)
    $result=Invoke-GManagerApplicationIdentitySc $Start
    if($result -eq 0){return $false}
    if(!$Restore){throw 'Application Identity startup konfiguracija nije sačuvana.'}
    # Windows protects AppIDSvc and may reject changing Auto back to Manual via SCM.
    # Only the uninstall ownership/conflict checks authorize this exact-value undo.
    # Persist the original startup for the next boot; never disable/stop the live engine.
    $key='HKLM:\SYSTEM\CurrentControlSet\Services\AppIDSvc'
    $value=switch($Start){'auto'{2}'delayed-auto'{2}'demand'{3}'disabled'{4}}
    Set-ItemProperty -LiteralPath $key -Name Start -Value ([int]$value)
    if($Start -eq 'delayed-auto'){New-ItemProperty -LiteralPath $key -Name DelayedAutoStart -PropertyType DWord -Value 1 -Force|Out-Null}
    elseif((Get-ItemProperty -LiteralPath $key).PSObject.Properties.Name -contains 'DelayedAutoStart'){Set-ItemProperty -LiteralPath $key -Name DelayedAutoStart -Value 0}
    if((Get-ItemProperty -LiteralPath $key).Start -ne $value){throw 'Originalni AppIDSvc startup nije vraćen ni za sledeći restart.'}
    return $true
}
function Disconnect-GManagerPlayerSessions([string]$Sid) {
    if($Sid -notmatch '^S-1-5-21-\d+-\d+-\d+-\d+$'){throw 'Neispravan player SID za fail-closed odjavu.'}
    if(-not ('GManager.PolicySessions' -as [type])){
        Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; namespace GManager { public static class PolicySessions { [DllImport("wtsapi32.dll",SetLastError=true)] public static extern bool WTSLogoffSession(IntPtr server,int session,bool wait); } }'
    }
    $sessions=@()
    foreach($process in Get-CimInstance Win32_Process){
        if($process.SessionId -le 0){continue}
        $owner=Invoke-CimMethod -InputObject $process -MethodName GetOwnerSid -ErrorAction SilentlyContinue
        if($owner -and $owner.Sid -eq $Sid){$sessions+=[int]$process.SessionId}
    }
    foreach($session in @($sessions|Sort-Object -Unique)){
        if(![GManager.PolicySessions]::WTSLogoffSession([IntPtr]::Zero,$session,$true)){throw 'Fail-closed odjava igrača nije uspela.'}
    }
}
function Remove-GManagerProbeArtifacts($Config,[string]$Nonce) {
    $parsed=[guid]::Empty
    if(![guid]::TryParseExact($Nonce,'N',[ref]$parsed)){throw 'Neispravan ownership zapis enforcement probe.'}
    $taskName='GManagerClientProbe-'+$Nonce
    $task=Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if($task){Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue;Unregister-ScheduledTask -TaskName $taskName -Confirm:$false}
    foreach($extension in @('.exe','.dll')){
        $path=Join-Path $Config.Client.InstallRoot ('service\enforcement-probe\'+$Nonce+$extension)
        if(Test-Path -LiteralPath $path){Assert-GManagerProtectedPath $path;Remove-Item -LiteralPath $path -Force}
    }
}
function Invoke-GManagerPolicyTransaction {
    param([string]$Action,[string]$StateDirectory,[switch]$VerifyEnforcement)
    $mutex=[Threading.Mutex]::new($false,'Global\GManager.Client.Policy')
    $acquired=$false
    try{$acquired=$mutex.WaitOne(180000)}catch [Threading.AbandonedMutexException]{$acquired=$true}
    if(!$acquired){$mutex.Dispose();throw 'Druga promena politike je u toku.'}
    function Write-GManagerPolicyJson([string]$Path,$Value) {
        $bytes=[Text.UTF8Encoding]::new($false).GetBytes((ConvertTo-Json -InputObject $Value -Depth 30))
        $stream=[IO.FileStream]::new($Path+'.tmp',[IO.FileMode]::Create,[IO.FileAccess]::Write,[IO.FileShare]::None,4096,[IO.FileOptions]::WriteThrough)
        try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
        if(Test-Path -LiteralPath $Path){[IO.File]::Replace($Path+'.tmp',$Path,[System.Management.Automation.Language.NullString]::Value)}else{[IO.File]::Move($Path+'.tmp',$Path)}
    }
    function Write-PolicyEvent([string]$Result) {
        @{timestamp=[DateTimeOffset]::UtcNow.ToString('o');eventCode=('POLICY_'+$Action.ToUpperInvariant());state=$Result;actor=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value}|ConvertTo-Json -Compress|Add-Content -LiteralPath (Join-Path $StateDirectory 'policy-events.jsonl') -Encoding UTF8
    }
    $probeFiles=@();$config=$null;$journalPath=Join-Path $StateDirectory 'policy-journal.json'
    try {
        $config=Get-Content -Encoding UTF8 -LiteralPath (Join-Path $StateDirectory 'client.json') -Raw|ConvertFrom-Json
        if($config.Client.Mode -ne 'Production'){throw 'Windows restrikcije nisu dostupne u development režimu.'}
        [xml]$current=Get-AppLockerPolicy -Local -Xml
        if(!(Test-Path -LiteralPath $journalPath)){
            if($Action -ne 'Apply'){return}
            $journal=@{baseline=$current.OuterXml;owned=@();modes=@{};pending=@();ruleXml=@{};phase='Prepared';appIdService=$null;probeNonce=$null;serviceRestoreNeedsReboot=$false}
            Write-GManagerPolicyJson $journalPath $journal
        }else{
            $loaded=Get-Content -Encoding UTF8 -LiteralPath $journalPath -Raw|ConvertFrom-Json
            $journal=@{baseline=$loaded.baseline;owned=@($loaded.owned);pending=@($loaded.pending);modes=@{};ruleXml=@{};phase=$loaded.phase;appIdService=$null;probeNonce=$null;serviceRestoreNeedsReboot=$false}
            foreach($entry in $loaded.modes.PSObject.Properties){$journal.modes[$entry.Name]=$entry.Value}
            foreach($entry in $loaded.ruleXml.PSObject.Properties){$journal.ruleXml[$entry.Name]=$entry.Value}
            if($loaded.PSObject.Properties.Name -contains 'appIdService'){$journal.appIdService=$loaded.appIdService}
            if($loaded.PSObject.Properties.Name -contains 'probeNonce' -and $loaded.probeNonce){Remove-GManagerProbeArtifacts $config $loaded.probeNonce}
            if($loaded.PSObject.Properties.Name -contains 'serviceRestoreNeedsReboot'){$journal.serviceRestoreNeedsReboot=[bool]$loaded.serviceRestoreNeedsReboot}
        }
        # Reconcile an interrupted write from the Local store, never from Effective/domain GPO.
        Remove-GManagerOwnedRules $current $journal
        $maintenance=Join-Path $StateDirectory 'maintenance.json'
        $maintenanceActive=$Action -eq 'Suspend'
        if($Action -eq 'Apply' -and (Test-Path -LiteralPath $maintenance)){
            $maintenanceActive=[DateTimeOffset]::Parse((Get-Content -Encoding UTF8 -LiteralPath $maintenance -Raw|ConvertFrom-Json).ExpiresAt) -gt [DateTimeOffset]::UtcNow
        }
        $rules=@{};$modes=@{}
        $file=Join-Path $StateDirectory 'policy-transaction.xml'
        if($Action -in @('Apply','Suspend')){
            $capabilities=Get-GManagerWindowsCapabilities
            Assert-GManagerWindowsCapabilities $capabilities
            $sid=[string]$config.Client.PlayerSid
            if($sid -notmatch '^S-1-5-21-\d+-\d+-\d+-\d+$'){throw 'Neispravan SID standardnog Windows naloga.'}
            $player=Get-LocalUser -SID ([Security.Principal.SecurityIdentifier]::new($sid))
            if(!$player.Enabled -or $sid -in @((Get-LocalGroupMember -SID 'S-1-5-32-544').SID.Value)){throw 'Nalog igrača mora biti aktivan standardni lokalni nalog.'}
            $paths=@();$allowedPath=Join-Path $StateDirectory 'allowed-paths.json'
            if(Test-Path -LiteralPath $allowedPath){$paths=@(Get-Content -Encoding UTF8 -LiteralPath $allowedPath -Raw|ConvertFrom-Json)}
            if($maintenanceActive){$paths=@()} # Admin sessions remain unrestricted; player enforcement persists across reboot.
            foreach($path in $paths){Assert-GManagerProtectedPath $path}
            $shell=Join-Path $config.Client.InstallRoot 'shell\GManager.Client.Shell.exe'
            Assert-GManagerProtectedPath $shell
            $essentials=@('LogonUI.exe','userinit.exe','winlogon.exe','dwm.exe','fontdrvhost.exe','ctfmon.exe','RuntimeBroker.exe','sihost.exe','taskhostw.exe')|ForEach-Object {Join-Path $env:WINDIR "System32\$_"}
            $executables=@($paths)+@($shell)+@($essentials|Where-Object {Test-Path -LiteralPath $_})
            foreach($path in $executables){Assert-GManagerProtectedPath $path}
            $trustedPaths=$paths
            $trustedFile=Join-Path $StateDirectory 'trusted-applications.json'
            if(Test-Path -LiteralPath $trustedFile){$trustedPaths=@(Get-Content -Encoding UTF8 -LiteralPath $trustedFile -Raw|ConvertFrom-Json)}
            foreach($path in $trustedPaths){Assert-GManagerProtectedPath $path}
            $dlls=@(Get-GManagerDllPaths $trustedPaths $config.Client.InstallRoot $StateDirectory)
            $evidence=$null
            if(!$VerifyEnforcement){
                $evidence=Get-Content -Encoding UTF8 -LiteralPath (Join-Path $StateDirectory 'enforcement-verification.json') -Raw|ConvertFrom-Json
                Assert-GManagerEnforcementEvidence $evidence $capabilities $config
            }
            if($VerifyEnforcement){
                # Prepare immutable, valid canaries before changing policy. Missing files cannot pass.
                $nonce=[guid]::NewGuid().ToString('N')
                $journal.probeNonce=$nonce;Write-GManagerPolicyJson $journalPath $journal
                $probeRoot=Join-Path $config.Client.InstallRoot 'service\enforcement-probe'
                if(!(Test-Path -LiteralPath $probeRoot)){New-Item -ItemType Directory -Path $probeRoot|Out-Null}
                Assert-GManagerProtectedPath $probeRoot -Directory
                foreach($extension in @('.exe','.dll')){
                    $destination=Join-Path $probeRoot ($nonce+$extension)
                    $source=if($extension -eq '.exe'){Join-Path $env:WINDIR 'System32\whoami.exe'}else{Join-Path $env:WINDIR 'System32\version.dll'}
                    Copy-Item -LiteralPath $source -Destination $destination
                    $probeFiles+=$destination
                }
                $probeExe=Join-Path $config.Client.InstallRoot 'service\GManager.Client.Service.exe'
                $positive=Join-Path $env:WINDIR 'System32\whoami.exe'
                $artifact=Add-GManagerRestrictions $current $sid (@($executables)+@($probeExe,$positive)) $dlls
                $rules=$artifact.rules;$modes=$artifact.modes
                $journal.pending=@($rules.Keys);$journal.modes=$modes
                foreach($entry in $rules.GetEnumerator()){$journal.ruleXml[$entry.Key]=$entry.Value}
                $journal.phase='Applying'
                if(!$journal.appIdService){
                    $serviceSettings=Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Services\AppIDSvc'
                    $delayed=if($serviceSettings.PSObject.Properties.Name -contains 'DelayedAutoStart'){[int]$serviceSettings.DelayedAutoStart}else{0}
                    $journal.appIdService=@{start=[int]$serviceSettings.Start;delayedAutoStart=$delayed;delayedPresent=($serviceSettings.PSObject.Properties.Name -contains 'DelayedAutoStart');wasRunning=((Get-Service AppIDSvc).Status -eq 'Running')}
                }
                Write-GManagerPolicyJson $journalPath $journal
                # AppIDSvc is protected on recent Windows; use the supported SCM command, not Set-Service.
                $null=Set-GManagerApplicationIdentityStartup 'auto'
                $journal.serviceRestoreNeedsReboot=$false
                Start-Service AppIDSvc
                (Get-Service AppIDSvc).WaitForStatus([ServiceProcess.ServiceControllerStatus]::Running,[TimeSpan]::FromSeconds(15))
                $current.Save($file);Set-AppLockerPolicy -XmlPolicy $file
                Assert-GManagerEffectivePolicy ([xml](Get-AppLockerPolicy -Local -Xml)) $rules
                Assert-GManagerEffectivePolicy ([xml](Get-AppLockerPolicy -Effective -Xml)) $rules
                Invoke-GManagerEnforcementProbe $config $nonce
                # Revoke the two temporary executable exceptions before accepting the installation.
                Remove-GManagerOwnedRules $current @{owned=@($rules.Keys);pending=@();ruleXml=$rules;modes=$modes}
                $artifact=Add-GManagerRestrictions $current $sid $executables $dlls
                $rules=$artifact.rules;$modes=$artifact.modes
            }else{
                $artifact=Add-GManagerRestrictions $current $sid $executables $dlls
                $rules=$artifact.rules;$modes=$artifact.modes
                Start-Service AppIDSvc
            }
            # Union remains recoverable if power is lost on either side of this second write.
            $journal.owned=@((@($journal.owned)+@($journal.pending))|Select-Object -Unique);$journal.pending=@($rules.Keys);$journal.modes=$modes
            foreach($entry in $rules.GetEnumerator()){$journal.ruleXml[$entry.Key]=$entry.Value}
            $journal.phase='Verifying';Write-GManagerPolicyJson $journalPath $journal
            $current.Save($file);Set-AppLockerPolicy -XmlPolicy $file
            Assert-GManagerEffectivePolicy ([xml](Get-AppLockerPolicy -Local -Xml)) $rules
            $effective=Get-AppLockerPolicy -Effective
            Assert-GManagerEffectivePolicy ([xml](Get-AppLockerPolicy -Effective -Xml)) $rules
            foreach($path in $executables){
                $decision=@(Test-AppLockerPolicy -PolicyObject $effective -Path $path -User $sid)
                if($decision.Count -ne 1 -or $decision[0].PolicyDecision -ne 'Allowed'){throw "Efektivna politika ne dozvoljava potrebnu aplikaciju: $path"}
            }
            $denyTargets=if($VerifyEnforcement){@($probeExe,$positive)+$probeFiles}else{@(Join-Path $env:WINDIR 'System32\cmd.exe')}
            foreach($path in $denyTargets){
                $decision=@(Test-AppLockerPolicy -PolicyObject $effective -Path $path -User $sid)
                if($decision.Count -ne 1 -or $decision[0].PolicyDecision -notin @('Denied','DeniedByDefault')){throw "Efektivna politika nije opozvala test dozvolu: $path"}
            }
            $capabilities.EnforcementVerified=$true
            Write-GManagerPolicyJson (Join-Path $StateDirectory 'windows-capabilities.json') $capabilities
            $physicalTime=if($VerifyEnforcement){[DateTimeOffset]::UtcNow.ToString('o')}else{$evidence.physicalProbeTime}
            Write-GManagerPolicyJson (Join-Path $StateDirectory 'enforcement-verification.json') @{schema=1;verified=$true;timestamp=[DateTimeOffset]::UtcNow.ToString('o');physicalProbeTime=$physicalTime;bootTime=$capabilities.BootTime;build=$capabilities.Build;revision=$capabilities.Revision;playerSid=$sid;clientVersion=$config.Client.Version;collections=@('Exe','Script','Msi','Dll','Appx');physicalProbe=@('EXE_ALLOW','EXE_DENY','DLL_ALLOW','DLL_DENY','SCRIPT_MSI_HOSTS_DENY');interactiveAcceptance='REQUIRED'}
        }else{
            $journal.phase='Restoring';Write-GManagerPolicyJson $journalPath $journal
            if((@($journal.owned)+@($journal.pending)).Count){
                Start-Service AppIDSvc
                (Get-Service AppIDSvc).WaitForStatus([ServiceProcess.ServiceControllerStatus]::Running,[TimeSpan]::FromSeconds(15))
            }
            $current.Save($file);Set-AppLockerPolicy -XmlPolicy $file
            [xml]$restored=Get-AppLockerPolicy -Local -Xml
            foreach($id in @($journal.owned)+@($journal.pending)){if($restored.SelectSingleNode("/AppLockerPolicy/RuleCollection/*[@Id='$id']")){throw 'Windows nije uklonio G-Manager pravilo.'}}
            if($Action -eq 'Remove' -and $journal.appIdService){
                $settings=Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Services\AppIDSvc'
                $originalDelayed=if($journal.appIdService.PSObject.Properties.Name -contains 'delayedAutoStart'){[int]$journal.appIdService.delayedAutoStart}else{0}
                $currentDelayed=if($settings.PSObject.Properties.Name -contains 'DelayedAutoStart'){[int]$settings.DelayedAutoStart}else{0}
                $alreadyRestored=$settings.Start -eq $journal.appIdService.start -and $originalDelayed -eq $currentDelayed
                if(!$alreadyRestored -and ($settings.Start -ne 2 -or $currentDelayed -ne 0)){throw 'AppIDSvc konfiguracija je promenjena izvan Client-a; potrebno je administratorsko razrešenje.'}
                if(!$alreadyRestored){
                    # Do not disable enforcement required by rules installed by somebody else.
                    if($journal.appIdService.start -ne 2 -and @($restored.SelectNodes('/AppLockerPolicy/RuleCollection/*')).Count -and (ConvertTo-GManagerCanonicalRule $restored.OuterXml) -ne (ConvertTo-GManagerCanonicalRule $journal.baseline)){throw 'Nove tuđe AppLocker politike zavise od AppIDSvc; administrator mora razrešiti start konfiguraciju.'}
                    $start= switch([int]$journal.appIdService.start){2{'auto'}3{'demand'}4{'disabled'}default{throw 'Nepoznata originalna AppIDSvc konfiguracija.'}}
                    if($start -eq 'auto' -and $originalDelayed -eq 1){$start='delayed-auto'}
                    $journal.serviceRestoreNeedsReboot=$true;Write-GManagerPolicyJson $journalPath $journal
                    $journal.serviceRestoreNeedsReboot=[bool](Set-GManagerApplicationIdentityStartup $start -Restore)
                    if($journal.serviceRestoreNeedsReboot){Write-PolicyEvent 'APPIDSVC_STARTUP_RESTORED_REBOOT_REQUIRED'}
                }
                if($journal.appIdService.PSObject.Properties.Name -contains 'delayedPresent' -and !$journal.appIdService.delayedPresent){
                    $settings=Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Services\AppIDSvc'
                    if($settings.PSObject.Properties.Name -contains 'DelayedAutoStart' -and $settings.DelayedAutoStart -eq 0){Remove-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Services\AppIDSvc' -Name DelayedAutoStart}
                }
            }
            Write-GManagerPolicyJson (Join-Path $StateDirectory 'enforcement-verification.json') @{verified=$false;timestamp=[DateTimeOffset]::UtcNow.ToString('o');state=$Action}
        }
        $journal.owned=@($rules.Keys);$journal.pending=@();$journal.modes=$modes;$journal.ruleXml=$rules
        $journal.phase=if($maintenanceActive){'MaintenanceLocked'}elseif($Action -eq 'Apply'){'Applied'}else{'Removed'}
        if($Action -eq 'Remove'){$journal.appIdService=$null}
        Write-GManagerPolicyJson $journalPath $journal
        Write-PolicyEvent 'COMPLETE'
    }catch{
        $failure=$_
        Write-GManagerPolicyJson (Join-Path $StateDirectory 'enforcement-verification.json') @{verified=$false;timestamp=[DateTimeOffset]::UtcNow.ToString('o');state='FAILED'}
        Write-PolicyEvent 'FAILED'
        # Never leave an interactive player using a partially applied/previous active policy.
        if($config){try{Disconnect-GManagerPlayerSessions $config.Client.PlayerSid}catch{Write-PolicyEvent 'PLAYER_LOGOFF_FAILED'}}
        throw $failure
    }finally{
        foreach($path in $probeFiles){if(Test-Path -LiteralPath $path){Remove-Item -LiteralPath $path -Force}}
        $mutex.ReleaseMutex();$mutex.Dispose()
    }
}
