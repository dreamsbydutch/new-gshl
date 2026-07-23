# GSHL Scripts

Standalone Node/TypeScript tooling for historical backfills, repair jobs,
Yahoo validation, ratings rebuilds, and Convex database maintenance.

## Convex operational jobs

Commissioners now start and monitor managed runs from **League Office → Jobs**.
Runs default to dry-run mode; selecting **Apply changes** is required for a
write-capable run. Production schedules should remain disabled until dry-run
parity and a repeated idempotency apply check pass.

The command wrappers below remain available for parity validation. Remove each
wrapper only after its Convex job passes completed-season, historical-season,
and active-season comparisons.

External jobs try direct HTTP first. Yahoo, PuckPedia, and Hockey Reference jobs
can fall back to the outbound browser worker by running `npm run worker:browser`.
Configure `CONVEX_URL`, `BROWSER_WORKER_SECRET`, and
`BROWSER_EXECUTABLE_PATH`; set `YAHOO_BROWSER_PROFILE_PATH` to the existing
authenticated Yahoo profile. The worker only leases source tasks and returns
bounded captures. It never writes league tables.

This package is intentionally separate from both the Next.js app and
`apps-script/`:

- `scripts/` is the main home for retrospective and operator-run workflows.
- `apps-script/` stays focused on active-season automation inside Google Apps
  Script.
- Shared ranking/runtime logic should stay aligned across both runtimes.

## Working Here

Run commands from inside `scripts/`:

```bash
cd scripts
npm install
```

Most write-capable commands run in dry-run mode by default and only persist
changes when you pass `--apply`.

Most commands also support:

- `--help` to print built-in usage
- `--log false` to reduce console noise

## Prerequisites

### Convex access

Commands read from and write to the league's production Convex deployment by
default. Set the production deployment in `scripts/.env.local` or the root
`.env.local`:

```bash
CONVEX_PROD_URL=https://your-production-deployment.convex.cloud
```

A `CONVEX_DEPLOYMENT=prod:<deployment-name>` or production
`CONVEX_DEPLOY_KEY` can also identify the production deployment. The scripts
refuse to fall back to `NEXT_PUBLIC_CONVEX_URL`, because that value commonly
points at a developer deployment.

To intentionally target a non-production deployment, set
`GSHL_CONVEX_TARGET=development` and configure `NEXT_PUBLIC_CONVEX_URL` or
`CONVEX_URL`. To use the old Sheets backend temporarily, set
`GSHL_DATA_BACKEND=sheets` and provide the existing Google service-account
configuration.

### Yahoo-authenticated workflows

Yahoo scraping and validation commands may need a live Yahoo session.

Supported inputs:

- `YAHOO_COOKIE`
- `YAHOO_COOKIE_FILE`
- `YAHOO_HEADERS_JSON`
- `YAHOO_HEADERS_FILE`

Browser-assisted Yahoo commands may also support:

- `--browser-fallback <true|false>`
- `--browser-headless <true|false>`
- `--browser-path <path>`
- `--browser-user-data-dir <path>`
- `--browser-wait-ms <ms>`
- `--browser-import-cookie <true|false>`

### Python helper for NHL scripts

The NHL helper scripts use `nhl-api-py`:

```bash
python -m pip install -r python/requirements.txt
```

Current pinned dependency:

- `nhl-api-py==3.3.0`

## Script Catalog

All commands below are available through `npm run <name>`.

### Player Bios

#### `player-bios:sync`

Scrapes PuckPedia player bios and roster context, matches the results to the
`Player` table, and prepares player updates or inserts.

Notable flags:

- `--apply`
- `--headless`
- `--gshl-season-id <id>`
- `--focus-season <value>`
- `--stat-season <value>`
- `--page-size <value>`
- `--max-pages <value>`
- `--current-date <value>`
- `--browser-path <path>`
- `--user-data-dir <path>`
- `--wait-ms <value>`

Example:

```bash
npm run player-bios:sync -- --apply
```

#### `player-bios:backfill-nhl-ids`

Builds a historical NHL player directory through the Python `nhl-api-py`
helper and backfills `Player.nhlApiId`.

Notable flags:

- `--nhl-season <YYYYYYYY>`
- `--nhl-start-season <YYYYYYYY>`
- `--nhl-end-season <YYYYYYYY>`
- `--python-bin <path>`
- `--ssl-verify <bool>`
- `--apply`

Examples:

```bash
npm run player-bios:backfill-nhl-ids
npm run player-bios:backfill-nhl-ids -- --apply
npm run player-bios:backfill-nhl-ids -- --nhl-season 20252026 --apply
```

#### `player-bios:backfill-yahoo-ids`

Scrapes historical Yahoo skater and goalie player tables across consecutive
`count=` offsets, matches those rows back to the local `Player` sheet, and
backfills missing `Player.yahooId` values.

Notable flags:

- `--season-id <id>`
- `--season-year <yyyy>`
- `--league-id <id>`
- `--skater-url <url>`
- `--goalie-url <url>`
- `--player-groups <list>`
- `--page-size <n>`
- `--max-pages <n>`
- `--request-delay-ms <ms>`
- `--overwrite-existing`
- `--apply`

Examples:

```bash
npm run player-bios:backfill-yahoo-ids -- --season-id 1
npm run player-bios:backfill-yahoo-ids -- --season-year 2014 --league-id 32199
npm run player-bios:backfill-yahoo-ids -- --season-id 1 --apply
```

### Awards, Standings, and Lineups

#### `awards:backfill`

Rebuilds split award data directly from production Convex season standings,
player and team rating outputs, and playoff final results. Crosby, Orr,
Brodeur, Gretzky, Ovechkin, and All-Star selections are upserted into
`playerAwards` using `playerId`; league, playoff, and management awards are
upserted into `teamAwards` using the season-specific owner.

Notable flags:

- `--season-id <id>`
- `--season-ids <list>`
- `--apply`
- `--stop-on-error`

#### `standings:backfill`

Rebuilds matchup scores, matchup rank snapshots, and `TeamSeasonStatLine`
standings fields directly in production Convex for one or more seasons.

Notable flags:

- `--season-id <id>`
- `--season-ids <list>`
- `--include-active`
- `--apply`
- `--stop-on-error`

#### `lineup:update-all`

Re-optimizes `PlayerDayStatLine` lineup fields such as `bestPos`, `fullPos`,
`dailyPos`, and `GS` for one season.

Notable flags:

- `--season-id <id>`
- `--week-ids <list>`
- `--week-nums <list>`
- `--team-ids <list>`
- `--start-date <date>`
- `--end-date <date>`
- `--apply-lt-auto-lineups`
- `--apply`

Example:

```bash
npm run lineup:update-all -- --season-id 12 --week-nums 1,2 --team-ids 4,7 --apply
npm run lineup:update-all -- --season-id 3 --week-num 22 --team-id 108 --apply
```

### Ratings, Power, and Ranking Engine

#### `ratings:backfill`

Recomputes player ratings for a single season and one or more supported player
rating models.

Notable flags:

- `--season-id <id>`
- `--models <list>`
- `--season-type <value>`
- `--week-ids <list>`
- `--week-nums <list>`
- `--team-ids <list>`
- `--include-breakdown`
- `--apply`

#### `ratings:rebuild-all`

Runs the player-rating backfill across multiple seasons and prints one combined
summary.

Notable flags:

- `--season-ids <list>`
- `--models <list>`
- `--include-breakdown`
- `--stop-on-error`
- `--apply`

Scoped examples:

```bash
npm run ratings:backfill -- --season-id 3 --week-num 22 --team-id 108
npm run ratings:backfill -- --season-id 3 --week-num 22 --team-id 108 --apply
npm run ratings:rebuild-team -- --season-id 3 --week-num 22 --team-id 108
npm run ratings:rebuild-team -- --season-id 3 --week-num 22 --team-id 108 --apply
```

For scoped rating runs, the rating comparison is calculated using every row in
the selected week, but only the selected team's existing rows are updated.
Scoped team ratings update TeamDay and TeamWeek ratings and intentionally skip
season-wide team ratings and power refreshes.

#### `ratings:rebuild-team`

Rebuilds `TeamDayStatLine`, `TeamWeekStatLine`, and `TeamSeasonStatLine`
ratings directly in production Convex. Full-season runs also refresh power and
matchup ranks/ratings for the same season; week/team-scoped runs do not trigger
the season-wide power rebuild.

