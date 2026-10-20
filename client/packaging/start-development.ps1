param(
    [Parameter(Mandatory=$true)][string]$BackendUrl,
    [Parameter(Mandatory=$true)][string]$PolicySigningPublicKey,
    [Parameter(Mandatory=$true)][string]$PolicySigningKeyId,
    [string]$ServiceExecutable=(Join-Path $PSScriptRoot '..\src\GManager.Client.Service\bin\Debug\net10.0-windows10.0.19041.0\GManager.Client.Service.exe'),
    [string]$ShellExecutable=(Join-Path $PSScriptRoot '..\src\GManager.Client.Shell\bin\Debug\net10.0-windows10.0.19041.0\GManager.Client.Shell.exe')
)
$ErrorActionPreference='Stop'
if(Get-Service GManagerClient -ErrorAction SilentlyContinue){throw 'Development režim nije dozvoljen na računaru sa instaliranim produkcionim Client servisom.'}
$backend=[uri]$BackendUrl
if(!$backend.IsAbsoluteUri -or ($backend.Scheme -ne 'https' -and !($backend.Scheme -eq 'http' -and $backend.IsLoopback)) -or $backend.UserInfo){throw 'Razvojni server mora koristiti HTTPS ili lokalni loopback HTTP.'}
foreach($exe in @($ServiceExecutable,$ShellExecutable)){if(!(Test-Path -LiteralPath $exe -PathType Leaf)){throw "Nedostaje već pripremljena izvršna datoteka: $exe. Skripta ne pokreće build."}}
foreach($exe in @($ServiceExecutable,$ShellExecutable)){
    $marker=Join-Path (Split-Path $exe -Parent) 'runtime-capabilities.json'
    if(!(Test-Path -LiteralPath $marker)){throw 'Izvršne datoteke su iz starog Client-a bez bezbednog development režima. Pripremite novu verziju iz ovog izvornog koda.'}
    $capabilities=Get-Content -LiteralPath $marker -Raw|ConvertFrom-Json
    if($capabilities.managementProtocol -ne 2 -or !$capabilities.development){throw 'Izvršne datoteke ne podržavaju bezbedan development režim.'}
}
$state=Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'GManager\Development'
New-Item -ItemType Directory -Path $state -Force|Out-Null
$configPath=Join-Path $state 'client.json'
if(Test-Path -LiteralPath (Join-Path $state 'identity.dpapi')){
    $existing=Get-Content -LiteralPath $configPath -Raw|ConvertFrom-Json
    if($existing.Backend.BaseUrl -ne $BackendUrl){throw 'Postojeći razvojni identitet pripada drugom serveru. Koristite prethodni server ili uklonite isključivo razvojni identitet.'}
}
@{Client=@{Mode='Development';Version='0.1.0-dev'};Backend=@{BaseUrl=$BackendUrl};Policy=@{SigningPublicKey=$PolicySigningPublicKey;SigningKeyId=$PolicySigningKeyId};Logging=@{LogLevel=@{Default='Warning'}}}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $configPath -Encoding UTF8
if(!(Test-Path -LiteralPath (Join-Path $state 'identity.dpapi'))){
    $secret=Read-Host 'Jednokratni enrollment token za RAZVOJNU stanicu' -AsSecureString
    $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    try{
        $start=[Diagnostics.ProcessStartInfo]::new((Resolve-Path -LiteralPath $ServiceExecutable).Path,'--development --enroll-stdin');$start.UseShellExecute=$false;$start.RedirectStandardInput=$true;$start.CreateNoWindow=$true
        $process=[Diagnostics.Process]::Start($start)
        try{$process.StandardInput.WriteLine([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer));$process.StandardInput.Close();if(!$process.WaitForExit(30000)){$process.Kill();throw 'Enrollment nije završen na vreme.'};if($process.ExitCode -ne 0){throw 'Razvojni enrollment nije uspeo.'}}finally{$process.Dispose()}
    }finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer);$secret.Dispose()}
}
$service=$null;$shell=$null
try{
    $service=Start-Process -FilePath (Resolve-Path -LiteralPath $ServiceExecutable).Path -ArgumentList '--development' -WindowStyle Hidden -PassThru
    $shell=Start-Process -FilePath (Resolve-Path -LiteralPath $ShellExecutable).Path -ArgumentList '--development' -PassThru
    Write-Host 'Development Client je pokrenut u običnom prozoru. Zatvaranjem prozora zaustavlja se razvojni Service.'
    $shell.WaitForExit()
}finally{if($service -and !$service.HasExited){Stop-Process -Id $service.Id -Force};if($shell -and !$shell.HasExited){Stop-Process -Id $shell.Id -Force}}
