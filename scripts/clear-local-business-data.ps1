param(
  [switch]$ConfirmDelete
)

if (-not $ConfirmDelete) {
  Write-Host "This will delete local AL SIRAJ business/test data only." -ForegroundColor Yellow
  Write-Host "Run again with: powershell -ExecutionPolicy Bypass -File scripts\clear-local-business-data.ps1 -ConfirmDelete" -ForegroundColor Cyan
  exit 1
}

$candidateRoots = @(
  (Join-Path $env:APPDATA "AL SIRAJ DEVELOPERS\ZameenKhata_Database"),
  (Join-Path $env:APPDATA "al-siraj-developers\ZameenKhata_Database"),
  (Join-Path $env:APPDATA "ZameenKhata\ZameenKhata_Database"),
  (Join-Path $env:LOCALAPPDATA "AL SIRAJ DEVELOPERS\ZameenKhata_Database"),
  (Join-Path $env:USERPROFILE "Desktop\ZameenKhata_Exports")
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

if (-not $candidateRoots.Count) {
  Write-Host "No local AL SIRAJ data folders found." -ForegroundColor Green
  exit 0
}

foreach ($root in $candidateRoots) {
  $resolved = (Resolve-Path -LiteralPath $root).Path
  if ($resolved -notmatch 'ZameenKhata|AL SIRAJ|al-siraj') {
    throw "Safety stop: unexpected path $resolved"
  }
  Write-Host "Deleting: $resolved" -ForegroundColor Yellow
  Remove-Item -LiteralPath $resolved -Recurse -Force
}

Write-Host "Local business/test data deleted. Start the app again; it will recreate clean Excel files." -ForegroundColor Green
