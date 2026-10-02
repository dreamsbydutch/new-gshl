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

Supporting API data is fetched for calculation. Rebuild and rollout commands use
a temporary shared source workspace by default, removed on completion or reported
failure. A reusable source cache requires an explicit `--cache` path. Existing
snapshots are preserved. Production retains the rating and calculated breakdown,
with version/provenance and coverage diagnostics, rather than raw API responses.
New local game audits retain compact publication evidence: game identity, coverage,
issues and minimal penalty-shot identities/results. They omit source player-stat
arrays, reconstructed lineups and full event payloads. This retention policy does
not change score calculations or qualification rules.

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

The separate `nhl-performance-v3-preview` calculation in
`scripts/src/runtime/nhl-performance-rating.ts` explores a performance-led
ordering without replacing published v3 values or ranks. Its operator entry
point is `preview-nhl-performance.ts`. It consumes saved calculated ratings,
not underlying API metrics. Performance per game is `abilityPer60 * minutes /
(60 * games)`, preserving actual workload and existing component shrinkage.
Within each F/D/G pool, the median and median absolute deviation establish a
robust rate scale; an arctangent maps that scale to a bounded score around 50.
This preserves rate differences that a rank-only percentile would compress.

Sample weight follows `3x² - 2x³`, where x is the smaller of games-based and
minutes-based exposure relative to the full-sample target, capped at one.
Targets are 65 equivalent games for skaters and 45 for goalies, with reference
minutes per game of 15 F / 18 D / 50 G. Exposure scales to actual team season
length relative to 82 games; unequal team schedules require individual lengths.
Both the bounded performance score and actual accumulated `seasonValue`
(independently normalized with its position median/MAD and bounded transform)
receive this sample moderation. A separate smooth curve controls their blend:
for skaters, performance receives 20% through 55 equivalent games, rising to 90%
at 68 games; accumulated contribution receives the remainder. Between those
endpoints use `t = clamp((effectiveGames - 55) / 13, 0, 1)` and
`performanceWeight = 0.20 + 0.70 * (3t² - 2t³)`. Effective games are limited by
the same workload evidence as sample weight. Goalies use a separate 35-to-45
equivalent-game transition. There is no additional attendance bonus: the
accumulated contribution component rewards positive volume and penalizes
negative contribution. Availability remains a diagnostic column only.
These are explicit preview policy choices, not fitted reliability probabilities.
At sufficient ice time, skater sample weight is 93.63% at 55 games, 98.32% at 60,
and 100% from 65 onward. This reliability adjustment is separate from the
overall-to-performance blend, which finishes transitioning at 68. A ten-game
skater cannot exceed 55 even with extreme
rate and volume scores. Provisional and
incomplete inputs receive no official performance rating/rank. Production
adoption requires separate review; this preview is not a new validated model.

The published v3 outputs have distinct interpretations:

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

The review gate requires a complete download, matching official season
appearances/minutes and player identities, at least 98% verified process ice time
and 98% verified individual shot attempts,
converged fits, at least 100 supported test games covering 95% of the eligible
test block, improvements in both held-out goal and xG errors, and a shot model
better than a constant-rate baseline with total test expected goals within 10%
of actual goals. These are explicit minimum review policies, not statistical
significance or production
approval. Short playoff seasons may fail the sample threshold by design.
The `verified-components-v1` admission policy measures retained evidence rather
than counting every partially verified game as entirely missing. Full-game
verification remains required for fitting and held-out evaluation, and player
coverage/qualification rules remain unchanged. Frozen reports using the earlier
95%-of-games gate retain their original evidence and values. The publisher
recomputes component coverage from each new report's game audit.

An explicitly reviewed single-season publication can retain calculated values
as provisional when process coverage is at least 95% and individual shot
coverage is at least 98%, but process coverage or held-out impact improvement
fails the normal admission policy. Complete downloads, official exposure and
identity reconciliation, provenance, convergence, shot-model validation and
held-out sample requirements still apply. The publisher records the review
reason, failed checks and coverage in every player's warnings and includes the
review in the source hash. Every result is provisional; official season ranks,
ability ranks, percentiles and sampling rank intervals are withheld. Original
calculation artifacts and failed gate results remain unchanged. This path does
not represent a passed season validation or change normal publication defaults.

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

