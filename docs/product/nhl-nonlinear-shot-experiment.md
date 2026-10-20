# Frozen nonlinear shot experiment

Policy fixed October 18, 2026 before training this candidate and before inspecting
2023-24 reconstructed shot-model results. The 2024-25 context-calibration results
have been inspected; this new learner is an exploratory hypothesis.

Use scikit-learn's `HistGradientBoostingClassifier` with logistic loss. Its
official documentation specifies the iteration, leaf, L2, missing-value and
random-state controls used here. Disable automatic early stopping explicitly:
the default can create its own validation sample for large datasets. Record the
installed library versions with every output.
[Official estimator documentation](https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.HistGradientBoostingClassifier.html)

Inputs are the unchanged sixteen existing shot features plus five numeric
context features: shooting-home indicator, own skater count, opposing skater
count, own goalie present and opposing goalie present. Infer shooter-relative
counts only from the official situation code and recorded shooting side.
Missing context becomes NaN and remains in every comparison. Do not include
game, team, shooter or goalie identities, outcomes, final score or future data.

The fixed six-candidate grid is `max_leaf_nodes=[7,15,31]` crossed with
`l2_regularization=[1,10]`. All candidates use `max_iter=300`,
`learning_rate=0.05`, `min_samples_leaf=50`, `early_stopping=False`,
`random_state=14731`, `max_bins=255`, `max_depth=None`, numeric features,
no class weighting and at most two CPU threads. Keep other estimator defaults;
save the complete fitted parameter dictionary. No calibration or tuning follows
inspection of the final test outcomes. Ties favor fewer leaves, then smaller L2.

Use precisely the existing date-grouped first-40% training, next-20% selection,
before-60% refit and final-20% evaluation partitions. The 60-80% interval remains
unused, preserving the existing freeze before impact validation. Select only by
validation Brier error, refit the selected learner before the 60% boundary, and
compare with the independently selected saved production geometry baseline on
identical shots. Verify source hashes and exact baseline reconstruction before
reporting results. Save per-test-shot predictions and paired game error sums.

The screening rule requires better overall Brier error and log loss in BOTH
2024-25 development and 2023-24 second-season evaluation, plus a pooled paired
whole-game bootstrap 95% upper error-difference endpoint below zero. No
shooter-relative context group with at least 1,000 test shots may worsen Brier
error by over 2% relative to baseline; each season's total expected-goal bias
must remain within 10% of actual goals. Retain smaller and unknown groups in
reports. The group-size cutoff and regression margin are operational policies,
not significance claims. Use 2,000 deterministic game resamples with seed 14731.

Even passing these screens requires later RAPM goal-outcome and overall-rating
comparisons before promotion. Neither retrospective season is a prospective
trial. No new production feature, scorer, revision, dependency or default is
introduced by this Python research artifact.
