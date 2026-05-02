# GSHL Apps Script

This Apps Script project is the production writer for the active GSHL season.
It is intentionally limited to:

- Daily Yahoo roster ingestion for the current scrape window
- Current-season lineup assignment and daily stat writes
- Current-season aggregation, ratings, standings, and power rankings

Historical rebuilds, repair tooling, and player-maintenance sidecars have been
removed from Apps Script. Those workflows now live in local scripts.

## Runtime Model

```
Yahoo Fantasy -> Apps Script -> Google Sheets -> Next.js
```

- Apps Script writes data
- Google Sheets stores the canonical tables
- Next.js reads only

## Active Season Resolution

The Apps Script jobs resolve the active season automatically.

Selection rules:

1. Use the `Season` row whose `startDate <= targetDate <= endDate`
2. If no date-range match exists, fall back to exactly one `Season` row with `isActive=true`
3. If neither rule yields exactly one season, the job throws

`targetDate` defaults to `GshlUtils.core.date.getTargetDateForScraping()`, which
uses the current Eastern Time scrape date.

## Public Trigger Surface

Only these globals are intended to be run from Apps Script triggers or manual execution:

- `scrapeYahoo()`
- `aggregateCurrentSeason()`
- `aggregateCurrentSeasonRefreshOnly()`
- `finalizeCurrentSeasonAggregation()`
- `runScheduledCurrentSeasonFinalize()`

## Main Flow

### 1. Daily ingest

`scrapeYahoo()`:

- resolves the active scrape date
- resolves the active season and week
- fetches Yahoo roster pages for current teams
- builds `PlayerDayStatLine` rows
- computes lineup fields and daily ratings
- writes `PlayerDayStatLine` and `TeamDayStatLine`

### 2. Current-season refresh

`aggregateCurrentSeasonRefreshOnly()`:

- rolls `PlayerDayStatLine` into `PlayerWeekStatLine`
- rolls player aggregates into `PlayerSplitStatLine` and `PlayerTotalStatLine`
- rolls team aggregates into `TeamWeekStatLine` and `TeamSeasonStatLine`
- refreshes `PlayerNHL` season stats
- refreshes current-season ratings
- refreshes current-season overall talent ratings

### 3. Current-season finalize

`finalizeCurrentSeasonAggregation()`:

- updates matchup outcomes
- updates standings
- refreshes power rankings
- reruns matchup/standing updates so ranking-derived matchup fields stay current

`aggregateCurrentSeason()` runs the refresh phase and schedules the finalize
phase as a one-time follow-up trigger.

## File Layout

```
apps-script/
  AggregationJobs.js
  Config/
  Core/
  features/
    LineupBuilder.js
    MatchupHandler.js
    PlayerNhlStatsUpdater.js
    PlayerOverallRatingUpdater.js
    PowerRankingsAlgo.js
    RatingUpdater.js
    StatsAggregator.js
    YahooScraper.js
    RankingEngine/
```

## Setup

Install and authenticate `clasp`:

```bash
npm install -g @google/clasp
clasp login
```

Create or connect the Apps Script project from `apps-script/`, then push:

```bash
cd apps-script
clasp push
clasp open
```

## Configuration

Project-level constants live in `Config/Config.js`.

Important values:

- `SPREADSHEET_ID`
- Player-day workbook ids
- player/team stats workbook ids
- `YAHOO_LEAGUE_ID`
- default verbose and dry-run flags

## Script Properties

Supported runtime flags:

- `VERBOSE_LOGGING`
- `DRY_RUN_MODE`

If unset, Apps Script uses the defaults from `Config/Config.js`.