Historical NHL event feeds can omit `homeTeamDefendingSide`. The source adapter
recovers rink direction from official team-relative offensive/defensive zones
and coordinates separately for each period, requiring at least three observations
and 90% agreement for period-wide orientation. Without that consensus, only
unambiguous offensive/defensive-zone coordinates are usable; neutral-zone
direction is not guessed. Explicit NHL defending-side fields take precedence.
Reports record the number of shot inputs using each orientation source. A full
2024-25 comparison found all 112,207 shot-model inputs unchanged across all 1,312
games, so this historical compatibility repair preserves the published inputs.
The collector also compares penalty-shot classifications against official
per-game totals. When API flags are missing, an explicit NHL play-by-play report
label must match a unique existing event by period, clock, shot result and
verified roster identity. Supplements retain both source hashes and never add
a second shot. Confirmed GP=1 rows with zero ice time remain appearances;
unplayed backup goalies in ordinary boxscores do not become appearances.
Penalty-shot classification requires an explicit award or a verified official
report label. A manpower code alone is insufficient: some ordinary shots at the
end of overtime carry `1010`. Those events remain ordinary shots, with the same
lineup/individual verification rules as other events. Per-game and season-level
penalty-shot totals still must reconcile before publication.
An explicitly zero-duration shift row with a blank end clock contributes no ice
time. Missing clocks on positive or unknown durations still fail parsing;
official player exposure and game coverage checks remain mandatory.
Individual time-on-ice reconciliation uses the union of each player's observed
shift clocks, before excluding impossible combined lineups. Otherwise, removing
one bad lineup interval can falsely make a goalie's otherwise correct game-long
shift disagree with official minutes and discard sound intervals elsewhere.
Impossible lineups and genuine individual clock conflicts remain excluded;
coverage and predictive admission thresholds are unchanged.

Historical official TOI reports can reset or misprint the elapsed end clock at
the period horn. The adapter repairs that endpoint only when the start clock,
duration and both remaining-clock fields agree exactly. It also recovers an
omitted full-period goalie interval when the official period TOI and strength
totals each account for every second. An omitted final skater shift requires
one explicit open API shift, no overlap with the reported shifts, and an exact
reconciliation to the official period and strength totals. A corrupt interval
elsewhere in the report does not discard an independently verified full-period
goalie total: that fallback retains the API shifts and adds only entirely
absent goalie periods. Ambiguous gaps stay excluded. Derived report caches are
versioned and keyed by the API shift input
hash so these repairs cannot silently reuse an older projection.

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

## Offensive and defensive NHL value

The game-level NHL model credits an estimated goal prevented equally to an
estimated goal created. Each player's process contribution is
`(offensive xG/60 - defensive xGA/60) * verified minutes / 60`, calculated
separately for even strength, power plays, penalty killing, and empty-net play.
Both player coefficient families use the same ridge penalty. Positive defensive
value means fewer expected goals conceded. This applies to forwards as well as
defensemen; position is not a proxy for playing style.

New calculations retain `offensiveProcess` and `defensiveProcess` alongside
`adjustedProcess`. The two signed components must reconcile with the aggregate
within four-decimal rounding. Historical records may omit both. Finishing,
penalties and goalie saving remain separate; defensive skaters do not receive
credit for their goalie's saves. There is no extra multiplier for hits, blocks,
defensive reputation, or a low offensive score. Position-relative display ranks
are not interchangeable with absolute goal contributions.

The local `audit-nhl-defense.ts` command reconstructs these components from saved
fitted coefficients and each player's strength-state exposure. It exports CSV
and JSON without API or database access. The October 2026 review reconciled
11,885 skater-seasons across all 13 saved seasons. This is a mathematical audit,
not proof that the model has captured every defensive skill.

Held-out impact evaluation now also reports mean squared error for each team's
xG and goals, averaged over both teams. Differential errors alone can hide equal
errors on both sides. Fixed-model ablations remove offensive or defensive player
coefficients independently, showing whether each family helps prediction. These
diagnostics do not change parameter selection or publication gates. They are
conditional on observed deployment, not causal experiments or prospective game
forecasts. Check them before adopting a recalibration.

