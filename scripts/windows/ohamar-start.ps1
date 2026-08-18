# Ohamar - START FULL STACK (one click)
# Lead Core (18792) + Gia Huy main (18789) + Minh Phat worker (18790) + Ops Console (18793)
#
# Usage:
#   .\scripts\windows\ohamar-start.ps1
#   .\scripts\windows\ohamar-start.ps1 -NoOps        # skip ops console
#   .\scripts\windows\ohamar-start.ps1 -NoLeadCore   # skip lead core

param(
  [switch]$NoOps,
  [switch]$NoLeadCore,
  [switch]$OpenBrowser
)

$ErrorActionPreference = "Continue"

# --- Resolve project root (script lives in <root>\scripts\windows) ---
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
if (-not (Test-Path (Join-Path $Root "package.json"))) {
  Write-Host "[X] Khong tim thay package.json tai: $Root" -ForegroundColor Red
  Read-Host "Enter de dong"
  exit 1
}
Set-Location $Root

$Host.UI.RawUI.WindowTitle = "Ohamar - Start Stack"
Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "   OHAMAR - START FULL STACK" -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "   root: $Root"
Write-Host ""

# --- Node check (openclaw needs >=22.22.3 <23 || >=24.15 <25 || >=25.9) ---
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  Write-Host "[X] Node.js khong co trong PATH. Cai Node 22 LTS: https://nodejs.org" -ForegroundColor Red
  Read-Host "Enter de dong"
  exit 1
}

$nodeRaw = (node -v).Trim()
Write-Host "   node: $nodeRaw   npm: $(npm -v)" -ForegroundColor Gray

function Test-NodeOk {
  param([string]$Raw)
  $v = [version]($Raw.TrimStart("v"))
  if ($v.Major -eq 22) { return $v -ge [version]"22.22.3" }
  if ($v.Major -eq 24) { return $v -ge [version]"24.15.0" }
  if ($v.Major -ge 25) { return $v -ge [version]"25.9.0" }
  return $false
}

if (-not (Test-NodeOk $nodeRaw)) {
  Write-Host ""
  Write-Host "  [!] CANH BAO: Node $nodeRaw KHONG duoc openclaw ho tro." -ForegroundColor Yellow
  Write-Host "      Can: >=22.22.3 <23  hoac  >=24.15.0 <25  hoac  >=25.9.0" -ForegroundColor Yellow
  Write-Host "      2 bot Zalo se KHONG start duoc. Nang Node tai https://nodejs.org" -ForegroundColor Yellow
  Write-Host ""
}

# Windows: khong ep Lead Core enforce neu user chua set
if (-not $env:LEAD_CORE_ENFORCE) { $env:LEAD_CORE_ENFORCE = "0" }

# --- Network drive check: SQLite WAL (Lead Core) KHONG chay tren o dia mang ---
$driveLetter = ($Root -split ":")[0] + ":"
$isNetworkDrive = $false
try {
  $dt = (Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$driveLetter'" -ErrorAction Stop).DriveType
  # 4 = Network drive
  if ($dt -eq 4) { $isNetworkDrive = $true }
} catch { }

if ($isNetworkDrive -and -not $NoLeadCore) {
  Write-Host ""
  Write-Host "  [!] Project dang o o dia MANG ($driveLetter) - SQLite WAL khong hoat dong." -ForegroundColor Yellow
  Write-Host "      Lead Core se loi 'database is locked' => tu dong BO QUA Lead Core." -ForegroundColor Yellow
  Write-Host "      Muon dung Lead Core: copy project sang o local (vd C:\ohamar)." -ForegroundColor Yellow
  Write-Host ""
  $NoLeadCore = $true
}


# --- helper: mo 1 cua so PowerShell chay 1 service ---
function Start-Svc {
  param(
    [string]$Title,
    [string]$Inner,     # lenh powershell chay ben trong
    [int]$Port = 0
  )
  $cmd = "`$Host.UI.RawUI.WindowTitle='Ohamar :: $Title'; Set-Location '$Root'; " +
         "`$env:LEAD_CORE_ENFORCE='$($env:LEAD_CORE_ENFORCE)'; $Inner"
  Start-Process powershell -ArgumentList @("-NoExit", "-NoProfile", "-Command", $cmd) | Out-Null
  $label = if ($Port -gt 0) { "$Title  (:$Port)" } else { $Title }
  Write-Host "   [+] $label" -ForegroundColor Green
}

Write-Host "  -- Dang mo cac cua so service --" -ForegroundColor Cyan

# 1) Lead Core
if (-not $NoLeadCore) {
  if (Test-Path (Join-Path $Root "services\lead-core\.env")) {
    Start-Svc -Title "Lead Core" -Port 18792 -Inner "node services/lead-core/src/server.mjs"
    Start-Sleep -Seconds 2
  } else {
    Write-Host "   [-] Lead Core bo qua (thieu services\lead-core\.env)" -ForegroundColor DarkYellow
  }
}

# 2) Gia Huy (main)
Start-Svc -Title "Gia Huy (main)" -Port 18789 -Inner "`$env:OHAMAR_INSTANCE='main'; node scripts/start.mjs"
Start-Sleep -Seconds 2

# 3) Minh Phat (worker)
Start-Svc -Title "Minh Phat (worker)" -Port 18790 -Inner "`$env:OHAMAR_INSTANCE='worker'; node scripts/start.mjs"
Start-Sleep -Seconds 1

# 4) Ops Console
if (-not $NoOps) {
  Start-Svc -Title "Ops Console" -Port 18793 -Inner "`$env:OPS_IDLE_SEC='60'; node services/ops-console/src/server.mjs"
}

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "   DA MO XONG" -ForegroundColor Green
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "   Gia Huy      http://127.0.0.1:18789"
Write-Host "   Minh Phat    http://127.0.0.1:18790"
Write-Host "   Lead Core    http://127.0.0.1:18792/v1/health"
Write-Host "   Ops Console  http://127.0.0.1:18793"
Write-Host ""
Write-Host "   Kiem tra:  Ohamar Status (shortcut)" -ForegroundColor Gray
Write-Host "   Dung het:  Ohamar Stop   (shortcut)" -ForegroundColor Gray
Write-Host "   Zalo im?   npm run zalo:login  /  npm run zalo:login:worker" -ForegroundColor Gray
Write-Host ""

if ($OpenBrowser -and -not $NoOps) {
  Start-Sleep -Seconds 3
  Start-Process "http://127.0.0.1:18793"
}

Write-Host "  Cua so nay tu dong dong sau 12s (cac service chay o cua so rieng)." -ForegroundColor DarkGray
Start-Sleep -Seconds 12
