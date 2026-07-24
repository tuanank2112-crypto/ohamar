# Rewrite Linux absolute paths in openclaw.json → current Windows ROOT
#   cd C:\ohamar-deploy\ohamar
#   Set-ExecutionPolicy -Scope Process Bypass -Force
#   .\scripts\windows\fix-config-paths.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (-not (Test-Path (Join-Path $Root "package.json"))) {
  $Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}
Set-Location $Root
Write-Host "=== Fix openclaw.json paths → $Root ===" -ForegroundColor Cyan

$RootPosix = $Root -replace "\\", "/"
$oldRoots = @(
  "/home/lenkuy/ohamar",
  "C:/home/lenkuy/ohamar",
  "C:\home\lenkuy\ohamar"
)

function Fix-Text([string]$text) {
  $out = $text
  foreach ($old in $oldRoots) {
    $oldPosix = $old -replace "\\", "/"
    $oldWin = $oldPosix -replace "/", "\"
    $out = $out.Replace($old, $RootPosix)
    $out = $out.Replace($oldPosix, $RootPosix)
    $out = $out.Replace($oldWin, $Root)
  }
  # claude CLI from Linux — not on VPS
  $out = $out -replace '"command"\s*:\s*"/home/lenkuy/\.npm-global/bin/claude"', '"command": "claude"'
  return $out
}

foreach ($rel in @("data\openclaw.json", "data-worker\openclaw.json")) {
  $p = Join-Path $Root $rel
  if (-not (Test-Path $p)) {
    Write-Host "skip missing $rel" -ForegroundColor Yellow
    continue
  }
  $raw = Get-Content $p -Raw -Encoding UTF8
  $fixed = Fix-Text $raw

  # Force plugin + workspace via JSON if parseable
  try {
    $cfg = $fixed | ConvertFrom-Json
    $isWorker = $rel -like "*data-worker*"
    $ws = if ($isWorker) { Join-Path $Root "workspace-worker" } else { Join-Path $Root "workspace" }
    $zalo = Join-Path $Root "vendor\zaloclaw"

    if ($cfg.agents.defaults) {
      $cfg.agents.defaults.workspace = $ws
    }
    if (-not $cfg.plugins) { $cfg | Add-Member -NotePropertyName plugins -NotePropertyValue ([pscustomobject]@{}) }
    if (-not $cfg.plugins.load) {
      $cfg.plugins | Add-Member -NotePropertyName load -NotePropertyValue ([pscustomobject]@{ paths = @($zalo) }) -Force
    } else {
      $cfg.plugins.load.paths = @($zalo)
    }
    if ($isWorker -and $cfg.agents.list) {
      foreach ($a in $cfg.agents.list) {
        if ($a.id -eq "worker" -or $a.workspace) {
          $a.workspace = $ws
          if ($a.PSObject.Properties.Name -contains "agentDir") {
            $a.agentDir = Join-Path $Root "data-worker\agents\worker\agent"
          }
        }
      }
    }
    $bak = "$p.bak.relocate.$(Get-Date -Format 'yyyyMMddHHmmss')"
    Copy-Item $p $bak
    $cfg | ConvertTo-Json -Depth 100 | Set-Content -Path $p -Encoding UTF8
    Write-Host "OK $rel  (backup $bak)"
    Write-Host "   zaloclaw → $zalo  exists=$(Test-Path $zalo)"
  } catch {
    $bak = "$p.bak.relocate.$(Get-Date -Format 'yyyyMMddHHmmss')"
    Copy-Item $p $bak
    Set-Content -Path $p -Value $fixed -Encoding UTF8
    Write-Host "OK $rel (text replace only; JSON parse failed: $($_.Exception.Message))"
  }
}

Write-Host @"

Xong. Chay bot:

  # Cua so 1
  cd $Root
  `$env:LEAD_CORE_ENFORCE='0'; `$env:OHAMAR_INSTANCE='main'; node scripts/start.mjs

  # Cua so 2
  cd $Root
  `$env:LEAD_CORE_ENFORCE='0'; `$env:OHAMAR_INSTANCE='worker'; node scripts/start.mjs

"@ -ForegroundColor Green
