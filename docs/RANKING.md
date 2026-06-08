# Ranking Engine

## Overview

The ranking engine is the shared scoring runtime used to assign ratings across
player and team stat sheets. It now has a single hand-edited source of truth in
`scripts/src/runtime/apps-script/features/RankingEngine/`, and the Apps Script
project consumes a synced copy from there.

This document describes:

- how the engine is structured right now
- what sheets and entry points it supports
- what consolidation and optimization work is already done
- what is still worth improving next

## Current structure

The ranking engine is split across four runtime files:

- `config.js`
- `player-pure.js`
- `team-pure.js`
- `index.js`

### File responsibilities

`config.js`

- Defines `TuningConfig`, the structured home for tunable constants.
- Holds category defaults, goalie/team scoring knobs, cohort thresholds,
  distribution caps, retained-range settings, calibration multipliers, and
  skater/goalie profiles.

`player-pure.js`

- Holds the pure player scoring helpers.
- Ranks skater and goalie cohorts without owning sheet reads or orchestration.
- Contains the heavier math for category scoring, support/breadth/volume
  blending, and NHL-specific player shaping.

`team-pure.js`

- Holds the pure team scoring helpers.
- Ranks team day, week, season, and generic team rows from prepared inputs.

`index.js`

- Owns the public API and orchestration layer.
- Detects sheet types, groups rows, builds comparison pools, reads season
  categories, manages caches, and delegates to the pure player/team helpers.

## Source of truth and sync flow

The intended authoring model is now:

- Hand-edited source: `scripts/src/runtime/apps-script/features/RankingEngine/*`
- Synced Apps Script copy: `apps-script/features/RankingEngine/*`

The repo includes a small sync/check utility:

- `npm run ranking-engine:sync`
- `npm run ranking-engine:check`

Those commands are available from the repo root and from `scripts/`.

`tools/ranking-engine-sync.mjs` now:

- copies all four engine files from `scripts` to `apps-script`
- verifies file parity with SHA-256 hashes
- retries transient `EBUSY`, `EPERM`, and `ENOENT` file access issues

There is also a CI guard:

- `.github/workflows/ranking-engine-sync-check.yml`

That workflow fails if the two checked-in engine copies drift apart.

## Public API

The engine exposes three main entry points:

- `rankRows(rows, options)`
- `rankPerformance(row, options)`
- `getPerformanceGrade(score)`

### `rankRows(rows, options)`

Batch-ranks rows for a supported sheet and writes the score into the correct
output field for that sheet. It handles sheet detection, season grouping, team
vs. player routing, and position-specific player routing.

### `rankPerformance(row, options)`

Scores a single row and returns a normalized result object. This is most useful
for one-off evaluation paths such as team-day style lookups.

One important current behavior: player day/week single-row calls intentionally
return a blank result instead of fabricating a meaningful standalone rating.

### `getPerformanceGrade(score)`

Maps numeric scores into the current labels:

- `Insanity`
- `Super Elite`
- `Elite`
- `Above Average Starter`
- `Borderline Starter`
- `Rosterable`
- `Waiver Wire`
- `No Impact`

## Supported sheets

The engine currently supports:

- `PlayerDayStatLine`
- `PlayerWeekStatLine`
- `PlayerSplitStatLine`
- `PlayerTotalStatLine`
- `PlayerNHL`
- `TeamDayStatLine`
- `TeamWeekStatLine`
- `TeamSeasonStatLine`

Sheet detection in `index.js` is row-shape based, but callers can also pass an
explicit `sheetName`.

## How scoring works right now

### Categories and season context

Skater categories usually come from `Season.categories`, read through the Apps
Script sheet layer. The engine caches season category lookups and falls back to
default skater categories when that metadata is missing.

Default skater categories:

- `G`
- `A`
- `P`
- `PPP`
- `SOG`
- `HIT`
- `BLK`

Default goalie core categories:

- `W`
- `GAA`
- `SVP`

Lower-is-better categories are configured in `config.js` and currently include:

- `GAA`
- `GA`

`PlayerNHL` is a special case that always uses the default skater category set
for rating.

### Player models

Player rows are grouped by position group:

- `F`
- `D`
- `G`

Skaters and goalies are then ranked against comparison pools built from the
current sheet context. The orchestration layer widens the pool when a cohort is
too small, so short or thin groups can still be ranked against a broader
position-appropriate sample.

### Skater scoring

Skater models blend:

- category efficiency
- support
- breadth
- volume
- star impact

Profile weights vary by sheet and now live in `config.js`, not inline in the
large engine file.

Important current behaviors:

- Day and week player sheets use retained-range scoring to reduce distortion
  from weak or inactive short samples.
- Split, total, and NHL sheets use distribution-based scoring with capped
  comparison pools.