The 2024-25 review reconstructed cached official games with the saved, frozen
shot model, retained the previously selected ridge penalty of 4, fit 1,029
verified games before March 13, and evaluated 273 later games. Mean team xG
squared error was 0.66730 with the full model, 0.69447 without defensive player
effects, and 0.76681 without offensive effects. Removing defense increased
error; retaining it reduced error by 3.9% against that ablation. Mean team goal
squared error improved from 3.34265 to 3.31387 (0.9%). These are descriptive
results for one season, without a significance claim. They support retaining
defensive impact, not inflating it until its distribution matches offense.
The full model's winner accuracy was 68%, versus 70% for the situation-only
baseline; improvements in squared error did not improve every diagnostic.
The refreshed reconstruction is not a byte-for-byte replay of the older report.

Unit fixtures verify matched offensive and defensive signals receive equal
fitted credit and equal season/ability value. Remaining measurement limitations
include correlated teammates, incomplete off-puck tracking, and deployment
context such as penalty-expiry carryover. Equal goal units do not imply equal
estimation uncertainty or equal score distributions. The existing 55-to-68-game
performance blend is unchanged. Breakdown/schema changes require deployment
before publishing new reports; this review does not modify production scores.

## Category-based fantasy forecast experiment

`scripts/src/runtime/fantasy-category-forecast.ts` is an isolated, pure prototype;
it does not feed the production ranking engine or salary curve. Separate F/D/G
models forecast each of the next three seasons. Ridge models estimate games
played and exposure-weighted production per appearance, then combine them into
category totals. Features use up to four calendar years of category rates,
workload, power-play minutes, history coverage and target-year age. Standardized
features and coefficients use training rows only; ridge regularization is fixed
at 0.02 on mean weighted loss. No tuning selects weights from test outcomes.

Points are derived from goals plus assists. Goalie GAA uses goals against/minutes;
save percentage uses independently recorded saves/shots. Official GA need not
equal shots minus saves. Term rates pool denominators. Forecasts
enforce nonnegative totals, games no greater than 82, goals no greater than shots,
PPP no greater than points, wins no greater than appearances and saves no greater
than shots faced. The appearance/rate decomposition is an approximation, not a
joint distribution over health, role and production.

At each historical origin, train only on targets already complete, requiring
three distinct target seasons and at least 100 training examples. Compare with
last-season categories and a four-year recency-weighted category baseline
(1, 0.78, 0.59, 0.43); these are not the exact production overall-rating formula.
Every player who appeared at origin is retained. Absence from a verified complete
future NHL population becomes zero production, including retirement; it is not
silently dropped. Incoming prospects without NHL history are outside this model.

Normalize counting totals to 82-game team schedules using the independently
verified historical team-exposure audit, weighting traded players' schedules by
appearances. Exclude 2019-20 and 2020-21 target seasons from primary fitting and
evaluation, while permitting their normalized historical inputs once completed.
Evaluate individual horizons and average annual production over complete two/
three-year terms. No-appearance goalie outcomes count for wins/GP; GAA/SVP are
undefined and excluded from rate errors. Each metric uses an identical paired
cohort across methods; undefined predictions/outcomes are excluded jointly and
counted explicitly. Workload errors still include these players. Publish all-player and established-player
results (40 skater or 15 goalie equivalent appearances at origin), by category,
position, horizon and origin fold, with RMSE, MAE, bias and correlations.

Sources are retrospective corrected snapshots, not archives captured at signing.
Birthdate is the only feature taken from the newly fetched aggregate bios report;
future aggregate statistics/current teams never enter features. NHL API result
ceilings require split season ranges, with exact identity/GP/population checks.
Temporary fresh API inputs are removed after preparation; existing snapshots are
preserved and production receives no source metrics or predictions.

This experiment does not yet add NHL impact-model components, explicit injury or
future roster information, calibrated uncertainty, weekly matchup simulation,
replacement value or a scalar salary rating. Overlapping contracts and repeated
players make observations dependent. Chronological testing measures incremental
category accuracy, not independent significance or validated salary improvements.

The October 2026 run verified 13,159 player-seasons, evaluated 17,550 player/
origin/horizon forecasts and 7,406 complete player/origin/term windows (each with
three methods), and generated 3,114 projections for 1,038 players over 2026-27,
2027-28 and 2028-29. Complete-term tests cover four signing origins (2020 through
2023) for two-year terms and three origins (2020 through 2022) for three-year
terms; the longer history supplies training, not thirteen independent test years.

For established players, reductions in RMSE versus weighted category history are:

