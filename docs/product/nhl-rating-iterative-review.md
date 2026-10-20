# NHL rating iterative review

Review started October 18, 2026. The agreed primary target is **season
contribution above an NHL replacement player at the same position**, expressed
in common goal units. Sustainable ability remains a separate estimate. GSHL
categories, salaries and roster rules are not inputs.

The selected local profile is documented in the
[reviewed overall method](nhl-overall-rating.md): GB whole-game cross-fit chance
estimation, existing adjusted-impact/event accounting and **annual**
same-position replacement references. The completed three-season evidence below
supports that descriptive workflow; neither the failed chronological candidate
nor the unconfirmed historical goalie-reference blend enters the primary score.

## Review process

Independent subagents examined the model mathematics, event attribution and
validation. Subsequent rounds challenged the fixes and experimental results.
The implementation acceptance criterion is no unresolved reproducible material
correctness defect after independent review and focused numerical checks.
Scientific acceptance additionally needs comparative evidence for the stated
target; a passing test suite cannot establish an optimal player-value estimator.

The first audit is retained in
[the implementation review](nhl-season-value-v3-implementation-audit.md).
Its initial data-access limitation was subsequently resolved: direct Node
execution with the Windows system certificate store allowed bounded read-only
production queries and public NHL requests. TLS verification was retained.

## Correctness improvements

- Unfitted player effects do not count as measured zero process impact or
  supported exposure. Verified individual events remain available.
- Duplicate games, invalid priors, invalid chronological partitions, duplicate
  shot observations and malformed shot-model vectors are rejected.
- Penalty cancellation cannot choose the charged player from source order.
  Unique reciprocal offsets and certain aggregate cancellations are retained;
  ambiguous assignments and interacting residual clocks remain unpriced.
- Postgame penalties cannot alter an earlier live penalty's context or offsets.
- Finite-clock double minors use the expected duration of two serial minor
  portions, rather than doubling a single truncated portion. Independent
  numerical integration confirmed the formula.
- Unmodeled late-regulation overtime carryover is explicit rather than valued
  as guaranteed full penalty exposure. Playoff overtime uses either team's
  scoring hazard to end exposure, while retaining playoff manpower rules.
- Ordinary penalty attribution verifies team identity and actor-team consistency.
  Contradictory assessments remain unpriced, including other assessments sharing
  their whistle's unknown context. A bench penalty's server is not its committer.
  This is a source-contract safeguard: an independent sample of 936 cached games,
  with 6,373 supported penalties, found no actual identity contradictions.

New calculations use revision
`2026-10-18-reviewed-process-and-penalties`. Historical revisions remain
accepted by the storage validator. No production scores were recomputed,
imported or replaced during this review.

## Historical ability experiment

A bounded derived export recovered 13 seasons, 2013-14 through 2025-26,
containing 13,159 player-seasons. Every exported row uses the historical
`2026-09-30-partial-games-and-penalty-shots` revision. The limited 2019-20
season is excluded from the primary experiment.

The input is retained at
`.local-data/nhl-rating/review-20261018/stored-v3-seasons.json`, with SHA-256
`78ad52625ab8b749994a2df7a35f9bfa6778830409215911ac3e5fae44611998`.
It contains rating components and coverage, not credentials or raw source events.

The pure `nhl-ability-experiment.ts` compares stored ability with previous-season
observed rates, three-year minute-weighted history, component-specific calibrated
priors and a neutral zero. The prior grid and evaluation seasons were fixed before
calculating results. Each rolling fold fits only on earlier outcomes. All methods
use identical matched player cohorts and official-minute denominators.

Across 2,040 player-season pairs, covering 850 returning players, minute-weighted
future-rate MSE is 0.103378 for stored ability and 0.092002 for the component-prior
candidate, an approximately 11.0% reduction. Unweighted MSE is 0.112929 versus
0.098483. The candidate improves the pooled error in each evaluated season.

This is not a successful universal replacement. Goalie error increases from
0.109504 to 0.114529, about 4.6%. Its paired player-cluster error-difference range
is positive. The minutes-based candidate does not replace the current goalie's
shots-based shrinkage model. Selecting a new F/D-only hybrid after inspecting
these results would be another exploratory choice, not an independently tested
production policy.

