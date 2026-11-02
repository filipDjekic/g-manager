param(
    [ValidateSet('Apply','Suspend','Remove')][string]$Action='Apply',
    [Parameter(Mandatory=$true)][string]$StateDirectory,
    [switch]$VerifyEnforcement
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'windows-enforcement.ps1')
$principal=[Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if(!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Windows politika zahteva administratorska prava.'}
$expected=Join-Path ([Environment]::GetFolderPath('CommonApplicationData')) 'GManager\Client'
if([IO.Path]::GetFullPath($StateDirectory).TrimEnd('\') -ne $expected){throw 'Nedozvoljen direktorijum Windows politike.'}
Invoke-GManagerPolicyTransaction -Action $Action -StateDirectory $StateDirectory -VerifyEnforcement:$VerifyEnforcement
