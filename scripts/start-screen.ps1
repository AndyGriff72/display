<#
.SYNOPSIS
  Show a board's screen full-screen in Edge, with its processes given priority.

.DESCRIPTION
  Starts Edge in kiosk mode on a screen's address, as a copy of Edge of its own (its own
  profile folder), so it never hands the address to an Edge that is already open and ignores
  the settings below. The settings stop Edge slowing the page when it thinks nobody is
  looking, and let the flap sound play without anyone clicking first.

  Then it raises the priority of every process of that copy of Edge. Starting Edge itself at a
  higher priority is not enough: the board runs in the tab and graphics processes Edge starts
  for itself, and Windows starts those at normal priority whatever Edge's own is.

  Priority only helps when other programs compete for the processor; on a machine that only
  shows the screen, it makes little difference. Press Alt+F4 to leave kiosk mode.

.PARAMETER Address
  The screen's address, e.g. http://display.example.com/screen/abc123.

.PARAMETER Priority
  AboveNormal (the default) puts the board ahead of everyday background work without making the
  machine sluggish to use; High suits a machine that does nothing but show the screen.

.PARAMETER ProfileDir
  The kiosk copy of Edge's own profile folder. Created if missing.

.PARAMETER KeepRaising
  Keep checking, once a minute, for processes Edge starts later (after a reload, say) and raise
  those too, until the kiosk window is closed.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\start-screen.ps1 -Address http://display.example.com/screen/abc123

.EXAMPLE
  .\scripts\start-screen.ps1 -Address http://localhost:8000/screen/abc123 -Priority High -KeepRaising
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$Address,

  [ValidateSet("Normal", "AboveNormal", "High")]
  [string]$Priority = "AboveNormal",

  [string]$ProfileDir = (Join-Path $env:LOCALAPPDATA "DisplayKiosk"),

  [switch]$KeepRaising
)

$ErrorActionPreference = "Stop"

Start-Process msedge.exe -ArgumentList @(
  "--kiosk", $Address, "--edge-kiosk-type=fullscreen",
  "--user-data-dir=`"$ProfileDir`"", "--no-first-run",
  "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
  "--autoplay-policy=no-user-gesture-required"
)

# Every process of the kiosk copy of Edge: the ones started with its profile folder.
function Get-KioskProcesses {
  Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" |
    Where-Object { $_.CommandLine -like "*$ProfileDir*" }
}

function Set-KioskPriority {
  $raised = 0
  foreach ($p in Get-KioskProcesses) {
    try {
      $process = Get-Process -Id $p.ProcessId -ErrorAction Stop
      if ($process.PriorityClass -ne $Priority) {
        $process.PriorityClass = $Priority
        $raised++
      }
    } catch {
      # Gone already (Edge starts and stops helper processes as it goes): nothing to raise.
    }
  }
  return $raised
}

# Give Edge time to start its tab and graphics processes, then raise them all.
Start-Sleep -Seconds 10
$count = Set-KioskPriority
Write-Host "Kiosk started; $count Edge processes set to $Priority priority."

if ($KeepRaising) {
  Write-Host "Checking once a minute for new Edge processes; close the kiosk window to stop."
  while (@(Get-KioskProcesses).Count -gt 0) {
    Start-Sleep -Seconds 60
    $count = Set-KioskPriority
    if ($count -gt 0) { Write-Host "$(Get-Date -Format HH:mm): $count more set to $Priority." }
  }
}
