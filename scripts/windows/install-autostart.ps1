# Install Ohamar as Windows Scheduled Tasks (background, start on logon/reboot)
#
#   cd C:\ohamar-deploy\ohamar
#   Set-ExecutionPolicy -Scope Process Bypass -Force
#   .\scripts\windows\install-autostart.ps1
#
# After this you can close PowerShell / RDP - bots keep running.
# Remove:  .\scripts\windows\uninstall-autostart.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (-not (Test-Path (Join-Path $Root "package.json"))) {
  $Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

$runner = Join-Path $Root "scripts\windows\run-bot.ps1"
if (-not (Test-Path $runner)) {
  throw "Missing $runner"
}

$taskList = @(
  @{ Name = "Ohamar-GiaHuy"; Instance = "main" },
  @{ Name = "Ohamar-MinhPhat"; Instance = "worker" }
)

$ps = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"

Import-Module ScheduledTasks -ErrorAction SilentlyContinue

foreach ($t in $taskList) {
  $name = $t.Name
  $inst = $t.Instance

  Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue

  $arg = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$runner`" -Instance $inst"
  $action = New-ScheduledTaskAction -Execute $ps -Argument $arg -WorkingDirectory $Root
  $triggerLogon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $triggerStartup = New-ScheduledTaskTrigger -AtStartup
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
  $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest

  Register-ScheduledTask -TaskName $name -Action $action -Trigger @($triggerLogon, $triggerStartup) -Settings $settings -Principal $principal -Description "Ohamar Zalo bot ($inst) auto restart" -Force | Out-Null

  try {
    Start-ScheduledTask -TaskName $name
  } catch {
    # Fallback if ScheduledTasks cmdlets incomplete
    schtasks /Run /TN $name | Out-Null
  }

  Write-Host "OK task $name (instance=$inst) registered + started" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Autostart installed ===" -ForegroundColor Cyan
Write-Host "Bots run in background via Task Scheduler."
Write-Host "You can close RDP/PowerShell; leave VPS powered on."
Write-Host ""
Write-Host "Check:"
Write-Host "  schtasks /Query /TN Ohamar-GiaHuy"
Write-Host "  Get-Process node -ErrorAction SilentlyContinue"
Write-Host ""
Write-Host "Logs:"
Write-Host "  $Root\data\logs\autostart-main.log"
Write-Host "  $Root\data-worker\logs\autostart-worker.log"
Write-Host ""
Write-Host "Stop bots:"
Write-Host "  schtasks /End /TN Ohamar-GiaHuy"
Write-Host "  schtasks /End /TN Ohamar-MinhPhat"
Write-Host "  or: .\scripts\windows\uninstall-autostart.ps1"
Write-Host ""