| Category | Two-year annual average | Three-year annual average |
| --- | ---: | ---: |
| Forward points | 16.1% | 17.6% |
| Defense points | 14.6% | 17.3% |
| Forward shots | 17.8% | 19.9% |
| Defense shots | 20.8% | 25.6% |
| Goalie wins | 18.8% | 23.9% |
| Goalie GAA | 4.2% | 5.8% |
| Goalie save percentage | **-2.6%** | **-2.7%** |

All seven skater categories improve in aggregate for both terms, with improvements
in every origin/category combination except one two-year defense hits fold.
Goalie save percentage worsens in all four two-year folds and two of three
three-year folds. Do not promote the whole goalie model on wins improvement.
That initial experiment did not compare the production talent formula or NHL
impact features; the subsequent comparison below addresses those questions.

### Contract-rating comparison and chronological calibration

The second experiment replays the current `PlayerNHL` RankingEngine on original
official season totals, then calls the unchanged production talent-history and
age-adjustment functions. Those three pure functions are now exported from
`player-rating-backfill.ts`; their bodies and production behavior are unchanged.
These are formula replays, not historical database salary quotes. Compare the
result with the average of future NHL fantasy season ratings over the contract;
NHL departures receive zero future value. This target measures available fantasy
production, not actual owner lineups or matchup category wins.

Three predefined variants were evaluated: the original category forecast, direct
future skater totals/direct goalie rate fitting, and that direct model with NHL
offense, defense, finishing, saving, penalty and shrunk ability inputs. The direct
skater model generally worsened category accuracy and ranking; the tested NHL
enrichment recovered some accuracy but did not beat the original category model.
They remain experimental options, not production changes. This does not rule out
other ways of incorporating NHL information. Goalie starts in projected engine
scores hold the origin's starts/appearance ratio constant.

`contract-rating-calibration.ts` corrects score levels using only forecasts whose
target season is complete by the prediction origin. It fits position/horizon/
method-specific positive linear corrections, requiring 100 observations and two
prior origin years. A fixed 50-observation identity prior limits early changes;
without enough history the original score is used. All baselines receive the
same calibration opportunity. No future outcome can change an earlier correction.
Two- and three-year candidate ratings equally average all calibrated annual
forecasts, requiring all three years to produce both term options.

Established-player contract-average rating RMSE:

| Position / term | Current talent formula | Calibrated current formula | Calibrated category forecast |
| --- | ---: | ---: | ---: |
| F / 2 years | 18.48 | 18.00 | 16.10 |
| F / 3 years | 19.47 | 18.85 | 16.83 |
| D / 2 years | 17.54 | 16.88 | 15.22 |
| D / 3 years | 18.47 | 17.71 | 15.46 |
| G / 2 years | 22.06 | 20.75 | 20.31 |
| G / 3 years | 21.77 | 20.50 | 19.34 |

Against the equally calibrated current formula, the candidate improves RMSE by
10.5–10.7% F, 9.8–12.7% D and 2.1–5.7% G. It improves every tested skater
contract-origin fold, two of four two-year goalie folds and all three three-year
goalie folds. Three-year rank correlations versus the uncalibrated current talent
formula are 0.712→0.775 F, 0.754→0.809 D and 0.420→0.570 G. Calibration itself
slightly reduces pooled rank correlations versus the uncalibrated category model
while improving score errors; do not describe it as improving every metric.

The local preview covers 1,038 current players, with annual estimates for 2026-27
through 2028-29, two/three-year scores and separate position ranks. It does not
set a new salary curve or establish cross-position replacement value. Retrospective
corrected sources, forecast/actual cohort differences, prior examination of the
test seasons, overlapping contracts and modest goalie samples limit the claims.
These are research candidates, not production salary replacements or untouched
prospective validation. No database source metrics, salaries or ratings are written.

### Isolated NHL inputs and goalie save-rate follow-up

A follow-up held the stronger appearance-times-rate model fixed and tested NHL
impact inputs and historical goalie save percentage separately and together.
It reused the same 13,159 player-seasons, chronological cutoffs, zero-value
departures and equally calibrated baselines. The original candidate reproduced
exactly. These seasons have already informed research; this is additional
development evidence, not an untouched test or proof of a globally optimal model.

Established-player contract-average rating RMSE versus the preceding calibrated
category candidate (lower is better):

