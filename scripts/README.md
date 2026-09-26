# GSHL Scripts

Standalone Node/TypeScript tooling for historical backfills, repair jobs,
Yahoo validation, ratings rebuilds, and Convex database maintenance.

This file is the command and flag manual. Read
[AGENTS.md](../AGENTS.md) for repository rules and the concise
[operations guide](../docs/OPERATIONS.md) for runtime and production safety.

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

This package owns operator workflows and the local calculation runtimes under
`src/runtime/`. League records are read from and written to Convex.

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

On Windows PowerShell, invoke argument-bearing commands with `npm.cmd`, for
example `npm.cmd run ratings:backfill -- --help`. In this workspace the
`npm.ps1` shim can consume forwarded names such as `--help` or `--season-id`.
Verify the parsed help/arguments before any `--apply` run. The repository
declares npm 10.1.0; check the resolved npm version instead of assuming the
package-manager declaration is active.

The `bash` blocks below are POSIX-shell examples. In Windows PowerShell,
replace the leading `npm` with `npm.cmd` for every command that forwards
arguments after `--`; do not paste an argument-bearing `npm run` line unchanged.

Several package entries also pass Node's `--use-system-ca` flag. Node 20 cannot
launch those commands. Verify that the `node` runtime resolved by the package
lists that flag in `node --help` before running dry-run, apply, archive, or
parity commands that use it.

## Draft signing-pick repair

`src/commands/draft/repair-signing-picks.ts` audits contracts at each season's
opening date against its draft. Run its `--help` from this directory with
`node --use-system-ca ../node_modules/tsx/dist/cli.mjs` for the current options.
It defaults to a production dry run and writes a local JSON review. Applying
requires the exact hash from that review; changed inputs require another review.

The planner fills a team's latest empty owned picks first, including unassigned
signing placeholders whose original team is known. It only appends picks when
the existing final rounds prove the snake direction. Repaired picks are signing
picks with matching owning/original teams and `isTraded: false`. Filled picks are
preserved. Opening-day rosters resolve duplicate contract ownership, departed
owners' inherited contracts, and stale buyout coverage; unresolved cases are
reported. Missing future team/draft configurations are reported without creating
an entire draft. A local before-image, applied-write journal, and idempotency
report accompany an apply. These artifacts are not independent archival backups.

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
`CONVEX_URL`.

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

Fetches PuckPedia's complete NHL-contracted skater and goalie directories,
matches players to the Convex `Player` table using stable NHL ids plus guarded
name/birthdate/position fallbacks, and prepares updates and inserts. Dry-run
output lists every proposed insert with close existing-player candidates and
audits active database players absent from the feed. An unmatched player is only
deactivated when the current and previous GSHL seasons resolve and their
`PlayerNHLStatLine.GP` is zero in both seasons. Presence in either PuckPedia
directory is treated as NHL-contract evidence. The audit lists the season IDs,
games played, and decision for each proposed deactivation. It refreshes
birthdate, age, height, weight, handedness, NHL team, jersey number, position,
and current NHL contract fields including salary, signing date, signing agent,
signing GM, length, clauses, cap hit, signing status, expiry year, and expiry
status. These fields are authoritative: stale values are cleared when the
current PuckPedia row has no value, and players absent from both directories
have their old NHL team, jersey number, and contract fields cleared. Writes
remain field-diffed, so unchanged values are not patched.

Each applied run also upserts the focus season's total salary and cap hit into
`playerNhlSalaries`. Rows store the NHL salary cap for their season and the
salary normalized to a $100 million cap. Use `--salary-seasons 2027,2028` to
load future PuckPedia focus seasons in the same run. If PuckPedia's season
tokens are not sequential, use `YEAR=TOKEN`. Unknown future caps are stored as
null and can be supplied with repeated `--salary-cap YEAR=VALUE` flags.

