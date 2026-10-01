# NHL Season Value v1: empirical quality audit

Audit date: 2026-09-30 UTC. Scope: all 13 regular seasons from 2013-14 through
2025-26, comprising 13,159 player-seasons and 10,120 qualified ratings. The core
profile is the version stored in production. No production values or rating
weights changed during this audit.

## Verdict

**V1 is a useful descriptive index, but it does not yet adequately establish
holistic individual hockey value.** It contains meaningful information beyond
goals and assists. Its principal weaknesses are attribution, special-team
scaling, goalie shot quality, and an uncalibrated contribution scale.

The previous calculation/import checks demonstrated correct execution and
storage. Those checks did not establish that the formula estimates individual
contribution to team success. A recognizable list of leaders is not sufficient
model validation. Preserve v1 as a baseline, not as a validated GAR/WAR estimate.

## Evidence and method

The offline audit uses the saved NHL source/ratings snapshots under
`.local-data/nhl-rating/db-seasons-20260929`. The reproducible diagnostic output
is `.local-data/nhl-rating/quality-audit/audit.json`, including input SHA-256
hashes, all season/position results, component ablations, sensitivity results,
adjacent-season correlations, examples, and missingness.

The independent 2024-25 shot-quality comparison uses the documented public
[MoneyPuck skater CSV](https://www.moneypuck.com/moneypuck/playerData/seasonSummary/2024/regular/skaters.csv)
and [goalie CSV](https://www.moneypuck.com/moneypuck/playerData/seasonSummary/2024/regular/goalies.csv),
downloaded on the audit date. Credit: MoneyPuck.com. Matched qualified samples
are 456 forwards, 258 defensemen and 79 goalies. Skater diagnostics use 5-on-5;
goalie diagnostics use the provider's all-situations rows. These are model-based
diagnostics, not independent ground truth or full context-adjusted player value.

Correlations below are Spearman rank correlations. Multi-season summaries are
unweighted means of separate season/position statistics, not a pooled
cross-position leaderboard. Ties use midpoint ranks. Removal experiments hold
the original qualification pool and other components fixed; they are sensitivity
checks, not fitted replacement models. Alternatives use v1's four-decimal value
precision. Adjacent-season comparisons include only players qualifying in both
years and are subject to survivorship, role changes, and injury effects.

## Findings

### The metric does capture more than scoring

Removing relative shot share moves the median forward roughly 27 places and
the median defender roughly 25 places, averaging across seasons. A version with
only the existing scoring components and workload reference retains about
13.4 of the current top 20 forwards and 11.9 of the top 20 defenders. These
changes show that non-scoring inputs matter; they do not prove the new ordering
is correct.

Mean correlation with total points is 0.88 for forwards and 0.77 for defenders.
Strong correlation is unsurprising because scoring is valuable and correlated
with usage. It is neither evidence of failure by itself nor validation of the
additional components. Relative shot share correlates about 0.74 with relative
expected-goal share in the 2024-25 comparison, supporting its value as a useful
but incomplete play-driving signal.

### The defensive score contains substantial goalie/outcome effects

| 2024-25 cohort | Defense component rate vs negative xGA/60 | Defense component rate vs on-ice save percentage |
| -------------- | ----------------------------------------: | -----------------------------------------------: |
| Forwards       |                                      0.52 |                                             0.73 |
| Defensemen     |                                      0.46 |                                             0.79 |

The implemented defense rate is negative even-strength goals against per 60.
The first comparison uses MoneyPuck's negative 5-on-5 expected goals against
per 60; the second uses `1 - onIceGoalsAgainst / onIceShotsOnGoal`. The shared
goal outcome makes part of the second relationship mechanical. Save percentage
also reflects shot quality. These associations do not identify the causal
shares of skater, goalie and luck, but demonstrate why this input cannot be
marketed as isolated skater defense. There is also an EV/5-on-5 scope mismatch.

This attribution concern is consistent with the model owner's discussion of
goalie effects in goal-based defensive estimates in
[Evolving-Hockey's RAPM documentation](https://evolving-hockey.com/glossary/regularized-adjusted-plus-minus/).

### Special teams are barely represented in the final ordering

Shares below are sums of absolute component contributions divided by their
total across qualified player-seasons. They exclude the positive workload
reference. They are not variance explained, fitted importance, or causal shares
of hockey value.

| Component                      | Forward share | Defender share |
| ------------------------------ | ------------: | -------------: |
| 5-on-5 scoring                 |         38.3% |          24.1% |
| Relative shot share            |         32.4% |          44.1% |
| EV goals-against defense proxy |          9.2% |          18.4% |
| Discipline                     |         17.3% |          11.1% |
| Power play                     |          2.1% |           1.0% |
| Penalty kill                   |          0.8% |           1.3% |

Removing penalty killing retains, on average, 19.85 of the top 20 players in
both skater groups. Its mean median rank movement is about one place. Removing
power-play value moves the median forward about one place and the median
defender less than one. This follows from combining a 0.2 coefficient,
deployment minutes, and shrinkage. It is not evidence that special teams have
little real hockey value. Simply increasing the coefficients would still leave
the attribution and calibration problems unresolved.

### Core goaltending is not shot-quality-adjusted

The only performance input is save percentage, shrunk by shots and accumulated
through minutes. Comparison with `MoneyPuck xGoals - goals` gives a 0.88 rank
correlation, but a median rank difference of 7.5 and a maximum difference of 34
among the same 79 qualified goalies. Sixteen of the top 20 overlap.

For example, Jake Oettinger is sixth in v1 and 23rd by this GSAx comparison;
Calvin Pickard is 34th and 68th respectively. These differences are not proof
that another provider's ordering is uniquely correct. They show that the
missing shot-quality adjustment is consequential. Also, accumulation through
minutes is not an accounting of excess saves on the actual shots faced.

### The workload reference materially changes results without a fitted baseline

The `0.5 × minutes / 1000` term is a policy choice. Removing it moves the median
forward about 29 ranks and the median defender about 23, averaged across
seasons. Doubling it moves them about 17 and 13 places. A workload term is
reasonable for season contribution, but its calibration must be justified.

Separate positional standardizations have no shared goal/win units. V1 values
cannot be added across forwards, defenders and goalies to measure team value.
Percentiles also do not identify absolute differences between seasons.

### Player examples warrant context analysis, not manual promotion

In 2024-25, v1 places Barkov 64th among forwards, Slavin 117th among defenders,
and Tanev 72nd among defenders. Those placements alone do not establish errors.
The explanations reveal what the model is missing or emphasizing:

- Slavin's NHL 5-on-5 shot-attempt share is 57.1%, but his relative share is
  -2.2 percentage points. V1 assigns -0.297 units to territory. A strong team's
  off-ice results and different assignments can affect this relative comparison;
  the model does not adjust for teammates, opponents or deployment.
- Barkov receives +0.418 territory units but -0.118 discipline units, while his
  PP and PK contributions together are only about +0.032. Whether this is an
  appropriate tradeoff has not been empirically demonstrated.
- Tanev's defense proxy contributes +0.263, mostly offset by -0.215 scoring;
  PK contributes only +0.002. This is a formula explanation, not a complete
  assessment of his defensive role.

Do not tune weights to force these players into preferred ranks. Test the
underlying attribution and role accounting across the population.

### Stability and data coverage

Mean adjacent-season impact correlations are 0.60 for forwards, 0.47 for
defenders and 0.18 for goalies. These are diagnostics, not proof that a
retrospective model should maximize repeatability or evidence of a successful
forecast. No trained, chronologically held-out outcome evaluation was completed.

All 311 incomplete records are below the existing qualification thresholds.
The current published qualified pool is therefore not losing high-minute
players to missing fields in these snapshots. This is a strength of the data
coverage and explicit missingness handling, not evidence of metric validity.

## Required direction for v2

1. Measure chance creation and suppression with situation-specific expected
   goals, retaining actual finishing separately with explicit credit allocation.
2. Use shot-quality-adjusted goalie contribution and actual shot exposure;
   separate accumulated contribution from an uncertainty-aware rate estimate.
3. Adjust for teammates, opponents, score state and deployment where verified
   stint data supports it. Relative season aggregates alone are not RAPM.
4. Calibrate EV, PP, PK and penalty effects on a shared contribution scale.
   Estimate a reference cohort rather than selecting a convenient constant.
5. Fit coefficients and shrinkage on earlier seasons; reserve later seasons
   for held-out testing against simple TOI, points and current-v1 baselines.
   Report uncertainty and subgroup performance, not just an attractive ranking.
6. Treat entries/exits, passing, retrievals, screens and off-puck positioning as
   additional skill dimensions only when suitable tracking/event data exists.
   Current speed, shot and outcome aggregates do not directly observe them.

Expected-goal models still have omissions and provider assumptions; see
[MoneyPuck's methodology](https://www.moneypuck.com/about.htm). The broader
[primary-source methodology review](nhl-season-value-methodology-research.md)
details data feasibility, attribution, double counting, and validation gates.
No v2 weights or production replacement are claimed to be validated here.

## Reproduction and checks

Run the offline `audit-nhl-season-values.ts` command documented in
`scripts/README.md`. The exact source files are identified by the audit output's
hashes. The diagnostic tests cover rank ties, inversion, degenerate/missing
observations, and CSV parsing. Scoped TypeScript checking passes. No rating
runtime or production values changed; no application build or production
recomputation was needed. Scripts are excluded by the repository ESLint config.
