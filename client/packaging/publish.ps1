param(
    [ValidateSet('win-x64','win-arm64')][string]$Runtime='win-x64',
    [Parameter(Mandatory=$true)][string]$CertificateThumbprint,
    [Parameter(Mandatory=$true)][ValidatePattern('^\d+\.\d+\.\d+(\.\d+)?$')][string]$Version,
    [string]$TimestampServer='http://timestamp.digicert.com'
)
$ErrorActionPreference='Stop'
$client=Split-Path $PSScriptRoot -Parent
$artifacts=Join-Path $client 'artifacts'
$stage=Join-Path $artifacts ('release-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage -Force|Out-Null
try{
    foreach($project in @('Service','Shell')){
        & dotnet publish (Join-Path $client "src\GManager.Client.$project") -c Release -r $Runtime --self-contained -p:Version=$Version -o (Join-Path $stage $project.ToLowerInvariant())
        if($LASTEXITCODE -ne 0){throw "Publish nije uspeo: $project"}
    }
    $settings=Get-Content -LiteralPath (Join-Path $stage 'service\appsettings.json') -Raw|ConvertFrom-Json
    $settings.Client.Version=$Version
    $settings.Client|Add-Member -MemberType NoteProperty -Name Mode -Value 'Production' -Force
    $settings|ConvertTo-Json -Depth 10|Set-Content -LiteralPath (Join-Path $stage 'service\appsettings.json') -Encoding UTF8
    foreach($name in @('GManager-Setup.ps1','GManager-Setup.cmd','GManager-Management.ps1','install-service.ps1','uninstall-service.ps1','update-client.ps1','support-bundle.ps1','gmanagerctl.ps1','gmanagerctl.cmd','client-management.ps1')){
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $stage
    }
    $certificate=Get-Item -LiteralPath "Cert:\CurrentUser\My\$CertificateThumbprint"
    if(!$certificate.HasPrivateKey -or $certificate.NotAfter -lt (Get-Date)){throw 'Potreban je važeći code-signing sertifikat sa privatnim ključem na release računaru.'}
    foreach($file in Get-ChildItem -LiteralPath $stage -Recurse -File|Where-Object { $_.Extension -in @('.exe','.ps1') -or $_.Name -like 'GManager.*.dll' }){
        $signature=Set-AuthenticodeSignature -LiteralPath $file.FullName -Certificate $certificate -HashAlgorithm SHA256 -TimestampServer $TimestampServer
        if($signature.Status -ne 'Valid'){throw "Potpisivanje nije uspelo: $($file.Name) ($($signature.Status))"}
    }
    $files=@(Get-ChildItem -LiteralPath $stage -Recurse -File|Sort-Object FullName|ForEach-Object {@{path=$_.FullName.Substring($stage.Length+1);sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}})
    $release=Join-Path $stage 'release.json'
    @{version=$Version;mode='Production';runtime=$Runtime;files=$files}|ConvertTo-Json -Depth 10|Set-Content -LiteralPath $release -Encoding UTF8
    Add-Type -AssemblyName System.Security
    $cms=[Security.Cryptography.Pkcs.SignedCms]::new([Security.Cryptography.Pkcs.ContentInfo]::new([IO.File]::ReadAllBytes($release)),$true)
    $signer=[Security.Cryptography.Pkcs.CmsSigner]::new($certificate)
    $signer.DigestAlgorithm=[Security.Cryptography.Oid]::new('2.16.840.1.101.3.4.2.1')
    $cms.ComputeSignature($signer)
    [IO.File]::WriteAllBytes((Join-Path $stage 'release.p7s'),$cms.Encode())
    $zip=Join-Path $artifacts 'GManager.Client.zip'
    Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -Force
    @{version=$Version;sha256=(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant();signingSubject=$certificate.Subject;signingThumbprint=$certificate.Thumbprint}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $artifacts 'GManager.Client.manifest.json') -Encoding UTF8
    Write-Host "Potpisani produkcioni paket: $zip"
}finally{
    $resolvedStage=[IO.Path]::GetFullPath($stage);$resolvedArtifacts=[IO.Path]::GetFullPath($artifacts).TrimEnd('\')+'\'
    if(!$resolvedStage.StartsWith($resolvedArtifacts,[StringComparison]::OrdinalIgnoreCase)){throw 'Nedozvoljena putanja release direktorijuma.'}
    if(Test-Path -LiteralPath $resolvedStage){Remove-Item -LiteralPath $resolvedStage -Recurse -Force}
}
