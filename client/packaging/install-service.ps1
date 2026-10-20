# Compatibility entry point; installation uses the same transactional implementation.
param(
    [Parameter(Mandatory=$true)][string]$PackageDirectory,
    [string]$BackendUrl,
    [Parameter(Mandatory=$true)][string]$PolicySigningPublicKey,
    [Parameter(Mandatory=$true)][string]$PolicySigningKeyId,
    [Parameter(Mandatory=$true)][string]$SigningSubject,
    [Parameter(Mandatory=$true)][string]$SigningThumbprint,
    [Parameter(Mandatory=$true)][string]$PlayerAccount,
    [string]$LocalCaCertificate,[string]$ExpectedCaSha256
)
& (Join-Path $PSScriptRoot 'GManager-Setup.ps1') @PSBoundParameters
