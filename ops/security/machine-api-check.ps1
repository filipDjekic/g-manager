param([Parameter(Mandatory=$true)][Uri]$BaseUrl)
$ErrorActionPreference='Stop'
$paths=@('api/v1/machine/heartbeat','api/v1/machine/snapshot','api/v1/machine/commands','api/v1/machine/configuration','api/v1/machine/lease')
foreach($path in $paths){try{Invoke-WebRequest ([Uri]::new($BaseUrl,$path)) -Method Get|Out-Null;throw "$path accepted an unauthenticated request"}catch{if($_.Exception.Response.StatusCode.value__ -notin 401,403){throw}}}
$response=Invoke-WebRequest ([Uri]::new($BaseUrl,'api/v1/stations/client-package'))
if(!$response.Headers['X-Content-Type-Options']){throw 'Security response headers are missing'}
Write-Output 'Machine API unauthenticated boundary and public signed-package metadata checks passed.'
