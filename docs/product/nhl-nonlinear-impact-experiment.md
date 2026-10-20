# Frozen nonlinear shot-to-impact experiment

Policy fixed October 18, 2026 after inspecting the nonlinear shot-level results
and before running or inspecting this downstream impact comparison. Research
only; no default revision, production write, or publishable v3 report results.

Reconstruct each season from exactly the baseline's verified cached sources and
hashes. Use the exported nonlinear probabilities on unchanged ordinary attempts;
leave the independently fitted penalty-shot probability unchanged. Require full
TypeScript/Python scorer parity before fitting impact. Preserve official season
exposure, eligibility, shot identities, deployment and source coverage.

Use the baseline's exact saved 60% training and 80% test date boundaries. The
nonlinear shot scorer must have been frozen strictly before the impact training
boundary and never trained on impact test outcomes. Refit the baseline impact
test model and require exact reproduction of the saved evaluation. Run the
unchanged independent-player ridge candidate grid and selection rule for the new
labels, followed by the unchanged test and full-season fits. Do not combine this
with the experimental shared-cohort penalty or pooled goalie reference.

The frozen end-to-end screen requires at least 95% identical held-out support,
all fits converged, and unchanged source gates. Neither goal-differential MSE nor
team-goal MSE may worsen by more than 1% relative to the baseline in either
2024-25 or 2023-24. On the pooled identical games, both paired mean error
differences must be at most zero, and each paired whole-game bootstrap 95% upper
difference must be at most 1% of its pooled baseline MSE. Use 2,000 deterministic
resamples, seed 73219. Report season-specific differences and support, not merely
a pooled pass. A one-season screen cannot satisfy this two-season policy.

Compare actual game goals on the same games. xG-label errors are descriptive
within each model and cannot support a between-model improvement claim because
the target measurement changed. Bootstrap intervals condition on fitted models
and do not cover refitting, team dependence, or broader attribution uncertainty.
Retrospective overall leaderboards are research diagnostics and never choose the
learner, ridge parameter, priors, positional weights or replacement depth.

## 2024-25 research result

The first run exactly reproduced the baseline evaluation and verified all 1,312
original source hashes, unchanged source-audit summaries and the nonlinear
training-row hash. All 273 held-out games had identical supported deployment;
all impact fits converged. The unchanged ridge grid selected lambda 4.

Goal-differential MSE decreased from 6.927447 to 6.841158 (1.25%). The paired
game-bootstrap error difference was -0.086289, with interval
[-0.138921, -0.038223]. Team-goal MSE decreased from 3.315605 to 3.312415
(0.10%); its difference interval [-0.030476, 0.026170] crosses zero. These pass
the single-season guardrails, but do not satisfy the required two-season screen.

The optional finishing-plus-saving diagnostic improved goal-differential MSE
from 6.712861 to 6.642899, while team-goal MSE worsened slightly from 3.289843
to 3.294562. Thus the process-only result does not establish improvement for
every holistic prediction variant. The replacement preview still has 15 goalies
and five forwards in its top twenty, with 19 players retained. Better shot
prediction does not resolve replacement-reference comparability.

Reproducible local artifacts are under
`.local-data/nhl-rating/review-20261018/nonlinear-impact-2024/`:
`analysis.json`, `summary.json`, `ratings.json`, `overall.json`,
`source-audit.json` and `implementation-note.json`. The implementation note
qualifies the first run's post-reconstruction code-hash timing and inherited
ordinary-shot source labels. Subsequent command runs capture code at startup
and explicitly label nonlinear research probabilities. No default is promoted.

## Two-season result

The 2023-24 replication exactly reproduces its baseline and retains all 269
held-out games with every fit converged. Goal-differential MSE increases from
6.555703 to 6.557908 (0.034%); team-goal MSE increases from 3.083657 to 3.093073
(0.305%). Both increases remain within the frozen per-season 1% guardrails.

The pooled 542-game comparison **fails the frozen screen**. Goal-differential
MSE improves from 6.742947 to 6.700578, with paired difference -0.042369 and
interval [-0.074968, -0.008575]. Team-goal MSE increases from 3.200487 to
3.203553: difference +0.003066 and interval [-0.014068, +0.020281]. Although
the upper endpoint remains below the allowed 1% margin, the positive point
difference violates the separately required nonpositive pooled mean. This is
not evidence of a confidently harmful change, but it is a failure of the
prespecified promotion screen. No threshold is relaxed after observing it.

The combined artifact is
`.local-data/nhl-rating/review-20261018/nonlinear-impact-pooled.json`, reproduced
by `pool-nonlinear-impact.ts` in the same review directory. The 2023 artifacts
are in `2023-reconstruction/nonlinear-impact/`. Later confirmation may provide
additional evidence but cannot retroactively change this two-season result.
