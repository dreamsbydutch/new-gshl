# Apps Script Backend

This backend layer now documents the active-season Apps Script runtime only.
Historical rebuild jobs, repair tooling, and player-maintenance utilities are no
longer part of the deployed Apps Script surface.

## Scope

Apps Script owns these production responsibilities:

- current-day Yahoo roster ingestion
- lineup assignment and daily team/player stat writes
- current-season aggregation
- current-season rating refresh
- matchup, standings, and power-ranking updates

Everything else should be handled outside Apps Script.

## Current Entry Points

- `scrapeYahoo()`
- `aggregateCurrentSeason()`
- `aggregateCurrentSeasonRefreshOnly()`
- `finalizeCurrentSeasonAggregation()`
- `runScheduledCurrentSeasonFinalize()`

## Core Modules

- `YAHOO_SCRAPER_MODULE.md`
- `LINEUP_BUILDER_MODULE.md`
- `STATS_AGGREGATOR.md`
- `RANKING_ENGINE.md`

## Active Season Rule

Apps Script resolves the season automatically:

1. Match `Season.startDate <= targetDate <= Season.endDate`
2. Otherwise fall back to exactly one `Season.isActive=true`
3. Otherwise fail fast

`targetDate` defaults to the current Eastern Time scrape date.

## Pipeline Summary

`scrapeYahoo()` writes:

- `PlayerDayStatLine`
- `TeamDayStatLine`

`aggregateCurrentSeasonRefreshOnly()` writes:

- `PlayerWeekStatLine`
- `PlayerSplitStatLine`
- `PlayerTotalStatLine`
- `TeamWeekStatLine`
- `TeamSeasonStatLine`
- current-season `PlayerNHL` ratings fields

`finalizeCurrentSeasonAggregation()` writes:

- `Matchup`
- standings fields driven by `TeamSeasonStatLine`
- current-season power-ranking fields