Positional eligibility is resolved separately from PuckPedia's single primary
position. The sync checks Yahoo's C, LW, RW, D, and G player-table filters and
unions the filters containing each player, matching by Yahoo ID and then by a
unique normalized player name. If Yahoo does not contain a player, it falls
back to that player's latest PlayerDay position from the single most recent
season that has started. It never searches older seasons for positions.
PuckPedia's primary position is the third fallback. Existing eligibility is
only preserved for players absent from all three current sources.

The same run reconciles each player's current `ownerId`. PlayerDay and draft
records retain their historical team IDs, but those teams are resolved through
their franchise to the owner before a Player row is changed. During the season
the sync uses the current PlayerDay date, then the previous calendar date, then
the latest available in-season date. During the post-season signing window it
uses the final recorded roster from the completed season. After the signing
deadline it uses playing contracts; once the upcoming season's draft begins,
assigned draft picks are added as well. Players absent from the resolved roster
have both `ownerId` and `lineupPos` cleared. The deprecated Player
`gshlTeamId` is cleared during this migration. Overlapping contracts use the
newest applicable signing, and conflicting owner evidence aborts the run before
any writes. Because ownership is canonical, players remain with an owner when
that owner changes franchises or team branding.

After resolving the roster, every team is passed through the shared lineup
optimizer using `Player.seasonRating` as its `Rating` value and the target
season's configured roster spots. Optimized starters receive their eligible
lineup position, remaining roster players receive `BN`, and all players outside
a GSHL roster have `lineupPos` cleared.

Notable flags:

- `--apply`
- `--headless`
- `--focus-season <value>`
- `--focus-season-year <yyyy>`
- `--stat-season <value>`
- `--salary-seasons <yyyy,yyyy,...>`
- `--salary-cap <yyyy=value>`
- `--page-size <value>`
- `--max-pages <value>`
- `--current-date <value>`
- `--browser-path <path>`
- `--user-data-dir <path>`
- `--wait-ms <value>`
- `--skip-yahoo-positions`
- `--yahoo-season-year <yyyy>`
- `--yahoo-league-id <id>`
- `--yahoo-request-delay-ms <value>`
- `--yahoo-max-pages <value>`
- `--yahoo-browser-fallback`

Example:

```bash
npm run player-bios:sync -- --apply
```

#### `nhl-salaries:import`

Validates and imports `salaryHistory.json` into `playerNhlSalaries`. It accepts
flat salary rows and player-centric year maps, resolves players by Convex ID,
legacy ID, NHL API ID, or a unique normalized name, and refuses all writes when
an identity is missing or ambiguous. The command is a dry run unless `--apply`
is passed.

