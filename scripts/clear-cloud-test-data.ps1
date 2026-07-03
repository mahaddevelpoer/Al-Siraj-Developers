param(
  [string]$ConfirmText = "",
  [switch]$SkipDatabase,
  [switch]$SkipStorage
)

$ErrorActionPreference = "Stop"

$requiredPhrase = "DELETE AL SIRAJ CLOUD TEST DATA"
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$sqlFile = Join-Path $repoRoot "src\sql\clear-test-data-keep-schema.sql"
$storageScript = Join-Path $repoRoot "scripts\clear-cloud-storage.mjs"

Write-Host ""
Write-Host "AL SIRAJ DEVELOPERS - Cloud Test Data Cleanup" -ForegroundColor Yellow
Write-Host "This removes cloud TEST/BUSINESS DATA only." -ForegroundColor Yellow
Write-Host "Kept safe: schema, RLS, functions, auth.users, public.users login profiles, app code." -ForegroundColor Yellow
Write-Host "Removed: towns, properties, sales, installments, daily entries, ledgers, receipts/media rows, appeals, notifications, file manifests, and storage files." -ForegroundColor Yellow
Write-Host ""

if ($ConfirmText -ne $requiredPhrase) {
  Write-Host "Safety stop. No cloud data was deleted." -ForegroundColor Green
  Write-Host "Run with exact confirmation phrase:" -ForegroundColor Cyan
  Write-Host "powershell -ExecutionPolicy Bypass -File scripts\clear-cloud-test-data.ps1 -ConfirmText `"$requiredPhrase`"" -ForegroundColor White
  Write-Host ""
  Write-Host "Required for Storage cleanup:" -ForegroundColor Cyan
  Write-Host '$env:SUPABASE_URL="https://YOUR_PROJECT.supabase.co"'
  Write-Host '$env:SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"'
  exit 1
}

if (-not $SkipDatabase) {
  if (-not (Test-Path -LiteralPath $sqlFile)) {
    throw "Missing SQL file: $sqlFile"
  }
  $supabase = Get-Command supabase -ErrorAction SilentlyContinue
  if ($null -eq $supabase) {
    Write-Host "Supabase CLI not found. Database cleanup was NOT run." -ForegroundColor Red
    Write-Host "Open this SQL in Supabase SQL Editor and run it manually:" -ForegroundColor Yellow
    Write-Host $sqlFile -ForegroundColor Cyan
  } else {
    Write-Host "Clearing Supabase database rows..." -ForegroundColor Cyan
    supabase db query --linked --file $sqlFile
  }
}

if (-not $SkipStorage) {
  if (-not (Test-Path -LiteralPath $storageScript)) {
    throw "Missing storage cleanup script: $storageScript"
  }
  if (-not $env:SUPABASE_URL -or -not $env:SUPABASE_SERVICE_ROLE_KEY) {
    Write-Host "Storage cleanup skipped: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing." -ForegroundColor Yellow
    Write-Host "Set env vars, then rerun this script with -SkipDatabase to clean only Storage:" -ForegroundColor Yellow
    Write-Host '$env:SUPABASE_URL="https://YOUR_PROJECT.supabase.co"'
    Write-Host '$env:SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"'
    Write-Host 'powershell -ExecutionPolicy Bypass -File scripts\clear-cloud-test-data.ps1 -SkipDatabase -ConfirmText "DELETE AL SIRAJ CLOUD TEST DATA"'
  } else {
    Write-Host "Clearing Supabase Storage files through Storage API..." -ForegroundColor Cyan
    node $storageScript
  }
}

Write-Host ""
Write-Host "Cloud cleanup finished. Restart desktop app and CEO Android app before adding real data." -ForegroundColor Green
