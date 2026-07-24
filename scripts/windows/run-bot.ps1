# Background runner for one bot instance (main | worker).
# Runs node IN-PROCESS so env + logs work reliably under Task Scheduler.
#
#   .\scripts\windows\run-bot.ps1 -Instance main
#   .\scripts\windows\run-bot.ps1 -Instance worker

param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("main", "worker")]
  [string]$Instance
)

$ErrorActionPreference = "Continue"
$Root = "C:\ohamar-deploy\ohamar"
if (-not (Test-Path (Join-Path $Root "package.json"))) {
  $Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
}
Set-Location $Root

$env:OHAMAR_INSTANCE = $Instance
if (-not $env:LEAD_CORE_ENFORCE) { $env:LEAD_CORE_ENFORCE = "0" }
# Ensure node/npm on PATH for scheduled tasks (often missing SYSTEM/user PATH)
$nodeDir = "C:\Program Files\nodejs"
if (Test-Path $nodeDir) {
  $env:Path = "$nodeDir;" + $env:Path
}

$logDir = Join-Path $Root $(if ($Instance -eq "worker") { "data-worker\logs" } else { "data\logs" })
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$log = Join-Path $logDir "autostart-$Instance.log"
$stdout = Join-Path $logDir "stdout-$Instance.log"
$stderr = Join-Path $logDir "stderr-$Instance.log"

function Write-Log([string]$msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
  Add-Content -Path $log -Value $line -Encoding UTF8
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Log "ERROR: node not in PATH. Path=$($env:Path)"
  exit 1
}

Write-Log "Starting instance=$Instance root=$Root node=$($node.Source) OHAMAR_INSTANCE=$($env:OHAMAR_INSTANCE)"

while ($true) {
  try {
    # Clear stale lock if previous crash left pid file
    $state = if ($Instance -eq "worker") { "data-worker" } else { "data" }
    foreach ($f in @("ohamar-gateway.pid", "ohamar-gateway.lock")) {
      $lp = Join-Path $Root "$state\$f"
      if (Test-Path $lp) {
        try { Remove-Item $lp -Force -ErrorAction SilentlyContinue } catch {}
      }
    }

    Write-Log "Launching node scripts/start.mjs ..."
    $p = Start-Process -FilePath $node.Source `
      -ArgumentList @("scripts\start.mjs") `
      -WorkingDirectory $Root `
      -PassThru `
      -Wait `
      -WindowStyle Hidden `
      -RedirectStandardOutput $stdout `
      -RedirectStandardError $stderr

    $code = $p.ExitCode
    Write-Log "Process exited code=$code — restart in 15s (see stderr-$Instance.log)"
  } catch {
    Write-Log "ERROR: $($_.Exception.Message) — retry in 15s"
  }
  Start-Sleep -Seconds 15
}
