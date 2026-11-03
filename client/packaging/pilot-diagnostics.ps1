param([string]$OutputDirectory=(Join-Path $env:TEMP ('GManager-Pilot-'+[Guid]::NewGuid().ToString('N'))))
$ErrorActionPreference='Stop'
$destination=[IO.Path]::GetFullPath($OutputDirectory)
New-Item -Path $destination -ItemType Directory -Force | Out-Null
$state=Join-Path $env:ProgramData 'GManager\Client'
$service=Get-CimInstance Win32_Service -Filter "Name='GManagerClient'" | Select-Object Name,State,StartMode,ExitCode
$service | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $destination 'service.json') -Encoding UTF8
$healthPath=Join-Path $state 'health.json'
if(Test-Path -LiteralPath $healthPath){
    try{
        $health=Get-Content -LiteralPath $healthPath -Raw | ConvertFrom-Json
        $health | Select-Object timestamp,mode,version,initialized,development,enforcementVerified,errorCode,serverConnected,deadline |
            ConvertTo-Json | Set-Content -LiteralPath (Join-Path $destination 'health.json') -Encoding UTF8
    }catch{'Health data could not be read; inspect service recovery.'|Set-Content -LiteralPath (Join-Path $destination 'health-error.txt') -Encoding UTF8}
}
# Paths, hashes and Authenticode status support explicit helper/launcher rules. No command lines,
# browser history, user files, identity private keys, tokens or client.json are copied.
$pathsFile=Join-Path $state 'trusted-applications.json'
Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath } | Select-Object ProcessId,ParentProcessId,ExecutablePath |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $destination 'process-paths.json') -Encoding UTF8
if(Test-Path -LiteralPath $pathsFile){
    try{$paths=Get-Content -LiteralPath $pathsFile -Raw | ConvertFrom-Json}catch{$paths=@();'Application configuration could not be read.'|Set-Content -LiteralPath (Join-Path $destination 'applications-error.txt') -Encoding UTF8}
    $applications=foreach($path in $paths){
        try{if(Test-Path -LiteralPath $path -PathType Leaf){
            $file=Get-Item -LiteralPath $path; $signature=Get-AuthenticodeSignature -LiteralPath $path
            [pscustomobject]@{Path=$file.FullName;Version=$file.VersionInfo.FileVersion;Sha256=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash;SignatureStatus=[string]$signature.Status;Publisher=$signature.SignerCertificate.Subject}
        }else{[pscustomobject]@{Path=$path;Missing=$true}}}catch{[pscustomobject]@{Path=$path;ReadError=$_.Exception.GetType().Name}}
    }
    @($applications) | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $destination 'applications.json') -Encoding UTF8
}
$eventsPath=Join-Path $state 'operational.jsonl'
if(Test-Path -LiteralPath $eventsPath){
    $events=foreach($line in (Get-Content -LiteralPath $eventsPath -Tail 500)){
        try{$event=$line|ConvertFrom-Json;if($event.eventCode -cmatch '^[A-Z0-9_]{1,80}$'){$event|Select-Object timestamp,eventCode,operation,phase}}catch{}
    }
    @($events)|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $destination 'events.json') -Encoding UTF8
}
[pscustomobject]@{CollectedAt=[DateTimeOffset]::UtcNow;Computer=$env:COMPUTERNAME;PhysicalEnforcement='UNVERIFIED';Compatibility='UNVERIFIED'}|
    ConvertTo-Json|Set-Content -LiteralPath (Join-Path $destination 'pilot.json') -Encoding UTF8
Write-Output $destination