| Position / term | Previous candidate | Follow-up candidate | Error reduction | Better origin folds |
| --- | ---: | ---: | ---: | ---: |
| F / 2 years | 16.10 | 15.93 | 1.1% | 4/4 |
| F / 3 years | 16.83 | 16.55 | 1.7% | 3/3 |
| D / 2 years | 15.22 | 14.93 | 1.9% | 3/4 |
| D / 3 years | 15.46 | 15.06 | 2.6% | 2/3 |
| G / 2 years | 20.31 | 19.61 | 3.5% | 4/4 |
| G / 3 years | 19.34 | 18.53 | 4.2% | 3/3 |

Skater rows use `rate-impact+calibrated`; goalie rows use
`historical-save-rate+calibrated`. These are position-specific recommendations
from separate tested variants, not a new deployed combined salary formula.
Three-year rank correlations also improve: F 0.775 to 0.782, D 0.809 to 0.823,
G 0.570 to 0.587. Defenseman point forecasts improve 1.0–1.6%, blocks about 2.7%,
and hits about 1.5%. Thus NHL impact is useful as an input to fantasy-category
forecasts; this does not award salary points directly for non-fantasy defense.

The goalie variant replaces predicted SV/SA with four-calendar-season recency-
and shot-weighted history, retaining learned GP, wins, minutes, shots and goals
against. It improves save-percentage RMSE by 2.6–2.7% on the identical comparison
cohort. Goalie NHL impact inputs worsen both overall calibrated error and rank
correlation; combining them with historical save percentage is weaker than the
save-rate change alone. Keep their workload model free of those added inputs.

The isolated experiment exports all alternatives, chronological training and
calibration audits, per-origin results, an interactive report and optional
method-specific player previews. Four two-year and three three-year origin
folds, especially the modest goalie sample, do not establish prospective
reliability. Replacement value, cross-position salary allocation, actual weekly
category wins and players without NHL history remain separate validation needs.
No production salary or rating changes are made by these research commands.

### Regular-season-end cutoff and workload calibration research

Signing salaries forecast the upcoming two or three seasons immediately after
the final NHL regular-season game. Inputs stop at that completed regular season:
no playoff results, later transactions, or realized future teammates/ice time.
Future age is known from birthdate; future usage is a forecast. Historical
calculation cutoffs include only target seasons completed by the origin. Existing
retrospectively corrected inputs are not archived signing-day API snapshots, so
these tests do not establish exact publication-time data availability. A live
publication workflow still needs final-game completeness and a frozen version.

Further offline experiments compare the strongest position-specific candidate
with a monotone calibration curve, a chronological blend with current talent,
and separate calibration for origin-season workload groups. The existing groups
are 40 schedule-adjusted appearances for skaters and 15 for goalies; the lower
group includes injured veterans and late call-ups, not only rookies. Group fits
require 100 matured examples from two origin years; otherwise the whole-position
calibration is retained. Group choice never uses future appearances.

The useful signal is in lower-workload forwards: two-year rating RMSE falls
12.04 to 11.57 (870 observations), and three-year RMSE 12.55 to 12.08 (667).
Mean overprediction falls from 1.72 to 0.21 rating points over two years and from
1.62 to 0.53 over three years. Across all forwards, rating error improves about
1%, with rank correlation improving from 0.773 to 0.781 over two years and
0.761 to 0.768 over three. Established-forward score changes are small.

This is a candidate for improving limited-workload forward pricing, not a
universal workload penalty. Defensemen show no consistent error improvement;
goalie results are mixed and the split increases underprediction in the smaller
workload group. Hard group boundaries and injured-veteran versus newcomer
differences need validation before adoption. The curved correction generally
worsens rating error. Blending current talent slightly reduces error but weakens
forward/goalie rank correlation, so it is not selected as a general replacement.
These experiments do not change the recommended production formula or prices.

### Development and usage feature experiment

The next experiment tests two fixed feature additions against the position-specific
best: reliability-weighted changes from the preceding season, then interactions
between category rates, origin workload and age. Trend reliability uses
GP/(GP+20) from both observed seasons and is zero without a preceding season.
Age interactions distinguish under-25 and over-30 target-season ages, known from
birthdate, rather than presuming any future roster or deployment. All forecasts
retain chronological fitting and the regular-season-end information boundary.

Simple trend features do not reliably improve the final rating. Age/usage
interactions help lower-workload forwards substantially after applying the same
workload calibration to both alternatives:

| Contract | Lower-workload F observations | Previous best RMSE | Age/usage RMSE | Reduction |
| --- | ---: | ---: | ---: | ---: |
| 2 years | 870 | 11.57 | 10.90 | 5.8% |
| 3 years | 667 | 12.08 | 11.08 | 8.3% |

