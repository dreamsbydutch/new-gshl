# Ranking and power

This is the behavior contract for GSHL ratings and weekly power. Implementation
details that can be discovered directly from code are intentionally omitted.

## Source and runtime

The local calculation files live under
`scripts/src/runtime/`:

- `RankingEngine/config.js`
- `RankingEngine/player-pure.js`
- `RankingEngine/team-pure.js`
- `RankingEngine/index.js`
- `PowerRankingsAlgo.js`

Local TypeScript commands load these runtimes into a Node `vm` with supplied
record data. Calculations do not perform storage writes. Convex persistence
belongs to the calling operator workflow.

Run `npm run ranking-engine:check` after runtime changes, and add representative
numerical fixtures when scoring changes. A production rebuild is a separate
authorized data operation.

## Ranking behavior

The public runtime exposes `rankRows`, `rankPerformance`, and
`getPerformanceGrade`. It supports player day, week, split, total, and NHL rows
plus team day, week, and season rows. Player day/week single-row calls return a
blank result because those ratings require a comparison pool.

Player pools are separated into forwards, defense, and goalies, with controlled
widening for small cohorts. Skater profiles blend category efficiency, support,
breadth, volume, and star impact. Goalie profiles blend efficiency, support,
breadth, and workload. Day/week profiles use retained-range handling for short
samples; aggregate profiles use distribution scoring with capped comparison
pools. Tunable weights and lower-is-better categories belong in `config.js`.

Team ratings are percentile comparisons inside season-scoped pools:

- day rows guard against no-activity results;
- week rows normalize counting categories to comparable games played while
  preserving GAA and save percentage; and
- regular-season totals also derive Hart, Norris, Vezina, Calder, Jack Adams,
  and GM of the Year team ratings. Non-regular-season rows clear those awards.

The output scale is approximately 0-125 rather than a strict percentage. Grade
labels, from highest to lowest, are Insanity, Super Elite, Elite, Above Average
Starter, Borderline Starter, Rosterable, Waiver Wire, and No Impact.

The engine computes ratings, not every downstream field. For example,
`PlayerNHL` salary and overall-rating derivation remain outside the engine.

## Independent NHL Season Value

### Game-level v3 candidate

V3 is a separate game-level model, implemented in `nhl-adjusted-impact.ts`,
`nhl-shot-quality.ts` and `nhl-game-season-value.ts` under `scripts/src/runtime/`.
Use the collect, reconcile and v3 preview commands in `scripts/README.md`.
It has no GSHL categories or salary inputs. The version-aware production publisher
stores it separately from v1, with component coverage, signed ability values,
sampling ranges and warnings. Publication requires verified complete-season
artifacts and passing review gates; production coverage is tracked per season.

The data adapter joins by official game and player IDs. NHL game reports establish
played rosters and exposure; official shifts reconstruct changing lineups.
Official time-on-ice reports provide a fallback when the shift API is empty or
its reconstruction fails verification. An alternative must fully verify or
increase verified process exposure without losing individually attributed shots.
Both sources are retained, and attempted/accepted replacements appear in
`shiftReviews`. A partial replacement does not become fully verified. Report
game/date/side and team/jersey/name joins must agree with the official roster.
Original empty API snapshots are retained, and the report source is identified
on each reconstructed game. Shots must match official event time, shooter,
strength and goalie for lineup attribution. When the lineup conflicts, a shot
can still contribute individual finishing/saving if official shooter, team and
goalie identities verify. Duplicate shifts cannot duplicate exposure.
Full-game model fitting requires at least 98% shot and clock coverage,
every official goal attributed, and each player's reconstructed TOI within the
greater of 30 seconds or 3% of the game report. Unknown shift participants block
full verification. Goalie goals allowed must reconcile exactly. Smaller differences in
shot-on-goal classification/exposure are reported in both game and goalie audits;
official game-report shots supply goalie shrinkage exposure. Source errors remain
visible in `game-audit.json`.

Season ratings include every successfully loaded game. Uncertain shot intervals,
unknown shift participants and intervals involving players with conflicting TOI
are omitted from process credit; verified individual events and other intervals
remain usable. An unresolved shot at a stoppage invalidates the ending interval,
not the following shift. `includedGames`, `verifiedGames` and component coverage
separate participation from full reconstruction. No missing lineup value is
extrapolated or assigned to guessed teammates.

