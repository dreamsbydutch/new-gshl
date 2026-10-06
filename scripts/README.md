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

## Independent NHL season ratings

The v3 candidate adds official game-level reconciliation, adjusted on-ice impact,
an independently labeled NHL shot-quality model, event penalty values, separate
season and ability rankings, chronological validation, and game sampling ranges.
These commands read public hockey sources and write new local artifacts only.
Run each command's `--help` for current options. From `scripts/`:

For normal calculations, use `rebuild-nhl-value-seasons.ts` (local) or
`rollout-nhl-value-seasons.ts` (production publisher) without `--cache`.
They fetch supporting API data as needed into a shared temporary workspace and
remove that workspace on normal completion or a reported failure. Rating results,
breakdowns, model metadata and compact verification reports remain in `--output`.
Raw API responses are never imported into `nhlSeasonValues`.
Explicit `--cache <directory>` opts into reusable source storage for offline
investigation or a resumable backfill. Supplied directories and existing source
snapshots are never removed. A forcibly terminated process can leave its temporary
workspace behind. The manual collection/preview commands below are the explicit
reusable-cache workflow:

```powershell
node ../node_modules/tsx/dist/cli.mjs src/commands/ratings/collect-nhl-value-games.ts --season 20242025 --cache ../.local-data/nhl-rating/game-cache --output ../.local-data/nhl-rating/games-2024.json
node ../node_modules/tsx/dist/cli.mjs src/commands/ratings/preview-nhl-value-v3.ts --season 20242025 --baseline ../.local-data/nhl-rating/value-v2-final-20260930 --cache ../.local-data/nhl-rating/game-cache --output ../.local-data/nhl-rating/my-v3-review
node ../node_modules/tsx/dist/cli.mjs src/commands/ratings/reconcile-nhl-value-games.ts --input ../.local-data/nhl-rating/value-v2-final-20260930 --cache ../.local-data/nhl-rating/game-cache --output ../.local-data/nhl-rating/my-reconciliation.json
```

The collector also caches the preceding five seasons' NHL penalty-shot report,
using bounded pagination because the endpoint caps returned pages. This supplies
an independent penalty-shot probability without current-season training leakage.
The collector batches official roster and shift reports, throttles public reads,
respects rate-limit cooldowns, and resumes from a hash-verified cache. Use a new
cache directory to refresh sources; existing snapshots are reused. Empty shift
API responses fall back to official NHL time-on-ice reports, with team/jersey
joins verified against the official roster and report date/game. It can also run
the reconciliation in the same process, sharing the request throttle.
New public JSON/HTML bodies and derived envelopes use lossless gzip storage;
hashes still refer to original decoded source bytes. Legacy cache files remain
readable and are not rewritten. NHL-based previews do not download unused
MoneyPuck shot ZIPs; select MoneyPuck explicitly when collecting that shot source.
The collector checks per-game penalty-shot totals and can recover missing API
labels through a unique event match to the official play-by-play HTML report.
Original API bytes remain unchanged; supplemental classifications carry both
source hashes. Official GP=1 zero-time appearances are retained separately from
unused backup goalies. New previews require this per-game reconciliation before
fitting. Publication requires 98% verified coverage of both process ice time and
individual attempts, alongside the unchanged exposure and predictive checks.
For nonempty shift histories that fail verification, use the collector's
`--repair-audit <game-audit.json>` option to fetch alternate official reports
for quarantined games in that exact season/game-type scope. This only collects
evidence. The next preview accepts an alternate source if it fully verifies or
increases verified process exposure without losing individual shots, and records
both accepted and rejected attempts in `shiftReviews`. Original API snapshots
remain intact; partially verified games keep that designation.
The preview is offline by default. Repeat it into a new output directory to
verify deterministic replay. Its saved v2 baseline supplies canonical season
exposure and past-season shrinkage priors; it does not blend v2 player scores.
Output includes the game audit, source hashes, JSON/CSV ratings, convergence,
held-out comparisons and a minimum review gate. All loaded games contribute their
verified components, including penalty shots; only fully verified games fit and
evaluate the lineup model. Player outputs distinguish included and verified games
and report component coverage. New game audits retain coverage totals and minimal
penalty-shot event IDs, shooter IDs and results for duplicate/totals verification;
they omit player source-stat arrays, lineups and full shot/penalty events.
Partial-download previews are development
diagnostics and cannot pass that gate. Neither passing the gate nor resolving an
appearance ledger means a model is approved for production.