- Day and week sheets apply position multipliers, so equally strong raw stat
  lines can land differently for `F`, `D`, and `G`.
- `PlayerNHL` has its own profile and adds a heavier core-season-value shape
  than the other skater sheets.

### Goalie scoring

Goalie models blend:

- efficiency
- support
- breadth
- workload

Workload composition is profile-driven and can include mixes of:

- `GS`
- `SA`
- `SV`
- `TOI`

Current goalie handling also includes:

- configurable negligible-TOI thresholds
- profile-level small-sample caps on aggregate sheets
- retained-range handling for short-horizon sheets

### Team models

Team models are percentile-based against season-scoped team pools.

### `TeamDayStatLine`

- Scores each category against the season distribution.
- Applies no-activity safeguards so rows with no meaningful action rate as `0`.
- Uses a configured fallback score for missing goalie-category output when there
  was no goalie activity to rank.
- Applies the configured day multiplier after averaging category scores.

### `TeamWeekStatLine`

- Normalizes week category comparisons using a comparable GP baseline.
- Preserves `GAA` and `SVP` directly instead of GP-scaling them.
- Uses a fallback goalie-category score when a team week has no qualified
  goalie stats.
- Applies the configured week multiplier after averaging category scores.

### `TeamSeasonStatLine`

- Ranks within season and season-type scope.
- Uses the same team-oriented category logic, but on the full season pool.
- Also derives award-style team ratings from regular-season team, player,
  draft, and standings data after the main team score is assigned.
- Writes `hartRating` and `hartRk` for pure team-season value.
- Writes `norrisRating` and `norrisRk` for defense-driven team performance.
- Writes `vezinaRating` and `vezinaRk` for goalie-driven team performance.
- Writes `calderRating` and `calderRk` for draft value.
- Writes `jackAdamsRating` and `jackAdamsRk` for coaching value.
- Writes `GMOYRating` and `GMOYRk` for roster-management value.
- Clears those award fields for non-regular-season `TeamSeasonStatLine` rows.

## Score scale

The runtime score output is effectively calibrated around a `0-125` style
range, not a strict `0-100`. That is why the grade ladder includes buckets
above `100`.

`rankPerformance()` also returns a normalized result object with summary fields
such as `score`, `percentile`, `components`, and `rawComposite`.

## Local runtime in `scripts`

The `scripts` project does not reimplement the ranking algorithm in TypeScript.
It loads the Apps Script-style runtime into a Node `vm`.

Current loader:

- `scripts/src/domains/ranking/apps-script-engine.ts`

That loader executes the four engine files in this order:

1. `config.js`
2. `player-pure.js`
3. `team-pure.js`
4. `index.js`

It also provides synthetic sheet readers for local execution so the engine can
still access the context it expects from Apps Script, including:

- `Season`
- `PlayerSplitStatLine`
- `TeamSeasonStatLine`

The runtime supports local ranking flows such as backfills, rebuilds, and parity
checks without needing a second copy of the algorithm.

## Important boundary: what the engine does not own

The engine computes ratings. It does not own every field written during rating
pipelines.

For `PlayerNHL`, the engine computes the season rating used by the backfill
flow, but downstream code still derives fields such as:

- `overallRating`
- `salary`

Those remain outside the ranking engine itself.

## Consolidation and optimization already completed

The following suggested improvements are now done:

- `scripts/src/runtime/apps-script/features/RankingEngine/` is the intended
  hand-edited source of truth.
- `apps-script/features/RankingEngine/` is kept as a synced copy of that
  source.
- Sync and parity verification are automated with
  `tools/ranking-engine-sync.mjs`.
- CI now fails if the two checked-in engine copies diverge.
- Tunable constants and profiles were moved into structured config in
  `config.js`.
- Dense player and team ranking math was split out of the main runtime file
  into `player-pure.js` and `team-pure.js`.

These changes make the engine easier to review, safer to tune, and less likely
to drift between local tooling and Apps Script deployment.

## Remaining improvement opportunities

The biggest useful next steps are now around confidence and packaging rather
than raw consolidation:

- Add focused snapshot-style tests for representative rows across every sheet
  and position group.
- Expand parity coverage so it validates team outputs and edge cases in
  addition to the existing player-oriented paths.
- Reduce or formalize cache invalidation for long-lived local processes if more
  commands start reusing the same VM session.
- Consider a more explicit build/bundle step for Apps Script deployment if the
  runtime keeps growing beyond the current four-file split.

## Bottom line

The ranking engine is no longer a single large hand-tuned runtime duplicated in
two places with no guardrails. It is now:

- authored in one place
- synced into Apps Script
- checked in CI
- tuned through structured config
- split into smaller pure helpers

That is a much better base for future tuning and testing, while keeping runtime
behavior aligned between the local `scripts` tooling and the deployed Apps
Script project.