The lower-workload group is fewer than 40 schedule-adjusted origin-season games.
The improvement holds in all four two-year and all three three-year starting
seasons. Mean bias moves from +0.21 to -0.30 over two years and +0.53 to -0.16
over three. However, established-forward RMSE worsens about 0.7%; adding these
features universally is not recommended. The targeted recommendation is a
post-evaluation subgroup finding, not an independently validated model-selection
rule. It still mixes injured veterans, newcomers and marginal NHL players.

Defenseman improvements are small/mixed: established three-year RMSE improves
0.4%, but the complete two-year defenseman pool worsens 0.3%. Goalie rating RMSE
worsens about 2–3%. Preserve the preceding goalie model. The reports retain all
alternatives, with and without forward workload calibration; the unchanged raw
baseline reproduces the earlier experiment exactly. Historical reconstruction,
repeated players and previously examined seasons limit prospective claims.
No production formula or salary publication changes are made.

### Positional salary value and historical matchup validation

The positional research layer uses modeled **matchup wins above a replacement
at the same position**, instead of comparing independently calibrated F/D/G
rating scales directly. It is experimental and does not feed salary publication.
No fixed positional salary allocation has passed the validation in this study.

The October 1, 2026 audit read 73,951 retained player-week rows across twelve
seasons (2014–15 through 2025–26), reconciling 1,914 regular-season matchups.
2013–14 has NHL history but no retained GSHL weekly history. Seven completed
2025–26 matchups lack matching weekly data and are excluded from simulation
contexts; their recorded outcomes remain usable for prediction evaluation.
Team/player totals reconcile on the remaining data. Goalie totals blanked by
the appearance minimum are intentional forfeits, not missing NHL production:
the audit reconstructs their underlying saves, shots, goals and minutes from
player rows. The audit reports exclusions rather than silently filling them.

Current-format contexts use all ten scoring categories, pooled goalie ratios,
the two-active-appearance minimum and neutral half-credit for tied category
totals. Goals and assists also affect points. A deterministic rotating player
donor is removed from each historical lineup; candidate and replacement
projections are substituted into the same contexts. A Poisson appearance model
integrates qualification risk instead of treating two expected appearances as
guaranteed qualification. Historical opponent category combinations remain
intact. Within-game scoring/save variance and future lineup optimization are
not modeled, so estimated win gains are not causal estimates.

Replacement depth uses non-IR ownership exposure normalized to fifteen roster
spots (7F/3D/1G plus four bench spots; UTIL treated as F), with 9F/4D/2G and
8F/4D/3G alternatives. Baseline replacement is a band just beyond the owned
depth in each positional ranking. Salary premium shares are measured **above
the $1m floor**, not as shares of the keeper cap or total salary pool. The
prototype applies the existing rank-to-dollar curve and floors nonpositive
replacement value at $1m; that is an experimental pricing assumption.

| Latest forecast scenario      | F premium share | D premium share | G premium share |
| ----------------------------- | --------------: | --------------: | --------------: |
| Observed ownership depth      |           67.8% |           21.5% |           10.8% |
| Two-goalie roster benchmark   |           55.0% |           25.1% |           19.9% |
| Three-goalie roster benchmark |           51.5% |           29.5% |           19.0% |

These are sensitivity results, not recommended weights. Changing replacement
depth has a large effect on goalie prices. A separate exact three-position
Shapley decomposition equalizes each excluded position group between opponents
and averages marginal outcome changes across all six position orderings.
Across 769 decisive current-rule matchups in 2021–22 through 2025–26, that
descriptive decomposition attributes 44.6% to F, 26.5% to D and 28.8% to G.
It measures realized results under a specified counterfactual, not predictable
contract value. Older seasons are re-scored under today's rules for sensitivity;
their original category and roster formats must not be treated as equivalent.

Historical prediction tests freeze individual inputs to preceding NHL seasons
and fit probability calibration only on earlier GSHL seasons. Evaluation uses
either opening draft rosters or the preceding week's largest non-IR ownership
exposures, capped at fifteen players. The latter is a proxy for known roster
membership, not exact end-of-week ownership. Neither enters the individual
season-end forecast as a future feature. Unknown prospects have zero excess
value in both candidate and raw-rating baseline. Historical NHL totals and
ratings are retrospective reconstructions, not archived signing-day quotes.

