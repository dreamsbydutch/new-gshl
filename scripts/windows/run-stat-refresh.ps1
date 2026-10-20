param(
  [Parameter(Mandatory=$true)][string]$Deployment,
  [Parameter(Mandatory=$true)][string]$LeagueId,
  [Parameter(Mandatory=$true)][string]$SeasonId,
  [Parameter(Mandatory=$true)][string]$StartDate,
  [Parameter(Mandatory=$true)][string]$EndDate,
  [Parameter(Mandatory=$true)][string]$NhlEndDate,
  [Parameter(Mandatory=$true)][string]$PythonBin
)
$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$operatorDirectory = Join-Path $workspace 'scripts'
$env:TSX_TSCONFIG_PATH = Join-Path $operatorDirectory 'tsconfig.json'
Set-Location -LiteralPath $operatorDirectory
$nodeExecutable = (Get-Command node.exe -ErrorAction Stop).Source
$runner = Join-Path $workspace 'scripts/src/commands/stats/run-yahoo-roster-cycle.ts'
& $nodeExecutable --use-system-ca --dns-result-order=ipv4first --import tsx $runner --deployment $Deployment --league-id $LeagueId --season-id $SeasonId --start-date $StartDate --end-date $EndDate --nhl-end-date $NhlEndDate --python-bin $PythonBin --skip-weekly-rollover --apply
exit $LASTEXITCODE
