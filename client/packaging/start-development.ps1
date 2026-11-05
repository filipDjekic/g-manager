param(
    [string]$BackendUrl,
    [switch]$Stop,
    [switch]$ResetState
)
$ErrorActionPreference='Stop'
$state=Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'GManager\Development'
New-Item -ItemType Directory -Path $state -Force | Out-Null
$lock=$null; $service=$null; $shell=$null
function Send-Local([string]$type) {
    $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $pipe=[IO.Pipes.NamedPipeClientStream]::new('.',('GManager.Client.Dev.'+$sid),[IO.Pipes.PipeDirection]::InOut,[IO.Pipes.PipeOptions]::Asynchronous,[Security.Principal.TokenImpersonationLevel]::Identification)
    try {
        $pipe.Connect(1500)
        $writer=[IO.StreamWriter]::new($pipe,[Text.UTF8Encoding]::new($false),4096,$true)
        $reader=[IO.StreamReader]::new($pipe,[Text.UTF8Encoding]::new($false),$false,4096,$true)
        try {
            $writer.AutoFlush=$true
            $writer.WriteLine((@{Type=$type;RequestId=[guid]::NewGuid().ToString('N')}|ConvertTo-Json -Compress))
            $read=$reader.ReadLineAsync()
            if(!$read.Wait(15000)){throw 'SHELL_CONNECTION_FAILED: Named Pipe odgovor nije stigao.'}
            $result=$read.Result|ConvertFrom-Json
            if(!$result -or !$result.State){throw 'SHELL_CONNECTION_FAILED: Neispravan Named Pipe odgovor.'}
            return $result
        } finally {$reader.Dispose();$writer.Dispose()}
    } finally {$pipe.Dispose()}
}
try {
    if($Stop){
        # A stop signal is consumed only by the launcher holding this user's instance lock.
        Set-Content -LiteralPath (Join-Path $state 'stop.request') -Value 'stop'
        Write-Host 'Zatrazeno zaustavljanje Development Client-a.'
        exit 0
    }
    try {$lock=[IO.File]::Open((Join-Path $state 'launcher.instance'),'OpenOrCreate','ReadWrite','None')}
    catch {throw 'DEVELOPMENT_ALREADY_RUNNING: Koristite stop-development.cmd pre ponovnog pokretanja.'}
    Remove-Item -LiteralPath (Join-Path $state 'stop.request') -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath (Join-Path $state 'health.json') -ErrorAction SilentlyContinue
    if(Get-Service GManagerClient -ErrorAction SilentlyContinue){throw 'Development nije dozvoljen uz instalirani produkcioni Service.'}
    foreach($instanceName in @('service.instance','shell.instance')){
        try {$instanceProbe=[IO.File]::Open((Join-Path $state $instanceName),'OpenOrCreate','ReadWrite','None');$instanceProbe.Dispose()}
        catch {throw "DEVELOPMENT_ALREADY_RUNNING: $instanceName je zauzet. Zatvorite postojeci Development Client pre pokretanja."}
    }
    # Build at user launch, not during installation or production startup. Incremental builds
    # ensure a copied capability marker can never authorize an obsolete helper executable.
    $clientRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
    if(!(Get-Command dotnet -ErrorAction SilentlyContinue)){throw 'DEVELOPMENT_SDK_MISSING: Instalirajte .NET SDK naveden u client/global.json.'}
    Push-Location $clientRoot
    try {
        foreach($project in @('Service','Shell')){
            & dotnet build (Join-Path $clientRoot "src\GManager.Client.$project\GManager.Client.$project.csproj") --configuration Debug --nologo
            if($LASTEXITCODE -ne 0){throw "DEVELOPMENT_BUILD_FAILED: $project nije pripremljen. Pogledajte konkretne compiler greske iznad; stari executable nije pokrenut."}
        }
    } finally {Pop-Location}
    # Only the output just prepared from this checkout is accepted.
    $ServiceExecutable=Join-Path $clientRoot 'src\GManager.Client.Service\bin\Debug\net10.0-windows10.0.19041.0\GManager.Client.Service.exe'
    $ShellExecutable=Join-Path $clientRoot 'src\GManager.Client.Shell\bin\Debug\net10.0-windows10.0.19041.0\GManager.Client.Shell.exe'
    foreach($exe in @($ServiceExecutable,$ShellExecutable)){
        if(!(Test-Path -LiteralPath $exe -PathType Leaf)){throw "SERVICE_NOT_STARTED: Nedostaje executable posle Development build-a: $exe."}
        $marker=Join-Path (Split-Path $exe -Parent) 'runtime-capabilities.json'
        if(!(Test-Path -LiteralPath $marker)){throw 'Nedostaje runtime-capabilities.json; pripremite aktuelni Client.'}
        $caps=Get-Content -LiteralPath $marker -Raw|ConvertFrom-Json
        if($caps.managementProtocol -ne 2 -or !$caps.development){throw 'Client ne podrzava Development rezim.'}
    }
    $root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
    $compose=Get-Content -LiteralPath (Join-Path $root 'docker-compose.yml') -Raw
    $configPath=Join-Path $state 'client.json'
    $existing=$null
    if(Test-Path -LiteralPath $configPath){$existing=Get-Content -LiteralPath $configPath -Raw|ConvertFrom-Json}
    if(!$BackendUrl){if($existing){$BackendUrl=$existing.Backend.BaseUrl}else{$BackendUrl='http://localhost:8080/'}}
    $backend=[uri]$BackendUrl
    if(!$backend.IsAbsoluteUri -or !$backend.IsLoopback -or $backend.Scheme -notin @('http','https') -or $backend.UserInfo -or $backend.Query -or $backend.Fragment){throw 'Development backend mora biti lokalni loopback URL.'}
    $BackendUrl=$backend.AbsoluteUri.TrimEnd('/')+'/'
    if((Test-Path -LiteralPath (Join-Path $state 'identity.dpapi')) -and (!$existing -or ([uri]$existing.Backend.BaseUrl).AbsoluteUri.TrimEnd('/') -ne $BackendUrl.TrimEnd('/'))){throw 'ENROLLMENT_PROBLEM: Postojeci identitet pripada drugom backendu. Identitet nije uklonjen.'}
    $keyMatch=[regex]::Match($compose,'(?m)^\s+STATION_POLICY_SIGNING_KEY_ID:\s*([^\r\n]+)')
    $fileMatch=[regex]::Match($compose,'(?m)^\s+-\s+\./([^:\r\n]+):/run/secrets/local_station_policy_signing_private_key:ro\s*$')
    if(!$keyMatch.Success -or !$fileMatch.Success){throw 'SIGNING_KEY_INVALID: Compose signing konfiguracija nije podrzana.'}
    $keyId=$keyMatch.Groups[1].Value.Trim().Trim('"',"'")
    $privatePath=Join-Path $root $fileMatch.Groups[1].Value
    if(!(Test-Path -LiteralPath $privatePath)){throw 'SIGNING_KEY_INVALID: Lokalni development privatni kljuc ne postoji. Novi kljuc nije generisan.'}
    if($keyId -ne 'local-development-ed25519-v2'){throw "SIGNING_KEY_ID_MISMATCH: Lokalni Compose mora koristiti local-development-ed25519-v2; pronadjen ID: $keyId"}
    $helperStart=[Diagnostics.ProcessStartInfo]::new()
    $helperStart.FileName=(Resolve-Path -LiteralPath $ServiceExecutable).Path
    # Windows paths cannot contain a quote. The argument contains only a file path, never key bytes.
    $helperStart.Arguments='--development --development-public-key "'+$privatePath+'"'
    $helperStart.UseShellExecute=$false;$helperStart.CreateNoWindow=$true
    $helperStart.RedirectStandardOutput=$true;$helperStart.RedirectStandardError=$true
    $helper=[Diagnostics.Process]::Start($helperStart)
    try {
        $outputTask=$helper.StandardOutput.ReadToEndAsync();$errorTask=$helper.StandardError.ReadToEndAsync()
        if(!$helper.WaitForExit(15000)){$helper.Kill();throw 'SIGNING_KEY_TIMEOUT: Lokalni helper nije zavrsio za 15 sekundi.'}
        $public=$outputTask.GetAwaiter().GetResult().Trim()
        $helperError=$errorTask.GetAwaiter().GetResult().Trim()
        if($helper.ExitCode -ne 0){throw ("SIGNING_KEY_HELPER_FAILED (exit "+$helper.ExitCode+"): "+$helperError)}
        try {$publicBytes=[Convert]::FromBase64String($public)}catch {throw 'SIGNING_KEY_OUTPUT_INVALID: Helper nije vratio Base64 javni kljuc.'}
        if($publicBytes.Length -ne 44 -or [BitConverter]::ToString($publicBytes[0..11]) -ne '30-2A-30-05-06-03-2B-65-70-03-21-00'){throw 'SIGNING_KEY_OUTPUT_INVALID: Helper nije vratio Ed25519 SPKI javni kljuc.'}
    } finally {$helper.Dispose()}
    try {$health=Invoke-RestMethod -Uri ($BackendUrl+'actuator/health/readiness') -TimeoutSec 5; if($health.status -ne 'UP'){throw 'Readiness nije UP'}}
    catch {
        $status=$null
        if($_.Exception.Response){$status=[int]$_.Exception.Response.StatusCode}
        if($status){throw "BACKEND_NOT_READY: GET /actuator/health/readiness; HTTP $status; phase=backend.readiness"}
        throw 'BACKEND_UNAVAILABLE: GET /actuator/health/readiness; phase=backend.readiness; nema HTTP odgovora ili readiness nije UP.'
    }
    if($existing){
        if($existing.Client.Mode -ne 'Development'){throw 'CONFIGURATION_MODE_INVALID: Postojeca konfiguracija nije Development; fajl nije promenjen.'}
        if($existing.Policy.SigningKeyId -ne $keyId -or $existing.Policy.SigningPublicKey -ne $public){throw 'SIGNING_CONFIGURATION_MISMATCH: Postojeca Client konfiguracija ne odgovara lokalnom backend kljucu; identitet i konfiguracija nisu promenjeni.'}
        if(([uri]$existing.Backend.BaseUrl).AbsoluteUri.TrimEnd('/') -ne $BackendUrl.TrimEnd('/')){throw 'CONFIGURATION_BACKEND_MISMATCH: Postojeca konfiguracija koristi drugi backend; fajl nije promenjen.'}
    } else {
        @{Client=@{Mode='Development';Version='0.1.0-dev'};Backend=@{BaseUrl=$BackendUrl};Policy=@{SigningPublicKey=$public;SigningKeyId=$keyId};Logging=@{LogLevel=@{Default='Warning'}}}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $configPath -Encoding UTF8
    }
    if(!(Test-Path -LiteralPath (Join-Path $state 'identity.dpapi'))){
        $secret=Read-Host 'Jednokratni enrollment token za eksplicitno oznacenu DEVELOPMENT stanicu' -AsSecureString
        $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
        try {
            $start=[Diagnostics.ProcessStartInfo]::new((Resolve-Path -LiteralPath $ServiceExecutable).Path,'--development --enroll-stdin')
            $start.UseShellExecute=$false;$start.RedirectStandardInput=$true;$start.RedirectStandardError=$true;$start.CreateNoWindow=$true
            $process=[Diagnostics.Process]::Start($start)
            try {$enrollError=$process.StandardError.ReadToEndAsync();$process.StandardInput.WriteLine([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer));$process.StandardInput.Close();if(!$process.WaitForExit(30000)){$process.Kill();throw 'ENROLLMENT_PROBLEM: Timeout.'};if($process.ExitCode -ne 0){throw ('ENROLLMENT_PROBLEM (exit '+$process.ExitCode+'): '+$enrollError.GetAwaiter().GetResult().Trim())}}finally{$process.Dispose()}
        }finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer);$secret.Dispose()}
    }
    $serviceError=Join-Path $state 'service.stderr.log'
    $serviceOutput=Join-Path $state 'service.stdout.log'
    $service=Start-Process -RedirectStandardError $serviceError -RedirectStandardOutput $serviceOutput -FilePath (Resolve-Path -LiteralPath $ServiceExecutable).Path -ArgumentList '--development' -WindowStyle Hidden -PassThru
    $deadline=[DateTime]::UtcNow.AddSeconds(45)
    do {
        if($service.HasExited){throw ('SERVICE_NOT_STARTED: Service exit '+$service.ExitCode+'. '+(Get-Content -LiteralPath $serviceError -Raw -ErrorAction SilentlyContinue))}
        try {$response=Send-Local 'status';break}catch {if([DateTime]::UtcNow -gt $deadline){throw ('SHELL_CONNECTION_FAILED: Service radi, ali Named Pipe nije dostupan: '+$_.Exception.Message)};Start-Sleep -Milliseconds 250}
    }while($true)
    if($ResetState){$reset=Send-Local 'development-reset';if(!$reset.Success){throw ('RESET_REFUSED: '+$reset.Error)}; Start-Sleep -Seconds 1}
    $deadline=[DateTime]::UtcNow.AddSeconds(35)
    do {
        $response=Send-Local 'status'
        $health=Get-Content -LiteralPath (Join-Path $state 'health.json') -Raw -ErrorAction SilentlyContinue|ConvertFrom-Json
        if($health.initialized){break}
        Start-Sleep -Milliseconds 250
    }while([DateTime]::UtcNow -lt $deadline)
    if(!$health.initialized){throw 'SERVICE_NOT_READY: Inicijalizacija nije zavrsena.'}
    if($health.errorCode){
        $reason=$health.errorCode
        if($health.apiFailure){
            $failure=$health.apiFailure
            $httpStatus=if($null -ne $failure.StatusCode){[string]$failure.StatusCode}else{'nema HTTP odgovora'}
            $reason=('{0}: {1} {2}; HTTP {3}; phase={4}; {5}' -f $failure.ErrorCode,$failure.Method,$failure.Path,$httpStatus,$failure.Phase,$failure.Message)
        } elseif($response.Error){$reason=$response.Error}
        throw ('DEVELOPMENT_NOT_READY: '+$reason+'. Detalji: '+(Join-Path $state 'operational.jsonl'))
    }
    $shell=Start-Process -FilePath (Resolve-Path -LiteralPath $ShellExecutable).Path -ArgumentList '--development' -WindowStyle Normal -PassThru
    if($shell.WaitForExit(750)){throw ('SHELL_NOT_STARTED: Shell je odmah zavrsio, exit '+$shell.ExitCode+'. Proverite postojeci Shell proces i Windows runtime.')}
    Write-Host 'Development Client: simulirano stanje; fizicko Windows zakljucavanje nije provereno.'
    Write-Host 'Zaustavljanje: client\packaging\stop-development.cmd'
    while(!$shell.HasExited -and !(Test-Path -LiteralPath (Join-Path $state 'stop.request'))){if($service.HasExited){throw 'SERVICE_NOT_STARTED: Service je neocekivano zavrsio.'};Start-Sleep -Milliseconds 500}
} catch {Write-Host $_.Exception.Message -ForegroundColor Red;exit 1}
finally {
    foreach($process in @($shell,$service)){if($process){if(!$process.HasExited){$process.Kill();$process.WaitForExit()};$process.Dispose()}}
    if($lock){
        foreach($name in @('stop.request','health.json.tmp')){Remove-Item -LiteralPath (Join-Path $state $name) -ErrorAction SilentlyContinue}
        $lock.Dispose()
    }
}