Later evaluation covers 485 matchups from 2023–24 through 2025–26. With opening
rosters, the existing rating's Brier error is 0.24913 versus 0.25539 for the
observed-depth simulation. With prior-week rosters, these are 0.25004 and
0.24889 respectively; winner accuracy falls from 56.9% to 56.3%. The modest
probability improvement reverses in 2024–25. Positive, regularized positional
scarcity weights also fail to improve the later evaluation (0.25258 Brier with
prior-week rosters). The home-only probability benchmark scores 0.24771, better
than both rating approaches on this later block. That further argues against
promoting the positional candidate from these results.

No candidate is promoted on this evidence. Three repeatedly examined later
seasons with dependent teams and weeks are not an untouched test set. Historical
validation uses the existing three-year category projection as a common input,
not a full replay of the latest development/usage forecasting candidate.
Latest salary scenarios use that newer candidate, so transferring validation
between them remains unproven. Two-/three-year contract-level matchup value,
schedule/lineup effects and uncertainty must be validated before publication.
Research outputs retain all scenarios, exclusions and failed alternatives.

## NHL rating and real contract salary comparison

The salary audit joins production v3 regular-season ratings to historical NHL
contract seasons by canonical player ID and season start year. It does not use
GSHL contracts or current player-profile salary as a historical fallback. Missing,
ambiguous, invalid and unlinked contracts remain explicit. Cap hit and cash salary
are separate; the comparison uses cap hit divided by the historical ceiling in
`nhl-salary-caps.ts`, not cash pay or retained team cap charges.

Compare accumulated season value and shrunk ability per 60 separately. The latter
is not the proposed performance/volume blend, which remains a separate preview.
Pay and rating percentiles use identical matched, rated player pools within each
season and position (F/D/G). A positive percentile difference indicates stronger
rating standing than salary standing; it is not a dollar surplus calculation.
Correlations/percentiles require 30 matches, at least 80% contract coverage among
qualified players and no recorded season-level limitations. That reporting guard
does not establish that the remaining missing contracts are unbiased.

Observed peer cap-hit ranges use the same season, position and exact recorded
signing status, within 10 rating-percentile points, excluding the target player.
At least 15 peers are required. Reverse comparisons use a 10-point pay-percentile
window to summarize peers' season values. Medians and interquartile ranges are
descriptive, not confidence intervals or fair-market salary estimates. Unknown
signing status gets no dollar benchmark. Entry-level status is not reliably
identified; all-player percentile gaps must not be interpreted as unrestricted
market bargains. Signing age and term are exposed but not adjusted. Existing
contracts reflect different signing dates and expectations; this is not an
out-of-sample prediction of a new contract.

The October 2026 snapshot matched 6,472 of 13,159 tracked player-seasons. Only ten
season/position cohorts passed the reporting guard: 2022-23 forwards and all
three positions in 2023-24 through 2025-26. In 2025-26, qualified-player contract
coverage was 96.9% F, 96.4% D and 95.9% G. Cap-hit versus accumulated-value rank
correlations were 0.261, 0.166 and -0.064 respectively. These descriptive results
do not justify changing the hockey rating to reproduce salary rankings.

## NHL team-success validation

The October 2026 audit covered all 404 team-seasons from 2013-14 through 2025-26,
with 14,240 player/team allocations covering 13,159 saved player-seasons. It fetched official NHL team summaries,
team-filtered skater time-on-ice and goalie summaries, and postseason brackets.
Team membership comes from the historical `teamId` query, not the player's
current team or the report's multi-team abbreviation string. All player-minute
allocations reconciled to the saved season totals. Two emergency goalies with
8 seconds and 70 seconds of exposure retain their recorded zero contribution;
their unknown ability is not replaced with a made-up rate. The two affected
team-seasons are omitted only from ability-rate comparisons.

Team contribution is the sum of each player's season goal value multiplied by
their fraction of ice time for that team, divided by the team's games played.
Goalies are included. This conserves each traded player's season value, but is
an allocation of a season estimate, not an independently measured contribution
for each trade stint. The ability comparison sums shrunk ability rates times
actual team ice time. The performance-display comparison takes a TOI-weighted
mean of the existing 0-100 player scores, using neutral 50 for unrated players;
it is a diagnostic display average, not additive goal value. Unequal schedules
and failed-gate seasons do not receive this display comparison.

