param(
  [switch]$Yes
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$resetScript = Join-Path $PSScriptRoot "reset-test-data.ps1"

Write-Host ""
Write-Host "AL SIRAJ DEVELOPERS - CLEAN HANDOVER DATA" -ForegroundColor Yellow
Write-Host "This clears test/business rows from Supabase DB, Supabase Storage files, and local Excel/cache data." -ForegroundColor Yellow
Write-Host "It keeps schema, functions, policies, CEO/accountant login accounts, and push configuration." -ForegroundColor Yellow
Write-Host ""

if (-not (Test-Path $resetScript)) {
  throw "Missing reset script: $resetScript"
}

if ($Yes) {
  & $resetScript -Yes
} else {
  & $resetScript
}

Write-Host ""
Write-Host "Handover cleanup finished." -ForegroundColor Green