Notable flags:

- `--season-id <id>`
- `--season-ids <list>`
- `--week-ids <list>`
- `--week-nums <list>`
- `--team-ids <list>`
- `--include-team-weeks`
- `--include-team-seasons`
- `--stop-on-error`
- `--apply`

#### `ratings:parity`

Compares local TypeScript player-rating output against the Apps Script rating
engine for a sampled season slice.

Notable flags:

- `--season-id <id>`
- `--models <list>`
- `--sample-size <n>`
- `--seed <value>`
- `--season-type <value>`
- `--week-ids <list>`
- `--week-nums <list>`
- `--max-delta <value>`

#### `power:rebuild`

Recomputes team power ratings and matchup ranking fields for one season.

Notable flags:

- `--season-id <id>`
- `--week-types <list>`
- `--season-type <type>`
- `--apply`

#### `power:parity`

Compares local TypeScript power outputs against the Apps Script power
implementation for one season.

Notable flags:

- `--season-id <id>`
- `--sample-size <n>`
- `--week-types <list>`
- `--season-type <type>`

#### `ranking-engine:sync`

Copies the shared ranking-engine runtime files from `scripts/` into
`apps-script/` and verifies the hashes match.

#### `ranking-engine:check`

Verifies that the ranking-engine runtime files in `scripts/` and `apps-script/`
are still in sync without copying.

### Stats Backfills and Syncs

#### `stats:aggregate-season`

Rebuilds a single season's player days, player weeks, player splits and totals,
career splits and totals, team days, team weeks, and team seasons from
`PlayerDayStatLine`. It also refreshes authoritative `PlayerNHLStatLine` season
totals from Hockey Reference and recalculates standings, matchup scores, and
matchup ranks. All writes go to production Convex.

Notable flags:

- `--season-id <id>`
- `--apply`
- stale derived aggregate rows are removed by default with `--apply`
- `--preserve-stale` to keep and report derived rows that are not regenerated
- `--skip-player-nhl` to omit the external NHL season-total refresh

#### `stats:backfill-hockey-reference`

Scrapes Hockey Reference season totals, matches them to GSHL players, and
upserts `PlayerNHLStatLine`.

Notable flags:

- `--season-id <id>`
- `--season-ids <list>`
- `--year <value>`
- `--apply`
- `--stop-on-error`

#### `stats:backfill-yahoo-matchup-days`

Pulls Yahoo daily matchup pages, reconciles them against `PlayerDayStatLine`
in the production Convex database, and reports updates, creations, deletions,
and investigation flags. It does not read from or write to the legacy Sheets
database.

Notable flags:

- `--seasonId, --seasonIds <list>`
- `--weekId, --weekIds <list>`
- `--weekNum, --weekNums <list>`
- `--startDate <date>`
- `--endDate <date>`
- `--teamIds <list>`
- `--matchupIds <list>`
- `--include-lt`
- `--concurrency <n>`
- `--requestDelayMs <ms>`
- `--quiet`
- `--browser-fallback <true|false>`
- `--browser-headless <true|false>`
- `--browser-path <path>`
- `--browser-user-data-dir <path>`
- `--browser-wait-ms <ms>`
- `--browser-import-cookie <true|false>`
- `--report-file <path>`
- `--apply`

Default report path:

- `reports/yahoo-matchup-backfill-latest.json`

Example:

```bash
npm run stats:backfill-yahoo-matchup-days -- --seasonId 12 --apply
```

The command defaults to a dry run. Production writes require `--apply`,
`GSHL_CONVEX_TARGET=production`, `CONVEX_PROD_URL` (or a production deploy
configuration), and the matching production `CONVEX_SERVER_SECRET`. If either
production credential has been rotated, refresh the local `.env.local` values
from the Convex production deployment before running the command.

#### `stats:backfill-yahoo-rosters`

Legacy alias for `stats:backfill-yahoo-matchup-days`.

It does not run the older roster-table backfill implementation anymore.

#### `stats:debug-yahoo-matchup-table`

Fetches a Yahoo matchup page, saves the raw HTML plus a parsed debug report,
and helps diagnose selector or parsing issues.

Notable flags:

- `--url <url>`
- `--seasonId <id>`
- `--weekId <id>`
- `--date <yyyy-mm-dd>`
- `--homeYahooTeamId <id>`
- `--awayYahooTeamId <id>`
- `--requestDelayMs <ms>`
- `--browser-fallback <true|false>`
- `--browser-headless <true|false>`
- `--browser-path <path>`
- `--browser-user-data-dir <path>`
- `--browser-wait-ms <ms>`
- `--browser-import-cookie <true|false>`
- `--reportBase <path>`

Default output base:

- `reports/yahoo-matchup-debug`

#### `stats:sync-nhl-daily`

Uses the Python `nhl-api-py` client to fetch real NHL boxscore data for one or
more dates, matches those rows to existing `PlayerDayStatLine` records, and can
write refreshed day-level stats back to Convex.

Notable flags:

- `--season-id <id>`
- `--week-id, --week-ids <list>`
- `--week-num, --week-nums <list>`
- `--team-id, --team-ids <list>`
- `--date <yyyy-mm-dd>`
- `--start-date <date>`
- `--end-date <date>`
- `--python-bin <path>`
- `--ssl-verify <bool>`
- `--aggregate`
- `--apply`

Examples:

```bash
npm run stats:sync-nhl-daily -- --season-id 12 --date 2026-06-04
npm run stats:sync-nhl-daily -- --season-id 12 --date 2026-06-04 --apply
npm run stats:sync-nhl-daily -- --week-ids 101 --apply --aggregate
npm run stats:sync-nhl-daily -- --season-id 3 --week-num 22 --team-ids 108
npm run stats:sync-nhl-daily -- --season-id 3 --week-num 22 --team-ids 108 --apply
```

Season, week, and team selectors accept either Convex document IDs or legacy
IDs. Team-scoped runs read only the selected week/team rows and apply changes
with Convex document-ID updates, so this command never creates missing
`PlayerDayStatLine` rows.

### Yahoo Validation

#### `yahoo:check-weekly-player-days`

Compares Yahoo weekly matchup totals and weekly player rows against sheet data,
then optionally writes supported `PlayerDayStatLine` and `TeamWeekStatLine`
fixes.

Notable flags:

- `--season-id <id>`
- `--week-ids <list>`
- `--week-nums <list>`
- `--team-ids <list>`
- `--matchup-ids <list>`
- `--request-delay-ms <ms>`
- `--request-stagger-ms <ms>`
- `--browser-fallback <true|false>`
- `--browser-headless <true|false>`
- `--browser-path <path>`
- `--browser-user-data-dir <path>`
- `--browser-wait-ms <ms>`
- `--browser-import-cookie <true|false>`
- `--apply`

Example:

```bash
npm run yahoo:check-weekly-player-days -- --season-id 12 --week-nums 1,2
npm run yahoo:check-weekly-player-days -- --season-id 12 --matchup-ids 1871 --apply
```

#### `yahoo:check-weekly-matchups`

Legacy alias for `yahoo:check-weekly-player-days`.

### Maintenance

#### `typecheck`

Runs the scripts package TypeScript compile check.

```bash
npm run typecheck
```

## Common Workflows

### Backfill player identities

```bash
npm run player-bios:backfill-nhl-ids -- --apply
npm run player-bios:backfill-yahoo-ids -- --season-id 1 --apply
```

### Rebuild ratings and power

```bash
npm run ratings:backfill -- --season-id 12 --apply
npm run ratings:rebuild-team -- --season-ids 12 --apply
npm run power:rebuild -- --season-id 12 --apply
```

### Repair historical Yahoo data

```bash
npm run stats:backfill-yahoo-matchup-days -- --seasonId 12
npm run yahoo:check-weekly-player-days -- --season-id 12 --week-nums 1,2
```

### Keep ranking-engine runtimes aligned

```bash
npm run ranking-engine:check
npm run ranking-engine:sync
```

## Notes

- Commands that write to Convex usually print JSON summaries so runs are easy to
  diff and log.
- Historical Yahoo workflows may pause for interactive browser login or
  challenge clearance when Yahoo rejects direct requests.
- The NHL helper scripts assume the target `PlayerDayStatLine` rows already
  exist before daily stat refreshes are applied.
