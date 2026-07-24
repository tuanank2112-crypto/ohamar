# Install Ohamar as Windows Scheduled Tasks (chay nen, tu start khi dang nhap / reboot)
#
#   cd C:\ohamar-deploy\ohamar
#   Set-ExecutionPolicy -Scope Process Bypass -Force
#   .\scripts\windows\install-autostart.ps1
#
# Sau do co the DONG het cua so PowerShell / RDP — bot van chay.
# Go:  .\scripts\windows\uninstall-autostart.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (-not (Test-Path (Join-Path $Root "package.json"))) {
  $Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

$runner = Join-Path $Root "scripts\windows\run-bot.ps1"
if (-not (Test-Path $runner)) { throw "Missing $runner" }

$tasks = @(
  @{ Name = "Ohamar-GiaHuy"; Instance = "main" },
  @{ Name = "Ohamar-MinhPhat"; Instance = "worker" }
)

$ps = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"

foreach ($t in $tasks) {
  $name = $t.Name
  $inst = $t.Instance
  # Remove old definition if re-running
  Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue

  $arg = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$runner`" -Instance $inst"
  $action = New-ScheduledTaskAction -Execute $ps -Argument $arg -WorkingDirectory $Root
  $triggerLogon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $triggerStartup = New-ScheduledTaskTrigger -AtStartup
  $settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 5 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew
  $principal = New-ScheduledTaskPrincipal `
    -UserId $env:USERNAME `
    -LogonType Interactive `
    -RunLevel Highest

  Register-ScheduledTask `
    -TaskName $name `
    -Action $action `
    -Trigger @($triggerLogon, $triggerStartup) `
    -Settings $settings `
    -Principal $principal `
    -Description "Ohamar Zalo bot ($inst) — auto restart" `
    -Force | Out-Null

  Start-ScheduledTask -TaskName $name
  Write-Host "OK task $name (instance=$inst) registered + started" -ForegroundColor Green
}

Write-Host @"

=== Da cai autostart ===

Bot chay NEN qua Task Scheduler — khong can mo cua so.
Co the DONG RDP / tat PowerShell; bot van song (may VPS phai bat).

Kiem tra:
  Get-ScheduledTask -TaskName Ohamar-*
  Get-Process node -ErrorAction SilentlyContinue

Log:
  $Root\data\logs\autostart-main.log
  $Root\data-worker\logs\autostart-worker.log
  $Root\data\logs\stdout-main.log
  $Root\data-worker\logs\stdout-worker.log

Dung bot:
  Stop-ScheduledTask -TaskName Ohamar-GiaHuy
  Stop-ScheduledTask -TaskName Ohamar-MinhPhat
  # hoac: .\scripts\windows\uninstall-autostart.ps1

"@ -ForegroundColor Cyan
