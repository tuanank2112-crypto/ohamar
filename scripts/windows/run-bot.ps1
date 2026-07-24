# Background runner for one bot instance (main | worker).
# Compatible with Windows PowerShell 5.1 + Task Scheduler.
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
if (-not $env:LEAD_CORE_ENFORCE) {
  $env:LEAD_CORE_ENFORCE = "0"
}

$nodeDir = "C:\Program Files\nodejs"
if (Test-Path $nodeDir) {
  $env:Path = "$nodeDir;" + $env:Path
}

if ($Instance -eq "worker") {
  $logDir = Join-Path $Root "data-worker\logs"
  $stateDir = "data-worker"
} else {
  $logDir = Join-Path $Root "data\logs"
  $stateDir = "data"
}

New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$log = Join-Path $logDir "autostart-$Instance.log"
$stdout = Join-Path $logDir "stdout-$Instance.log"
$stderr = Join-Path $logDir "stderr-$Instance.log"

function Write-Log {
  param([string]$Message)
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Add-Content -Path $log -Value $line -Encoding UTF8
}

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  Write-Log "ERROR: node not in PATH. Path=$($env:Path)"
  exit 1
}

$nodeExe = $nodeCmd.Source
Write-Log "Starting instance=$Instance root=$Root node=$nodeExe OHAMAR_INSTANCE=$($env:OHAMAR_INSTANCE)"

while ($true) {
  try {
    foreach ($f in @("ohamar-gateway.pid", "ohamar-gateway.lock")) {
      $lp = Join-Path $Root (Join-Path $stateDir $f)
      if (Test-Path $lp) {
        Remove-Item $lp -Force -ErrorAction SilentlyContinue
      }
    }

    Write-Log "Launching node scripts/start.mjs ..."
    $p = Start-Process -FilePath $nodeExe `
      -ArgumentList "scripts\start.mjs" `
      -WorkingDirectory $Root `
      -PassThru `
      -Wait `
      -WindowStyle Hidden `
      -RedirectStandardOutput $stdout `
      -RedirectStandardError $stderr

    $code = $p.ExitCode
    Write-Log "Process exited code=$code - restart in 15s (see stderr-$Instance.log)"
  }
  catch {
    $err = $_.Exception.Message
    Write-Log "ERROR: $err - retry in 15s"
  }

  Start-Sleep -Seconds 15
}
