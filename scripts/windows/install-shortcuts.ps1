# Ohamar - Tao 3 shortcut tren Desktop
#   Ohamar Start   (xanh)  - bat toan bo stack
#   Ohamar Stop            - dung toan bo
#   Ohamar Status          - kiem tra
#
# Chay 1 lan:
#   powershell -ExecutionPolicy Bypass -File .\scripts\windows\install-shortcuts.ps1
#
# Xoa: -Remove

param(
  [switch]$Remove,
  [string]$DesktopPath
)

$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
if (-not (Test-Path (Join-Path $Root "package.json"))) {
  throw "Khong tim thay package.json tai: $Root"
}

if (-not $DesktopPath) { $DesktopPath = [Environment]::GetFolderPath("Desktop") }
if (-not (Test-Path $DesktopPath)) { throw "Khong tim thay Desktop: $DesktopPath" }

Write-Host ""
Write-Host "  Ohamar shortcut installer" -ForegroundColor Cyan
Write-Host "   root    : $Root" -ForegroundColor Gray
Write-Host "   desktop : $DesktopPath" -ForegroundColor Gray
Write-Host ""

$pwsh = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"

# Icon: dung icon he thong san co (khong can file .ico rieng)
$imageresDll = Join-Path $env:SystemRoot "System32\imageres.dll"
$shell32Dll  = Join-Path $env:SystemRoot "System32\shell32.dll"

$items = @(
  @{
    Name    = "Ohamar Start"
    Script  = "ohamar-start.ps1"
    Desc    = "Ohamar: bat Lead Core + Gia Huy + Minh Phat + Ops Console"
    Icon    = "$imageresDll,101"   # mui ten xanh / play
    Args    = "-OpenBrowser"
  },
  @{
    Name    = "Ohamar Stop"
    Script  = "ohamar-stop.ps1"
    Desc    = "Ohamar: dung toan bo stack"
    Icon    = "$imageresDll,100"   # dau X do
    Args    = ""
  },
  @{
    Name    = "Ohamar Status"
    Script  = "ohamar-status.ps1"
    Desc    = "Ohamar: kiem tra trang thai cac service"
    Icon    = "$shell32Dll,23"     # thong tin / kinh lup
    Args    = ""
  }
)

if ($Remove) {
  foreach ($it in $items) {
    $lnk = Join-Path $DesktopPath ("{0}.lnk" -f $it.Name)
    if (Test-Path $lnk) {
      Remove-Item $lnk -Force
      Write-Host "   [xoa] $($it.Name)" -ForegroundColor Yellow
    } else {
      Write-Host "   [--]  $($it.Name) (khong co)" -ForegroundColor DarkGray
    }
  }
  Write-Host ""
  Write-Host "  Da xoa shortcut." -ForegroundColor Green
  Write-Host ""
  return
}

$shell = New-Object -ComObject WScript.Shell

foreach ($it in $items) {
  $scriptPath = Join-Path $Root ("scripts\windows\" + $it.Script)
  if (-not (Test-Path $scriptPath)) {
    Write-Host "   [!] thieu script: $scriptPath" -ForegroundColor Red
    continue
  }

  $lnkPath = Join-Path $DesktopPath ("{0}.lnk" -f $it.Name)
  $sc = $shell.CreateShortcut($lnkPath)
  $sc.TargetPath       = $pwsh
  $sc.Arguments        = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" $($it.Args)".Trim()
  $sc.WorkingDirectory = $Root
  $sc.Description      = $it.Desc
  $sc.WindowStyle      = 1
  try { $sc.IconLocation = $it.Icon } catch { }
  $sc.Save()

  Write-Host "   [+] $($it.Name)" -ForegroundColor Green
}

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "   XONG - 3 shortcut da o tren Desktop" -ForegroundColor Green
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "   Ohamar Start   -> bat toan bo + mo Ops Console"
Write-Host "   Ohamar Stop    -> dung toan bo"
Write-Host "   Ohamar Status  -> kiem tra"
Write-Host ""
Write-Host "   Muon gan hotkey (vd Ctrl+Alt+O):" -ForegroundColor Gray
Write-Host "     Right-click shortcut > Properties > o 'Shortcut key' > bam to hop" -ForegroundColor Gray
Write-Host ""
Write-Host "   Xoa shortcut: install-shortcuts.ps1 -Remove" -ForegroundColor DarkGray
Write-Host ""
