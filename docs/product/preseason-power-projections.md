# Preseason power projections

This records the initial roster-model iteration. The subsequent
[standings and matchup evaluation](power-ranking-objectives.md) adds owner
history to preseason and documents the current formula and validation.

## Decision and evidence

There are concrete improvements over the old preseason roster average: the
preseason display now works without player-day statistics, all roster members
count, positional eligibility and goalie coverage matter, and scoring follows
each season's configured categories. The new category projection is integrated
with the first four entering-week power snapshots.

Predictive improvement is modest in the available retrospective comparison.
This is not a calibrated championship probability or a proven large accuracy
gain. Keep collecting opening projections and evaluate them prospectively.

The local comparison covers 124 team-seasons across eight seasons, labeled by
their ending years (2019–2026). Both methods use the recorded draft rosters.
The baseline reproduces the former weighted roster average of the latest prior
NHL overall rating, with the existing depth weights. The candidate uses only
NHL seasons preceding each forecast. The targets are realized regular-season
category strength (equal-weight category z-scores) and wins plus half of ties.

| Mean within-season Pearson correlation | Baseline | New projection |
| -------------------------------------- | -------: | -------------: |
| Realized category strength             |    0.364 |          0.381 |
| Regular-season wins                    |    0.342 |          0.369 |

| Season ending year | Category baseline | Category projection | Wins baseline | Wins projection |
| ------------------ | ----------------: | ------------------: | ------------: | --------------: |
| 2019               |              .564 |                .593 |          .685 |            .581 |
| 2020               |              .518 |                .576 |          .469 |            .564 |
| 2021               |              .440 |                .533 |          .377 |            .430 |
| 2022               |              .572 |                .524 |          .570 |            .592 |
| 2023               |              .239 |                .211 |          .216 |            .266 |
| 2024               |              .116 |                .151 |          .251 |            .315 |
| 2025               |              .258 |                .263 |          .198 |            .141 |
| 2026               |              .207 |                .200 |         -.027 |            .066 |

Category correlation improves in five seasons; win correlation improves in six.
These are exploratory descriptive results, not an untouched holdout or a
statistical significance claim. This compares roster projection methods, not the
old full GM/history/Elo composite or alternative early-season decay schedules.
Roster turnover, waiver management, coaching decisions, and playoff outcomes are
not modeled. One historical draft roster contains 14 players; the others contain
at least 15. Recorded draft ownership and historical eligibility are imperfect
proxies for a timestamped opening roster.

## Formula

1. Use the previous three NHL seasons with recency weights `1, 0.6, 0.3`.
   Forecast category rates as `(weighted category total + prior games × position
group rate) / (weighted games + prior games)`. The regression prior is 30
   games for skaters and 50 for goalies. Points equal goals plus assists.
2. Estimate availability from historical games divided by the highest player GP
   in that NHL season, so shortened seasons do not look like injuries. Older
   missing-season histories lose workload. Unproven skaters and goalies receive
   position-average rates and conservative availability of 55% and 30%.
3. Integrate 512 deterministic daily availability samples at a common 3.2 NHL
   games per week. Select the strongest feasible lineup for the configured slots,
   respecting multi-position eligibility. Bench players contribute on days when
   they can actually fill a slot; goalie/skater slots remain separate.
4. Add expected counting stats. Calculate GAA from goals allowed and goalie
   minutes and SV% from saves and shots faced, never an unweighted mean of ratios.
5. Standardize each selected scoring category across the season's teams, reverse
   GAA, and cap each category at ±2.5 standard deviations. Scale goalie category
   strength toward the floor when the estimated weekly appearance minimum is
   unlikely to be met. The historical first season uses one appearance; other
   seasons use two, matching the current league rule.
6. Average the category strengths equally, standardize that composite, and
   display `50 + 25 × composite`. These are relative power scores, not win
   probabilities. Equal weighting intentionally counts both points and its
components when the league scores all three categories.

All current teams can move in the preseason order. Broad category production,
usable positional depth, and dependable goalie coverage gain importance relative
to a single average rating. Rosters with positional congestion or insufficient
goalie appearances lose ground; unproven forwards, defensemen, and goalies stay
in the model through their respective position priors. Later weekly player
ratings and the underlying player-rating calibration are unchanged.

