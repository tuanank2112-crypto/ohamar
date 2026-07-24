# Remove Ohamar Scheduled Tasks and stop runners
$ErrorActionPreference = "Continue"
foreach ($name in @("Ohamar-GiaHuy", "Ohamar-MinhPhat")) {
  Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Removed $name"
}
# Optional: kill leftover node from ohamar (careful if other node apps)
Write-Host "Done. Neu can kill process node con sot: Get-Process node | Stop-Process"
