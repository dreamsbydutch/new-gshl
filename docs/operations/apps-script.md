# Apps Script operations

[Wiki home](../README.md)

`apps-script/` is the Google Apps Script runtime for active-season automation.
It is JavaScript-first, runs under the Apps Script V8 runtime, and writes
Google Sheets directly. Historical repair and commissioner-run maintenance
belong in `scripts/`.

## Supported production scope

Apps Script is intentionally limited to:

- current Yahoo roster and matchup ingestion
- current-season player and team day writes
- current-season aggregation, ratings, standings, and power rankings

Do not reintroduce historical backfills, broad maintenance commands, Node APIs,
filesystem access, `process.env`, or a separate TypeScript build into this
runtime without an explicit architecture decision.

## Runtime flow

```text
Yahoo Fantasy → Apps Script → Google Sheets
                         ├→ daily player/team rows
                         ├→ current-season aggregates and ratings
                         └→ standings and entering-week power snapshots
```

The active season is resolved by date range first. If no date range matches,
exactly one `isActive` season is accepted. Ambiguous or missing resolution
throws instead of guessing.

## Public trigger surface

Only these global functions are intended for manual execution or Apps Script
triggers:

- `scrapeYahoo()`
- `aggregateCurrentSeason()`
- `aggregateCurrentSeasonStatsOnly()`
- `aggregateCurrentSeasonRefreshOnly()`
- `finalizeCurrentSeasonAggregation()`
- `runScheduledCurrentSeasonFinalize()`

Keep trigger functions thin and delegate to feature modules.

### Daily ingest

`scrapeYahoo()` resolves the current scrape date, season, and week; fetches
Yahoo roster pages; builds player-day rows; calculates lineup and daily rating
fields; and writes player and team day data.

### Refresh

The stats-only entry point aggregates player and team season data.

The refresh entry point aggregates data, refreshes Hockey Reference player NHL
totals, recalculates player and team ratings, updates overall talent ratings,
and refreshes power and matchup/standing output.

### Finalize

Finalize updates matchups and standings, refreshes entering-week power output,
then updates matchups and standings again so ranking-derived fields are current.

`aggregateCurrentSeason()` runs refresh immediately and schedules
`runScheduledCurrentSeasonFinalize()` one minute later. Before creating that
one-time trigger, it removes existing triggers for the same handler.

## Project layout

- `AggregationJobs.js` — production trigger entry points
- `Config/Config.js` — spreadsheet, league, and runtime defaults
- `Core/environment.js` — Script Property flag access
- `Core/utils.js` — shared runtime and sheet operations
- `Core/sheetSchemas.js` — sheet schema metadata
- `features/` — scraper, aggregation, lineup, rating, standings, and power code
- `features/RankingEngine/` — synchronized deployed ranking copy
- `appsscript.json` — V8 runtime, Eastern time zone, and Stackdriver exception logging

The clasp project identity is stored in `.clasp.json`. Never copy its value
into general documentation.

## Configuration and properties

Configuration names are documented in
[Environment](../reference/environment.md). The runtime supports
`VERBOSE_LOGGING` and `DRY_RUN_MODE` Script Properties, with code defaults in
`Config/Config.js`.

Use the environment helper rather than calling `PropertiesService` throughout
feature code. New write-heavy workflows must honor the dry-run mode where the
underlying implementation supports it.

`DRY_RUN_MODE` defaults to false and does not make every entry point
side-effect-free. `aggregateCurrentSeason()` deletes/recreates its one-time
finalize trigger even when sheet writes are dry-run. Power setup calls
`ensurePowerRankingColumns()` before the dry-run branch, so it may add missing
columns. Inspect the complete call path and target project before executing a
supposed dry run.

## Ranking and power synchronization

Do not hand-edit the deployed copies in `apps-script/features/RankingEngine/`
or `apps-script/features/PowerRankingsAlgo.js`.

Edit the source under `scripts/src/runtime/apps-script/`, then run from the
repository root:

```bash
npm run ranking-engine:sync
npm run ranking-engine:check
```

The tool verifies five file pairs by SHA-256 and retries transient Windows
file-lock errors. CI runs the check command for configured paths, but those path
filters currently omit both `PowerRankingsAlgo.js` copies; run the check locally
for every power change.

## Install and connect clasp

From `apps-script/`:

```bash
npm install
npm run login
```

The repository already contains a clasp project identity. Use `npm run create`
only when intentionally creating a different standalone project; do not
replace the existing identity accidentally.

Useful inspection commands:

```bash
npm run open
npm run logs
```

## Deploy

From `apps-script/`:

```bash
npm run push
```

`npm run deploy` currently performs the same push and prints a success message.
It does not create or manage a versioned Apps Script deployment.

Before pushing:

1. Confirm the connected clasp project is the intended target.
2. Run ranking sync and the relevant local parity/tests.
3. Review `git diff` so generated runtime changes are intentional.
4. Confirm configuration and Script Properties in the target project.
5. Push, inspect logs, and manually validate the intended entry point.

Apps Script trigger creation, ownership, and production timing are not encoded
as a clasp deployment workflow in this repository. Do not claim they were
updated merely because `clasp push` succeeded.

## Troubleshooting

- Use `npm run logs` for runtime failures and trigger execution output.
- If no active season resolves, inspect season date ranges and `isActive`
  uniqueness instead of hard-coding a season.
- If rating output differs from local scripts, run the ranking sync check before
  changing algorithms.
- If Yahoo challenges a request, use the supported authenticated workflow; do
  not add session material to source.
- If a follow-up finalize trigger is missing, inspect Apps Script project
  triggers and the refresh logs.

## Related pages

- [`apps-script/README.md`](../../apps-script/README.md)
- [Data pipelines](data-pipelines.md)
- [Deployment](deployment.md)
- [Verification](verification.md)
