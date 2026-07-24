# Ohamar Zalo-only — Windows VPS one-shot setup + start
# Run in PowerShell (can be non-admin after Node is installed):
#   cd C:\ohamar-deploy\ohamar
#   Set-ExecutionPolicy -Scope Process Bypass -Force
#   .\scripts\windows\setup-and-start.ps1
#
# First time only: install Node 22 LTS from https://nodejs.org if `node` missing.

$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (-not (Test-Path (Join-Path $Root "package.json"))) {
  # script lives in ohamar/scripts/windows → root is ../..
  $Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
}
Set-Location $Root
Write-Host "=== Ohamar root: $Root ===" -ForegroundColor Cyan

# --- Node check ---
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host @"

[!] Chua co Node.js trong PATH.

1) Tai Node 22 LTS Windows x64: https://nodejs.org/
2) Cai .msi (tick Add to PATH)
3) DONG het PowerShell, mo lai
4) Chay lai script nay

"@ -ForegroundColor Yellow
  exit 1
}
Write-Host "Node: $(node -v)  npm: $(npm -v)"

# Disable Lead Core enforce on Windows unless user already set
if (-not $env:LEAD_CORE_ENFORCE) {
  $env:LEAD_CORE_ENFORCE = "0"
}
# Persist soft default into .env files if missing
foreach ($envFile in @("data\.env", "data-worker\.env")) {
  $p = Join-Path $Root $envFile
  if (Test-Path $p) {
    $txt = Get-Content $p -Raw -ErrorAction SilentlyContinue
    if ($txt -notmatch "LEAD_CORE_ENFORCE") {
      Add-Content $p "`r`n# Windows VPS: tat enforce Lead Core neu Core khong chay`r`nLEAD_CORE_ENFORCE=0`r`n"
      Write-Host "Appended LEAD_CORE_ENFORCE=0 -> $envFile"
    }
  }
}

Write-Host "`n=== npm install (ohamar) ===" -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -ne 0) { throw "npm install failed" }

$zalo = Join-Path $Root "vendor\zaloclaw"
if (Test-Path (Join-Path $zalo "package.json")) {
  Write-Host "`n=== npm install (zaloclaw) ===" -ForegroundColor Cyan
  Push-Location $zalo
  npm install --omit=dev
  if ($LASTEXITCODE -ne 0) { Pop-Location; throw "zaloclaw npm install failed" }
  Pop-Location
}

Write-Host "`n=== Start Gia Huy (main) + Minh Phat (worker) ===" -ForegroundColor Cyan
# Explicit env — works even if package.json still has Unix-style OHAMAR_INSTANCE=...
$mainCmd = "Set-Location '$Root'; `$env:LEAD_CORE_ENFORCE='0'; `$env:OHAMAR_INSTANCE='main'; node scripts/start.mjs"
$workerCmd = "Set-Location '$Root'; `$env:LEAD_CORE_ENFORCE='0'; `$env:OHAMAR_INSTANCE='worker'; node scripts/start.mjs"

Start-Process powershell -ArgumentList @("-NoExit", "-Command", $mainCmd)
Start-Sleep -Seconds 2
Start-Process powershell -ArgumentList @("-NoExit", "-Command", $workerCmd)

Write-Host @"

Da mo 2 cua so PowerShell:
  - npm run start        (Gia Huy :18789)
  - npm run start:worker (Minh Phat :18790)

Neu Zalo im (doi may):
  cd $Root
  npm run zalo:login
  npm run zalo:login:worker

API key: kiem tra data\.env va data-worker\.env

"@ -ForegroundColor Green
