# Cap nhat code Ohamar tu git (nhanh sync/vps) — KHONG dung data/ credentials.
#
#   cd C:\ohamar-deploy\ohamar
#   Set-ExecutionPolicy -Scope Process Bypass -Force
#   .\scripts\windows\update-from-git.ps1
#
# Tuy chon:
#   .\scripts\windows\update-from-git.ps1 -Branch sync/vps
#   .\scripts\windows\update-from-git.ps1 -SkipNpm
#   .\scripts\windows\update-from-git.ps1 -NoRestart

param(
  [string]$Branch = "sync/vps",
  [switch]$SkipNpm,
  [switch]$NoRestart
)

$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (-not (Test-Path (Join-Path $Root "package.json"))) {
  $Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}
Set-Location $Root

$nodeDir = "C:\Program Files\nodejs"
if (Test-Path $nodeDir) { $env:Path = "$nodeDir;" + $env:Path }

function Assert-Cmd($name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "Thieu lenh '$name' trong PATH. Cai Git for Windows + Node 22."
  }
}

Assert-Cmd git
Assert-Cmd node

if (-not (Test-Path (Join-Path $Root ".git"))) {
  throw @"
Chua co .git trong $Root

Lan dau (mot lan):
  cd $Root
  git init
  git remote add origin <URL-repo-private>
  git fetch origin $Branch
  git checkout -B $Branch origin/$Branch

Hoac xem docs/SYNC-VPS.md
"@
}

Write-Host "=== Ohamar update-from-git ===" -ForegroundColor Cyan
Write-Host "root:   $Root"
Write-Host "branch: $Branch"

# Bao ve data — chi can nhac (da .gitignore)
foreach ($d in @("data", "data-worker")) {
  if (Test-Path (Join-Path $Root $d)) {
    Write-Host "keep:   $d\ (khong bi git xoa)" -ForegroundColor DarkGray
  }
}

$prev = (git rev-parse --abbrev-ref HEAD 2>$null)
Write-Host "was:    $prev @ $(git rev-parse --short HEAD 2>$null)"

git fetch origin $Branch
if ($LASTEXITCODE -ne 0) { throw "git fetch failed" }

# Stash local dirty (neu co) — khong stash data ignored
$dirty = git status --porcelain
if ($dirty) {
  Write-Host "stash local tracked changes..." -ForegroundColor Yellow
  git stash push -m "update-from-git auto $(Get-Date -Format o)" --quiet
}

git checkout -B $Branch "origin/$Branch"
if ($LASTEXITCODE -ne 0) { throw "git checkout failed" }

git reset --hard "origin/$Branch"
if ($LASTEXITCODE -ne 0) { throw "git reset --hard failed" }

Write-Host "now:    $(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD)" -ForegroundColor Green

# Heal BOM neu ai do edit bang Notepad
foreach ($rel in @("data\openclaw.json", "data-worker\openclaw.json")) {
  $p = Join-Path $Root $rel
  if (-not (Test-Path $p)) { continue }
  $bytes = [System.IO.File]::ReadAllBytes($p)
  if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    $text = [System.Text.Encoding]::UTF8.GetString($bytes, 3, $bytes.Length - 3)
    [System.IO.File]::WriteAllText($p, $text, (New-Object System.Text.UTF8Encoding $false))
    Write-Host "stripped BOM: $rel" -ForegroundColor Yellow
  }
}

if (-not $SkipNpm) {
  Write-Host "npm install..." -ForegroundColor Cyan
  npm install --no-fund --no-audit
  if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
  if (Test-Path (Join-Path $Root "vendor\zaloclaw\package.json")) {
    Push-Location (Join-Path $Root "vendor\zaloclaw")
    try {
      npm install --omit=dev --no-fund --no-audit
    } finally {
      Pop-Location
    }
  }
}

if (-not $NoRestart) {
  Write-Host "restart Scheduled Tasks..." -ForegroundColor Cyan
  foreach ($t in @("Ohamar-GiaHuy", "Ohamar-MinhPhat")) {
    $task = Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue
    if ($task) {
      Restart-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue
      if ($task.State -ne "Running") {
        Start-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue
      }
      Write-Host "  $t -> restarted" -ForegroundColor Green
    } else {
      Write-Host "  $t not found (skip)" -ForegroundColor DarkYellow
    }
  }
  Start-Sleep -Seconds 15
  $env:OHAMAR_INSTANCE = "main"
  node scripts/health.mjs
  $env:OHAMAR_INSTANCE = "worker"
  node scripts/health.mjs
}

Write-Host @"

=== Done ===
Code: origin/$Branch
Data/credentials: giu nguyen tren VPS

Tiep: DM Zalo thu 1-1. Neu loi: Get-Content data\logs\autostart-main.log -Tail 30

"@ -ForegroundColor Cyan
