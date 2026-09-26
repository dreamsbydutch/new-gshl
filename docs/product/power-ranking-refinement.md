# Power ranking refinement

This iteration keeps the owner-aware preseason standings forecast and improves
the transition to current matchup strength. It does not establish an optimal
forecast, and it has not been deployed or used to rewrite production history.

## Accepted changes

The previous composite weighted the last completed week twice: 25% directly,
plus 72% of the 30% recent-form term. That gave the latest week 46.6% of the
total composite before its additional effect on Elo and the GM ladder.

The revised composite uses 55% recent form, 20% Elo, 15% rolling roster talent
and 10% GM history. Recent form is an EWMA with alpha 0.5: completed weeks
receive 50%, 25%, 12.5%, etc. of the form signal. The newest week consequently
contributes 27.5% directly to the composite through form, without a duplicate
latest-week term. This responds quickly while reducing one-week noise.

The category scorer now recognizes the aggregation contract for missed goalie
minimums: all configured goalie categories are explicitly blanked. On an
otherwise played week, these are forfeits rather than categories to omit from
the average. A forfeited category scores at most -2.5 and strictly below the
worst qualified team's category score. Truly absent fields remain unknown and
do not establish a forfeit. There were 243 rows with blank W/GAA/SVP among the
2,878 cached weekly rows, including playoffs. Only the season's active
categories contribute.

The preseason weight still fades over four observations, but observations now
mean completed weeks with team results or completed-matchup evidence. Empty or
postponed weeks do not consume a team's preseason confidence. Rated-week play
cannot alter that week's entering rating.
Explicitly unfinished matchups no longer count as completed evidence merely
because they contain placeholder 0–0 scores. Legacy records without a completion
flag retain the existing score-based fallback.

## Evidence and selection

The form comparison tested four smoothing factors (0.2, 0.35, 0.5, 0.72),
three direct latest-week weights (0, 0.1, 0.25), and the forfeit correction
enabled/disabled. The total form weight stayed at 55%; other coefficients were
fixed. Minimum training Brier diagnostic selected alpha 0.5, no duplicate
latest-week term, and corrected forfeits.

| Regular-season Week 5+ metric                | Previous | Revised |
| -------------------------------------------- | -------: | ------: |
| Training accuracy, 2019–2023, 632 matchups   |   69.70% |  70.65% |
| Training Brier diagnostic                    |  0.19643 | 0.19224 |
| Evaluation accuracy, 2024–2026, 397 matchups |   70.53% |  71.79% |
| Evaluation Brier diagnostic                  |  0.20129 | 0.19853 |

This represents five additional correct winner selections on the evaluation
set. It is a modest gain, not a dramatic improvement or calibrated confidence.
Accuracy declined in 2025 even though its Brier diagnostic improved slightly.

An expanding-window check selects a configuration using only seasons before
the season being predicted. It selected the same revised configuration for
2024, 2025 and 2026; earlier folds preferred alpha 0.35 with the same other
settings. Both results support smoothing and correcting forfeits more strongly
than they support one exact smoothing coefficient.

Form is reconstructed chronologically from stored entering-week performance.
The previous smoothing reconstruction exactly reproduces all stored EWMAs
(maximum error 0, no skipped weeks). Raw category corrections only enter the
following week. The diagnostic holds stored entering Elo, roster talent and
GM inputs fixed; it is not a full counterfactual replay of later GM feedback
from changed power ranks. Brier uses a fixed logistic score conversion, not
published win probabilities. Ties earn half accuracy credit.

These data were used in earlier exploratory analysis. Temporal partitions and
expanding-window selection reduce leakage, but do not make these years a fresh
unseen prospective holdout. No statistical-significance claim is made.

## Rejected changes

Ten preseason alternatives compared the existing projection with greater
last-season emphasis, only the latest season, weaker/stronger player shrinkage,
and a nonlinear pairwise category comparison. The training-selected alternative
reduced training standings error from 3.625 to 3.600 places but worsened later
evaluation error from 3.696 to 3.744. The existing preseason parameters remain.
We did not select a different candidate just because it looked better on the
evaluation years. The prior owner improvement therefore remains 4.119 to 3.696
places versus the roster-only forecast.

Transition windows of 2, 4, 6 and 8 weeks were compared on Weeks 2–8 using
owner-aware opening forecasts and smoother form. The training-selected two-week
window did not transfer: evaluation accuracy was 62.99%, versus 66.23% for four
weeks, over 154 matchups. Four weeks remains the policy. This duration test
holds the old category treatment fixed and excludes the separate forfeit fix;
it is not a joint optimization of all changes.

Current injury forecasts, NHL schedules, projected deployment and immutable
historical ownership snapshots remain unavailable in this model. The league
order approximates matchup strength; individual category profiles can produce
pairwise advantages that a single total order cannot represent.

## Reproduction

The local-only commands under `scripts/src/commands/power/` are
`refine-preseason.ts`, `evaluate-form.ts` and `evaluate-transition.ts`; each
provides `--help`. Run refinement before transition evaluation to produce its
preseason feature cache. They read existing cached research/weekly inputs and
write reports under `.local-data/power-objectives/`. No network or league writes
are performed by these commands. The shared runtime owns the category scorer
used by both production calculations and evaluation.

## Verification

Passed `npm run ranking-engine:check` (24 fixtures) and the direct preseason,
owner, category and evaluation suites (16 fixtures). After the explicit
incomplete-matchup fix, the direct power/preseason suites passed again (21
fixtures). Scripts TypeScript and `tsc --noEmit -p tsconfig.build.json` passed.
Scoped ESLint passed for `convex/lib/preseasonPower.ts`; operator/runtime files
are excluded by the repository lint configuration and covered by TypeScript
and numerical fixtures.
The local refinement, form and transition evaluations ran successfully.
Focused diff inspection and `git diff --check` passed. No frontend boundary
changed, so architecture checks were not repeated. No full application build,
browser test, deployment or production recomputation was run.
