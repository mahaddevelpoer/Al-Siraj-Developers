param(
  [switch]$SkipLocal,
  [switch]$SkipCloud
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

Write-Host ""
Write-Host "AL SIRAJ DEVELOPERS - Handover Data Cleanup" -ForegroundColor Yellow
Write-Host "This deletes TEST/BUSINESS DATA only. App code, schema, functions, and login framework stay intact." -ForegroundColor Yellow
Write-Host "Local folders affected: Global, Towns, Properties" -ForegroundColor Yellow
Write-Host "Cloud affected: Supabase public business rows + storage objects from reset-test-data.sql" -ForegroundColor Yellow
Write-Host ""

$confirm = Read-Host "Type DELETE TEST DATA to continue"
if ($confirm -ne "DELETE TEST DATA") {
  Write-Host "Cancelled. No data deleted." -ForegroundColor Green
  exit 0
}

if (-not $SkipLocal) {
  $folders = @("Global", "Towns", "Properties")
  foreach ($folder in $folders) {
    $path = Join-Path $root $folder
    if (Test-Path $path) {
      Write-Host "Cleaning local folder: $folder"
      Get-ChildItem -LiteralPath $path -Force | ForEach-Object {
        Remove-Item -LiteralPath $_.FullName -Recurse -Force
      }
    } else {
      New-Item -ItemType Directory -Path $path | Out-Null
    }
  }
}

if (-not $SkipCloud) {
  $sqlFile = Join-Path $root "src\sql\reset-test-data.sql"
  if (-not (Test-Path $sqlFile)) {
    throw "Missing SQL cleanup file: $sqlFile"
  }

  $supabase = Get-Command supabase -ErrorAction SilentlyContinue
  if ($null -eq $supabase) {
    Write-Host ""
    Write-Host "Supabase CLI not found. Local cleanup is done, but cloud cleanup was NOT run." -ForegroundColor Red
    Write-Host "Open Supabase SQL Editor and run this file manually:" -ForegroundColor Yellow
    Write-Host $sqlFile -ForegroundColor Cyan
  } else {
    Write-Host "Running Supabase cloud cleanup SQL..."
    supabase db query --linked --file $sqlFile
  }
}

Write-Host ""
Write-Host "Cleanup finished. Restart the desktop app before adding real handover data." -ForegroundColor Green