```bash
npm run nhl-salaries:import
npm run nhl-salaries:import -- --apply
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

For an explicitly requested Calder trophy reassignment, use
`src/commands/awards/reconcile-calder-winners.ts` and consult its `--help`.
It reads completed-season Calder ranks, updates existing Calder winners and
nominees in place after a reviewed dry-run hash, and verifies all team award
records. Seasons without rated Calder rankings are reported and preserved.

#### `awards:backfill`

Rebuilds split award data directly from production Convex season standings,
player and team rating outputs, and playoff final results. MVP, Best
Dman, Best G, Most Pts, Most G, Playoff MVP, and regular-season All-Star selections
are upserted into `playerAwards` using `playerId`; league, playoff, and
management awards are upserted into `teamAwards` using the season-specific
owner. Applying the rebuild replaces each processed season's award set:
existing player or team award rows absent from the rebuilt output are deleted.

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

For draft-only historical recalculation, use
`src/commands/draft/recalculate-draft-ratings.ts` and consult its `--help`.
It exports every draft benchmark and applies only regular-season Calder score
and rank patches after matching a reviewed dry-run hash. Recorded trophy
recipients and other rating fields are preserved. The before-values and
recalculated picks are saved in its local JSON audit before any apply.
Run `src/commands/draft/research-slot-curve.ts` for the read-only historical
analysis; its cached mode reproduces the fit without further production reads.

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

#### `power:rebuild`

Recomputes start-of-week team power snapshots and matchup ranking fields.
Weeks are processed chronologically, and completed-week results affect only the
following week's rating.

Notable flags:

- `--season-id <id>`
- `--season-ids <list>`
- `--all-seasons`
- `--week-types <list>`
- `--season-type <type>`
- `--apply`

#### Preseason projection review

For preseason projection review, `src/commands/power/preview-preseason.ts` reads
production rosters and prior NHL history without changing league data.
`src/commands/power/evaluate-preseason.ts` compares projections against the
cached historical draft dataset locally. Consult each command's `--help` for
its inputs and local report destinations.

#### `ranking-engine:check`

Runs local power and aggregation fixtures against the calculation runtime.

### Stats Backfills and Syncs

#### `stats:aggregate-season`

Rebuilds a single season's player days, player weeks, player splits and totals,
career splits and totals, team days, team weeks, and team seasons from
`PlayerDayStatLine`. It also refreshes authoritative `PlayerNHLStatLine` season
totals from Hockey Reference and recalculates standings, matchup scores, and
matchup ranks. It also calculates power snapshots from the newly generated
player/team rows before writing, so dry runs do not depend on stale stored
aggregates. All writes go to production Convex.

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
and investigation flags.
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

#### Completed-season player-day archives

Completed seasons can be staged in the gitignored, OneDrive-synced SQLite
archive at `.local-data/gshl-history.sqlite`. Commands always require an
explicit Convex target and are dry-run only unless `--apply` is supplied.

```bash
npm run stats:archive-player-days -- --target production --season-id <convex-season-id>
npm run stats:archive-player-days -- --target production --season-id <convex-season-id> --apply
npm run stats:verify-player-day-archive -- --target production --season-id <convex-season-id>
```

Deleting the verified Convex source is a distinct, confirmed operation. It
first creates a complete Convex snapshot under `.local-data/convex-snapshots`.

```bash
npm run stats:archive-player-days -- --target production --season-id <convex-season-id> --apply --delete-source --confirm-season-id <convex-season-id>
```

Restore is also a dry-run by default:

```bash
npm run stats:restore-player-days -- --target development --season-id <convex-season-id>
npm run stats:restore-player-days -- --target development --season-id <convex-season-id> --apply --confirm-season-id <convex-season-id>
```

Set `GSHL_ARCHIVE_DB_PATH` to override the default SQLite path. Never use
`--replace-existing-archive` or `--replace-conflicts` without first reviewing
the corresponding dry-run output.

The `.local-data/` directory is gitignored. OneDrive synchronization is useful
transport, but it is not a retention policy or independently verified backup.

#### `worker:browser`

Runs the outbound browser worker used by managed Yahoo, PuckPedia, and Hockey
Reference source tasks. It leases allowlisted tasks, heartbeats ownership, and
returns bounded page captures; it never writes league tables itself.

```bash
npm run worker:browser
```

#### Focused tests

```bash
npm run test:power
npm run test:player-bios
npm run test:archive
```

These do not represent every test file in the package. Use
`npx tsx --test <target.test.ts>` for other focused suites.

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

### Evaluate preseason and matchup objectives

Preseason objective evaluation and read-only current-roster previews live under
`src/commands/power/`. See `evaluate-power-objectives.ts --help` and
`preview-preseason.ts --help` for options. The evaluation uses cached draft
research, owner directories and weekly history under `.local-data/`; its
`--fetch` option refreshes weekly history from production without writes.
Find methodology and limitations in
[the power objectives report](../docs/product/power-ranking-objectives.md).
Local refinement commands `refine-preseason.ts`, `evaluate-form.ts` and
`evaluate-transition.ts` compare player projection, form and transition policies
without network or league writes. See their `--help` and
[refinement evidence](../docs/product/power-ranking-refinement.md).

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
