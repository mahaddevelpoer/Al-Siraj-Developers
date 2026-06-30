param(
  [switch]$Local,
  [switch]$CloudStorage,
  [switch]$OpenCloudSql,
  [switch]$All,
  [string]$ConfirmText = ""
)

$ErrorActionPreference = "Stop"

$requiredPhrase = "DELETE AL SIRAJ TEST DATA"
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$localScript = Join-Path $repoRoot "scripts\clear-local-business-data.ps1"
$storageScript = Join-Path $repoRoot "scripts\clear-cloud-storage.mjs"
$cloudSql = Join-Path $repoRoot "src\sql\clear-all-business-data.sql"

function Write-Step($text) {
  Write-Host ""
  Write-Host "== $text ==" -ForegroundColor Cyan
}

function Require-Confirmation {
  if ($ConfirmText -ne $requiredPhrase) {
    Write-Host "Safety stop. No data was deleted." -ForegroundColor Yellow
    Write-Host "This script removes test/business data but keeps app code, schema, auth users, and login profiles." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To run cleanup, use this exact confirmation phrase:" -ForegroundColor Yellow
    Write-Host "  -ConfirmText `"$requiredPhrase`"" -ForegroundColor Green
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Cyan
    Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\handover-reset-all-test-data.ps1 -Local -ConfirmText `"$requiredPhrase`""
    Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\handover-reset-all-test-data.ps1 -All -ConfirmText `"$requiredPhrase`""
    exit 1
  }
}

function Show-Plan {
  Write-Step "Reset Plan"
  Write-Host "Local Excel/app data cleanup: $($Local -or $All)"
  Write-Host "Cloud Storage cleanup:       $($CloudStorage -or $All)"
  Write-Host "Open cloud SQL file:         $($OpenCloudSql -or $All)"
  Write-Host ""
  Write-Host "Cloud database rows are cleared by running this SQL in Supabase SQL Editor:" -ForegroundColor Yellow
  Write-Host "  $cloudSql"
  Write-Host ""
  Write-Host "CEO Android app data comes from Supabase. After cloud SQL is run, old test data disappears from the app after refresh/relogin." -ForegroundColor Yellow
  Write-Host "Phone local cache/session can be cleared by uninstalling the APK or Android Settings > Apps > AL SIRAJ DEVELOPERS > Storage > Clear data." -ForegroundColor Yellow
}

Show-Plan
Require-Confirmation

if (-not ($Local -or $CloudStorage -or $OpenCloudSql -or $All)) {
  Write-Host "No cleanup target selected. Use -Local, -CloudStorage, -OpenCloudSql, or -All." -ForegroundColor Yellow
  exit 1
}

if ($Local -or $All) {
  Write-Step "Local Cleanup"
  if (-not (Test-Path -LiteralPath $localScript)) {
    throw "Missing local cleanup script: $localScript"
  }
  & powershell -ExecutionPolicy Bypass -File $localScript -ConfirmDelete
}

if ($OpenCloudSql -or $All) {
  Write-Step "Cloud Database SQL"
  if (-not (Test-Path -LiteralPath $cloudSql)) {
    throw "Missing SQL file: $cloudSql"
  }
  Write-Host "Opening SQL file. Paste/run it in Supabase SQL Editor to clear cloud DB test rows." -ForegroundColor Green
  Start-Process notepad.exe $cloudSql
}

if ($CloudStorage -or $All) {
  Write-Step "Cloud Storage Cleanup"
  if (-not (Test-Path -LiteralPath $storageScript)) {
    throw "Missing storage cleanup script: $storageScript"
  }
  if (-not $env:SUPABASE_URL -or -not $env:SUPABASE_SERVICE_ROLE_KEY) {
    Write-Host "Cloud storage was NOT deleted because required env vars are missing." -ForegroundColor Yellow
    Write-Host "Set these first, then rerun with -CloudStorage:" -ForegroundColor Yellow
    Write-Host '  $env:SUPABASE_URL="https://YOUR_PROJECT.supabase.co"'
    Write-Host '  $env:SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"'
  } else {
    node $storageScript
  }
}

Write-Step "Done"
Write-Host "Selected cleanup steps completed or opened for manual confirmation." -ForegroundColor Green
Write-Host "After cloud SQL cleanup, open desktop app once and run Settings > System Health Audit." -ForegroundColor Green
