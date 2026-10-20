<#
.SYNOPSIS
Preview or install the five-minute Windows trigger for the live-aware stat runner.
.DESCRIPTION
Defaults to preview. The runner performs hourly daytime work, five-minute live
game refreshes, and a final-game-gated overnight update. Uses the signed-in user
and Convex CLI session. Stores no credentials. Existing tasks are never replaced.
#>
param(
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-z0-9]+(?:-[a-z0-9]+)+$')][string]$Deployment,
  [Parameter(Mandatory=$true)][ValidatePattern('^\d+$')][string]$LeagueId,
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-zA-Z0-9]+$')][string]$SeasonId,
  [Parameter(Mandatory=$true)][ValidatePattern('^\d{4}-\d{2}-\d{2}$')][string]$StartDate,
  [Parameter(Mandatory=$true)][ValidatePattern('^\d{4}-\d{2}-\d{2}$')][string]$EndDate,
  [Parameter(Mandatory=$true)][ValidatePattern('^\d{4}-\d{2}-\d{2}$')][string]$NhlEndDate,
  [Parameter(Mandatory=$true)][string]$PythonBin,
  [switch]$Apply
)
$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$runner = Join-Path $PSScriptRoot 'run-stat-refresh.ps1'
$taskName = "GSHL-Stats-$Deployment-$SeasonId"
$resolvedPython = (Get-Item -LiteralPath $PythonBin -ErrorAction Stop).FullName
if ([datetime]::ParseExact($StartDate,'yyyy-MM-dd',$null) -gt [datetime]::ParseExact($EndDate,'yyyy-MM-dd',$null)) { throw 'Scoring dates are reversed.' }
if ([datetime]::ParseExact($EndDate,'yyyy-MM-dd',$null) -gt [datetime]::ParseExact($NhlEndDate,'yyyy-MM-dd',$null)) { throw 'NHL season ends before GSHL scoring.' }
foreach ($text in @($runner,$resolvedPython)) { if ($text.Contains('"')) { throw 'Invalid quoted path.' } }
$arguments = "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$runner`" -Deployment $Deployment -LeagueId $LeagueId -SeasonId $SeasonId -StartDate $StartDate -EndDate $EndDate -NhlEndDate $NhlEndDate -PythonBin `"$resolvedPython`""
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$review = [ordered]@{taskName=$taskName;deployment=$Deployment;leagueId=$LeagueId;seasonId=$SeasonId;startDate=$StartDate;endDate=$EndDate;nhlEndDate=$NhlEndDate;triggerMinutes=5;user=$identity;requiresSignedInUser=$true;workingDirectory=$workspace;arguments=$arguments;applied=$false}
if (!$Apply) { $review | ConvertTo-Json; return }
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) { throw 'Task already exists; inspect it before changing its schedule.' }
$action = New-ScheduledTaskAction -Execute (Join-Path $PSHOME 'powershell.exe') -Argument $arguments -WorkingDirectory $workspace
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -WakeToRun -ExecutionTimeLimit (New-TimeSpan -Hours 3)
$task = New-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'GSHL day/week refresh hourly or every five minutes during live NHL games; season/career/NHL totals overnight after all games finish. Toronto time. No weekly publication.'
Register-ScheduledTask -TaskName $taskName -InputObject $task | Out-Null
$installed = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
if ($installed.Actions.Arguments -ne $arguments -or $installed.Triggers.Repetition.Interval -ne 'PT5M') { throw 'Installed task verification failed.' }
$review.applied = $true
$review | ConvertTo-Json
