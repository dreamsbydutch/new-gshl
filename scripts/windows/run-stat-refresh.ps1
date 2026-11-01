param(
  [Parameter(Mandatory=$true)][string]$Deployment,
  [Parameter(Mandatory=$true)][string]$LeagueId,
  [Parameter(Mandatory=$true)][string]$SeasonId,
  [Parameter(Mandatory=$true)][string]$StartDate,
  [Parameter(Mandatory=$true)][string]$EndDate,
  [Parameter(Mandatory=$true)][string]$NhlEndDate,
  [Parameter(Mandatory=$true)][string]$PythonBin,
  [string]$NodeBin,
  [string]$StateDir,
  [string]$ReferenceConfig,
  [switch]$Preview,
  [string]$SupersededBackupDir = (Join-Path $env:USERPROFILE 'gshl-backups/yahoo-sync')
)
$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$installedState = Join-Path $env:LOCALAPPDATA "GSHL/stat-refresh/$env:COMPUTERNAME"
if (!$StateDir) {
  $StateDir = if (Test-Path -LiteralPath $installedState -PathType Container) { $installedState } else { Join-Path $workspace '.local-data/yahoo-sync' }
}
if (!$ReferenceConfig) {
  $installedReference = Join-Path $StateDir 'reference/reference-config.json'
  $ReferenceConfig = if ($env:GSHL_IMPACT_REFERENCE_CONFIG) { $env:GSHL_IMPACT_REFERENCE_CONFIG } elseif (Test-Path -LiteralPath $installedReference -PathType Leaf) { $installedReference } else { Join-Path $workspace '.local-data/gshl-uniform-impact-20261020/reference-config.json' }
}
$logDirectory = $StateDir
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$bootstrapLog = Join-Path $logDirectory "$Deployment-$LeagueId-$SeasonId-bootstrap.log"
try {
  Add-Content -LiteralPath $bootstrapLog -Value "$(Get-Date -Format o) Starting scheduled stat refresh."
  $operatorDirectory = Join-Path $workspace 'scripts'
  $env:TSX_TSCONFIG_PATH = Join-Path $operatorDirectory 'tsconfig.json'
  Set-Location -LiteralPath $operatorDirectory
  $nodeExecutable = if ($NodeBin) { (Get-Item -LiteralPath $NodeBin -ErrorAction Stop).FullName } else { (Get-Command node.exe -ErrorAction Stop).Source }
  if (!(Test-Path -LiteralPath $ReferenceConfig -PathType Leaf)) { throw 'Installed uniform impact reference configuration is missing.' }
  $env:GSHL_IMPACT_REFERENCE_CONFIG = $ReferenceConfig
  $runner = Join-Path $workspace 'scripts/src/commands/stats/run-yahoo-roster-cycle.ts'
  [string[]]$applyArguments = @()
  if (!$Preview) { $applyArguments = @('--apply') }
  & $nodeExecutable --use-system-ca --dns-result-order=ipv4first --import tsx $runner --deployment $Deployment --league-id $LeagueId --season-id $SeasonId --start-date $StartDate --end-date $EndDate --nhl-end-date $NhlEndDate --python-bin $PythonBin --state-dir $StateDir --superseded-backup-dir $SupersededBackupDir @applyArguments
  $cycleExitCode = $LASTEXITCODE
  Add-Content -LiteralPath $bootstrapLog -Value "$(Get-Date -Format o) Cycle finished (exit $cycleExitCode)."
  exit $cycleExitCode
} catch {
  $message = $_.Exception.Message
  if ($env:CONVEX_SERVER_SECRET) { $message = $message.Replace($env:CONVEX_SERVER_SECRET, '[redacted]') }
  Add-Content -LiteralPath $bootstrapLog -Value "$(Get-Date -Format o) Bootstrap failed: $message"
  Write-Error $message -ErrorAction Continue
  exit 1
}
