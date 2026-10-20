# Proposed retrospective chance-estimation protocol

Design recorded October 18, 2026 before any cross-fitted candidate is trained.
This proposal does not authorize or introduce a new production score. Existing
2023-24 and 2024-25 results are inspected development evidence; 2025-26 shot
evaluation remains uninspected at this point.

## Estimand and separation

The primary target is descriptive season contribution above a same-position
replacement reference. The first-60%-of-dates scorer is deliberately frozen to
protect later chronological impact evaluation. That restriction is appropriate
for forecasting evidence, but need not define the best retrospective estimate
of a season's scoring environment.

Whole-game cross-fitting can score every event using a model trained on other
games from throughout the same season. This avoids fitting the target game's
goal labels while using later-season population information. It does not remove
correlated-player confounding or establish causal chance quality. Other games
from the same players remain in training; feature distributions can absorb some
shooting or saving differences despite excluding identities.

Keep two independent calculation graphs. Existing chronological evaluation
retains the original pre-60% scorer and its frozen held-out evidence. A distinct
retrospective graph consumes out-of-fold probabilities and refits full-season
impact/finishing/saving accounting. Never use retrospective labels in a claimed
chronological evaluation: even an early game's probability can indirectly depend
on later test goals through its cross-fit model's training data.

The official scikit-learn documentation describes out-of-fold predictions from
models fitted without the corresponding test observations, and warns that pooled
predictions are not interchangeable with every cross-validation metric.
[Cross-validation documentation](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.cross_val_predict.html)
Cross-fitting also appears in double-machine-learning research, together with
orthogonal scores. Our hockey accounting is not an orthogonal causal estimator;
those causal-inference guarantees must not be borrowed merely because we split
samples. [Original research](https://www.nber.org/papers/w23564)

## Fixed initial experiment, if pursued

Use only already inspected 2023-24 and 2024-25 sources initially. Finish and seal
the frozen 2025-26 chronological assessment before examining any retrospective
2025-26 cross-fit scores or calibration. Preserve identical event identities,
shot admission, penalty-shot treatment and source/coverage gates.

Assign each complete game to one of five outer folds by the first eight hex
digits of SHA-256 of `season:gameId:retrospective-v1:14731`, modulo five. The
assignment uses no outcomes. All shots from both teams in a game stay together.
Save the immutable fold manifest before fitting. No reshuffling to improve
balance, calibration or a leaderboard.

For each outer fold, exclude every game in that fold from fitting AND parameter
selection. Within the remaining games, tune on a single chronological inner
partition: first 40% of distinct remaining dates for training and the next 20%
for validation, preserving date groups. The last 40% of outer-training dates
enters only the final outer refit. Choose by validation Brier error. Refit the
selected model on all outer-training games and predict the held-out games once.
Do not reuse parameters selected using the entire season: that would allow an
outer game's outcomes into its model-selection procedure.

Compare the unchanged 16-feature GLM ridge grid `[1,10,100]` against the frozen
21-feature histogram-boosting grid: leaf counts `[7,15,31]`, L2 `[1,10]`, 300
iterations, learning rate 0.05, minimum leaf size 50, no early stopping, seed
14731 and two threads. Retain existing tie rules and missing-context handling.
No extra candidate, calibrator or normalization to observed total goals.

Initial compute cost per season is 30 boosting inner fits plus five boosting
outer refits, and 15 GLM inner fits plus five GLM outer refits. Run one inspected
season first to measure wall time; two-season work roughly doubles this cost.
Compared with the six-fit chronological boosting search, this is a material but
bounded research cost. Do not add repeated fold assignments or refit bootstraps
until the first comparison establishes a useful gain.

## Evaluation and season accounting

Require exact out-of-fold coverage of every admitted shot. Compare both learners
on identical OOF shots using Brier error, log loss, total-goal bias and the same
shooter-relative context tables. Reuse the existing research screen: better
Brier and log loss in both seasons; pooled paired game-bootstrap upper 95%
error-difference endpoints below zero; no greater than 2% Brier regression in
contexts with at least 1,000 test shots; total goal bias within 10%. Report
smaller contexts and all unknown metadata. Treat the bootstrap as conditional
on fitted folds; overlapping training sets introduce dependence that a fixed
prediction bootstrap does not fully capture.

The all-season frozen scorer has in-sample predictions for its first 60% and
must not be compared with OOF predictions as though both were held out. Report
its all-shot metrics only as descriptive accounting diagnostics. On the
existing final-20% block, compare OOF versus chronological probabilities only as
a descriptive information-use diagnostic, clearly acknowledging that the OOF
models can learn from other later-season games. It is not improved forecasting.

For the first controlled valuation comparison, retain each learner's already
selected chronological impact lambda and fit only its full-season retrospective
impact model. This holds process regularization policy fixed while changing the
shot-estimation procedure. Recompute every dependent process, finishing,
saving, penalty-rate and replacement-reference component from the consistent
OOF event labels. One event probability must be shared by shooter and goalie;
report the exact per-event residual cancellation and season component sums.
Preserve coverage qualification and separate ability estimates.

Report score/rank movement by position, workload and style, replacement reference
changes and remaining subgroup calibration. Do not select a method because a
familiar star moves upward or goalie/skater distributions look more balanced.
Better shot prediction and accounting do not by themselves validate the causal
division of credit, replacement availability or ranking uncertainty. Any eventual
adoption needs a distinct method/revision and replayable fold models, not silent
replacement of a report whose predictive gates used the chronological scorer.

## October 18 amendment: reserve 2025 for the descriptive target

The explicit stopping amendment in
[the 2025 confirmation protocol](nhl-2025-confirmation-protocol.md) supersedes
this proposal's earlier requirement to complete chronological 2025 confirmation
before considering a separate descriptive experiment. The chronological
candidate failed its two-season pipeline screen and stops without inspecting
2025 outcomes. That failure remains part of the record. No 2025 retrospective
fit is authorized by this amendment: first review both inspected seasons'
valuation replays, then freeze a distinct descriptive confirmation protocol and
its impact-regularization policy. Keep 2025 reserved and uninspected until then.
