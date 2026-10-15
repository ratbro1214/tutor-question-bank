$ErrorActionPreference = 'Stop'
if (Test-Path -LiteralPath 'E:\AI\environment.ps1') { . 'E:\AI\environment.ps1' }
$taskNode = 'C:\Users\asus\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$taskPlan = (& $taskNode (Join-Path $PSScriptRoot 'fetch-open-math.mjs') --plan) | ConvertFrom-Json
$taskRoot = Join-Path (Split-Path $PSScriptRoot -Parent) 'data\open-math'
$taskManifest = @()
foreach ($taskRepo in $taskPlan) {
  $taskRecords = @()
  foreach ($taskFile in $taskRepo.files) {
    $taskTarget = Join-Path $taskRoot ('sources\' + $taskRepo.id + '\' + $taskFile)
    New-Item -ItemType Directory -Force -Path (Split-Path $taskTarget -Parent) | Out-Null
    $taskUrl = 'https://raw.githubusercontent.com/' + $taskRepo.repo + '/' + $taskRepo.commit + '/' + (($taskFile.Split('/') | ForEach-Object { [uri]::EscapeDataString($_) }) -join '/')
    Invoke-WebRequest -Uri $taskUrl -OutFile $taskTarget -TimeoutSec 30
    $taskRecords += @{ path=$taskFile; sha256=(Get-FileHash -LiteralPath $taskTarget -Algorithm SHA256).Hash.ToLower(); bytes=(Get-Item -LiteralPath $taskTarget).Length }
  }
  $taskManifest += @{id=$taskRepo.id; repo=$taskRepo.repo; commit=$taskRepo.commit; license=$taskRepo.license; url=('https://github.com/'+$taskRepo.repo); fetchedOn='2026-10-11'; files=$taskRecords}
  Write-Output ($taskRepo.id + ': ' + $taskRecords.Count + ' files')
}
ConvertTo-Json -InputObject $taskManifest -Depth 6 | Set-Content -LiteralPath (Join-Path $taskRoot 'manifest.json') -Encoding utf8
