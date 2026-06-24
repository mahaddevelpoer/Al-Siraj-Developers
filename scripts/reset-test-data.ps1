param(
  [switch]$Yes
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$sqlFile = Join-Path $repoRoot "src\sql\reset-test-data.sql"
$appDataRoot = Join-Path $env:APPDATA "zameen-khata"
$backupRoot = Join-Path $appDataRoot ("handover-backup-" + (Get-Date -Format "yyyyMMdd-HHmmss"))

Write-Host ""
Write-Host "AL SIRAJ DEVELOPERS - TEST DATA RESET" -ForegroundColor Yellow
Write-Host "This will delete Supabase business/test rows, Supabase Storage files, and move local Excel/cache files to a backup folder." -ForegroundColor Yellow
Write-Host "It will NOT delete login accounts or database schema." -ForegroundColor Yellow
Write-Host ""

if (-not $Yes) {
  $answer = Read-Host "Type RESET to continue"
  if ($answer -ne "RESET") {
    Write-Host "Cancelled."
    exit 0
  }
}

if (-not (Test-Path $sqlFile)) {
  throw "SQL file not found: $sqlFile"
}

Write-Host "Resetting Supabase business data..." -ForegroundColor Cyan
supabase db query --linked --file $sqlFile

if (Test-Path $appDataRoot) {
  Write-Host "Backing up and clearing local Excel/cache data..." -ForegroundColor Cyan
  New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null

  $patterns = @(
    "*.xlsx",
    "*.xlsm",
    "*.xls",
    "*.csv",
    "*.json",
    "*.db",
    "*.sqlite",
    "*.sqlite3"
  )

  foreach ($pattern in $patterns) {
    Get-ChildItem -Path $appDataRoot -Recurse -File -Filter $pattern -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -notlike "$backupRoot*" } |
      ForEach-Object {
        $relative = $_.FullName.Substring($appDataRoot.Length).TrimStart("\")
        $target = Join-Path $backupRoot $relative
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
        Move-Item -LiteralPath $_.FullName -Destination $target -Force
      }
  }

  Write-Host "Local backup saved at: $backupRoot" -ForegroundColor Green
}

Write-Host ""
Write-Host "Reset complete. Open the software and add real data now." -ForegroundColor Green
