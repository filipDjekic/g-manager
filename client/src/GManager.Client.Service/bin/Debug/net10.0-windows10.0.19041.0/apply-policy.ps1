param(
    [ValidateSet('Apply','Suspend','Remove')][string]$Action='Apply',
    [Parameter(Mandatory=$true)][string]$StateDirectory
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$principal=[Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if(!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Windows politika zahteva administratorska prava.'}
$expected=Join-Path ([Environment]::GetFolderPath('CommonApplicationData')) 'GManager\Client'
if([IO.Path]::GetFullPath($StateDirectory).TrimEnd('\') -ne $expected){throw 'Nedozvoljen direktorijum Windows politike.'}
$mutex=[Threading.Mutex]::new($false,'Global\GManager.Client.Policy')
$acquired=$false
try{$acquired=$mutex.WaitOne(30000)}catch [Threading.AbandonedMutexException]{$acquired=$true}
if(!$acquired){$mutex.Dispose();throw 'Druga promena politike je u toku.'}
try {
    function Write-PolicyEvent([string]$Result) {
        @{timestamp=[DateTimeOffset]::UtcNow.ToString('o');eventCode=('POLICY_'+$Action.ToUpperInvariant());state=$Result;actor=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value}|ConvertTo-Json -Compress|Add-Content -LiteralPath (Join-Path $StateDirectory 'policy-events.jsonl') -Encoding UTF8
    }
    function Canonical-Rule([string]$Xml) {
        Add-Type -AssemblyName System.Security
        [xml]$document=$Xml
        $transform=[Security.Cryptography.Xml.XmlDsigC14NTransform]::new()
        $transform.LoadInput($document)
        $stream=$transform.GetOutput([IO.Stream]);$reader=[IO.StreamReader]::new($stream)
        try{return $reader.ReadToEnd()}finally{$reader.Dispose()}
    }
    $config=Get-Content -LiteralPath (Join-Path $StateDirectory 'client.json') -Raw | ConvertFrom-Json
    if($config.Client.Mode -ne 'Production'){throw 'Windows restrikcije nisu dostupne u development režimu.'}
    $journalPath=Join-Path $StateDirectory 'policy-journal.json'
    function Save-Journal($value) {
        $bytes=[Text.Encoding]::UTF8.GetBytes(($value|ConvertTo-Json -Depth 30))
        $stream=[IO.FileStream]::new($journalPath+'.tmp',[IO.FileMode]::Create,[IO.FileAccess]::Write,[IO.FileShare]::None,4096,[IO.FileOptions]::WriteThrough)
        try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
        if(Test-Path -LiteralPath $journalPath){[IO.File]::Replace($journalPath+'.tmp',$journalPath,$null)}else{[IO.File]::Move($journalPath+'.tmp',$journalPath)}
    }
    [xml]$current=Get-AppLockerPolicy -Local -Xml
    if(!(Test-Path -LiteralPath $journalPath)){
        if($Action -ne 'Apply'){return}
        # The local baseline is immutable. Never export Effective and import it into Local GPO.
        $journal=@{ baseline=$current.OuterXml; owned=@(); modes=@{}; pending=@(); ruleXml=@{}; phase='Prepared' }
        Save-Journal $journal
    }else{$loaded=Get-Content -LiteralPath $journalPath -Raw|ConvertFrom-Json;$journal=@{baseline=$loaded.baseline;owned=@($loaded.owned);pending=@($loaded.pending);modes=@{};ruleXml=@{};phase=$loaded.phase};foreach($entry in $loaded.modes.PSObject.Properties){$journal.modes[$entry.Name]=$entry.Value};foreach($entry in $loaded.ruleXml.PSObject.Properties){$journal.ruleXml[$entry.Name]=$entry.Value}}
    [xml]$baseline=$journal.baseline
    # Remove only our exact GUIDs, including a transaction interrupted after Set-AppLockerPolicy.
    foreach($id in @($journal.owned)+@($journal.pending)){
        $node=$current.SelectSingleNode("/AppLockerPolicy/RuleCollection/*[@Id='$id']")
        if($node){if($journal.ruleXml.ContainsKey($id) -and (Canonical-Rule $node.OuterXml) -ne (Canonical-Rule $journal.ruleXml[$id])){throw 'G-Manager pravilo je naknadno izmenjeno. Administrator mora razrešiti konflikt pre rollback-a.'};[void]$node.ParentNode.RemoveChild($node)}
    }
    foreach($type in @($journal.modes.Keys)){
        $collection=$current.SelectSingleNode("/AppLockerPolicy/RuleCollection[@Type='$type']")
        if($collection -and $collection.EnforcementMode -eq 'Enabled'){
            $collection.SetAttribute('EnforcementMode',[string]$journal.modes[$type])
        }
    }
    $maintenance=Join-Path $StateDirectory 'maintenance.json'
    if($Action -eq 'Apply' -and (Test-Path -LiteralPath $maintenance)){
        $lease=Get-Content -LiteralPath $maintenance -Raw|ConvertFrom-Json
        if([DateTimeOffset]::Parse($lease.ExpiresAt) -gt [DateTimeOffset]::UtcNow){$Action='Suspend'}
    }
    $ids=@();$modes=@{}
    if($Action -eq 'Apply'){
        $sid=[string]$config.Client.PlayerSid
        if($sid -notmatch '^S-1-5-21-\d+-\d+-\d+-\d+$'){throw 'Neispravan SID standardnog Windows naloga.'}
        $paths=@()
        $allowedPath=Join-Path $StateDirectory 'allowed-paths.json'
        if(Test-Path -LiteralPath $allowedPath){$paths=@(Get-Content -LiteralPath $allowedPath -Raw|ConvertFrom-Json)}
        # Do not modify any game-folder ACL. Refuse paths writable by a standard user.
        foreach($path in $paths){
            if($path -notmatch '^[A-Za-z]:\\' -or $path -match '[*?"%]' -or !(Test-Path -LiteralPath $path -PathType Leaf)){throw "Nedozvoljena aplikacija: $path"}
            $items=@($path);$folder=Split-Path -Path $path -Parent
            while($folder -and (Split-Path -Path $folder -Parent)){$items+=$folder;$folder=Split-Path -Path $folder -Parent}
            foreach($item in $items){
                if((Get-Item -LiteralPath $item -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw "Aplikacija koristi reparse putanju: $item"}
                $acl=Get-Acl -LiteralPath $item
                $trusted=@('S-1-5-18','S-1-5-32-544','S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464')
                if($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -notin $trusted){throw "Aplikacija mora biti u vlasništvu administratora/SYSTEM/TrustedInstaller: $item"}
                foreach($rule in $acl.Access){
                    $ruleSid=$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
                    if($rule.AccessControlType -eq 'Allow' -and $ruleSid -notin $trusted -and ([int]$rule.FileSystemRights -band 0xD0156)) {throw "Aplikacija ili direktorijum je upisiv neprivilegovanom nalogu: $item"}
                }
            }
        }
        function Add-PathRule($collection,$user,$effect,$path,$exceptions) {
            $id=[guid]::NewGuid().ToString();$script:ids+= $id
            $rule=$current.CreateElement('FilePathRule');$rule.SetAttribute('Id',$id);$rule.SetAttribute('Name','GManager.Client');$rule.SetAttribute('Description','Owned by G-Manager Client');$rule.SetAttribute('UserOrGroupSid',$user);$rule.SetAttribute('Action',$effect)
            $conditions=$current.CreateElement('Conditions');$condition=$current.CreateElement('FilePathCondition');$condition.SetAttribute('Path',$path);[void]$conditions.AppendChild($condition);[void]$rule.AppendChild($conditions)
            if(@($exceptions).Count){$except=$current.CreateElement('Exceptions');foreach($allowed in $exceptions){$element=$current.CreateElement('FilePathCondition');$element.SetAttribute('Path',$allowed);[void]$except.AppendChild($element)};[void]$rule.AppendChild($except)}
            [void]$collection.AppendChild($rule)
        }
        foreach($type in @('Exe','Script','Msi')){
            $collection=$current.SelectSingleNode("/AppLockerPolicy/RuleCollection[@Type='$type']")
            if(!$collection){$collection=$current.CreateElement('RuleCollection');$collection.SetAttribute('Type',$type);$collection.SetAttribute('EnforcementMode','NotConfigured');[void]$current.AppLockerPolicy.AppendChild($collection)}
            if($collection.EnforcementMode -eq 'AuditOnly' -and @($collection.SelectNodes('*')).Count){throw 'Postojeća AuditOnly pravila zahtevaju administratorsku pripremu AppLocker politike. G-Manager neće uključiti tuđa pravila.'}
            $modes[$type]=if($collection.HasAttribute('EnforcementMode')){$collection.GetAttribute('EnforcementMode')}else{'NotConfigured'}
            # Preserve default access for other accounts only when no local rules existed.
            # Existing allow/deny rules and domain/MDM policy are never replaced or weakened.
            if(@($collection.SelectNodes('*')).Count -eq 0){Add-PathRule $collection 'S-1-1-0' 'Allow' '*' @()}
            $collection.SetAttribute('EnforcementMode','Enabled')
            $exceptions=@()
            if($type -eq 'Exe'){
                $exceptions=@($paths)+@((Join-Path $config.Client.InstallRoot 'shell\GManager.Client.Shell.exe'))+@('LogonUI.exe','userinit.exe','winlogon.exe','dwm.exe','fontdrvhost.exe','ctfmon.exe','RuntimeBroker.exe','sihost.exe','taskhostw.exe')|ForEach-Object {if($_ -match '^[A-Za-z]:\\'){$_}else{Join-Path $env:WINDIR "System32\$_"}}
            }
            Add-PathRule $collection $sid 'Deny' '*' $exceptions
        }
        # Resolve the saved journal first on every invocation. A power failure never loses ownership.
        $journal.pending=$ids;$journal.modes=$modes;$journal.ruleXml=@{};foreach($id in $ids){$journal.ruleXml[$id]=$current.SelectSingleNode("/AppLockerPolicy/RuleCollection/*[@Id='$id']").OuterXml};$journal.phase='Applying';Save-Journal $journal
        Start-Service AppIDSvc
    }else{$journal.phase='Restoring';Save-Journal $journal}
    $file=Join-Path $StateDirectory 'policy-transaction.xml'
    $current.Save($file)
    Set-AppLockerPolicy -XmlPolicy $file
    # Verify the local store rather than assuming a successful process exit applied the policy.
    [xml]$verified=Get-AppLockerPolicy -Local -Xml
    foreach($id in $ids){if(!$verified.SelectSingleNode("/AppLockerPolicy/RuleCollection/*[@Id='$id']")){throw 'Windows nije sačuvao G-Manager AppLocker pravilo.'}}
    $journal.owned=$ids;$journal.pending=@();$journal.modes=$modes;$journal.ruleXml=@{};foreach($id in $ids){$journal.ruleXml[$id]=$verified.SelectSingleNode("/AppLockerPolicy/RuleCollection/*[@Id='$id']").OuterXml};$journal.phase=if($Action -eq 'Apply'){'Applied'}else{'Suspended'};Save-Journal $journal
    Write-PolicyEvent 'COMPLETE'
    # No Chrome, HKLM security-policy, WDAC or third-party NTFS mutations are made.
}catch{Write-PolicyEvent 'FAILED';throw}finally{$mutex.ReleaseMutex();$mutex.Dispose()}
