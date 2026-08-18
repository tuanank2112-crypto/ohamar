# Ohamar - STOP FULL STACK (one click)
# Dung 2 gateway (pid/lock qua scripts/stop.mjs) + Lead Core (18792) + Ops Console (18793)

param(
  [switch]$Quiet
)

$ErrorActionPreference = "Continue"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
if (-not (Test-Path (Join-Path $Root "package.json"))) {
  Write-Host "[X] Khong tim thay package.json tai: $Root" -ForegroundColor Red
  Read-Host "Enter de dong"
  exit 1
}
Set-Location $Root

$Host.UI.RawUI.WindowTitle = "Ohamar - Stop Stack"
Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "   OHAMAR - STOP FULL STACK" -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""

# --- 1) Graceful stop 2 gateway qua script co san (SIGTERM -> 15s -> SIGKILL) ---
foreach ($inst in @("main", "worker")) {
  Write-Host "  -- stop gateway: $inst" -ForegroundColor Cyan
  $env:OHAMAR_INSTANCE = $inst
  & node scripts/stop.mjs 2>&1 | ForEach-Object { "     $_" }
}
Remove-Item Env:\OHAMAR_INSTANCE -ErrorAction SilentlyContinue

# --- 2) Kill process con dang giu port (lead-core, ops-console, gateway sot) ---
$ports = @(
  @{ Port = 18789; Name = "Gia Huy (main)" },
  @{ Port = 18790; Name = "Minh Phat (worker)" },
  @{ Port = 18792; Name = "Lead Core" },
  @{ Port = 18793; Name = "Ops Console" }
)

Write-Host ""
Write-Host "  -- don port con sot --" -ForegroundColor Cyan

foreach ($entry in $ports) {
  $p = $entry.Port
  $name = $entry.Name
  $pids = @()
  try {
    $pids = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique
  } catch {
    # PowerShell cu / khong co module -> fallback netstat
    $pids = netstat -ano | Select-String ":$p\s" | ForEach-Object {
      ($_ -split '\s+')[-1]
    } | Sort-Object -Unique
  }

  if (-not $pids -or $pids.Count -eq 0) {
    Write-Host "     [ok]   :$p  $name - da tat" -ForegroundColor DarkGray
    continue
  }

  foreach ($procId in $pids) {
    if (-not $procId -or $procId -eq 0) { continue }
    try {
      $proc = Get-Process -Id $procId -ErrorAction Stop
      Stop-Process -Id $procId -Force -ErrorAction Stop
      Write-Host "     [kill] :$p  $name - pid $procId ($($proc.ProcessName))" -ForegroundColor Yellow
    } catch {
      Write-Host "     [!]    :$p  $name - khong kill duoc pid $procId" -ForegroundColor Red
    }
  }
}

# --- 3) Don pid/lock file con sot ---
foreach ($d in @("data", "data-worker")) {
  foreach ($f in @("ohamar-gateway.pid", "ohamar-gateway.lock")) {
    $lp = Join-Path $Root (Join-Path $d $f)
    if (Test-Path $lp) {
      Remove-Item $lp -Force -ErrorAction SilentlyContinue
      Write-Host "     [rm]   $d\$f" -ForegroundColor DarkGray
    }
  }
}

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "   DA DUNG TOAN BO STACK" -ForegroundColor Green
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Luu y: cac cua so PowerShell cua service co the con mo - dong tay." -ForegroundColor DarkGray
Write-Host ""

if (-not $Quiet) {
  Start-Sleep -Seconds 8
}