The default probability source is the independent `nhl-event-xg-v1` model fitted
to official unblocked shots. It uses location, angle, shot type, recent shot/rush
indicators, manpower and empty-net state. Missing coordinates or event context
remain missing. This simple model is not MoneyPuck's model; its probabilities
must never be labeled recovered MoneyPuck xG. The optional provider mode requires
matching MoneyPuck shot probabilities and retains MoneyPuck attribution.
Penalty shots are excluded from ordinary xG training. Their own baseline is
`nhl-penalty-shot-v1`: NHL penalty-shot goals/attempts from the preceding five
seasons of the same game type, with Jeffreys smoothing `(goals + 0.5)/(attempts + 1)`.
The bounded paginated source is hash-cached; current-season outcomes do not fit
this baseline. Reports retain its sample size, standard error and source hash.

Official penalty-shot awards and situation codes identify attempts, including
`failed-shot-attempt` events. Shooter finishing receives actual goals minus the
baseline probability; goalie saving receives the opposite. The player drawing
the award receives the expected chance value, and the offender loses it when
those identities are present. Unidentified award participants are not guessed.
These terms use existing finishing/saving/penalty components exactly once, with
no ordinary lineup xG or clock exposure assigned to the attempt. Shootouts remain
excluded. Held-out goal prediction adds the known penalty-shot opportunity's
expected value to both models; it does not use the attempt's result as a predictor.

Adjusted impact fits exposure-weighted ridge regression to chance production
per 60 minutes. Each interval includes attacking players, defending opponents,
exact manpower/goalie state, home ice, score state and faceoff zone. Offensive
and defensive player effects are fitted separately for even strength, power play,
penalty killing and empty-net play. Exact state baselines distinguish 3v3, 4v4,
5v3 and other supported configurations. Ridge reduces unstable individual credit
when players share most of their ice time; it does not eliminate confounding.
Identical design rows are pooled by exposure and expected goals before fitting;
this preserves the ridge solution while reducing repeated numerical work.

The outputs have distinct interpretations:

- `seasonValue`: adjusted chance impact over verified TOI, plus actual goals
  above expected and event penalty value. Goalies receive expected goals minus
  goals allowed, their own finishing and penalty value. Actual finishing/saving
  is not shrunk in this season contribution measure; adjusted process effects
  are regularized.
- `observedValue`: equal-share, context-adjusted on-ice accounting, plus actual
  finishing and penalties. It is retained as a descriptive comparison, not an
  isolated individual effect.
- `abilityPer60`: adjusted process plus independently shrunk finishing, penalties
  and goalie saving, divided by verified minutes. Initial shrinkage comes from
  prior-season v2 calibration and is not newly validated predictive talent.

Penalty events match reciprocal participants before other coincidental
minors/majors, ignore misconduct, distinguish
two-minute/double-minor/major duration, and avoid blaming bench-penalty servers.
Their expected cost uses the change in manpower scoring rates; minor exposure
allows for early termination by a goal, while majors keep their full duration.
Missing manpower is not assumed to be 5-on-5. An extra attacker is removed when
restoring normal goalie deployment for the penalty calculation. Same-whistle
assessments start from the first recorded manpower state so later updated event
codes do not count a penalty twice. Regular-season overtime penalties can add an
opposing skater at 3-on-3 or 3-on-4. Their expected duration is capped at the
scheduled remaining overtime clock, with either team's goal ending exposure;
the actual eventual game-ending goal time is not used to price the event.
Assessments after a decisive final horn or an already-recorded overtime winner
receive no future ice-time cost. A tied regulation horn is not treated as final.
Queued penalties, multiple residual assessments to one player, missing context
and unsupported strength states remain explicitly unpriced.
This is an expected event cost, not a full penalty-clock counterfactual.

Missing official season exposure still makes a season incomplete. With official
exposure present, partial component values remain visible rather than null.
Qualification requires 95% to 103% exposure coverage, at least 95% individual
shot coverage, no missing individual goals, and 200 skater or 300 goalie minutes.
Skaters also need at least 95% usable process minutes; goalies' saving values do
not require unrelated skater lineups. Estimates below these thresholds are
provisional. Official played minutes supply ability-rate denominators so omitted
intervals cannot inflate per-minute ability. Zero-shot goalies have unknown saving
ability. Only qualified players receive ranks and 0-100 percentiles within F/D/G.
`componentCoverage` reports official minutes, process minutes, individual shots
and missing goals separately. Missing minutes are not extrapolated.
Two hundred whole-game bootstrap draws over all included games produce conditional value/rank sampling
ranges. Equal resampled values use the same competition rank, matching the
published ranking convention. These hold fitted coefficients fixed and omit model uncertainty; they
are not calibrated total confidence intervals.

