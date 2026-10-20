# 2025-26 reconstructed-pipeline retrospective confirmation

Status: **SEALED for local execution under the rules below.** Written
before fitting or inspecting the newly reconstructed 2025-26 ordinary-shot,
OOF impact or valuation results. This season is not globally untouched:
previously inspected legacy season-level ratings included 2025-26 and informed
ability/reference research. The scope below is a third reconstructed-season
pipeline confirmation conditional on that prior inspection, not a fully
independent untouched-season trial.
The 2023-24 and 2024-25 retrospective valuations have completed source,
inference, qualification and per-player accounting audits and independent code
review. Their exact hashes, this protocol's hash and implementation hashes are
retained in the external seal ledger. Subsequent changes require a dated
amendment before running anything affected.

The target is descriptive season contribution above an annual same-position
replacement reference, with ability reported separately. This is a separate
calculation from the rejected chronological nonlinear-shot adoption arm. Its
two-season failure remains unchanged under the
[explicit stop amendment](nhl-2025-confirmation-protocol.md). This experiment
cannot rescue it or make a forecasting claim.

The legacy export contains 1,038 2025-26 player rows (801 rated and 237
provisional), including components, season value, ability, minutes and coverage.
The ability experiment evaluated 673 matched 2025-26 player outcomes as part of
its 2,040-pair comparison and pooled uncertainty summaries. Annual reference,
contrast and goalie-blend experiments also used that season's legacy outcomes;
their reported 2023-25 research summaries therefore were not confined to the
first two reconstructed seasons. These aggregate-derived results are distinct
from the new official-event reconstruction but can still influence research
choices. Preserve the legacy-inspection audit and disclose this limitation in
every confirmation report. No threshold changes follow from the correction.

## Source-only preparation

Use the complete 20252026 regular-season schedule and cached official NHL
play-by-play, game reports, shifts and permitted official TOI-report repairs.
No passing 2025 v3 rating report, chronological GLM shot fit, chronological GB
fit, chronological impact fit or forecast gate is a prerequisite. Reuse the
existing cache, `fetchSeasonGames`, `loadVerifiedGame`, `extractShotTrainingRows`,
`buildNhlRatingInput`, `summarizeGameAudit` and `reconcileSeasonExposure`
interfaces. Keep commands thin; a source-only adapter should supply the shared
canonical inputs rather than duplicate these parsers or fabricate a fitted
report. This document proposes the workflow; it does not implement a new path.

Before numerical fitting, seal the full schedule and effective per-game source
hashes, canonical official player reference and independent prior strategy,
ordinary-shot rows and their canonical JSON/file hashes, source corrections,
penalty-shot classification reconciliation and source audit. Require all games
downloaded, unique game/event/player identities, exact schedule/date scope,
official season appearance/minute reconciliation, at least 98% usable process
clock exposure and at least 98% verified individual-shot coverage. Use the
existing denominators: summed usable process seconds / summed official game
seconds, and verified attributed shots / official supported shot events.
Report ineligible games, missing events and every coverage denominator. Keep the
existing per-game eligibility and per-player qualification rules; do not repair
missing hockey information by inventing exposure or credit.

A fixed placeholder may be used only for source-presence/physical checks. It
must never enter a training row, calibration table, shot probability ledger,
penalty price or player score. Source selection depends on physical
reconciliation, including verified goal identities/counts, never prediction
accuracy or resulting player values or ranks.

Retain the exact frozen 16 geometry/type/sequence features and five additional
nonlinear context fields. No extractor revision, identity feature, outcome
feature, new admission rule or post hoc calibration. Preserve exact official
manpower/goalie metadata and shooting-home orientation. Missing/malformed
optional context uses the existing explicit encoding and remains in the common
cohort; do not drop difficult contexts. Reject duplicate events, conflicting
game dates, invalid dates, nonbinary goals and invalid required features.

## Fixed nested whole-game estimation