Primary analysis excludes provisional 2019-20: 373 team-seasons across 12 years.
Pearson correlations remove each season's mean; rank comparisons use ranks
within season. Whole-season bootstrap intervals use 1,000 deterministic
resamples, accounting for teams within a season moving together.

| Comparison | Within-season Pearson correlation |
| --- | ---: |
| Accumulated team value vs points percentage | 0.945 |
| Accumulated team value vs win percentage | 0.932 |
| Accumulated team value vs goal difference/game | 0.981 |
| Performance-display team score vs points percentage | 0.875 |
| Skater-only value vs points percentage | 0.858 |
| Offensive process plus finishing vs goals scored | 0.974 |
| Defensive process plus goalie saving vs fewer goals conceded | 0.970 |
| Accumulated value vs playoff wins, among postseason entrants | 0.179 |

The points correlation's season-bootstrap interval is 0.930-0.957. Each individual
qualified season's points correlation is between 0.905 and 0.967. Including
2019-20 produces 0.944; excluding both pandemic seasons produces 0.950. These
are retrospective associations, not forecasting accuracy: the player scores
already contain the same regular-season goal and shot outcomes.

Regular-season ratings were frozen for postseason comparison. Higher accumulated
team value won 101/180 series (56.1%); higher points percentage scored 55.6%,
with tied values receiving half credit. The performance-display team score
also scored 55.6%. Playoff wins correlate weakly with team value: the
season-bootstrap interval is 0.057-0.304. Conditioning on playoff participation
avoids inflating this relationship with nonqualifiers' zero playoff wins.

For probability evaluation, symmetric ridge-logistic calibrations train on
earlier seasons only, requiring three training seasons. On 135 subsequent
series, accumulated-value Brier error was 0.2480, compared with 0.2437 for points
percentage and 0.2500 for a constant 50% forecast. Adding accumulated value to
points percentage yielded 0.2471. Neither comparison establishes an improvement
over points percentage: paired season-bootstrap differences include zero.
Ability and display-score alternatives are also exported, with points baselines
re-evaluated on matching series when ability is missing.

Interpretation: the model distributes regular-season team success coherently,
and including goalies matters. This does not prove that credit is allocated
correctly among correlated teammates, or that the annual total is a strong
playoff predictor. Full-season roster exposure differs from a healthy playoff
lineup; trade timing, injuries, opponent matchups and later deployment remain
unmodeled. Prior historical model development also means these are not untouched
prospective trials. Persistent franchise dependence across years is not modeled
by the bootstrap. The test does not change weights, production ratings, or the
55-to-68-game performance curve.

## Finalized 2019-20 review

The 2019-20 regular-season calculation is finalized with documented limitations,
not reclassified as having passed its original validation gates. All 970 player
scores and played-game inclusions are retained. The 679 players meeting the
existing individual evidence thresholds receive their original position ranks,
percentiles and ability ranks; 291 retain individual provisional flags for
sample size or coverage. Those flags do not mean the season remains unfinished.

The final review rechecked the 20 largest lineup-exposure gaps against official
alternate reports without recovering additional trustworthy process time.
Verified process coverage remains 97.1531%, and individual shot coverage 99.9732%.
Held-out xG/goal differential MSE was respectively about 0.23%/0.35% worse than
the situation-only baseline. These failed checks remain recorded. Team-success
correlation is supporting retrospective evidence, not grounds to mark those
predictive checks passed.

Each production row's `gameValue.finalization` records the reviewed state,
timestamp, reason, failed checks, coverage and report/backup/review hashes.
The original calculation provenance and numerical components are preserved.
The targeted finalization mutation checks the exact 970-player source snapshot,
preserves scores, validates individual qualification, recomputes tied ranks,
and applies atomically. A second application is unchanged. Routine imports
cannot change finalized records. A future scientific revision requires a
separate explicitly reviewed version/migration; it cannot silently overwrite
the accepted historical season.

Team-audit artifacts produced before this final review retain their historical
"provisional 2019-20" labels and strict-gate exclusion. They are immutable
evaluation snapshots, not the current publication state.

## Change checklist

Before changing behavior, account for every affected sheet, position, season
type, comparison pool, and small-sample path. Report expected score/rank movement
and affected cohorts. Keep tuning within the responsible profile and preserve
the entering-week invariant. Run sync/check after focused tests and parity.
