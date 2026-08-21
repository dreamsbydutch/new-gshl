# GSHL Apps Script runtime

This package is the Google Apps Script runtime for active-season Yahoo ingest,
lineup assignment, aggregation, ratings, standings, and power snapshots written
to Google Sheets. It is a separate operational surface from the Convex-backed
web application.

Read the [Apps Script wiki page](../docs/operations/apps-script.md) for system
context and [AGENTS.md](../AGENTS.md) before changing the runtime.

## Runtime boundary

```text
Yahoo Fantasy -> Google Apps Script -> Google Sheets

Next.js browser -> Convex
```

Google Sheets is authoritative for this runtime's configured jobs; it is not
the current browser data path. Historical rebuilds, repairs, imports, parity
checks, and archives belong in the local [`scripts/`](../scripts/README.md)
package unless a managed Convex job has proven equivalent behavior.

## Public trigger surface

Only these globals are intended for manual runs or Apps Script triggers:

- `scrapeYahoo()`
- `aggregateCurrentSeason()`
- `aggregateCurrentSeasonStatsOnly()`
- `aggregateCurrentSeasonRefreshOnly()`
- `finalizeCurrentSeasonAggregation()`
- `runScheduledCurrentSeasonFinalize()`

`aggregateCurrentSeason()` runs the refresh phase and schedules finalize as a
one-time follow-up after clearing duplicate follow-up triggers.

## Active-season resolution

Jobs resolve the season for the Eastern Time target date:

1. Prefer the one season where `startDate <= targetDate <= endDate`.
2. Otherwise require exactly one row with `isActive=true`.
3. Throw when neither rule produces exactly one season.

The scrape target defaults to `GshlUtils.core.date.getTargetDateForScraping()`.

## Main flows

### Daily ingest

`scrapeYahoo()` resolves the date, season, week, and teams; reads Yahoo roster
pages; builds player-day rows; assigns lineups and daily ratings; and writes
player/team day stat lines.

### Refresh

The refresh entry points aggregate player days into player week, split, total,
and team day/week/season rows. The full refresh also updates NHL totals,
current-season ratings, overall talent, and entering-week power snapshots.

Power is an entering-week snapshot: Week N play may change Week N+1, but never
Week N's stored starting power.

### Finalize

Finalize updates matchup outcomes, standings, start-of-week power, and matchup
ranks, then reruns result/standing updates so ranking-derived fields remain
consistent.

## Layout

```text
apps-script/
  AggregationJobs.js          public trigger wrappers
  Config/Config.js            workbook, league, and default flags
  Core/                       environment, schemas, constants, utilities
  features/
    YahooScraper.js           Yahoo ingestion
    LineupBuilder.js          lineup assignment
    StatsAggregator.js        current-season rollups
    MatchupHandler.js         results and standings inputs
    PlayerNhlStatsUpdater.js  NHL season totals
    PlayerOverallRatingUpdater.js
    RatingUpdater.js
    PowerRankingsAlgo.js      synchronized power runtime
    RankingEngine/            synchronized rating runtime
```

Use JavaScript compatible with the Apps Script V8 runtime. Do not introduce
Node filesystem/process APIs or import the Next.js/Convex client runtime.

## Ranking and power synchronization

The hand-edited sources live under `scripts/src/runtime/apps-script/`. The
following Apps Script files are synchronized output:

- `features/PowerRankingsAlgo.js`
- `features/RankingEngine/config.js`
- `features/RankingEngine/player-pure.js`
- `features/RankingEngine/team-pure.js`
- `features/RankingEngine/index.js`

From the repository root:

```powershell
npm run ranking-engine:sync
npm run ranking-engine:check
```

Do not patch only the Apps Script copy. See [the ranking reference](../docs/RANKING.md).

## Configuration and Script Properties

Workbook IDs, the Yahoo league ID, and default logging/dry-run behavior live in
`Config/Config.js`. Runtime overrides use these Script Properties:

- `VERBOSE_LOGGING`
- `DRY_RUN_MODE`

Use the existing environment helpers and preserve dry-run behavior on write-heavy
paths.

`DRY_RUN_MODE` defaults to false and is not a transaction boundary. In
particular, `aggregateCurrentSeason()` replaces its follow-up trigger even in
dry-run mode, and power setup may add missing sheet columns before reaching its
dry-run branch. Confirm the connected project, configuration, Script Properties,
and full call path before running an entry point.

## Local clasp commands

From `apps-script/`:

```powershell
npm install
npm run login
npm run push
npm run open
npm run logs
```

`npm run create` creates a standalone project named `GSHL Cron Jobs`.
`npm run deploy` runs `clasp push` and prints a success message; it does not
create a versioned Apps Script deployment.

Remote pushes, trigger edits, and Script Property changes require target
confirmation and authorization. Inspect `clasp logs` after an authorized run.