Validation groups games by date. Shot-model tuning uses the first 40% of dates
for training and the next 20% for selection, then freezes before the impact
model's validation/test blocks. Impact regularization is selected on the next
20%, with the final 20% untouched until evaluation. Only afterward is the impact
model refitted to the season. Held-out goal and xG differential error are compared
with a situation-only baseline. Score/zone predictors are neutralized during
that evaluation; actual lineups and manpower remain known, so this is not a
pregame forecasting test. Shot Brier error and calibration bins are also saved.

The local review gate requires a complete download, matching official season
appearances/minutes and player identities, at least 95% verified games,
converged fits, at least 100 supported test games covering 95% of the eligible
test block, improvements in both held-out goal and xG errors, and a shot model
better than a constant-rate baseline with total test expected goals within 10%
of actual goals. These are explicit minimum review policies, not statistical
significance or production
approval. Short playoff seasons may fail the sample threshold by design.

The public game cache is hash-verified, and reports record canonical input,
prior, shot-file and per-game source hashes for deterministic offline replay.
Reconciliation separately identifies missing/extra appearances and per-game TOI
conflicts. Removing a confirmed false appearance repairs derived provider totals;
missing advanced events still require reconstruction. Neither NHL play-by-play
nor these models measure all passing, positioning, screening, leadership or
causal team value. Shootouts are excluded from the event model. Do not call the
output WAR or a complete measure of hockey value.

#### 2024-25 local evaluation, September 30, 2026

The completed regular-season run covers all 1,312 games and reconciles official
season appearances and minutes for all 1,023 players. The report fallback
recovers 57 games missing from the shift API; 1,277 games pass reconstruction
checks. The other 35 remain quarantined. There are 682 qualified ratings,
211 provisional estimates and 130 incomplete player seasons. Forty-one penalty
events remain unpriced rather than receiving guessed values.

The untouched test block contains 265 games beginning March 13, 2025:

| Test measure | Adjusted model | Situation-only baseline |
| --- | ---: | ---: |
| Expected-goal differential MSE | 1.3727 | 1.6274 |
| Actual-goal differential MSE | 7.0529 | 7.3125 |
| Non-shootout decision accuracy, 243 games | 67.9% | 69.5% |

Differential errors improve by 15.6% and 3.5%; winner classification does not
improve. These comparisons condition on observed deployment. The NHL shot model
has test Brier error 0.0610 versus 0.0669 for a constant, with 1,649 expected goals
versus 1,685 actual goals across 23,356 shots. All fitted models converge and the
minimum local review gate passes. This is one season's evidence, not a claim of
universal superiority or comprehensive individual causality.
An offline replay using the saved models reconstructs all 1,312 games and
reproduces all 1,023 player outputs and source hashes exactly. That check does
not refit the models.

The separate historical reconciliation examines 177 flagged player seasons.
Official boxscores confirm 116 false provider appearance records, removed from
derived totals. A second official report resolves five omitted zero-time clocks.
There are still 215 missing player-game records and 99 TOI conflicts queued for
advanced reconstruction; one provider file, David Ayres in 2019-20, is unavailable.
Appearance repair does not mean those historical expected-goal values have been
recovered. The available 176 ledgers replay identically offline.

Local evidence is under `.local-data/nhl-rating/value-v3-2024-final-20260930/`
and `.local-data/nhl-rating/v3-game-reconciliation-final.json`. Credit NHL public
data and **MoneyPuck.com**: the latter supplies the historical v2 shrinkage
calibration used by the ability estimate. Production remains on v1; a complete
historical v3 rebuild and broader season validation have not been performed.

#### Subsequent correctness and source review

