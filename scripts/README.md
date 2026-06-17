# GSHL Scripts

Standalone Node/TypeScript tooling for historical backfills, repair jobs,
Yahoo validation, ratings rebuilds, and Google Sheets maintenance.

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

### Google Sheets access

Most commands read from or write to the league spreadsheets.

Supported credential sources:

- `scripts/credentials.json`
- `scripts/gsconfig.json`
- `GOOGLE_SERVICE_ACCOUNT_KEY_FILE`
- `GOOGLE_SERVICE_ACCOUNT_KEY`

### Yahoo-authenticated workflows

Yahoo scraping and validation commands may need a live Yahoo session.

Supported inputs:

- `YAHOO_COOKIE`
- `YAHOO_COOKIE_FILE`
- `YAHOO_HEADERS_JSON`
- `YAHOO_HEADERS_FILE`

Many Yahoo commands also support browser fallback flags such as:

- `--browser-fallback`
- `--browser-headless`
- `--browser-path`
- `--browser-user-data-dir`
- `--browser-wait-ms`
- `--browser-import-cookie`

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
`Player` sheet, and prepares player updates or inserts.

Notable flags:

- `--apply`
- `--headless`
- `--gshl-season-id <id>`
- `--focus-season <value>`
- `--stat-season <value>`
- `--page-size <value>`
- `--max-pages <value>`

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

Rebuilds `Awards` rows from season standings, rating outputs, and playoff final
results.

Notable flags:

- `--season-id <id>`
- `--season-ids <list>`
- `--apply`
- `--stop-on-error`

#### `standings:backfill`

Rebuilds matchup scores, matchup rank snapshots, and `TeamSeasonStatLine`
standings fields for one or more seasons.

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

#### `ratings:rebuild-team`

Rebuilds team-day, team-week, and team-season ratings across one or more
seasons. Team-week rebuilds also refresh power and matchup ranks/ratings for
the same season.

Notable flags:

- `--season-ids <list>`
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

Rebuilds season-level player and team aggregate rows from `PlayerDayStatLine`
for a single season, then recalculates standings for that season.

Notable flags:

- `--season-id <id>`
- `--apply`

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

Pulls Yahoo daily matchup pages, reconciles them against `PlayerDayStatLine`,
and reports updates, creations, deletions, and investigation flags.

Notable flags:

- `--seasonId, --seasonIds <list>`
- `--weekId, --weekIds <list>`
- `--weekNum, --weekNums <list>`
- `--startDate <date>`
- `--endDate <date>`
- `--teamIds <list>`
- `--matchupIds <list>`
- `--concurrency <n>`
- `--requestDelayMs <ms>`
- `--report-file <path>`
- `--apply`

Default report path:

- `reports/yahoo-matchup-backfill-latest.json`

Example:

```bash
npm run stats:backfill-yahoo-matchup-days -- --seasonId 12 --apply
```

#### `stats:backfill-yahoo-rosters`

Legacy alias for `stats:backfill-yahoo-matchup-days`.

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
- `--reportBase <path>`

Default output base:

- `reports/yahoo-matchup-debug`

#### `stats:sync-nhl-daily`

Uses the Python `nhl-api-py` client to fetch real NHL boxscore data for one or
more dates, matches those rows to existing `PlayerDayStatLine` records, and can
write refreshed day-level stats back to Sheets.

Notable flags:

- `--season-id <id>`
- `--week-id, --week-ids <list>`
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
```

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

- Commands that write to Sheets usually print JSON summaries so runs are easy to
  diff and log.
- Historical Yahoo workflows may pause for interactive browser login/challenge
  clearance when Yahoo rejects direct requests.
- The NHL helper scripts assume the target `PlayerDayStatLine` rows already
  exist before daily stat refreshes are applied.