The primary comparison is **GLM OOF versus GB OOF on identical ordinary shots**.
Assign each game to one of five folds by the first eight SHA-256 hex digits of
`season:gameId:retrospective-v1:14731`, modulo five. Both teams and every event in
a game remain together. Write the immutable assignment manifest before fitting.
Do not rebalance, repeat assignments or choose a seed using results.

For each outer fold, exclude all its games from both fitting and parameter
selection. Sort the distinct dates of only the remaining games. Use dates
before index `floor(0.4 * dateCount)` for inner training, dates from there until
index `floor(0.6 * dateCount)` for validation, and preserve whole date groups.
The remaining 40% enters only the final outer refit. Reject empty partitions.

Select the GLM ridge from `[1,10,100]` by validation Brier, breaking exact ties by
lower ridge. Select GB from maximum leaf counts `[7,15,31]` crossed with L2
`[1,10]`, also by validation Brier, breaking exact ties by fewer leaves then
lower L2. Keep 300 iterations, learning rate 0.05, minimum leaf size 50, no
early stopping, seed 14731, maximum bins 255, numeric features only and the
existing missing-value policy. Pin the reviewed Python dependency versions and
limit numerical worker threads to two. No installation or grid expansion is
part of this protocol.

Refit each selected learner on all outer-training games; predict its excluded
games once. This is five final GLMs and five final GBs, with 15 GLM and 30 GB
inner fits. There is no first-60% full-season reference fit: the current trainer's
native-GLM sanity check must become an independently tested parity prerequisite,
not a requirement to fit the stopped chronological arm on 2025. Existing
2023/2024 native-parity fixtures can validate the unchanged GLM implementation.
The source-only trainer entry point must also omit the old frozen-model
requirement and frozen first-60% descriptive comparisons. Obtain feature names
from the unchanged reviewed feature contract; preserve the existing nested
fitting/export logic. No fabricated baseline model is supplied merely to satisfy
the old command interface.

Save every fold's inner IDs/cutoffs/trials/selected parameters, excluded IDs,
outer-training IDs, numeric models, source hashes and startup code/dependency
hashes. Every prediction records game/event/date, outer fold, training-ID hash
and fold-fit producer ID. Keep the separate retrospective schema; never invent
`trainedBefore` or `testFrom` provenance. Independently replay both learners on
every admitted row with maximum probability error below `1e-12`, verify exact
source/model/manifest bindings and own-game exclusion, and recompute aggregate
and per-game errors. A hash binds an artifact; it does not itself prove that the
recorded training execution occurred.

## Predeclared confirmation decision

Require all source, inference, coverage and accounting checks. For 2025 alone,
GB must improve both Brier error and log loss, have no greater than 2% relative
Brier regression in any known shooter-relative context with at least 1,000
shots, and have absolute total-goal bias at most 10%. Report all smaller and
unknown contexts without claiming that their sample sizes establish calibration.

For **reconstructed-pipeline confirmation**, additionally require the upper 95% endpoint
of each paired GB-minus-GLM error difference, Brier and log loss, to be below
zero in 2025 alone. Use the existing 2,000 whole-game paired bootstrap with LCG
seed 14731 and the frozen percentile indexing. Point improvements whose
intervals cross zero are inconclusive pipeline confirmation, not a pass.
Preserve that result even if pooling produces a favorable interval.

Keep the completed two-season development screen fixed. Report the three-season
shot-weighted comparison and 2,000-replicate whole-game bootstrap stratified
within season as secondary evidence under the original pooled upper-below-zero
criterion. Neither pooling nor a favorable player ranking can rescue a failed
2025 condition. These are conditional intervals with fitted folds held fixed;
overlapping training sets and hyperparameter selection are not resampled. They
do not measure causal attribution or all model uncertainty. Previously inspected
2025-26 legacy outcomes prevent interpreting these as globally independent
untouched-season tests; fresh pipeline results provide useful additional
evidence within the declared inspection history.

## Fixed descriptive valuation and accounting