The reconciliation confirms extra provider appearances against NHL boxscores
before removing them from derived totals. If an NHL game log omits ice time, a
second official per-game statistics report must confirm the exposure, including
genuine zero-time appearances. Missing games and conflicting exposure
produce explicit reconstruction queues; their advanced values are not filled
with zero. Original sources remain intact. A full v3 season rebuild uses official
events and shifts rather than pretending missing MoneyPuck probabilities were
recovered. See [the v3 behavior contract](../docs/RANKING.md#game-level-v3-candidate)
for model definitions and limitations. The version-aware publisher accepts v3
artifacts with the matching v2 source/calibration baseline. It verifies source
hashes, game and player populations, all required quality gates and complete
official exposure before constructing production batches. Signed v3 ability is
stored separately from the legacy 0-100 display field.
Credit NHL public reports and **MoneyPuck.com** when displaying v3 outputs:
even the independent NHL shot model retains historical v2 shrinkage calibration.

`rebuild-nhl-value-seasons.ts` collects, audits, repairs and calculates all seasons
in a saved baseline, retaining successful artifacts for resumption. It has no
database writes. `rollout-nhl-value-seasons.ts` additionally performs an explicit
production dry run for each verified season, accepts only additive/idempotent
plans, applies when requested, and requires an all-unchanged verification.
The rollout independently compares every shooter's penalty-shot attempts and
goals with the NHL season report before importing a season. Consult
each command's `--help`. The rollout journal lists published, failed and pending
seasons; a failed season is never silently substituted with v1 or v2. This is a
bounded operator backfill, not a recurring production schedule. Future seasons
require fresh canonical baseline snapshots and the same verification workflow.

`src/commands/ratings/preview-nhl-value-v2.ts` retains the season-level NHL
model. It combines saved official NHL season snapshots with explicit NHL penalty
counts and MoneyPuck's documented public skater/goalie CSV endpoints. Run `--help`
for current flags. From `scripts/`:

```powershell
node ../node_modules/tsx/dist/cli.mjs src/commands/ratings/preview-nhl-value-v2.ts --input ../.local-data/nhl-rating/db-seasons-20260929 --output ../.local-data/nhl-rating/my-v2-review
node ../node_modules/tsx/dist/cli.mjs src/commands/ratings/preview-nhl-value-v2.ts --input ../.local-data/nhl-rating/my-v2-review --output ../.local-data/nhl-rating/my-v2-replay --replay
```

The output directory must be new, under an existing parent. Saved source hashes
allow offline replay. Process all seasons together for expanding-window
calibration; selecting a single season uses initial priors. Outputs include
component explanations, observed and conservative season contributions,
per-60 effectiveness, positional percentiles, provider coverage, context-policy
sensitivity and historical validation diagnostics. Incomplete data does not
fall back to v1. Credit **MoneyPuck.com** wherever derived results are displayed;
its downloads are offered for noncommercial use (see the provider's terms).
This command never connects to Convex and its new value/report contract cannot
be passed to the v1 publisher. See the
[v2 model reference](../docs/product/nhl-season-value-v2.md).

The commands below retain the original v1 baseline and audit workflow.

`src/commands/ratings/audit-nhl-season-values.ts` evaluates saved core reports
without network or database access. Run `--help` for its current flags. Supply
`--input <multi-season report directory>` and `--output <audit directory>`;
optionally supply `--moneypuck <directory>` containing the official 2024-25
`moneypuck-2024-skaters.csv` and `moneypuck-2024-goalies.csv` downloads. The audit
records file hashes, position/season correlations, component removal and reference
sensitivity, adjacent-season stability, and shot-quality diagnostics. It does
not fit new weights or change ratings. See the
[quality audit](../docs/product/nhl-season-value-quality-audit.md) for findings
and interpretation limits.

`src/commands/ratings/audit-nhl-team-success.ts` joins the fitted reports listed
in a defense-audit manifest to official historical team records, team-filtered
player ice time and playoff brackets. It retains derived team/player contribution
tables and source hashes, and removes temporary API responses automatically.
It reconciles traded-player exposure and keeps zero-shot emergency goalies'
unknown ability explicit. It does not access Convex or modify player ratings.

`src/commands/ratings/analyze-nhl-team-success.ts` analyzes that derived snapshot
offline. It exports team/player CSVs, an interactive HTML report, within-season
associations, season-cluster intervals, component comparisons and chronological
playoff-series tests against points-percentage and goal-difference baselines.
Use each command's `--help` for current input/output options. Failed-gate seasons
remain labeled sensitivities; unfinished postseasons are excluded from playoff
comparisons. See the team-validation section in `docs/RANKING.md` for interpretation.

`src/commands/ratings/finalize-nhl-season-2019.ts` closes the reviewed 2019-20
production snapshot without recalculating scores. Preparation verifies the live
970-player population against the immutable calculation and source review,
creates hash-verified backups in the workspace and an independent directory,
and emits a plan. The plan runs as a dry run by default; explicit apply restores
qualified ranks and records `final-with-limitations` on every row. Replaying the
plan is unchanged. Finalized records reject routine imports. Individual
small-sample/coverage flags remain, independently of the completed season review.
Run `--help` for exact flags. The operation is pinned to `polished-tern-709`,
2019-20, regular-season v3/core records; v1 and GSHL statistics are untouched.

`src/commands/ratings/preview-nhl-season.ts` reads public NHL season reports and
calculates a separate NHL Season Value model. It does not connect to Convex or
change GSHL ratings, salary, draft grades, or power rankings. Run from `scripts/`:

```powershell
node ../node_modules/tsx/dist/cli.mjs src/commands/ratings/preview-nhl-season.ts --help
node ../node_modules/tsx/dist/cli.mjs src/commands/ratings/preview-nhl-season.ts --season 20242025 --output ../.local-data/nhl-rating/20242025-core
```

`--game-type 2` selects the regular season (default); `3` selects playoffs.
`--profile core` uses traditional NHL reports (default). `--profile edge` also
fetches player shot-location summaries and requires 2021-22 or later. EDGE takes
longer because it makes one bounded request per player. Missing EDGE data marks
a player incomplete; it does not silently mix model profiles.

`--output <directory>` saves the public source snapshot, detailed JSON ratings,
and a CSV leaderboard. Use a new directory: existing artifacts are never
overwritten. Omit it to print results only. `--input <source.json>` replays a saved
snapshot without network access; supply the matching season, game type and profile.

The formula, provisional weights, qualification thresholds, and limitations are
documented in [the ranking reference](../docs/RANKING.md#independent-nhl-season-value).

`src/commands/ratings/publish-nhl-season-values.ts` imports a verified multi-season
report directory into the separate `nhlSeasonValues` table. Run `--help` for the
current flags. It requires `--target production`, `--input <directory>` and a new
`--output <directory>` for the plan/journal. Omit `--apply` for a dry run; review
every season's insert/update/unlinked counts before rerunning with `--apply` and
a different output directory. `--season <NHL season>` narrows the operation.

The authenticated Convex CLI invokes an internal-only mutation in batches of 250. Local snapshots are replayed before any writes. NHL IDs link existing
players where unambiguous; unmatched players retain their NHL identity without
creating a player profile. Scores, status, missing fields and source provenance
are stored independently of GSHL stats and salary. A different source snapshot
for an existing identity blocks the import. Repeating the dry run after apply
must report all records unchanged. There are no deletions.

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

## Upcoming season calendar repair

`src/commands/maintenance/repair-season-calendar.ts` plans an upcoming season's
weeks from the NHL regular-season opening and closing dates. Run its `--help`
from this directory with `node ../node_modules/tsx/dist/cli.mjs` for options.
Partial first and last calendar weeks are combined with their neighbors; the
final three matchup weeks remain playoffs. Existing week IDs and playoff rounds
are preserved, and missing regular weeks may be added. It refuses seasons with
existing matchups or day/week statistics, already-started seasons, and week removal.
Apply requires the exact reviewed dry-run hash, saves a local before-image, and
verifies no changes remain. It updates only season boundaries and week calendar
fields; it does not generate matchups or change rosters. Both the environment
target and expected database hostname must be supplied explicitly.

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

Each applied run also upserts the focus season into `playerNhlSalaries`. Its
`salary` field uses cap hit, falling back to total salary when cap hit is
unavailable; `capHit` retains the source cap hit. Rows store the NHL salary cap for their season and the
salary normalized to a $100 million cap. Use `--salary-seasons 2027,2028` to
load future PuckPedia focus seasons in the same run. If PuckPedia's season
tokens are not sequential, use `YEAR=TOKEN`. Unknown future caps are stored as
null and can be supplied with repeated `--salary-cap YEAR=VALUE` flags.

The same sync preserves NHL contract history in `nhlContracts` and
`nhlContractSeasons`, separate from GSHL contracts. By default it checks the
focus season and the following season so future extensions can be observed;
`--contract-seasons` overrides the extra contract seasons, using start years or
`YEAR=TOKEN` for nonsequential PuckPedia tokens. Seasons fetched through
`--salary-seasons` also contribute contract observations. The current player
snapshot still comes only from the focus season. This adds a directory fetch
for the following season unless that season was already requested.

Contract identity is player ID, signing date, and start season. Each contract
season preserves its own cap hit and clauses; actual total salary is stored
separately as `cashSalary` when PuckPedia supplies it. Missing contract identity,
term, or cap hit and contracts outside the requested season are skipped with
warnings. Unresolved player matches are reported and skipped by the live sync;
the historical importer blocks all writes until every identity is resolved. Directory
absence never deletes historical contracts. Live observations take precedence
over later historical imports, and missing optional metadata does not clear
known values. First/last observation times describe our collection, not signing
events; live reruns advance last-observed times even when terms are unchanged.

This is polling of directory snapshots, not a complete signing-event feed.
Coverage depends on running the sync and on the contracts exposed by the
requested seasons. A correction to a signing date or start season changes the
identity and needs review rather than automatically replacing old history.
Deploy the new Convex schema/functions before running the updated sync.

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
- `--contract-seasons <yyyy,yyyy,...>`
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

#### Category-based fantasy forecast experiment

`src/commands/ratings/backtest-fantasy-categories.ts` evaluates local category
forecasts against subsequent NHL seasons. It reads the existing 13-season NHL
source snapshots and verified team-exposure audit, fetches official hits/blocks
and immutable birthdates into an automatically removed temporary workspace,
and saves predictions, evaluation, source hashes and an interactive HTML report.
It does not access Convex or change GSHL ratings/salaries.

```bash
node ../node_modules/tsx/dist/cli.mjs src/commands/ratings/backtest-fantasy-categories.ts --baseline ../.local-data/nhl-rating/value-v2-final-20260930 --team-audit ../.local-data/nhl-rating/team-success-20261001/team-success-input-corrected.json --output ../.local-data/fantasy-forecast-experiment
```

Use a new output directory. `--help` describes the inputs. Read `report.html`,
`evaluation.csv`, `projections.csv` and `analysis.json`; `backtest-errors.csv`
contains per-player prediction errors. Horizons 1/2/3 are individual future
seasons; contract evaluations average all years of fully observed two/three-year
terms. Totals use 82-game equivalents. See `docs/RANKING.md` for validation
boundaries and exclusions. This is research, not a production salary command.

#### Compare salary-rating upgrades with the current talent formula

`src/commands/ratings/test-salary-rating-upgrades.ts` reuses the category experiment's
source preparation and tests three variants against a replay of the current
talent formula. Run with the operator tsconfig so existing aliases resolve:

```bash
node ../node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json src/commands/ratings/test-salary-rating-upgrades.ts --baseline ../.local-data/nhl-rating/value-v2-final-20260930 --team-audit ../.local-data/nhl-rating/team-success-20261001/team-success-input-corrected.json --output ../.local-data/salary-upgrades
node ../node_modules/tsx/dist/cli.mjs src/commands/ratings/calibrate-salary-rating-forecasts.ts --input ../.local-data/salary-upgrades --output ../.local-data/salary-upgrades-calibrated
node ../node_modules/tsx/dist/cli.mjs src/commands/ratings/report-salary-rating-upgrades.ts --input ../.local-data/salary-upgrades-calibrated
node ../node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json src/commands/ratings/preview-contract-talent.ts --input ../.local-data/salary-upgrades-calibrated --source ../.local-data/nhl-rating/value-v2-final-20260930/20252026/source.json --output ../.local-data/contract-talent-preview
```

Only the first command fetches public source data, using temporary scratch
storage. Subsequent commands operate on local derived results. Output directories
must be new; the report command refuses to overwrite an existing `report.html`.
All commands support `--help`; none writes Convex, salaries, or production ratings.
`salary-validation.json` retains scalar forecasts/outcomes, fold comparisons,
source provenance and calibration maturity checks. `contract-ratings.csv` provides
annual and two/three-year candidate ratings, with separate position ranks.
No new salary curve or cross-position replacement-value policy is implied.

Use `--experiment isolated` on the test command to compare the original rate
model with NHL impact inputs, historical goalie save percentage, and both together.
This separates feature value from the previously tested change to direct totals.
Calibration and report commands discover the completed experiment's variants.
The preview command accepts `--method <variant>` to inspect a particular candidate;
it requires historical evaluation evidence for that method.

Positional salary research uses historical GSHL weekly outcomes and replacement
depth. The production audit is read-only; the analysis, validation and HTML
report commands operate entirely on local snapshots. None publish salaries.
The current experiments have not established a reliable positional replacement
for the salary formula; see `docs/RANKING.md` for results and limitations.

```bash
node ../node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json src/commands/ratings/audit-positional-salary-history.ts --target production --output ../.local-data/position-history
node ../node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json src/commands/ratings/test-positional-matchup-predictions.ts --history ../.local-data/position-history --source ../.local-data/draft-slot-research/source.json --roster-mode prior-week --output ../.local-data/position-validation
node ../node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json src/commands/ratings/test-positional-salary-weights.ts --history ../.local-data/position-history --source ../.local-data/draft-slot-research/source.json --baseline ../.local-data/position-validation/validation.json --roster-mode prior-week --output ../.local-data/position-weights
```

`analyze-positional-salaries.ts` accepts audited `contexts.json`, the development
forecast directory and the prior experimental salary sample. It exports
replacement-depth scenarios and candidate player salaries. Use
`report-positional-salaries.ts --help` for the local interactive report's input
paths. Each command's `--help` describes its required files; output targets must
be new. Opening-roster and prior-week validation runs must use separate targets,
and the scarcity-weight comparison requires a baseline with the same roster mode.

The follow-up unified-rating workflow reconstructs the newer category forecaster
at each origin, compares real-player replacement values, and exports one combined
F/D/G ranking for two- and three-year contracts. Source API responses use a
temporary cache; persisted outputs contain derived predictions and diagnostics.
All three commands below are read-only with respect to production:

```bash
node ../node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json src/commands/ratings/build-unified-salary-forecasts.ts --baseline ../.local-data/nhl-rating/value-v2-final-20260930 --team-audit ../.local-data/nhl-rating/team-success-20261001/team-success-input-corrected.json --output ../.local-data/unified-forecasts
node ../node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json src/commands/ratings/evaluate-unified-salaries.ts --forecasts ../.local-data/unified-forecasts/forecasts.json --history ../.local-data/position-history --source ../.local-data/draft-slot-research/source.json --output ../.local-data/unified-values
node ../node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json src/commands/ratings/report-unified-salaries.ts --input ../.local-data/unified-values/validation.json --output ../.local-data/unified-values/report.html
```

The history directory must include linked player identities (`directory-linked.json`
from the October audit, or a fresh `directory.json` with `nhlApiId`). The evaluator
exports selected rankings, all alternatives, chronological matchup tests and
complete-contract correlations. The selected model is a research candidate, not
an automatic salary publication. Its shared percentile is distinct from the
existing talent rating. See each command's `--help` for its inputs.

The report optionally accepts `--forecast-baseline` pointing to the preceding
calibrated `salary-validation.json`. This adds an identity/term-matched comparison
against the prior category forecaster, alongside the original talent baseline.

For the current signing policy, follow evaluation with the single-price command:

```bash
node ../node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json src/commands/ratings/price-unified-salaries.ts --input ../.local-data/unified-values/validation.json --output ../.local-data/unified-salaries
```

This produces one annual salary for any one- to three-year term, weighting future
value 70/20/10. The old report's separate term averages remain diagnostics and
must not be presented as current annual price options. Local CSV/JSON exports
include annual salary, total commitments and historical weighting sensitivity.
There are no database writes; all three horizons must be present.

The evaluator now defaults to `--skater-pool shared`: forwards and defensemen
share skater donor contexts, utilization and a combined replacement pool.
Use `--skater-pool positional` to reproduce the earlier scarcity model. This
removes reserved defensive-slot assumptions; historical contexts still do not
replay the proposal's best-ball selections or C/LW/RW/D appearance ceilings.
The pricing command defaults to `--curve relaunch`, using the proposal's PCHIP
benchmarks and $50k rounding, with a $1m floor at rank 400. These are base salaries
before renewal/UFA premiums. `--curve legacy` retains the former curve and its
experimental nonpositive-value floor for comparison. No existing contracts change.

To test sustained-production veteran corrections before valuation:

```bash
node ../node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json src/commands/ratings/test-veteran-forecasts.ts --forecasts ../.local-data/unified-forecasts/forecasts.json --source ../.local-data/draft-slot-research/source.json --directory ../.local-data/position-history/directory-linked.json --output ../.local-data/veteran-forecasts
```

Use the resulting `forecasts.json` as the evaluator input. Its preferred-method
metadata selects the supported-retention correction for year one; later years retain the
baseline. The evaluator's `--veteran-method` can select another exported variant
for comparison. The test exports historical category errors and forecasts using
only completed outcomes at each origin. It reads local snapshots and writes a
new local directory; it does not access production or external APIs. See
`docs/RANKING.md` for the limited cohort evidence and broader matchup tradeoff.

`src/commands/ratings/test-salary-rating-curves.ts` tests further score calibration
changes using the isolated experiment's local derived forecasts. Pass `--input`
with the calibrated isolated directory and `--output` with a new directory.
It compares the strongest position-specific candidate with a monotone curve,
a historically learned blend with current talent, and origin-workload group
calibration. `validation.json` retains predictions, complete-contract comparisons,
per-origin results and fit maturity audits. No external API or database access
is required. Workload groups describe the completed regular season, not known
future roster roles. These are research alternatives, not production defaults.

The upgrade test command also accepts `--experiment development`. It compares
the position-specific best model against annual category-rate trends and
age/usage interactions; it requires no knowledge of future rosters or minutes.
The calibration command accepts `--forward-workload` to apply the experimental
origin-workload correction equally to every forward candidate and baseline.
That mode is recorded in the output. The player preview command currently
rejects grouped calibration rather than silently displaying ungrouped scores.

#### NHL rating versus real contract salary

`src/commands/ratings/audit-nhl-salaries.ts` reads production v3 regular-season
ratings and historical `nhlContracts`/`nhlContractSeasons` through bounded,
season-indexed queries. It requires an explicit production target and writes
only a new local snapshot directory. It never substitutes current-profile or
GSHL salaries. Start years identify seasons (2024 = 2024-25).

```bash
node ../node_modules/tsx/dist/cli.mjs src/commands/ratings/audit-nhl-salaries.ts --target production --seasons 2023,2024,2025 --output ../.local-data/nhl-salary-snapshot
node ../node_modules/tsx/dist/cli.mjs src/commands/ratings/analyze-nhl-salaries.ts --input ../.local-data/nhl-salary-snapshot/snapshot.json --output ../.local-data/nhl-salary-comparison
```

The second command runs offline and writes `report.html`, `players.csv` and
`analysis.json`. It shows cap-share/rating correlations, matched-cohort pay and
rating percentiles, and observed peer ranges in both directions. Sparse seasons,
ambiguous contracts, provisional ratings and insufficient peer samples stay
explicit; no salary forecast or fair-market dollar surplus is claimed. See
`docs/RANKING.md` for the comparison rules. Both commands support `--help`.

#### `nhl-contracts:import`

Imports the contract-season JSON export into `nhlContracts` and
`nhlContractSeasons`. The export's `Season` is an ending year: `2009` becomes
start year `2008`. Placeholder rows are discarded, equivalent duplicate
contract seasons are collapsed, and conflicting duplicates or malformed
required values block the import. Source term/status discrepancies are warnings
and remain available in each season's `historicalValues`, along with original
normalization/ranking fields. Those source-derived metrics are not treated as
verified future NHL salary caps or cash salaries.

Player matching uses a stable NHL ID when available, otherwise normalized name
plus birthdate. Missing/ambiguous identities block all import writes; the
importer does not create players. Historical source contract IDs are retained,
but Convex IDs are canonical. Each contract and its seasons are written in one
bounded transaction. A run spanning many contracts may be partially applied
if interrupted; rerunning is safe and does not delete records.

For independently verified aliases, missing bios, or duplicate player records,
`--player-map <path>` accepts a reviewed JSON array with `sourceName`,
`sourceBirthDate`, canonical `playerId`, `reason`, and evidence URL `sourceRef`.
A contradictory stored birthdate still blocks matching unless that particular
mapping explicitly sets `allowBirthdateConflict: true`. Evidence and reasons
are retained on the imported season records and in the full audit. Mappings
do not modify player records or the original historical values.

```bash
npm run nhl-contracts:import -- --file /path/to/history.json --validate-only
npm run nhl-contracts:import -- --file /path/to/history.json --target production --match-only
npm run nhl-contracts:import -- --file /path/to/history.json --target production --report /path/to/audit.json
npm run nhl-contracts:import -- --file /path/to/history.json --target production --apply
```

File validation is local. Match-only reads existing players and can run before
deployment; full previews require the new Convex schema/functions. Apply
requires an explicit target, previews every contract first, and repeats the
preview afterward to verify an unchanged result. The full local report includes
all validation warnings and unresolved identities; console samples are bounded.
This workflow does not update GSHL contracts or the separate salary-history
table. Use `nhl-salaries:import` when that projection also needs populating.

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

#### `stats:sync-yahoo-daily-rosters`

Temporary current-season Yahoo website source while Fantasy API access is
unavailable. Reads every season team's roster for one date using its stored
Yahoo team ID. Only team membership, Yahoo eligibility (`nhlPos`), position
group, and daily lineup slot are created/patched on player-day rows. Yahoo
statistics are ignored. Roster-only mode preserves existing stats and global
Player ownership. Add `--daily-pipeline` for the complete current-day workflow.
The date defaults to today in `America/Toronto`; it must resolve to one season
and week. An explicit `--season-id` uses that season's existing week calendar,
even if the season-level start date is later. This command uses current-season
Yahoo URLs, not historical archives.

```powershell
npm.cmd run stats:sync-yahoo-daily-rosters -- --target production --season-id 13 --league-id 44541
npm.cmd run stats:sync-yahoo-daily-rosters -- --target production --season-id 13 --league-id 44541 --apply --sync-nhl
npm.cmd run stats:sync-yahoo-daily-rosters -- --target production --season-id 13 --league-id 44541 --daily-pipeline
npm.cmd run stats:sync-yahoo-daily-rosters -- --target production --season-id 13 --league-id 44541 --daily-pipeline --apply
```

Review the first command's plan before applying. All teams must load and every
Yahoo player ID must match exactly one existing player. A missing stored Yahoo
ID may be filled from a unique exact full-name match; existing IDs are never
overwritten and names are never matched approximately. Unresolved/duplicate IDs,
duplicate roster assignments and malformed pages block writes. Stored days absent
from Yahoo also block writes unless `--superseded-backup-dir` explicitly enables
backed-up removal. Use the Yahoo ID backfill workflow for unresolved identities.

With backed-up removal, the dry run lists the exact superseded row IDs.
Apply confirms every team's dated roster a second time and checks that the old
records have not changed. It saves a recovery backup of the complete superseded
rows and replacement roster in the supplied independent directory outside the
workspace and OneDrive. The backup is hash-verified by reading it back before
deleting the exact superseded records. The authenticated exact-ID mutation
compares each complete backed-up row before deleting it and its performance-index entries. Superseded
rows are not kept in an application review archive.
Failures stop the run and are safe to retry. This option does not override unknown
identities, duplicate assignments, or contract conflicts.
The existing Yahoo cookie/browser configuration, throttling, and retries apply;
use `--help` for browser options. HTML and session material are never saved.

`--sync-nhl` runs the existing NHL daily sync for those teams after a successful
roster apply and metadata verification, preserving existing ratings. In dry-run
mode it is deferred because new day rows are only planned. This phase requires
the Python prerequisites above; a failure can
leave roster metadata applied, and both phases can be rerun. Use `--python-bin`
if Python is not on PATH. No managed schedule is enabled by this command.
Capture lineups during the day and rerun for the same date after games finish to
collect final NHL stats.

For a historical date in this Yahoo season, use `--date YYYY-MM-DD --sync-nhl
--aggregate`. This imports that date's lineup and NHL stats and rebuilds the six
season rollups without changing today's ownership or processing historical
buyouts. A two-day grace period after the last scoring date allows final stats
to settle. `--current-rosters` runs today's roster/optimizer/buyout step without
the NHL fetch; combine it with `--aggregate` for frequent lineup refreshes.
`--summary` keeps logs to counts, changes and conflicts.

`--daily-pipeline` includes NHL sync and only accepts today's Toronto date. It
then updates `Player.ownerId` and the current team through Team → Franchise →
Owner, refreshes Yahoo eligibility, and runs the existing lineup optimizer using
season roster slots and player season ratings. The resulting `Player.lineupPos`
is separate from the Yahoo `dailyPos` used for scoring. Unrostered players have
their current ownership, team, and lineup position cleared.

The dry run lists roster changes and proposed buyouts before any writes. Playing
contracts belonging to current season owners whose players are absent from the
entire Yahoo league become buyouts: 50% of the original salary remains as the
cap charge, through the original contract end, or through the following season
for a final-year buyout. Original salary and signing information are retained.
Ended contracts and contracts of former owners are excluded. A contracted
player appearing under another current owner blocks the run for transaction
review; a roster capture alone cannot distinguish a trade from a drop/pickup.
Missing future-season dates and overlapping playing contracts also block the
run. Yahoo league membership is checked again before buyouts. Ownership and
contract plans are reread after the NHL stage to detect concurrent changes.

Finally, the six season rollups are rebuilt from all persisted player days in
that season: player weeks, splits and totals; team days, weeks and seasons.
This shares the existing aggregation math, preserves rating/award/power fields,
and never deletes stale derived rows. Career totals, power, awards and standings
are separate workflows. Aggregate dry-run counts use planned roster metadata
with currently stored NHL statistics; live NHL updates can change the result.
The stages are resumable, not one database transaction. If a later stage fails,
rerun the dry run and apply; existing buyouts are not charged again.

#### `stats:yahoo-cycle`

Runs one resumable cycle for a Windows Task Scheduler task or another operator
scheduler. Consult `--help` for the required deployment, league, season, scoring
date range and Python executable. Dry runs exercise the child import previews
without advancing the checkpoint; `--apply` enables the validated stages.

The intended cadence is hourly from 08:00 through 22:00 in `America/Toronto`,
including daylight-saving changes. The runner refuses work outside that window.
Yahoo membership, eligibility and daily slots are reconciled on each scrape,
including backed-up deletion of superseded days when enabled. The first hourly
capture after the NHL reports every non-postponed game started locks that day's
roster; subsequent updates use stored rosters and NHL stats without scraping
Yahoo. Unknown start status and no-game dates keep hourly Yahoo checks enabled.
Morning runs recheck the previous two dates for final stats, using NHL-only mode
for already locked dates. After downtime, older missing dates are processed first,
at most two per cycle. Historical failures do not advance past the failed date.
Each hourly NHL cycle also re-fetches every prior day of unfinalized matchups,
including double weeks, and rebuilds the six rollups. Corrected zeroes replace
previously credited stats. NHL source failures abort instead of clearing stats
from an incomplete response. Yahoo lineups remain locked independently of stats.
Current-roster failures are recorded while independent historical work can
finish. Contract/source conflicts require review and are never silently accepted.

After the morning recheck succeeds, the cycle closes ended scoring weeks using
the existing standings and power commands. It checks NHL game completion before
advancing historical checkpoints, finalizes matchup scores, rebuilds entering-week
power, refreshes standings/rank tiebreaks, then hands each completed week to the
Press Box. Failed stages retry on the next daytime cycle; a persisted completion
marker prevents repeating successful weekly work. Catch-up waits until every
ended week is reconciled because these calculations operate on the whole season.
Immediately before finalization, the rollover rechecks the entire ended matchup
once more. Its persisted `weeklyRefreshCompletedAt` marker then freezes player-day
stats and Yahoo roster imports; subsequent NHL corrections are ignored for that
week. Merely passing Sunday midnight does not freeze a week before the morning
handoff succeeds. Standalone rollover accepts `--python-bin` for this final pass.
Sunday-ending weeks therefore roll over on the first successful Monday run after
08:00 Toronto. The operator PC must be available; this is not a hosted calculation job.

The backend `weeklyEditions:completeWeeklyRefresh` and the week completion field
must be deployed before applied rollovers can run. A read-only preflight blocks
weekly writes from an operator checkout whose backend is not deployed yet. The
Press Box queues only after the handoff, preserving existing editorial protections
and writing retries. Season dates also identify current seasons when `isActive`
is stale. Without a Newsroom key, the handoff uses the existing template generator.
For a standalone preview, consult
`src/commands/stats/run-weekly-rollover.ts --help`; it requires explicit production
configuration and completed morning checkpoint dates. Dry runs preview each
calculation against persisted data, so later stages do not include earlier
unapplied changes; they neither publish nor advance completion markers.

The runner gets the server credential from its environment or the signed-in
Convex CLI for the explicitly named deployment, retains it only in memory, and
redacts it from child output. Backed-up removals require the deployed
`yahooRosterReconciliation:removeSupersededDays` mutation.
The operator PC must remain awake, connected, and logged into the scheduled
Windows user. Configure the task to skip overlapping runs and start when a
missed trigger becomes available; a process lock also prevents overlapping cycles.
Long NHL/catch-up runs can delay the next roster refresh.
Pass `--superseded-backup-dir` to the runner to enable the same backed-up
reconciliation for current and historical stages. `--nhl-only` on the daily
command refreshes NHL stats and the six safe rollups from stored player-days;
it does not scrape Yahoo or change current ownership/contracts.

Checkpoints, daily logs and the latest status are under `.local-data/yahoo-sync/`,
with deployment/league/season in each filename. A failed run records its stage
and retries on the next trigger. Invalid checkpoints/locks fail visibly instead
of guessing; inspect the prior process before manually repairing a lock. Local
state is operational progress, not a database backup. Keep the task's scoring
range aligned with the existing weeks and allow two days after the final week
for final-stat catch-up.

#### `stats:sync-nhl-daily`

Uses the Python `nhl-api-py` client to fetch real NHL boxscore data for one or
more dates, matches those rows to existing `PlayerDayStatLine` records, and can
write refreshed day-level stats back to Convex. Existing Yahoo eligibility and
daily slots are preserved; NHL position is only a fallback for missing eligibility.

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
