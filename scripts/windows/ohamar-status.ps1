# Ohamar - STATUS (one click)
# Kiem tra: Node version, 4 port, pid/lock, health endpoint

$ErrorActionPreference = "Continue"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $Root
$Host.UI.RawUI.WindowTitle = "Ohamar - Status"

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "   OHAMAR - STATUS" -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "   root: $Root" -ForegroundColor Gray
Write-Host ""

# --- Node ---
$nodeRaw = ""
if (Get-Command node -ErrorAction SilentlyContinue) { $nodeRaw = (node -v).Trim() }

function Test-NodeOk {
  param([string]$Raw)
  if (-not $Raw) { return $false }
  $v = [version]($Raw.TrimStart("v"))
  if ($v.Major -eq 22) { return $v -ge [version]"22.22.3" }
  if ($v.Major -eq 24) { return $v -ge [version]"24.15.0" }
  if ($v.Major -ge 25) { return $v -ge [version]"25.9.0" }
  return $false
}

Write-Host "  -- RUNTIME --" -ForegroundColor Cyan
if (-not $nodeRaw) {
  Write-Host "   node        : [X] khong co trong PATH" -ForegroundColor Red
} elseif (Test-NodeOk $nodeRaw) {
  Write-Host "   node        : [OK] $nodeRaw" -ForegroundColor Green
} else {
  Write-Host "   node        : [X] $nodeRaw - openclaw can >=22.22.3 / >=24.15.0 / >=25.9.0" -ForegroundColor Red
}

# --- Ports ---
$svcs = @(
  @{ Port = 18789; Name = "Gia Huy (main)"    ; Health = "http://127.0.0.1:18789" },
  @{ Port = 18790; Name = "Minh Phat (worker)"; Health = "http://127.0.0.1:18790" },
  @{ Port = 18792; Name = "Lead Core"         ; Health = "http://127.0.0.1:18792/v1/health" },
  @{ Port = 18793; Name = "Ops Console"       ; Health = "http://127.0.0.1:18793" }
)

Write-Host ""
Write-Host "  -- SERVICES --" -ForegroundColor Cyan

foreach ($s in $svcs) {
  $listening = $false
  $procId = $null
  try {
    $conn = Get-NetTCPConnection -LocalPort $s.Port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -First 1
    if ($conn) { $listening = $true; $procId = $conn.OwningProcess }
  } catch {
    $listening = [bool](netstat -ano | Select-String ":$($s.Port)\s+.*LISTENING")
  }

  $label = "{0,-20}" -f $s.Name
  if ($listening) {
    $pidTxt = if ($procId) { "pid $procId" } else { "" }
    Write-Host "   [UP]   :$($s.Port)  $label $pidTxt" -ForegroundColor Green
  } else {
    Write-Host "   [DOWN] :$($s.Port)  $label" -ForegroundColor DarkGray
  }
}

# --- pid / lock files ---
Write-Host ""
Write-Host "  -- STATE FILES --" -ForegroundColor Cyan
foreach ($pair in @(@("data","main"), @("data-worker","worker"))) {
  $d    = $pair[0]
  $inst = $pair[1]
  $pidFile = Join-Path $Root (Join-Path $d "ohamar-gateway.pid")
  if (Test-Path $pidFile) {
    $storedPid = (Get-Content $pidFile -Raw).Trim()
    $alive = $null -ne (Get-Process -Id $storedPid -ErrorAction SilentlyContinue)
    $state = if ($alive) { "alive" } else { "DEAD (stale)" }
    $color = if ($alive) { "Green" } else { "Yellow" }
    Write-Host ("   {0,-8} pid {1,-8} {2}" -f $inst, $storedPid, $state) -ForegroundColor $color
  } else {
    Write-Host ("   {0,-8} khong co pid file" -f $inst) -ForegroundColor DarkGray
  }
}

# --- Health endpoints ---
Write-Host ""
Write-Host "  -- HEALTH --" -ForegroundColor Cyan
foreach ($s in $svcs) {
  try {
    $r = Invoke-WebRequest -Uri $s.Health -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
    Write-Host ("   [{0}] {1,-20} {2}" -f $r.StatusCode, $s.Name, $s.Health) -ForegroundColor Green
  } catch {
    Write-Host ("   [--] {0,-20} khong phan hoi" -f $s.Name) -ForegroundColor DarkGray
  }
}

# --- Chi tiet tu health.mjs cua project ---
Write-Host ""
Write-Host "  -- OHAMAR health.mjs --" -ForegroundColor Cyan
foreach ($inst in @("main", "worker")) {
  $env:OHAMAR_INSTANCE = $inst
  & node scripts/health.mjs 2>&1 | ForEach-Object { "     $_" }
  Write-Host ""
}
Remove-Item Env:\OHAMAR_INSTANCE -ErrorAction SilentlyContinue

Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""
Read-Host "  Enter de dong"