The general use of recency and regression is consistent with the simple
[Marcel forecasting approach](https://www.tangotiger.net/marcel/). The hockey
coefficients, lineup integration, and goalie handling here are our own modeling
choices; that source does not validate these hockey forecasts. No age curve is
added without hockey-specific calibration.

The explicit preseason blend is 100%, 75%, 50%, and 25% entering Weeks 1–4, and
zero entering Week 5. This schedule is a policy choice. Existing rolling talent
and seeded Elo retain their own historical information afterward. Week N results
still cannot change Week N's entering snapshot.

## 2026–27 coverage and review snapshot

A read-only production query on September 24, 2026 verified 14 teams, 210 current
roster assignments, 210 selected draft picks, and 3,124 NHL rows in the previous
three seasons. All teams have 15 players. Two rostered players lack prior NHL
history. The season is stored with ending year `2027` and scores G, A, P, PPP,
SOG, HIT, BLK, W, GAA, and SVP. Plus/minus contributes nothing this season.

| Rank | Team                 | Projection |
| ---- | -------------------- | ---------: |
| 1    | Hubie's Beauties     |      83.23 |
| 2    | Sauce Puck           |      82.65 |
| 3    | Dirty F & Gs         |      79.43 |
| 4    | Butabi Brothers      |      73.58 |
| 5    | Ben Eagers Hands     |      68.44 |
| 6    | The Poo Balances     |      63.05 |
| 7    | Robert Thomas        |      57.66 |
| 8    | Auto Draft All-Stars |      43.92 |
| 9    | TBD                  |      38.76 |
| 10   | Peps                 |      33.02 |
| 11   | THE WAUPOOS FLASH    |      25.46 |
| 12   | Dutch Rudders        |      25.17 |
| 13   | Oxford Dandellions   |      21.49 |
| 14   | Toronto Maple Reg's  |       4.13 |

Nearby ranks should be read as similar strength, not confident ordering. These
are local review results, not published league rankings. Unused/future draft
picks add no current playing strength; selected players count through the roster.

## Limits and next validation

Historical availability is not a current injury forecast. The model does not
ingest injury news, NHL depth-chart changes, projected power-play deployment,
prospect scouting, or the actual upcoming NHL calendar. Schedule draws assume
independent availability, so teammates' correlated schedules and goalie relief
appearances are approximated. The goalie qualification value is a model estimate,
not a calibrated probability. Finite lineup sampling also introduces numerical
approximation, although replay is deterministic.

Current preseason views use current player assignments and eligibility. Week 1
replay prefers its opening-day snapshot and otherwise uses the completed draft;
transactions between the draft and opening day therefore require that opening
snapshot to be reflected accurately. Historical rows can be corrected after the
fact; this is not an immutable archive of information known at draft time.

Before describing this as a high-confidence predictor, save the opening inputs,
evaluate early-week forecasts prospectively, and compare category errors and
matchup outcomes against both the former full power composite and simpler
baselines. Fit any decay, age, injury, or external-projection adjustments on
training seasons and retain genuinely unseen seasons for evaluation.

## Reproduction and rollout

The local-only `scripts/src/commands/power/evaluate-preseason.ts` reads the cached
draft research dataset. `scripts/src/commands/power/preview-preseason.ts` performs
read-only production queries and writes local review artifacts. Both expose
their current options through `--help`. Inputs and numeric reports remain under
`.local-data/`; no credentials are written to those artifacts.

The browser preview is computed by a shared pure module through the existing
Convex power endpoints. No stored schema fields or fictional weeks were added.
Publishing the backend changes and recomputing stored power snapshots are
separate operations; neither was performed as part of this implementation.

## Verification

Passed locally:

- `npm.cmd run ranking-engine:check`: 22 existing ranking, power, aggregation,
  and lineup fixtures.
- From `scripts/`, `node ../node_modules/tsx/dist/cli.mjs --test
  src/domains/power/preseason-projection.test.ts`: 8 projection fixtures covering
  season categories, future-data exclusion, shrinkage, unknown players, goalie
  ratios/minimums, eligibility, determinism, 14-team coverage, Week 1 seeding,
  and the four-week transition.
- `npx.cmd tsx --test src/lib/utils/features/power-rankings.test.ts`: 5 frontend
  view-model fixtures, including preseason display and handoff to weekly history.
- `npm.cmd run check:architecture`.
- From `scripts/`, `npm.cmd run typecheck`.
- `npx.cmd tsc --noEmit -p tsconfig.build.json`.
- `npx.cmd eslint` on the changed lintable files: `convex/lib/preseasonPower.ts`,
  `convex/standings.ts`, `convex/frontend.ts`, `src/lib/types/standings.ts`,
  `src/lib/utils/features/power-rankings.ts`, its test file,
  `src/hooks/features/useStandingsData.ts`,
  `src/components/standings/PowerRankings.tsx`, and
  `src/components/home/PowerRankingsHomeCard.tsx`. Operator files are excluded
  by this repository's ESLint configuration and covered by scripts TypeScript
  and numerical tests.
- `git diff --check` and focused diff inspection.

The historical evaluation and current-roster read-only preview were also run.
A full Next.js production build, browser end-to-end tests, deployment, and
production power recomputation were not run. Unrelated concurrent changes in the
workspace were left intact.
