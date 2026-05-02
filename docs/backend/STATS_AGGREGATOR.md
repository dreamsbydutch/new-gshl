# Stats Aggregator

`apps-script/features/StatsAggregator.js`

## Purpose

Builds current-season aggregate stat tables from `PlayerDayStatLine`.

## Supported Runtime API

- `StatsAggregator.updatePlayerStatsForSeason(seasonId)`
- `StatsAggregator.updateTeamStatsForSeason(seasonId)`

## Output Tables

- `PlayerWeekStatLine`
- `PlayerSplitStatLine`
- `PlayerTotalStatLine`
- `TeamDayStatLine`
- `TeamWeekStatLine`
- `TeamSeasonStatLine`

## Scope Rule

The aggregator is current-season only. Apps Script no longer supports
historical rebuilds or manual week-scoped repair pipelines.
