param([Parameter(Mandatory=$true)][string]$PolicyPath,[Parameter(Mandatory=$true)][string]$RollbackDirectory)
$ErrorActionPreference='Stop';$rollback=Join-Path $RollbackDirectory 'applocker-rollback.xml'
try {
  Get-AppLockerPolicy -Effective -Xml | Set-Content $rollback -Encoding utf8
  [xml]$policy=Get-Content $PolicyPath -Raw
  $policy.AppLockerPolicy.RuleCollection.FilePathRule | ForEach-Object { $path=$_.Conditions.FilePathCondition.Path; $folder=Split-Path $path; if(Test-Path $folder){icacls $folder /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-32-545:(OI)(CI)RX'|Out-Null} }
  Set-Service AppIDSvc -StartupType Automatic;Start-Service AppIDSvc
  Set-AppLockerPolicy -XmlPolicy $PolicyPath
  $chrome='HKLM:\SOFTWARE\Policies\Google\Chrome';New-Item $chrome -Force|Out-Null;New-ItemProperty $chrome DownloadRestrictions -Value 3 -PropertyType DWord -Force|Out-Null;New-ItemProperty $chrome DeveloperToolsAvailability -Value 2 -PropertyType DWord -Force|Out-Null;New-ItemProperty $chrome BrowserAddPersonEnabled -Value 0 -PropertyType DWord -Force|Out-Null
} catch { if(Test-Path $rollback){Set-AppLockerPolicy -XmlPolicy $rollback};throw }