After probability/source audits, fit exactly two full-season independent-prior
impact models, one per OOF learner, with **lambda 4 for both**, chosen from the
inspected 2023/2024 choices before seeing 2025 results. Do not tune or rescale it
on 2025, add shared-cohort regularization, add goalie process columns or run a
forward comparison. Keep model convergence checks and existing coverage rules;
do not manufacture a predictive quality gate for a descriptive report.

Use the same existing ability-prior strategy and defaults in both arms, record
their exact provenance, and keep ability separate from the season-value primary
comparison. Ordinary-shot probability alone differs. For penalty shots retain
the existing independent preceding-five-season historical strategy, strictly
before 20252026, same game type, with `(historicalGoals + 0.5) /
(historicalAttempts + 1)`. Use that one probability in both arms; no 2025
conversion labels enter its estimate. Keep penalty-shot events outside ordinary
shot training. Preserve unpriced/ambiguous penalty rules.

Recompute process, finishing, saving, penalty rates and annual replacement
references consistently from each arm. Require identical official identities,
actual goals, deployment, physical eligibility, status and component coverage
across arms. One event probability is shared by shooter and opposing goalie.
Reconcile stored per-player finishing/saving to an independently accumulated
raw-event ledger, including provisional players, with the existing four-decimal
storage rounding bound. For events with both identities require residual
cancellation within `1e-12`; report empty-net finishing and penalty shots
separately. Reconcile player/component/season totals and source gaps without
silently discarding unrepresented event credit.

Use annual same-position replacement depth 13 forwards, seven defensemen and
two goalies per official team, PP 11 and SH nine. Report the existing narrow
`12/6/1.5` and wide `14/8/2.5` sensitivities, leaving PP/SH fixed. Preserve
exposure bounds, certain-reference selection, minimum reference counts and null
results when unsupported. This controlled GLM-versus-GB comparison keeps annual
references in both arms; the separate reference test below cannot change it.

Report component, value, rank and replacement-reference movement by position,
workload and available style diagnostics. Do not choose a model by player names,
the top-position distribution or whether a familiar star moves up. Successful
shot confirmation supports retrospective chance estimation; it does not prove
the causal division of individual credit or optimal replacement availability.
Any adoption remains a separate reviewed decision with its own method revision,
replayable artifacts and documented limitations. No production write, automatic
promotion or extra learner follows from this draft.

## Separate fixed goalie-reference postprocessing test

This is a separate reference-estimation experiment on the completed fixed OOF
values, with no additional shot, impact or ability fit. Preserve the annual
reference GLM-versus-GB comparison above so that shot-estimation effects remain
isolated. Its result and the reference result must be reported separately.

The single reference candidate replaces only goalie saving's annual reference
with a fixed 10,000-equivalent-minute blend. That concentration was selected
using default-depth legacy development outcomes through 2022-23, before the
reconstructed 2023/2024 comparison. Reuse it across both OOF learners and all
three depth sensitivities; do not select a separate concentration by depth or
learner. The already-inspected two-season bridge favors this blend at every
depth/learner, while pure historical pooling has a narrow-depth counterexample.
These observations motivate the candidate; they are development evidence.

Define the historical target as the minute-weighted expanding saving contrast
between the same-depth replacement cohort and its covered league-goalie anchor.
Use only supported, nonlimited legacy seasons strictly before 20252026 from the
exact retained legacy snapshot, with at least three prior seasons. Do not
replace earlier legacy years with newly reconstructed OOF values. Past
observations of a current goalie remain allowed and must be disclosed; no
current-season held-out outcomes enter that historical contrast.

For each fixed OOF learner and depth, use the existing count-balanced five
whole-goalie folds with seeds `[193,721,1297]`, stable player-ID ordering and the
unchanged deterministic shuffle. Exclude every held-out current goalie from
both the current replacement-cohort saving reference and the current covered
league-goalie saving anchor. Preserve identical held-out identities, official
minutes, coverage and saving residuals across all reference methods. Require
the existing minimum five training reference players and supported anchors;
unsupported comparisons stay explicit rather than changing membership.