Results, exclusions, attrition, individual predictions and paired uncertainty
diagnostics are reproducible through `evaluate-nhl-ability.ts`. The retained
review output is
`.local-data/nhl-rating/review-20261018/ability-review/analysis.json`.
The 2,000 player-cluster resamples retain all evaluated years for each player.
They do not capture shared team/season dependence or uncertainty from refitting
the underlying impact models. Future modeled contribution rate is a noisy target,
not observed causal talent; players without a qualified future NHL season have
no such rate and remain explicit exclusions rather than being assigned zero.

These inspected historical seasons are research evidence. They cannot now be
described as untouched confirmation for a policy chosen after seeing the results.

## Replacement reference

The implemented overall preview uses an explicit ice-time-depth proxy for NHL
replacement players. Offensive and defensive references use the same cohort
of whole players. Qualified players receive a single competition rank across
F/D/G based on contribution above their position's reference in common goal
units. Low-minute players with verified components may inform the reference,
but retain their provisional status and receive no overall rank.
A value of +10 means ten modeled goals of season contribution above the
same-position reference at that player's actual deployment; zero is the
reference contribution and negative values fall below it. No extra position
multiplier or within-position percentile equalization changes those units.

[Evolving-Hockey's replacement-level methodology](https://evolving-hockey.com/blog/wins-above-replacement-replacement-level-decisions-results-and-final-remarks-part-3/)
describes pooling players outside regular playing-time depths and estimating
their aggregate contribution. Its skater approach motivates separate EV, PP
and SH cohorts and keeping concurrent offense and defense together. Our
league-depth implementation and goalie policy require their own checks; they
are not a reproduction of that provider's GAR/WAR model.

The preview's policy and narrower/wider depth sensitivity are fixed before
inspecting reconstructed player rankings. A cohort must supply usable measured
values and adequate membership; missing reference evidence cannot silently fall
back to the average player. A sensitivity range is not a confidence interval.

The default regular depths are 13 forwards, seven defensemen and two goalies
per NHL team, with 11 power-play and nine penalty-kill skaters per team.
Separate EV forward/defense cohorts and combined special-team cohorts are
subsequently split by position. Individual finishing and penalty references use
the EV cohort. The goalie and empty-net policies are explicit local choices.
The narrower/wider presets vary F/D/G depths to 12/6/1.5 and 14/8/2.5 while
holding the special-team policies fixed. These presets are shared by the pure
runtime and its offline command.

Membership uses bounded verified exposure: a player's unmodeled time is allowed
to affect whether they could be above a depth cutoff. Uncertain membership is
excluded, ties remain regular, and unsupported reference families withhold the
affected overall value. This avoids turning missing exposure into a low-minute
replacement observation. Reference counts, membership exclusions, exact player
IDs and input hashes are retained for inspection. Current-season deployment,
injured stars and actual player availability remain limitations of this proxy.

## Additional validation

Fresh shot-model reports expose calibration separately by official manpower and
goalie state. This distinguishes situations such as 3v3 and 5v5 even though the
existing shot feature vector uses net skater advantage. Aggregate calibration can
otherwise conceal opposing errors. This diagnostic does not alter fitting or
automatically establish that any particular feature expansion improves accuracy.

Held-out goal evaluation now compares chance-only predictions, finishing
adjustments, saving adjustments and their combination on the same games.
Finishing and saving are learned strictly from earlier eligible games; unknown
player rates are reported. Actual deployment and known penalty-shot opportunities
remain conditions of the comparison. Penalty ability is not added again to
already observed manpower. These comparisons test useful predictions, not the
causal allocation of every goal among individual players.

## Public reconstruction and completion evidence

The user authorized recreating missing files. The official 2024-25 schedule
contains 1,312 games and 32 NHL teams. Canonical season reports and a v2 adapter
baseline have been recreated locally. This single-season baseline uses default
ability priors, not recovered historical v2 calibration; fresh v3 reports now
identify that provenance explicitly.
Those priors affect sustainable-ability estimates, while the primary season
contribution and replacement preview use the observed contribution components.

All 1,312 games were collected without download failures into the retained cache
under `.local-data/nhl-rating/review-20261018/`. The preparation audit selected
29 games for official alternate-report checks; all 29 downloads succeeded and
20 additional games became fully verified. The final audit includes all games,
with 1,303 fully eligible for impact fitting, 99.98198% usable process-clock
coverage and 100% individual-attempt coverage. Twenty-two events retain
individual-only credit where lineups cannot be reconciled. The nine remaining
limited games are not silently reclassified as fully verified. Source hashes
and original reports are retained. No threshold was relaxed.

The reconstructed report is retained in `v3-2024-reviewed/`. All 12 existing
source/model quality gates pass, with canonical season exposure reconciled.
There are 1,023 players: 793 qualified, 230 provisional and none incomplete.
The impact solver converged at lambda 4 in 55 iterations, with relative residual
7.93e-9. There are 413 explicitly unpriced penalty assessments across 254 games;
these are limitations, not estimated zero costs.

The offline replay verified all 1,312 saved source hashes, reproduced the
saved ratings exactly and returned identical results on a repeat calculation.
On identical reconstructed inputs, frozen fitted coefficients and identical
default priors, the original season-accounting code versus corrected code
changes 328 player values and 542 within-position ranks, with no qualification
changes. The largest absolute value change is 1.2272 goals. Unpriced penalty
assessments increase from 42 to 413 because ambiguous events are no longer
assigned arbitrary costs. This isolates accounting changes; it is not a replay
of an older production source snapshot or evidence of predictive superiority.
The retained comparison is `replay-comparison.json`.

On the identical 273 supported held-out games, player effects reduce xG
differential MSE from 1.595109 to 1.358792 (14.8%) and goal differential MSE from
7.159863 to 6.927447 (3.2%) against the situation-only baseline. Binary decision
accuracy is 68% versus 70%; lower squared error does not imply improvement in
every metric. These are conditional deployment comparisons, not pregame picks.

The additional earlier-game residual diagnostic gives goal differential MSE
6.836442 with finishing, 6.784196 with saving, and 6.712861 with both, versus
chance-only 6.927447. The combined diagnostic's decision accuracy is 67.6%,
compared with 72.4% for saving alone. No universal ability policy is selected
from these inspected outcomes.

The shot model's held-out Brier score is 0.060979 versus 0.066916 for the constant
baseline. Predicted goals are 1,648.54 versus 1,684 observed across 23,352 attempts.
Situation diagnostics remain necessary: the `1451` group has 144.37 expected
versus 177 actual goals over 1,624 attempts, while `1331` has 24.49 versus 32
over 268 attempts. Aggregate gates do not certify every strength state's
calibration. These inspected groups are hypotheses for a separate future
feature/calibration experiment, not grounds for tuning this held-out sample.

The overall output is retained in `overall-2024-preview/`. All 793 qualified
players receive an overall value: 456 F, 258 D and 79 G. Default individual
reference cohorts contain 185 F, 95 D and 39 G; every required process family
has sufficient membership. The default leaders are Connor Hellebuyck (+62.38),
Andrei Vasilevskiy (+51.24), Samuel Montembeault (+50.38), Darcy Kuemper (+47.32)
and Leon Draisaitl (+45.47). Cale Makar is the leading defenseman, +23.00 at
overall rank 36. These are model outputs, not independent validation labels.

Replacement-policy sensitivity is material. All presets retain 793 ranked
players, but the narrower/wider policies retain only 17/16 of the default top 20. Maximum individual rank movements are 422/520 places, and maximum value
movements are 9.94/20.81 goals. Goalie reference saving rates vary from -0.235
through default -0.391 to -0.711 goals per 60. Hellebuyck remains first in all
three policies, with values ranging from +52.44 to +83.18. Fifteen of the default
top 20 are goalies. Position-weight tuning to force a preferred leaderboard
would conceal this unresolved reference uncertainty rather than validate it.

An independent implementation recomputed all 793 overall values directly from
the saved coefficients, exposures and references, with maximum absolute
difference 1.07e-14 goals. No arithmetic or source discrepancy was found. The
same review identified important precision limits: the F/D power-play cohorts
have only 2,635/1,468 combined minutes across 282/202 players, and empty-net
cohorts only 192/139 minutes across 125/71 players. A minimum player count does
not establish adequate precision. Low-minute skater process estimates are ridge
shrunk, whereas goalie season saving is an observed residual. Their estimation
uncertainties differ. The goalie reference uses 10,032 total minutes across 39
players and adds about 24.29 goals to Hellebuyck's raw season value under the
default policy. No ad hoc position multiplier is justified by this leaderboard.

The small held-out goal-error gains have no fitted-model uncertainty interval
establishing their statistical reliability. Context-specific xG miscalibration
can also redistribute finishing and saving credit even when the aggregate shot
gate passes. These limitations remain visible in the preview and review record.

The implementation is a reproducible, reviewed improvement with a usable
replacement-value preview. **An optimal cross-position rating has not been
established.** Scientific work remains: test replacement availability and pooled
reference stability across additional independently reconstructed seasons,
assess strength-specific calibration, and confirm changes on outcomes not used
to select them. Production ratings remain unchanged.

## Continued experiments

The recovered legacy snapshot covers 20132014 through **20252026**, not merely
through 2024–25. Earlier ability/reference experiments already used 2025–26
stored outcomes. New reconstructed shot/OOF/valuation results can still be
evaluated under frozen rules, but that season is not globally untouched or a
prospective trial. `legacy-2025-inspection-audit.json` records the exact exposure.
Any earlier wording about an uninspected 2025–26 season refers only to the new
reconstructed workflow and must be read with this correction.

The active goal continued after the first full-season review. Reference
instability remains an objective to improve, not a reason to declare the rating
finished. A separate 2023–24 reconstruction is underway with candidates fixed
before its fitted results are inspected. No experiment has changed the default
rating or production data.

The pure `nhl-reference-stability.ts` evaluates prior-year, trailing-three,
trailing-five and expanding historical references on identical annual cohorts.
The retained artifacts are `reference-stability/analysis.json` and
`analysis-contrast.json`. After inspecting uncentered results, a second explicitly
exploratory hypothesis subtracts each year's covered position-average rate and
forecasts that contrast before reanchoring to the target season's average.
Historical process coefficients are not pooled: their family exposures and
anchors are unavailable. Historical F/D cohorts use a labeled total-TOI proxy,
while goalie depth uses the same total-TOI definition as the current preview.

For the default goalie contrast, expanding history reduced development weighted
MSE to 42.9% of the prior-annual comparator, improving all three fixed goalie
depth policies. Fixed expanding contrasts also improved all five primary
development component series. Adaptive window selection overfit the small
annual sample, so its apparent flexibility did not earn promotion. A separate
five-prior-season goalie contrast estimate of -0.318 goals/60 has a conditional
player-cluster range of [-0.434, -0.202]; this omits team, season and model
uncertainty and is not an interval for the expanding candidate. Future
confirmation ideals are recorded separately from a current best-available
comparison; no claim of optimality follows from this historical experiment.

The [frozen context-calibration experiment](nhl-shot-context-experiment.md)
retains identical test shots and adds shooter-relative state information through
a separately versioned calibrator. On 23,352 held-out 2024–25 shots, Brier error
changes from 0.0609792841 to 0.0609604919 and log loss from 0.2241052723 to
0.2239942275. Paired whole-game resampling includes zero for both differences.
Important context calibration gaps remain. This tiny single-season improvement
does not satisfy the predefined two-season screen or justify adoption. Its
complete inputs and report are retained under `shot-context-2024/`.

The [shared-cohort process experiment](nhl-impact-cohort-experiment.md) tests
whether low-minute replacement skaters benefit from a shared prior mean while
retaining individual effects. The sparse operator matches an independently
solved dense system; singleton and empty-cohort fits preserve the baseline.
Independent reviews caught and corrected date-boundary and physical exposure
bound edge cases before the full candidate fit. Seven focused regressions pass.
The experimental path does not alter the default prior.

Its completed 2024–25 run converged at lambda 4 (111 full-season and 110
test-model iterations), but failed the preset xG improvement screen:
1.358792 becomes 1.362709. Goal differential MSE improves from 6.927447 to
6.887472, while team-goal MSE changes from 3.315605 to 3.318751. All paired
game intervals include zero. The candidate therefore remains experimental;
changing the criterion after seeing these results would not validate it.
The retained report is `impact-cohort-2024-reviewed/analysis.json`.

A separate goalie-reference preview applies only a fixed expanding historical
contrast to goalie saving; it preserves F/D contributions and every other
reference. Its 2024–25 saving reference changes from -0.39149 to -0.31763 goals
per 60, and it predicts that year's measured reference better than the prior
annual reference at all three fixed depths. Saved and reconstructed goalie
contrasts agree exactly at each depth. This version bridge supports using the
historical evidence, but does not establish the best estimator of the current
replacement population. The output is
`pooled-goalie-2024-preview-reviewed/analysis.json`.

The follow-up `nhl-goalie-reference-blend.ts` tests that estimand directly by
holding out whole replacement goalies, excluding their current outcomes from
both the reference estimate and the league anchor. A fixed concentration grid
is selected only on development seasons through 2022–23. For default depth,
development selects 10,000 equivalent prior minutes: its weighted error is
0.11699 versus 0.12785 for current-season evidence and 0.13669 for historical-only
evidence. In the already-inspected 2023–25 research years, the same frozen blend
has error 0.14563 versus 0.17592 current-only and 0.12547 historical-only. The
training preference is uncertain and does not establish a universal winner.
Three repeated player partitions are not treated as independent seasons.
The retained report is `reference-stability/analysis-goalie-blend-reviewed.json`.

After both OOF season valuations passed accounting, a bounded reference-only
check substituted each target year's OOF goalie residuals while preserving all
earlier legacy history. Cohort identities and minutes match at all three fixed
depths. The largest legacy-to-GB reference-contrast difference is 0.02791 goals
per 60; default-depth differences are 0.00162 in 2023–24 and 0.01169 in 2024–25.
The already-selected 10,000-minute blend improves current-only reference error
in both years, all three depths and both learners. Pure historical pooling has
lower default-depth error, but loses the narrow-depth 2023 comparison. The fixed
blend is therefore the more defensible primary research candidate; no new
concentration was tuned. Raw goalie outcomes are not held out end to end:
upstream OOF shot models can learn from other games of the same goalie. These
conditional reference-estimator comparisons do not establish causal goalie
credit or selection-free confirmation. Artifacts are
`oof-goalie-reference-bridge.json`, `oof-goalie-reference-holdouts.json` and
`oof-goalie-reference-interpretation-note.json`.

The 13-forward/7-defenseman depth convention has a primary-method precedent:
[Evolving-Hockey's replacement-level explanation](https://evolving-hockey.com/blog/wins-above-replacement-replacement-level-decisions-results-and-final-remarks-part-3/)
uses those even-strength TOI cutoffs, and
[HockeyViz's model specification](https://www.hockeyviz.com/txt/magnus7EV)
uses the same regular-player counts. That supports an explicit starting policy;
it does not independently validate our particular replacement rates, goalie
reference or cross-position values. The fixed depth sensitivities remain part
of the evidence.

The [nonlinear shot experiment](nhl-nonlinear-shot-experiment.md) tests a
predeclared histogram gradient-boosted learner with the same chronological
freeze and shot cohort. Its 2024–25 selected model reduces Brier error from
0.0609792841 to 0.0604517706 (0.865%) and log loss from 0.2241052723 to
0.2214135180 (1.201%). Paired whole-game intervals are entirely below zero;
all well-populated shooting contexts improve Brier error, while some calibration
biases remain. The artifact is `shot-nonlinear-2024/analysis.json`.

A separately validated numeric tree scorer reproduces all 23,352 held-out
Python predictions in TypeScript within 2.23e-16. Its model is cloned, validated
and frozen once before batch inference. The
[downstream impact experiment](nhl-nonlinear-impact-experiment.md) uses identical
source hashes and actual-goal targets; xG errors across learners are not treated
as directly comparable because their target labels change. Second-season and
downstream evidence are required before adoption. No production defaults have
changed as a result of these experiments.

The completed 2023–24 reconstruction passes all twelve gates: 1,312 games,
1,303 fully verified, 99.97296% process and 100% attempt coverage, 805 qualified
and 217 provisional players. Default ability priors contain no fitted historical
components. Its chronological nonlinear shot replication reduces Brier error
by 1.241% and log loss by 1.309%. The two-season pooled shot differences are
entirely below zero under paired game resampling. Compared directly with the
context calibrator on identical shots, the nonlinear candidate also improves
both errors. Home 5v5 expected-goal bias nevertheless worsens in both seasons;
better aggregate prediction does not establish uniform calibration.

The completed 2024–25 nonlinear impact run reproduces all source hashes and
baseline held-out results on 273 identical test games. Goal-differential MSE
changes from 6.927447 to 6.841158 (1.246% improvement), paired difference range
[-0.138921, -0.038223]. Team-goal MSE changes from 3.315605 to 3.312415
(0.096% improvement), range [-0.030476, 0.026170]. All fits converge and select
lambda 4. Combined finishing/saving prediction improves goal-differential error
but slightly worsens team-goal error; this secondary counterevidence is retained.
The overall top twenty still contain fifteen goalies and five forwards. No
position multiplier follows from those counts. The artifact's implementation
note preserves the first run's parser-hash timing and probability-label
qualification; subsequent runs capture code hashes at startup.

The completed 2023–24 impact replication uses 269 identical held-out games and
converges throughout. Goal-differential MSE worsens by 0.0336% and team-goal MSE
by 0.3053%, within the fixed per-season guardrails. Across 542 games, however,
the frozen pooled screen **fails**: team-goal MSE increases from 3.200487 to
3.203553, while the predeclared point-difference criterion requires no increase.
Pooled goal-differential MSE improves from 6.742947 to 6.700578, with difference
range [-0.074968, -0.008575]. The team-goal upper interval is within the 1%
margin, but cannot override the separate failed point criterion. The retained
`nonlinear-impact-pooled.json` records the failure. The chronological nonlinear
candidate is not adopted; stronger shot prediction alone did not establish a
better complete forecasting pipeline.

The chronological Python trainer, numeric exporter, synthetic-context predictor
and pinned optional dependencies now live in `scripts/python/nhl_rating/`.
The durable TypeScript parity command reproduces all 23,352 saved predictions
and 48 missing-context cases within 2.23e-16 and 1.39e-17 respectively. Scoped
strict TypeScript, Python syntax compilation and command help checks pass.
This makes the workflow transferable without relying on ignored research code.
An actual refit through the durable exporter exactly reproduces the feature
contract, initial log odds and all 300 trees, with zero difference from the
retained Python test probabilities.

The [2025–26 confirmation protocol](nhl-2025-confirmation-protocol.md) freezes
the selected chronological candidate and screening rules before fitting or
inspecting that season. The separate
[retrospective cross-fit protocol](nhl-retrospective-crossfit-proposal.md)
targets descriptive season accounting while prohibiting its labels from
chronological validation. An independent fold audit verifies that every one of
1,312 2024–25 games is excluded from both fitting and parameter selection for
its own predictions. Retrospective findings cannot change the frozen 2025–26
chronological confirmation.

Both inspected-season retrospective shot experiments are now complete. On
112,207 2024–25 shots, out-of-fold Brier error changes from 0.05992448 to
0.05932866 and log loss from 0.22172671 to 0.21893273. On 114,793 2023–24 shots,
the corresponding changes are 0.06030500 to 0.05968812 and 0.22241409 to
0.21960246. All four single-season screens pass in each year. Independent
all-row TypeScript inference matches Python within 2.23e-16 for the boosted
model and 6.12e-16 for the GLM. Conditional whole-game error-difference intervals
are below zero in both years; they do not capture refit or overlapping-training
uncertainty. These are same-game-excluded descriptive chance estimates, not
new forecasting evidence. Their effect on complete season accounting remains
under review.

The [goalie credit review](nhl-goalie-holistic-credit-review.md) identifies a
material remaining scope limitation: shot-stopping residuals do not separately
identify rebound control, puck handling or chance prevention. Primary research
also cautions that goalie process coefficients can absorb team effects. A new
term requires attribution and confounding checks; simply adding a coefficient
or an actual-goals goalie effect to GSAx is not a justified correction.

## Scoped verification

The first combined focused run passed 102 tests covering adjusted impact, chronology,
penalties, shot validation/calibration, goal diagnostics, overall references,
ability experiments, source adapters, publication and storage/finalization.
The final identity safeguard added four adapter regressions, including a
postgame assessment at the same clock as an earlier live penalty. This brings
the focused set to 106 distinct tests; the final 21-test adapter run passed.
The ranking runtime contract check passed all 31 checks. Scoped strict TypeScript
checks passed for the changed numerical runtimes and offline command entry points.
ESLint passed for the two changed Convex files; operator TypeScript files are
excluded by repository ESLint configuration. Formatting checks passed for the
changed/new numerical TypeScript and new review documents. Existing formatting
differences in `docs/RANKING.md` were preserved. `git diff --check` passed.

No frontend code changed, and no full application build or architecture suite
was run. No production import, recomputation, deployment or publication occurred.

## Completed third reconstructed season and final reference decision

The sealed 2025–26 source-only workflow reconstructs all 1,312 games without
requiring or fabricating a chronological model report. Its final physical audit
has 1,307 fully eligible games, 99.9851% process clock coverage and 100%
individual-attempt coverage. Exactly two full-season lambda-4 fits converge in
56 iterations. All 1,038 player identities/statuses/coverage agree across arms:
801 qualified and 237 provisional. Stored finishing/saving reconcile per player
to verified event credit within four-decimal rounding.

The 112,058-shot GB comparison passes every sealed shot condition. Brier error
improves from 0.0620198810 to 0.0613713585, log loss from 0.2291544129 to
0.2259595041. Both conditional paired error-difference upper endpoints are below
zero, all eight well-populated context guards pass, and expected goals are
8,080.97 versus 8,080 observed. Every prediction independently replays within
3.7e-16. Across all 339,058 shots, secondary stratified game resampling supports
lower Brier and log loss. Legacy 2025 outcome exposure remains disclosed; this
is not a globally untouched-season or causal trial.

The separate fixed-10,000-minute goalie reference comparison **fails** its
predeclared uncertainty condition in both learners despite lower point errors.
Default GB weighted group-mean MSE changes from 0.0817494 to 0.0674451; its
conditional difference interval is [-0.070807, 0.030908]. GLM changes from
0.0898234 to 0.0740481, interval [-0.072974, 0.030252]. All four sensitivity
point guards pass. Independent reconstruction of all 90 fold records and 2,000
shared goalie-ID bootstrap draws reproduces those statistics and all six
decisions exactly. The annual primary is retained; pure pooling cannot rescue
the failed fixed blend. Earlier blend previews remain clearly experimental.

Key final artifacts under `2025-reconstruction/` are the source-only reviewed
manifest, exact protocol seal/snapshot, retrospective cross-fit results and
`shot-confirmation.json`, full `retrospective-values-reviewed/` reports, and
`goalie-reference-reviewed-v2/holdouts.json` with independent statistic audit.
The main exporter composes one fixed annual-reference GB rating for each player,
keeps ability separate and retains source hashes and depth-policy sensitivity.

The final core verification passes 170 tests across the 25 nearest NHL
numerical/source/reference/publication/context test files, without failures or
skips. The ranking runtime contract check passes all 31 checks. Exact commands
and results are retained in `final-core-tests.log` and
`final-ranking-engine-check.log` under the review artifact root. Final export
and scoped type/format checks are recorded separately; no frontend build,
production data write, deployment or publication is part of this work.