The next audit passes correct overtime penalty deployment and remaining time,
missing manpower, pulled-goalie normalization, same-whistle double counting,
reciprocal penalty attribution, sequential assessments and tied bootstrap ranks.
These are rules/data corrections, not weights chosen to make familiar players
rank higher. Overtime treatment follows [NHL Rule 84](https://media.nhl.com/site/asset/public/ext/2023-24/2023-24Rulebook.pdf).
The collector obtained alternate official reports for all 35 quarantined games;
20 pass the unchanged reconstruction gates using those reports. Verified games
increase to 1,297 of 1,312. The other 15 remain excluded.
Qualified player seasons increase from 682 to 783, provisional estimates from
211 to 222, and incomplete seasons fall from 130 to 18. All 1,023 canonical
player-season appearances and minutes still reconcile.

The repaired evaluation block contains 272 games (249 non-shootout decisions).
Adjusted xG differential MSE is 1.3651 versus 1.5988 for the situation baseline;
goal differential MSE is 6.9411 versus 7.1742. These are 14.6% and 3.2% reductions.
Decision accuracy remains lower, 67.9% versus 70.3%. The block now includes seven
more verified games, so its aggregate errors are not a paired comparison against
the previous 265-game result. The local review gates pass and the selected ridge
penalty remains 4. Updated artifacts are under
`.local-data/nhl-rating/value-v3-2024-reviewed-20260930/`; the final penalty/rank
pass reuses the repaired fitted models and checks every selected game-source hash.
The final offline pass verifies those hashes and season exposure, then reproduces
all 1,023 current player outputs identically on repeated calculation. Forty
penalty events remain explicitly unpriced, including sequential assessments that
the previous implementation could mistake for concurrent manpower losses.
Verification passed 26 focused NHL tests, the 25 shared ranking-engine checks,
scoped TypeScript checks, formatting and `git diff --check`. No full application
build or frontend architecture check was run; this change does not touch the
frontend. Production and historical v3 recomputation remain unchanged.

The remaining failures include penalty-shot attribution and conflicts between
official event and shift records. A score-summary cross-check on game 2024020181
agrees with the event's strength and does not independently resolve its shift
conflict. Do not resolve these by relaxing TOI/goal checks or selecting the source
that produces a preferred ranking. A dedicated penalty-shot model and complete
penalty-clock counterfactual remain research work. Public event data still do not
measure all passing, off-puck positioning, screening or leadership.

Further statistical changes require evidence beyond this already inspected
season: fresh season validation, calibration of the ability estimate and model
uncertainty. Reusing the existing date partitions checks regressions after
correctness repairs; it is not new independent evidence of superiority. The audit
stops at this boundary rather than asserting that no future improvement is possible.

#### Inclusive games and penalty shots

The subsequent inclusive revision replaces the whole-game exclusions described
in the historical snapshots above. In 2024-25 all 1,312 games contribute usable
components; 1,302 meet full-game model-fitting checks. The remaining games retain
verified individual shots and unaffected lineup intervals, with explicit coverage.
No minimum coverage threshold is waived to label uncertain components complete.

The penalty-shot baseline uses 59 goals in 208 prior-season attempts from 2019-20
through 2023-24, giving a smoothed scoring probability of 0.284689. The current
season includes `failed-shot-attempt` events as unsuccessful attempts, not shots
on goal. Those events are absent from ordinary xG training and consume no modeled
ice time. Shooter, goalie, offender and award-recipient attribution stays separate;
an unidentified award recipient leaves that expected chance unassigned.

The new output distinguishes a missing season from a partial estimate. A player
whose official season is covered receives the sum of usable components even if
one interval is unresolved; insufficient component coverage prevents a qualified
rank and is shown as provisional. Low playing time also remains provisional.
The subsequent production rollout adds this revision as a separate v3 record for
each player-season; it preserves v1 and the GSHL stat-line ratings. Historical
seasons must complete reconstruction and verification before they are published.

The final 2024-25 recalculation produces 793 qualified and 230 provisional player
seasons, with no incomplete season values, recovering the 18 previously incomplete
players. All 32 penalty-shot attempts and seven goals match the official NHL
season report for every shooter; one award recipient remains unidentified. The
audit preserves 789 seconds without trusted process attribution across the season
instead of inventing lineup value. Individual shot attribution is complete.
The final refit reproduces the ordinary shot and impact models and selected source
hashes from the preceding inclusive run. The local verification artifact is
`.local-data/nhl-rating/value-v3-2024-inclusive-final-20260930/verification.json`.
Validation passed 33 focused NHL tests, 25 shared ranking tests, scoped strict
TypeScript checking and formatting checks. No application build was run.

### Season-level v2 and frozen v1

The season-level local model is `scripts/src/runtime/nhl-season-value-v2.ts`.
Use the v2 preview command in `scripts/README.md` for NHL plus MoneyPuck expected-goal
inputs, explicit penalty counts, situational contributions, historical shrinkage
calibration, and source coverage checks. See the
[v2 methodology and historical evaluation](product/nhl-season-value-v2.md).
V2 is a conservative contribution estimate above average, not GAR/WAR or isolated
causal impact. It exports both observed and shrunk values, a literal per-60 rate,
positional percentiles, and context sensitivity. Its units and report contract
differ from v1; the v1 publisher deliberately cannot import it. Production still
holds v1 until a separately authorized migration.

The following describes the frozen v1 baseline:

`scripts/src/runtime/nhl-season-rating.ts` owns a separate, pure NHL model and
its versioned configuration. It accepts full NHL season populations identified
by NHL player id, with regular season and playoffs evaluated independently.
It has no GSHL category, roster, salary, draft, or power dependencies. The operator
preview saves local results only. The separate publisher persists verified results
in `nhlSeasonValues`, linked to the database season and, where available, the
canonical player via NHL ID. It preserves the existing GSHL fields. Each record
retains the model version, core/EDGE profile, source timestamp and snapshot hash.
See `scripts/README.md` for the command.

Version `nhl-season-value-v1` is a transparent statistical index with provisional
policy weights, not a fitted GAR/WAR model or a claim of causal player impact.
The [13-season quality audit](product/nhl-season-value-quality-audit.md) found
material shortcomings in defensive attribution, special-team influence, goalie
shot-quality adjustment and the workload reference. Reproducibility and import
verification do not establish validity as holistic player value. Treat stored
v1 results as a descriptive baseline pending a validated successor.
Compare forwards, defensemen and goalies within their own pools; equal displayed
percentiles across positions do not establish equal hockey value.

Core skater inputs and weights:

| Component                   | Forwards | Defense | Measurement                                                                |
| --------------------------- | -------: | ------: | -------------------------------------------------------------------------- |
| 5-on-5 scoring              |      40% |     25% | `(goals + 0.8 × primary assists + 0.3 × secondary assists) / minutes × 60` |
| 5-on-5 territory            |      35% |     45% | On-ice minus off-ice shot-attempt share                                    |
| Even-strength defense proxy |      10% |     20% | Negative on-ice goals against per 60                                       |
| Discipline                  |      15% |     10% | Net minor penalties drawn per 60                                           |

Power-play scoring uses the same goal/assist formula. Penalty killing uses
negative on-ice goals against per 60. Each special-team component has a 0.2
coefficient and accumulates through its actual deployment minutes; players do
not earn a bonus merely for being assigned a role. Scoring, territory, and the
defense proxy accumulate through 5-on-5 minutes; discipline uses total minutes.

Each metric is standardized against qualified players at the same position,
capped at ±3 standard deviations, and shrunk toward average by
`exposure / (exposure + prior)`. Priors are 300 minutes for ordinary skater
components, 100 minutes for special teams, and 600 shots for goalies. Core
goalie performance is save percentage; wins and goal support are not inputs.

Component value is `weight × adjustedZ × componentMinutes / 1000`.
Season Value is the sum plus `0.5 × totalMinutes / 1000`. That offset defines an
explicit below-average reference, not a measured replacement-player baseline.
Below-reference performance can produce negative season value. Impact per 60
is a 0–100 display index: `50 + 15 × componentValueSum / (totalMinutes / 1000)`,
clamped to the display range. It measures effectiveness per minute, not literal
goals per 60. Season Rating is the within-position percentile of Season Value;
ties share a midpoint percentile and competition rank.

Qualified players have at least 200 minutes (skaters) or 300 minutes (goalies).
Metric baselines require at least five qualified peers, plus 30 deployment
minutes for special teams or 300 shots for goalie metrics. Smaller player samples
get provisional estimates without official ranks or percentiles. Insufficient
peer pools or missing required data produce incomplete results with named
missing components. Zero special-team deployment contributes zero; it is not
treated as missing. Rates with no league variance contribute zero standardized
impact. Players with zero games or minutes are excluded.

The optional `edge` profile reserves 10% of skater base weights for high-danger
shots per 60, reducing the other base weights proportionally. Goalies use saves
above the season's pooled save-rate baseline for each shot-location group,
divided by shots faced. High, mid, long, and remaining locations partition the
shots without double counting. This is coarse location adjustment, not xG or
goals saved above expected. Profile and source timestamp accompany every report;
missing tracking data never silently falls back to core.

NHL Stats reports supply seconds, which the adapter converts to minutes. Reports
are joined by NHL id; traded-player season totals stay one row. Input snapshots
and the full configuration allow deterministic offline replay. API requests are
season/game-type bounded, paginated, throttled and retried; malformed pages,
duplicate identities and mixed seasons fail rather than generate partial ranks.

Limitations: even-strength defense is not strictly 5-on-5; team system, deployment,
teammates and goaltending still influence on-ice results. Relative shot share is
not a full teammate/opponent adjustment. The model uses neither age nor previous
seasons, and makes no claim to measure leadership or off-puck skill completely.
EDGE has shorter historical coverage. Before promotion beyond preview, evaluate
multiple seasons, missingness, weight sensitivity and stability; do not calibrate
weights solely to make a familiar leaderboard.

## Draft expectations and Calder

Draft slot expectations use the historical regular-season quality curve in
`RankingEngine/config.js` (`draftSlot`). The browser calibration JSON is generated
by `node tools/sync-draft-slot.mjs`; `--check` verifies it without writing.
Browser/runtime parity is exercised by the draft-slot-curve tests.

Expected rating is `41.73092969231692 + 45.19453675621042 × remaining slot share`,
where remaining slot share is `(last non-signing slot - slot + 1) / last non-signing slot`.
It is a fixed retrospective benchmark fitted to eight recorded drafts, rather
than a scale stretched between each season's strongest and weakest selections.
See [the research](product/draft-slot-quality-curve.md) for coverage and validation.

Calder's over-slot component uses the same actual regular-season total rating
minus slot expectation as the draft page. The existing percentile combination
and weights remain: over-slot value 31.5%, NHL value 24.5%, GSHL total 14%, and
team production 30%, followed by the existing first-eight/later-picks weighting.
Signings and selections missing regular-season ratings do not receive draft grades.
Recalculating Calder scores/ranks does not rewrite recorded award recipients.
When award reassignment is requested, the focused
`scripts/src/commands/awards/reconcile-calder-winners.ts` operator reconciles
Calder winners and nominees to those rankings and verifies all award records.

## Entering-week power

`TeamWeekStatLine.powerRating` and `powerRk` describe a team entering the week.
Week N results may affect Week N+1 but must never rewrite Week N's snapshot.
Only active and completed weeks receive power rows.

Before opening week, the power views compute a separate preseason projection
from current season team assignments. This preview does not create a fictional
week or write derived rows. Historical replay uses opening-day roster snapshots,
falling back to completed draft selections; it never uses today's player team
assignments to reconstruct an old season.

The pure preseason model lives in `scripts/src/runtime/preseason-projection.ts`.
It projects category rates from the preceding three NHL seasons, regresses small
samples toward position-group rates, and models availability and eligible daily
lineups using the target season's roster slots. Goalie ratios use total shots
and minutes; goalie category strength includes the risk of missing the weekly
appearance minimum. Unproven players receive conservative position priors rather
than disappearing from the roster average. Only the selected season's configured
categories count, including plus/minus when configured.

Entering Weeks 1–4, the composite blends the fixed opening projection with the
standard in-season composite at 100%, 75%, 50%, and 25% preseason weight. After
four completed weeks with team evidence, this explicit preseason weight is zero.
Empty weeks do not consume confidence. The existing rolling player talent
and seeded Elo still carry historical information. The four-week transition is a
transparent policy choice, not a fitted optimal decay. The projection's score uses
the same `50 + 25 × standardized composite` display scale as weekly power.

See [the preseason evaluation](product/preseason-power-projections.md) for
historical comparison, current coverage, assumptions, and limitations.

The preseason standings prior now blends roster strength and a shrunk owner
regular-season record. Owner history covers the prior four seasons and follows
the person across franchises. See [objectives and evaluation](product/power-ranking-objectives.md)
for the formula, retrospective evidence, ownership-data limits, and the decision
to retain the existing midseason weights.

The standard in-season composite is:

| Signal                                         | Weight |
| ---------------------------------------------- | -----: |
| Recent-form EWMA through the previous week     |    55% |
| Matchup Elo through the previous week          |    20% |
| Rolling roster talent at the start of the week |    15% |
| GM career ladder at the start of the week      |    10% |

`gmLadderRating` stores the absolute ladder snapshot;
`powerGmScore` stores its league-standardized contribution.

Recent form uses alpha 0.5; the latest completed week is not counted a second
time. Explicitly forfeited goalie categories remain losses in category strength
rather than disappearing from its average. Missing fields alone do not imply
forfeiture. See [refinement evidence](product/power-ranking-refinement.md) for
chronological validation, rejected alternatives and limitations.

## Change checklist

Before changing behavior, account for every affected sheet, position, season
type, comparison pool, and small-sample path. Report expected score/rank movement
and affected cohorts. Keep tuning within the responsible profile and preserve
the entering-week invariant. Run sync/check after focused tests and parity.