Let `m` be training reference minutes, `r` its saving goals per 60, and `a` the
current league-goalie saving anchor after those exclusions. The candidate
predicts `(m*r + 10000*(historicalContrast+a)) / (m+10000)`. Compare it with the
annual training reference `r`; retain pure historical `historicalContrast+a`
as a diagnostic only. The target is the held-out group's minute-weighted saving
rate `60*sum(saving)/sum(minutes)`, not an individual goalie's ability. Compute
MSE across held-out fold means weighted by those groups' official minutes.
Report unique goalie counts and repeated evaluation minutes; 15 seed/fold
records are not 15 independent seasons.

For confirmation, at default depth **in each learner arm**, the fixed blend
must lower weighted group-mean MSE versus annual and have a conditional paired
95% upper MSE-difference endpoint at most zero. At narrow and wide depths, in
each arm, its point MSE must be no more than 1.05 times annual MSE. Report
absolute errors, differences and ratios at every depth. A favorable pooled,
pure-pool or one-arm result cannot rescue another required condition. There is
no concentration reselection, new window or switch to pure pooling after 2025.

Use 2,000 whole-current-goalie ID bootstrap resamples with seed 282761, sharing
each ID's multiplicity across both learners, all depth policies and all repeated
seed memberships. Freeze learned reference predictions. For every resample,
recompute the held-out fold's weighted target mean and group weight, then the
same weighted group-mean MSE difference; report unsupported/invalid resamples.
Use the existing percentile indexing. Do not resample overlapping folds as
independent observations. An independent development-artifact audit verified
that individual weighted loss-difference aggregation is algebraically equivalent
under these exact shared weights and memberships, but absolute MSEs and ratios
are not interchangeable: they must use the declared group-mean statistic.

This conditional interval omits reference-training/anchor estimation,
historical-prior, exposure-selection and upstream-model refitting uncertainty.
Whole-goalie exclusion applies to reference and anchor postprocessing only:
the fixed shot OOF models can learn from other games involving the same goalie.
This is not an end-to-end player, ability or causal holdout. Prior inspection of
legacy 2025 outcomes further prevents a globally untouched-season claim.

If the reference test supports the candidate, a separate pure wrapper may show
the resulting expected-reference preview using all available current evidence
and the same fixed blend. Preserve F/D values, goalie finishing and penalty
references, event components, qualification and ability exactly. Keep annual,
blend and pure-pool diagnostics side by side; only saving's reference changes.
No score update or deployment follows automatically from either experiment.

## Execution seal

Sealed October 18, 2026 after the parent review and independent source, numeric
and implementation reviews. At sealing, no newly reconstructed 2025 shot/OOF
model, accuracy or ranking result has been inspected; prior legacy exposure is
explicitly retained above. Both older valuation runs converge, preserve player
qualification and reconcile stored finishing/saving credit against raw events.
The new blend passes its endpoint, historical-cutoff and preservation fixtures.

Source collection, which was incomplete when first drafted, is complete:
1,312 games, 1,307 fully eligible, 99.9851% usable process clock coverage and
100% individual-attempt coverage. All four physical gates and official season
exposure reconciliation pass. The final source-manifest SHA-256 is
`a02eaacbb2acb7440cbe9b84595df83d3e4c9856cc78e5f229a05e4b2af116c1`.

The external ledger is
`.local-data/nhl-rating/review-20261018/2025-reconstruction/protocol-seal/seal.json`.
It binds this document, reviewed evidence, source manifest, legacy-inspection
audit and implementation bytes without a circular self-hash inside this file.
An exact protocol snapshot is retained beside the ledger and must match the
trainer's snapshot. Execute only local source-only nested estimation, its
declared audits, the two fixed-lambda valuation fits and the separate reference
check. This seal authorizes no production publication or changed criteria.
